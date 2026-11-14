import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { matchManuals, keyMatches, statusLabel, brandMatches, normModel, NO_MATCH_TEXT } from "../tools/manual-match.js";

// TEST FIXTURE: hosts are .invalid, titles are not real documents.
const row = (brand, keys, status, url, docTitle) => ({ brand, model: "fixture", matchKeys: keys, docTitle, status, url, verifiedDate: "2026-11-13" });
const IX = { entries: [
  row("Daikin", ["RXYQ*TATJU"], "MATCHED", "https://a.invalid/exact.pdf", "B exact"),
  row("Daikin", ["RXYQ*TA*"], "RELATED", "https://a.invalid/related.pdf", "A related"),
  row("Daikin", ["RXYQ*"], "REFERENCE", "https://a.invalid/ref.pdf", "C reference"),
  row("Daikin", ["RXYQ*TATJU"], "MATCHED (newer rev)", "https://a.invalid/newer.pdf", "D newer"),
  row("Daikin", ["RXYQ*TATJU"], "RELATED", "https://a.invalid/exact.pdf", "E duplicate url"),
  row("Daikin", [], "MATCHED", "https://a.invalid/blank.pdf", "blank keys"),
  row("Daikin", [""], "MATCHED", "https://a.invalid/blank2.pdf", "empty key"),
  row("Daikin", ["*MXS*W*", "*MXL*W*"], "MATCHED", "https://a.invalid/mx.pdf", "leading star"),
  row("Daikin", ["DCM601A71"], "MATCHED", "https://a.invalid/dcm.pdf", "no-star key"),
  row("Copeland (Emerson)", ["CR*KQ*", "CR*K6*", "CR*K7*"], "MATCHED", "https://a.invalid/cr.pdf", "2-literal keys"),
  row("Daikin", ["RXYQ*PB*", "REYQ*PB*"], "MATCHED", "https://a.invalid/pb.pdf", "multi key"),
  row("Neptronic", ["EDH*"], "MATCHED", "https://a.invalid/edh.pdf", "short prefix"),
  row("Viessmann (not Daikin)", ["EM-M1"], "MATCHED", "https://a.invalid/em.pdf", "brand note"),
] };
const urls = (r) => r.map((x) => x.url);

test("exact match (no wildcard key)", () => {
  assert.deepEqual(urls(matchManuals(IX, { model: "DCM601A71" })), ["https://a.invalid/dcm.pdf"]);
  assert.deepEqual(urls(matchManuals(IX, { model: "dcm 601a71", brand: "daikin" })), ["https://a.invalid/dcm.pdf"]);
  assert.deepEqual(matchManuals(IX, { model: "DCM601A7" }), [], "whole model only");
  assert.deepEqual(matchManuals(IX, { model: "DCM601A711" }), [], "whole model only");
});

test("wildcard: RXYQ*TATJU matches RXYQ72TATJU and 'rxyq-72 tatju'", () => {
  const k = { brandKnown: true };
  assert.ok(keyMatches("RXYQ*TATJU", "RXYQ72TATJU", k));
  assert.ok(keyMatches("RXYQ*TATJU", "rxyq-72 tatju", k));
  assert.ok(keyMatches("RXYQ*TATJU", "RXYQTATJU", k), "* matches an empty run");
  assert.ok(!keyMatches("RXYQ*TATJU", "RXYQ72TATJUX", k), "whole model");
  assert.equal(urls(matchManuals(IX, { model: "rxyq-72 tatju", brand: "DAIKIN" }))[0], "https://a.invalid/exact.pdf");
  assert.equal(normModel(" rxyq-72 tatju "), "RXYQ72TATJU");
});

test("several matches: deduped by URL, sorted Exact, Newer rev, Related, Reference, then title", () => {
  const r = matchManuals(IX, { model: "rxyq-72 tatju", brand: "Daikin" });
  assert.deepEqual(urls(r), ["https://a.invalid/exact.pdf", "https://a.invalid/newer.pdf", "https://a.invalid/related.pdf", "https://a.invalid/ref.pdf"]);
  assert.deepEqual(r.map((x) => x.label), ["Exact", "Newer rev", "Related doc", "Reference"]);
  assert.equal(r[0].docTitle, "B exact", "the better status wins the duplicate URL");
});

test("no match, blank keys ignored", () => {
  assert.deepEqual(matchManuals(IX, { model: "ZZZZ9999", brand: "Daikin" }), []);
  assert.deepEqual(matchManuals(IX, { model: "" }), []);
  assert.ok(!keyMatches("", "ANYTHING"));
  assert.ok(!keyMatches("*", "ANYTHING", { brandKnown: true }));
  assert.ok(!urls(matchManuals(IX, { model: "RXYQ72TATJU", brand: "Daikin" })).some((u) => /blank/.test(u)));
  assert.equal(NO_MATCH_TEXT, "No indexed manual. Check the OEM portal.");
});

test("; multi-key: any key can match", () => {
  assert.deepEqual(urls(matchManuals(IX, { model: "RXYQ120PBYD", brand: "Daikin" })), ["https://a.invalid/pb.pdf", "https://a.invalid/ref.pdf"]);
  assert.deepEqual(urls(matchManuals(IX, { model: "REYQ96PBYD", brand: "Daikin" })), ["https://a.invalid/pb.pdf"]);
  // CR* keys have only 2 literal characters before "*", so the 3-literal minimum keeps them from matching.
  assert.deepEqual(matchManuals(IX, { model: "CR24K6-PFV", brand: "Copeland" }), []);
});

test("3-literal minimum: *MXS*W* never matches", () => {
  assert.ok(!keyMatches("*MXS*W*", "3MXS24WVJU", { brandKnown: true }));
  assert.ok(!keyMatches("AB*", "ABC", { brandKnown: true }));
  assert.ok(keyMatches("ABC*", "ABCD", { brandKnown: true }));
  assert.deepEqual(matchManuals(IX, { model: "3MXS24WVJU", brand: "Daikin" }), []);
});

test("brand filter: EDH* matches only Neptronic when the brand is known", () => {
  assert.deepEqual(urls(matchManuals(IX, { model: "EDH-120", brand: "neptronic" })), ["https://a.invalid/edh.pdf"]);
  assert.deepEqual(matchManuals(IX, { model: "EDH-120", brand: "Daikin" }), []);
  assert.ok(brandMatches("Copeland (Emerson)", "copeland"));
  assert.ok(!brandMatches("Viessmann (not Daikin)", "Daikin"), "'not Daikin' is a note, not a brand");
  assert.deepEqual(matchManuals(IX, { model: "EM-M1", brand: "Daikin" }), []);
  assert.deepEqual(urls(matchManuals(IX, { model: "EM-M1", brand: "Viessmann" })), ["https://a.invalid/em.pdf"]);
});

test("unknown brand: keys need 5 literal characters (short prefix gives no match)", () => {
  assert.deepEqual(matchManuals(IX, { model: "EDH-120" }), [], "EDH* is too short without a brand");
  assert.deepEqual(matchManuals(IX, { model: "CR24K6PFV" }), [], "CR* too short");
  assert.deepEqual(matchManuals(IX, { model: "EM-M1" }), [], "no-star key of 4 characters");
  assert.deepEqual(matchManuals(IX, { model: "RXYQ72TATJU" }), [], "RXYQ* is only 4 literal characters");
  assert.deepEqual(urls(matchManuals(IX, { model: "DCM601A71" })), ["https://a.invalid/dcm.pdf"], "no-star key of 9 characters");
});

test("regex characters in keys are literal", () => {
  assert.ok(!keyMatches("ABC.D*", "ABCXD1", { brandKnown: true }));
  assert.ok(keyMatches("ABC.D*", "ABC.D1", { brandKnown: true }));
  assert.ok(keyMatches("A(B)C*", "A(B)C9", { brandKnown: true }));
});

test("status labels", () => {
  assert.equal(statusLabel("MATCHED"), "Exact");
  assert.equal(statusLabel("MATCHED (newer rev)"), "Newer rev");
  assert.equal(statusLabel("MATCHED (newer edition)"), "Newer rev");
  assert.equal(statusLabel("RELATED"), "Related doc");
  assert.equal(statusLabel("REFERENCE"), "Reference");
});

test("real index: RXYQ72TATJU (Daikin) finds the EDUS341703A-R2 engineering data first", () => {
  const REAL = JSON.parse(readFileSync(new URL("../data/manual-index.json", import.meta.url), "utf8"));
  const r = matchManuals(REAL, { model: "RXYQ72TATJU", brand: "Daikin" });
  assert.ok(r.length >= 1);
  assert.equal(r[0].label, "Exact");
  assert.match(r[0].docTitle, /EDUS341703A-R2/);
});

test("real index: allowlisted brand hosts match by brand; storage hosts only with their exact files", () => {
  const REAL = JSON.parse(readFileSync(new URL("../data/manual-index.json", import.meta.url), "utf8"));
  const edh = matchManuals(REAL, { model: "EDH-120", brand: "Neptronic" });
  assert.ok(edh.length >= 1 && edh.every((r) => new URL(r.url).hostname === "www.neptronic.com"));
  assert.deepEqual(matchManuals(REAL, { model: "EDH-120", brand: "Daikin" }), []);
  assert.deepEqual(matchManuals(REAL, { model: "EDH-120" }), [], "EDH* is too short without a brand");
  // Storage hosts appear only with their one approved file each.
  const storage = REAL.entries.filter((e) => /qr-code-documents\.s3\.amazonaws\.com|dc2kentprodcontent\.blob\.core\.windows\.net/.test(e.url)).map((e) => e.url).sort();
  assert.deepEqual(storage, ["https://dc2kentprodcontent.blob.core.windows.net/installationmanuals/TDBD_TSID/TDBD_English.pdf", "https://qr-code-documents.s3.amazonaws.com/HTPG/HT-EN-IOM.pdf"]);
  assert.equal(REAL.entries.length, 70);
});
