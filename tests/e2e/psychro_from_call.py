"""Call wizard Readings -> 'Analyze in Psychrometrics' -> psychro.html prefilled -> back to the call, offline.
Run: python3 -m http.server 8765 (from the parent of the repo), then python tests/e2e/psychro_from_call.py"""
import asyncio, json, os
from urllib.parse import urlparse
from playwright.async_api import async_playwright
B = os.environ.get("BASE", "http://localhost:8765/service-tech-ui/")
ORIGIN = urlparse(B).netloc

async def main():
    out = {"errors": [], "off_origin": []}; ok = []
    def chk(n, c): ok.append((n, bool(c)))
    async with async_playwright() as p:
        br = await p.chromium.launch(); ctx = await br.new_context(viewport={"width": 390, "height": 844})
        ctx.on("request", lambda r: out["off_origin"].append(r.url) if urlparse(r.url).scheme in ("http", "https") and urlparse(r.url).netloc != ORIGIN else None)
        pg = await ctx.new_page(); pg.on("pageerror", lambda e: out["errors"].append(str(e)))
        await pg.goto(B + "index.html"); await pg.evaluate("navigator.serviceWorker.ready"); await pg.reload(); await pg.wait_for_timeout(2500)
        await ctx.set_offline(True)
        await pg.goto(B + "psychro.html"); await pg.evaluate("localStorage.clear()")
        await pg.fill("#retDb", "80"); await pg.fill("#retHum", "40")  # older psychro values must not mix in
        await pg.goto(B + "call.html"); await pg.wait_for_timeout(600)
        await pg.fill("#site", "Store 12"); await pg.click("[data-step=readings]"); await pg.wait_for_timeout(200)
        chk("button on Readings", await pg.is_visible("#psy-link"))
        await pg.fill("#supplyTemp", "55"); await pg.fill("#returnTemp", "75"); await pg.wait_for_timeout(100)
        chk("href carries dry bulbs", (await pg.get_attribute("#psy-link", "href")).endswith("from=call&retDb=75&supDb=55"))
        await pg.click("#psy-link"); await pg.wait_for_timeout(700)
        vals = await pg.evaluate("['retDb','retHum','supDb','supHum'].map(k => document.getElementById(k).value)")
        out["vals"] = vals
        chk("prefilled, old RH cleared", vals == ["75", "", "55", ""])
        chk("back-to-call visible", await pg.is_visible("#psy-back-call"))
        chk("note asks for humidity", "RH (%)" in await pg.inner_text("#psy-from-call-note"))
        chk("url cleaned", pg.url.endswith("psychro.html?from=call"))
        await pg.fill("#retHum", "50"); await pg.click("#psy-next"); await pg.fill("#supHum", "90"); await pg.click("#psy-next"); await pg.click("#psy-next"); await pg.wait_for_timeout(300)
        chk("results render", await pg.locator("svg.psy-chart").count() == 1 and "Return" in await pg.inner_text("#psy-results"))
        await pg.reload(); await pg.wait_for_timeout(500)
        chk("reload keeps edits", await pg.eval_on_selector("#retHum", "e => e.value") == "50")
        await pg.click("#psy-back-call"); await pg.wait_for_timeout(700)
        chk("back on the same call (Readings)", await pg.is_visible("#panel-readings") and await pg.eval_on_selector("#supplyTemp", "e => e.value") == "55" and await pg.eval_on_selector("#site", "e => e.value") == "Store 12")
        await br.close()
    out["failed"] = [n for n, c in ok if not c]; out["checks"] = len(ok)
    out["ok"] = not out["failed"] and not out["errors"] and not out["off_origin"]
    print(json.dumps(out, indent=1))
asyncio.run(main())
