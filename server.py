import json
import os
from pathlib import Path
from http.server import ThreadingHTTPServer
import app
import startup_history
import auth_controls

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
    guard = '<style id="secure-login-guard">#resetLogin,.login-note{display:none!important}#loginForm input[name="password"]{color:transparent!important;text-shadow:none!important}[data-complete-menu-upload]{display:none!important}</style>'
    if 'secure-login-guard' not in raw:
        raw = raw.replace('</head>', guard + '</head>', 1)
    raw = raw.replace('value="ChangeMe123!" autocomplete="current-password"', 'value="" autocomplete="current-password"')
    raw = raw.replace('value="Kitchen123!" autocomplete="current-password"', 'value="" autocomplete="current-password"')
    return raw


RUNTIME_FILES = (
    '/command_de_cuisine_enhancements.js', '/account_controls.js',
    '/runtime_loader.js',
    '/delivery_patch.js', '/ai_server_patch.js', '/compliance_patch.js',
    '/login_cleanup_patch.js', '/recipe_management_patch.js', '/clockin_session_patch.js',
    '/ai_recipe_save_patch.js', '/ai_ideas_variety_patch.js', '/recipe_category_patch.js',
    '/menu_photo_complete_import_patch.js', '/kitchen_workflow_stable.js', '/prep_v2.js',
    '/global_kitchen_assistant_tabs.js', '/settings_pro_patch.js', '/tab_specific_forms.js',
    '/tab_spreadsheet_upgrade.js', '/analytics_tabs_upgrade.js', '/kitchen_dashboard.js',
)


class Handler(app.Handler):
    def do_GET(self):
        path = self.path.split('?', 1)[0]
        if path == '/':
            raw = (BASE_DIR / 'index.html').read_text(encoding='utf-8')
            scripts = (
                '<script src="/command_de_cuisine_enhancements.js?v=20260810a"></script>'
                '<script src="/account_controls.js?v=20260810a"></script>'
            )
            if '/command_de_cuisine_enhancements.js' not in raw:
                before, found, after = raw.rpartition('</body>')
                if found:
                    raw = before + scripts + found + after
            elif '/account_controls.js' not in raw:
                before, found, after = raw.rpartition('</body>')
                if found:
                    raw = before + '<script src="/account_controls.js?v=20260810a"></script>' + found + after
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
        if path == '/api/session':
            auth_controls.send_session(self)
            return
        if path == '/api/export':
            auth_controls.send_export(self)
            return
        if path in RUNTIME_FILES:
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

    def do_POST(self):
        path = self.path.split('?', 1)[0]
        if path in ('/api/login', '/api/password/change', '/api/users/manage'):
            try:
                payload = self.read_json()
            except Exception as exc:
                self.send_json({'error': str(exc)}, 400)
                return
            if path == '/api/login':
                auth_controls.login(self, payload)
            elif path == '/api/password/change':
                auth_controls.change_password(self, payload)
            else:
                auth_controls.manage_user(self, payload)
            return
        super().do_POST()

    def do_PUT(self):
        if self.path.split('?', 1)[0] == '/api/state':
            try:
                payload = self.read_json()
            except Exception as exc:
                self.send_json({'error': str(exc)}, 400)
                return
            auth_controls.save_state(self, payload)
            return
        super().do_PUT()


if __name__ == '__main__':
    restore_original_paperwork()
    startup_history.install(app)
    port = int(os.environ.get('PORT', '10000'))
    print('Coach & Horses Kitchen Pro listening on 0.0.0.0:%s' % port)
    ThreadingHTTPServer(('0.0.0.0', port), Handler).serve_forever()
