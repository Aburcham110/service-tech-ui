"""Call wizard Troubleshooting deep-links to the tree for the equipment type; trees and tool results get
'Add to current call notes' (only with an open call), appended to Found with a confirmation. Offline.
Run: python3 -m http.server 8765 (from the parent of the repo), then python tests/e2e/call_notes.py"""
import asyncio, json, os
from urllib.parse import urlparse
from playwright.async_api import async_playwright
B = os.environ.get("BASE", "http://localhost:8765/service-tech-ui/")
ORIGIN = urlparse(B).netloc

async def walk(pg):
    for _ in range(15):
        if await pg.locator("#tree-add-call, #tree-log").count(): return True
        await pg.locator("#tree-root .tree-step .tree-opt").first.click(); await pg.wait_for_timeout(150)
    return False

async def main():
    out = {"errors": [], "off_origin": []}; ok = []
    def chk(n, c): ok.append((n, bool(c)))
    async with async_playwright() as p:
        br = await p.chromium.launch(); ctx = await br.new_context(viewport={"width": 390, "height": 844})
        ctx.on("request", lambda r: out["off_origin"].append(r.url) if urlparse(r.url).scheme in ("http", "https") and urlparse(r.url).netloc != ORIGIN else None)
        pg = await ctx.new_page(); pg.on("pageerror", lambda e: out["errors"].append(str(e)))
        pg.on("dialog", lambda d: asyncio.ensure_future(d.accept()))
        await pg.goto(B + "index.html"); await pg.evaluate("navigator.serviceWorker.ready"); await pg.reload(); await pg.wait_for_timeout(2500)
        await ctx.set_offline(True)
        await pg.evaluate("localStorage.clear()")
        # no open call: no button
        await pg.goto(B + "tree.html?type=split-ac-hp"); await pg.wait_for_timeout(500)
        chk("tree end reachable", await walk(pg))
        chk("no call -> no add button (tree)", await pg.locator("#tree-add-call").count() == 0)
        await pg.goto(B + "tool.html?id=superheat-subcool"); await pg.wait_for_timeout(600)
        chk("no call -> no add button (tool)", await pg.locator("#tool-add-call").count() == 0)
        # open a call, equipment -> tree link
        await pg.goto(B + "call.html"); await pg.wait_for_timeout(600)
        await pg.fill("#site", "Store 12")
        for eq, tree in [("mini-split", "mini-split"), ("freezer", "walk-in"), ("split", "split-ac-hp")]:
            await pg.select_option("#equipment", eq); await pg.wait_for_timeout(150)
            chk(f"{eq} -> {tree}", (await pg.get_attribute("#tree-link", "href")) == f"tree.html?type={tree}")
        await pg.click("[data-step=mid]"); await pg.fill("#found", "Dirty filter"); await pg.wait_for_timeout(100)
        await pg.goto(B + await pg.get_attribute("#tree-link", "href")); await pg.wait_for_timeout(700)
        chk("tree opened for split", "type=split-ac-hp" in pg.url)
        await walk(pg)
        chk("add button on tree result", await pg.is_visible("#tree-add-call"))
        await pg.click("#tree-add-call"); await pg.wait_for_timeout(200)
        chk("tree confirmation", "Added to the call" in await pg.inner_text("#tree-add-call-status"))
        await pg.goto(B + "tool.html?id=superheat-subcool"); await pg.wait_for_timeout(600)
        chk("tool add disabled before result", await pg.is_disabled("#tool-add-call"))
        for k, v in {"refrigerant": "R-410A", "suctionPsig": "118.4", "suctionTemp": "52.3", "liquidPsig": "331", "liquidTemp": "94.8"}.items():
            el = pg.locator(f"[data-field={k}]")
            if await el.evaluate("e => e.tagName") == "SELECT": await el.select_option(v)
            else: await el.fill(v)
        await pg.click("button:has-text('Calculate')"); await pg.wait_for_timeout(300)
        await pg.click("#tool-add-call"); await pg.wait_for_timeout(200)
        chk("tool confirmation", "Added to the call" in await pg.inner_text("#tool-add-call-status"))
        await pg.goto(B + "call.html")
        await pg.wait_for_timeout(500); await pg.click("[data-step=mid]")
        f = await pg.eval_on_selector("#found", "e => e.value"); out["found"] = f
        lines = f.split("\n")
        chk("found kept + tree + tool appended", lines[0] == "Dirty filter" and lines[1].startswith("Troubleshooting — ") and lines[2].startswith("SH / Subcool: ") and "Superheat" in lines[2])
        await pg.fill("#did", "x"); await pg.wait_for_timeout(100)
        chk("later edits keep notes", "Troubleshooting" in json.loads(await pg.evaluate("localStorage.getItem('serviceTechCallDraft_v1')"))["found"])
        await br.close()
    out["failed"] = [n for n, c in ok if not c]; out["checks"] = len(ok)
    out["ok"] = not out["failed"] and not out["errors"] and not out["off_origin"]
    print(json.dumps(out, indent=1, ensure_ascii=False))
asyncio.run(main())
