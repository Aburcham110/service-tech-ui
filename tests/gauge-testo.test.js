import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as G from "../tools/gauge-parse.js";

const fx = (n) => readFileSync(new URL("./fixtures/gauge/" + n, import.meta.url), "utf8");
const TESTO = fx("testo-smart-2026-11-02-trimmed.csv");
const mem = () => { const m = {}; return { getItem: (k) => m[k] ?? null, setItem: (k, v) => { m[k] = String(v); } }; };
const PROBES = { "48733377": "suctionTemp", "48733934": "liquidTemp", "48729523": "suctionPsig", "48719974": "dischargePsig" };

test("testo: detected by < Instruments > block plus [unit] headers; generic formats are not", () => {
  assert.equal(G.isTestoCSV(TESTO), true);
  for (const f of ["synthetic-log-psig-F.csv", "synthetic-kPa-C.csv", "synthetic-no-units.csv"]) assert.equal(G.isTestoCSV(fx(f)), false, f);
  assert.equal(G.isTestoCSV(TESTO.replace("< Instruments >", "< Other >")), false, "needs the Instruments block");
  assert.equal(G.isTestoCSV(TESTO.replace(/\[°F\]|\[psi\]/g, "")), false, "needs [unit] headers");
});

test("testo: suffix joins to full serial; probe type, model and unit shown", () => {
  const t = G.parseTestoCSV(TESTO);
  assert.deepEqual(t.columns.map((c) => [c.suffix, c.unit, c.kind, c.instrument && c.instrument.serial, c.instrument && c.instrument.name]), [
    ["377", "°F", "temp", "48733377", "testo 115i"], ["523", "psi", "pressure", "48729523", "testo 549i"],
    ["934", "°F", "temp", "48733934", "testo 115i"], ["974", "psi", "pressure", "48719974", "testo 549i"]]);
  assert.ok(t.columns.every((c) => !c.flags.length));
  assert.match(G.testoProbeLabel(t.columns[1]), /testo 549i pressure · serial 48729523 \(psi\)/);
  assert.equal(t.general["App Version"], "32.1.8.108231");
  assert.equal(t.instruments.length, 4);
});

test("testo: a suffix with no match or two matches is flagged and never guessed", () => {
  const none = G.parseTestoCSV(TESTO.replace("377 [°F]", "999 [°F]"));
  assert.equal(none.columns[0].instrument, null);
  assert.match(none.columns[0].flags[0], /no instrument serial ends in 999/);
  assert.equal(G.testoUsable(none).length, 3);
  const two = G.parseTestoCSV(TESTO.replace("testo 115i,48733934", "testo 115i,11111377"));
  assert.equal(two.columns[0].instrument, null);
  assert.match(two.columns[0].flags[0], /matches 2 instruments/);
  const p = G.buildTestoPreview(none, { probes: { ...PROBES }, refrigerant: "R-410A" });
  assert.equal(p.items.find((x) => x.id === "suctionTemp").value, null);
});

test("testo: units — °F kept, psi read as gauge (flagged), °C converted", () => {
  const p = G.buildTestoPreview(G.parseTestoCSV(TESTO), { probes: PROBES });
  assert.equal(p.items.find((x) => x.id === "suctionTemp").value, 71.4);
  const c = G.parseTestoCSV(TESTO.replace("377 [°F]", "377 [°C]").replace(/4:29:13 PM,71\.4/, "4:29:13 PM,20.0"));
  const pc = G.buildTestoPreview(c, { probes: PROBES });
  assert.equal(pc.items.find((x) => x.id === "suctionTemp").value, 68);
  const pr = G.buildTestoPreview(G.parseTestoCSV(TESTO.replace(/4:29:13 PM,71\.4,0\.0/, "4:29:13 PM,71.4,118.2")), { probes: PROBES });
  const s = pr.items.find((x) => x.id === "suctionPsig");
  assert.equal(s.value, 118.2);
  assert.ok(s.flags.some((f) => /psi.*gauge/.test(f)));
});

test("testo: footer rows are not readings; last row default, Overall Average option", () => {
  const t = G.parseTestoCSV(TESTO);
  assert.equal(t.rows.length, 6);
  assert.ok(t.rows.every((r) => /^\d+\/\d+\/\d+ \d+:\d+:\d+ [AP]M$/.test(r[0])));
  assert.deepEqual(Object.keys(t.footer).sort(), ["average", "max", "min"]);
  const last = G.buildTestoPreview(t, { probes: PROBES });
  assert.equal(last.source, "last");
  assert.equal(last.items.find((x) => x.id === "timestamp").value, "11/2/26 4:29:13 PM");
  assert.equal(last.items.find((x) => x.id === "liquidTemp").value, 73);
  const avg = G.buildTestoPreview(t, { probes: PROBES, source: "average" });
  assert.equal(avg.items.find((x) => x.id === "suctionTemp").value, 71);
  assert.equal(avg.items.find((x) => x.id === "liquidTemp").value, 72.8);
  assert.equal(avg.items.find((x) => x.id === "timestamp").value, null);
});

test("testo: 0.0 psi is no reading — blank, flagged, never filled or calculated", () => {
  const p = G.buildTestoPreview(G.parseTestoCSV(TESTO), { probes: PROBES, refrigerant: "R-410A" });
  for (const id of ["suctionPsig", "dischargePsig"]) {
    const it = p.items.find((x) => x.id === id);
    assert.equal(it.value, null); assert.equal(it.display, "—");
    assert.match(it.flags.join(), /0\.0 psi = no reading/);
  }
  const v = G.fillValues(p);
  assert.equal("suctionPsig" in v, false); assert.equal("liquidPsig" in v, false);
  assert.deepEqual(v, { suctionTemp: 71.4, liquidTemp: 73, refrigerant: "R-410A" });
  const a = G.buildTestoPreview(G.parseTestoCSV(TESTO), { probes: PROBES, source: "average" });
  assert.equal(a.items.find((x) => x.id === "suctionPsig").value, null);
});

test("testo: probe mapping saved by full serial on this phone; unmapped slots never guessed", () => {
  const t = G.parseTestoCSV(TESTO);
  const s = mem();
  assert.equal(G.testoProbesKnown(t, G.loadTestoProbes(s)), false);
  const none = G.buildTestoPreview(t, { probes: {} });
  assert.ok(["suctionPsig", "dischargePsig", "suctionTemp", "liquidTemp"].every((id) => none.items.find((x) => x.id === id).value == null));
  G.saveTestoProbes(s, PROBES);
  assert.deepEqual(JSON.parse(s.getItem(G.TESTO_MAP_KEY)), PROBES);
  assert.equal(G.testoProbesKnown(t, G.loadTestoProbes(s)), true);
  // a new export with the same probes in a different column order still maps by serial
  const swapped = TESTO.split("\n").map((l) => { const c = l.split(","); return c.length === 6 && !/^</.test(l) && !/^(Name|App|Measuring|testo|32\.|Continuous)/.test(l) ? [c[0], c[3], c[2], c[1], c[4], ""].join(",") : l; }).join("\n");
  const t2 = G.parseTestoCSV(swapped);
  assert.equal(t2.columns[0].instrument.serial, "48733934");
  const p2 = G.buildTestoPreview(t2, { probes: G.loadTestoProbes(s) });
  assert.equal(p2.items.find((x) => x.id === "suctionTemp").value, 71.4);
  assert.equal(p2.items.find((x) => x.id === "liquidTemp").value, 73);
  const dup = G.buildTestoPreview(t, { probes: { ...PROBES, "48733934": "suctionTemp" } });
  assert.match(dup.items.find((x) => x.id === "suctionTemp").flags.join(), /two probes/);
});

test("testo: refrigerant is never auto-picked from the file", () => {
  const t = G.parseTestoCSV(TESTO.replace("Basic View", "R-410A"));
  const p = G.buildTestoPreview(t, { probes: PROBES });
  const r = p.items.find((x) => x.id === "refrigerant");
  assert.equal(r.value, null); assert.match(r.flags.join(), /pick the refrigerant/);
  assert.equal("refrigerant" in G.fillValues(p), false);
  assert.equal(G.buildTestoPreview(t, { probes: PROBES, refrigerant: "r410a" }).items.find((x) => x.id === "refrigerant").value, "R-410A");
});

test("testo UI wiring: detection before generic table, Looks right kept, help updated, no off-origin URLs", () => {
  const ui = readFileSync(new URL("../tools/gauge-import.js", import.meta.url), "utf8");
  assert.match(ui, /isTestoCSV\(text\)[\s\S]{0,80}parseTestoCSV/);
  assert.match(ui, /Looks right — fill/);
  assert.match(ui, /Overall average/);
  assert.match(ui, /saveTestoProbes\(localStorage/);
  assert.ok(!/https?:\/\//.test(ui.replace(/\/\*[\s\S]*?\*\//g, "")), "no URLs in import UI");
  const help = readFileSync(new URL("../help.html", import.meta.url), "utf8");
  assert.match(help, /testo Smart/); assert.match(help, /0\.0 psi/);
  assert.match(help, /educational/i);
});
