import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { brandOptions, brandLabel, brandValue, brandMatches, matchManuals, literalPrefix, MIN_PREFIX } from "../tools/manual-match.js";

const json = (p) => JSON.parse(readFileSync(new URL("../" + p, import.meta.url), "utf8"));
const MI = json("data/manuals-index.json");
const REAL = json("data/manual-index.json");
const BASE_KEYS = Object.keys(MI.brands).sort(); // the picker's order before this change
const base = BASE_KEYS.map((k) => ({ value: k, aliases: MI.brands[k].aliases }));
const opts = brandOptions(base, REAL.entries);

test("brand list: the 14 manuals-index brands come first, in their original order", () => {
  assert.equal(BASE_KEYS.length, 14);
  assert.deepEqual(opts.slice(0, 14).map((o) => o.value), BASE_KEYS);
  assert.ok(opts.slice(0, 14).every((o) => !o.extra));
  // Before manual-index.json loads, the list is exactly the 14.
  assert.deepEqual(brandOptions(base, []).map((o) => o.value), BASE_KEYS);
});

test("brand list: extra brands follow, alphabetical, no duplicates (case-insensitive), no junk", () => {
  const extra = opts.slice(14);
  assert.ok(extra.length > 0 && extra.every((o) => o.extra));
  const labels = extra.map((o) => o.label);
  assert.deepEqual(labels, [...labels].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })));
  const lower = opts.map((o) => o.label.toLowerCase());
  assert.equal(new Set(lower).size, lower.length);
  for (const b of ["G&D Chillers", "Neptronic", "Turbo Air", "Hoshizaki"]) assert.ok(labels.includes(b), b);
  for (const o of opts) assert.ok(!/\bnot\b|likely|unknown/i.test(o.label), o.label);
  // Base brands are not repeated from index rows such as "Copeland (Emerson)", "York (JCI)" or "Tecumseh (not Daikin)".
  for (const b of ["Copeland", "York", "Tecumseh", "Daikin"]) assert.equal(opts.filter((o) => o.label.toLowerCase().startsWith(b.toLowerCase())).length, 1, b);
});

test("brand list: note-style names collapse to the clean brand", () => {
  assert.equal(brandLabel("Viessmann (not Daikin)"), "Viessmann");
  assert.equal(brandLabel("CaptiveAire (likely; not Daikin)"), "CaptiveAire");
  assert.equal(brandLabel("S&P (Soler & Palau)"), "S&P (Soler & Palau)");
  assert.equal(brandValue("ECR / Utica"), "ECR");
  assert.equal(brandValue("CaptiveAire (likely; not Daikin)"), "CaptiveAire");
  const fx = [
    { brand: "Viessmann (not Daikin)" }, { brand: "VIESSMANN" }, { brand: "CaptiveAire (not Daikin)" }, { brand: "CaptiveAire (likely; not Daikin)" },
    { brand: "Master-Bilt / Norlake (RSG)" }, { brand: "Norlake / Master-Bilt (RSG)" }, { brand: "Copeland (Emerson)" }, { brand: "Emerson (Copeland)" },
    { brand: "Unknown" }, { brand: "" },
  ];
  const o = brandOptions([{ value: "Copeland", aliases: ["Copeland", "Emerson"] }], fx);
  assert.deepEqual(o.map((x) => x.label), ["Copeland", "CaptiveAire", "Master-Bilt / Norlake (RSG)", "Viessmann"]);
  assert.deepEqual(o.map((x) => x.value), ["Copeland", "CaptiveAire", "Master-Bilt", "Viessmann"]);
});

test("every brand value finds its own rows through the brand filter (valid keys only)", () => {
  const values = new Set(opts.map((o) => o.value));
  for (const e of REAL.entries) {
    const keys = e.matchKeys.filter((k) => literalPrefix(k) >= MIN_PREFIX); // e.g. G&D "GD-*" is too short and never matches
    if (!keys.length) continue;
    const v = opts.find((o) => brandMatches(e.brand, o.value));
    assert.ok(v && values.has(v.value), e.brand + " has a picker entry");
    assert.ok(keys.some((k) => matchManuals({ entries: [e] }, { brand: v.value, model: k.replace(/\*/g, "1") }).length), e.brand);
  }
});

test("picking Neptronic with model EDH-120 returns the Neptronic manual", () => {
  const nep = opts.find((o) => o.label === "Neptronic");
  assert.ok(nep);
  const r = matchManuals(REAL, { brand: nep.value, model: "EDH-120" });
  assert.ok(r.length >= 1);
  assert.ok(r.every((x) => new URL(x.url).hostname === "www.neptronic.com"));
});

test("manuals page: the 14 render first, extras are added when manual-index.json loads (same-origin only)", () => {
  const src = readFileSync(new URL("../tools/manuals-helper-app.js", import.meta.url), "utf8");
  assert.match(src, /brandOptions\(base, manualIndex \? manualIndex\.entries : \[\]\)/);
  assert.match(src, /oemIndex\.then\(\(mi\) => \{\s*manualIndex = mi;\s*fillPicker\(\);/);
  assert.ok(!/https?:\/\//.test(src.replace(/\/\*[\s\S]*?\*\//g, "")));
});
