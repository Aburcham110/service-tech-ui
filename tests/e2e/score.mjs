// Score e2e JSON (from plate_photos.py) against tests/fixtures/plate-truth.js.
// match = right value; miss = blank; wrong = wrong value. flagged = highlighted in the confirm UI: confidence below the
// field's bar (0.75 model/serial, 0.6 others) or any review reason. --legacy scores with the old flat 0.6 rule.
import fs from "node:fs";
import { TRUTH } from "../fixtures/plate-truth.js";
import { lowBar, reviewReasons } from "../../tools/plate-parse.js";
const legacy = process.argv.includes("--legacy");
let BRAND = null;
const isLow = (k, f) => legacy ? f.confidence < 0.6 : f.confidence < lowBar(k) || reviewReasons(k, f, BRAND).length > 0;
const R = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const norm = (x) => String(x).toUpperCase().replace(/\s+/g, " ").trim();
const normO = (x) => norm(x).replace(/O/g, "0");
const rows = [];
for (const [name, truth] of Object.entries(TRUTH)) {
  const ph = R.photos[name]; if (!ph) continue;
  BRAND = ph.fields && ph.fields.brand ? ph.fields.brand.value : null;
  const c = { match: 0, miss: 0, wrongFlagged: 0, wrongUnflagged: 0, details: [] };
  for (const [k, want] of Object.entries(truth)) {
    let f = ph.fields[k];
    if (f && f.value && typeof f.value === "object") f = { ...f, value: f.value.lb ?? f.value.display };
    if (want === null) { if (f) { c[isLow(k, f) ? "wrongFlagged" : "wrongUnflagged"]++; c.details.push(k + "≠blank:" + f.value); } continue; }
    if (!f) { c.miss++; c.details.push(k + ":miss"); continue; }
    const v = typeof want === "number" ? Number(f.value) === want : norm(f.value).startsWith(norm(want));
    const exactish = typeof want === "number" ? v : norm(f.value) === norm(want) || norm(f.value).startsWith(norm(want));
    if (!exactish && isLow(k, f) && normO(f.value) === normO(want)) { c.match++; c.details.push(k + " O/0 only, flagged"); }
    else if (exactish) c.match++;
    else { c[isLow(k, f) ? "wrongFlagged" : "wrongUnflagged"]++; c.details.push(k + "=" + f.value + (isLow(k, f) ? " [flagged]" : " [UNFLAGGED]")); }
  }
  rows.push({ name, fields: Object.keys(truth).length, ...c, timing: ph.timing });
}
for (const r of rows) console.log(`${r.name.padEnd(30)} n=${r.fields} match=${r.match} miss=${r.miss} wrong(flagged)=${r.wrongFlagged} wrong(UNFLAGGED)=${r.wrongUnflagged} | ${r.details.join(", ")}` + (r.timing ? ` | total=${r.timing.total}ms passes=${r.timing.passes.length} stop=${r.timing.stoppedAfter || "-"}` : ""));
