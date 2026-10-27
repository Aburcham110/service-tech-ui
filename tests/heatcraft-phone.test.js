import test from "node:test";
import assert from "node:assert/strict";
import { parsePlate, mergeParses } from "../tools/plate-parse.js";
import { assignIdsByPattern } from "../tools/plate-heatcraft.js";
import { HEATCRAFT_PHONE_PASSES } from "./fixtures/heatcraft-phone-passes.js";

const merge = (passes) => mergeParses(passes.map((p) => ({ name: p.name, confidence: p.confidence, parsed: parsePlate({ text: p.text, psm: p.psm }) })));

test("phone replay: model/serial by pattern, P/N never in model or serial", () => {
  const m = merge(HEATCRAFT_PHONE_PASSES).fields;
  assert.equal(m.model.value, "LCH0055LBACZA0300");
  assert.ok(m.model.confidence < 0.75, "corrected model is flagged");
  assert.equal(m.serial.value, "T21C05997");
  assert.equal(m.partNo.value, "89074001");
  for (const k of ["model", "serial"]) {
    assert.ok(!m[k].value.includes("89074001"), k);
    for (const c of m[k].candidates || []) assert.ok(!/89074001|FE$/.test(c.value), k + " candidate " + c.value);
  }
});

test("phone replay: each pass alone never puts the P/N or FE in model/serial", () => {
  for (const p of HEATCRAFT_PHONE_PASSES) {
    const f = parsePlate({ text: p.text, psm: p.psm }).fields;
    for (const k of ["model", "serial"]) if (f[k]) assert.ok(!/89074001|FE/i.test(f[k].value), p.name + " " + k + "=" + f[k].value);
  }
});

test("phone replay: garbled refrigerant list is shown, snapped, and flagged", () => {
  const r = merge(HEATCRAFT_PHONE_PASSES).fields.refrigerant;
  for (const x of ["R-404A", "R-507A", "R-407A", "R-407F", "R-407C", "R-448A", "R-449A"]) assert.ok(r.value.includes(x), x);
  assert.ok(r.confidence <= 0.55);
  assert.match(r.note, /snapped from OCR/);
});

test("assignIdsByPattern: scrambled labels, same-line model+serial, no joining", () => {
  const a = assignIdsByPattern(["SERIAL NO", "PART NO", "MODEL NO", "89074001", "fe", "LCHO055LBACZA0300 T21C05997"]);
  assert.deepEqual([a.part, a.model, a.serial], ["89074001", "LCH0055LBACZA0300", "T21C05997"]);
  const b = assignIdsByPattern(["PART NO MODEL NO SERIAL NO", "89074001 lc"]);
  assert.equal(b.part, "89074001"); assert.equal(b.model, undefined); assert.equal(b.serial, undefined);
  assert.equal(assignIdsByPattern(["nothing here"]), null);
});

test("phone replay: electrical — LRA 169, fan FLA 3.5 (not the LRA bleeding over), defrost 30", () => {
  const m = merge(HEATCRAFT_PHONE_PASSES).fields;
  assert.equal(m.lra.value, 169);
  assert.ok(m.lra.confidence < 0.6, "the 169/189 near tie is flagged");
  assert.equal(m.fanFla.value, 3.5);
  assert.equal(m.defrostA.value, 30);
  assert.equal(m.rla.value, 24.7);
});

test("LRA: a majority of low-confidence passes can win but is flagged", () => {
  const mk = (name, confidence, lra) => ({ name, confidence, psm: 11, text: "HEATCRAFT\nRLA 24.7\nLRA " + lra });
  const m = merge([mk("a", 80, 169), mk("b", 74, 189), mk("c", 70, 189)]).fields.lra;
  assert.equal(m.value, 189);
  assert.ok(m.confidence < 0.6, "outvoting the most confident pass is flagged");
  assert.ok(m.candidates.some((c) => c.value === 169));
});

test("fan FLA: never reuses another field's value; under 15 A and below RLA, else blank", () => {
  const f = (t) => parsePlate({ text: "HEATCRAFT\nRLA 24.7\nLRA 169\n" + t, psm: 6 }).fields.fanFla;
  assert.equal(f("FAN FLA 169"), undefined);
  assert.equal(f("FAN FLA 30.5"), undefined);
  assert.equal(f("COND FAN 1 1/3..3.5").value, 3.5);
  assert.equal(f("VR 85"), undefined);
});
