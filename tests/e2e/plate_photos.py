"""Offline end-to-end OCR test for the plate scanner (Playwright, Chromium).

Usage: serve the repo's PARENT dir so the site is at http://localhost:8765/service-tech-ui/
  python3 -m http.server 8765   (from the parent dir)
  python tests/e2e/plate_photos.py [--dump] [image ...]

Loads the app, waits for the service worker to precache, goes OFFLINE, aborts and logs
any off-origin request, uploads each photo to the nameplate tool and prints the parsed
fields as JSON. --dump writes each pass's raw OCR text to tests/fixtures/plates/ocr/.
"""
import json, os, sys, glob, time
from playwright.sync_api import sync_playwright

B = os.environ.get("BASE", "http://localhost:8765/service-tech-ui/")
from urllib.parse import urlsplit
ORIGIN = "{0.scheme}://{0.netloc}".format(urlsplit(B))
HERE = os.path.dirname(os.path.abspath(__file__))
FIX = os.path.join(HERE, "..", "fixtures", "plates")
args = [a for a in sys.argv[1:] if not a.startswith("--")]
opt = {a.split("=")[0]: (a.split("=", 1)[1] if "=" in a else "1") for a in sys.argv[1:] if a.startswith("--")}
throttle = float(opt.get("--throttle", "0"))  # CPU slowdown factor (e.g. 4 = mid-range phone)
scan_opts = {}
if "--no-early" in opt: scan_opts["earlyStop"] = False
if "--plan" in opt: scan_opts["plan"] = [[p.split(":")[0], int(p.split(":")[1])] for p in opt["--plan"].split(",")]
dump = "--dump" in sys.argv
_c = [float(x) for x in opt["--crop"].split(",")] if "--crop" in opt else None
crop_corners = [_c[i:i + 2] for i in range(0, 8, 2)] if _c else None
imgs = args or sorted(glob.glob(os.path.join(FIX, "*.jpg")))
R = {"photos": {}, "off_origin": [], "errors": []}
with sync_playwright() as p:
    br = p.chromium.launch(); ctx = br.new_context()
    def rt(route):
        u = route.request.url
        if not u.startswith(ORIGIN + "/") and not u.startswith(("data:", "blob:")):
            R["off_origin"].append(u); return route.abort()
        route.continue_()
    ctx.route("**/*", rt)
    # The manual crop step is skipped by default (cropStep:false); --crop=x,y,x,y,x,y,x,y (fractions, TL TR BR BL) applies corners.
    so = dict({"cropStep": False}, **(scan_opts or {}))
    if crop_corners: so.pop("cropStep"); ctx.add_init_script("globalThis.__plateCropCorners = " + json.dumps(crop_corners))
    ctx.add_init_script("globalThis.__plateScanOpts = " + json.dumps(so))
    pg = ctx.new_page()
    pg.on("console", lambda m: m.type == "error" and R["errors"].append(m.text))
    pg.on("pageerror", lambda e: R["errors"].append(str(e)))
    pg.goto(B); pg.wait_for_function("navigator.serviceWorker.controller!==null", timeout=60000)
    pg.wait_for_function("document.getElementById('offline-indicator').dataset.state==='ready'", timeout=120000)
    R["cache"] = pg.evaluate("caches.keys()")
    ctx.set_offline(True)
    if throttle:
        # NOTE: CDP CPU throttling applies to the page's main thread (preprocessing) only;
        # Tesseract's Web Worker is NOT slowed by it. Combine with --cores=1 / scale results.
        pg.context.new_cdp_session(pg).send("Emulation.setCPUThrottlingRate", {"rate": throttle})
    for img in imgs:
        pg.goto(B + "tool.html?id=nameplate-faults")
        pg.wait_for_selector(".plate-scan input[type=file]", state="attached")
        ls0 = pg.evaluate("JSON.stringify(localStorage)")
        t_start = time.time()
        pg.set_input_files(".plate-scan input[type=file]", img)
        pg.wait_for_selector(".plate-confirm", timeout=300000)
        wall_ms = round((time.time() - t_start) * 1000)
        scan = pg.evaluate("document.querySelector('.plate-scan').__lastScan")
        parsed = pg.evaluate("document.querySelector('.plate-scan').__lastParse")
        form = pg.eval_on_selector_all(".plate-form input", "es=>Object.fromEntries(es.map(e=>[e.name,e.value+(e.classList.contains('low-conf')?' [LOW]':'')]))")
        name = os.path.splitext(os.path.basename(img))[0]
        R["photos"][name] = {
            "wall_ms": wall_ms, "timing": scan.get("timing"), "fields": parsed["fields"], "crop": scan.get("crop"), "angle": scan["angle"], "exif": scan["orientation"], "probes": scan["probes"],
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
