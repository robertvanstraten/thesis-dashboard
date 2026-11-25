# Lokale test: serveert de app én doet alsof hij api.github.com is (contents + commits),
# op een KOPIE van de data. Zo kun je alles uitproberen zonder je echte repo aan te raken.
#
#   python3 dev/mock_api.py --data ../thesis-dashboard-data --port 8765
#   open http://localhost:8765/ , plak bij inloggen een willekeurig token (bv. "test")
#   (de app gebruikt de mock-API alleen op localhost; zie js/github.js)

import argparse
import base64
import hashlib
import json
import shutil
import subprocess
import tempfile
import time
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
ap = argparse.ArgumentParser()
ap.add_argument("--data", type=Path, required=True, help="map met todo.json, literature.json, feed/…")
ap.add_argument("--port", type=int, default=8765)
ap.add_argument("--git", type=Path, default=None, help="git-repo voor de commits-feed (optioneel)")
ap.add_argument("--inplace", action="store_true", help="schrijf in --data zelf i.p.v. een kopie")
args = ap.parse_args()

DATA = args.data if args.inplace else Path(tempfile.mkdtemp(prefix="dash-mock-"))
if not args.inplace:
    shutil.copytree(args.data, DATA, dirs_exist_ok=True, ignore=shutil.ignore_patterns(".git"))
print(f"data: {DATA}")
LOG = []


def blob_sha(b: bytes) -> str:
    return hashlib.sha1(b"blob %d\0" % len(b) + b).hexdigest()


class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(APP), **kw)

    def log_message(self, fmt, *a):
        if "/gh/" in self.path:
            print(self.command, self.path.split("?")[0], *a[1:2])

    def send_json(self, code, obj):
        b = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def gh_path(self):
        u = urllib.parse.urlparse(self.path)
        parts = u.path.split("/")[2:]  # na /gh/
        return parts, urllib.parse.parse_qs(u.query)

    def auth_ok(self):
        if self.headers.get("Authorization", "") in ("", "Bearer ", "Bearer bad"):
            self.send_json(401, {"message": "Bad credentials"})
            return False
        return True

    def do_GET(self):
        if not self.path.startswith("/gh/"):
            return super().do_GET()
        if not self.auth_ok():
            return
        parts, q = self.gh_path()
        if len(parts) == 3 and parts[0] == "repos":
            return self.send_json(200, {"full_name": f"{parts[1]}/{parts[2]}", "private": True})
        if len(parts) >= 5 and parts[3] == "contents":
            f = DATA / urllib.parse.unquote("/".join(parts[4:]))
            if not f.exists():
                return self.send_json(404, {"message": "Not Found"})
            b = f.read_bytes()
            if "raw" in self.headers.get("Accept", ""):
                self.send_response(200)
                self.end_headers()
                return self.wfile.write(b)
            return self.send_json(200, {"sha": blob_sha(b), "encoding": "base64", "content": base64.encodebytes(b).decode()})
        if len(parts) == 4 and parts[3] == "commits":
            out = []
            if args.git:
                fmt = "%H%x1f%aI%x1f%s"
                log = subprocess.run(["git", "-C", str(args.git), "log", "-30", f"--format={fmt}", "main"], capture_output=True, text=True).stdout
                for line in log.splitlines():
                    sha, date, msg = line.split("\x1f")
                    out.append({"sha": sha, "html_url": f"https://github.com/x/y/commit/{sha}", "commit": {"message": msg, "author": {"date": date}}})
            return self.send_json(200, out)
        self.send_json(404, {"message": "Not Found"})

    def do_PUT(self):
        if not self.path.startswith("/gh/") or not self.auth_ok():
            return
        parts, _ = self.gh_path()
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        f = DATA / urllib.parse.unquote("/".join(parts[4:]))
        cur = blob_sha(f.read_bytes()) if f.exists() else None
        if cur and body.get("sha") != cur:
            return self.send_json(409, {"message": f"{f.name} does not match {body.get('sha')}"})
        b = base64.b64decode(body["content"])
        json.loads(b)  # moet geldige json zijn
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_bytes(b)
        LOG.append((time.strftime("%H:%M:%S"), f.name, body["message"]))
        print("  commit:", body["message"])
        self.send_json(200, {"content": {"sha": blob_sha(b)}, "commit": {"sha": "0" * 40}})


ThreadingHTTPServer(("127.0.0.1", args.port), H).serve_forever()
