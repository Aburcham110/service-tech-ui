import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findManuals, brandKey } from "../tools/manuals.js";
import { parseSources, parseManuals, familyEntries } from "../tools/gen-manuals-index.mjs";
import { TREES, chooseTree, toolHref } from "../tools/trees.js";
import { TOOLS, getTool } from "../tools/registry.js";

const INDEX = JSON.parse(readFileSync(new URL("../data/manuals-index.json", import.meta.url), "utf8"));

// A small index exercising model-prefix and family matches (the real index has none yet).
const TOY = {
  brands: { Acme: { aliases: ["Acme", "Acme Cooling"], oem: [{ title: "Literature", url: "https://acme.example/lit" }] } },
  entries: [
    { brand: "Acme", prefixes: ["ZX15"], families: [], title: "ZX15 service manual", url: "https://acme.example/zx15.pdf" },
    { brand: "Acme", prefixes: [], families: ["Scroll"], title: "Scroll AE bulletin", url: "https://acme.example/scroll.pdf" },
    { brand: "Acme", prefixes: [], families: [], brandWide: true, title: "Acme handbook", url: "https://acme.example/hb.pdf" },
  ],
};

test("index: matches by model prefix (ignoring dashes/case), model-specific doc first", () => {
  const r = findManuals(TOY, { brand: "ACME", model: "zx-15a2b" });
  assert.equal(r.status, "match");
  assert.deepEqual(r.docs.map((d) => [d.title, d.matchedBy]), [["ZX15 service manual", "prefix"], ["Acme handbook", "brand"]]);
  assert.equal(r.oem[0].url, "https://acme.example/lit");
});

test("index: matches by family; brand aliases resolve", () => {
  const r = findManuals(TOY, { brand: "Acme Cooling", model: "QQ1", family: "scroll" });
  assert.deepEqual(r.docs.map((d) => d.title), ["Scroll AE bulletin", "Acme handbook"]);
  assert.equal(brandKey(TOY, "acme cooling"), "Acme");
});

test("index: model prefix matches even without a brand", () => {
  assert.equal(findManuals(TOY, { model: "ZX15B" }).docs[0].title, "ZX15 service manual");
});

test("real index: Copeland compressor gets the filed handbook (brand-wide) plus the OEM portals", () => {
  for (const brand of ["Copeland", "Emerson / Copeland", "Emerson"]) {
    const r = findManuals(INDEX, { brand, model: "RST64C1E-CAV" });
    assert.equal(r.status, "match", brand);
    assert.match(r.docs[0].title, /Copeland Electrical Handbook/);
    assert.ok(r.oem.some((o) => o.url.startsWith("https://www.copeland.com/")));
  }
});

test("real index: falls back to the brand's official OEM literature pages", () => {
  const f = findManuals(INDEX, { brand: "Fujitsu", model: "ASUG15LZAS" });
  assert.equal(f.status, "oem");
  assert.ok(f.oem.length >= 2 && f.oem.every((o) => /^https:\/\/[a-z.]*airstagehvac\.com\//.test(o.url)));
  assert.equal(findManuals(INDEX, { brand: "Bohn", model: "ADT104" }).brand, "Heatcraft");
  assert.equal(findManuals(INDEX, { brand: "Mitsubishi Electric" }).status, "oem");
});

test("real index: no match and no OEM page -> none ('No manual on file')", () => {
  assert.equal(findManuals(INDEX, { brand: "Bryant", model: "187BNA036" }).status, "none");
  assert.equal(findManuals(INDEX, {}).status, "none");
  assert.equal(findManuals(INDEX, { model: "ZX15" }).status, "none");
});

test("real index: only official OEM domains, all https, every link sourced from Notion", () => {
  const OFFICIAL = /^https:\/\/(?:[a-z0-9-]+\.)*(copeland\.com|tecumseh\.com|heatcraftrpd\.com|manitowocice\.com|airstagehvac\.com|daikincomfort\.com|daikincity\.com|mylinkdrive\.com|carrier\.com|hvacpartners\.com|apps\.apple\.com|tranetechnologies\.com|trane\.com|goodmanmfg\.com|lennoxpros\.com|lennox\.com|hvacliteraturelibrary\.com|rheem\.com|yorknow\.com|york\.com|lghvac\.com|lg\.com)\//;
  const SOURCES = "https://app.notion.com/p/3d3402f833af8125a057eaa0304b38ba";
  let n = 0;
  for (const b of Object.values(INDEX.brands)) for (const o of b.oem) { n++; assert.match(o.url, OFFICIAL, o.url); assert.equal(o.source, SOURCES); assert.ok(o.verified); }
  assert.equal(n, 37); // 3 Tecumseh /Resources/documents pages return 404 since 2026-10-26 and are left out (failedToLoad)
  for (const e of INDEX.entries) if (e.brand !== "Trane") assert.equal(e.url, "https://app.notion.com/p/3d3402f833af8106af2ae647a39fcf48");
});

test("generator parses the Notion markdown (sources map + manuals index)", () => {
  const b = parseSources("## Heatcraft (Bohn, Larkin)\n- Literature library: [https://x.heatcraftrpd.com/l/](https://x.heatcraftrpd.com/l/)\n## Field habit\n- [a](https://no.example)");
  assert.deepEqual(b.Heatcraft.aliases.slice(0, 3), ["Heatcraft", "Bohn", "Larkin"]);
  assert.equal(b.Heatcraft.oem[0].title, "Literature library");
  assert.equal(Object.keys(b).length, 1);
  const e = parseManuals("## Index\n\n| Brand | Model / family | Doc type | File / notes |\n| --- | --- | --- | --- |\n| Copeland | Scroll / CU (handbook) | Electrical Handbook | x |\n| Tecumseh |  | Install |  |\n\n## Filed PDFs\n\n### Copeland Electrical Handbook 2008\n");
  assert.equal(e.length, 1);
  assert.deepEqual(e[0].families, ["Scroll", "CU"]);
  assert.equal(e[0].brandWide, true);
  assert.equal(e[0].title, "Copeland Electrical Handbook 2008");
});

test("trees: the four equipment types exist and every node is well formed and reachable", () => {
  assert.deepEqual(Object.keys(TREES).sort(), ["compressor", "mini-split", "split-ac-hp", "walk-in"]);
  for (const [id, t] of Object.entries(TREES)) {
    assert.ok(t.nodes[t.start], id + " start");
    const seen = new Set([t.start]), queue = [t.start];
    while (queue.length) {
      const n = t.nodes[queue.shift()];
      assert.ok(n.text && n.text.length > 10);
      if (n.end) assert.ok(!n.options || !n.options.length, "leaf with options");
      else assert.ok(n.options && n.options.length >= 2 || n.options.some((o) => o.tree), "non-leaf needs options");
      for (const o of n.options || []) {
        assert.ok(o.label);
        if (o.tree) { assert.ok(TREES[o.tree], "cross-tree link " + o.tree); continue; }
        assert.ok(t.nodes[o.next], id + ": missing node " + o.next);
        if (!seen.has(o.next)) { seen.add(o.next); queue.push(o.next); }
      }
    }
    assert.deepEqual([...seen].sort(), Object.keys(t.nodes).sort(), id + ": unreachable nodes");
    // Every path ends at a leaf (no dead loops): each node can reach an end node.
    const canEnd = (nid, stack = new Set()) => { const n = t.nodes[nid]; if (n.end) return true; if (stack.has(nid)) return false; stack.add(nid);
      return (n.options || []).some((o) => o.tree || canEnd(o.next, new Set(stack))); };
    for (const nid of Object.keys(t.nodes)) assert.ok(canEnd(nid), id + ":" + nid + " never ends");
  }
});

test("trees: tool links point at existing tools, and every tool is used somewhere", () => {
  assert.equal(TOOLS.length, 17);
  const used = new Set();
  for (const t of Object.values(TREES)) for (const [nid, n] of Object.entries(t.nodes)) for (const tool of n.tools || []) {
    assert.ok(getTool(tool), nid + ": unknown tool " + tool);
    used.add(tool);
  }
  assert.equal(toolHref("electrical"), "tool.html?id=electrical");
  const unused = TOOLS.map((t) => t.id).filter((id) => !used.has(id));
  assert.deepEqual(unused, [], "tools not linked from any tree");
  // Every leaf links at least one tool.
  for (const t of Object.values(TREES)) for (const n of Object.values(t.nodes)) if (n.end) assert.ok(n.tools && n.tools.length);
});

test("trees: no brand error codes in the generic trees", () => {
  const all = JSON.stringify(TREES);
  assert.doesNotMatch(all, /\b(?:E[0-9]{1,3}|[A-Z][0-9]{1,2}|0x[0-9A-F]+)\b(?![-–])/, "looks like an error code");
});

test("chooseTree picks by equipment / scanned unit type", () => {
  assert.equal(chooseTree({ equipment: "cooler" }), "walk-in");
  assert.equal(chooseTree({ equipment: "freezer" }), "walk-in");
  assert.equal(chooseTree({ equipment: "rack" }), "walk-in");
  assert.equal(chooseTree({ equipment: "RTU" }), "split-ac-hp");
  assert.equal(chooseTree({ equipment: "mini-split" }), "mini-split");
  assert.equal(chooseTree({ equipment: "other", unitType: "compressor" }), "compressor");
  assert.equal(chooseTree({ equipment: "split", unitType: "indoor", brand: "Fujitsu" }), "mini-split");
  assert.equal(chooseTree({ equipment: "other" }), null);
});

test("offline: new files are precached and the cache is bumped", () => {
  const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  for (const f of ["./tree.html", "./tools/manuals.js?v=26", "./tools/trees.js?v=26", "./tools/tree-app.js?v=26", "./data/manuals-index.json?v=26", "./manuals.html", "./tools/prefill.js?v=26", "./tools/call-card.js?v=26", "./tools/manuals-helper.js?v=26", "./tools/manuals-helper-app.js?v=26", "./tools/last-plate.js?v=26", "./tools/scan-flow.js?v=26", "./tools/missing-model.js?v=26", "./tools/tree-pick.js?v=26", "./tools/card-plate.js?v=26", "./tools/error-codes.js?v=26", "./data/error-codes.json?v=26", "./tools/heic.js?v=26", "./tools/plate-heatcraft.js?v=26", "./vendor/libheif/libheif-bundle.mjs"]) assert.ok(sw.includes('"' + f + '"'), f);
  assert.match(readFileSync(new URL("../version.js", import.meta.url), "utf8"), /self.APP_VERSION = "v26"/);
});

const count = (b) => INDEX.brands[b].oem.length;

test("oem2: link counts per brand from the extended Notion sources map", () => {
  assert.deepEqual(Object.fromEntries(["Carrier", "Trane", "Goodman", "Lennox", "Rheem", "York", "LG"].map((b) => [b, count(b)])),
    { Carrier: 3, Trane: 3, Goodman: 3, Lennox: 4, Rheem: 3, York: 2, LG: 3 }); // Trane LED-code page excluded: HTTP 403 to automated fetch
  assert.ok(INDEX.failedToLoad.some((u) => /support\.trane\.com/.test(u)));
  for (const b of Object.values(INDEX.brands)) for (const o of b.oem) assert.ok(!INDEX.failedToLoad.some((f) => f.startsWith(o.url + " ")));
});

test("oem2: Trane model families match at model level, cited to the 2026 Residential Product Handbook", () => {
  const ac = findManuals(INDEX, { brand: "Trane", model: "5TTR4036A1000A" });
  assert.equal(ac.status, "match");
  assert.equal(ac.docs[0].matchedBy, "prefix");
  assert.match(ac.docs[0].title, /AC \(5TTV\/5TTX\/5TTR\).*2026 Residential Product Handbook/);
  assert.match(ac.docs[0].url, /^https:\/\/elibrary\.tranetechnologies\.com\/.*22-8301-39_05012026\.pdf$/);
  assert.match(findManuals(INDEX, { brand: "American Standard", model: "5TWX-5036" }).docs[0].title, /HP/);
  assert.match(findManuals(INDEX, { brand: "TRANE", model: "5TEM4B04ACV" }).docs[0].title, /air handlers/);
  // Unknown Trane family -> Trane OEM pages; Trane patterns never apply to other brands or brand-less scans.
  assert.equal(findManuals(INDEX, { brand: "Trane", model: "4TTR4036" }).status, "oem");
  assert.equal(findManuals(INDEX, { brand: "Carrier", model: "5TTR4036" }).status, "oem");
  assert.equal(findManuals(INDEX, { model: "5TTR4036" }).status, "none");
  // Only Trane has model-family entries.
  assert.deepEqual([...new Set(INDEX.entries.filter((e) => e.prefixes.length).map((e) => e.brand))], ["Trane"]);
});

test("oem2: aliases — Ruud, Coleman, Luxaire, UPG plate brand", () => {
  assert.equal(findManuals(INDEX, { brand: "Ruud", model: "RA1636AJ1NA" }).brand, "Rheem");
  for (const b of ["Coleman", "Luxaire", "York", "Unitary Products Group (York/Coleman)"]) {
    const r = findManuals(INDEX, { brand: b, model: "BRCS0301BDG" });
    assert.equal(r.status, "oem", b);
    assert.equal(r.brand, "York", b);
  }
  // York/UPG: no fault-code page in the map.
  assert.ok(INDEX.brands.York.oem.every((o) => !/fault|code/i.test(o.title + " " + o.url)));
});

test("oem2: caveat labels", () => {
  const o = (b, re) => INDEX.brands[b].oem.find((x) => re.test(x.url));
  assert.match(o("Rheem", /hvacliteraturelibrary\.com/).note, /Attribution caveat.*rheemweb\.com/);
  assert.match(o("Carrier", /hvacpartners\.com/).note, /dealer login/i);
  const app = o("Carrier", /apps\.apple\.com/);
  assert.match(app.note, /Official Carrier Service Technician app.*not a code list/);
  assert.match(o("LG", /lg\.com\/us\/support/).note, /Consumer \/ room AC units only/);
  // Labels render next to the link.
  const r = findManuals(INDEX, { brand: "Carrier" });
  assert.ok(r.oem.some((x) => x.flag === "app") && r.oem.some((x) => x.flag === "login"));
});

test("generator: picks each bullet's own https link, aliases sub-brands, extracts Trane families only", () => {
  const md = "## Trane (Residential + Commercial; American Standard shares literature)\n- Product Handbook (families, e.g. 5TTV/5TTX AC, 5TAM air handlers): [https://t.example/h.pdf](https://t.example/h.pdf)\n" +
    "## Rheem / Ruud\n- Library (on [rheemweb.com](http://rheemweb.com)): [https://www.hvacliteraturelibrary.com/](https://www.hvacliteraturelibrary.com/) (caveat)\n" +
    "## Goodman (x)\n- Handbook (e.g. GSX AC): [https://g.example/](https://g.example/)\n";
  const b = parseSources(md);
  assert.equal(b.Rheem.oem[0].url, "https://www.hvacliteraturelibrary.com/");
  assert.equal(b.Rheem.oem[0].title, "Library (on rheemweb.com)");
  assert.ok(b.Rheem.aliases.includes("Ruud"));
  const f = familyEntries(b);
  assert.deepEqual(f.map((e) => [e.brand, e.prefixes]), [["Trane", ["5TTV", "5TTX"]], ["Trane", ["5TAM"]]]);
});
