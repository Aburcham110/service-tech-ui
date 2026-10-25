import test from "node:test";
import assert from "node:assert/strict";
import { parsePlate, mergeParses, reviewReasons, spatialCheck, SERIAL_PATTERNS, LOW_CONFIDENCE_ID, lowBar } from "../tools/plate-parse.js";
import { squareToQuad, applyH } from "../tools/plate-crop.js";

test("model/serial use the 0.75 bar, other fields 0.6", () => {
  assert.equal(LOW_CONFIDENCE_ID, 0.75);
  assert.equal(lowBar("model"), 0.75); assert.equal(lowBar("serial"), 0.75); assert.equal(lowBar("mca"), 0.6);
});

test("serial shape per brand: good shapes pass, bad ones flag (no decoding)", () => {
  const good = { Carrier: "1234A56789", Trane: "21451ABC1L", "Unitary Products Group (York/Coleman)": "W1J1234567", Copeland: "21E123456", Goodman: "1906123456", Lennox: "5819F12345", Rheem: "W061512345", Fujitsu: "ETN012345", Daikin: "1234567K" };
  for (const [b, s] of Object.entries(good)) assert.ok(SERIAL_PATTERNS[b].test(s), b + " " + s);
  for (const [b, s] of Object.entries({ Carrier: "12A4567", Goodman: "19061234", Fujitsu: "1234567" })) {
    assert.ok(!SERIAL_PATTERNS[b].test(s), b + " " + s);
    assert.ok(reviewReasons("serial", { value: s, confidence: 0.95 }, b).some((r) => /usual/.test(r)));
  }
  const r = parsePlate({ text: "GOODMAN MFG\nSERIAL NO. 19061234\nMODEL GSX140361" });
  assert.ok(r.lowConfidence.includes("serial"));
  assert.match(r.fields.serial.note, /usual Goodman serial/);
});

test("confusable characters always produce a review reason", () => {
  assert.ok(reviewReasons("model", { value: "38AB3B1", confidence: 0.9 }, null).some((r) => /look-alike/.test(r)));
  assert.deepEqual(reviewReasons("model", { value: "24ACC636A003", confidence: 0.9 }, "Carrier"), []);
  assert.deepEqual(reviewReasons("mca", { value: 20, confidence: 0.1 }, null), [], "only model/serial get review reasons");
});

test("passes that disagree on serial keep both candidates and flag the field", () => {
  const a = parsePlate({ text: "MODEL 24ACC636A003\nSERIAL 1234A56789" }), b = parsePlate({ text: "MODEL 24ACC636A003\nSERIAL 1234A56780" });
  const m = mergeParses([{ name: "a", parsed: a }, { name: "b", parsed: b }]);
  assert.equal(m.fields.serial.candidates.length, 2);
  assert.deepEqual(m.fields.serial.candidates.map((c) => c.value).sort(), ["1234A56780", "1234A56789"]);
  assert.ok(m.lowConfidence.includes("serial"));
  assert.equal(m.fields.model.candidates, undefined, "agreeing passes have no candidates");
});

test("spatial check: value right of or below label passes; elsewhere fails", () => {
  const w = (text, x0, y0, x1, y1) => ({ text, confidence: 90, bbox: { x0, y0, x1, y1 } });
  assert.equal(spatialCheck([w("MODEL", 10, 10, 80, 30), w("24ACC636A003", 90, 12, 250, 30)], "MODEL", "24ACC636A003"), true);
  assert.equal(spatialCheck([w("MODEL", 10, 10, 80, 30), w("24ACC636A003", 10, 40, 170, 60)], "MODEL", "24ACC636A003"), true);
  assert.equal(spatialCheck([w("MODEL", 300, 10, 370, 30), w("24ACC636A003", 10, 400, 170, 420)], "MODEL", "24ACC636A003"), false);
  assert.equal(spatialCheck([{ text: "MODEL", confidence: 90 }], "MODEL", "X"), null, "no boxes = unknown");
});

test("homography maps unit square corners onto the quad", () => {
  const q = [[10, 20], [200, 5], [220, 180], [0, 150]];
  const H = squareToQuad(q);
  [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([u, v], i) => {
    const [x, y] = applyH(H, u, v);
    assert.ok(Math.abs(x - q[i][0]) < 1e-6 && Math.abs(y - q[i][1]) < 1e-6, String(i));
  });
});

test("Arthur's phone dump (4 passes, gray/sauvola x psm6/psm11) parses and agrees", async () => {
  const fs = await import("node:fs");
  const t = fs.readFileSync(new URL("./fixtures/plates/ocr/fujitsu-asug15lzas-phone-4pass.txt", import.meta.url), "utf8");
  const passes = [...t.matchAll(/--- (.+?) \(mean conf \d+\) ---\n([\s\S]*?)(?=\n--- |$)/g)]
    .map((m) => ({ name: m[1], parsed: parsePlate({ text: m[2], psm: /psm11/.test(m[1]) ? 11 : 6 }) }));
  assert.equal(passes.length, 4);
  // Every pass, psm11 included, reads model and serial; spaces removed they all agree.
  for (const p of passes) {
    assert.equal(p.parsed.fields.model.value.replace(/\s/g, ""), "ASUG15LZAS", p.name + " model");
    assert.equal(p.parsed.fields.serial.value.replace(/\s/g, ""), "WWB015057", p.name + " serial");
  }
  const m = mergeParses(passes);
  const want = { brand: "Fujitsu", unitType: "indoor", model: "ASUG15LZAS", serial: "WWB015057", voltage: "208/230", phase: "1", hz: "60", fanFla: 0.35, outdoorUnit: "AOUG15LZAS1 / AOUG15LZAH1" };
  for (const [k, v] of Object.entries(want)) assert.equal(String(m.fields[k].value), String(v), k);
  assert.equal(m.fields.model.candidates, undefined); assert.equal(m.fields.serial.candidates, undefined);
  assert.equal(m.fields.fanFla.confidence, 0.85, "explicit 0.35 A beats the inferred 035A");
  for (const k of ["refrigerant", "charge", "rla", "lra", "mca", "mop"]) assert.equal(m.fields[k], undefined, k + " stays blank");
});

test("amps: 035A becomes 0.35 and an explicit-decimal pass wins over inferred ones", () => {
  const inf = parsePlate({ text: "INDOOR FAN MOTOR LOAD\n035A" });
  assert.equal(inf.fields.fanFla.value, 0.35); assert.match(inf.fields.fanFla.note, /inferred/);
  const a = parsePlate({ text: "INDOOR FAN MOTOR LOAD\n053A" }), b = parsePlate({ text: "INDOOR FAN MOTOR LOAD\n053A" }), c = parsePlate({ text: "INDOOR FAN MOTOR LOAD\n0.35 A" });
  const m = mergeParses([{ name: "g6", parsed: a }, { name: "s6", parsed: b }, { name: "g11", parsed: c }]);
  assert.equal(m.fields.fanFla.value, 0.35);
});

test("non-ID fields: disagreeing passes show candidates", () => {
  const m = mergeParses([{ name: "a psm6", parsed: parsePlate({ text: "MCA 15\nMOP 25" }) }, { name: "b psm11", parsed: parsePlate({ text: "MCA 16\nMOP 25" }) }]);
  assert.deepEqual(m.fields.mca.candidates.map((c) => c.value).sort(), [15, 16]);
  assert.equal(m.fields.mca.value, 15, "tie goes to psm6");
});
