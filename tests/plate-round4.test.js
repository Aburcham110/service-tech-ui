// Round 4: the Fujitsu serial is 015057; "WWB" belongs to the printed label "SERIAL No. WWB".
import test from "node:test";
import assert from "node:assert";
import { parsePlate, mergeParses } from "../tools/plate-parse.js";

const plate = (serialLine, extra = {}) => [
  "FUJITSU GENERAL LIMITED",
  "MODEL " + (extra.model || "ASUG15LZAS"),
  "INDOOR UNIT",
  "208/230V ~ 1PH 60Hz",
  "INDOOR FAN MOTOR LOAD " + (extra.fan || "0.35 A"),
  "APPLICABLE OUTDOOR UNIT " + (extra.outdoor || "AOUG15LZAS1 / AOUG15LZAH1"),
  serialLine,
].join("\n");

// The six v8test passes Arthur reported, with mean confidences; glare psm6 is junk (44).
const PASSES = [
  ["gray psm11", 78, "SERIAL No.\nWWB 0 15057", { outdoor: "AOUG15LZAS1 | AOUG15LZAH1" }],
  ["gray psm6", 74, "SERIAL No. WWB 0 1  0057", { outdoor: "AOUG15LZAS1 AOUG15LZAH{" }],
  ["sauvola psm11", 80, "SERIAL No. WwB\n015057", { model: "ASUG15L.ZAS", outdoor: "AOUG15LZAS1IAOUG15LZAH1" }],
  ["sauvola psm6", 76, "SERIAL No. WWR / 015057.", { fan: "035 A" }],
  ["glare psm11", 60, "SERIAL No. WHB 01 S057", { model: "ASUG15LZAS" }],
  ["glare psm6", 44, "SERIAL No. WWB 0 1  0057", { model: "ASUG15LZA8", outdoor: "AOUG15LZAS1 I AOUG15LZAH{" }],
];
const runs = PASSES.map(([name, conf, s, extra]) => ({
  name, confidence: conf, parsed: parsePlate({ text: plate(s, extra), psm: name.endsWith("11") ? 11 : 6 }),
}));

test("each serial variant drops the WWB label and joins the digit groups", () => {
  const got = runs.map((r) => r.parsed.fields.serial && r.parsed.fields.serial.value);
  assert.deepStrictEqual(got, ["015057", "010057", "015057", "015057", "015057", "010057"]);
});

test("glued label and other label misreads are stripped", () => {
  for (const s of ["SERIAL No. WWB015057", "SERIALNo. WWNB015057", "SERIAL No. WVB 015057", "SERIAL No. WNB 015057", "SERIAL No. WAWB015057"]) {
    assert.strictEqual(parsePlate({ text: plate(s), psm: 6 }).fields.serial.value, "015057", s);
  }
});

test("model dots are stripped; outdoor separators | I space { all parse", () => {
  assert.strictEqual(runs[2].parsed.fields.model.value, "ASUG15LZAS");
  for (const r of runs) assert.strictEqual(r.parsed.fields.outdoorUnit.value, "AOUG15LZAS1 / AOUG15LZAH1", r.name);
  assert.strictEqual(runs[3].parsed.fields.fanFla.value, 0.35);
});

test("confidence-weighted vote: 015057 beats the 0057 misread, ASUG15LZAS beats ASUG15LZA8", () => {
  const m = mergeParses(runs);
  assert.strictEqual(m.fields.serial.value, "015057");
  assert.strictEqual(m.fields.model.value, "ASUG15LZAS");
  assert.strictEqual(m.fields.outdoorUnit.value, "AOUG15LZAS1 / AOUG15LZAH1");
  assert.strictEqual(m.fields.fanFla.value, 0.35);
  // Disagreement is still shown: the losing serial is offered as a candidate with less weight.
  const c = m.fields.serial.candidates;
  assert.ok(c && c[0].value === "015057" && c[1].value === "010057" && c[1].weight < c[0].weight);
});

test("a junk pass alone barely counts against a clean one", () => {
  const m = mergeParses([runs[5], { ...runs[0], confidence: 70 }]);
  assert.strictEqual(m.fields.model.value, "ASUG15LZAS");
});
