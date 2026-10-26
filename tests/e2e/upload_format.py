"""Browser check for the Upload photo button (Playwright, Chromium; serve like plate_photos.py).

Checks both buttons on the first scan screen, the upload input's attributes, that an
undecodable file (fake HEIC) shows the JPEG/screenshot message, and that no request leaves the origin.
"""
import json, os, sys
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

B = os.environ.get("BASE", "http://localhost:8765/service-tech-ui/")
ORIGIN = "{0.scheme}://{0.netloc}".format(urlsplit(B))
R = {"off_origin": [], "requests_during_upload": []}
with sync_playwright() as p:
    br = p.chromium.launch(); ctx = br.new_context(service_workers="block")
    def rt(route):
        u = route.request.url
        if not u.startswith(ORIGIN + "/") and not u.startswith(("data:", "blob:")):
            R["off_origin"].append(u); return route.abort()
        route.continue_()
    ctx.route("**/*", rt)
    ctx.add_init_script('globalThis.__plateScanOpts = {"cropStep": false}')
    pg = ctx.new_page()
    pg.goto(B + "tool.html?id=nameplate-faults")
    pg.wait_for_selector(".plate-scan .plate-upload-input", state="attached")
    R["buttons"] = pg.eval_on_selector_all(".plate-scan label.btn", "es=>es.map(e=>[e.className,e.textContent,!e.hidden])")
    R["camera_input"] = pg.eval_on_selector(".plate-camera-input", "e=>[e.accept,e.getAttribute('capture')]")
    R["upload_input"] = pg.eval_on_selector(".plate-upload-input", "e=>[e.accept,e.getAttribute('capture')]")
    pg.wait_for_load_state("networkidle")
    pg.on("request", lambda r: R["requests_during_upload"].append(r.url))
    pg.set_input_files(".plate-upload-input", {"name": "IMG_0001.HEIC", "mimeType": "image/heic", "buffer": b"\x00\x00\x00\x18ftypheic" + b"\x00" * 64})
    pg.wait_for_selector(".plate-status.plate-format-error", timeout=30000)
    R["message"] = pg.inner_text(".plate-status")
    R["buttons_after"] = pg.eval_on_selector_all(".plate-scan label.btn", "es=>es.map(e=>!e.hidden)")
    br.close()
ok = (len(R["buttons"]) == 2 and "Take photo" in R["buttons"][0][1] and "btn-primary" in R["buttons"][0][0]
      and "Upload photo" in R["buttons"][1][1] and "btn-secondary" in R["buttons"][1][0]
      and R["upload_input"] == ["image/*,.heic,.heif", None] and R["camera_input"][1] == "environment"
      and "HEIC" in R["message"] and "JPEG" in R["message"] and "screenshot" in R["message"]
      and all(R["buttons_after"]) and not R["off_origin"] and not R["requests_during_upload"])
R["ok"] = ok
print(json.dumps(R, indent=1)); sys.exit(0 if ok else 1)
