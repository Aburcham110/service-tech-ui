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

test("shipped index: Researcher's Model Manual Index loaded — official hosts, cited, matching works", () => {
  const MI = "https://app.notion.com/p/405402f833af81e5ad02d05a324316a0";
  assert.equal(REAL.models.length, 12); assert.equal(REAL.prefixes.length, 21);
  assert.deepEqual(Object.keys(REAL.brands).filter((b) => REAL.brands[b].searchTemplate).sort(), ["Copeland", "Trane"]);
  const OK = /^https:\/\/(?:[a-z0-9-]+\.)*(fujitsugeneral\.com|upgnet\.com|copeland\.com|tecumseh\.com|daikincomfort\.com|goodmanmfg\.com|lennox\.com|tranetechnologies\.com|carrier\.com\.pr|rheem\.com|yorknow\.com)\//;
  for (const e of [...REAL.models, ...REAL.prefixes]) { assert.match(e.url, OK, e.url); assert.ok(e.source.startsWith(MI)); assert.ok(["install", "service", "owner", "wiring"].includes(e.docType)); }
  assert.ok(![...REAL.models, ...REAL.prefixes].some((e) => /mylinkdrive|amazonaws|daikincity|shareddocs/.test(e.url)));
  assert.equal(matchModel(REAL, { model: "ASUG15LZAS" }).kind, "exact");
  assert.equal(matchModel(REAL, { brand: "Trane", model: "5TTR7024A1000A" }).kind, "prefix");
  assert.equal(matchModel(REAL, { brand: "Coleman", model: "BRCS0301BDG" }).kind, "exact"); // UPG/Coleman = York
  assert.equal(matchModel(REAL, { brand: "Carrier", model: "24ACC636A003" }).docs[0].url, "https://carrier.com.pr/pdf/products_pdf/24ACC6_INSTALLATION.pdf");
  assert.equal(matchModel(REAL, { brand: "Copeland", model: "ZR34K5E" }).kind, "search");
  assert.equal(matchModel(REAL, { brand: "Rheem", model: "RP20" }).kind, "brand");
  const old = { ...REAL }; delete old.models; delete old.prefixes;
  assert.equal(matchModel(old, { brand: "Lennox", model: "EL16XC1" }).kind, "brand");
});
test("generator: carrier.com.pr is its own registrable domain, accepted for Carrier only", () => {
  assert.equal(domainOf("carrier.com.pr"), "carrier.com.pr"); assert.equal(domainOf("www.docs.lennox.com"), "lennox.com");
});


import { parseModelIndex, domainOf } from "../tools/gen-manuals-index.mjs";
test("generator: Model Manual Index rows -> models/prefixes/templates; non-official hosts rejected", () => {
  const md = `| Brand | Match | Model / Prefix | Doc type | Title | URL | Source | Login required |
|---|---|---|---|---|---|---|---|
| Fixture Co | model | FX-1000A | install | FX install | https://docs.fixtureco.invalid/a.pdf | https://app.notion.com/p/x | no |
| Fixtureco | prefix | FX-2 | service | FX-2 svc | [svc](https://fixtureco.invalid/b.pdf) | https://app.notion.com/p/x | Yes |
| Fixtureco | template |  |  |  | https://fixtureco.invalid/s?q={model} | https://app.notion.com/p/x | |
| Fixtureco | model | FX-9 | install | Mirror | https://manualslib.invalid/fx9.pdf | https://app.notion.com/p/x | |
| Fixtureco | model | FX-8 | brochure | Bad | https://fixtureco.invalid/c.pdf | https://app.notion.com/p/x | |
| Fixtureco | template |  |  |  | https://fixtureco.invalid/s | https://app.notion.com/p/x | |`;
  const r = parseModelIndex(md, FX.brands);
  assert.deepEqual(r.models, [{ brand: "Fixtureco", model: "FX-1000A", docType: "install", title: "FX install", url: "https://docs.fixtureco.invalid/a.pdf", source: "https://app.notion.com/p/x" }]);
  assert.equal(r.prefixes[0].prefix, "FX-2"); assert.equal(r.prefixes[0].loginRequired, true); assert.equal(r.prefixes[0].url, "https://fixtureco.invalid/b.pdf");
  assert.equal(r.templates.Fixtureco.url, "https://fixtureco.invalid/s?q={model}");
  assert.equal(r.rejected.length, 3);
  assert.match(r.rejected.join("\n"), /not an official Fixtureco domain/);
  assert.match(r.rejected.join("\n"), /doc type/);
  assert.match(r.rejected.join("\n"), /needs \{model\}/);
  // JSON input works too, and its output feeds matchModel directly
  const j = parseModelIndex(JSON.stringify([{ brand: "Plainco", match: "model", model: "P-1", docType: "owner", url: "https://plainco.invalid/p1.pdf", source: "s" }]), FX.brands);
  assert.equal(matchModel({ brands: FX.brands, models: j.models }, { brand: "Plainco", model: "p 1" }).kind, "exact");
});

test("offline: the index is precached at the current version, PDFs never are, cross-origin is network-only", () => {
  const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  const v = sw.match(/const VERSION = "v(\d+)"/)[1];
  assert.ok(sw.includes('"./data/manuals-index.json?v=' + v + '"'));
  assert.ok(!/\.pdf/i.test(sw));
  assert.match(sw, /url\.origin !== self\.location\.origin\) return;/);
  assert.ok(readFileSync(new URL("../tools/manuals.js", import.meta.url), "utf8").includes("manuals-index.json?v=" + v));
});
