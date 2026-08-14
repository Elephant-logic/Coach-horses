import json

import app


def _public_state(stored):
    if not stored:
        return stored
    out = dict(stored)
    state = json.loads(json.dumps(stored["state"]))
    for user in state.get("users", []):
        user.pop("password", None)
    out["state"] = state
    return out


def _safe_user(user):
    return {k: user.get(k) for k in ("id", "username", "name", "role", "jobTitle", "email", "phone", "active")}


def _password_ok(value):
    return isinstance(value, str) and len(value) >= 10


def _canon(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _append_only_preserved(current_state, incoming_state, key):
    old = current_state.get(key, [])
    new = incoming_state.get(key, [])
    if not isinstance(old, list) or not isinstance(new, list):
        return old == new
    new_by_id = {str(x.get("id")): x for x in new if isinstance(x, dict) and x.get("id") is not None}
    new_exact = {_canon(x) for x in new}
    for item in old:
        if isinstance(item, dict) and item.get("id") is not None:
            kept = new_by_id.get(str(item.get("id")))
            if kept is None or _canon(kept) != _canon(item):
                return False
        elif _canon(item) not in new_exact:
            return False
    return True


def _append_only_additions(base_state, incoming_state, key):
    base = base_state.get(key, [])
    new = incoming_state.get(key, [])
    if not isinstance(base, list) or not isinstance(new, list):
        return None
    base_ids = {str(x.get("id")) for x in base if isinstance(x, dict) and x.get("id") is not None}
    base_exact = {_canon(x) for x in base}
    additions = []
    for item in new:
        if isinstance(item, dict) and item.get("id") is not None:
            if str(item.get("id")) not in base_ids:
                additions.append(item)
        elif _canon(item) not in base_exact:
            additions.append(item)
    return additions


def _merge_conflict_append_only(current_state, incoming_state):
    merged = json.loads(json.dumps(current_state))
    changed = False
    for key in ("tempReadings", "audit"):
        additions = _append_only_additions(current_state, incoming_state, key)
        if additions is None:
            return None
        existing = merged.get(key, [])
        existing_ids = {str(x.get("id")) for x in existing if isinstance(x, dict) and x.get("id") is not None}
        existing_exact = {_canon(x) for x in existing}
        for item in additions:
            if isinstance(item, dict) and item.get("id") is not None:
                if str(item.get("id")) in existing_ids:
                    continue
                existing.append(item)
                existing_ids.add(str(item.get("id")))
                changed = True
            elif _canon(item) not in existing_exact:
                existing.append(item)
                existing_exact.add(_canon(item))
                changed = True
        merged[key] = existing
    return merged if changed else None


def _merge_rolling_audit(current_state, incoming_state):
    current = current_state.get("audit", []) if isinstance(current_state.get("audit", []), list) else []
    additions = _append_only_additions(current_state, incoming_state, "audit")
    if additions is None:
        additions = []
    merged = []
    seen_ids = set()
    seen_exact = set()
    for item in list(additions) + list(current):
        if not isinstance(item, dict):
            marker = _canon(item)
            if marker in seen_exact:
                continue
            seen_exact.add(marker)
            merged.append(item)
            continue
        item_id = item.get("id")
        if item_id is not None:
            marker = str(item_id)
            if marker in seen_ids:
                continue
            seen_ids.add(marker)
        else:
            marker = _canon(item)
            if marker in seen_exact:
                continue
            seen_exact.add(marker)
        merged.append(item)
    return merged[:400]


def send_session(handler):
    stored = app.read_state()
    if not stored:
        handler.send_json({"authenticated": False, "initialised": False})
        return
    user = app.current_user(stored["state"], handler.headers.get("Cookie"))
    if not user:
        handler.send_json({"authenticated": False, "initialised": True})
        return
    handler.send_json({"authenticated": True, "user": _safe_user(user), **_public_state(stored)})


def send_export(handler):
    stored, _user = handler.require_user()
    if stored:
        handler.send_json(_public_state(stored))


def login(handler, payload):
    stored = app.read_state()
    if not stored:
        handler.send_json({"error": "The server has not been initialised yet."}, 409)
        return
    username = str(payload.get("username", "")).strip().lower()
    password = str(payload.get("password", ""))
    user = next((u for u in stored["state"].get("users", []) if str(u.get("username", "")).lower() == username and u.get("active", True)), None)
    if not user or not app.verify_password(password, user.get("password", "")):
        handler.send_json({"error": "Wrong username or password."}, 401)
        return
    cookie = f"{app.SESSION_COOKIE}={app.make_session(user['username'])}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=43200"
    handler.send_json({"ok": True, "user": _safe_user(user), **_public_state(stored)}, extra_headers={"Set-Cookie": cookie})


def change_password(handler, payload):
    stored, user = handler.require_user()
    if not stored:
        return
    current_password = str(payload.get("currentPassword", ""))
    new_password = str(payload.get("newPassword", ""))
    if not app.verify_password(current_password, user.get("password", "")):
        handler.send_json({"error": "Your current password is not correct."}, 400)
        return
    if not _password_ok(new_password):
        handler.send_json({"error": "Use at least 10 characters for the new password."}, 400)
        return
    if current_password == new_password:
        handler.send_json({"error": "Choose a different password."}, 400)
        return
    with app.connect() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT state, revision FROM app_state WHERE id=1 FOR UPDATE")
            row = cur.fetchone()
            state = row["state"]
            target = next((u for u in state.get("users", []) if u.get("username") == user.get("username")), None)
            if not target:
                conn.rollback()
                handler.send_json({"error": "Account not found."}, 404)
                return
            target["password"] = app.hash_password(new_password)
            target["passwordChangedAt"] = app.utcnow()
            target.pop("mustChangePassword", None)
            revision = int(row["revision"]) + 1
            cur.execute("UPDATE app_state SET state=%s::jsonb, revision=%s, updated_at=NOW(), updated_by=%s WHERE id=1", (json.dumps(state, ensure_ascii=False, separators=(",", ":")), revision, user["username"]))
            cur.execute("INSERT INTO server_audit(username,action,revision,details) VALUES(%s,%s,%s,%s::jsonb)", (user["username"], "change_password", revision, json.dumps({"account": user["username"]})))
        conn.commit()
    handler.send_json({"ok": True, "revision": revision, "message": "Password changed."})


def manage_user(handler, payload):
    stored, manager = handler.require_user()
    if not stored:
        return
    if manager.get("role") != "manager":
        handler.send_json({"error": "Manager access required."}, 403)
        return
    username = str(payload.get("username", "")).strip().lower()
    with app.connect() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT state, revision FROM app_state WHERE id=1 FOR UPDATE")
            row = cur.fetchone()
            state = row["state"]
            target = next((u for u in state.get("users", []) if str(u.get("username", "")).lower() == username), None)
            if not target:
                conn.rollback(); handler.send_json({"error": "Account not found."}, 404); return
            if "name" in payload:
                target["name"] = str(payload.get("name") or target.get("name") or username).strip()
            if "jobTitle" in payload:
                target["jobTitle"] = str(payload.get("jobTitle") or "").strip()
            if "role" in payload:
                role = str(payload.get("role") or "staff")
                if role not in ("staff", "manager"):
                    conn.rollback(); handler.send_json({"error": "Invalid role."}, 400); return
                target["role"] = role
            if "active" in payload:
                target["active"] = bool(payload.get("active"))
            new_password = payload.get("newPassword")
            if new_password is not None:
                new_password = str(new_password)
                if not _password_ok(new_password):
                    conn.rollback(); handler.send_json({"error": "Temporary password must be at least 10 characters."}, 400); return
                target["password"] = app.hash_password(new_password)
                target["passwordResetAt"] = app.utcnow()
                target["mustChangePassword"] = True
            active_managers = [u for u in state.get("users", []) if u.get("role") == "manager" and u.get("active", True)]
            if not active_managers:
                conn.rollback(); handler.send_json({"error": "There must always be at least one active manager."}, 400); return
            revision = int(row["revision"]) + 1
            cur.execute("UPDATE app_state SET state=%s::jsonb, revision=%s, updated_at=NOW(), updated_by=%s WHERE id=1", (json.dumps(state, ensure_ascii=False, separators=(",", ":")), revision, manager["username"]))
            cur.execute("INSERT INTO server_audit(username,action,revision,details) VALUES(%s,%s,%s,%s::jsonb)", (manager["username"], "manage_user", revision, json.dumps({"account": username, "role": target.get("role"), "active": target.get("active", True), "password_reset": new_password is not None})))
        conn.commit()
    public = _public_state({"state": state, "revision": revision, "updated_at": app.utcnow(), "updated_by": manager["username"]})
    handler.send_json({"ok": True, **public})


def save_state(handler, payload):
    stored, user = handler.require_user()
    if not stored:
        return
    incoming = payload.get("state")
    if not isinstance(incoming, dict):
        handler.send_json({"error": "A valid state is required."}, 400)
        return
    incoming = json.loads(json.dumps(incoming))
    expected_revision = int(payload.get("revision") or 0)
    with app.connect() as conn:
        current = app.read_state(conn, for_update=True)
        if not current:
            conn.rollback(); handler.send_json({"error": "Not initialised."}, 409); return

        conflict_merge = False
        if expected_revision != current["revision"]:
            merged = _merge_conflict_append_only(current["state"], incoming)
            if merged is None:
                conn.rollback(); handler.send_json({"error": "Another user saved changes first. Latest shared data has been returned.", "conflict": True, **_public_state(current)}, 409); return
            incoming = merged
            conflict_merge = True

        # Live temperature history now has its own authoritative SQL table. Never let the
        # legacy JSON copy block an otherwise valid kitchen save or overwrite SQL history.
        incoming["tempReadings"] = current["state"].get("tempReadings", [])
        # Browser activity history is rolling. Keep new entries while allowing old entries
        # to fall off without treating that normal rollover as destructive history editing.
        incoming["audit"] = _merge_rolling_audit(current["state"], incoming)

        current_users = {str(u.get("id") or u.get("username")): u for u in current["state"].get("users", [])}
        if user.get("role") != "manager":
            incoming["users"] = current["state"].get("users", [])
            incoming["settings"] = current["state"].get("settings", {})
        else:
            for candidate in incoming.get("users", []):
                old = current_users.get(str(candidate.get("id") or candidate.get("username")))
                if old and old.get("password"):
                    candidate["password"] = old["password"]
            if not any(u.get("role") == "manager" and u.get("active", True) for u in incoming.get("users", [])):
                conn.rollback(); handler.send_json({"error": "There must always be at least one active manager."}, 400); return

        raw = json.dumps(incoming, ensure_ascii=False, separators=(",", ":"))
        if len(raw.encode()) > app.MAX_STATE_BYTES:
            conn.rollback(); handler.send_json({"error": "State is too large."}, 413); return
        revision = current["revision"] + 1
        with conn.cursor() as cur:
            cur.execute("UPDATE app_state SET state=%s::jsonb, revision=%s, updated_at=NOW(), updated_by=%s WHERE id=1", (raw, revision, user["username"]))
            cur.execute("INSERT INTO server_audit(username,action,revision,details) VALUES(%s,%s,%s,%s::jsonb)", (user["username"], "save_state", revision, json.dumps({"reason": str(payload.get("reason", "client save")), "conflict_append_merge": conflict_merge})))
        conn.commit()
    handler.send_json({"ok": True, "revision": revision, "conflictAppendMerge": conflict_merge})
