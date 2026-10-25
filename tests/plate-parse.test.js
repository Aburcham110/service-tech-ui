import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePlate, LOW_CONFIDENCE } from "../tools/plate-parse.js";

const v = (r, k) => (r.fields[k] ? r.fields[k].value : undefined);

// Generic, made-up plates. Formats are typical, but no real OEM data is used.
const SPLIT_AC = `
OUTDOOR AIR CONDITIONER
MODEL NO. XAC24-3B1A   SERIAL NO. 2326X04417
VOLTS 208/230  PH 1  HZ 60
COMPRESSOR  RLA 10.9  LRA 62.9
FAN MOTOR  FLA 1.2  HP 1/8
MIN. CIRCUIT AMPACITY 15.0
MAX. FUSE OR HACR CKT. BKR. 25
REFRIGERANT R-410A  FACTORY CHARGE 6 LBS 4 OZ
DESIGN PRESSURE HI 600 PSIG  LO 300 PSIG
`;

const RTU_3PH = `
PACKAGED ROOFTOP UNIT
M/N: PRT060-H3C   S/N: K19A55211
460-3-60
COMP. 1 RLA: 9.0 LRA: 66.1
COND FAN FLA 1.4
IND. FAN MOTOR FLA 3.1
MCA 17 MOCP 25
REFRIG. TYPE R-454B  CHARGE 128 OZ (3.63 KG)
`;

const WALKIN_CONDENSING = `
CONDENSING UNIT
MODEL ZCU-0300M2  SERIAL ZC2207-0912
208/230 V 1 Ø 60 HZ
REFRIGERANT: R404A
FACTORY CHARGE: 2.84 KG
RLA 14.2 LRA 76
MINIMUM CIRCUIT AMPS 19.2
MAX OVERCURRENT PROTECTION 30
`;

const R22_OLD = `
HEAT PUMP OUTDOOR SECTION
MODEL HP36-1A SERIAL 9804B21177
VOLTAGE 230 1PH 60HZ
R-22 CHARGE 7.5 LB
COMPRESSOR R.L.A. 16.0 L.R.A. 88.0
FAN F.L.A. 1.6
M.C.A. 21.6  M.O.P. 35
`;

const NOISY_OCR = `
MODEL NO XAC36-1C
SER1AL N0
VOLTS 2O8/23O PH 1 HZ 6O
RLA 1O.9 LRA
REFRlGERANT R-41OA
`;

const R32_MINI = `
INVERTER HEAT PUMP OUTDOOR UNIT
MODEL: MXH12-OD  SERIAL: 23B0099871
POWER SUPPLY 208/230V-1-60
REFRIGERANT R32 1.87 LBS (0.85 KG)
MCA 13 MOP 20
`;

test("split AC: every field from a fully labelled plate", () => {
  const r = parsePlate(SPLIT_AC);
  assert.equal(v(r, "model"), "XAC24-3B1A");
  assert.equal(v(r, "serial"), "2326X04417");
  assert.equal(v(r, "voltage"), "208/230");
  assert.equal(v(r, "phase"), 1);
  assert.equal(v(r, "hz"), 60);
  assert.equal(v(r, "rla"), 10.9);
  assert.equal(v(r, "lra"), 62.9);
  assert.equal(v(r, "fanFla"), 1.2);
  assert.equal(v(r, "mca"), 15);
  assert.equal(v(r, "mop"), 25);
  assert.equal(v(r, "refrigerant"), "R-410A");
  assert.equal(v(r, "charge").lb, 6.25);
  assert.equal(v(r, "charge").oz, 100);
  assert.deepEqual(r.lowConfidence, ["model"], "3B1 has a B/8 confusable, so it is flagged");
});

test("RTU: combined V-Ph-Hz, MOCP alias, oz charge normalised to lb", () => {
  const r = parsePlate(RTU_3PH);
  assert.equal(v(r, "model"), "PRT060-H3C");
  assert.equal(v(r, "serial"), "K19A55211");
  assert.equal(v(r, "voltage"), "460");
  assert.equal(v(r, "phase"), 3);
  assert.equal(v(r, "hz"), 60);
  assert.equal(v(r, "rla"), 9);
  assert.equal(v(r, "lra"), 66.1);
  assert.equal(v(r, "fanFla"), 1.4);
  assert.equal(v(r, "mca"), 17);
  assert.equal(v(r, "mop"), 25);
  assert.equal(v(r, "refrigerant"), "R-454B");
  assert.equal(v(r, "charge").lb, 8);
});

test("walk-in condensing unit: kg-only charge, Ø phase, max-overcurrent alias", () => {
  const r = parsePlate(WALKIN_CONDENSING);
  assert.equal(v(r, "refrigerant"), "R-404A");
  assert.equal(v(r, "charge").lb, 6.26);
  assert.match(r.fields.charge.note, /kg/);
  assert.equal(v(r, "phase"), 1);
  assert.equal(v(r, "mca"), 19.2);
  assert.equal(v(r, "mop"), 30);
  assert.equal(r.fields.fanFla, undefined, "no fan FLA on plate, so none invented");
});

test("dotted R.L.A./L.R.A./M.C.A./M.O.P. labels and R-22", () => {
  const r = parsePlate(R22_OLD);
  assert.equal(v(r, "refrigerant"), "R-22");
  assert.equal(v(r, "charge").lb, 7.5);
  assert.equal(v(r, "voltage"), "230");
  assert.equal(v(r, "phase"), 1);
  assert.equal(v(r, "rla"), 16);
  assert.equal(v(r, "lra"), 88);
  assert.equal(v(r, "fanFla"), 1.6);
  assert.equal(v(r, "mca"), 21.6);
  assert.equal(v(r, "mop"), 35);
});

test("R-32 mini-split: no-dash refrigerant and combined power-supply string", () => {
  const r = parsePlate(R32_MINI);
  assert.equal(v(r, "refrigerant"), "R-32");
  assert.equal(v(r, "charge").lb, 1.87);
  assert.equal(v(r, "voltage"), "208/230");
  assert.equal(v(r, "phase"), 1);
  assert.equal(v(r, "mca"), 13);
  assert.equal(v(r, "mop"), 20);
  assert.equal(r.fields.rla, undefined);
});

test("noisy OCR: O/0 and l/1 slips fixed in numbers; missing values stay blank", () => {
  const r = parsePlate(NOISY_OCR);
  assert.equal(v(r, "voltage"), "208/230");
  assert.equal(v(r, "hz"), 60);
  assert.equal(v(r, "rla"), 10.9);
  assert.equal(r.fields.lra, undefined, "LRA label with no number is not invented");
  assert.equal(r.fields.serial, undefined, "serial label with no value is not invented");
  assert.equal(r.fields.charge, undefined);
  assert.equal(v(r, "refrigerant"), "R-410A");
});

test("empty or irrelevant text yields no fields", () => {
  assert.deepEqual(parsePlate("").fields, {});
  assert.deepEqual(parsePlate("CAUTION HOT SURFACE\nDISCONNECT POWER BEFORE SERVICING").fields, {});
});

test("OCR word confidence lowers field confidence and flags it", () => {
  const words = [
    { text: "MODEL", confidence: 95 }, { text: "XAC24-3B1A", confidence: 41 },
    { text: "RLA", confidence: 93 }, { text: "10.9", confidence: 92 },
  ];
  const r = parsePlate({ text: "MODEL XAC24-3B1A\nRLA 10.9", words });
  assert.equal(r.fields.model.ocr, 41);
  assert.ok(r.fields.model.confidence < LOW_CONFIDENCE);
  assert.ok(r.lowConfidence.includes("model"));
  assert.ok(r.fields.rla.confidence >= 0.9);
  assert.ok(!r.lowConfidence.includes("rla"));
});

test("implausible combos reduce confidence but keep the read values", () => {
  const r = parsePlate("RLA 80 LRA 12\nMCA 40 MOP 20");
  assert.equal(v(r, "rla"), 80);
  assert.equal(v(r, "lra"), 12);
  assert.ok(r.lowConfidence.includes("lra"));
  assert.ok(r.lowConfidence.includes("mop"));
});

test("unlabelled FLA (no fan context) gets lower match quality", () => {
  const r = parsePlate("FLA 2.0");
  assert.equal(v(r, "fanFla"), 2);
  assert.ok(r.fields.fanFla.confidence < LOW_CONFIDENCE);
});

test("parser is pure: same input gives same output, input object not mutated", () => {
  const input = { text: SPLIT_AC, words: [] };
  const snap = JSON.stringify(input);
  assert.deepEqual(parsePlate(input), parsePlate(input));
  assert.equal(JSON.stringify(input), snap);
});

test("OCR confidence ignores short unrelated words that are substrings of a value", () => {
  const words = [{ text: "LRA", confidence: 95 }, { text: "62.9", confidence: 94 }, { text: "6", confidence: 20 }, { text: "2", confidence: 15 }];
  const r = parsePlate({ text: "LRA 62.9\nCHARGE 6 LBS", words });
  assert.equal(r.fields.lra.ocr, 94);
  assert.ok(!r.lowConfidence.includes("lra"));
});
