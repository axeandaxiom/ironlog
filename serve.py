#!/usr/bin/env python3
"""Dev server for IronLog.

    python3 serve.py                 # http://localhost:8765
    python3 serve.py --https         # https on your LAN IP, for the phone
    python3 serve.py --port 9000

Why the --https mode exists: iOS will not register a service worker or hand
out motion-sensor access over plain http from anything except localhost. To
install the app on your iPhone from this Mac you need TLS, so this generates a
self-signed certificate and serves over it. Safari will warn about the
certificate — that is expected for a self-signed one; accept it once.

For anything longer-lived than a test, host the folder on a real static host
(GitHub Pages, Netlify, Cloudflare Pages — all free) and you get a trusted
certificate without any of this.
"""
from __future__ import annotations

import argparse
import http.server
import socket
import ssl
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CERT = ROOT / ".devcert.pem"


class Handler(http.server.SimpleHTTPRequestHandler):
    """Static files, no caching, correct MIME types."""

    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".json": "application/json",
        ".webmanifest": "application/manifest+json",
        ".css": "text/css",
        ".svg": "image/svg+xml",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        # Without this the browser serves a stale module after every edit and
        # you spend an afternoon debugging code that is not running.
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Service-Worker-Allowed", "/")
        super().end_headers()

    def log_message(self, fmt, *args):
        if "404" in (fmt % args):
            sys.stderr.write(f"  404  {self.path}\n")


def lan_ip() -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


def ensure_cert(host: str) -> Path:
    if CERT.exists():
        return CERT
    print("Generating a self-signed certificate…")
    subprocess.run(
        [
            "openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes",
            "-keyout", str(CERT), "-out", str(CERT),
            "-days", "825", "-subj", "/CN=ironlog-dev",
            "-addext", f"subjectAltName=IP:{host},DNS:localhost",
        ],
        check=True,
        capture_output=True,
    )
    return CERT


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--https", action="store_true", help="serve TLS so an iPhone can install the app")
    args = ap.parse_args()

    httpd = http.server.ThreadingHTTPServer(("0.0.0.0", args.port), Handler)
    scheme = "http"

    if args.https:
        host = lan_ip()
        cert = ensure_cert(host)
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(cert)
        httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
        scheme = "https"
        print(f"\n  On this Mac:  {scheme}://localhost:{args.port}")
        print(f"  On your phone: {scheme}://{host}:{args.port}")
        print("\n  Safari will warn about the self-signed certificate. Tap through it once,")
        print("  then Share → Add to Home Screen to install.\n")
    else:
        print(f"\n  {scheme}://localhost:{args.port}")
        print("  Sensors and offline mode need https — run with --https to test those.\n")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")


if __name__ == "__main__":
    main()
