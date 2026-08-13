import json
import math
from datetime import date

import app


def _norm(value):
    return ''.join(ch for ch in str(value or '').lower() if ch.isalnum())


def _find_appliance(state, name):
    wanted = _norm(name)
    aliases = {
        'fridge1': ('fridge1', 'frid1'), 'fridge2': ('fridge2', 'frid2'), 'fridge3': ('fridge3', 'frid3'),
        'freezer1': ('freezer1', 'frz1'), 'freezer2': ('freezer2', 'frz2'), 'freezer3': ('freezer3', 'frz3'),
        'coldroom': ('coldroom', 'coldroomfridge'),
    }
    keys = aliases.get(wanted, (wanted,))
    for appliance in state.get('appliances', []):
        current = _norm(appliance.get('name'))
        if current in keys or any(key and key in current for key in keys):
            return appliance
    return None


def _period(row):
    p = str(row.get('period') or '').upper()
    if p in ('AM', 'PM'):
        return p
    try:
        return 'AM' if int(str(row.get('ts') or '')[11:13]) < 12 else 'PM'
    except Exception:
        return 'AM'


def _slot(row):
    return f"{str(row.get('ts') or '')[:10]}|{str(row.get('appId') or '')}|{_period(row)}"


def handle(handler, payload):
    stored, user = handler.require_user()
    if not stored:
        return
    if user.get('role') != 'manager':
        handler.send_json({'error': 'Manager access required.'}, 403)
        return

    rows = payload.get('readings')
    if not isinstance(rows, list) or not rows:
        handler.send_json({'error': 'No temperature register readings supplied.'}, 400)
        return
    if len(rows) > 3000:
        handler.send_json({'error': 'Temperature register is too large.'}, 400)
        return

    with app.connect() as conn:
        current = app.read_state(conn, for_update=True)
        if not current:
            conn.rollback()
            handler.send_json({'error': 'App state is not initialised.'}, 409)
            return
        state = current['state']
        readings = state.get('tempReadings', []) if isinstance(state.get('tempReadings', []), list) else []
        existing = {_slot(r) for r in readings if isinstance(r, dict) and r.get('source') != 'startup-baseline'}
        requested = set()
        added = []
        skipped = 0
        entered_at = app.utcnow()
        label = str(payload.get('fileName') or 'Temperature register CSV').strip()[:160]

        for index, row in enumerate(rows):
            if not isinstance(row, dict):
                conn.rollback(); handler.send_json({'error': f'Invalid register row {index + 1}.'}, 400); return
            day = str(row.get('date') or '').strip()
            period = str(row.get('period') or '').upper().strip()
            appliance = _find_appliance(state, row.get('unit'))
            try:
                parsed_day = date.fromisoformat(day)
                value = float(row.get('value'))
            except Exception:
                parsed_day = None
                value = float('nan')
            if parsed_day is None or parsed_day > date.today() or period not in ('AM', 'PM') or appliance is None or not math.isfinite(value) or value < -60 or value > 120:
                conn.rollback(); handler.send_json({'error': f'Invalid register reading {index + 1}.'}, 400); return
            item = {'ts': day + ('T09:00:00' if period == 'AM' else 'T17:00:00'), 'appId': appliance['id'], 'period': period}
            key = _slot(item)
            if key in requested:
                conn.rollback(); handler.send_json({'error': f'Duplicate slot in register: {day} {period} {appliance.get("name")}.'}, 400); return
            requested.add(key)
            if key in existing:
                skipped += 1
                continue
            added.append({
                'id': f"t-register-{current['revision'] + 1}-{len(added) + 1}",
                'appId': appliance['id'],
                'value': value,
                'ts': item['ts'],
                'period': period,
                'by': str(row.get('recordedBy') or user['username']).strip()[:80],
                'source': 'historic-register',
                'backfilled': True,
                'enteredVia': 'temperature-register-csv',
                'enteredBy': user['username'],
                'enteredAt': entered_at,
                'registerFile': label,
            })
            existing.add(key)

        state['tempReadings'] = readings + added
        state.setdefault('audit', []).append({
            'id': f"audit-register-{current['revision'] + 1}",
            'ts': entered_at,
            'user': user['username'],
            'action': 'temperature_register_import',
            'detail': f'{len(added)} readings added to normal history; {skipped} existing slots kept',
        })
        revision = int(current['revision']) + 1
        raw = json.dumps(state, ensure_ascii=False, separators=(',', ':'))
        if len(raw.encode()) > app.MAX_STATE_BYTES:
            conn.rollback(); handler.send_json({'error': 'State is too large to import this register.'}, 413); return
        with conn.cursor() as cur:
            cur.execute('UPDATE app_state SET state=%s::jsonb, revision=%s, updated_at=NOW(), updated_by=%s WHERE id=1', (raw, revision, user['username']))
            cur.execute('INSERT INTO server_audit(username,action,revision,details) VALUES(%s,%s,%s,%s::jsonb)', (
                user['username'], 'temperature_register_import', revision,
                json.dumps({'file': label, 'added': len(added), 'skipped': skipped}),
            ))
        conn.commit()

    handler.send_json({'ok': True, 'revision': revision, 'added': len(added), 'skipped': skipped, 'message': f'Added {len(added)} temperatures to normal History.'})
