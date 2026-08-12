import json
import os
import threading
import time
import urllib.error
import urllib.request
from collections import defaultdict, deque

ALLOWED_MODELS = {"gpt-4o-mini", "gpt-4.1-mini"}
MAX_AI_REQUEST_BYTES = 5 * 1024 * 1024
RATE_WINDOW_SECONDS = 10 * 60
RATE_LIMIT = 90

_lock = threading.Lock()
_calls = defaultdict(deque)


def _allow(username):
    now = time.time()
    with _lock:
        q = _calls[str(username or "unknown")]
        while q and now - q[0] > RATE_WINDOW_SECONDS:
            q.popleft()
        if len(q) >= RATE_LIMIT:
            return False
        q.append(now)
        return True


def handle(handler):
    stored, user = handler.require_user()
    if not stored:
        return
    try:
        payload = handler.read_json()
    except Exception as exc:
        handler.send_json({"error": {"message": str(exc)}}, 400)
        return

    model = str(payload.get("model") or "")
    if model not in ALLOWED_MODELS:
        handler.send_json({"error": {"message": "That AI model is not allowed by this kitchen app."}}, 400)
        return

    raw_payload = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
    if len(raw_payload) > MAX_AI_REQUEST_BYTES:
        handler.send_json({"error": {"message": "AI image/request is too large. The app will resize photos before retrying."}}, 413)
        return

    if not _allow(user.get("username")):
        handler.send_json({"error": {"message": "Too many AI requests. Wait a few minutes and try again."}}, 429)
        return

    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        handler.send_json({"error": {"message": "OPENAI_API_KEY is not configured on the server."}}, 503)
        return

    payload["store"] = False
    req = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode(),
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
        handler.send_json({"error": {"message": f"AI request failed: {exc}"}}, 502)
        return

    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(raw)))
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("X-Content-Type-Options", "nosniff")
    handler.end_headers()
    handler.wfile.write(raw)
