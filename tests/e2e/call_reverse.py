"""Reverse flow, fully offline: call -> tree -> 'Add to call notes' (per-step chip, stamped + labeled, dedupe)
-> Back to call; tool -> 'Add results to current call' -> Readings filled (empty only; overwrite needs confirm);
psychro -> results added; no open call -> hint + Start a call. Zero off-origin requests.
Run: python3 -m http.server 8765 (from the parent of the repo), then python tests/e2e/call_reverse.py"""
import asyncio, json, os, re
from urllib.parse import urlparse
from playwright.async_api import async_playwright
B = os.environ.get("BASE", "http://localhost:8765/service-tech-ui/")
ORIGIN = urlparse(B).netloc
KEY = "serviceTechCallDraft_v1"
SH = {"refrigerant": "R-410A", "suctionPsig": "118.4", "suctionTemp": "52.3", "liquidPsig": "331", "liquidTemp": "94.8"}
STAMP = r"\[\d\d:\d\d "

async def main():
    out = {"errors": [], "off_origin": [], "dialogs": []}; ok = []
    def chk(n, c): ok.append((n, bool(c)))
    answer = {"v": False}
    async with async_playwright() as p:
        br = await p.chromium.launch(); ctx = await br.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        ctx.on("request", lambda r: out["off_origin"].append(r.url) if urlparse(r.url).scheme in ("http", "https") and urlparse(r.url).netloc != ORIGIN else None)
        await ctx.route("https://script.google.com/**", lambda route: route.fulfill(status=200, body='{"ok":true}'))
        pg = await ctx.new_page(); pg.set_default_timeout(8000); pg.on("pageerror", lambda e: out["errors"].append(str(e)))
        def dlg(d):
            out["dialogs"].append(d.message)
            asyncio.ensure_future(d.accept() if (d.type == "alert" or answer["v"] or "Clear" in d.message) else d.dismiss())
        pg.on("dialog", dlg)
        draft = lambda: pg.evaluate(f"JSON.parse(localStorage.getItem('{KEY}') || 'null')")
        await pg.goto(B + "index.html"); await pg.evaluate("navigator.serviceWorker.ready"); await pg.reload(); await pg.wait_for_timeout(2500)
        await ctx.set_offline(True)
        await pg.evaluate("localStorage.clear()")

        # A. no open call: hint + Start a call, nothing written
        await pg.goto(B + "tool.html?id=superheat-subcool"); await pg.wait_for_timeout(600)
        chk("no call: no tool button", await pg.locator("#tool-add-call").count() == 0)
        chk("no call: hint with Start a call", await pg.is_visible("#tool-add-call-hint") and await pg.get_attribute("#tool-add-call-hint a", "href") == "call.html")
        await pg.goto(B + "tree.html?type=walk-in"); await pg.wait_for_timeout(500)
        await pg.locator("#tree-root .tree-step .tree-opt").first.click(); await pg.wait_for_timeout(150)
        chk("no call: no step chip", await pg.locator("#tree-step-add").count() == 0)
        chk("no call: no draft written", (await draft()) is None)

        # B. call -> tree -> add -> back
        await pg.goto(B + "call.html"); await pg.wait_for_timeout(600)
        await pg.fill("#site", "Store 12"); await pg.select_option("#equipment", "freezer")
        await pg.click("[data-step=mid]"); await pg.fill("#found", "Box at 18 °F"); await pg.fill("#did", "Checked door gasket"); await pg.wait_for_timeout(150)
        await pg.click("[data-step=readings]"); await pg.fill("#suctionPsig", "120"); await pg.wait_for_timeout(150)  # one reading already typed
        await pg.goto(B + await pg.get_attribute("#tree-link", "href")); await pg.wait_for_timeout(700)
        chk("tree for walk-in", "type=walk-in" in pg.url)
        chk("no chip before an answer", await pg.locator("#tree-step-add").count() == 0)
        first = pg.locator("#tree-root .tree-step .tree-opt").first; flabel = (await first.inner_text()).strip()
        await first.click(); await pg.wait_for_timeout(200)
        chk("step chip shown", await pg.is_visible("#tree-step-add"))
        box = await pg.locator("#tree-step-add").bounding_box(); chk("chip tappable on phone (>=36px)", box and box["height"] >= 36)
        await pg.tap("#tree-step-add"); await pg.tap("#tree-step-add"); await pg.wait_for_timeout(250)  # double tap
        st = await pg.inner_text("#tree-step-add-status"); out["tree_status"] = st
        chk("toast shown", "call" in (await pg.inner_text("#toast")).lower())
        chk("back to call link", await pg.get_attribute("#tree-step-add-status a.back-to-call", "href") == "call.html")
        d = await draft(); out["found_after_tree"] = d["found"]
        fl = d["found"].split("\n")
        chk("existing Found kept", fl[0] == "Box at 18 °F")
        chk("stamped, labeled tree line", len(fl) == 2 and re.match(STAMP + r"Tree: walk-in\] .+ → " + re.escape(flabel) + "$", fl[1]))
        chk("double tap deduped", len(fl) == 2)
        chk("Did untouched", d["did"] == "Checked door gasket")
        # walk to a result and add it
        for _ in range(15):
            if await pg.locator("#tree-add-call").count(): break
            await pg.locator("#tree-root .tree-step .tree-opt").first.click(); await pg.wait_for_timeout(120)
        await pg.click("#tree-step-add"); await pg.wait_for_timeout(150)
        await pg.click("#tree-add-call"); await pg.wait_for_timeout(150)
        await pg.click("#tree-add-call-status a.back-to-call"); await pg.wait_for_timeout(700)
        chk("back on call card", pg.url.endswith("call.html"))
        await pg.click("[data-step=mid]"); await pg.wait_for_timeout(100)
        f = await pg.eval_on_selector("#found", "e => e.value"); out["found_on_card"] = f
        chk("card shows tree notes (orig + step + result + walk)", f.startswith("Box at 18 °F\n") and len(f.split("\n")) == 4 and all(re.match(STAMP + "Tree: walk-in]", l) for l in f.split("\n")[1:]))
        chk("site kept", await pg.evaluate(f"JSON.parse(localStorage.getItem('{KEY}')).site") == "Store 12")

        # C. tool -> add -> readings filled (empty only), overwrite needs confirm
        await pg.goto(B + "tool.html?id=superheat-subcool"); await pg.wait_for_timeout(600)
        chk("tool add disabled before result", await pg.is_disabled("#tool-add-call"))
        for k, v in SH.items():
            el = pg.locator(f"[data-field={k}]")
            if await el.evaluate("e => e.tagName") == "SELECT": await el.select_option(v)
            else: await el.fill(v)
        await pg.click("button:has-text('Calculate')"); await pg.wait_for_timeout(250)
        answer["v"] = False
        await pg.click("#tool-add-call"); await pg.wait_for_timeout(250)
        chk("overwrite asked for differing suction psig", any("120 → 118.4" in m for m in out["dialogs"]))
        d = await draft()
        chk("declined: card reading kept", d["suctionPsig"] == "120")
        chk("empty readings filled", [d[k] for k in ["refrigerant", "suctionTemp", "liquidPsig", "liquidTemp"]] == ["R-410A", "52.3", "331", "94.8"])
        tl = d["found"].split("\n")[-1]; out["tool_line"] = tl
        chk("tool note with units", re.match(STAMP + r"Tool: SH / Subcool\] ", tl) and "Superheat: 12.3 °F" in tl and "Subcooling: 7.9 °F" in tl and "psig" in tl and "APPROX" not in tl)
        st = await pg.inner_text("#tool-add-call-status"); out["tool_status"] = st
        chk("status says filled + kept", "Readings filled" in st and "Kept the card's readings for Suction psig" in st)
        n = len(d["found"].split("\n"))
        answer["v"] = True
        await pg.click("#tool-add-call"); await pg.wait_for_timeout(250)
        d = await draft()
        chk("confirmed: overwritten", d["suctionPsig"] == "118.4")
        chk("tool note not duplicated", len(d["found"].split("\n")) == n)
        await pg.click("#tool-add-call-status a.back-to-call"); await pg.wait_for_timeout(700)
        await pg.click("[data-step=readings]"); await pg.wait_for_timeout(150)
        vals = await pg.evaluate("['suctionPsig','suctionTemp','liquidPsig','liquidTemp','refrigerant'].map(k => document.getElementById(k).value)")
        chk("readings filled on card", vals == ["118.4", "52.3", "331", "94.8", "R-410A"])
        sh = await pg.inner_text("#shsc-inline"); chk("card inline SH/SC matches", "Superheat: 12.3 °F" in sh and "Subcool: 7.9 °F" in sh)

        # D. another tool (labeled note -> Did) and psychro
        await pg.goto(B + "tool.html?id=vacuum-coach"); await pg.wait_for_timeout(500)
        await pg.click("button:has-text('Generate')"); await pg.wait_for_timeout(200)
        await pg.click("#tool-add-call"); await pg.wait_for_timeout(200)
        d = await draft(); out["did"] = d["did"]
        chk("vacuum coach -> Did, appended", d["did"].startswith("Checked door gasket\n") and re.search(STAMP + r"Tool: Vacuum coach\] ", d["did"]))
        await pg.goto(B + "tool.html?id=job-log"); await pg.wait_for_timeout(400)
        chk("non-call tool: no button", await pg.locator("#tool-add-call, #tool-add-call-hint").count() == 0)
        await pg.goto(B + "psychro.html"); await pg.wait_for_timeout(500)
        await pg.fill("#retDb", "75"); await pg.fill("#retHum", "50"); await pg.click("#psy-next")
        await pg.fill("#supDb", "55"); await pg.fill("#supHum", "90"); await pg.click("#psy-next")
        await pg.fill("#pressureValue", "1000"); await pg.fill("#cfm", "1200"); await pg.click("#psy-next"); await pg.wait_for_timeout(300)
        await pg.click("#psy-add-call"); await pg.wait_for_timeout(200)
        d = await draft(); pl = d["found"].split("\n")[-1]; out["psy_line"] = pl
        chk("psychro note", re.match(STAMP + r"Tool: Psychrometrics\] Return Dry bulb 75\.0 °F", pl) and "ΔT 20.0 °F" in pl)
        chk("psychro filled empty supply/return", d["supplyTemp"] == "55" and d["returnTemp"] == "75")
        chk("schema intact", all(k in d for k in ["step", "partsList", "photosReady", "stillSeeing", "fixed"]) and isinstance(d["photosReady"], bool))
        await br.close()
    chk("no page errors", not out["errors"]); chk("0 off-origin", not out["off_origin"])
    out["failed"] = [n for n, c in ok if not c]; out["checks"] = len(ok); out["ok"] = not out["failed"]
    print(json.dumps(out, indent=1, ensure_ascii=False))
asyncio.run(main())
