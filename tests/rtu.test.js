import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { TREES, chooseTree } from "../tools/trees.js";
import { pickTree, TREE_LABELS } from "../tools/tree-pick.js";
import { parsePlate, mergeParses } from "../tools/plate-parse.js";

test("rtu tree: every requested complaint branch, generic, points to plate/OEM manual", () => {
  const t = TREES.rtu; assert.equal(t.title, "RTU / packaged rooftop unit"); assert.equal(TREE_LABELS.rtu, t.title);
  const labels = t.nodes.start.options.map((o) => o.label).join("|");
  for (const re of [/No cooling/, /Poor cooling/, /gas heat/, /electric heat/, /blower/, /Economizer/, /Short cycling/, /Frozen/, /float/, /lockout/]) assert.match(labels, re);
  const all = JSON.stringify(t);
  for (const re of [/inducer/i, /pressure switch/i, /flame sens/i, /rollout/i, /high limit/i, /manifold/i, /belt/i, /VFD/, /ECM/]) assert.match(all, re);
  assert.match(t.nodes["gas-pressure"].text, /printed on the plate/);
  assert.match(t.nodes.lockout.text, /OEM manual/);
  assert.doesNotMatch(all, /\d+(?:\.\d+)?\s*(?:"|in\.?\s*w\.?c|psig|µA|°F)/i, "no invented numeric specs");
});
test("rtu routing: call card RTU, York ZS/ZF/ZJ/KE models, gas-heat plate markers; conservative otherwise", () => {
  assert.equal(chooseTree({ equipment: "RTU" }), "rtu");
  assert.equal(pickTree({ brand: "York", model: "KE060H12A1AAAAA1A1" }).tree, "rtu");
  assert.equal(pickTree({ brand: "York", model: "ZS-04N13BTAZZ10001A" }).tree, "rtu");
  assert.equal(pickTree({ brand: "York", model: "ZF078" }).tree, "rtu");
  assert.equal(pickTree({ brand: "York", model: "YCD180" }).tree, "split-ac-hp", "unknown York series keeps split/packaged");
  assert.equal(pickTree({ brand: "York", model: "YCD180", equipment: "RTU" }).tree, "rtu", "the call card's RTU wins over a brand guess");
  assert.equal(pickTree({ brand: "Carrier", model: "24ACC6", unitType: "packaged rooftop" }).tree, "rtu");
  assert.equal(pickTree({ brand: "Carrier", model: "24ACC6" }).tree, "split-ac-hp");
});
test("plate parse: packaged-rooftop type only with gas-heat + cooling markers or explicit rooftop text", () => {
  const ut = (t) => (parsePlate(t).fields.unitType || {}).value;
  assert.equal(ut("GAS FIRED CENTRAL FURNACE\nCOMP 208/230-3-60 16.0 RLA 120 LRA\nR-410A"), "packaged rooftop");
  assert.equal(ut("TYPE/GAS: NATURAL\nCOMP. #1 16 RLA 120 LRA"), "packaged rooftop");
  assert.equal(ut("PACKAGED ROOFTOP UNIT\nMODEL XYZ"), "packaged rooftop");
  assert.notEqual(ut("TYPE GAS: NATURAL\nINPUT 80000 BTUH"), "packaged rooftop", "a furnace-only plate is not an RTU");
  assert.notEqual(ut("OUTDOOR UNIT\nCOMPRESSOR 10 RLA 50 LRA\nR-410A"), "packaged rooftop");
  const D = new URL("./fixtures/plates/ocr/", import.meta.url);
  const m = mergeParses(fs.readdirSync(D).filter((f) => f.startsWith("york-zs04-rtu-phone2.")).map((f) => ({ name: f, parsed: parsePlate(fs.readFileSync(new URL(f, D), "utf8")) })));
  assert.equal(m.fields.unitType.value, "packaged rooftop");
});
