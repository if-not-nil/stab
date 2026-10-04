import html
import json
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def respond(self, status, content):
        body = content.encode()
        self.send_response(status)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        match urlsplit(self.path).path:
            case '/demo/fragment':
                self.respond(200, """
                 <div class="row">
                    <button on:click="count++">fragment add</button>'
                    <span :text-content="count"></span>
                 </div>
                 """)
            case '/demo/error':
                self.respond(418, """
                    <p>this response should not replace the fragment</p>
                    """)
            case _:
                super().do_GET()

    def do_POST(self):
        if urlsplit(self.path).path != '/demo/echo':
            return self.send_error(404)

        body = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        fields = parse_qs(body.decode(), keep_blank_values=True)
        payload = html.escape(json.dumps(
            {'method': 'POST', 'fields': fields}, indent=2))

        self.respond(200, f'<pre>{payload}</pre>')


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
print(f'http://localhost:{port}/demo.html')

ThreadingHTTPServer(('', port), partial(
    Handler, directory=Path(__file__).resolve().parent.parent)).serve_forever()
