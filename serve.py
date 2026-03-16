#!/usr/bin/env python3
"""Simple HTTP server for testing the checkboxes UI"""
import http.server
import socketserver
import os
import sys

PORT = 3000
DIRECTORY = "/Users/alexander/development/checkboxes/.worktrees/checkboxes-impl/frontend"

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        return super().end_headers()

try:
    with socketserver.TCPServer(("", PORT), MyHTTPRequestHandler) as httpd:
        print(f"Serving frontend on http://localhost:{PORT}")
        print(f"Server running from: {DIRECTORY}")
        print("Press Ctrl+C to stop")
        httpd.serve_forever()
except KeyboardInterrupt:
    print("\nServer stopped")
    sys.exit(0)
except OSError as e:
    print(f"Error: {e}")
    sys.exit(1)
