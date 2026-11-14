import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { matchManuals, literalPrefix, MIN_PREFIX, brandOptions } from "../tools/manual-match.js";

const json = (p) => JSON.parse(readFileSync(new URL("../" + p, import.meta.url), "utf8"));
const REAL = json("data/manual-index.json");
const MI = json("data/manuals-index.json");
const opts = brandOptions(Object.keys(MI.brands).sort().map((k) => ({ value: k, aliases: MI.brands[k].aliases })), REAL.entries);
const pick = (label) => { const o = opts.find((x) => x.label === label); assert.ok(o, label + " in the brand picker"); return o.value; };
const GD_URL = "https://gdchillers.com/wp-content/uploads/1970/01/Single-Dual-Stage-Chiller-Manual-2021a.pdf";

test("data: every non-blank key has >= 3 literal characters before its first * (no exceptions)", () => {
  const bad = REAL.entries.flatMap((e) => e.matchKeys.filter((k) => literalPrefix(k) < MIN_PREFIX).map((k) => e.brand + ": " + k));
  assert.deepEqual(bad, []);
});

test("data: G&D Chillers selected, GD-3H matches the G&D chiller manual (CSV row 102)", () => {
  const gd = pick("G&D Chillers");
  for (const m of ["GD-3H", "gd 3h", "GD-13.5H", "GD-5x5H", "GD-5X5H", "GD-7x7H", "GD-10H"]) {
    assert.deepEqual(matchManuals(REAL, { brand: gd, model: m }).map((r) => r.url), [GD_URL], m);
  }
  // "." is literal and "x" is not a wildcard; whole-model match only.
  for (const m of ["GD-1335H", "GD-13X5H", "GD-135H", "GD-55H", "GD-3", "GD-3HX"]) assert.deepEqual(matchManuals(REAL, { brand: gd, model: m }), [], m);
  assert.deepEqual(matchManuals(REAL, { brand: "Daikin", model: "GD-3H" }), [], "brand filter");
});

test("data: short-key rows (CSV rows 6, 55, 66, 75, 86, 102) match their example models when the brand is known", () => {
  const cases = [
    ["Viessmann", "EM-M1", /5472 517/],
    ["Neptronic", "EDH-120", /EDH Zone Heater/],
    ["Sporlan (Parker)", "LAC-4-DS", /SD-134/],
    ["True", "TDBD-2", /TDBD\/TSID/], ["True", "TSID-24", /TDBD\/TSID/],
    ["Sporlan (Parker)", "ORI-6", /90-30-1/], ["Sporlan (Parker)", "OROA-5", /90-30-1/], ["Sporlan (Parker)", "LAC-4", /90-30-1/],
    ["G&D Chillers", "GD-7H", /Chiller Installation Guide/],
  ];
  for (const [label, model, title] of cases) {
    const r = matchManuals(REAL, { brand: pick(label), model });
    assert.ok(r.some((x) => title.test(x.docTitle)), label + " " + model);
  }
});
