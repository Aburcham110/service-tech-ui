import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluate, readForm, copyText, BPA_URL } from "../tools/psychro-ui.js";
import { isExcluded } from "../tools/official-domains.js";

const EX = { retDb: "75", retHumMode: "rh", retHum: "50", supDb: "55", supHumMode: "rh", supHum: "90",
  pressureMode: "altitudeFt", pressureValue: "1000", cfm: "1200", airflowAt: "supply", tesp: "", ratedTons: "" };
const near = (a, b, t, m) => assert.ok(Math.abs(a - b) <= t, `${m}: ${a} vs ${b}`);

test("worked example: density-corrected first when pressure entered, standard air labeled", () => {
  const ev = evaluate(EX);
  assert.ok(ev.ok); assert.deepEqual(ev.warnings, []); assert.deepEqual(ev.hints, []);
  const [first, second] = ev.capacity.totals;
  assert.equal(first.key, "density"); near(first.btuh, 31571.605858436506, 1, "density");
  assert.match(first.label, /supply/); assert.equal(second.key, "std"); near(second.btuh, 32296.30014864593, 1, "std");
  assert.match(second.label, /^Standard air/);
  near(ev.a.shrAll.std, 0.8026, 1e-3, "shr"); near(ev.a.shrAll.sum, 0.8180, 1e-3, "alt shr");
  near(ev.cfmPerMeasuredTon, 1200 / (31571.605858436506 / 12000), 0.01, "cfm/ton measured");
});

test("blank pressure = sea level, standard air first; return toggle", () => {
  const ev = evaluate({ ...EX, pressureValue: "" });
  assert.equal(ev.pressureEntered, false); near(ev.a.psia, 14.696, 1e-3, "sea level"); assert.equal(ev.capacity.totals[0].key, "std");
  const r = evaluate({ ...EX, airflowAt: "return" }); near(r.capacity.totals[0].btuh, 30342.05189209891, 1, "return"); assert.match(r.capacity.totals[0].label, /return/);
  near(evaluate({ ...EX, pressureMode: "inHg", pressureValue: "28.856" }).a.psia, 14.1729, 2e-3, "inHg");
});

test("wet-bulb mode and no cfm", () => {
  const ev = evaluate({ ...EX, retHumMode: "wb", retHum: "62.3935", cfm: "" });
  assert.ok(ev.ok); near(ev.a.ret.rh, 0.5, 1e-4, "rh"); assert.equal(ev.capacity, null);
});

test("check-probes warnings (not standards)", () => {
  const warm = evaluate({ ...EX, supDb: "80" }); assert.ok(warm.warnings.some((w) => /not colder/.test(w) && /Check probes/.test(w)));
  const sat = evaluate({ ...EX, supHum: "99" }); assert.ok(sat.warnings.some((w) => /near saturation/.test(w)));
  const over = evaluate({ ...EX, supHum: "105" }); assert.equal(over.ok, false); assert.match(over.problems[0], /outside 0–100%.*Check probes/);
  const wb = evaluate({ ...EX, retHumMode: "wb", retHum: "80" }); assert.equal(wb.ok, false); assert.match(wb.problems[0], /impossible/);
  assert.equal(evaluate({ ...EX, retDb: "" }).ok, false);
  for (const w of [...warm.warnings, ...sat.warnings]) assert.doesNotMatch(w, /standard|ASHRAE|ACCA|should be/i);
});

test("only cited hints: BPA cfm/ton 325–500 and TESP 0.5", () => {
  assert.deepEqual(evaluate({ ...EX, ratedTons: "3", tesp: "0.5" }).hints, []); // 400 cfm/ton, 0.5 in
  const h = evaluate({ ...EX, ratedTons: "2", tesp: "0.8" }).hints; // 600 cfm/ton
  assert.equal(h.length, 2); assert.match(h[0].text, /325–500/); assert.match(h[1].text, /0\.5 inH₂O or less/);
  for (const x of h) assert.equal(x.url, BPA_URL);
  assert.equal(evaluate({ ...EX, ratedTons: "4" }).hints.length, 1); // 300 cfm/ton
  assert.ok(isExcluded(BPA_URL));
  const src = readFileSync(new URL("../tools/psychro-ui.js", import.meta.url), "utf8");
  for (const s of ["16–22", "0.70", "350", "450"]) assert.ok(!src.includes(s), s);
});

test("copy text has labels and the worked numbers", () => {
  const t = copyText(evaluate(EX));
  assert.match(t, /Total 31,572 Btu\/h \(2\.63 tons\) - Density-corrected/); assert.match(t, /Total 32,296 Btu\/h \(2\.69 tons\) - Standard air/);
  assert.match(t, /Sensible 25,920/); assert.match(t, /Latent 5,766/); assert.match(t, /SHR 0\.80 .*default/); assert.match(t, /SHR 0\.82 .*alternative/);
  assert.match(t, /Coil leaving dew point 52\.1 °F/); assert.equal(copyText({ ok: false }), "");
  assert.ok(readForm(EX).problems.length === 0);
});

test("screen is precached, linked from home and help", () => {
  const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  for (const f of ["./psychro.html", "./tools/psychro-ui.js?v=33", "./tools/psychro-app.js?v=33", "./tools/psychro.js?v=33"]) assert.ok(sw.includes(`"${f}"`), f);
  assert.match(readFileSync(new URL("../index.html", import.meta.url), "utf8"), /href="psychro.html"/);
  assert.match(readFileSync(new URL("../help.html", import.meta.url), "utf8"), /id="psychro"/);
});
