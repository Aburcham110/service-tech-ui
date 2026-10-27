import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePlate, mergeParses, LOW_CONFIDENCE_ID } from "../tools/plate-parse.js";
import { snapRefrigerant, snapRow, fixHeatcraftModel, parseHeaderRow, HEATCRAFT_SERIAL } from "../tools/plate-heatcraft.js";
import { pickTree } from "../tools/tree-pick.js";
import { chooseTree } from "../tools/trees.js";

// The OCR text of the Heatcraft LCH0055 plate (PSM 6 and PSM 11 layouts), trimmed to the ID rows.
const PSM6 = `HEATCRAFT
PART NO. MODEL NO. SERIAL NO
89074001 LCHO055LBACZA0300 T21C05997
P/N: 89074001`;
const PSM11 = `HEATCRAFT
PART NO.
MODEL NO.
SERIAL NO
89074001
LCHO055LBACZA0300 T21C05997
89074001
P/N: 89074001`;
// Before the fix: generic label parsing put 89074001 in both model and serial (serial "matched the barcode caption").
const BUGGY = `HEATCRAFT
MODEL NO.
SERIAL NO
89074001
P/N: 89074001
89074001`;

test("heatcraft: the P/N 89074001 never lands in model or serial, and never in two fields", () => {
  for (const [t, psm] of [[PSM6, 6], [PSM11, 11]]) {
    const f = parsePlate({ text: t, psm }).fields;
    assert.equal(f.partNo.value, "89074001");
    assert.equal(f.model.value, "LCH0055LBACZA0300");
    assert.equal(f.serial.value, "T21C05997");
  }
  const f = parsePlate({ text: BUGGY, psm: 11 }).fields;
  assert.equal(f.model, undefined); assert.equal(f.serial, undefined);
  assert.doesNotMatch(JSON.stringify(f), /barcode caption/);
});

test("heatcraft: model O->0 / S->5 fix only in number slots, and it is flagged", () => {
  assert.deepEqual(fixHeatcraftModel("LCHO055LBACZAO300"), { value: "LCH0055LBACZA0300", changed: true, ok: true });
  assert.equal(fixHeatcraftModel("LCHO0SSLBACZAG300").ok, false, "G is not fixed");
  assert.equal(fixHeatcraftModel("LCH0055LBACZA0300").changed, false);
  const m = parsePlate({ text: PSM6 }).fields.model;
  assert.ok(m.confidence < LOW_CONFIDENCE_ID && /O->0/.test(m.note));
  const bad = parsePlate({ text: PSM6.replace("LCHO055LBACZA0300", "LCHO0SSLBACZAG300") }).fields.model;
  assert.ok(bad.confidence < LOW_CONFIDENCE_ID);
});

test("heatcraft: serial format letter+2 digits+letter+digits; voting prefers the format-fitting read", () => {
  assert.ok(HEATCRAFT_SERIAL.test("T21C05997")); assert.ok(!HEATCRAFT_SERIAL.test("121C059917"));
  const good = { name: "a psm11", confidence: 60, parsed: parsePlate({ text: PSM6 }) };
  const off = { name: "b psm11", confidence: 72, parsed: parsePlate({ text: PSM6.replace("T21C05997", "121C059917") }) };
  assert.ok(off.parsed.fields.serial.confidence <= 0.5);
  assert.equal(mergeParses([off, good]).fields.serial.value, "T21C05997");
});

test("heatcraft: header row is read by column", () => {
  assert.deepEqual(parseHeaderRow(PSM6.split("\n")), { part: "89074001", model: "LCHO055LBACZA0300", serial: "T21C05997", line: 2 });
  assert.equal(parseHeaderRow(PSM11.split("\n")).serial, "T21C05997");
});

test("refrigerant snapping: unique matches only, every approved refrigerant listed", () => {
  assert.equal(snapRefrigerant("RAOTC"), "R407C");
  assert.deepEqual(snapRow("RADAAIRSO7A"), ["R404A", "R507A"]);
  assert.deepEqual(snapRow("RAOTAIRAOTF"), ["R407A", "R407F"]);
  assert.deepEqual(snapRow("RA4BATRA49A"), ["R448A", "R449A"]);
  assert.equal(snapRow("RADAAIRG07A"), null, "G07A is not unambiguous");
  const plate = "HEATCRAFT\nTYPE MIN MAX/COOLER FREEZER\nRADAAIRSO7A —40 0 3.15\nRAOTAIRAOTF —40 0 3.15\nRAOTC —40 0 3.15\nRA4BAIRA49A —40 0 3.15\n";
  assert.equal(parsePlate(plate).fields.refrigerant.value, "R-404A/R-507A, R-407A/R-407F, R-407C, R-448A/R-449A");
  assert.equal(parsePlate(plate.replace("RAOTC", "RA9QC")).fields.refrigerant, undefined, "an unreadable row leaves it blank");
});

test("amps: decimal restored when another pass agrees; a lone no-decimal value is flagged", () => {
  const a = { name: "a", parsed: parsePlate("RLA 247") }, b = { name: "b", parsed: parsePlate("RLA 24.7") };
  const m = mergeParses([a, b]).fields.rla;
  assert.equal(m.value, 24.7);
  const lone = mergeParses([{ name: "a", parsed: parsePlate("MCA 443") }]).fields.mca;
  assert.ok(!lone || lone.confidence < 0.6);
});

test("heatcraft condensing unit routes to the walk-in tree", () => {
  const f = parsePlate("HEATCRAFT\nFOR OUT DOOR USE\nwalk —in freezer applications\n").fields;
  assert.equal(f.unitType.value, "condensing unit");
  assert.equal(f.application.value, "walk-in freezer, outdoor");
  assert.equal(pickTree({ brand: "Heatcraft", unitType: "condensing unit" }).tree, "walk-in");
  assert.equal(chooseTree({ unitType: "condensing unit" }), "walk-in");
});
