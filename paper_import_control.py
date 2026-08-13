import json
import math
from datetime import date

import app


BACKFILL_FORMAT = 'command-de-cuisine-temperature-backfill'


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


def _valid_day(value):
    try:
        return date.fromisoformat(str(value)) <= date.today()
    except Exception:
        return False


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


def _import_backfill_file(handler, payload, user):
    document = payload.get('document')
    if not isinstance(document, dict) or document.get('format') != BACKFILL_FORMAT or int(document.get('version') or 0) != 1:
        handler.send_json({'error': 'This is not a valid Command de Cuisine temperature backfill file.'}, 400)
        return
    rows = document.get('readings', [])
    gaps = document.get('gaps', [])
    if not isinstance(rows, list) or len(rows) > 3000 or not isinstance(gaps, list) or len(gaps) > 3000:
        handler.send_json({'error': 'Backfill file is too large or malformed.'}, 400)
        return

    with app.connect() as conn:
        current = app.read_state(conn, for_update=True)
        if not current:
            conn.rollback(); handler.send_json({'error': 'App state is not initialised.'}, 409); return
        state = current['state']
        readings = state.get('tempReadings', []) if isinstance(state.get('tempReadings', []), list) else []
        existing = {_slot(r) for r in readings if isinstance(r, dict) and r.get('source') != 'startup-baseline'}
        requested = set()
        added = []
        skipped = 0
        entered_at = app.utcnow()
        label = str(document.get('title') or document.get('fileLabel') or 'Temperature backfill file').strip()[:160]

        for index, row in enumerate(rows):
            if not isinstance(row, dict):
                conn.rollback(); handler.send_json({'error': f'Invalid reading row {index + 1}.'}, 400); return
            day = str(row.get('date') or '').strip()
            period = str(row.get('period') or '').upper().strip()
            appliance = _find_appliance(state, row.get('unit'))
            try:
                value = float(row.get('value'))
            except Exception:
                value = float('nan')
            if not _valid_day(day) or period not in ('AM', 'PM') or appliance is None or not math.isfinite(value) or value < -60 or value > 120:
                conn.rollback(); handler.send_json({'error': f'Invalid row {index + 1}: check date, AM/PM, unit and temperature.'}, 400); return
            item = {'ts': day + ('T09:00:00' if period == 'AM' else 'T17:00:00'), 'appId': appliance['id'], 'period': period}
            key = _slot(item)
            if key in requested:
                conn.rollback(); handler.send_json({'error': f'Duplicate slot in file: {day} {period} {appliance.get("name")}.'}, 400); return
            requested.add(key)
            if key in existing:
                skipped += 1
                continue
            sheet = str(row.get('sourceSheet') or label).strip()[:160]
            added.append({
                'id': f"t-file-{current['revision'] + 1}-{len(added) + 1}", 'appId': appliance['id'], 'value': value,
                'ts': item['ts'], 'period': period, 'by': str(row.get('signed') or user['username']).strip()[:80],
                'source': 'backfill-file-import', 'backfilled': True, 'enteredVia': 'temperature-backfill-file',
                'enteredBy': user['username'], 'enteredAt': entered_at, 'paperSigned': str(row.get('signed') or '').strip()[:80],
                'paperSourceFile': sheet, 'paperImportBatchId': str(row.get('batchId') or f'file:{sheet}:{day[:7]}')[:220],
                'backfillFileSource': str(document.get('source') or 'paper-record-transcription')[:120],
            })
            existing.add(key)

        paper_gaps = state.get('paperTempGaps', []) if isinstance(state.get('paperTempGaps', []), list) else []
        gap_seen = {f"{g.get('date')}|{g.get('appId')}|{str(g.get('period') or '').upper()}" for g in paper_gaps if isinstance(g, dict)}
        added_gaps = []
        for row in gaps:
            if not isinstance(row, dict):
                continue
            day = str(row.get('date') or '').strip(); period = str(row.get('period') or '').upper().strip(); appliance = _find_appliance(state, row.get('unit'))
            if not _valid_day(day) or period not in ('AM', 'PM') or appliance is None:
                continue
            key = f"{day}|{appliance['id']}|{period}"
            if key in existing or key in gap_seen:
                continue
            added_gaps.append({
                'id': f"ptg-file-{current['revision'] + 1}-{len(added_gaps) + 1}", 'date': day, 'period': period,
                'appId': appliance['id'], 'unit': appliance.get('name'), 'signed': str(row.get('signed') or '')[:80],
                'source': 'backfill-file-gap', 'sourceFile': str(row.get('sourceSheet') or label)[:160],
                'reason': str(row.get('reason') or 'No readable numeric value on source record')[:300],
                'enteredBy': user['username'], 'enteredAt': entered_at,
            })
            gap_seen.add(key)

        state['tempReadings'] = readings + added
        state['paperTempGaps'] = paper_gaps + added_gaps
        state.setdefault('audit', []).append({
            'id': f"audit-backfill-file-{current['revision'] + 1}", 'ts': entered_at, 'user': user['username'],
            'action': 'temperature_backfill_file_import',
            'detail': f'{len(added)} readings imported; {len(added_gaps)} gaps documented; {skipped} existing slots kept',
        })
        revision = int(current['revision']) + 1
        raw = json.dumps(state, ensure_ascii=False, separators=(',', ':'))
        if len(raw.encode()) > app.MAX_STATE_BYTES:
            conn.rollback(); handler.send_json({'error': 'State is too large to import this file.'}, 413); return
        with conn.cursor() as cur:
            cur.execute('UPDATE app_state SET state=%s::jsonb, revision=%s, updated_at=NOW(), updated_by=%s WHERE id=1', (raw, revision, user['username']))
            cur.execute('INSERT INTO server_audit(username,action,revision,details) VALUES(%s,%s,%s,%s::jsonb)', (
                user['username'], 'temperature_backfill_file_import', revision,
                json.dumps({'file': label, 'added': len(added), 'gaps': len(added_gaps), 'skipped': skipped}),
            ))
        conn.commit()

    handler.send_json({'ok': True, 'revision': revision, 'added': len(added), 'gaps': len(added_gaps), 'skipped': skipped, 'message': f'Imported {len(added)} backdated temperatures.'})


def undo(handler, payload):
    stored, user = handler.require_user()
    if not stored:
        return
    if user.get('role') != 'manager':
        handler.send_json({'error': 'Manager access required.'}, 403)
        return

    action = str(payload.get('action') or '').lower()
    if action == 'save-historic':
        _save_historic(handler, payload, user)
        return
    if action == 'import-backfill-file':
        _import_backfill_file(handler, payload, user)
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
