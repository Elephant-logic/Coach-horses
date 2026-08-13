import json
import math
import app


def save_entries(handler, payload):
    stored, user = handler.require_user()
    if not stored:
        return
    if user.get('role') != 'manager':
        handler.send_json({'error': 'Manager access required.'}, 403)
        return
    rows = payload.get('readings')
    if not isinstance(rows, list) or not rows:
        handler.send_json({'error': 'No readings supplied.'}, 400)
        return
    cleaned = []
    for row in rows:
        try:
            value = float(row.get('value'))
        except Exception:
            handler.send_json({'error': 'Every reading needs a numeric value.'}, 400)
            return
        if not math.isfinite(value):
            handler.send_json({'error': 'Invalid temperature value.'}, 400)
            return
        cleaned.append({
            'id': str(row.get('id') or ''),
            'appId': str(row.get('appId') or ''),
            'value': value,
            'ts': str(row.get('ts') or ''),
            'period': str(row.get('period') or '').upper(),
            'by': user['username'],
            'source': 'manager-backfill',
            'backfilled': True,
            'enteredVia': 'history-gap-fill',
            'enteredAt': app.utcnow(),
        })
    if any(not r['appId'] or len(r['ts']) < 16 or r['period'] not in ('AM','PM') for r in cleaned):
        handler.send_json({'error': 'Incomplete reading data.'}, 400)
        return
    with app.connect() as conn:
        current = app.read_state(conn, for_update=True)
        if not current:
            conn.rollback(); handler.send_json({'error':'Not initialised.'},409); return
        state = current['state']
        existing = state.get('tempReadings', []) if isinstance(state.get('tempReadings', []), list) else []
        def key(r):
            p = str(r.get('period') or ('AM' if int(str(r.get('ts') or 'T09')[11:13] or 9) < 12 else 'PM')).upper()
            return str(r.get('ts') or '')[:10]+'|'+str(r.get('appId') or '')+'|'+p
        have = {key(r) for r in existing if isinstance(r, dict) and r.get('source') != 'startup-baseline'}
        if any(key(r) in have for r in cleaned):
            conn.rollback(); handler.send_json({'error':'One or more slots already exist. Reload and try again.'},409); return
        existing.extend(cleaned)
        state['tempReadings'] = existing
        revision = int(current['revision']) + 1
        raw = json.dumps(state, ensure_ascii=False, separators=(',', ':'))
        with conn.cursor() as cur:
            cur.execute('UPDATE app_state SET state=%s::jsonb, revision=%s, updated_at=NOW(), updated_by=%s WHERE id=1',(raw,revision,user['username']))
            cur.execute('INSERT INTO server_audit(username,action,revision,details) VALUES(%s,%s,%s,%s::jsonb)',(user['username'],'historic_temperature_backfill',revision,json.dumps({'count':len(cleaned),'slots':[key(r) for r in cleaned]})))
        conn.commit()
    handler.send_json({'ok':True,'revision':revision,'readings':cleaned,'message':f'Saved {len(cleaned)} historic temperature readings.'})
