import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findCodeSet, lookupCode, sourceLink, rowLabel } from "../tools/error-codes.js";
import { officialHost, OFFICIAL_HOSTS, codeKeys, NO_TABLE_TEXT } from "../tools/gen-error-codes.mjs";

const DATA = JSON.parse(readFileSync(new URL("../data/error-codes.json", import.meta.url), "utf8"));
const set = (re) => DATA.sets.find((s) => re.test(s.title));
const allRows = DATA.sets.flatMap((s) => s.rows);

test("all 433 Notion rows kept; per-section counts", () => {
  assert.equal(allRows.length, 433);
  assert.deepEqual(DATA.dropped, []);
  assert.deepEqual(DATA.sets.map((s) => s.rows.length), [34, 0, 42, 22, 58, 60, 44, 79, 72, 22, 0, 0, 0, 0, 0, 0]);
});

test("exact transcription samples", () => {
  const f = set(/^Fujitsu ASUG15LZAS/).rows[0];
  assert.equal(f.meaning, "Serial communication error (Serial reverse transfer error) (Outdoor unit)");
  assert.match(f.remedy, /^Troubleshooting 2-1: Check point 1\. Reset the power and operate; Check point 2\. Check connection;/);
  assert.equal(f.page, 38);
  const d = set(/^Daikin FIT/).rows[3];
  assert.deepEqual(d.keys, ["15", "E15"]);
  assert.equal(d.pattern, "Thermostat 15 / Control board LED E15");
  assert.match(d.meaning, /^This error indicates the equipment is experiencing frequent low pressure faults\. \(CRITICAL\)/);
  const y = set(/^York/).rows[0];
  assert.equal(y.meaning, "High-pressure switch fault (not in lockout yet)");
  assert.equal(y.page, 12);
  const r = set(/^Rheem/).rows[15];
  assert.equal(r.meaning, "29L – Active Protection High Pressure Control Trip");
  assert.equal(r.remedy, "LPC has opened 3 times in the same cooling operation, the ICC has locked out the compressor to protect it. ICC alternately flashes L and 29");
  assert.deepEqual(r.flags, ["as-printed"]);
  assert.equal(set(/^Trane/).rows[2].meaning, "1st digit – Status: Low Speed | 2nd digit – Faults: MOC Communication Fault");
  for (const row of allRows) { assert.ok(row.meaning, "meaning present"); assert.ok(Number.isInteger(row.page), "page number"); assert.ok(!/\\[\[\]_*]/.test(row.meaning + row.remedy + row.pattern), "no markdown escapes"); }
});

test("blank remedies where the manual gives none: Trane, LG, Fujitsu RLS3 (+6 York)", () => {
  for (const re of [/^Trane/, /^LG/, /^Fujitsu ASU9RLS3Y/]) assert.ok(set(re).rows.every((r) => r.remedy === ""), re);
  assert.equal(set(/^York/).rows.filter((r) => r.remedy === "").length, 6);
  assert.ok(!allRows.some((r) => /No remedy stated/i.test(r.remedy)));
});

test("Fujitsu code 18 shows all four meanings", () => {
  const rows = lookupCode(set(/^Fujitsu ASUG15LZAS/), "18");
  assert.deepEqual(rows.map((r) => r.meaning), [
    "External communication error (Indoor unit)",
    "External communication error between indoor unit and WLAN adapter",
    "Communication error",
    "Wireless LAN adapter non-energized",
  ]);
});

test("Mitsubishi rows 2, 3 and 17 stay as flagged blanks", () => {
  const m = set(/^Mitsubishi/).rows;
  for (const i of [1, 2]) { assert.deepEqual(m[i].flags, ["pattern-blank-in-manual"]); assert.equal(m[i].pattern, "No." + (i + 1)); assert.ok(m[i].remedy); }
  assert.deepEqual(m[16].flags, ["remedy-blank-in-manual"]);
  assert.equal(m[16].remedy, "");
  assert.equal(m.filter((r) => r.flags).length, 3);
});

test("no-table models: message plus the official manual link", () => {
  const nt = DATA.sets.filter((s) => s.noTable);
  assert.deepEqual(nt.map((s) => s.brand), ["Carrier", "Carrier", "Lennox", "Lennox", "Lennox", "Goodman"]);
  for (const s of nt) { assert.equal(s.noTable.text, NO_TABLE_TEXT); assert.equal(NO_TABLE_TEXT, "No code table in the official manual"); assert.match(s.noTable.url, /^https:\/\/.+\.pdf$/i); assert.ok(officialHost(s.noTable.url)); }
  assert.equal(findCodeSet(DATA, { brand: "Lennox", model: "ML17XC1-036-230A" }).noTable.url, "https://www.lennox.com/dA/7a43950f24/100049.pdf");
});

test("no non-OEM domains", () => {
  const urls = [...allRows.map((r) => r.url), ...DATA.sets.map((s) => s.noTable?.url).filter(Boolean)];
  for (const u of urls) assert.ok(officialHost(u), u);
  assert.deepEqual(Object.keys(DATA.hosts).sort(), Object.keys(OFFICIAL_HOSTS).sort());
  assert.equal(officialHost("https://s3.amazonaws.com/someone-else/x.pdf"), null); // only Mitsubishi's bucket
  assert.equal(officialHost("https://www.manualslib.com/x.pdf"), null);
  assert.equal(officialHost("https://daikincity.com.evil.example/x.pdf"), null);
});

test("matching a scanned unit and typed codes", () => {
  assert.match(findCodeSet(DATA, { brand: "Mitsubishi", model: "MUZ-FS12NA" }).title, /^Mitsubishi/);
  assert.match(findCodeSet(DATA, { brand: "Coleman", model: "AC21B36" }).title, /^York/);
  assert.match(findCodeSet(DATA, { brand: "Daikin", model: "DZ6VSA3610" }).title, /^Daikin FIT/);
  assert.equal(findCodeSet(DATA, { brand: "Carrier", model: "RA17" }), null); // brand must agree
  assert.equal(findCodeSet(DATA, { brand: "Fujitsu", model: "" }), null);
  const daikin = set(/^Daikin FIT/);
  assert.deepEqual(lookupCode(daikin, "e15").map((r) => r.pattern), ["Thermostat 15 / Control board LED E15"]);
  assert.ok(lookupCode(set(/^York/), "hps").length >= 3); // text search when no exact code
  assert.deepEqual(sourceLink({ url: "https://x/a.pdf", page: 7 }), { label: "Source: manual p.7", href: "https://x/a.pdf#page=7" });
  assert.match(rowLabel(daikin.rows[3]), /^15 \/ E15 — This error/);
  assert.deepEqual(codeKeys("Thermostat 51*1 / Control board LED E51"), ["51", "E51"]);
  assert.deepEqual(codeKeys("Thermostat 14 / Control board LED -"), ["14"]);
  assert.deepEqual(codeKeys("Wireless LAN LED (orange): Off; Error code 18 (Flashing slowly)"), []);
});

test("tree page wires the Error codes step from the scan header", () => {
  const app = readFileSync(new URL("../tools/tree-app.js", import.meta.url), "utf8");
  assert.match(app, /tree-codes-step/);
  assert.match(app, /error-codes\.js\?v=20/);
  assert.match(readFileSync(new URL("../tools/error-codes.js", import.meta.url), "utf8"), /data\/error-codes\.json\?v=20/);
});
