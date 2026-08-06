import json
import os
from pathlib import Path
from http.server import ThreadingHTTPServer
import app
import startup_history

BASE_DIR = Path(__file__).resolve().parent


def extract_embedded_paperwork():
    text = (BASE_DIR / 'index.html').read_text(encoding='utf-8')
    marker = 'paperwork: ['
    start = text.find(marker)
    if start < 0:
        return []
    start = text.find('[', start)
    depth = 0
    in_string = False
    escaped = False
    quote = ''
    for pos in range(start, len(text)):
        char = text[pos]
        if in_string:
            if escaped:
                escaped = False
            elif char == '\\':
                escaped = True
            elif char == quote:
                in_string = False
        else:
            if char in ('"', "'"):
                in_string = True
                quote = char
            elif char == '[':
                depth += 1
            elif char == ']':
                depth -= 1
                if depth == 0:
                    return json.loads(text[start:pos + 1])
    return []


def restore_original_paperwork():
    papers = extract_embedded_paperwork()
    if not papers:
        print('No embedded paperwork found; migration skipped')
        return
    with app.connect() as conn:
        with conn.cursor() as cur:
            cur.execute('SELECT state, revision FROM app_state WHERE id=1 FOR UPDATE')
            row = cur.fetchone()
            if not row:
                return
            state = row['state']
            existing = {str(item.get('id')) for item in state.get('paperwork', [])}
            added = [item for item in papers if str(item.get('id')) not in existing]
            if not added:
                print('Original paperwork already present')
                return
            state.setdefault('paperwork', []).extend(added)
            state.setdefault('settings', {})['originalPaperworkRestored'] = True
            revision = int(row['revision']) + 1
            cur.execute(
                "UPDATE app_state SET state=%s::jsonb, revision=%s, updated_at=NOW(), updated_by='paperwork-migration' WHERE id=1",
                (json.dumps(state, ensure_ascii=False, separators=(',', ':')), revision),
            )
            cur.execute(
                "INSERT INTO server_audit(username,action,revision,details) VALUES(%s,%s,%s,%s::jsonb)",
                ('system', 'restore_original_paperwork', revision, json.dumps({'added': len(added)})),
            )
        conn.commit()
    print(f'Restored {len(added)} original paperwork records')


def harden_legacy_login(raw):
    guard = '<style id="secure-login-guard">#resetLogin,.login-note{display:none!important}#loginForm input[name="password"]{color:transparent!important;text-shadow:none!important}</style>'
    if 'secure-login-guard' not in raw:
        raw = raw.replace('</head>', guard + '</head>', 1)
    raw = raw.replace('value="ChangeMe123!" autocomplete="current-password"', 'value="" autocomplete="current-password"')
    raw = raw.replace('value="Kitchen123!" autocomplete="current-password"', 'value="" autocomplete="current-password"')
    return raw


class Handler(app.Handler):
    def do_GET(self):
        path = self.path.split('?', 1)[0]
        if path == '/':
            raw = (BASE_DIR / 'index.html').read_text(encoding='utf-8')
            raw = harden_legacy_login(raw)
            marker = '</body>'
            scripts = (
                '<script src="/delivery_patch.js?v=7"></script>'
                '<script src="/ai_server_patch.js?v=1"></script>'
                '<script src="/compliance_patch.js?v=1"></script>'
                '<script src="/login_cleanup_patch.js?v=3"></script>'
                '<script src="/recipe_menu_patch.js?v=1"></script>'
                '<script src="/recipe_management_patch.js?v=1"></script>'
                '<script src="/prep_delete_patch.js?v=1"></script>'
                '<script src="/single_dish_cleanup_patch.js?v=2"></script>'
                '<script src="/menu_builder_patch.js?v=1"></script>'
                '<script src="/menu_photo_import_patch.js?v=3"></script>'
                '<script src="/clockin_session_patch.js?v=1"></script>'
                '<script src="/ai_recipe_save_patch.js?v=3"></script>'
                '<script src="/recipe_category_patch.js?v=3"></script>'
                '<script src="/recipe_seed_patch.js?v=1"></script>'
                '<script src="/prep_nav_repair_patch.js?v=4"></script>'
                '<script src="/prep_menu_upload_patch.js?v=1"></script>'
            )
            if '/prep_menu_upload_patch.js' not in raw:
                before, found, after = raw.rpartition(marker)
                if found:
                    raw = before + scripts + found + after
            data = raw.encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.end_headers()
            self.wfile.write(data)
            return
        patch_files = (
            '/delivery_patch.js', '/ai_server_patch.js', '/compliance_patch.js',
            '/login_cleanup_patch.js', '/recipe_menu_patch.js', '/recipe_management_patch.js',
            '/prep_delete_patch.js', '/single_dish_cleanup_patch.js', '/menu_builder_patch.js',
            '/menu_photo_import_patch.js', '/clockin_session_patch.js', '/ai_recipe_save_patch.js',
            '/recipe_category_patch.js', '/recipe_seed_patch.js', '/prep_nav_repair_patch.js',
            '/prep_menu_upload_patch.js'
        )
        if path in patch_files:
            data = (BASE_DIR / path.lstrip('/')).read_bytes()
            self.send_response(200)
            self.send_header('Content-Type', 'application/javascript; charset=utf-8')
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.end_headers()
            self.wfile.write(data)
            return
        super().do_GET()


if __name__ == '__main__':
    restore_original_paperwork()
    startup_history.install(app)
    port = int(os.environ.get('PORT', '10000'))
    print('Coach & Horses Kitchen Pro listening on 0.0.0.0:%s' % port)
    ThreadingHTTPServer(('0.0.0.0', port), Handler).serve_forever()
