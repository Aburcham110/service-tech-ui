"""Browser test: a scan sent to the call card drives Troubleshooting (tree.html), across reloads, offline,
and after hand-edits on the card. With no call card open, Troubleshooting keeps the old behavior.
Serve like plate_photos.py. Usage: python tests/e2e/card_troubleshoot.py [image]
"""
import json, os, sys, glob
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

B = os.environ.get("BASE", "http://localhost:8765/service-tech-ui/")
ORIGIN = "{0.scheme}://{0.netloc}".format(urlsplit(B))
HERE = os.path.dirname(os.path.abspath(__file__))
IMG = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "fixtures", "plates", "fujitsu-asug15lzas.jpg")
R = {"off_origin": [], "errors": [], "checks": {}}
def check(name, ok, info=None):
    R["checks"][name] = {"ok": bool(ok), "info": info}

with sync_playwright() as p:
    br = p.chromium.launch(); ctx = br.new_context(viewport={"width": 400, "height": 850})
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
    ctx.set_offline(True)

    def tree_state():
        pg.wait_for_selector("#tree-unit")
        pg.wait_for_load_state("networkidle"); pg.wait_for_timeout(500)  # manuals index + error codes
        return {
            "header": pg.inner_text("#tree-unit strong"),
            "sub": pg.inner_text(".tree-unit-sub") if pg.query_selector(".tree-unit-sub") else "",
            "source": pg.eval_on_selector("#tree-unit", "e=>e.dataset.source||''"),
            "tree": pg.inner_text("#tree-title"), "pick": pg.input_value("#tree-pick"),
            "manual": pg.eval_on_selector("#tree-manual", "a=>a.getAttribute('href')") if pg.query_selector("#tree-manual") else None,
            "codes": bool(pg.query_selector("#tree-codes-step")),
        }

    # 1. Scan on the call card and send it to the card (tech corrects the model before confirming).
    pg.goto(B + "call.html"); pg.wait_for_selector("#plate-scan-host .plate-camera-input", state="attached")
    pg.set_input_files("#plate-scan-host .plate-camera-input", IMG)
    pg.wait_for_selector(".plate-confirm", timeout=300000)
    pg.fill('.plate-form input[name="model"]', "ASUG15LZAS")
    if pg.query_selector('.plate-form input[name="brand"]'): pg.fill('.plate-form input[name="brand"]', "Fujitsu")
    for n in ["model", "serial"]:
        if pg.locator(f'[data-looks-right="{n}"]').count() and pg.input_value(f'.plate-form input[name="{n}"]'): pg.check(f'[data-looks-right="{n}"]')
    pg.click(".plate-confirm-btn"); pg.wait_for_selector(".scan-done")
    plate_box = pg.input_value("#plate"); R["plate_box"] = plate_box

    # 2. Open Troubleshooting (the home tile: bare tree.html), then reload.
    pg.goto(B + "tree.html"); a = tree_state()
    pg.reload(); b = tree_state()
    R["after_send"], R["after_reload"] = a, b
    check("tree uses the card's plate", a["header"].endswith("ASUG15LZAS") and a["source"] == "call-card" and a["pick"] == "mini-split", a)
    check("manual link + error codes for the card's model", a["manual"] and a["codes"], a)
    check("reload: tree and header still match", a == b, b)
    # Call card's own Troubleshooting link lands on the same thing.
    pg.goto(B + "call.html"); pg.wait_for_timeout(500)
    pg.goto(B + pg.eval_on_selector("#tree-link", "a=>a.getAttribute('href')")); c = tree_state()
    check("call card link matches the tab", c == a, c)

    # 3. Hand-edit the card: model in Data plate, refrigerant field. Troubleshooting follows, also after reload.
    pg.goto(B + "call.html"); pg.wait_for_selector("#plate")
    pg.fill("#plate", plate_box.replace("ASUG15LZAS", "ASUG12LZAS")); pg.fill("#refrigerant", "R-32")
    pg.goto(B + "tree.html"); d = tree_state(); pg.reload(); e = tree_state()
    R["after_edit"] = d
    check("hand-edit propagates (model, refrigerant)", d["header"].endswith("ASUG12LZAS") and "R-32" in d["sub"] and d["pick"] == "mini-split", d)
    check("hand-edit survives reload", d == e, e)
    # Brand change by hand: tree re-picks.
    pg.goto(B + "call.html"); pg.wait_for_selector("#plate"); pg.fill("#plate", "Copeland Model RST64C1E-CAV")
    pg.goto(B + "tree.html"); f = tree_state(); R["after_brand_edit"] = f
    check("hand-edited brand re-picks the tree", f["header"] == "Copeland RST64C1E-CAV" and f["pick"] == "compressor", f)

    # 4. No call card open (draft cleared): old behavior (no unit header; last-scanned banner).
    pg.goto(B + "call.html"); pg.wait_for_selector("#btn-reset")
    pg.once("dialog", lambda dl: dl.accept()); pg.click("#btn-reset")
    pg.goto(B + "tree.html?type=walk-in"); pg.wait_for_selector(".tree-step")
    check("no card: old behavior", not pg.query_selector("#tree-unit") and pg.input_value("#tree-pick") == "walk-in" and bool(pg.query_selector("#tree-scanned")),
          pg.inner_text("#tree-root")[:120])
    br.close()
R["ok"] = all(c["ok"] for c in R["checks"].values()) and not R["off_origin"] and not R["errors"]
print(json.dumps(R, indent=1)); sys.exit(0 if R["ok"] else 1)
