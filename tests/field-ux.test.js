import test from "node:test";
import assert from "node:assert/strict";
import { TREES, quickLinks } from "../tools/trees.js";
import { getTool } from "../tools/registry.js";
import { runTool } from "../tools/logic.js";
import { plateRecord, saveLastPlate, getLastPlate, plateLabel, nominalVoltage, summaryRows, plateOnCard, SCAN_KEY } from "../tools/last-plate.js";
import { scanToolLinks } from "../tools/call-card.js";

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };
const V = { brand: "Carrier", unitType: "outdoor", model: "24ACC636A003", serial: "1234A56789", refrigerant: "R-410A", charge: "7.5", voltage: "208/230", phase: "1", rla: "14.1", junk: "x" };

test("last scanned plate: stored on the phone with plate fields only, read back for cards/trees", () => {
  const s = mem();
  saveLastPlate(V, s);
  const p = getLastPlate(s);
  assert.equal(p.model, "24ACC636A003"); assert.equal(p.voltage, "208/230"); assert.equal(p.junk, undefined);
  assert.match(p.summary, /Model 24ACC636A003/);
  assert.ok(s.m.has(SCAN_KEY));
  assert.equal(plateLabel(p), "Carrier · 24ACC636A003");
  assert.equal(getLastPlate(mem()), null);
  const bad = mem(); bad.setItem(SCAN_KEY, "{oops"); assert.equal(getLastPlate(bad), null);
  assert.deepEqual(Object.keys(plateRecord({ model: "  " })), ["summary"]);
});

test("nameplate voltage -> nominal number", () => {
  assert.equal(nominalVoltage("208/230"), 208);
  assert.equal(nominalVoltage("460-3-60"), 460);
  assert.equal(nominalVoltage("115V"), 115);
  assert.equal(nominalVoltage(""), null);
  assert.equal(nominalVoltage("24"), null);
});

test("scan confirmation links: SH/SC carries refrigerant, electrical carries nameplate voltage + RLA", () => {
  const [sh, el] = scanToolLinks(V);
  assert.equal(sh.href, "tool.html?id=superheat-subcool&refrigerant=R-410A");
  assert.equal(el.href, "tool.html?id=electrical&nominalV=208&rla=14.1");
  assert.equal(scanToolLinks({})[1].href, "tool.html?id=electrical");
  const node = Object.values(TREES["split-ac-hp"].nodes).find((n) => (n.tools || []).includes("electrical"));
  assert.equal(quickLinks(node, { nominalV: 460, rla: "9" }).find((l) => l.tool === "electrical").href, "tool.html?id=electrical&nominalV=460&rla=9");
});

test("electrical helper: nameplate voltage field + generic ±10% check", () => {
  assert.ok(getTool("electrical").fields.some((f) => f.name === "nominalV"));
  const out = (f) => runTool("electrical", Object.assign({ tool: "imbalance", phases: "1" }, f)).lines.join("\n");
  assert.match(out({ v1: "230", v2: "228", nominalV: "230" }), /Within the common ±10%/);
  assert.match(out({ v1: "190", v2: "188", nominalV: "230" }), /Outside ±10%/);
  assert.doesNotMatch(out({ v1: "230", v2: "228" }), /Nameplate/);
});

test("call card: scanned-equipment summary rows and when the plate is on the card", () => {
  const p = plateRecord(V);
  assert.deepEqual(summaryRows(p).slice(0, 3), [["Brand", "Carrier"], ["Model", "24ACC636A003"], ["Serial", "1234A56789"]]);
  assert.ok(plateOnCard(p, p.summary));
  assert.ok(plateOnCard(p, "edited: 24ACC636A003 etc"));
  assert.ok(!plateOnCard(p, "other unit"));
  assert.ok(!plateOnCard(p, ""));
  assert.deepEqual(summaryRows(null), []);
});

import { confusableMarks, CONFUSABLE_CHARS } from "../tools/plate-scan.js";
test("scanner: look-alike characters are marked for emphasis", () => {
  const m = confusableMarks("A0B1x");
  assert.deepEqual(m.map((x) => x.confusable), [false, true, true, true, false]);
  for (const c of "O0I1S5B8Z2") assert.ok(CONFUSABLE_CHARS.includes(c), c);
  assert.deepEqual(confusableMarks(""), []);
});

import { jobLogHref } from "../tools/trees.js";
test("trees: new branches reachable, generic only, all next targets exist", () => {
  const reach = (id, from) => { const t = TREES[id], seen = new Set(), q = [t.start]; while (q.length) { const n = q.shift(); if (seen.has(n)) continue; seen.add(n); (t.nodes[n].options || []).forEach((o) => o.next && q.push(o.next)); } return seen; };
  for (const [id, t] of Object.entries(TREES)) for (const [nid, n] of Object.entries(t.nodes)) {
    (n.options || []).forEach((o) => assert.ok(o.tree ? TREES[o.tree] : t.nodes[o.next], id + "/" + nid + " -> " + (o.next || o.tree)));
    (n.tools || []).forEach((tl) => assert.ok(getTool(tl), tl));
    assert.ok(n.end ? !(n.options || []).length : (n.options || []).length, id + "/" + nid);
    assert.doesNotMatch(n.text, /\b(code|error)\s+[A-Z]?\d{1,3}\b|\bE\d{1,3}\b|\b[A-Z]\d-\d\b/, "looks like an OEM code: " + nid);
  }
  for (const [tree, ids] of Object.entries({ "mini-split": ["comm-link", "comm-power", "comm-signal"], "split-ac-hp": ["pressures", "high-head", "low-suction", "high-head-charge"], "walk-in": ["warm-coil", "ice-pattern", "warm-noice", "fans-off"] }))
    ids.forEach((n) => assert.ok(reach(tree).has(n), tree + "/" + n));
});

test("trees: leaf 'Log this in job notes' pre-fills the job-log tool", () => {
  const href = jobLogHref("walk-in", ["start", "warm-coil", "fans-off"], { brand: "Heatcraft", unitType: "evaporator", model: "LET090", serial: "S1", refrigerant: "R-448A", charge: "12" });
  const q = new URLSearchParams(href.split("?")[1]);
  assert.equal(q.get("id"), "job-log");
  assert.equal(q.get("equipment"), "Heatcraft evaporator — Commercial walk-in / refrigeration");
  assert.equal(q.get("model"), "LET090"); assert.equal(q.get("systemCharge"), "12"); assert.equal(q.get("refrigerant"), "R-448A");
  assert.match(q.get("work"), /Box warm: is the evaporator iced\? → Evaporator fans not running/);
  const names = getTool("job-log").fields.map((f) => f.name);
  for (const k of q.keys()) if (k !== "id") assert.ok(names.includes(k), k);
  assert.equal(new URLSearchParams(jobLogHref("compressor", ["start"], null).split("?")[1]).get("equipment"), "Compressor");
});
