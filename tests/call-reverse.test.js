import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as N from "../tools/call-notes.js";
import { TREES } from "../tools/trees.js";
import { TOOLS } from "../tools/registry.js";
import { runTool } from "../tools/logic.js";

const mem = (v) => { const m = new Map(v === undefined ? [] : [[N.DRAFT_KEY, typeof v === "string" ? v : JSON.stringify(v)]]); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, x) => m.set(k, String(x)), get: () => JSON.parse(m.get(N.DRAFT_KEY)), has: () => m.has(N.DRAFT_KEY) }; };
const T = new Date(2026, 9, 26, 22, 41);
const SH = { mode: "both", refrigerant: "R-410A", suctionPsig: "118.4", suctionTemp: "52.3", liquidPsig: "331", liquidTemp: "94.8" };

test("stamped, labeled line", () => {
  assert.equal(N.stampLine("Tree: walk-in", "Evap fan not running → check fan motor", T), "[22:41 Tree: walk-in] Evap fan not running → check fan motor");
  assert.equal(N.stampLine("X", "  a \n b ", T), "[22:41 X] a b");
  assert.equal(N.stampLine("X", " ", T), "");
});

test("append: own line, never edits existing text, Found or Did only", () => {
  const d = { found: "Dirty filter  \n", did: "Leak checked" };
  const r = N.appendLine(d, "found", "[22:41 Tree: walk-in] A");
  assert.equal(r.added, true);
  assert.equal(r.draft.found, "Dirty filter\n[22:41 Tree: walk-in] A");
  assert.equal(r.draft.did, "Leak checked");
  assert.equal(d.found, "Dirty filter  \n", "input not mutated");
  assert.equal(N.appendLine({}, "did", "x").draft.did, "x");
  assert.throws(() => N.appendLine({}, "site", "x"));
});

test("dedupe: double tap (same or next minute) adds one line; a different note still appends", () => {
  let d = { found: "" };
  d = N.applyEntry(d, { field: "found", label: "Tree: walk-in", text: "Fan off" }, { now: T }).draft;
  const again = N.applyEntry(d, { field: "found", label: "Tree: walk-in", text: "Fan off" }, { now: new Date(2026, 9, 26, 22, 42) });
  assert.equal(again.added, false); assert.equal(again.reason, "duplicate");
  assert.equal(again.draft.found, "[22:41 Tree: walk-in] Fan off");
  assert.equal(N.applyEntry(d, { field: "found", label: "Tree: walk-in", text: "Fan on" }, { now: T }).draft.found.split("\n").length, 2);
  assert.equal(N.applyEntry(d, { field: "found", label: "Tree: split-ac-hp", text: "Fan off" }, { now: T }).added, true, "other label = other note");
});

test("no draft / empty draft / junk: nothing written", () => {
  for (const v of [undefined, "not json", "[1,2]", { step: "open", techName: "Arthur", startTime: "08:00", equipment: "cooler", photosReady: false, partsList: "[]" }]) {
    const s = mem(v); const before = s.getItem(N.DRAFT_KEY);
    const r = N.writeDraft(s, (d) => N.applyEntry(d, { field: "found", label: "X", text: "y" }));
    assert.deepEqual([r.ok, r.reason], [false, "no-draft"]);
    assert.equal(s.getItem(N.DRAFT_KEY), before);
  }
});

test("writeDraft keeps the schema valid and other fields intact", () => {
  const s = mem({ site: "Store 12", found: "Dirty filter", amps: 8.6, photosReady: "true", partsList: "oops", step: "weird", custom: "kept" });
  const r = N.writeDraft(s, (d) => N.applyEntry(d, { field: "did", label: "Tool: Vacuum coach", text: "Start micron: 900" }, { now: T }));
  assert.equal(r.ok, true);
  const d = s.get();
  for (const k of Object.keys(N.SCHEMA)) assert.ok(k in d, k);
  assert.equal(d.site, "Store 12"); assert.equal(d.found, "Dirty filter"); assert.equal(d.custom, "kept");
  assert.equal(d.amps, "8.6"); assert.equal(d.photosReady, true); assert.equal(d.partsList, "[]"); assert.equal(d.step, "open");
  assert.equal(d.did, "[22:41 Tool: Vacuum coach] Start micron: 900");
});

test("overwrite guard: empty readings filled; different values only with overwrite; same value is no conflict", () => {
  const e = N.toolEntry(TOOLS.find((t) => t.id === "superheat-subcool"), SH, runTool("superheat-subcool", SH).lines);
  let r = N.applyEntry({ site: "S", suctionPsig: "", liquidPsig: "" }, e, { now: T });
  assert.deepEqual(r.filled.sort(), ["liquidPsig", "liquidTemp", "refrigerant", "suctionPsig", "suctionTemp"]);
  assert.equal(r.draft.suctionPsig, "118.4"); assert.equal(r.conflicts.length, 0);
  r = N.applyEntry({ site: "S", suctionPsig: "120", suctionTemp: "52.3", refrigerant: "R-410A" }, e, { now: T });
  assert.equal(r.draft.suctionPsig, "120", "kept without confirm");
  assert.deepEqual(r.conflicts, [{ key: "suctionPsig", label: "Suction psig", old: "120", value: "118.4" }]);
  assert.ok(!r.filled.includes("suctionPsig") && r.filled.includes("liquidPsig"));
  assert.equal(r.added, true, "the note is still appended");
  r = N.applyEntry({ site: "S", suctionPsig: "120" }, e, { now: T, overwrite: true });
  assert.equal(r.draft.suctionPsig, "118.4"); assert.equal(r.conflicts.length, 0);
  const sub = N.toolEntry(TOOLS.find((t) => t.id === "superheat-subcool"), Object.assign({}, SH, { mode: "subcool" }), ["Subcooling: 7.9 °F"]);
  assert.deepEqual(Object.keys(sub.readings).sort(), ["liquidPsig", "liquidTemp", "refrigerant"]);
});

test("SH/SC note: key outputs with units, no caveat lines", () => {
  const e = N.toolEntry(TOOLS.find((t) => t.id === "superheat-subcool"), SH, runTool("superheat-subcool", SH).lines);
  assert.equal(e.field, "found"); assert.equal(e.label, "Tool: SH / Subcool");
  assert.equal(e.text, "Refrigerant: R-410A · Suction: 118.4 psig → dew sat 40.0 °F · Line temp: 52.3 °F · Superheat: 12.3 °F · Liquid: 331.0 psig → bubble sat 102.7 °F · Line temp: 94.8 °F · Subcooling: 7.9 °F");
  assert.equal(N.toolEntry(TOOLS.find((t) => t.id === "superheat-subcool"), SH, ["Need suction pressure."]), null);
  assert.equal(N.toolEntry(TOOLS.find((t) => t.id === "job-log"), {}, ["A: b"]), null, "not a call tool");
});

test("every call tool is in the registry and gives a note for a real result", () => {
  for (const id of Object.keys(N.CALL_TOOLS)) assert.ok(TOOLS.find((t) => t.id === id), id);
  const cd = TOOLS.find((t) => t.id === "compressor-diag"); const f = {}; cd.fields.forEach((x) => (f[x.name] = x.default ?? (x.type === "select" ? x.options[0][0] : "")));
  const e = N.toolEntry(cd, f, runTool("compressor-diag", f).lines);
  assert.match(e.text, /^Symptom: .+ · 1\. /);
  assert.equal(N.toolEntry(TOOLS.find((t) => t.id === "vacuum-coach"), {}, ["Start: 900 microns"]).field, "did");
});

test("psychro entry: short summary with units; dry bulbs as readings", () => {
  const txt = "Psychrometrics\nPressure: 14.696 psia\nReturn: Dry bulb 75.0 °F, Wet bulb 62.6 °F, Dew point 55.1 °F, RH 50.0 %, Enthalpy 28.11 Btu/lb\nSupply: Dry bulb 55.0 °F, Wet bulb 53.3 °F, RH 90.0 %\nΔT 20.0 °F, Δh 5.94 Btu/lb, ΔW 6.8 gr/lb\nTotal 32,517 Btu/h (2.71 tons) - Density-corrected: x\nTotal 32,063 Btu/h - y\nSHR 0.81 - z\nAirflow 1,200 cfm measured";
  const e = N.psychroEntry(txt, { retDb: "75", supDb: "55" });
  assert.equal(e.text, "Return Dry bulb 75.0 °F, Wet bulb 62.6 °F, RH 50.0 % · Supply Dry bulb 55.0 °F, Wet bulb 53.3 °F, RH 90.0 % · ΔT 20.0 °F, Δh 5.94 Btu/lb, ΔW 6.8 gr/lb · Total 32,517 Btu/h (2.71 tons) · SHR 0.81 · Airflow 1,200 cfm measured");
  assert.deepEqual(e.readings, { returnTemp: "75", supplyTemp: "55" });
});

test("tree step entries: answers -> Found, measurement steps -> Did, results include the answer", () => {
  const t = TREES["mini-split"];
  assert.equal(N.treeStepEntry("mini-split", t, ["start"]), null, "nothing answered yet");
  const a = N.treeStepEntry("mini-split", t, ["start", "power"]);
  assert.deepEqual(a, { field: "found", label: "Tree: mini-split", text: "What is the complaint? → Unit dead / won't respond" });
  const b = N.treeStepEntry("mini-split", t, ["start", "power", "fix-power"]);
  assert.equal(b.field, "found", "a result is a finding");
  assert.equal(N.treeStepEntry("mini-split", t, ["start", "power", "respond"]).field, "did", "power step has tools: a measurement the tech did");
  assert.match(b.text, /→ No → Restore supply first: breaker, disconnect, fuses, wiring and terminations\.$/);
  for (const [id, tr] of Object.entries(TREES)) for (const [nid, n] of Object.entries(tr.nodes)) for (const o of n.options || []) if (o.next) {
    const e = N.treeStepEntry(id, tr, [nid, o.next]); assert.ok(e && e.text && N.NOTE_FIELDS[e.field], id + "/" + o.next);
  }
});

test("wired into tree, tool, psychro; precached", () => {
  const r = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
  assert.match(r("tools/tree-app.js"), /treeStepEntry/);
  assert.match(r("tools/tool-app.js"), /toolEntry/);
  assert.match(r("tools/psychro-app.js"), /psychroEntry/);
  assert.match(r("sw.js"), /"\.\/tools\/call-notes\.js\?v=\d+"/);
});
