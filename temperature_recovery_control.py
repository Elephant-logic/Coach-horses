import json

import app

RECOVERY_SOURCES = {'paper-log-import', 'backfill-file-import', 'manager-backfill'}
GAP_SOURCES = {'paper-log-gap', 'backfill-file-gap'}


def _reading(row):
    return isinstance(row, dict) and str(row.get('source') or '') in RECOVERY_SOURCES


def _gap(row):
    return isinstance(row, dict) and str(row.get('source') or '') in GAP_SOURCES


def handle(handler, payload):
    stored, user = handler.require_user()
    if not stored:
        return
    if user.get('role') != 'manager':
        handler.send_json({'error': 'Manager access required.'}, 403)
        return

    action = str(payload.get('action') or 'preview').lower()
    with app.connect() as conn:
        current = app.read_state(conn, for_update=action in ('reset', 'restore-last'))
        if not current:
            if action in ('reset', 'restore-last'):
                conn.rollback()
            handler.send_json({'error': 'App state is not initialised.'}, 409)
            return
        state = current['state']
        rows = state.get('tempReadings', []) if isinstance(state.get('tempReadings', []), list) else []
        gaps = state.get('paperTempGaps', []) if isinstance(state.get('paperTempGaps', []), list) else []
        selected = [r for r in rows if _reading(r)]
        selected_gaps = [g for g in gaps if _gap(g)]

        if action == 'preview':
            dates = sorted(str(r.get('ts') or '')[:10] for r in selected if r.get('ts'))
            handler.send_json({
                'ok': True,
                'readings': len(selected),
                'gaps': len(selected_gaps),
                'from': dates[0] if dates else '',
                'to': dates[-1] if dates else '',
                'canRestoreLast': bool(state.get('temperatureRecoveryArchive')),
            })
            return

        if action == 'reset':
            if str(payload.get('confirm') or '') != 'RESET HISTORIC':
                conn.rollback()
                handler.send_json({'error': 'Type RESET HISTORIC to confirm.'}, 400)
                return
            archive = state.get('temperatureRecoveryArchive', []) if isinstance(state.get('temperatureRecoveryArchive', []), list) else []
            archive_item = {
                'id': f"temp-reset-{int(current['revision']) + 1}",
                'resetAt': app.utcnow(),
                'resetBy': user['username'],
                'readings': selected,
                'gaps': selected_gaps,
            }
            archive.append(archive_item)
            state['temperatureRecoveryArchive'] = archive[-5:]
            state['tempReadings'] = [r for r in rows if not _reading(r)]
            state['paperTempGaps'] = [g for g in gaps if not _gap(g)]
            settings = state.setdefault('settings', {})
            settings['historicTemperatureRecoveryClearedAt'] = archive_item['resetAt']
            settings['historicTemperatureRecoveryClearedBy'] = user['username']
            revision = int(current['revision']) + 1
            raw = json.dumps(state, ensure_ascii=False, separators=(',', ':'))
            with conn.cursor() as cur:
                cur.execute('UPDATE app_state SET state=%s::jsonb, revision=%s, updated_at=NOW(), updated_by=%s WHERE id=1', (raw, revision, user['username']))
                cur.execute('INSERT INTO server_audit(username,action,revision,details) VALUES(%s,%s,%s,%s::jsonb)', (
                    user['username'], 'reset_historic_temperature_recovery', revision,
                    json.dumps({'archived_readings': len(selected), 'archived_gaps': len(selected_gaps), 'archive_id': archive_item['id']}),
                ))
            conn.commit()
            handler.send_json({'ok': True, 'revision': revision, 'removedReadings': len(selected), 'removedGaps': len(selected_gaps), 'message': 'Historic recovery cleared. Live temperature readings were kept.'})
            return

        if action == 'restore-last':
            archive = state.get('temperatureRecoveryArchive', []) if isinstance(state.get('temperatureRecoveryArchive', []), list) else []
            if not archive:
                conn.rollback()
                handler.send_json({'error': 'There is no historic reset archive to restore.'}, 404)
                return
            last = archive[-1]
            ids = {str(r.get('id')) for r in rows if isinstance(r, dict)}
            gap_ids = {str(g.get('id')) for g in gaps if isinstance(g, dict)}
            restored = [r for r in last.get('readings', []) if str(r.get('id')) not in ids]
            restored_gaps = [g for g in last.get('gaps', []) if str(g.get('id')) not in gap_ids]
            state['tempReadings'] = rows + restored
            state['paperTempGaps'] = gaps + restored_gaps
            state['temperatureRecoveryArchive'] = archive[:-1]
            settings = state.setdefault('settings', {})
            settings.pop('historicTemperatureRecoveryClearedAt', None)
            settings.pop('historicTemperatureRecoveryClearedBy', None)
            revision = int(current['revision']) + 1
            raw = json.dumps(state, ensure_ascii=False, separators=(',', ':'))
            with conn.cursor() as cur:
                cur.execute('UPDATE app_state SET state=%s::jsonb, revision=%s, updated_at=NOW(), updated_by=%s WHERE id=1', (raw, revision, user['username']))
                cur.execute('INSERT INTO server_audit(username,action,revision,details) VALUES(%s,%s,%s,%s::jsonb)', (
                    user['username'], 'restore_historic_temperature_reset', revision,
                    json.dumps({'restored_readings': len(restored), 'restored_gaps': len(restored_gaps), 'archive_id': last.get('id')}),
                ))
            conn.commit()
            handler.send_json({'ok': True, 'revision': revision, 'message': f'Restored {len(restored)} historic recovery readings.'})
            return

        handler.send_json({'error': 'Unknown historic recovery action.'}, 400)
