import base64
import hashlib
import hmac
import json
import os
import secrets
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from http import cookies
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

import psycopg
from psycopg.rows import dict_row

BASE_DIR = Path(__file__).resolve().parent
DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
SECRET_KEY = os.environ.get("SESSION_SECRET", os.environ.get("SECRET_KEY", "")).strip()
if not SECRET_KEY:
    SECRET_KEY = secrets.token_hex(32)
SECRET_KEY = SECRET_KEY.encode()
SESSION_COOKIE = "ch_session"
MAX_STATE_BYTES = int(os.environ.get("MAX_STATE_BYTES", str(30 * 1024 * 1024)))


def connect():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is not configured")
    return psycopg.connect(DATABASE_URL, row_factory=dict_row, autocommit=False)


def utcnow():
    return datetime.now(timezone.utc).isoformat()


def init_db():
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS app_state (
                    id SMALLINT PRIMARY KEY CHECK (id = 1),
                    state JSONB NOT NULL,
                    revision BIGINT NOT NULL DEFAULT 1,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_by TEXT NOT NULL DEFAULT 'bootstrap'
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS server_audit (
                    id BIGSERIAL PRIMARY KEY,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    username TEXT NOT NULL,
                    action TEXT NOT NULL,
                    revision BIGINT,
                    details JSONB NOT NULL DEFAULT '{}'::jsonb
                )
            """)
            cur.execute("CREATE INDEX IF NOT EXISTS idx_server_audit_created ON server_audit(created_at DESC)")
        conn.commit()


def read_state(conn=None, for_update=False):
    owns = conn is None
    if owns:
        conn = connect()
    try:
        with conn.cursor() as cur:
            sql = "SELECT state, revision, updated_at, updated_by FROM app_state WHERE id=1"
            if for_update:
                sql += " FOR UPDATE"
            cur.execute(sql)
            row = cur.fetchone()
        if not row:
            return None
        return {
            "state": row["state"],
            "revision": int(row["revision"]),
            "updated_at": row["updated_at"].isoformat() if hasattr(row["updated_at"], "isoformat") else str(row["updated_at"]),
            "updated_by": row["updated_by"],
        }
    finally:
        if owns:
            conn.close()


def verify_password(password, stored):
    try:
        salt_hex, expected = str(stored).split("$", 1)
        actual = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), bytes.fromhex(salt_hex), 120000, dklen=32
        ).hex()
        return secrets.compare_digest(actual, expected)
    except Exception:
        return False


def b64e(raw):
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def b64d(value):
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def make_session(username):
    payload = json.dumps(
        {"u": username, "e": int(time.time()) + 12 * 3600}, separators=(",", ":")
    ).encode()
    sig = hmac.new(SECRET_KEY, payload, hashlib.sha256).digest()
    return b64e(payload) + "." + b64e(sig)


def parse_session(header):
    try:
        jar = cookies.SimpleCookie()
        jar.load(header or "")
        token = jar[SESSION_COOKIE].value
        p, s = token.split(".", 1)
        payload = b64d(p)
        sig = b64d(s)
        if not hmac.compare_digest(sig, hmac.new(SECRET_KEY, payload, hashlib.sha256).digest()):
            return None
        data = json.loads(payload)
        return data["u"] if int(data["e"]) > time.time() else None
    except Exception:
        return None


def current_user(state, cookie_header):
    username = parse_session(cookie_header)
    if not username:
        return None
    return next(
        (
            u
            for u in state.get("users", [])
            if u.get("username") == username and u.get("active", True)
        ),
        None,
    )


class Handler(BaseHTTPRequestHandler):
    server_version = "CoachHorsesNeon/1.0"

    def log_message(self, fmt, *args):
        print(f"{self.address_string()} - {fmt % args}")

    def send_json(self, obj, status=200, extra_headers=None):
        raw = json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        if extra_headers:
            for k, v in extra_headers.items():
                self.send_header(k, v)
        self.end_headers()
        self.wfile.write(raw)

    def read_json(self):
        n = int(self.headers.get("Content-Length", "0"))
        if n > MAX_STATE_BYTES + 2 * 1024 * 1024:
            raise ValueError("Request is too large")
        return json.loads(self.rfile.read(n) or b"{}")

    def require_user(self):
        stored = read_state()
        if not stored:
            self.send_json({"error": "Not initialised."}, 409)
            return None, None
        user = current_user(stored["state"], self.headers.get("Cookie"))
        if not user:
            self.send_json({"error": "Sign in required."}, 401)
            return None, None
        return stored, user

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/":
            raw = (BASE_DIR / "index.html").read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            self.send_header("Cache-Control", "no-cache")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(raw)
            return
        if path == "/api/health":
            try:
                stored = read_state()
                self.send_json(
                    {
                        "ok": True,
                        "storage": "postgres",
                        "has_state": bool(stored),
                        "revision": stored["revision"] if stored else 0,
                    }
                )
            except Exception as exc:
                self.send_json({"ok": False, "error": str(exc)}, 503)
            return
        if path == "/api/config":
            self.send_json(
                {
                    "serverStorage": True,
                    "database": "postgres",
                    "aiEnabled": bool(os.environ.get("OPENAI_API_KEY")),
                }
            )
            return
        if path == "/api/session":
            stored = read_state()
            if not stored:
                self.send_json({"authenticated": False, "initialised": False})
                return
            user = current_user(stored["state"], self.headers.get("Cookie"))
            if not user:
                self.send_json({"authenticated": False, "initialised": True})
                return
            safe = {
                k: user.get(k)
                for k in ("id", "username", "name", "role", "jobTitle", "email", "phone")
            }
            self.send_json({"authenticated": True, "user": safe, **stored})
            return
        if path == "/api/export":
            stored, _user = self.require_user()
            if stored:
                self.send_json(stored)
            return
        self.send_json({"error": "Not found"}, 404)

    def do_POST(self):
        path = urlparse(self.path).path
        try:
            payload = self.read_json()
        except Exception as exc:
            self.send_json({"error": str(exc)}, 400)
            return

        if path == "/api/bootstrap":
            state = payload.get("state")
            if not isinstance(state, dict):
                self.send_json({"error": "A valid initial state is required."}, 400)
                return
            raw = json.dumps(state, ensure_ascii=False, separators=(",", ":"))
            if len(raw.encode()) > MAX_STATE_BYTES:
                self.send_json({"error": "State is too large."}, 413)
                return
            with connect() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "INSERT INTO app_state(id,state,revision,updated_at,updated_by) VALUES(1,%s::jsonb,1,NOW(),'bootstrap') ON CONFLICT (id) DO NOTHING",
                        (raw,),
                    )
                    cur.execute(
                        "INSERT INTO server_audit(username,action,revision,details) VALUES(%s,%s,%s,%s::jsonb)",
                        ("system", "bootstrap", 1, json.dumps({"message": "Initial browser state imported"})),
                    )
                conn.commit()
            stored = read_state()
            self.send_json({"ok": True, "revision": stored["revision"]})
            return

        if path == "/api/login":
            stored = read_state()
            if not stored:
                self.send_json({"error": "The server has not been initialised yet."}, 409)
                return
            username = str(payload.get("username", "")).strip()
            password = str(payload.get("password", ""))
            user = next(
                (
                    u
                    for u in stored["state"].get("users", [])
                    if u.get("username") == username and u.get("active", True)
                ),
                None,
            )
            if not user or not verify_password(password, user.get("password", "")):
                self.send_json({"error": "Wrong username or password."}, 401)
                return
            safe = {
                k: user.get(k)
                for k in ("id", "username", "name", "role", "jobTitle", "email", "phone")
            }
            cookie = (
                f"{SESSION_COOKIE}={make_session(username)}; Path=/; HttpOnly; Secure; "
                "SameSite=Lax; Max-Age=43200"
            )
            self.send_json(
                {"ok": True, "user": safe, **stored},
                extra_headers={"Set-Cookie": cookie},
            )
            return

        if path == "/api/logout":
            self.send_json(
                {"ok": True},
                extra_headers={
                    "Set-Cookie": f"{SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax"
                },
            )
            return

        if path == "/api/openai/responses":
            stored, _user = self.require_user()
            if not stored:
                return
            key = os.environ.get("OPENAI_API_KEY")
            if not key:
                self.send_json(
                    {"error": {"message": "OPENAI_API_KEY is not configured on Render."}},
                    503,
                )
                return
            payload["store"] = False
            req = urllib.request.Request(
                "https://api.openai.com/v1/responses",
                data=json.dumps(payload).encode(),
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                method="POST",
            )
            try:
                with urllib.request.urlopen(req, timeout=120) as response:
                    raw = response.read()
                    status = response.status
            except urllib.error.HTTPError as exc:
                raw = exc.read()
                status = exc.code
            except Exception as exc:
                self.send_json({"error": {"message": f"AI request failed: {exc}"}}, 502)
                return
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)
            return

        self.send_json({"error": "Not found"}, 404)

    def do_PUT(self):
        if urlparse(self.path).path != "/api/state":
            self.send_json({"error": "Not found"}, 404)
            return
        try:
            payload = self.read_json()
        except Exception as exc:
            self.send_json({"error": str(exc)}, 400)
            return

        stored, user = self.require_user()
        if not stored:
            return
        state = payload.get("state")
        if not isinstance(state, dict):
            self.send_json({"error": "A valid state is required."}, 400)
            return
        raw = json.dumps(state, ensure_ascii=False, separators=(",", ":"))
        if len(raw.encode()) > MAX_STATE_BYTES:
            self.send_json({"error": "State is too large."}, 413)
            return
        expected_revision = int(payload.get("revision") or 0)

        with connect() as conn:
            try:
                current = read_state(conn, for_update=True)
                if not current:
                    conn.rollback()
                    self.send_json({"error": "Not initialised."}, 409)
                    return
                if expected_revision != current["revision"]:
                    conn.rollback()
                    self.send_json(
                        {
                            "error": "Another user saved changes first. Latest shared data has been returned.",
                            "conflict": True,
                            **current,
                        },
                        409,
                    )
                    return
                revision = current["revision"] + 1
                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE app_state SET state=%s::jsonb, revision=%s, updated_at=NOW(), updated_by=%s WHERE id=1",
                        (raw, revision, user["username"]),
                    )
                    cur.execute(
                        "INSERT INTO server_audit(username,action,revision,details) VALUES(%s,%s,%s,%s::jsonb)",
                        (
                            user["username"],
                            "save_state",
                            revision,
                            json.dumps({"reason": str(payload.get("reason", "client save"))}),
                        ),
                    )
                conn.commit()
            except Exception:
                conn.rollback()
                raise
        self.send_json({"ok": True, "revision": revision})


init_db()
if __name__ == "__main__":
    port = int(os.environ.get("PORT", "10000"))
    print(f"Coach & Horses Kitchen Pro listening on 0.0.0.0:{port}; postgres storage")
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
