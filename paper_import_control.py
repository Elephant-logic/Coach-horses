import json
import math

import app


def _matches_batch(row, batch):
    if not isinstance(row, dict):
        return False
    return str(row.get('paperImportBatchId') or row.get('enteredAt') or '') == str(batch or '')


def _period(row):
    p = str(row.get('period') or '').upper()
    if p in ('AM', 'PM'):
        return p
    try:
        hour = int(str(row.get('ts') or '')[11:13])
    except Exception:
        hour = 9
    return 'AM' if hour < 12 else 'PM'


def _slot(row):
    return f"{str(row.get('ts') or '')[:10]}|{str(row.get('appId') or '')}|{_period(row)}"


def _save_historic(handler, payload, user):
    rows = payload.get('readings')
    if not isinstance(rows, list) or not rows:
        handler.send_json({'error': 'No historic temperature readings supplied.'}, 400)
        return
    if len(rows) > 32:
        handler.send_json({'error': 'Too many historic readings in one save.'}, 400)
        return

    cleaned = []
    requested = set()
    for row in rows:
        if not isinstance(row, dict):
            handler.send_json({'error': 'Invalid historic temperature row.'}, 400)
            return
        app_id = str(row.get('appId') or '').strip()
        ts = str(row.get('ts') or '').strip()
        period = str(row.get('period') or '').upper()
        try:
            value = float(row.get('value'))
        except Exception:
            handler.send_json({'error': 'Every historic temperature needs a numeric value.'}, 400)
            return
        if not app_id or len(ts) < 16 or period not in ('AM', 'PM') or not math.isfinite(value):
            handler.send_json({'error': 'Historic temperature data is incomplete.'}, 400)
            return
        item = {
            'id': str(row.get('id') or f"t-{app_id}-{ts}-{user['username']}"),
            'appId': app_id,
            'value': value,
            'ts': ts,
            'period': period,
            'by': user['username'],
            'source': 'manager-backfill',
            'backfilled': True,
            'enteredVia': 'history-gap-fill-atomic',
            'enteredAt': app.utcnow(),
        }
        key = _slot(item)
        if key in requested:
            handler.send_json({'error': 'Duplicate historic temperature slot in this save.'}, 400)
            return
        requested.add(key)
        cleaned.append(item)

    with app.connect() as conn:
        current = app.read_state(conn, for_update=True)
        if not current:
            conn.rollback()
            handler.send_json({'error': 'App state is not initialised.'}, 409)
            return
        state = current['state']
        readings = state.get('tempReadings', []) if isinstance(state.get('tempReadings', []), list) else []
        existing = {_slot(r) for r in readings if isinstance(r, dict) and r.get('source') != 'startup-baseline'}
        if any(_slot(r) in existing for r in cleaned):
            conn.rollback()
            handler.send_json({'error': 'One or more temperature slots already exist. Reload and check History.'}, 409)
            return

        readings.extend(cleaned)
        state['tempReadings'] = readings
        revision = int(current['revision']) + 1
        raw = json.dumps(state, ensure_ascii=False, separators=(',', ':'))
        with conn.cursor() as cur:
            cur.execute(
                'UPDATE app_state SET state=%s::jsonb, revision=%s, updated_at=NOW(), updated_by=%s WHERE id=1',
                (raw, revision, user['username']),
            )
            cur.execute(
                'INSERT INTO server_audit(username,action,revision,details) VALUES(%s,%s,%s,%s::jsonb)',
                (user['username'], 'historic_temperature_backfill', revision, json.dumps({'count': len(cleaned), 'slots': [_slot(r) for r in cleaned]})),
            )
        conn.commit()

    handler.send_json({'ok': True, 'revision': revision, 'readings': cleaned, 'message': f'Saved {len(cleaned)} historic temperature readings.'})


def undo(handler, payload):
    stored, user = handler.require_user()
    if not stored:
        return
    if user.get('role') != 'manager':
        handler.send_json({'error': 'Manager access required.'}, 403)
        return

    if str(payload.get('action') or '').lower() == 'save-historic':
        _save_historic(handler, payload, user)
        return

    batch = str(payload.get('batch') or '').strip()
    if not batch:
        handler.send_json({'error': 'Paper import batch is required.'}, 400)
        return

    with app.connect() as conn:
        current = app.read_state(conn, for_update=True)
        if not current:
            conn.rollback()
            handler.send_json({'error': 'App state is not initialised.'}, 409)
            return
        state = current['state']
        old_readings = state.get('tempReadings', []) if isinstance(state.get('tempReadings', []), list) else []
        removed_rows = [r for r in old_readings if r.get('source') == 'paper-log-import' and _matches_batch(r, batch)]
        if not removed_rows:
            conn.rollback()
            handler.send_json({'error': 'That paper import batch was not found.'}, 404)
            return

        removed_ids = {str(r.get('id')) for r in removed_rows if r.get('id') is not None}
        state['tempReadings'] = [r for r in old_readings if str(r.get('id')) not in removed_ids]

        gaps = state.get('paperTempGaps', []) if isinstance(state.get('paperTempGaps', []), list) else []
        removed_gaps = [g for g in gaps if g.get('source') == 'paper-log-gap' and _matches_batch(g, batch)]
        state['paperTempGaps'] = [g for g in gaps if not (g.get('source') == 'paper-log-gap' and _matches_batch(g, batch))]

        files = sorted({str(r.get('paperSourceFile')) for r in removed_rows if r.get('paperSourceFile')})
        dates = sorted({str(r.get('ts', ''))[:10] for r in removed_rows if r.get('ts')})
        revision = int(current['revision']) + 1
        raw = json.dumps(state, ensure_ascii=False, separators=(',', ':'))
        with conn.cursor() as cur:
            cur.execute(
                'UPDATE app_state SET state=%s::jsonb, revision=%s, updated_at=NOW(), updated_by=%s WHERE id=1',
                (raw, revision, user['username']),
            )
            cur.execute(
                'INSERT INTO server_audit(username,action,revision,details) VALUES(%s,%s,%s,%s::jsonb)',
                (
                    user['username'],
                    'undo_paper_temperature_import',
                    revision,
                    json.dumps({
                        'batch': batch,
                        'removed_readings': len(removed_rows),
                        'removed_gaps': len(removed_gaps),
                        'files': files,
                        'from': dates[0] if dates else '',
                        'to': dates[-1] if dates else '',
                    }),
                ),
            )
        conn.commit()

    handler.send_json({
        'ok': True,
        'revision': revision,
        'removedReadings': len(removed_rows),
        'removedGaps': len(removed_gaps),
        'message': f'Removed {len(removed_rows)} paper-import temperature readings.',
    })
