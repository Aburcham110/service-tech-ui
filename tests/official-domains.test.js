import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { isOfficialUrl, isExcluded, EXCLUDED } from "../tools/official-domains.js";

const root = new URL("../", import.meta.url);
const files = [
  ...readdirSync(new URL("data/", root)).filter((f) => f.endsWith(".json")).map((f) => "data/" + f),
  ...readdirSync(new URL("tools/", root), { recursive: true }).filter((f) => /\.(m?js)$/.test(f)).map((f) => "tools/" + f),
  ...readdirSync(root).filter((f) => f.endsWith(".html")),
];
const URL_RE = /https?:\/\/[^\s"'`<>)\\]+/g;
export const badUrls = (text) => (text.match(URL_RE) || []).filter((u) => !isExcluded(u) && !isOfficialUrl(u));

test("every URL in data/*.json, tools/ and the html pages is on the official domain list", () => {
  assert.ok(files.includes("data/error-codes.json") && files.includes("data/manuals-index.json") && files.includes("tree.html"));
  const bad = [];
  let n = 0;
  for (const f of files) {
    const t = readFileSync(new URL(f, root), "utf8");
    n += (t.match(URL_RE) || []).length;
    for (const u of badUrls(t)) bad.push(f + ": " + u);
  }
  assert.ok(n > 500, "scanned " + n + " URLs");
  assert.deepEqual(bad, []);
  // The check itself rejects shareddocs.com, other S3 buckets and look-alike hosts.
  assert.deepEqual(badUrls('x "https://www.shareddocs.com/hvac/docs/1009/Public/0D/25HBC-HCE-03SI.pdf" y'), ["https://www.shareddocs.com/hvac/docs/1009/Public/0D/25HBC-HCE-03SI.pdf"]);
  assert.equal(badUrls("https://s3.amazonaws.com/other-bucket/a.pdf").length, 1);
  assert.equal(badUrls("https://carrier.com.evil.example/a.pdf").length, 1);
  assert.equal(EXCLUDED.length, 5); // exclusions are an explicit, short list
});
