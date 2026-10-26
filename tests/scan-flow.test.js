import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STEPS, INSTRUCTIONS, plainStage, etaText, progressLine, reviewSummaryText, whereItWent, LOOKS_RIGHT_HELP } from "../tools/scan-flow.js";
import { manualHref } from "../tools/call-card.js";

const src = (f) => readFileSync(new URL("../tools/" + f, import.meta.url), "utf8");

test("five numbered steps in order, each with a one-line instruction", () => {
  assert.deepEqual(STEPS.map((s) => s.label), ["Photo", "Crop", "Reading", "Check", "Done"]);
  for (const s of STEPS) { assert.ok(INSTRUCTIONS[s.id], s.id); assert.ok(!INSTRUCTIONS[s.id].includes("\n")); }
  assert.equal(INSTRUCTIONS.crop, "Drag the 4 corners to the plate edges, then tap Use this crop.");
  assert.match(INSTRUCTIONS.check, /Looks right/);
});

test("plain progress status and estimate", () => {
  assert.equal(plainStage("Reading plate, pass 2/4…"), "Reading plate, pass 2 of 4");
  assert.equal(plainStage("Finding orientation 3/4…"), "Finding which way is up (3 of 4)");
  assert.equal(etaText(0, 0), "usually 10–40 s");
  assert.equal(etaText(4000, 0.5), "a few seconds left");
  assert.equal(etaText(10000, 0.4), "about 15 s left");
  assert.equal(etaText(60000, 0.25), "about 3 min left");
  assert.equal(etaText(9000, 1), "");
  assert.equal(progressLine("Reading plate, pass 2/4…", 10000, 0.4), "Reading plate, pass 2 of 4 · about 15 s left");
});

test("review summary text", () => {
  assert.equal(reviewSummaryText(7, 2), "7 fields filled, 2 need your check");
  assert.equal(reviewSummaryText(1, 1), "1 field filled, 1 needs your check");
  assert.match(reviewSummaryText(5, 0), /none flagged — still compare/);
  assert.match(reviewSummaryText(0, 0), /No fields read/);
  assert.match(LOOKS_RIGHT_HELP, /Model and serial must be ticked/);
  assert.match(LOOKS_RIGHT_HELP, /Nothing is saved until/);
});

test("Done screen: where the data went, manual link", () => {
  const w = whereItWent({ brand: "Carrier", model: "24ACC636A003", serial: "1234A56789", refrigerant: "R-410A", rla: "14.1" });
  assert.match(w[0], /Call card → Open step: Data plate box \(Carrier, model 24ACC636A003, serial 1234A56789\), Refrigerant R-410A, FLA\/RLA 14.1 — all still editable/);
  assert.match(w[1], /This phone/);
  assert.equal(whereItWent({}, { onCard: false }).length, 1);
  assert.equal(manualHref({ brand: "Carrier", model: "24 ACC/6" }), "manuals.html?brand=Carrier&model=24+ACC%2F6");
  assert.equal(manualHref({}), "manuals.html");
});

test("safety checks kept: forced Looks right gate, low-conf flags, blanks; one primary per step", () => {
  const ps = src("plate-scan.js");
  assert.match(ps, /ok\.disabled = pending\.length > 0/);
  assert.match(ps, /if \(ok\.disabled\) return;/);
  assert.match(ps, /classList\.add\("low-conf"\)/);
  assert.match(ps, /Blank = not read/);
  assert.match(ps, /"📷 Take photo"/);
  assert.match(ps, /link-btn plate-retake-btn"/); // banner retake is a link; the single primary is the Retake in the actions
  assert.match(ps, /btn btn-secondary plate-confirm-btn" : "btn btn-primary btn-big plate-confirm-btn"/); // retake leads when unreliable
  assert.match(ps, /link-btn plate-discard/);
  const pc = src("plate-crop.js");
  assert.match(pc, /btn btn-primary btn-big plate-crop-use"; use.textContent = "Use this crop"/);
  assert.match(pc, /link-btn plate-crop-skip/);
  assert.match(src("call-card.js"), /btn btn-primary btn-big scan-done-primary/);
});
