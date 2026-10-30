import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findCodeSet, lookupCode, sourceLink } from "../tools/error-codes.js";

// Fujitsu General service manual SR_AS025EF_04 (2020.02.26), ASUG09/12/15LZAS + AOUG09/12/15LZAH1.
const DATA = JSON.parse(readFileSync(new URL("../data/error-codes.json", import.meta.url), "utf8"));
const MANUAL = "https://hvacdirect.com/media/pdf/Fujitsu%20LZAS%20Service%20Manual.pdf";
const set = DATA.sets.find((s) => /^Fujitsu AOUG15LZAH1/.test(s.title));

test("LZAH1 set: 31 rows from SR_AS025EF_04, no longer unavailable", () => {
  assert.ok(set);
  assert.equal(set.unavailable, undefined);
  assert.equal(set.rows.length, 31);
  assert.match(set.note, /SR_AS025EF_04/);
  for (const r of set.rows) { assert.equal(r.url, MANUAL); assert.ok([35, 36].includes(r.page)); assert.ok(r.meaning && r.remedy); }
  assert.deepEqual([...new Set(set.rows.flatMap((r) => r.keys))],
    ["11", "12", "18", "32", "35", "41", "42", "51", "58", "62", "63", "64", "71", "73", "74", "84", "94", "95", "97", "99", "A1"]);
});

test("LZAH1 outdoor models find this set, LZAS1 outdoor keeps the old one", () => {
  for (const m of ["AOUG09LZAH1", "AOUG12LZAH1", "AOUG15LZAH1"]) assert.equal(findCodeSet(DATA, { brand: "Fujitsu", model: m }), set);
  assert.notEqual(findCodeSet(DATA, { brand: "Fujitsu", model: "AOUG15LZAS1" }), set);
});

test("verbatim samples from table 1-1 (p.03-1) and troubleshooting", () => {
  const [a1] = lookupCode(set, "a1");
  assert.equal(a1.meaning, "Discharge temperature error (Outdoor unit)");
  assert.equal(a1.pattern, "E: A1 — Operation (green) 10 times / Timer (orange) 1 times / Economy (green) continuous; wired remote: A1");
  assert.match(a1.remedy, /^Troubleshooting 2-22: Check point 1\. Check if 3-way valve is open;.*Check point 6\. Replace main PCB$/);
  assert.equal(lookupCode(set, "18")[0].remedy, "Troubleshooting 2-4: Check point 1. Check the connection; Check point 2. Replace the external input and output PCB; Check point 3. Replace main PCB");
  assert.equal(lookupCode(set, "99")[0].pattern, "E: 99 — Operation (green) 9 times / Timer (orange) 9 times / Economy (green) continuous; wired remote: 99");
  assert.deepEqual(sourceLink(a1), { label: "Source: manual p.35", href: MANUAL + "#page=35" });
});

test("code 18 lists all four meanings; codes not in this manual return nothing", () => {
  assert.deepEqual(lookupCode(set, "18").map((r) => r.meaning), [
    "External communication error (Indoor unit)",
    "External communication error between indoor unit and WLAN adapter",
    "Communication error",
    "Wireless LAN adapter non-energized",
  ]);
  for (const c of ["65", "72", "A3"]) assert.deepEqual(lookupCode(set, c), []);
});

test("wireless LAN table 1-2 (p.03-2): 6 rows, sleep-mode typo kept as printed", () => {
  const w = set.rows.filter((r) => !r.keys.length);
  assert.equal(w.length, 6);
  assert.ok(w.every((r) => r.page === 36 && r.pattern.startsWith("Wireless LAN LED (orange): ")));
  const sleep = w.find((r) => /Sleep mode/.test(r.meaning));
  assert.equal(sleep.remedy, "Troubleshooting 4-6: Check point 1. Cheak the sleep mode");
  assert.deepEqual(sleep.flags, ["as-printed"]);
});
