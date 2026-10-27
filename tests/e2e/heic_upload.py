"""Offline HEIC upload test (Playwright, Chromium; serve like plate_photos.py).

Precaches via the service worker, goes OFFLINE, then for each tests/fixtures/plates-heic/*.heic:
uploads the matching JPEG and the HEIC (as an Android gallery pick: no extension, empty MIME type,
so detection is by ftyp magic bytes) via Upload photo, and compares the parsed fields.
Also: the decoder module is not requested for JPEGs, is served from the SW cache for HEIC,
a truncated (corrupted) HEIC shows the decode-error message, and no request leaves the origin.
"""
import io, json, os, sys, glob
from PIL import Image
import pillow_heif
pillow_heif.register_heif_opener()
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

B = os.environ.get("BASE", "http://localhost:8765/service-tech-ui/")
ORIGIN = "{0.scheme}://{0.netloc}".format(urlsplit(B))
HERE = os.path.dirname(os.path.abspath(__file__))
HEIC = sorted(glob.glob(os.path.join(HERE, "..", "fixtures", "plates-heic", "*.heic")))
JPG = os.path.join(HERE, "..", "fixtures", "plates")
SEL = ".plate-scan input.plate-upload-input"
DEC = "/vendor/libheif/libheif-bundle.mjs"
R = {"photos": {}, "off_origin": [], "errors": []}
with sync_playwright() as p:
    br = p.chromium.launch(); ctx = br.new_context()
    def rt(route):
        u = route.request.url
        if not u.startswith(ORIGIN + "/") and not u.startswith(("data:", "blob:")):
            R["off_origin"].append(u); return route.abort()
        route.continue_()
    ctx.route("**/*", rt)
    ctx.add_init_script('globalThis.__plateScanOpts = {"cropStep": false}')
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: R["errors"].append(str(e)))
    pg.goto(B); pg.wait_for_function("navigator.serviceWorker.controller!==null", timeout=60000)
    pg.wait_for_function("document.getElementById('offline-indicator').dataset.state==='ready'", timeout=120000)
    R["cache"] = pg.evaluate("caches.keys()")
    R["decoder_precached"] = pg.evaluate(
        "(async()=>{const c=await caches.open((await caches.keys())[0]); const r=await c.match(new URL('vendor/libheif/libheif-bundle.mjs', location.href).href); return r?(await r.arrayBuffer()).byteLength:0})()")
    ctx.set_offline(True)

    def upload(files):
        reqs = []
        h = lambda r: reqs.append([r.url, r.response().from_service_worker if r.response() else None])
        pg.goto(B + "tool.html?id=nameplate-faults"); pg.wait_for_selector(SEL, state="attached")
        pg.on("requestfinished", h)
        pg.set_input_files(SEL, files)
        pg.wait_for_selector(".plate-confirm, .plate-status.plate-format-error", timeout=300000)
        pg.remove_listener("requestfinished", h)
        box = ".plate-scan"
        return {
            "heic": pg.evaluate(f"document.querySelector('{box}').__lastHeic"),
            "fields": {k: v.get("value") for k, v in ((pg.evaluate(f"document.querySelector('{box}').__lastParse") or {}).get("fields") or {}).items()} if pg.query_selector(".plate-confirm") else None,
            "form": pg.eval_on_selector_all(".plate-form input", "es=>Object.fromEntries(es.map(e=>[e.name,e.value]))") if pg.query_selector(".plate-confirm") else None,
            "error": pg.inner_text(".plate-status") if pg.query_selector(".plate-status.plate-format-error") else None,
            "decoder_requests": [r for r in reqs if DEC in r[0]],
        }

    for h in HEIC:
        name = os.path.splitext(os.path.basename(h))[0]
        jpg = upload(os.path.join(JPG, name + ".jpg"))
        data = open(h, "rb").read()
        heic = upload({"name": "IMG_20261026_" + name, "mimeType": "", "buffer": data})
        # Reference: the same HEIC decoded off-browser by pillow-heif (libheif) to lossless PNG.
        buf = io.BytesIO(); Image.open(h).convert("RGB").save(buf, "PNG")
        ref = upload({"name": name + "-ref.png", "mimeType": "image/png", "buffer": buf.getvalue()})
        R["photos"][name] = {"jpeg": jpg, "heic": heic, "ref_png": ref,
                             "fields_match": jpg["form"] == heic["form"] and jpg["form"] is not None,
                             "matches_ref_decode": ref["form"] == heic["form"] and ref["form"] is not None,
                             "diff_vs_jpeg": {k: [jpg["form"].get(k), heic["form"].get(k)] for k in set(jpg["form"] or {}) | set(heic["form"] or {}) if (jpg["form"] or {}).get(k) != (heic["form"] or {}).get(k)}}
    data = open(HEIC[0], "rb").read()
    R["corrupted"] = upload({"name": "IMG_0002.HEIC", "mimeType": "image/heic", "buffer": data[: len(data) * 2 // 5]})
    br.close()

ok = (bool(HEIC) and not R["off_origin"] and R["decoder_precached"] > 0
      and all(v["fields_match"] and v["matches_ref_decode"] and v["heic"]["heic"] and not v["jpeg"]["heic"] and not v["jpeg"]["decoder_requests"]
              and all(sw for _, sw in v["heic"]["decoder_requests"]) for v in R["photos"].values())
      and R["corrupted"]["error"] and "damaged" in R["corrupted"]["error"] and "JPEG" in R["corrupted"]["error"])
R["ok"] = bool(ok)
print(json.dumps(R, indent=1)); sys.exit(0 if ok else 1)
