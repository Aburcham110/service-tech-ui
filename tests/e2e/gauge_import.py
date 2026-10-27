"""Gauge report import, fully offline: pick -> match columns -> check -> 'Looks right' -> fill + calculate,
on SH/Subcool and on the call card, plus the Android share target. Uses SYNTHETIC fixtures only.
Asserts zero off-origin requests and that pdf.js / fflate load only when a PDF / XLSX is opened.
Run: python3 -m http.server 8765 (from the parent of the repo), then python tests/e2e/gauge_import.py"""
import asyncio, json, os
from urllib.parse import urlparse
from playwright.async_api import async_playwright
B = os.environ.get("BASE", "http://localhost:8765/service-tech-ui/")
FX = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "fixtures", "gauge")
F = lambda n: os.path.join(FX, n)
ORIGIN = urlparse(B).netloc

async def main():
    out = {"errors": [], "off_origin": [], "vendor_loads": []}
    async with async_playwright() as p:
        br = await p.chromium.launch(); ctx = await br.new_context(viewport={"width": 390, "height": 844})
        def on_req(r):
            u = urlparse(r.url)
            if u.scheme in ("http", "https") and u.netloc != ORIGIN: out["off_origin"].append(r.url)
            if "/vendor/" in r.url: out["vendor_loads"].append((out.get("phase"), r.url.rsplit("/", 1)[-1]))
        ctx.on("request", on_req)
        await ctx.route("https://script.google.com/**", lambda route: route.fulfill(status=200, body='{"ok":true}'))
        pg = await ctx.new_page(); pg.on("pageerror", lambda e: out["errors"].append(str(e)))
        await pg.goto(B + "index.html"); await pg.evaluate("navigator.serviceWorker.ready"); await pg.reload(); await pg.wait_for_timeout(2500)
        out["vendor_loads"].clear()  # SW install precache is expected; count only page loads below
        await ctx.set_offline(True)
        T = B + "tool.html?id=superheat-subcool"

        async def to_step1(brand, path):
            await pg.click(".gi-open"); await pg.select_option("#gi-brand", brand)
            await pg.set_input_files("#gi-file", path); await pg.wait_for_timeout(1500)

        async def map_fields(m):
            for fid, (col, unit) in m.items():
                await pg.select_option(f".gi-map[data-field={fid}] .gi-col", col)
                if unit: await pg.select_option(f".gi-map[data-field={fid}] .gi-unit", unit)
            out["last_units"] = await pg.eval_on_selector_all(".gi-map", "ws => Object.fromEntries(ws.map(w => [w.dataset.field, (w.querySelector('.gi-unit') || {}).value]))")
            await pg.click(".gi-save"); await pg.wait_for_timeout(300)

        async def preview():
            return await pg.eval_on_selector_all("table.gi-preview tr", "trs => trs.map(t => [t.dataset.field, t.querySelector('.gi-val').textContent, t.classList.contains('gi-flag')])")

        # --- A. SH/Subcool, CSV psig/°F (generic mapper, Mantooth chosen) ---
        out["phase"] = "csv"
        await pg.goto(T); await pg.wait_for_timeout(800)
        out["a_manual_inputs_present"] = await pg.locator("[data-field=suctionPsig]").count() == 1
        await to_step1("mantooth", F("synthetic-log-psig-F.csv"))
        out["a_step2"] = await pg.inner_text(".gi-title")
        await map_fields({"suctionPsig": ("Low Pressure (psig)", None), "dischargePsig": ("High Pressure (psig)", None),
                          "suctionTemp": ("T1 (°F)", None), "liquidTemp": ("T2 (°F)", None), "refrigerant": ("Refrigerant", None), "timestamp": ("Time", None)})
        out["a_autounit"] = out["last_units"]["suctionPsig"]
        out["a_step3"] = await pg.inner_text(".gi-title"); out["a_rowtext"] = await pg.inner_text(".gi-rowtext")
        out["a_preview"] = await preview()
        await pg.click(".gi-ok"); await pg.wait_for_timeout(500)
        out["a_fields"] = await pg.evaluate("['suctionPsig','suctionTemp','liquidPsig','liquidTemp','refrigerant'].map(k => document.querySelector('[data-field='+k+']').value)")
        out["a_out"] = await pg.inner_text("#out") if await pg.locator("#out").count() else await pg.inner_text("pre.out")
        out["a_done"] = await pg.inner_text(".gi-hint")
        # mapping remembered for this brand: next import skips step 2
        await pg.goto(T); await pg.wait_for_timeout(800)
        await pg.click(".gi-open"); out["a_brand_remembered"] = await pg.eval_on_selector("#gi-brand", "e => e.value")
        await pg.set_input_files("#gi-file", F("synthetic-log-psig-F.csv")); await pg.wait_for_timeout(800)
        out["a_reuse_title"] = await pg.inner_text(".gi-title")
        out["vendor_after_csv"] = list(out["vendor_loads"])

        # --- B. XLSX (lazy fflate) and PDF (lazy pdf.js) ---
        out["phase"] = "xlsx"
        await pg.goto(T); await pg.wait_for_timeout(800)
        await to_step1("navac", F("synthetic-report.xlsx"))
        await map_fields({"suctionPsig": ("Suction (psig)", None), "dischargePsig": ("Discharge (psig)", None), "suctionTemp": ("Suction temp (°F)", None), "liquidTemp": ("Liquid temp (°F)", None)})
        out["b_xlsx_preview"] = await preview()
        await pg.click(".gi-ok"); await pg.wait_for_timeout(400)
        out["b_xlsx_suction"] = await pg.eval_on_selector("[data-field=suctionPsig]", "e => e.value")
        out["phase"] = "pdf"
        await pg.goto(T); await pg.wait_for_timeout(800)
        await to_step1("fieldpiece", F("synthetic-report.pdf")); await pg.wait_for_timeout(1500)
        out["b_pdf_title"] = await pg.inner_text(".gi-title")
        await map_fields({"suctionPsig": ("Suction pressure", None), "dischargePsig": ("Discharge pressure", None), "suctionTemp": ("Suction line temperature", None), "liquidTemp": ("Liquid line temperature", None), "refrigerant": ("Refrigerant", None)})
        out["b_pdf_preview"] = await preview()
        await pg.click(".gi-ok"); await pg.wait_for_timeout(400)
        out["b_pdf_liquid"] = await pg.eval_on_selector("[data-field=liquidPsig]", "e => e.value")

        # --- C. Call card Readings, kPa/°C semicolon CSV with ambiguous kPa + an unknown unit left unmapped ---
        out["phase"] = "call"
        await pg.goto(B + "call.html"); await pg.wait_for_timeout(800)
        await pg.fill("#refrigerant", "R-410A")
        await pg.click('.step-pill[data-step="readings"]'); await pg.wait_for_timeout(300)
        await to_step1("testo", F("synthetic-kPa-C.csv"))
        await map_fields({"suctionPsig": ("P low", None), "dischargePsig": ("P high", None), "suctionTemp": ("T suction", None), "liquidTemp": ("T liquid", None)})
        out["c_autounits"] = [out["last_units"][k] for k in ("suctionPsig", "dischargePsig", "suctionTemp")]
        out["c_preview"] = await preview()
        await pg.click(".gi-ok"); await pg.wait_for_timeout(500)
        out["c_fields"] = await pg.evaluate("['suctionPsig','suctionTemp','liquidPsig','liquidTemp'].map(k => document.getElementById(k).value)")
        out["c_calc"] = await pg.inner_text("pre.gi-calc")
        await pg.reload(); await pg.wait_for_timeout(800)
        out["c_draft_kept"] = await pg.eval_on_selector("#suctionPsig", "e => e.value")

        # --- D. Share target (Android path): POST to ./share-target while offline, handled by the SW ---
        out["phase"] = "share"
        csv = open(F("synthetic-log-psig-F.csv"), "rb").read().decode("utf-8")
        await pg.goto(B + "index.html"); await pg.wait_for_timeout(500)
        out["d_redirect"] = await pg.evaluate("""async (csv) => { const fd = new FormData(); fd.append('report', new File([csv], 'shared-log.csv', {type: 'text/csv'}));
            const r = await fetch('./share-target', {method: 'POST', body: fd}); return r.url.split('/').pop(); }""", csv)
        await pg.goto(B + "share.html"); await pg.wait_for_timeout(500)
        out["d_share_text"] = (await pg.inner_text("body"))[:200]
        await pg.goto(B + "call.html"); await pg.wait_for_timeout(1200)
        out["d_use_shared"] = await pg.locator("text=Use shared file: shared-log.csv").count()
        await pg.select_option("#gi-brand", "mantooth"); await pg.click("text=Use shared file: shared-log.csv"); await pg.wait_for_timeout(800)
        out["d_title"] = await pg.inner_text(".gi-title")  # mapping saved for mantooth in A -> straight to check
        await pg.goto(B + "call.html"); await pg.wait_for_timeout(1000)
        out["d_consumed"] = await pg.locator("text=Use shared file").count() == 0

        # Help section offline
        await pg.goto(B + "help.html#import"); await pg.wait_for_timeout(500)
        out["help_import_open"] = await pg.eval_on_selector("#import", "e => e.open")
        await br.close()

    v = out["vendor_loads"]
    pv = lambda k: {f: (val, fl) for f, val, fl in out[k]}
    a, c = pv("a_preview"), pv("c_preview")
    out["checks"] = checks = {
        "A csv step2 then step3": out["a_step2"].endswith("Match columns") and out["a_step3"].endswith("Check the readings") and "(last)" in out["a_rowtext"],
        "A auto unit psig": out["a_autounit"] == "psig",
        "A preview": a["suctionPsig"][0].startswith("118.4 psig") and a["dischargePsig"][1] and not a["suctionPsig"][1],
        "A filled": out["a_fields"] == ["118.4", "52.3", "331", "94.8", "R-410A"],
        "A calculated": "uperheat" in out["a_out"] and "ubcool" in out["a_out"],
        "A mapping reused": out["a_brand_remembered"] == "mantooth" and out["a_reuse_title"].endswith("Check the readings"),
        "csv loads no vendor lib": out["vendor_after_csv"] == [],
        "B xlsx": out["b_xlsx_suction"] == "121" and ("xlsx", "fflate.mjs") in v and not any(f.startswith("pdf") for ph, f in v if ph == "xlsx"),
        "B pdf": out["b_pdf_liquid"] == "331" and ("pdf", "pdf.min.mjs") in v and ("pdf", "pdf.worker.min.mjs") in v,
        "C units auto from cells": out["c_autounits"][:3] == ["kPa", "kPa", "°C"],
        "C kPa flagged": c["suctionPsig"][1] and "from 814 kPa" in c["suctionPsig"][0],
        "C filled+calc": out["c_fields"][0] == "118.1" and out["c_fields"][3] == "95" and "uperheat" in out["c_calc"],
        "C draft kept": out["c_draft_kept"] == "118.1",
        "D share target": out["d_redirect"].startswith("share.html") and out["d_use_shared"] == 1 and out["d_title"].endswith("Check the readings") and out["d_consumed"],
        "help": out["help_import_open"],
        "0 off-origin": out["off_origin"] == [],
        "no page errors": not out["errors"],
    }
    out["ok"] = all(checks.values())
    print(json.dumps(out, indent=1, ensure_ascii=False))

asyncio.run(main())
