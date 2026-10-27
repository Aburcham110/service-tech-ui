import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parsePlate, mergeParses } from "../tools/plate-parse.js";

const v = (r, k) => r.fields[k] && r.fields[k].value;
// Clean transcription of the York ZS RTU plate (tests/fixtures/plates/york-zs04-rtu.jpg).
const YORK = `
UNITARY PRODUCTS GROUP NORMAN, OK 73069
Serial No. N1D1914801
Model No. ZS-04N13BTAZZ10001A
UNIT VOLTAGE: 208/230-3-60
MINIMUM CIRCUIT AMPACITY: 29.9/29.9
MAXIMUM FUSE SIZE (TIME DELAY): 40/40
QTY LOAD HP VOLT-PH-HZ RLA/FLA LRA
1 COMP. #1 208/230-3-60 16.0 RLA 120 LRA
1 ID BLOWER 1.00 208/230-1-60 7.6 FLA
1 OD FAN #1 0.5 208/230-1-60 2.3 FLA
1 COMB BLWR 0.05 208/230-1-60 0.78 FLA
FACTORY CHARGED SYS #1 R-410A 4 LBS. 4 OZ.
TEST PRESS. HIGH SIDE 445 PSIG LOW SIDE 236 PSIG
`;

test("York RTU: load table rows, dashed model, SYS #1 charge, 3-phase", () => {
  const r = parsePlate(YORK);
  assert.equal(v(r, "brand"), "Unitary Products Group (York/Coleman)");
  assert.equal(v(r, "model"), "ZS-04N13BTAZZ10001A");
  assert.ok(!/doesn't fit/.test(r.fields.model.note || ""), "dashed UPG model fits");
  assert.equal(v(r, "serial"), "N1D1914801");
  assert.equal(v(r, "voltage"), "208/230");
  assert.equal(v(r, "phase"), 3);
  assert.equal(v(r, "hz"), 60);
  assert.equal(v(r, "rla"), 16);
  assert.equal(v(r, "lra"), 120);
  assert.equal(v(r, "fanFla"), 2.3, "OD FAN row, not ID blower 7.6 or comb blower 0.78");
  assert.equal(v(r, "mca"), 29.9);
  assert.equal(v(r, "mop"), 40);
  assert.equal(v(r, "refrigerant"), "R-410A");
  assert.equal(v(r, "charge").lb, 4.25);
});

test("load table without a UNIT VOLTAGE line: phase from the COMP row, never a 1-phase motor row", () => {
  const r = parsePlate(YORK.replace(/UNIT VOLTAGE.*\n/, ""));
  assert.equal(v(r, "phase"), 3);
  const sparse = parsePlate({ psm: 11, text: "1 ID BLOW\n1.00\n208/230-1-60\n7.6 FLA\nOD FAN #1\n0.5\n208/230-1-60\n2.3 FLA\nCOMB BLWR\n0.05\n0.78 FLA" });
  assert.equal(v(sparse, "fanFla"), 2.3);
  assert.notEqual(v(sparse, "phase"), 1);
});

test("charge: PSIG and HP values are never a charge; grams need a g unit and a charge label", () => {
  for (const t of ["PRESS. HIGH SIDE 445 PSS, L w soe r 23g/Psic", "r 23g", "1 COMB BLWR 0.05 HP 208/230-1-60 0.78 FLA", "OD FAN 0.5 HP 2.3 FLA 4 LBS"]) {
    assert.equal(v(parsePlate(t), "charge"), undefined, t);
  }
  assert.equal(v(parsePlate("FACTORY CHARGE R-410A 1200 g"), "charge").lb, 2.65);
});

test("refrigerant after SYS #1 is snapped only when one OCR slip from a unique code, and flagged", () => {
  const r = parsePlate("FACTORY CHARGED SYS #1 R-41OA").fields.refrigerant;
  assert.equal(r.value, "R-410A");
  assert.equal(parsePlate("FACTORY CHARGED SYS #1 ars Lr").fields.refrigerant, undefined);
});

test("York phone photo: merged OCR passes never show a wrong value unflagged", () => {
  const dir = new URL("./fixtures/plates/ocr/", import.meta.url);
  const files = fs.readdirSync(dir).filter((f) => f.startsWith("york-zs04-rtu."));
  assert.equal(files.length, 6);
  const m = mergeParses(files.map((f) => ({ name: f, confidence: 50, parsed: parsePlate({ text: fs.readFileSync(new URL(f, dir), "utf8") }) }))).fields;
  assert.equal(m.fanFla.value, 2.3);
  assert.equal(m.phase.value, 3);
  assert.equal(m.rla.value, 16);
  assert.equal(m.lra.value, 120);
  assert.equal(m.serial.value, "N1D1914801");
  assert.ok(m.serial.confidence >= 0.75, "serial read the same in two passes");
  assert.equal(m.model.value, "ZS-04N13BTAZZ10001A");
  assert.ok(m.model.confidence < 0.75, "model found without its label is flagged");
  assert.equal(m.charge, undefined, "charge text unreadable in every pass: blank, not 0.05 lb");
  assert.equal(m.refrigerant, undefined, "R-410A unreadable in every pass: blank");
});

test("sw precaches every tools/ module the app imports (offline scanner)", () => {
  const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  const dir = new URL("../tools/", import.meta.url);
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".js"))) {
    for (const m of fs.readFileSync(new URL(f, dir), "utf8").matchAll(/from\s+"\.\/([\w-]+\.js)\?v=\d+"/g)) {
      assert.ok(sw.includes("./tools/" + m[1]), m[1] + " (imported by " + f + ") is precached");
    }
  }
});

test("york live OCR: compas row, lost dual-volt slash, unlabelled dashed model, MIN/MAX volts ignored", async () => {
  const { parsePlate } = await import("../tools/plate-parse.js");
  const f = parsePlate("MIN/MAX VOLTAGE 187V/252V\nwon ZS-04N13BTAZZ10001A\n1 compas \\208230-3-60 16.0 RLA 120 LRA\nID BLO 208/230-3-60 5.6 FLA\n").fields;
  assert.equal(f.voltage.value, "208/230"); assert.equal(f.phase.value, 3);
  assert.equal(f.rla.value, 16); assert.equal(f.lra.value, 120);
  assert.equal(f.model.value, "ZS-04N13BTAZZ10001A"); assert.ok(f.model.confidence < 0.6);
  assert.equal(parsePlate("MIN/MAX VOLTAGE 187V/252V\n").fields.voltage, undefined);
});
test("squareProbeBox: tall plates probe a centered square, normal ones the full frame", async () => {
  const { squareProbeBox } = await import("../tools/plate-scan.js");
  assert.deepEqual(squareProbeBox(1868, 4000), { x: 0, y: 1066, s: 1868 });
  assert.equal(squareProbeBox(1200, 1000), null);
});
