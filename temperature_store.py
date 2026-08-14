import json
from datetime import datetime

import app


def _public_row(row):
    payload = row.get('payload') if isinstance(row.get('payload'), dict) else {}
    out = dict(payload)
    out.update({
        'id': row['id'],
        'appId': row['app_id'],
        'value': float(row['value']),
        'ts': row['ts'].isoformat() if hasattr(row['ts'], 'isoformat') else str(row['ts']),
        'period': row['period'],
        'by': row['recorded_by'],
        'source': row['source'],
    })
    return out


def list_readings(handler):
    stored, _user = handler.require_user()
    if not stored:
        return
    with app.connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id,app_id,value,ts,period,recorded_by,source,payload FROM temperature_readings ORDER BY ts ASC, id ASC"
            )
            rows = cur.fetchall()
    handler.send_json({'ok': True, 'readings': [_public_row(row) for row in rows]})


def append_readings(handler, payload):
    stored, user = handler.require_user()
    if not stored:
        return
    rows = payload.get('readings')
    if not isinstance(rows, list) or not rows:
        handler.send_json({'error': 'No temperature readings supplied.'}, 400)
        return
    if len(rows) > 64:
        handler.send_json({'error': 'Too many temperature readings in one save.'}, 400)
        return

    state = stored['state']
    valid_apps = {str(a.get('id')) for a in state.get('appliances', []) if isinstance(a, dict) and a.get('id')}
    cleaned = []
    for row in rows:
        if not isinstance(row, dict):
            handler.send_json({'error': 'Invalid temperature reading.'}, 400)
            return
        row_id = str(row.get('id') or '').strip()
        app_id = str(row.get('appId') or '').strip()
        ts = str(row.get('ts') or '').strip()
        try:
            parsed_ts = datetime.fromisoformat(ts.replace('Z', '+00:00'))
        except Exception:
            handler.send_json({'error': 'Temperature timestamp is invalid.'}, 400)
            return
        period = str(row.get('period') or '').upper().strip()
        if period not in ('AM', 'PM'):
            period = 'AM' if parsed_ts.hour < 12 else 'PM'
        try:
            value = float(row.get('value'))
        except Exception:
            handler.send_json({'error': 'Temperature must be numeric.'}, 400)
            return
        if not row_id or app_id not in valid_apps or not ts or value < -60 or value > 120:
            handler.send_json({'error': 'Temperature reading is incomplete or invalid.'}, 400)
            return
        item = dict(row)
        item['id'] = row_id
        item['appId'] = app_id
        item['value'] = value
        item['period'] = period
        item['by'] = str(row.get('by') or user.get('username') or '').strip()[:80]
        item['source'] = str(row.get('source') or 'manual').strip()[:80]
        cleaned.append(item)

    inserted = []
    with app.connect() as conn:
        with conn.cursor() as cur:
            for item in cleaned:
                cur.execute(
                    """
                    INSERT INTO temperature_readings(id,app_id,value,ts,period,recorded_by,source,payload)
                    VALUES(%s,%s,%s,%s::timestamptz,%s,%s,%s,%s::jsonb)
                    ON CONFLICT (id) DO NOTHING
                    RETURNING id,app_id,value,ts,period,recorded_by,source,payload
                    """,
                    (
                        item['id'], item['appId'], item['value'], item['ts'], item['period'],
                        item['by'], item['source'], json.dumps(item, ensure_ascii=False, separators=(',', ':')),
                    ),
                )
                saved = cur.fetchone()
                if saved:
                    inserted.append(_public_row(saved))
            cur.execute(
                "INSERT INTO server_audit(username,action,revision,details) VALUES(%s,%s,%s,%s::jsonb)",
                (
                    user['username'], 'append_temperature_readings', stored['revision'],
                    json.dumps({'requested': len(cleaned), 'inserted': len(inserted), 'ids': [r['id'] for r in inserted]}),
                ),
            )
        conn.commit()

    handler.send_json({'ok': True, 'inserted': len(inserted), 'readings': inserted})
