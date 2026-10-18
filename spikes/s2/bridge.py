"""Hold one `maestro mcp` stdio session; expose it on localhost HTTP; log every call.

POST /list  -> tools/list result
POST /call  body {"name": ..., "arguments": {...}} -> tools/call result
"""

import json
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

LOG = sys.argv[1]
proc = subprocess.Popen(
    [sys.argv[2], "mcp"],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=open(LOG + ".stderr", "w"),
    text=True,
    bufsize=1,
)
lock = threading.Lock()
next_id = 0


def rpc(method, params=None, notify=False):
    global next_id
    msg = {"jsonrpc": "2.0", "method": method}
    if params is not None:
        msg["params"] = params
    if not notify:
        next_id += 1
        msg["id"] = next_id
    proc.stdin.write(json.dumps(msg) + "\n")
    proc.stdin.flush()
    if notify:
        return None
    while True:
        line = proc.stdout.readline()
        if not line:
            raise RuntimeError("maestro mcp exited")
        try:
            reply = json.loads(line)
        except json.JSONDecodeError:
            continue
        if reply.get("id") == msg["id"]:
            return reply


rpc("initialize", {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "s2-bridge", "version": "0"}})
rpc("notifications/initialized", notify=True)


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)) or 0)
        with lock:
            started = time.time()
            if self.path == "/list":
                reply = rpc("tools/list", {})
            else:
                call = json.loads(body)
                reply = rpc("tools/call", call)
                with open(LOG, "a") as log:
                    log.write(json.dumps({"call": call, "seconds": round(time.time() - started, 2), "reply": reply}) + "\n")
        out = json.dumps(reply).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(out)

    def log_message(self, *args):
        pass


HTTPServer(("127.0.0.1", 8765), Handler).serve_forever()
