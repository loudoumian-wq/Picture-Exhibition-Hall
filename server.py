#!/usr/bin/env python3
"""Photo Gallery Backend - Pure Python, no dependencies."""

import os, sys, json, uuid, mimetypes, re, time
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

PORT       = 8080
BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
ASSETS_DIR = os.path.join(BASE_DIR, "assets")
ALLOWED    = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"}
MAX_SIZE   = 20 * 1024 * 1024
PHOTOS_DB  = os.path.join(BASE_DIR, "photos.json")

os.makedirs(ASSETS_DIR, exist_ok=True)

# ── Data Layer ───────────────────────────────────────────
def load_photos():
    if os.path.exists(PHOTOS_DB):
        with open(PHOTOS_DB, "r", encoding="utf-8") as f:
            data = json.load(f)
            # Ensure all old entries have a category
            changed = False
            for p in data:
                if p.get("category") == "ID Photo": p["category"] = "Portrait"
                if "category" not in p: p["category"] = "Portrait" if "jpg" in p.get("filename","") else "Creative"
                if "person" not in p: p["person"] = "Unknown"
                if "likes" not in p: p["likes"] = 0
                if "sticker" not in p: p["sticker"] = ""
                if "emotion" not in p: p["emotion"] = ""
                if "state" not in p: p["state"] = "published"
                if "featured" not in p: p["featured"] = False
                if "favorite" not in p: p["favorite"] = False
                if "collection" not in p: p["collection"] = ""
                if "timestamp" not in p: p["timestamp"] = int(time.time() * 1000)
            if True: save_photos(data) # Always save to ensure schema is updated
            return data

    caps = {"1.jpg":"痛苦面具","2.jpg":"自信自拍","3.jpg":"电竞回眸","4.jpg":"安详入睡","5.jpg":"神秘仪式"}
    photos = []
    for fn in sorted(os.listdir(ASSETS_DIR)):
        ext = os.path.splitext(fn)[1].lower()
        if ext in ALLOWED and not fn.startswith("."):
            cat = "Portrait" if "jpg" in ext else "Creative"
            photos.append({
                "id": str(uuid.uuid4()), 
                "filename": fn,
                "caption": caps.get(fn, os.path.splitext(fn)[0]), 
                "category": cat,
                "person": "Unknown",
                "likes": 0,
                "sticker": "",
                "emotion": "",
                "state": "published",
                "featured": False,
                "favorite": False,
                "collection": "",
                "timestamp": int(time.time() * 1000)
            })
    save_photos(photos)
    return photos

def save_photos(p):
    with open(PHOTOS_DB, "w", encoding="utf-8") as f:
        json.dump(p, f, ensure_ascii=False, indent=2)

photos = load_photos()

# ── Multipart Parser ────────────────────────────────────
def parse_multipart(body, ct):
    m = re.search(r'boundary=([^\s;]+)', ct)
    if not m: return {}
    boundary = m.group(1).strip('"').encode()
    parts = {}
    for seg in body.split(b'--' + boundary)[1:]:
        if seg.strip() in (b'', b'--', b'--\r\n'): continue
        sep = b'\r\n\r\n' if b'\r\n\r\n' in seg else (b'\n\n' if b'\n\n' in seg else None)
        if not sep: continue
        raw_h, raw_b = seg.split(sep, 1)
        if raw_b.endswith(b'\r\n'): raw_b = raw_b[:-2]
        hs = raw_h.decode('utf-8', errors='replace')
        cd = re.search(r'Content-Disposition:[^\r\n]*', hs, re.I)
        if not cd: continue
        nm = re.search(r'name="([^"]*)"', cd.group(0))
        fn = re.search(r'filename="([^"]*)"', cd.group(0))
        if nm:
            parts[nm.group(1)] = {"data": raw_b, "filename": fn.group(1) if fn else None}
    return parts

# ── Handler ─────────────────────────────────────────────
class H(BaseHTTPRequestHandler):
    def log_message(self, f, *a): pass

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json(self, d, s=200):
        b = json.dumps(d, ensure_ascii=False).encode("utf-8")
        self.send_response(s)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(b)))
        self._cors(); self.end_headers(); self.wfile.write(b)

    def _err(self, m, s=400): self._json({"ok": False, "error": m}, s)

    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/photos":
            self._json({"ok": True, "photos": photos}); return
        fp = os.path.join(BASE_DIR, "index.html" if path in ("/", "/index.html") else path.lstrip("/").replace("/", os.sep))
        rp = os.path.realpath(fp)
        if not rp.startswith(os.path.realpath(BASE_DIR)) or not os.path.isfile(fp):
            self._err("Not found", 404); return
        mime, _ = mimetypes.guess_type(fp)
        with open(fp, "rb") as fh: c = fh.read()
        self.send_response(200)
        self.send_header("Content-Type", mime or "application/octet-stream")
        self.send_header("Content-Length", str(len(c)))
        self.send_header("Cache-Control", "public, max-age=300")
        self._cors(); self.end_headers(); self.wfile.write(c)

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/api/upload": self._upload()
        else: self._err("Not found", 404)

    def do_PUT(self):
        path = urlparse(self.path).path
        if path.startswith("/api/photos/"):
            self._update(path[len("/api/photos/"):])
        else: self._err("Not found", 404)

    def do_DELETE(self):
        path = urlparse(self.path).path
        if path.startswith("/api/photos/"):
            self._delete(path[len("/api/photos/"):])
        else: self._err("Not found", 404)

    def _upload(self):
        global photos
        ct = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in ct: self._err("Bad content type"); return
        ln = int(self.headers.get("Content-Length", 0))
        if ln > MAX_SIZE + 8192: self._err("Too large"); return
        parts = parse_multipart(self.rfile.read(ln), ct)
        if "photo" not in parts: self._err("No photo"); return
        pp = parts["photo"]
        fname = pp.get("filename") or ""
        fdata = pp["data"]
        caption = parts.get("caption", {}).get("data", b"").decode("utf-8", errors="replace").strip() or "Untitled"
        category = parts.get("category", {}).get("data", b"").decode("utf-8", errors="replace").strip() or "Portrait"
        person = parts.get("person", {}).get("data", b"").decode("utf-8", errors="replace").strip() or "Unknown"
        sticker = parts.get("sticker", {}).get("data", b"").decode("utf-8", errors="replace").strip() or ""
        emotion = parts.get("emotion", {}).get("data", b"").decode("utf-8", errors="replace").strip() or ""
        ext = os.path.splitext(fname)[1].lower()
        if ext not in ALLOWED: self._err("Unsupported format"); return
        if len(fdata) > MAX_SIZE: self._err("File too large"); return
        uname = f"{uuid.uuid4().hex[:10]}{ext}"
        with open(os.path.join(ASSETS_DIR, uname), "wb") as fh: fh.write(fdata)
        np = {
            "id": str(uuid.uuid4()), "filename": uname, "caption": caption, "category": category, 
            "person": person, "likes": 0, "sticker": sticker, "emotion": emotion,
            "state": "published", "featured": False, "favorite": False, "collection": "", "timestamp": int(time.time() * 1000)
        }
        photos.append(np)
        save_photos(photos)
        self._json({"ok": True, "photo": np}, 201)

    def _update(self, pid):
        global photos
        ln = int(self.headers.get("Content-Length", 0))
        if ln > MAX_SIZE: self._err("Too large"); return
        try: body = json.loads(self.rfile.read(ln).decode("utf-8"))
        except: self._err("Invalid JSON"); return
        for p in photos:
            if p["id"] == pid:
                if "likes" in body: p["likes"] = body["likes"]
                if "sticker" in body: p["sticker"] = body["sticker"]
                if "caption" in body: p["caption"] = body["caption"]
                if "category" in body: p["category"] = body["category"]
                if "person" in body: p["person"] = body["person"]
                if "emotion" in body: p["emotion"] = body["emotion"]
                if "state" in body: p["state"] = body["state"]
                if "featured" in body: p["featured"] = body["featured"]
                if "favorite" in body: p["favorite"] = body["favorite"]
                if "collection" in body: p["collection"] = body["collection"]
                save_photos(photos)
                self._json({"ok": True, "photo": p}); return
        self._err("Not found", 404)

    def _delete(self, pid):
        global photos
        for i, p in enumerate(photos):
            if p["id"] == pid:
                fp = os.path.join(ASSETS_DIR, p["filename"])
                if os.path.exists(fp): os.remove(fp)
                photos.pop(i)
                save_photos(photos)
                self._json({"ok": True}); return
        self._err("Not found", 404)

if __name__ == "__main__":
    s = HTTPServer(("0.0.0.0", PORT), H)
    try: s.serve_forever()
    except KeyboardInterrupt: s.server_close()
