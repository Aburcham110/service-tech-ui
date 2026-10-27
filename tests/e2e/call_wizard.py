"""Call wizard upgrades, fully offline: header (WO, remembered tech, start stamp), units on every reading,
inline SH/SC identical to the SH/Subcool tool, amps % of plate RLA/FLA with source (none without plate),
end stamp + total time on Close, phrase chips (___ selected), Copy text, draft persists. Zero off-origin requests.
Run: python3 -m http.server 8765 (from the parent of the repo), then python tests/e2e/call_wizard.py"""
import asyncio, json, os, re
from urllib.parse import urlparse
from playwright.async_api import async_playwright
B = os.environ.get("BASE", "http://localhost:8765/service-tech-ui/")
ORIGIN = urlparse(B).netloc
CAP = "window.__copied=[];Object.defineProperty(navigator,'clipboard',{value:{writeText:t=>{window.__copied.push(t);return Promise.resolve()}}});"

async def main():
    out = {"errors": [], "off_origin": []}; ok = []
    def chk(name, cond): ok.append((name, bool(cond)))
    async with async_playwright() as p:
        br = await p.chromium.launch(); ctx = await br.new_context(viewport={"width": 390, "height": 844})
        ctx.on("request", lambda r: out["off_origin"].append(r.url) if urlparse(r.url).scheme in ("http", "https") and urlparse(r.url).netloc != ORIGIN else None)
        await ctx.route("https://script.google.com/**", lambda route: route.fulfill(status=200, body='{"ok":true}'))
        await ctx.add_init_script(CAP)
        pg = await ctx.new_page(); pg.on("pageerror", lambda e: out["errors"].append(str(e)))
        pg.on("dialog", lambda d: asyncio.ensure_future(d.accept()))
        await pg.goto(B + "index.html"); await pg.evaluate("navigator.serviceWorker.ready"); await pg.reload(); await pg.wait_for_timeout(2500)
        await ctx.set_offline(True)

        # tool reference numbers
        await pg.goto(B + "tool.html?id=superheat-subcool"); await pg.wait_for_timeout(800)
        for k, v in {"refrigerant": "R-410A", "suctionPsig": "118.4", "suctionTemp": "52.3", "liquidPsig": "331", "liquidTemp": "94.8"}.items():
            el = pg.locator(f"[data-field={k}]")
            if await el.evaluate("e => e.tagName") == "SELECT": await el.select_option(v)
            else: await el.fill(v)
        await pg.click("button:has-text('Calculate')"); await pg.wait_for_timeout(400)
        tool = await pg.inner_text("#out") if await pg.locator("#out").count() else await pg.inner_text("pre.out")
        tsh = re.search(r"Superheat: ([\d.-]+) °F", tool).group(1); tsc = re.search(r"Subcooling: ([\d.-]+) °F", tool).group(1)
        out["tool"] = [tsh, tsc]

        C = B + "call.html"
        await pg.goto(C); await pg.wait_for_timeout(800)
        st = await pg.eval_on_selector("#startTime", "e => e.value"); sd = await pg.eval_on_selector("#startDate", "e => e.value")
        chk("start auto-stamped", re.fullmatch(r"\d\d:\d\d", st) and re.fullmatch(r"\d{4}-\d\d-\d\d", sd))
        await pg.fill("#workOrder", "WO-1182"); await pg.fill("#techName", "Arthur")
        await pg.fill("#startTime", "23:40")  # edited start
        await pg.fill("#refrigerant", "R-410A")
        await pg.click("[data-step=readings]"); await pg.wait_for_timeout(200)
        labels = await pg.eval_on_selector_all("#panel-readings label.field > span", "s => s.map(x => x.textContent)")
        out["labels"] = labels
        chk("units on every reading", labels and all(re.search(r"\((psig|°F|A|V)\)$", l) for l in labels))
        chk("one step per screen", await pg.is_hidden("#panel-open") and await pg.is_visible("#panel-readings"))
        await pg.fill("#suctionPsig", "118.4"); await pg.fill("#suctionTemp", "52.3"); await pg.fill("#liquidPsig", "331")
        chk("SH/SC waits for all fields", await pg.get_attribute("#shsc-inline", "data-state") == "incomplete")
        await pg.fill("#liquidTemp", "94.8"); await pg.wait_for_timeout(150)
        sh = await pg.inner_text("#shsc-inline"); out["shsc"] = sh
        chk("inline SH = tool", f"Superheat: {tsh} °F" in sh)
        chk("inline SC = tool", f"Subcool: {tsc} °F" in sh)
        chk("no invented cue", not re.search(r"target|normal|too (low|high)|band", sh, re.I))
        await pg.fill("#amps", "8.6"); await pg.wait_for_timeout(100)
        chk("no plate -> no %", await pg.is_hidden("#amps-pct"))
        await pg.fill("#fla", "10"); await pg.wait_for_timeout(100)
        ap = await pg.inner_text("#amps-pct"); out["amps"] = ap
        chk("amps % with source", "86%" in ap and "RLA/FLA typed on the call card" in ap)
        await pg.fill("#voltage", "236") if await pg.locator("#voltage").count() else None

        await pg.click("[data-step=mid]"); await pg.wait_for_timeout(200)
        await pg.click(".phrase-chips[data-for=did] .phrase-chip:has-text('Leak checked')")
        await pg.click(".phrase-chips[data-for=did] .phrase-chip:has-text('Evacuated to ___ microns')")
        sel = await pg.evaluate("(() => { const t = document.activeElement; return [t.id, t.value, t.value.slice(t.selectionStart, t.selectionEnd)] })()")
        out["did"] = sel
        chk("chips append + ___ selected", sel[0] == "did" and sel[1] == "Leak checked\nEvacuated to ___ microns" and sel[2] == "___")
        await pg.keyboard.type("450")
        chk("still editable", await pg.eval_on_selector("#did", "e => e.value") == "Leak checked\nEvacuated to 450 microns")

        await pg.click("[data-step=close]"); await pg.wait_for_timeout(200)
        et = await pg.eval_on_selector("#endTime", "e => e.value")
        chk("end stamped on Close", re.fullmatch(r"\d\d:\d\d", et))
        chk("close chips are resolution phrases", await pg.locator(".phrase-chips[data-for=fixed] .phrase-chip:has-text('Verified operation after repair')").count() == 1 and await pg.locator(".phrase-chips[data-for=fixed] .phrase-chip:has-text('Adjusted TXV')").count() == 0)
        await pg.click(".phrase-chips[data-for=fixed] .phrase-chip:has-text('Verified operation after repair')")
        chk("total time shown", (await pg.inner_text("#total-time")).startswith("Total time: "))
        for i, (pt, q, n) in enumerate([("Contactor 40A", "1", "OEM equiv"), ("Junk row", "3", ""), ("Filter-drier", "2", "")]):
            await pg.click("#parts-add"); r = pg.locator("#parts-rows .part-row").nth(i)
            await r.locator(".part-part").fill(pt); await r.locator(".part-qty").fill(q)
            if n: await r.locator(".part-note").fill(n)
        q_label = await pg.inner_text("#parts-rows .part-row >> nth=0 >> .part-qty-label") if False else await pg.locator("#parts-rows .part-row").nth(0).inner_text()
        chk("qty has units", "Qty (ea)" in q_label)
        await pg.click("#parts-rows .part-row >> nth=1 >> .part-remove")
        chk("remove row", await pg.locator("#parts-rows .part-row").count() == 2)
        await pg.fill("#endDate", sd); await pg.fill("#endTime", "00:25"); await pg.wait_for_timeout(100)
        tt = await pg.inner_text("#total-time"); out["total"] = tt
        chk("total time crosses midnight", "45 min" in tt and "midnight" in tt)

        await pg.reload(); await pg.wait_for_timeout(800)
        vals = await pg.evaluate("['workOrder','techName','startTime','endTime','did','fixed','fla'].map(k => document.getElementById(k).value)")
        chk("draft persists across reload", vals == ["WO-1182", "Arthur", "23:40", "00:25", "Leak checked\nEvacuated to 450 microns", "Verified operation after repair", "10"])
        chk("parts persist", await pg.locator("#parts-rows .part-row").count() == 2 and await pg.locator("#parts-rows .part-row >> nth=1 >> .part-part").input_value() == "Filter-drier")
        await pg.click("#btn-copy"); await pg.wait_for_timeout(300)
        cp = (await pg.evaluate("window.__copied"))[-1]; out["copy"] = cp
        for s in ["Work order / customer #: WO-1182", "Tech: Arthur", "Start: " + sd + " 23:40", "End: " + sd + " 00:25", "Total time: 45 min (past midnight)",
                  f"Superheat: {tsh} °F", f"Subcool: {tsc} °F", "psig", "Amps: 8.6 A = 86% of 10 A (RLA/FLA typed on the call card)", "Verified operation after repair", "Parts used:\n- Contactor 40A × 1 ea (OEM equiv)\n- Filter-drier × 2 ea"]:
            chk("copy has " + s, s in cp)

        await pg.click("#btn-reset"); await pg.wait_for_timeout(300)
        chk("tech remembered after clear", await pg.eval_on_selector("#techName", "e => e.value") == "Arthur")
        chk("parts cleared", await pg.locator("#parts-rows .part-row").count() == 0)
        chk("WO cleared", await pg.eval_on_selector("#workOrder", "e => e.value") == "")
        chk("start re-stamped", re.fullmatch(r"\d\d:\d\d", await pg.eval_on_selector("#startTime", "e => e.value")))
        await br.close()
    chk("no page errors", not out["errors"]); chk("0 off-origin", not out["off_origin"])
    out["failed"] = [n for n, c in ok if not c]; out["checks"] = len(ok); out["ok"] = not out["failed"]
    print(json.dumps(out, indent=1, ensure_ascii=False))
asyncio.run(main())
