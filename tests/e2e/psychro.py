"""Psychrometrics screen, fully offline at a phone viewport: home tile, 4 steps, worked example rendered
(density-corrected 31,572 first, standard air 32,296 labeled, SHR 0.80 default / 0.82 alt), Copy text,
check-probes warning, cited BPA note, Help entry. Zero off-origin requests.
Run: python3 -m http.server 8765 (from the parent of the repo), then python tests/e2e/psychro.py"""
import asyncio, json, os
from urllib.parse import urlparse
from playwright.async_api import async_playwright
B = os.environ.get("BASE", "http://localhost:8765/service-tech-ui/")
ORIGIN = urlparse(B).netloc
CAP = "window.__copied=[];Object.defineProperty(navigator,'clipboard',{value:{writeText:t=>{window.__copied.push(t);return Promise.resolve()}}});"

async def main():
    out = {"errors": [], "off_origin": []}; ok = []
    def chk(n, c): ok.append((n, bool(c)))
    async with async_playwright() as p:
        br = await p.chromium.launch(); ctx = await br.new_context(viewport={"width": 390, "height": 844})
        ctx.on("request", lambda r: out["off_origin"].append(r.url) if urlparse(r.url).scheme in ("http", "https") and urlparse(r.url).netloc != ORIGIN else None)
        await ctx.add_init_script(CAP)
        pg = await ctx.new_page(); pg.on("pageerror", lambda e: out["errors"].append(str(e)))
        await pg.goto(B + "index.html"); await pg.evaluate("navigator.serviceWorker.ready"); await pg.reload(); await pg.wait_for_timeout(2500)
        await ctx.set_offline(True)
        await pg.goto(B + "index.html"); await pg.click("a.tile[href='psychro.html']"); await pg.wait_for_timeout(800)
        chk("offline load", await pg.locator("h1").inner_text() == "Psychrometrics")
        vis = lambda: pg.eval_on_selector_all(".psy-panel", "els => els.filter(e => !e.classList.contains('hidden')).map(e => e.id)")
        chk("one step per screen", await vis() == ["panel-return"])
        chk("units on every field", await pg.eval_on_selector_all("label.field > span", "els => els.filter(e => e.closest('section')).every(e => /\\(|Humidity|Pressure from|Airflow measured/.test(e.textContent))"))
        await pg.fill("#retDb", "75"); await pg.fill("#retHum", "50"); await pg.click("#psy-next")
        chk("supply step", await vis() == ["panel-supply"])
        await pg.fill("#supDb", "55"); await pg.fill("#supHum", "90"); await pg.click("#psy-next")
        chk("air step, supply default", await pg.input_value("#airflowAt") == "supply")
        await pg.fill("#pressureValue", "1000"); await pg.fill("#cfm", "1200"); await pg.click("#psy-next"); await pg.wait_for_timeout(300)
        txt = lambda k: pg.locator(f"#psy-results tr[data-k='{k}'] td").inner_text()
        rows = await pg.eval_on_selector_all("#psy-capacity tr", "els => els.map(e => e.dataset.k)")
        chk("density first", rows[:2] == ["total-density", "total-std"])
        chk("density 31,572", "31,572 Btu/h" in await txt("total-density"))
        chk("std 32,296", "32,296 Btu/h" in await txt("total-std"))
        chk("std labeled", "Standard air" in await pg.locator("#psy-results tr[data-k='total-std'] th").inner_text())
        chk("sensible 25,920", "25,920" in await txt("sensible")); chk("latent 5,766", "5,766" in await txt("latent"))
        chk("SHR 0.80", await txt("shr") == "0.80"); chk("alt SHR 0.82 labeled", await txt("shr-alt") == "0.82")
        chk("coil dp 52.1", "52.1" in await txt("coil-dp"))
        chk("return wb 62.4", "62.4 °F" in await pg.locator("#psy-ret tr:nth-child(2) td").inner_text())
        chk("no warnings/hints", await pg.locator("#psy-warnings, #psy-hints").count() == 0)
        await pg.click("#psy-copy"); await pg.wait_for_timeout(200)
        cp = await pg.evaluate("window.__copied[0]||''"); out["copied"] = cp
        chk("copy", "Total 31,572 Btu/h" in cp and "SHR 0.80" in cp)
        # cited hints + warning
        await pg.click(".step-pill[data-step='air']"); await pg.fill("#tesp", "0.8"); await pg.fill("#ratedTons", "2")
        await pg.click(".step-pill[data-step='supply']"); await pg.fill("#supDb", "80"); await pg.click(".step-pill[data-step='results']"); await pg.wait_for_timeout(300)
        chk("check probes warning", "Check probes" in await pg.locator("#psy-warnings").inner_text())
        hrefs = await pg.eval_on_selector_all("#psy-hints a", "els => els.map(e => e.href)")
        chk("2 BPA notes", len(hrefs) == 2 and all("bpa.gov" in h for h in hrefs))
        await pg.reload(); await pg.wait_for_timeout(600)
        chk("values remembered", await pg.input_value("#retDb") == "75")
        await pg.goto(B + "help.html#psychro"); await pg.wait_for_timeout(500)
        chk("help entry open", await pg.evaluate("document.getElementById('psychro').open"))
        out["cache"] = await pg.evaluate("caches.keys()")
        await br.close()
    out["failed"] = [n for n, c in ok if not c]; out["checks"] = len(ok)
    out["ok"] = not out["failed"] and not out["errors"] and not out["off_origin"]
    out.pop("copied")
    print(json.dumps(out, indent=1))

asyncio.run(main())
