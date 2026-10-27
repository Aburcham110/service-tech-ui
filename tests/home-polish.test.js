import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const r = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
test("home groups tiles and has a resume card", () => {
  const h = r("index.html");
  const g = ["Call tools", "Diagnostics", "References"].map((t) => h.indexOf(`>${t}</h2>`));
  assert.ok(g.every((i) => i > 0) && g[0] < g[1] && g[1] < g[2]);
  assert.equal((h.match(/class="tile"/g) || []).length, 7);
  assert.ok(h.indexOf('id="resume-call"') < h.indexOf('id="new-call"'));
});
test("call card preview sits before Copy; chips toast; help covers it", () => {
  const c = r("call.html");
  assert.ok(c.indexOf('id="card-preview"') > 0 && c.indexOf('id="card-preview"') < c.indexOf('id="btn-copy"'));
  assert.match(r("tools/call-wizard.js"), /stToast\("Added: "/);
  const help = r("help.html");
  for (const s of ["Resume last call", "Call tools", "Preview call card", "Add to call notes", "Add results to current call", "Back to call", "Analyze in Psychrometrics", "Parts"]) assert.ok(help.includes(s), s);
});
