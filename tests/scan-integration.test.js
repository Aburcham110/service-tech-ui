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
