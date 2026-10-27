import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { psychroHref, prefillFromQuery, carried } from "../tools/psychro-link.js";

test("call draft -> psychro link carries dry bulbs (and RH/WB if present), numbers only", () => {
  assert.equal(psychroHref({ supplyTemp: "55", returnTemp: "75" }), "psychro.html?from=call&retDb=75&supDb=55");
  assert.equal(psychroHref({ supplyTemp: "55", returnTemp: "abc" }), "psychro.html?from=call&supDb=55");
  assert.equal(psychroHref({}), "psychro.html?from=call");
  assert.match(psychroHref({ returnTemp: "75", returnRh: "50", supplyTemp: "55", supplyWb: "53.5" }), /retRh=50.*supWb=53.5/);
  assert.deepEqual(carried({ supplyTemp: "55" }), { ret: false, sup: true });
});

test("query -> form values: RH wins, else WB, else humidity cleared; ignored unless from=call", () => {
  assert.equal(prefillFromQuery("?retDb=75"), null);
  assert.deepEqual(prefillFromQuery("?from=call&retDb=75&supDb=55"), { retDb: "75", retHum: "", supDb: "55", supHum: "" });
  assert.deepEqual(prefillFromQuery("?from=call&retDb=75&retRh=50&retWb=62&supDb=55&supWb=53"), { retDb: "75", retHumMode: "rh", retHum: "50", supDb: "55", supHumMode: "wb", supHum: "53" });
  assert.deepEqual(prefillFromQuery("?from=call"), {});
});

test("wired: Readings button, back link, precached", () => {
  assert.ok(readFileSync(new URL("../call.html", import.meta.url), "utf8").includes('id="psy-link"'));
  assert.ok(readFileSync(new URL("../psychro.html", import.meta.url), "utf8").includes('id="psy-back-call" href="call.html"'));
  assert.ok(readFileSync(new URL("../sw.js", import.meta.url), "utf8").includes('"./tools/psychro-link.js?v=34"'));
});
