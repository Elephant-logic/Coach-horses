import json

import app


def _matches_batch(row, batch):
    if not isinstance(row, dict):
        return False
    return str(row.get('paperImportBatchId') or row.get('enteredAt') or '') == str(batch or '')


def undo(handler, payload):
    stored, user = handler.require_user()
    if not stored:
        return
    if user.get('role') != 'manager':
        handler.send_json({'error': 'Manager access required.'}, 403)
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
