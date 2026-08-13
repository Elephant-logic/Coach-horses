import json

import app

# A normal reset now targets import-generated historic recovery only.
RESET_READING_SOURCES = {'paper-log-import', 'backfill-file-import'}
RESET_GAP_SOURCES = {'paper-log-gap', 'backfill-file-gap'}


def _period(row):
    p = str((row or {}).get('period') or '').upper()
    if p in ('AM', 'PM'):
        return p
    try:
        hour = int(str((row or {}).get('ts') or '')[11:13])
    except Exception:
        hour = 9
    return 'AM' if hour < 12 else 'PM'


def _slot(row):
    return f"{str((row or {}).get('ts') or '')[:10]}|{str((row or {}).get('appId') or '')}|{_period(row)}"


def _gap_slot(row):
    return f"{str((row or {}).get('date') or '')}|{str((row or {}).get('appId') or '')}|{str((row or {}).get('period') or '').upper()}"


def _reset_reading(row):
    return isinstance(row, dict) and str(row.get('source') or '') in RESET_READING_SOURCES


def _reset_gap(row):
    return isinstance(row, dict) and str(row.get('source') or '') in RESET_GAP_SOURCES


def _archives(state):
    value = state.get('temperatureRecoveryArchive', [])
    return value if isinstance(value, list) else []


def _archive_summary(state):
    seen = set()
    count = 0
    gap_seen = set()
    gap_count = 0
    for archive in reversed(_archives(state)):
        if not isinstance(archive, dict):
            continue
        for row in archive.get('readings', []) if isinstance(archive.get('readings', []), list) else []:
            if not isinstance(row, dict):
                continue
            key = _slot(row)
            if key and key not in seen:
                seen.add(key)
                count += 1
        for gap in archive.get('gaps', []) if isinstance(archive.get('gaps', []), list) else []:
            if not isinstance(gap, dict):
                continue
            key = _gap_slot(gap)
            if key and key not in gap_seen:
                gap_seen.add(key)
                gap_count += 1
    return count, gap_count


def _write_state(conn, current, state, user, action, details):
    revision = int(current['revision']) + 1
    raw = json.dumps(state, ensure_ascii=False, separators=(',', ':'))
    with conn.cursor() as cur:
        cur.execute(
            'UPDATE app_state SET state=%s::jsonb, revision=%s, updated_at=NOW(), updated_by=%s WHERE id=1',
            (raw, revision, user['username']),
        )
        cur.execute(
            'INSERT INTO server_audit(username,action,revision,details) VALUES(%s,%s,%s,%s::jsonb)',
            (user['username'], action, revision, json.dumps(details)),
        )
    conn.commit()
    return revision


def handle(handler, payload):
    stored, user = handler.require_user()
    if not stored:
        return
    if user.get('role') != 'manager':
        handler.send_json({'error': 'Manager access required.'}, 403)
        return

    action = str(payload.get('action') or 'preview').lower()
    write_action = action in ('reset', 'restore-last', 'restore-all')
    with app.connect() as conn:
        current = app.read_state(conn, for_update=write_action)
        if not current:
            if write_action:
                conn.rollback()
            handler.send_json({'error': 'App state is not initialised.'}, 409)
            return

        state = current['state']
        rows = state.get('tempReadings', []) if isinstance(state.get('tempReadings', []), list) else []
        gaps = state.get('paperTempGaps', []) if isinstance(state.get('paperTempGaps', []), list) else []
        selected = [r for r in rows if _reset_reading(r)]
        selected_gaps = [g for g in gaps if _reset_gap(g)]

        if action == 'preview':
            dates = sorted(str(r.get('ts') or '')[:10] for r in selected if isinstance(r, dict) and r.get('ts'))
            archived_readings, archived_gaps = _archive_summary(state)
            handler.send_json({
                'ok': True,
                'readings': len(selected),
                'gaps': len(selected_gaps),
                'from': dates[0] if dates else '',
                'to': dates[-1] if dates else '',
                'archivedReadings': archived_readings,
                'archivedGaps': archived_gaps,
                'canRestoreLast': archived_readings > 0 or archived_gaps > 0,
            })
            return

        if action == 'reset':
            if str(payload.get('confirm') or '') != 'RESET HISTORIC':
                conn.rollback()
                handler.send_json({'error': 'Type RESET HISTORIC to confirm.'}, 400)
                return

            if not selected and not selected_gaps:
                conn.rollback()
                handler.send_json({'ok': True, 'removedReadings': 0, 'removedGaps': 0, 'message': 'No paper/prepared import recovery data is present to clear. Manager-entered temperatures were left alone.'})
                return

            archive = _archives(state)
            archive_item = {
                'id': f"temp-reset-{int(current['revision']) + 1}",
                'resetAt': app.utcnow(),
                'resetBy': user['username'],
                'readings': selected,
                'gaps': selected_gaps,
            }
            archive.append(archive_item)
            # Keep a wider rescue window; these are compact temperature rows and are valuable recovery evidence.
            state['temperatureRecoveryArchive'] = archive[-20:]
            state['tempReadings'] = [r for r in rows if not _reset_reading(r)]
            state['paperTempGaps'] = [g for g in gaps if not _reset_gap(g)]
            settings = state.setdefault('settings', {})
            settings['historicTemperatureRecoveryClearedAt'] = archive_item['resetAt']
            settings['historicTemperatureRecoveryClearedBy'] = user['username']
            revision = _write_state(conn, current, state, user, 'reset_historic_temperature_imports', {
                'archived_readings': len(selected),
                'archived_gaps': len(selected_gaps),
                'archive_id': archive_item['id'],
                'manager_backfills_preserved': True,
            })
            handler.send_json({'ok': True, 'revision': revision, 'removedReadings': len(selected), 'removedGaps': len(selected_gaps), 'message': 'Paper/prepared historic imports cleared. Manager-entered and live temperatures were kept.'})
            return

        if action in ('restore-last', 'restore-all'):
            archive = _archives(state)
            if not archive:
                conn.rollback()
                handler.send_json({'error': 'There is no historic temperature archive to restore.'}, 404)
                return

            have_slots = {_slot(r) for r in rows if isinstance(r, dict)}
            have_gap_slots = {_gap_slot(g) for g in gaps if isinstance(g, dict)}
            restored = []
            restored_gaps = []

            # Newest archive wins for a slot if the same record was captured more than once.
            for item in reversed(archive):
                if not isinstance(item, dict):
                    continue
                for row in item.get('readings', []) if isinstance(item.get('readings', []), list) else []:
                    if not isinstance(row, dict):
                        continue
                    key = _slot(row)
                    if not key or key in have_slots:
                        continue
                    restored.append(row)
                    have_slots.add(key)
                for gap in item.get('gaps', []) if isinstance(item.get('gaps', []), list) else []:
                    if not isinstance(gap, dict):
                        continue
                    key = _gap_slot(gap)
                    if not key or key in have_gap_slots or key in have_slots:
                        continue
                    restored_gaps.append(gap)
                    have_gap_slots.add(key)

            if not restored and not restored_gaps:
                conn.rollback()
                handler.send_json({'ok': True, 'restoredReadings': 0, 'restoredGaps': 0, 'message': 'All archived temperature records are already present.'})
                return

            state['tempReadings'] = rows + restored
            state['paperTempGaps'] = gaps + restored_gaps
            settings = state.setdefault('settings', {})
            settings.pop('historicTemperatureRecoveryClearedAt', None)
            settings.pop('historicTemperatureRecoveryClearedBy', None)
            revision = _write_state(conn, current, state, user, 'restore_all_archived_temperatures', {
                'restored_readings': len(restored),
                'restored_gaps': len(restored_gaps),
                'archives_scanned': len(archive),
            })
            handler.send_json({
                'ok': True,
                'revision': revision,
                'restoredReadings': len(restored),
                'restoredGaps': len(restored_gaps),
                'message': f'Restored {len(restored)} archived temperature readings and {len(restored_gaps)} archived gaps.',
            })
            return

        handler.send_json({'error': 'Unknown historic recovery action.'}, 400)
