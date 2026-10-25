"""Offline end-to-end OCR test for the plate scanner (Playwright, Chromium).

Usage: serve the repo's PARENT dir so the site is at http://localhost:8765/service-tech-ui/
  python3 -m http.server 8765   (from the parent dir)
  python tests/e2e/plate_photos.py [--dump] [image ...]

Loads the app, waits for the service worker to precache, goes OFFLINE, aborts and logs
any off-origin request, uploads each photo to the nameplate tool and prints the parsed
fields as JSON. --dump writes each pass's raw OCR text to tests/fixtures/plates/ocr/.
"""
import json, os, sys, glob
from playwright.sync_api import sync_playwright

B = os.environ.get("BASE", "http://localhost:8765/service-tech-ui/")
HERE = os.path.dirname(os.path.abspath(__file__))
FIX = os.path.join(HERE, "..", "fixtures", "plates")
args = [a for a in sys.argv[1:] if not a.startswith("--")]
dump = "--dump" in sys.argv
imgs = args or sorted(glob.glob(os.path.join(FIX, "*.jpg")))
R = {"photos": {}, "off_origin": [], "errors": []}
with sync_playwright() as p:
    br = p.chromium.launch(); ctx = br.new_context()
    def rt(route):
        u = route.request.url
        if not u.startswith(B.split("/service-tech-ui/")[0] + "/") and not u.startswith(("data:", "blob:")):
            R["off_origin"].append(u); return route.abort()
        route.continue_()
    ctx.route("**/*", rt)
    pg = ctx.new_page()
    pg.on("console", lambda m: m.type == "error" and R["errors"].append(m.text))
    pg.on("pageerror", lambda e: R["errors"].append(str(e)))
    pg.goto(B); pg.wait_for_function("navigator.serviceWorker.controller!==null", timeout=60000)
    pg.wait_for_function("document.getElementById('offline-indicator').dataset.state==='ready'", timeout=120000)
    R["cache"] = pg.evaluate("caches.keys()")
    ctx.set_offline(True)
    for img in imgs:
        pg.goto(B + "tool.html?id=nameplate-faults")
        pg.wait_for_selector(".plate-scan input[type=file]", state="attached")
        ls0 = pg.evaluate("JSON.stringify(localStorage)")
        pg.set_input_files(".plate-scan input[type=file]", img)
        pg.wait_for_selector(".plate-confirm", timeout=300000)
        scan = pg.evaluate("document.querySelector('.plate-scan').__lastScan")
        parsed = pg.evaluate("document.querySelector('.plate-scan').__lastParse")
        form = pg.eval_on_selector_all(".plate-form input", "es=>Object.fromEntries(es.map(e=>[e.name,e.value+(e.classList.contains('low-conf')?' [LOW]':'')]))")
        name = os.path.splitext(os.path.basename(img))[0]
        R["photos"][name] = {
            "crop": scan.get("crop"), "angle": scan["angle"], "exif": scan["orientation"], "probes": scan["probes"],
            "form": form, "hints": parsed.get("hints"),
            "notes": {k: v.get("note") for k, v in parsed["fields"].items() if v.get("note")},
            "raw_panel": pg.eval_on_selector(".plate-raw summary", "e=>e.textContent") if pg.query_selector(".plate-raw") else None,
            "localStorage_unchanged": pg.evaluate("JSON.stringify(localStorage)") == ls0,
        }
        if dump:
            d = os.path.join(FIX, "ocr"); os.makedirs(d, exist_ok=True)
            for ps in scan["passes"]:
                open(os.path.join(d, f"{name}.{ps['name'].replace(' ', '-')}.txt"), "w").write(ps["text"])
    br.close()
print(json.dumps(R, indent=1))
