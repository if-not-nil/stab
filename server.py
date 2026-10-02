"""Run the demo, including its HTTP examples: python3 server.py [port]."""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
import html
import json
import sys

# serve the project next to this file, even when started from another directory
ROOT = Path(__file__).resolve().parent


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == '/demo/fragment':
            # the browser binds these directives to the component that loaded it
            self.respond(200, '<div class="row"><button on:click="count++">fragment add</button> '
                         '<span :text-content="count"></span></div>')
        elif path == '/demo/error':
            # a failed response should leave the previous fragment alone
            self.respond(422, '<p>this response should not replace the fragment</p>')
        else:
            super().do_GET()

    def do_POST(self):
        if urlsplit(self.path).path != '/demo/echo':
            self.send_error(404)
            return
        body = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        fields = parse_qs(body.decode('utf-8'), keep_blank_values=True)
        # escape the submitted text before returning it as html
        payload = html.escape(json.dumps({'method': 'POST', 'fields': fields}, indent=2))
        self.respond(200, f'<pre>{payload}</pre>')

    def respond(self, status, content):
        body = content.encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass  # the browser canceled the request or closed the page


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    print(f'Open http://localhost:{port}/demo.html', flush=True)
    with ThreadingHTTPServer(('0.0.0.0', port), Handler) as server:
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
