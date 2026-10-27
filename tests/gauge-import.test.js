import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { unzipSync } from "../vendor/fflate/fflate.mjs";
import * as G from "../tools/gauge-parse.js";

const fx = (n) => new URL("./fixtures/gauge/" + n, import.meta.url);
const txt = (n) => readFileSync(fx(n), "utf8");
const mem = () => { const m = {}; return { getItem: (k) => m[k] ?? null, setItem: (k, v) => { m[k] = String(v); } }; };
const MAP_PSIG = { timestamp: { col: "Time" }, suctionPsig: { col: "Low Pressure (psig)", unit: "psig" }, dischargePsig: { col: "High Pressure (psig)", unit: "psig" },
  suctionTemp: { col: "T1 (°F)", unit: "°F" }, liquidTemp: { col: "T2 (°F)", unit: "°F" }, refrigerant: { col: "Refrigerant" } };

test("no brand mapping is marked verified (no official sample with headers/units found)", () => {
  assert.deepEqual(G.BRANDS.map((b) => b.id), ["mantooth", "testo", "sauermann", "navac", "fieldpiece", "other"]);
  assert.ok(G.BRANDS.every((b) => b.verified === null));
});

test("CSV (synthetic): preamble skipped, header row found, quotes, ; and decimal comma", () => {
  const t = G.toTable(G.parseCSV(txt("synthetic-log-psig-F.csv")).rows, "csv");
  assert.deepEqual(t.headers, ["Time", "Low Pressure (psig)", "High Pressure (psig)", "T1 (°F)", "T2 (°F)", "Refrigerant"]);
  assert.equal(t.rows.length, 2);
  const e = G.parseCSV(txt("synthetic-kPa-C.csv"));
  assert.equal(e.delim, ";");
  const t2 = G.toTable(e.rows, "csv");
  assert.deepEqual(t2.headers, ["Date", "P low", "P high", "T suction", "T liquid", "Gas"]);
  assert.deepEqual(G.parseCSV('a,"b, ""c""",d\n1,2,3').rows, [["a", 'b, "c"', "d"], ["1", "2", "3"]]);
});

test("units: detected from header or cell, never assumed", () => {
  assert.equal(G.detectUnit("Low Pressure (psig)", "pressure"), "psig");
  assert.equal(G.detectUnit("814 kPa", "pressure"), "kPa");
  assert.equal(G.detectUnit("P (kPa abs)", "pressure"), "kPa(a)");
  assert.equal(G.detectUnit("8.1 bar", "pressure"), "bar");
  assert.equal(G.detectUnit("11,3 °C", "temp"), "°C");
  assert.equal(G.detectUnit("T1 (°F)", "temp"), "°F");
  assert.equal(G.detectUnit("P low", "pressure"), null);
  assert.equal(G.detectUnit("118", "pressure"), null);
  assert.equal(G.detectUnit("T suction", "temp"), null);
});

test("conversions to psig / °F", () => {
  const near = (a, b) => assert.ok(Math.abs(a - b) < 0.05, a + " ≈ " + b);
  near(G.toPsig("814", "kPa").value, 118.06);
  near(G.toPsig("8.1", "bar").value, 117.48);
  near(G.toPsig("132.7", "psia").value, 118.0);
  near(G.toPsig("915", "kPa(a)").value, 118.01);
  near(G.toPsig("2.28", "MPa").value, 330.69);
  assert.equal(G.toPsig("118", "psig").note, undefined);
  assert.match(G.toPsig("814", "kPa").note, /gauge/);
  near(G.toF("11,3 °C", "°C").value, 52.34);
  near(G.toF("-40", "°C").value, -40);
  assert.equal(G.toF("52", null).value, null);
  assert.equal(G.toPsig("abc", "psig").value, null);
  assert.equal(G.normRefrigerant("r410a"), "R-410A");
  assert.equal(G.normRefrigerant("R-32"), "R-32");
  assert.equal(G.normRefrigerant("Freon"), null);
});

test("preview: last row by default, all values shown, discharge flagged as liquid pressure", () => {
  const t = G.toTable(G.parseCSV(txt("synthetic-log-psig-F.csv")).rows, "csv");
  const pv = G.buildPreview(t, MAP_PSIG);
  assert.equal(pv.row, 1);
  const v = Object.fromEntries(pv.items.map((i) => [i.id, i.value]));
  assert.deepEqual(v, { suctionPsig: 118.4, dischargePsig: 331, suctionTemp: 52.3, liquidTemp: 94.8, refrigerant: "R-410A", timestamp: "2026-10-26 14:00:01" });
  assert.match(pv.items.find((i) => i.id === "dischargePsig").flags.join(), /liquid pressure/);
  assert.deepEqual(G.fillValues(pv), { suctionPsig: 118.4, liquidPsig: 331, suctionTemp: 52.3, liquidTemp: 94.8, refrigerant: "R-410A" });
  assert.equal(G.buildPreview(t, MAP_PSIG, 0).items[0].value, 118);
});

test("preview: kPa/°C converted and flagged; missing unit / unmapped never filled", () => {
  const t = G.toTable(G.parseCSV(txt("synthetic-kPa-C.csv")).rows, "csv");
  assert.equal(G.unitFor(t, "P low", "pressure"), "kPa");
  assert.equal(G.unitFor(t, "T suction", "temp"), "°C");
  const pv = G.buildPreview(t, { suctionPsig: { col: "P low", unit: "kPa" }, suctionTemp: { col: "T suction", unit: "°C" }, liquidTemp: { col: "T liquid" } });
  const it = (id) => pv.items.find((i) => i.id === id);
  assert.equal(it("suctionPsig").value, 118.1);
  assert.match(it("suctionPsig").display, /118\.1 psig\s+\(from 814 kPa\)/);
  assert.match(it("suctionPsig").flags.join(), /kPa read as gauge/);
  assert.equal(it("suctionTemp").value, 52.3);
  assert.equal(it("liquidTemp").value, null);
  assert.match(it("liquidTemp").flags.join(), /unit unknown/);
  assert.equal(it("dischargePsig").value, null);
  assert.match(it("dischargePsig").flags.join(), /not filled/);
  assert.deepEqual(G.fillValues(pv), { suctionPsig: 118.1, suctionTemp: 52.3 });
});

test("preview: range checks and junk values", () => {
  const t = { headers: ["a", "b", "c"], rows: [["900", "x", "300"]] };
  const pv = G.buildPreview(t, { suctionPsig: { col: "a", unit: "psig" }, suctionTemp: { col: "b", unit: "°F" }, liquidTemp: { col: "c", unit: "°F" } });
  const it = (id) => pv.items.find((i) => i.id === id);
  assert.match(it("suctionPsig").flags.join(), /outside gauge range/);
  assert.equal(it("suctionTemp").value, null);
  assert.match(it("liquidTemp").flags.join(), /outside line-temp range/);
});

test("XLSX (synthetic) via vendored fflate", () => {
  const t = G.parseXLSX(new Uint8Array(readFileSync(fx("synthetic-report.xlsx"))), unzipSync);
  assert.deepEqual(t.headers, ["Timestamp", "Suction (psig)", "Discharge (psig)", "Suction temp (°F)", "Liquid temp (°F)", "Refrigerant"]);
  assert.deepEqual(t.rows[1], ["2026-10-26 14:05", "121", "336", "54.2", "96", "R-410A"]);
  assert.equal(G.unitFor(t, "Suction (psig)", "pressure"), "psig");
});

test("XML (synthetic): repeated records, attributes and unit attributes become columns", () => {
  const t = G.parseXML(txt("synthetic-session.xml"));
  assert.deepEqual(t.headers, ["@time", "lp (bar)", "hp (bar)", "ts (°C)", "tl (°C)"]);
  assert.equal(t.rows.length, 2);
  assert.equal(G.unitFor(t, "lp (bar)", "pressure"), "bar");
  const pv = G.buildPreview(t, { suctionPsig: { col: "lp (bar)", unit: "bar" }, suctionTemp: { col: "ts (°C)", unit: "°C" } });
  assert.equal(pv.items[0].value, 118.9);
  assert.equal(pv.items[2].value, 51.1);
});

test("PDF text layer (synthetic) via vendored pdf.js -> label/value lines", async () => {
  // Node has no DOMMatrix; pdf.js only needs it for rendering, not getTextContent. Browsers have it.
  globalThis.DOMMatrix ??= class DOMMatrix { constructor() { Object.assign(this, { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }); } };
  const pdfjs = await import("../vendor/pdfjs/pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("../vendor/pdfjs/pdf.worker.min.mjs", import.meta.url).href;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(fx("synthetic-report.pdf"))), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
  const tc = await (await doc.getPage(1)).getTextContent();
  const t = G.pdfLinesToTable(G.itemsToLines(tc.items));
  const row = Object.fromEntries(t.headers.map((h, i) => [h, t.rows[0][i]]));
  assert.equal(row["Suction pressure"], "118.4 psig");
  assert.equal(row["Discharge pressure"], "331.0 psig");
  assert.equal(row["Suction line temperature"], "52.3 °F");
  assert.equal(row["Refrigerant"], "R-410A");
  assert.equal(row["Date"], "2026-10-26 14:00");
  assert.equal(G.unitFor(t, "Liquid line temperature", "temp"), "°F");
});

test("mapping saved per brand; reused only when every mapped header is in the new file", () => {
  const s = mem();
  G.saveMapping(s, "mantooth", MAP_PSIG);
  G.saveMapping(s, "testo", { suctionPsig: { col: "P low", unit: "kPa" } });
  assert.deepEqual(G.loadMapping(s, "mantooth"), MAP_PSIG);
  assert.equal(G.loadMapping(s, "navac"), null);
  assert.ok(G.mappingFits(MAP_PSIG, G.toTable(G.parseCSV(txt("synthetic-log-psig-F.csv")).rows).headers));
  assert.ok(!G.mappingFits(MAP_PSIG, ["Time", "Low Pressure (psig)"]));
  assert.ok(!G.mappingFits({}, ["a"]));
});

test("fileKind", () => {
  assert.equal(G.fileKind("log.CSV"), "csv");
  assert.equal(G.fileKind("r.xlsx"), "xlsx");
  assert.equal(G.fileKind("x", "application/pdf"), "pdf");
  assert.equal(G.fileKind("s.xml"), "xml");
  assert.equal(G.fileKind("old.xls"), "xls");
  assert.equal(G.fileKind("a.jpg", "image/jpeg"), null);
});

test("offline + share target wiring: vendored libs precached, share_target in manifest, no off-origin URLs in import code", () => {
  const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  for (const f of ["./vendor/pdfjs/pdf.min.mjs", "./vendor/pdfjs/pdf.worker.min.mjs", "./vendor/fflate/fflate.mjs", "./share.html"]) assert.ok(sw.includes('"' + f + '"'), f);
  assert.match(sw, /\/share-target/);
  const m = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
  assert.equal(m.share_target.method, "POST");
  assert.equal(m.share_target.params.files[0].name, "report");
  for (const f of ["gauge-parse.js", "gauge-import.js", "call-gauge.js"]) {
    const src = readFileSync(new URL("../tools/" + f, import.meta.url), "utf8").replace(/^\s*(\/\/|\*|\/\*).*$/gm, "");
    assert.ok(!/https?:\/\//.test(src), f);
  }
});
