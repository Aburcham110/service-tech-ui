import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { matchModel, findManuals, fillTemplate, recordUnmatched, listUnmatched, clearUnmatched, unmatchedText, loginLabel, matchLabel, DOC_TYPES, UNMATCHED_KEY } from "../tools/manuals.js";

const FX = JSON.parse(readFileSync(new URL("./fixtures/manuals-index.fixture.json", import.meta.url), "utf8"));
const REAL = JSON.parse(readFileSync(new URL("../data/manuals-index.json", import.meta.url), "utf8"));
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

test("fixture is clearly marked and uses no real hosts", () => {
  assert.equal(FX.fixture, true);
  assert.match(FX.about, /TEST FIXTURE/);
  const urls = JSON.stringify(FX).match(/https?:\/\/[^"]+/g);
  for (const u of urls) assert.match(new URL(u).hostname, /\.invalid$/, u);
});

test("match order: exact model, then longest prefix, then search template, then brand page", () => {
  const ex = matchModel(FX, { brand: "Fixtureco", model: "fx 1000a" });
  assert.equal(ex.kind, "exact"); assert.equal(ex.label, "Exact model"); assert.equal(ex.docs.length, 2);
  const pf = matchModel(FX, { brand: "Fixture Co", model: "FX-2050B" });
  assert.equal(pf.kind, "prefix"); assert.equal(pf.label, "Model family");
  const se = matchModel(FX, { brand: "Fixtureco", model: "ZZ 9/1" });
  assert.equal(se.kind, "search"); assert.equal(se.label, "Search results for ZZ 9/1");
  assert.equal(se.docs[0].url, "https://fixtureco.invalid/search?q=ZZ%209%2F1&type=manual");
  const br = matchModel(FX, { brand: "Plainco", model: "P-1" });
  assert.equal(br.kind, "brand"); assert.equal(br.label, "Plainco brand page"); assert.equal(br.docs[0].url, "https://plainco.invalid/");
  assert.equal(matchModel(FX, { brand: "Nobody", model: "X" }).kind, "none");
  assert.equal(matchLabel(matchModel(FX, { brand: "Nobody", model: "X" })), "No manual on file");
  // brand page without a model too
  assert.equal(matchModel(FX, { brand: "Fixtureco" }).kind, "brand");
});

test("longest prefix wins (FX-20 over FX-2 over FX)", () => {
  assert.deepEqual(matchModel(FX, { brand: "Fixtureco", model: "FX-2050" }).docs.map((d) => d.prefix), ["FX-20"]);
  assert.deepEqual(matchModel(FX, { brand: "Fixtureco", model: "FX-2100" }).docs.map((d) => d.prefix), ["FX-2"]);
  assert.deepEqual(matchModel(FX, { brand: "Fixtureco", model: "FX-900" }).docs.map((d) => d.prefix), ["FX"]);
  // a prefix needs the brand; an exact model does not
  assert.equal(matchModel(FX, { model: "FX-2050" }).kind, "none");
  assert.equal(matchModel(FX, { model: "FX-1000A" }).kind, "exact");
});

test("template filling is URL-encoded", () => {
  assert.equal(fillTemplate("https://x.invalid/s?q={model}", " A&B #1+2 "), "https://x.invalid/s?q=A%26B%20%231%2B2");
  assert.equal(fillTemplate("https://x.invalid/{model}/{model}", "a/b"), "https://x.invalid/a%2Fb/a%2Fb");
});

test("unmatched list: brand-level only, deduped, local, copyable", () => {
  const s = mem();
  assert.equal(recordUnmatched(matchModel(FX, { brand: "Fixtureco", model: "FX-1000A" }), s), false); // exact
  assert.equal(recordUnmatched(matchModel(FX, { brand: "Fixtureco", model: "FX-2050" }), s), false); // family
  assert.equal(recordUnmatched(matchModel(FX, { brand: "Fixtureco" }), s), false); // no model
  assert.equal(recordUnmatched(matchModel(FX, { brand: "Fixtureco", model: "ZZ9" }), s, new Date("2026-10-26T12:00:00Z")), true);
  assert.equal(recordUnmatched(matchModel(FX, { brand: "Plainco", model: "P-1" }), s, new Date("2026-10-26T12:00:00Z")), true);
  assert.equal(recordUnmatched(matchModel(FX, { brand: "Plainco", model: "p1" }), s, new Date("2026-10-27T12:00:00Z")), true);
  const list = listUnmatched(s);
  assert.deepEqual(list, [{ brand: "Plainco", model: "p1", date: "2026-10-27" }, { brand: "Fixtureco", model: "ZZ9", date: "2026-10-26" }]);
  assert.ok(JSON.parse(s.getItem(UNMATCHED_KEY)).length === 2);
  assert.equal(unmatchedText(list), "Models without a manual:\n2026-10-27  Plainco  p1\n2026-10-26  Fixtureco  ZZ9");
  clearUnmatched(s); assert.deepEqual(listUnmatched(s), []);
});

test("login-only docs get the lock + 'dealer login' label", () => {
  const d = matchModel(FX, { brand: "Fixtureco", model: "FX-1000A" }).docs;
  assert.equal(loginLabel(d.find((x) => x.docType === "service")), "\u{1F512} dealer login");
  assert.equal(loginLabel(d.find((x) => x.docType === "install")), "");
});

test("fixture entries use the schema's docTypes", () => {
  for (const e of [...FX.models, ...FX.prefixes]) { assert.ok(DOC_TYPES.includes(e.docType)); assert.ok(e.source); }
});

test("shipped index: new arrays present and empty (no invented entries), old matching unchanged", () => {
  assert.deepEqual(REAL.models, []); assert.deepEqual(REAL.prefixes, []);
  assert.ok(Object.values(REAL.brands).every((b) => !b.searchTemplate));
  const r = findManuals(REAL, { brand: "Trane", model: "XR16" });
  assert.ok(["match", "oem"].includes(r.status));
  assert.equal(r.match.kind, "brand");
  // an old index without the new keys still works
  const old = { ...REAL }; delete old.models; delete old.prefixes;
  assert.equal(matchModel(old, { brand: "Carrier", model: "24ACC636" }).kind, "brand");
});
