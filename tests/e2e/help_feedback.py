"""Help page offline + the scan '?' jump + feedback queue. Apps Script is intercepted: no real POST ever goes out.
Run: python3 -m http.server 8765 (from the parent of the repo), then python tests/e2e/help_feedback.py"""
import asyncio, json, os
from playwright.async_api import async_playwright
B = os.environ.get("BASE", "http://localhost:8765/service-tech-ui/")

async def main():
    out = {"errors": [], "posts": []}
    async with async_playwright() as p:
        br = await p.chromium.launch(); ctx = await br.new_context(); pg = await ctx.new_page()
        pg.on("pageerror", lambda e: out["errors"].append(str(e)))
        async def intercept(route):
            out["posts"].append(route.request.post_data)
            await route.fulfill(status=200, body='{"ok":true}')
        await ctx.route("https://script.google.com/**", intercept)
        await pg.goto(B + "index.html"); await pg.evaluate("navigator.serviceWorker.ready"); await pg.reload(); await pg.wait_for_timeout(2500)
        await ctx.set_offline(True)
        # Help tab offline
        await pg.goto(B + "index.html"); await pg.click("a.tile[href='help.html']"); await pg.wait_for_timeout(800)
        secs = await pg.eval_on_selector_all("details.help-sec > summary", "els => els.map(e => e.textContent.trim())")
        out["sections"] = secs
        out["tools_listed"] = await pg.eval_on_selector_all("#help-tools li", "els => els.length")
        out["version_label"] = await pg.inner_text(".app-version")
        out["all_closed"] = await pg.eval_on_selector_all("details.help-sec", "els => els.every(e => !e.open)")
        # "?" jump from the scan step
        await pg.goto(B + "call.html"); await pg.wait_for_timeout(800)
        q = pg.locator(".scan-help-link").first
        out["q_visible"] = await q.is_visible()
        await q.click(); await pg.wait_for_timeout(800)
        out["jump_url"] = pg.url
        out["scan_open"] = await pg.eval_on_selector("#scan", "e => e.open")
        out["scan_steps_in_help"] = await pg.eval_on_selector_all("#scan ol li strong", "els => els.map(e => e.textContent)")
        # Feedback offline -> queued, then online -> sent (intercepted)
        await pg.goto(B + "help.html#feedback"); await pg.wait_for_timeout(500)
        await pg.fill("#feedback-msg", "Help page test"); await pg.click("#feedback-form button[type=submit]"); await pg.wait_for_timeout(500)
        out["offline_status"] = await pg.inner_text("#feedback-status")
        out["queued"] = await pg.evaluate("JSON.parse(localStorage.getItem('serviceTechFeedbackQueue_v1')||'[]').length")
        await ctx.set_offline(False); await pg.evaluate("window.dispatchEvent(new Event('online'))"); await pg.wait_for_timeout(1500)
        out["queued_after"] = await pg.evaluate("JSON.parse(localStorage.getItem('serviceTechFeedbackQueue_v1')||'[]').length")
        await br.close()
    bodies = [json.loads(b) for b in out["posts"] if b]
    out["ok"] = (len(out["sections"]) == 9 and out["tools_listed"] >= 10 and out["all_closed"] and out["q_visible"]
                 and out["jump_url"].endswith("help.html#scan") and out["scan_open"]
                 and out["scan_steps_in_help"] == ["Photo", "Crop", "Reading", "Check", "Done"]
                 and "Queued" in out["offline_status"] and out["queued"] == 1 and out["queued_after"] == 0
                 and len(bodies) == 1 and sorted(bodies[0]) == ["message", "type", "version"] and bodies[0]["type"] == "feedback"
                 and not out["errors"])
    print(json.dumps(out, indent=1))

asyncio.run(main())
