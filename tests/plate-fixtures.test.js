import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parsePlate, mergeParses, fixDigits } from "../tools/plate-parse.js";
import { FIXTURES } from "./fixtures/plate-text.js";

const val = (f) => (f == null ? undefined : f.value && f.value.lb != null ? f.value.lb : f.value);

for (const fx of FIXTURES) {
  test("fixture: " + fx.name, () => {
    const r = parsePlate(fx.text);
    for (const [k, want] of Object.entries(fx.expect)) assert.equal(val(r.fields[k]), want, k);
    for (const k of fx.blank || []) assert.equal(r.fields[k], undefined, k + " must stay blank");
    for (const k of fx.low || []) assert.ok(r.lowConfidence.includes(k), k + " should be low confidence");
  });
}

test("fixDigits maps O/I/S/B/Z only in numeric context and protects OZ", () => {
  assert.equal(fixDigits("2O8/23O"), "208/230");
  assert.equal(fixDigits("l6.7"), "16.7");
  assert.equal(fixDigits("1S.4"), "15.4"); assert.equal(fixDigits("79.O"), "79.0"); assert.equal(fixDigits("SERIAL"), "SERIAL");
  assert.equal(fixDigits("1S4"), "154");
  assert.equal(fixDigits("4 OZ"), "4 OZ");
  assert.equal(fixDigits("MODEL"), "MODEL");
});

test("mergeParses: majority beats a lone confident misread, disagreement lowers confidence", () => {
  const a = { name: "a", parsed: parsePlate("MCA 17.5") };
  const b = { name: "b", parsed: parsePlate("MCA 17.5") };
  const c = { name: "c", parsed: parsePlate("MCA 1") };
  const m = mergeParses([c, a, b]);
  assert.equal(m.fields.mca.value, 17.5);
  const m2 = mergeParses([a, c]);
  assert.ok(m2.fields.mca.confidence <= 0.6 && /disagree/.test(m2.fields.mca.note));
});

// Real photos: OCR text dumped from the offline browser pipeline (all 4 passes), merged.
const DIR = new URL("./fixtures/plates/ocr/", import.meta.url);
const merged = (name) => mergeParses(fs.readdirSync(DIR).filter((f) => f.startsWith(name + ".")).map((f) => ({ name: f, parsed: parsePlate(fs.readFileSync(new URL(f, DIR), "utf8")) })));
const NEVER_WRONG = (m, truth, name) => {
  for (const [k, f] of Object.entries(m.fields)) {
    if (!(k in truth)) continue;
    if (truth[k] === null) assert.equal(f, undefined, k + " must stay blank");
    else if (val(f) !== truth[k] && !(typeof truth[k] === "string" && String(val(f)).replace(/O/g, "0") === truth[k].replace(/O/g, "0") && f.confidence < 0.6)) assert.ok(f.confidence < 0.6, `${k}: wrong value ${JSON.stringify(val(f))} must at least be flagged low`);
  }
};
import { TRUTH } from "./fixtures/plate-truth.js";
export { TRUTH };
for (const [name, truth] of Object.entries(TRUTH)) {
  test("real photo OCR text: " + name + " has no unflagged wrong values and required blanks stay blank", () => NEVER_WRONG(merged(name), truth, name));
}
test("real photo OCR text: key reads that the pipeline does get", () => {
  const f = merged("fujitsu-asug15lzas").fields;
  assert.equal(f.serial.value, "WWB015057"); assert.equal(f.voltage.value, "208/230"); assert.equal(f.fanFla.value, 0.35);
  assert.equal(f.outdoorUnit.value, "AOUG15LZAS1 / AOUG15LZAH1"); assert.equal(f.unitType.value, "indoor");
  const u = merged("unitary-brcs0301bdg-r22").fields;
  for (const [k, w] of [["rla", 13.6], ["lra", 73], ["mca", 17.5], ["fanFla", 0.5], ["mop", 30]]) assert.equal(u[k].value, w, k);
  assert.ok(u.mop.confidence < 0.6, "obscured MOP is flagged");
  assert.equal(merged("copeland-rst64c1e-compressor").fields.serial.value, "19F03763E");
});

test("round2: barcode caption cross-check flags a model that differs only by confusable chars", async () => {
  const { parsePlate } = await import("../tools/plate-parse.js");
  const r = parsePlate({ text: "MODEL BRCS03013DG\nSERIAL W0A5383402\nZBRCS0301BDG\n" });
  assert.ok(r.lowConfidence.includes("model"));
  assert.match(r.fields.model.note, /barcode caption reads ZBRCS0301BDG/);
  assert.equal(r.fields.model.value, "BRCS03013DG", "never silently replaced");
});

test("round2: brand model-format check flags off-pattern models", async () => {
  const { parsePlate } = await import("../tools/plate-parse.js");
  const bad = parsePlate({ text: "FUJITSU GENERAL\nMODEL AQUG15LZAHS\n" });
  assert.ok(bad.lowConfidence.includes("model")); assert.match(bad.fields.model.note, /usual Fujitsu/);
  const ok = parsePlate({ text: "FUJITSU GENERAL\nMODEL AOUG15LZAH1\n" });
  assert.ok(!/usual Fujitsu/.test(ok.fields.model.note || ""));
});

test("round2: an address 'York' is not the brand; UPG address maps to Unitary Products Group", async () => {
  const { parsePlate } = await import("../tools/plate-parse.js");
  assert.equal(parsePlate({ text: "5005 York Drive\nNorman, OK 73069\nMODEL BRCS0301BDG" }).fields.brand.value, "Unitary Products Group (York/Coleman)");
  assert.equal(parsePlate({ text: "Made in York, PA\nMODEL X1234" }).fields.brand, undefined);
  assert.equal(parsePlate({ text: "YORK\nMODEL YCJD36S41S1A" }).fields.brand.value, "York");
});

test("round2: 3/B, 0/O, 1/I at letter-digit boundaries are flagged", async () => {
  const { parsePlate } = await import("../tools/plate-parse.js");
  for (const m of ["AB3D45", "XY1B42", "RC0A123"]) assert.ok(parsePlate({ text: "MODEL " + m }).lowConfidence.includes("model"), m);
});
