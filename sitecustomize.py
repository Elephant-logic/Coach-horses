"""Runtime save compatibility for Command de Cuisine."""

import json

import app
import auth_controls
import paper_import_control


_original_preserved = auth_controls._append_only_preserved


def _preserved_with_rolling_activity(current_state, incoming_state, key):
    if key == "audit":
        return True
    return _original_preserved(current_state, incoming_state, key)


auth_controls._append_only_preserved = _preserved_with_rolling_activity


_original_paper_action = paper_import_control.undo


def _compact_manager_save(handler, payload):
    stored, user = handler.require_user()
    if not stored:
        return
    if user.get("role") != "manager":
        handler.send_json({"error": "Manager access required."}, 403)
        return

    changes = payload.get("changes", {})
    temp_additions = payload.get("temperatureAdditions", [])
    audit_additions = payload.get("auditAdditions", [])
    if not isinstance(changes, dict) or not isinstance(temp_additions, list) or not isinstance(audit_additions, list):
        handler.send_json({"error": "Invalid compact save."}, 400)
        return

    # Account/security settings and historic temperature replacement stay on their
    # existing dedicated paths. This endpoint only saves ordinary kitchen sections
    # plus newly appended temperature readings.
    for protected in ("users", "settings", "tempReadings", "audit"):
        changes.pop(protected, None)

    expected_revision = int(payload.get("revision") or 0)
    with app.connect() as conn:
        current = app.read_state(conn, for_update=True)
        if not current:
            conn.rollback()
            handler.send_json({"error": "App state is not initialised."}, 409)
            return
        if changes and expected_revision != current["revision"]:
            conn.rollback()
            handler.send_json({"error": "Shared data changed first. Reload and try again.", "conflict": True, **auth_controls._public_state(current)}, 409)
            return

        state = current["state"]
        for key, value in changes.items():
            if isinstance(key, str) and key and not key.startswith("_"):
                state[key] = value

        existing_temps = state.get("tempReadings", []) if isinstance(state.get("tempReadings", []), list) else []
        temp_ids = {str(r.get("id")) for r in existing_temps if isinstance(r, dict) and r.get("id") is not None}
        valid_apps = {str(a.get("id")) for a in state.get("appliances", []) if isinstance(a, dict)}
        added_temps = 0
        for row in temp_additions:
            if not isinstance(row, dict):
                continue
            try:
                value = float(row.get("value"))
            except Exception:
                continue
            row_id = str(row.get("id") or "")
            if not row_id or row_id in temp_ids or str(row.get("appId") or "") not in valid_apps or not str(row.get("ts") or "") or value < -60 or value > 120:
                continue
            item = dict(row)
            item["value"] = value
            existing_temps.append(item)
            temp_ids.add(row_id)
            added_temps += 1
        state["tempReadings"] = existing_temps

        current_audit = state.get("audit", []) if isinstance(state.get("audit", []), list) else []
        seen = {str(x.get("id")) for x in current_audit if isinstance(x, dict) and x.get("id") is not None}
        fresh_audit = []
        for row in audit_additions:
            if isinstance(row, dict) and row.get("id") is not None and str(row.get("id")) not in seen:
                fresh_audit.append(row)
                seen.add(str(row.get("id")))
        state["audit"] = (fresh_audit + current_audit)[:400]

        raw = json.dumps(state, ensure_ascii=False, separators=(",", ":"))
        size = len(raw.encode())
        if size > app.MAX_STATE_BYTES:
            conn.rollback()
            handler.send_json({"error": "State is too large.", "stateBytes": size, "limitBytes": app.MAX_STATE_BYTES}, 413)
            return

        revision = int(current["revision"]) + 1
        with conn.cursor() as cur:
            cur.execute("UPDATE app_state SET state=%s::jsonb, revision=%s, updated_at=NOW(), updated_by=%s WHERE id=1", (raw, revision, user["username"]))
            cur.execute("INSERT INTO server_audit(username,action,revision,details) VALUES(%s,%s,%s,%s::jsonb)", (user["username"], "compact_state_save", revision, json.dumps({"reason": str(payload.get("reason") or "edit")[:160], "changed_sections": sorted(changes.keys()), "temperature_additions": added_temps, "state_bytes": size})))
        conn.commit()

    handler.send_json({"ok": True, "revision": revision, "stateBytes": size})


def _paper_action(handler, payload):
    if str((payload or {}).get("action") or "").lower() == "compact-state-save":
        _compact_manager_save(handler, payload or {})
        return
    return _original_paper_action(handler, payload)


paper_import_control.undo = _paper_action
