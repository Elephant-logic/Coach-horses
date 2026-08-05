import os
from pathlib import Path
from http.server import ThreadingHTTPServer
import app

BASE_DIR = Path(__file__).resolve().parent


class Handler(app.Handler):
    def do_GET(self):
        path = self.path.split('?', 1)[0]
        if path == '/':
            raw = (BASE_DIR / 'index.html').read_text(encoding='utf-8')
            marker = '</body>'
            script = '<script src="/delivery_patch.js?v=4"></script>'
            # Inject only before the final real closing body tag. The HTML contains
            # '</body>' text inside JavaScript templates, so replacing the first
            # occurrence corrupts the app and exposes source code on screen.
            if script not in raw:
                before, found, after = raw.rpartition(marker)
                if found:
                    raw = before + script + found + after
            data = raw.encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-store, max-age=0')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.end_headers()
            self.wfile.write(data)
            return
        if path == '/delivery_patch.js':
            data = (BASE_DIR / 'delivery_patch.js').read_bytes()
            self.send_response(200)
            self.send_header('Content-Type', 'application/javascript; charset=utf-8')
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-store, max-age=0')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.end_headers()
            self.wfile.write(data)
            return
        super().do_GET()


if __name__ == '__main__':
    port = int(os.environ.get('PORT', '10000'))
    print(f'Coach & Horses Kitchen Pro listening on 0.0.0.0:{port}')
    ThreadingHTTPServer(('0.0.0.0', port), Handler).serve_forever()
