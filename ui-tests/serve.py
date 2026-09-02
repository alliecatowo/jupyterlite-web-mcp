"""Static file server for the built JupyterLite site.

Used by the Playwright test suite so the browser tests never need a Jupyter
server: JupyterLite is a static site, and the tests exercise exactly the same
artifact that gets deployed.
"""

import argparse
import functools
import http.server
import os
import socketserver

# Python's mimetypes database does not always know these, and Pyodide needs
# them to be served correctly.
EXTRA_TYPES = {
    ".wasm": "application/wasm",
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".json": "application/json",
    ".whl": "application/octet-stream",
    ".ttf": "font/ttf",
    ".woff2": "font/woff2",
}


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        **EXTRA_TYPES,
    }

    def end_headers(self):
        # Keep caching out of the way so a rebuilt site is picked up.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--directory", default="../dist")
    args = parser.parse_args()

    directory = os.path.abspath(args.directory)
    if not os.path.isdir(directory):
        raise SystemExit(
            f"{directory} does not exist. Build the site first:\n"
            "  jupyter lite build --contents content --output-dir dist"
        )

    handler = functools.partial(Handler, directory=directory)
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", args.port), handler) as httpd:
        print(f"serving {directory} on http://127.0.0.1:{args.port}")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
