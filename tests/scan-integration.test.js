import test from "node:test";
import assert from "node:assert/strict";
import { TREES, quickLinks, QUICK_LINKS } from "../tools/trees.js";
import { getTool } from "../tools/registry.js";
import { matchOption, prefillValue } from "../tools/prefill.js";

const nodes = () => Object.values(TREES).flatMap((t) => Object.values(t.nodes));

test("tree quick links: the three named steps open the right tools", () => {
  assert.deepEqual(QUICK_LINKS.map((q) => [q.label, q.tool]), [
    ["Check superheat/subcool", "superheat-subcool"], ["Check amps vs FLA", "electrical"], ["Vacuum / decay", "vacuum-coach"]]);
  for (const q of QUICK_LINKS) {
    assert.ok(getTool(q.tool), q.tool);
    assert.ok(nodes().some((n) => quickLinks(n).some((l) => l.tool === q.tool)), "no tree step links " + q.tool);
  }
  const sh = nodes().find((n) => (n.tools || []).includes("superheat-subcool"));
  assert.equal(quickLinks(sh, { refrigerant: "R-410A" }).find((l) => l.tool === "superheat-subcool").href, "tool.html?id=superheat-subcool&refrigerant=R-410A");
  assert.equal(quickLinks(sh, {}).find((l) => l.tool === "superheat-subcool").href, "tool.html?id=superheat-subcool");
  const el = nodes().find((n) => (n.tools || []).includes("electrical"));
  assert.equal(quickLinks(el, { refrigerant: "R-22" }).find((l) => l.tool === "electrical").href, "tool.html?id=electrical");
});

test("SH/SC refrigerant pre-select matches the tool's own options", () => {
  const f = getTool("superheat-subcool").fields.find((x) => x.name === "refrigerant");
  assert.equal(matchOption(f.options, "R410A"), "R-410A");
  assert.equal(matchOption(f.options, "r-134A"), "R-134a");
  assert.equal(matchOption(f.options, "454B"), "R-454B");
  assert.equal(matchOption(f.options, "R-448A"), null); // not in the tool's list: leave the default
  assert.equal(prefillValue({ type: "number" }, "12x"), null);
  assert.equal(prefillValue({ type: "number" }, "12.5"), "12.5");
});

import { callCardFill, mergeIntoDraft, troubleshootHref } from "../tools/call-card.js";

const SCAN = { brand: "Carrier", unitType: "outdoor", model: "24ACC636A003", serial: "1234A56789", refrigerant: "R-410A", charge: "7.5", voltage: "208/230", phase: "1", rla: "14.1" };

test("Add to call card: brand, model, serial, refrigerant and charge land in the Open step without re-typing", () => {
  const f = callCardFill(SCAN);
  assert.equal(f.refrigerant, "R-410A");
  assert.equal(f.fla, "14.1");
  for (const s of ["Carrier", "Model 24ACC636A003", "S/N 1234A56789", "R-410A 7.5 lb"]) assert.ok(f.plate.includes(s), s);
  assert.deepEqual(Object.keys(f).sort(), ["fla", "plate", "refrigerant"]); // Open-step fields (+ FLA reference) only
  const d = mergeIntoDraft({ step: "open", site: "Store 12", symptom: "warm", plate: "old" }, SCAN);
  assert.equal(d.site, "Store 12"); assert.equal(d.symptom, "warm"); assert.equal(d.plate, f.plate);
  assert.deepEqual(callCardFill({ brand: "Trane" }), { plate: "Trane" });
});

test("Start troubleshooting for this equipment opens the matching tree", () => {
  const q = (h) => { assert.match(h, /^tree\.html\?from=scan&/); return new URLSearchParams(h.split("?")[1]); };
  const s = q(troubleshootHref(SCAN, "split"));
  assert.equal(s.get("type"), "split-ac-hp"); assert.equal(s.get("refrigerant"), "R-410A");
  assert.equal(q(troubleshootHref({ brand: "Copeland", unitType: "compressor" }, "cooler")).get("type"), "compressor");
  // Fujitsu without a model: ducted or ductless is a one-tap choice (the call card says split, so that's first)
  assert.equal(q(troubleshootHref({ brand: "Fujitsu", unitType: "indoor" }, "split")).get("choose"), "split-ac-hp,mini-split");
  assert.equal(q(troubleshootHref({ brand: "Fujitsu", model: "ASUG15LZAS", unitType: "indoor" }, "cooler")).get("type"), "mini-split");
  assert.equal(q(troubleshootHref({ brand: "Heatcraft" }, "freezer")).get("type"), "walk-in");
  assert.equal(q(troubleshootHref({}, "other")).get("choose"), "split-ac-hp,mini-split,walk-in");
});

import { needsRetake } from "../tools/plate-scan.js";

test("Retake is offered when overall confidence is low", () => {
  const f = (m, s) => ({ model: { value: "X", confidence: m }, serial: { value: "Y", confidence: s } });
  assert.equal(needsRetake({ fields: f(0.9, 0.9), hints: [] }), false);
  assert.equal(needsRetake({ fields: f(0.9, 0.3), hints: [] }), true);
  assert.equal(needsRetake({ fields: { model: { value: "X", confidence: 0.9 } }, hints: [] }), true); // serial not read
  assert.equal(needsRetake({ fields: f(0.9, 0.9), hints: ["Glare detected on the plate"] }), true);
});

import { readFileSync } from "node:fs";
import { searchTerms, portalLinks, helperModel, LABEL } from "../tools/manuals-helper.js";
const INDEX = JSON.parse(readFileSync(new URL("../data/manuals-index.json", import.meta.url), "utf8"));

test("offline manuals helper: every brand has search terms and only URLs already in the index", () => {
  assert.equal(LABEL, "Search terms only — verify with OEM");
  const indexUrls = new Set([...Object.values(INDEX.brands).flatMap((b) => b.oem.map((o) => o.url)), ...INDEX.entries.map((e) => e.url)]);
  const model = helperModel(INDEX);
  assert.equal(model.length, Object.keys(INDEX.brands).length);
  for (const b of model) {
    assert.ok(b.terms.length >= 5, b.brand);
    assert.ok(b.links.length >= 1, b.brand);
    for (const l of b.links) {
      assert.ok(indexUrls.has(l.url), "not in index: " + l.url);
      assert.doesNotMatch(l.url, /notion\.(so|com)/); // Notion stays the online source, not a portal
      assert.match(l.url, /^https:/);
    }
  }
});

test("offline manuals helper: model-specific terms; Trane families only from the index", () => {
  assert.ok(searchTerms(INDEX, "Carrier", "24ACC636").includes("Carrier 24ACC636 service manual"));
  assert.ok(searchTerms(INDEX, "Trane").some((t) => /5TTV \/ 5TTX \/ 5TTR/.test(t)));
  assert.ok(!searchTerms(INDEX, "Goodman").some((t) => /\b5T/.test(t)));
  assert.ok(searchTerms(INDEX, "Rheem").includes("Rheem QRD"));
  assert.deepEqual(searchTerms(INDEX, "Nope"), []);
  assert.ok(portalLinks(INDEX, "Carrier").find((l) => /hvacpartners/.test(l.url)).note.match(/login/i));
});

test("manuals.html: label, Notion as online source, no PDFs bundled", () => {
  const html = readFileSync(new URL("../manuals.html", import.meta.url), "utf8");
  assert.ok(html.includes("Search terms only — verify with OEM"));
  assert.ok(html.includes("https://app.notion.com/p/3d3402f833af8125a057eaa0304b38ba"));
  assert.ok(html.includes("Educational only"));
  const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  assert.doesNotMatch(sw, /\.pdf/i);
});
