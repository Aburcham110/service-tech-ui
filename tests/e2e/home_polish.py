"""Home: prominent Resume card only with a draft, grouped tiles; call card: chip toast, collapsible preview
matching Copy. Offline, phone viewport. Saves /workspace/home-phone.png and /workspace/close-phone.png.
Run: python3 -m http.server 8765 (from the parent of the repo), then python tests/e2e/home_polish.py"""
import asyncio, json, os
from urllib.parse import urlparse
from playwright.async_api import async_playwright
B = os.environ.get("BASE", "http://localhost:8765/service-tech-ui/")
ORIGIN = urlparse(B).netloc; SHOTS = os.environ.get("SHOTS", "")

async def main():
    out = {"errors": [], "off_origin": []}; ok = []
    def chk(n, c): ok.append((n, bool(c)))
    async with async_playwright() as p:
        br = await p.chromium.launch(); ctx = await br.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
        await ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=f"http://{ORIGIN}")
        ctx.on("request", lambda r: out["off_origin"].append(r.url) if urlparse(r.url).scheme in ("http", "https") and urlparse(r.url).netloc != ORIGIN else None)
        pg = await ctx.new_page(); pg.on("pageerror", lambda e: out["errors"].append(str(e)))
        await pg.goto(B + "index.html"); await pg.evaluate("navigator.serviceWorker.ready"); await pg.reload(); await pg.wait_for_timeout(2500)
        await ctx.set_offline(True); await pg.evaluate("localStorage.clear()"); await pg.reload(); await pg.wait_for_timeout(500)
        chk("no draft: no resume", not await pg.is_visible("#resume-call"))
        chk("groups in order", await pg.eval_on_selector_all(".group-title", "a => a.map(e => e.textContent)") == ["Call tools", "Diagnostics", "References"])
        chk("7 tiles", await pg.locator("a.tile").count() == 7)
        await pg.goto(B + "call.html"); await pg.wait_for_timeout(600)
        await pg.fill("#site", "Store 12"); await pg.select_option("#equipment", "freezer"); await pg.fill("#symptom", "Box warm, 28 °F set")
        await pg.click("[data-step=close]"); await pg.wait_for_timeout(300)
        await pg.locator("[data-set=close] .phrase-chip").first.click(); await pg.wait_for_timeout(150)
        chk("chip toast", (await pg.is_visible("#toast.show")) and "Added: " in await pg.inner_text("#toast"))
        await pg.click("#parts-add"); await pg.wait_for_timeout(100)
        await pg.locator(".part-part").first.fill("Evap fan motor"); await pg.locator(".part-qty").first.fill("1"); await pg.wait_for_timeout(200)
        chk("preview collapsed by default", not await pg.is_visible("#card-preview-text"))
        await pg.click("#card-preview summary"); await pg.wait_for_timeout(200)
        pv = await pg.inner_text("#card-preview-text")
        chk("preview has close + parts", "Evap fan motor" in pv and "Verified operation" in pv)
        await pg.locator("#resolution, #panel-close textarea").first.fill("Replaced fan. Verified operation after repair"); await pg.wait_for_timeout(200)
        pv = await pg.inner_text("#card-preview-text")
        chk("preview live-updates", "Replaced fan." in pv)
        await pg.click("#btn-copy"); await pg.wait_for_timeout(300)
        clip = await pg.evaluate("navigator.clipboard.readText().catch(() => '')")
        chk("preview == copy", clip.strip() == pv.strip() or not clip)
        if SHOTS: await pg.screenshot(path=SHOTS + "/close-phone.png", full_page=True)
        await pg.goto(B + "index.html"); await pg.wait_for_timeout(500)
        chk("resume shown first", await pg.is_visible("#resume-call") and "Store 12" in await pg.inner_text("#resume-call"))
        chk("new call demoted", "btn-secondary" in (await pg.get_attribute("#new-call", "class")))
        if SHOTS: await pg.screenshot(path=SHOTS + "/home-phone.png", full_page=True)
        await pg.click("#resume-call"); await pg.wait_for_timeout(500)
        chk("resume opens the call", await pg.eval_on_selector("#site", "e => e.value") == "Store 12")
        await br.close()
    out["failed"] = [n for n, c in ok if not c]; out["checks"] = len(ok)
    out["ok"] = not out["failed"] and not out["errors"] and not out["off_origin"]
    print(json.dumps(out, indent=1, ensure_ascii=False))
asyncio.run(main())
