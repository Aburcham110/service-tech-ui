import test from "node:test";
import assert from "node:assert/strict";
import { TREES, quickLinks, QUICK_LINKS } from "../tools/trees.js";
import { getTool } from "../tools/registry.js";
import { matchOption, prefillValue } from "../tools/prefill.js";

const nodes = () => Object.values(TREES).flatMap((t) => Object.values(t.nodes));

test("tree quick links: the three named steps open the right tools", () => {
  assert.deepEqual(QUICK_LINKS.map((q) => [q.label, q.tool]), [
    ["Check superheat/subcool", "superheat-subcool"], ["Check amps vs FLA", "electrical"], ["Vacuum / decay", "vacuum-coach"]]);
  for (const q of QUICK_LINKS) {
    assert.ok(getTool(q.tool), q.tool);
    assert.ok(nodes().some((n) => quickLinks(n).some((l) => l.tool === q.tool)), "no tree step links " + q.tool);
  }
  const sh = nodes().find((n) => (n.tools || []).includes("superheat-subcool"));
  assert.equal(quickLinks(sh, { refrigerant: "R-410A" }).find((l) => l.tool === "superheat-subcool").href, "tool.html?id=superheat-subcool&refrigerant=R-410A");
  assert.equal(quickLinks(sh, {}).find((l) => l.tool === "superheat-subcool").href, "tool.html?id=superheat-subcool");
  const el = nodes().find((n) => (n.tools || []).includes("electrical"));
  assert.equal(quickLinks(el, { refrigerant: "R-22" }).find((l) => l.tool === "electrical").href, "tool.html?id=electrical");
});

test("SH/SC refrigerant pre-select matches the tool's own options", () => {
  const f = getTool("superheat-subcool").fields.find((x) => x.name === "refrigerant");
  assert.equal(matchOption(f.options, "R410A"), "R-410A");
  assert.equal(matchOption(f.options, "r-134A"), "R-134a");
  assert.equal(matchOption(f.options, "454B"), "R-454B");
  assert.equal(matchOption(f.options, "R-448A"), null); // not in the tool's list: leave the default
  assert.equal(prefillValue({ type: "number" }, "12x"), null);
  assert.equal(prefillValue({ type: "number" }, "12.5"), "12.5");
});

import { callCardFill, mergeIntoDraft, troubleshootHref } from "../tools/call-card.js";

const SCAN = { brand: "Carrier", unitType: "outdoor", model: "24ACC636A003", serial: "1234A56789", refrigerant: "R-410A", charge: "7.5", voltage: "208/230", phase: "1", rla: "14.1" };

test("Add to call card: brand, model, serial, refrigerant and charge land in the Open step without re-typing", () => {
  const f = callCardFill(SCAN);
  assert.equal(f.refrigerant, "R-410A");
  assert.equal(f.fla, "14.1");
  for (const s of ["Carrier", "Model 24ACC636A003", "S/N 1234A56789", "R-410A 7.5 lb"]) assert.ok(f.plate.includes(s), s);
  assert.deepEqual(Object.keys(f).sort(), ["fla", "plate", "refrigerant"]); // Open-step fields (+ FLA reference) only
  const d = mergeIntoDraft({ step: "open", site: "Store 12", symptom: "warm", plate: "old" }, SCAN);
  assert.equal(d.site, "Store 12"); assert.equal(d.symptom, "warm"); assert.equal(d.plate, f.plate);
  assert.deepEqual(callCardFill({ brand: "Trane" }), { plate: "Trane" });
});

test("Start troubleshooting for this equipment opens the matching tree", () => {
  assert.equal(troubleshootHref(SCAN, "split"), "tree.html?type=split-ac-hp&refrigerant=R-410A");
  assert.equal(troubleshootHref({ brand: "Copeland", unitType: "compressor" }, "cooler"), "tree.html?type=compressor");
  assert.equal(troubleshootHref({ brand: "Fujitsu", unitType: "indoor" }, "split"), "tree.html?type=mini-split");
  assert.equal(troubleshootHref({ brand: "Heatcraft" }, "freezer"), "tree.html?type=walk-in");
  assert.equal(troubleshootHref({}, "other"), "tree.html");
});

import { needsRetake } from "../tools/plate-scan.js";

test("Retake is offered when overall confidence is low", () => {
  const f = (m, s) => ({ model: { value: "X", confidence: m }, serial: { value: "Y", confidence: s } });
  assert.equal(needsRetake({ fields: f(0.9, 0.9), hints: [] }), false);
  assert.equal(needsRetake({ fields: f(0.9, 0.3), hints: [] }), true);
  assert.equal(needsRetake({ fields: { model: { value: "X", confidence: 0.9 } }, hints: [] }), true); // serial not read
  assert.equal(needsRetake({ fields: f(0.9, 0.9), hints: ["Glare detected on the plate"] }), true);
});
