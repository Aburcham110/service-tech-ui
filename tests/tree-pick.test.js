import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pickTree, manualLink, scanTreeHref, TREE_LABELS } from "../tools/tree-pick.js";
import { TREES } from "../tools/trees.js";

const INDEX = JSON.parse(readFileSync(new URL("../data/manuals-index.json", import.meta.url)));
const tree = (v, eq) => pickTree({ ...v, equipment: eq }, INDEX);

test("mapping: brand/model patterns pick the tree (scan beats the call card's default 'cooler')", () => {
  const cases = [
    [{ brand: "Fujitsu", model: "ASUG15LZAS" }, "mini-split"],
    [{ brand: "Fujitsu", model: "AOUG15LZAS1", unitType: "outdoor" }, "mini-split"],
    [{ brand: "Mitsubishi", model: "MSZ-GL12NA" }, "mini-split"],
    [{ brand: "Daikin", model: "FTX12NMVJU" }, "mini-split"],
    [{ brand: "Daikin", model: "DZ6VSA3010" }, "split-ac-hp"],
    [{ brand: "LG", model: "LSN120HSV5" }, "mini-split"],
    [{ brand: "Copeland", model: "ZS21KAE" }, "compressor"],
    [{ brand: "Tecumseh", model: "AJA7490ZXA" }, "compressor"],
    [{ brand: "Heatcraft", model: "LET060" }, "walk-in"],
    [{ brand: "Bohn", model: "BMA0450" }, "walk-in"],
    [{ brand: "Carrier", model: "24ACC636A003", unitType: "outdoor" }, "split-ac-hp"],
    [{ brand: "Trane", model: "4TTR4036" }, "split-ac-hp"],
    [{ brand: "Goodman", model: "GSX140361" }, "split-ac-hp"],
    [{ brand: "Lennox", model: "ML14XC1-036" }, "split-ac-hp"],
    [{ brand: "Rheem", model: "RA1436AJ1NA" }, "split-ac-hp"],
    [{ brand: "Coleman", model: "BRCS0301BDG" }, "split-ac-hp"],
    [{ brand: "Acme", unitType: "compressor" }, "compressor"],
  ];
  for (const [v, want] of cases) {
    const p = tree(v, "cooler");
    assert.equal(p.certain, true, JSON.stringify(v)); assert.equal(p.tree, want, JSON.stringify(v));
    assert.ok(TREES[p.tree]);
  }
  // A model alone (no brand read) resolves the brand from the index
  assert.equal(tree({ model: "ASUG15LZAS" }, "cooler").tree, "mini-split");
});

test("uncertain type: a single-tap choice between 2–3 likely trees", () => {
  const cases = [
    [{ brand: "Fujitsu" }, undefined, ["mini-split", "split-ac-hp"]],
    [{ brand: "Daikin", model: "ZZZ" }, "split", ["split-ac-hp", "mini-split"]],
    [{ brand: "Acme", unitType: "outdoor" }, "cooler", ["split-ac-hp", "mini-split"]],
    [{ brand: "Manitowoc" }, undefined, ["walk-in", "compressor"]],
    [{}, undefined, ["split-ac-hp", "mini-split", "walk-in"]],
  ];
  for (const [v, eq, want] of cases) {
    const p = tree(v, eq);
    assert.equal(p.certain, false); assert.equal(p.tree, null); assert.deepEqual(p.choices, want);
    assert.ok(p.choices.length >= 2 && p.choices.length <= 3);
    p.choices.forEach((id) => { assert.ok(TREES[id]); assert.ok(TREE_LABELS[id]); });
  }
  const h = new URLSearchParams(scanTreeHref({ brand: "Fujitsu" }, undefined, INDEX).split("?")[1]);
  assert.equal(h.get("choose"), "mini-split,split-ac-hp"); assert.equal(h.get("type"), null);
  // tree.html renders the choice and nothing else as the next step
  const app = readFileSync(new URL("../tools/tree-app.js", import.meta.url), "utf8");
  assert.match(app, /Which equipment is this\?/); assert.match(app, /tree-choose/);
});

test("header/link: brand + model and the index's own doc; error codes only when the index has a section", () => {
  const h = new URLSearchParams(scanTreeHref({ brand: "Fujitsu", model: "ASUG15LZAS", refrigerant: "R-410A" }, "cooler", INDEX).split("?")[1]);
  assert.equal(h.get("from"), "scan"); assert.equal(h.get("type"), "mini-split");
  assert.equal(h.get("brand"), "Fujitsu"); assert.equal(h.get("model"), "ASUG15LZAS"); assert.equal(h.get("refrigerant"), "R-410A");
  const m = manualLink(INDEX, { brand: "Fujitsu", model: "ASUG15LZAS" });
  assert.equal(m.kind, "exact"); assert.match(m.href, /^https:\/\/docs\.fujitsugeneral\.com\//); assert.ok(!m.href.includes("#"));
  // No index doc carries an error-code section today, so no deep link is ever produced from the bundled data
  const docs = [...INDEX.models, ...INDEX.prefixes, ...INDEX.entries];
  assert.ok(docs.length > 0);
  assert.ok(docs.every((d) => !d.errorCodes), "update this test if the index gains error-code sections");
  for (const d of docs) assert.ok(!/#page=|#/.test(d.url), d.url);
  // When a doc does carry one, it is used as-is (no guessed page/anchor)
  const fake = JSON.parse(JSON.stringify(INDEX));
  const e = fake.models[0]; const url = e.url + "#codes";
  e.errorCodes = { url, label: "Error codes" };
  const fm = manualLink(fake, { brand: e.brand, model: e.model });
  assert.equal(fm.kind, "error-codes"); assert.equal(fm.href, url);
  // Unknown model: the Manuals helper, never a made-up URL
  assert.deepEqual(manualLink(INDEX, { brand: "Acme", model: "Q1" }), { href: "manuals.html?brand=Acme&model=Q1", label: "Find the manual", external: false, kind: "helper" });
});

test("no invented codes: tree-pick and the trees carry no error codes or specs", () => {
  const src = readFileSync(new URL("../tools/tree-pick.js", import.meta.url), "utf8");
  const words = src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  assert.ok(!/\b(error|fault)\s*code\s*[A-Z]?\d/i.test(words));
  assert.ok(!/\b[EFPHUCL][0-9]{1,2}\b\s*[:=-]\s*["']?[A-Za-z]/.test(words), "looks like an error-code table");
  assert.ok(!/\b\d+(\.\d+)?\s*(psi|psig|ohm|°F|amps?|V)\b/i.test(words), "looks like a spec");
  const all = JSON.stringify(TREES);
  assert.ok(!/\b(E|F|P|H|U)\d{1,2}\b/.test(all), "tree text mentions a specific code");
});
