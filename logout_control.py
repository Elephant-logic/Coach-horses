import app


def logout(handler):
    """End the browser session by expiring the signed session cookie."""
    cookie = (
        f"{app.SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; "
        "Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT"
    )
    handler.send_json(
        {"ok": True, "authenticated": False},
        extra_headers={"Set-Cookie": cookie},
    )
