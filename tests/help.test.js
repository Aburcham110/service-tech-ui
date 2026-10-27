import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STEPS } from "../tools/scan-flow.js";

const html = readFileSync(new URL("../help.html", import.meta.url), "utf8");

test("help: 8 collapsible sections, real scan step names, scan anchor, no network-only content", () => {
  assert.equal((html.match(/<details class="help-sec"/g) || []).length, 8);
  assert.match(html, /<details class="help-sec" id="scan">/);
  for (const s of STEPS) assert.ok(html.includes("<strong>" + s.label + "</strong>"), s.label);
  assert.ok(!/<img|<iframe|https?:\/\//.test(html.replace(/<link[^>]*>/g, "")), "nothing that needs the network");
  assert.match(readFileSync(new URL("../tools/scan-flow.js", import.meta.url), "utf8"), /help\.href = "help\.html#scan"/);
});
