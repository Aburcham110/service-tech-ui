import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";

const code = readFileSync(new URL("../apps-script/Code.gs", import.meta.url), "utf8");

function env() {
  const sheets = { Submissions: { rows: [] } };
  const mkSheet = (o) => ({ appendRow: (r) => o.rows.push(Array.from(r)), getLastRow: () => o.rows.length });
  const ss = {
    getSheetByName: (n) => (sheets[n] ? mkSheet(sheets[n]) : null),
    insertSheet: (n) => { sheets[n] = { rows: [] }; return mkSheet(sheets[n]); },
  };
  const out = (s) => ({ s, setMimeType() { return this; } });
  const ctx = { SpreadsheetApp: { openById: () => ss }, ContentService: { createTextOutput: out, MimeType: { JSON: "json" } }, JSON, String, Date };
  vm.runInNewContext(code, ctx);
  const post = (p) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(p) } }).s);
  return { post, sheets };
}

test("Code.gs: feedback creates the Feedback tab with headers and appends Status New", () => {
  const { post, sheets } = env();
  assert.deepEqual(post({ type: "feedback", message: "Great app", version: "v29" }), { ok: true });
  assert.deepEqual(sheets.Feedback.rows[0], ["Timestamp", "Message", "App version", "Status"]);
  const r = sheets.Feedback.rows[1];
  assert.ok(r[0] instanceof Date || typeof r[0] === "object");
  assert.deepEqual(r.slice(1), ["Great app", "v29", "New"]);
  post({ type: "feedback", message: "=HYPERLINK(1)", version: "v29" });
  assert.equal(sheets.Feedback.rows[2][1], "'=HYPERLINK(1)", "formulas are neutralized");
  assert.deepEqual(post({ type: "feedback", message: "  ", version: "v29" }), { ok: false });
  assert.equal(sheets.Feedback.rows.length, 3, "headers written once");
  assert.equal(sheets.Submissions.rows.length, 0, "feedback never lands in Submissions");
});

test("Code.gs: missing-model path unchanged", () => {
  const { post, sheets } = env();
  assert.deepEqual(post({ brand: "Heatcraft", model: "LCH0055", match: "brand", app: "service-tech-ui" }), { ok: true });
  assert.deepEqual(sheets.Submissions.rows[0].slice(1), ["Heatcraft", "LCH0055", "brand", "service-te", "new", ""]);
  assert.equal(sheets.Feedback, undefined);
  // The original missing-model lines are present verbatim.
  for (const l of [
    "  var brand = clean(p.brand, 60), model = clean(p.model, 40);",
    "  if (!model) return ContentService.createTextOutput('{\"ok\":false}');",
    "  var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Submissions');",
    "  sh.appendRow([new Date(), brand, model, clean(p.match, 20), clean(p.app, 10), 'new', '']);",
  ]) assert.ok(code.includes(l), l);
  // When the deployed original is on this machine, every one of its lines is still present verbatim.
  const ORIG = "/workspace/missing-model/Code.gs";
  if (existsSync(ORIG)) for (const l of readFileSync(ORIG, "utf8").split("\n").filter(Boolean)) assert.ok(code.includes(l), l);
});
