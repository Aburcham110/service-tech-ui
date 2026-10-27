"""Psychrometric chart, fully offline at a phone viewport: worked example renders, R/S placed at their
(db, gr) on the axes, process line + dew-point projection, 9 RH lines, redraws on pressure change,
low-temp toggle and auto-extend, full screen. Zero off-origin requests. Saves a screenshot to SHOT.
Run: python3 -m http.server 8765 (from the parent of the repo), then python tests/e2e/psychro_chart.py"""
import asyncio, json, os
from urllib.parse import urlparse
from playwright.async_api import async_playwright
B = os.environ.get("BASE", "http://localhost:8765/service-tech-ui/")
SHOT = os.environ.get("SHOT", "/tmp/psychro-chart.png")
ORIGIN = urlparse(B).netloc
# same mapping as tools/psychro-chart.js (viewBox 360x260, margins l30 r34 t10 b28)
def xy(db, gr, tmin, tmax, grmax): return (30 + (db - tmin) / (tmax - tmin) * 296, 10 + 222 - gr / grmax * 222)

async def main():
    out = {"errors": [], "off_origin": []}; ok = []
    def chk(n, c): ok.append((n, bool(c)))
    async with async_playwright() as p:
        br = await p.chromium.launch(); ctx = await br.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
        ctx.on("request", lambda r: out["off_origin"].append(r.url) if urlparse(r.url).scheme in ("http", "https") and urlparse(r.url).netloc != ORIGIN else None)
        pg = await ctx.new_page(); pg.on("pageerror", lambda e: out["errors"].append(str(e)))
        await pg.goto(B + "index.html"); await pg.evaluate("navigator.serviceWorker.ready"); await pg.reload(); await pg.wait_for_timeout(2500)
        await ctx.set_offline(True)
        await pg.goto(B + "psychro.html"); await pg.evaluate("localStorage.clear()"); await pg.reload(); await pg.wait_for_timeout(500)
        await pg.fill("#retDb", "75"); await pg.fill("#retHum", "50"); await pg.click("#psy-next")
        await pg.fill("#supDb", "55"); await pg.fill("#supHum", "90"); await pg.click("#psy-next")
        await pg.fill("#pressureValue", "1000"); await pg.fill("#cfm", "1200"); await pg.click("#psy-next"); await pg.wait_for_timeout(400)
        svg = pg.locator("svg.psy-chart")
        chk("chart renders offline", await svg.count() == 1)
        a = await svg.evaluate("e => ({p: +e.dataset.psia, tmin: +e.dataset.tmin, tmax: +e.dataset.tmax, gr: +e.dataset.grmax})")
        chk("default range", (a["tmin"], a["tmax"], a["gr"]) == (30, 110, 200)); chk("pressure 1000 ft", abs(a["p"] - 14.1727) < 1e-3)
        for k, db, gr in [("ret", 75, 67.0737), ("sup", 55, 60.0074)]:
            c = await pg.evaluate(f"(() => {{ const c = document.getElementById('psy-pt-{k}'); return [+c.getAttribute('cx'), +c.getAttribute('cy')]; }})()")
            ex = xy(db, gr, 30, 110, 200)
            chk(f"{k} placed", abs(c[0] - ex[0]) < 0.1 and abs(c[1] - ex[1]) < 0.1)
        # visual placement: circle on screen is to the right of 70 °F tick for R, left for S
        chk("process line + arrow", await pg.locator("svg .psy-process[marker-end]").count() == 1)
        dp = await pg.evaluate("+document.querySelector('.psy-dp-proj').getAttribute('x2')")
        chk("dew-point projection at 52.1 °F", abs(dp - xy(52.1246, 0, 30, 110, 200)[0]) < 0.1)
        chk("9 RH lines + sat", await pg.locator("svg .psy-rh-line").count() == 9 and await pg.locator("svg .psy-sat").count() == 1)
        chk("wb + h lines", await pg.locator("svg .psy-wb-line").count() >= 10 and await pg.locator("svg .psy-h-line").count() >= 5)
        chk("chart fits phone width", (await svg.bounding_box())["width"] <= 390)
        await pg.locator("#psy-chart-wrap").screenshot(path=SHOT)
        # full screen
        await pg.click("#psy-zoom"); await pg.wait_for_timeout(200)
        chk("full screen", await pg.evaluate("getComputedStyle(document.getElementById('psy-chart-wrap')).position") == "fixed")
        await pg.click("#psy-zoom"); await pg.wait_for_timeout(200)
        # low-temp toggle
        await pg.check("#psy-lowtemp"); await pg.wait_for_timeout(200)
        chk("low-temp toggle", await pg.evaluate("+document.querySelector('svg.psy-chart').dataset.tmin") == -20)
        await pg.uncheck("#psy-lowtemp")
        # redraw on pressure change
        await pg.click(".step-pill[data-step='air']"); await pg.fill("#pressureValue", "5000"); await pg.click(".step-pill[data-step='results']"); await pg.wait_for_timeout(300)
        p2 = await pg.evaluate("+document.querySelector('svg.psy-chart').dataset.psia")
        chk("redraw at new pressure", abs(p2 - 12.2) < 0.1)
        # walk-in auto-extend
        await pg.click(".step-pill[data-step='return']"); await pg.fill("#retDb", "0"); await pg.fill("#retHum", "80")
        await pg.click(".step-pill[data-step='supply']"); await pg.fill("#supDb", "-10"); await pg.click(".step-pill[data-step='results']"); await pg.wait_for_timeout(300)
        chk("auto-extend below 32 °F", await pg.evaluate("+document.querySelector('svg.psy-chart').dataset.tmin") == -20)
        chk("no comfort/target zones", await pg.evaluate("!/comfort|target|zone/i.test(document.querySelector('svg.psy-chart').outerHTML)"))
        await br.close()
    out["failed"] = [n for n, c in ok if not c]; out["checks"] = len(ok)
    out["ok"] = not out["failed"] and not out["errors"] and not out["off_origin"]
    print(json.dumps(out, indent=1))

asyncio.run(main())
