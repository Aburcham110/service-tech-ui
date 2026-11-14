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
  assert.equal(EXCLUDED.length, 6); // exclusions are an explicit, short list
});

test("brand-owned OEM manual hosts (approved 2026-11-13) pass as exact hosts; held-out hosts stay rejected", () => {
  const approved = ["cdn.daikincloud.io", "www.daikin.eu", "docs.johnsoncontrols.com", "docs.k-rp.com", "gdchillers.com", "iceomatic.com",
    "media.rinnai.us", "norlake.com", "secure.hoshizakiamerica.com", "www.solerpalau-usa.com", "solerpalaucanada.com", "www.solerpalaucanada.com",
    "uticaboilers.com", "www.captiveaire.com", "www.friedrich.com", "www.howecorp.com", "www.marleymep.com", "www.mate.com", "www.neptronic.com",
    "www.parker.com", "www.regoproducts.com", "www.scotsman-ice.com", "www.turboairinc.com", "www.viessmann.ca"];
  for (const h of approved) assert.ok(isOfficialUrl("https://" + h + "/doc.pdf"), h);
  // Held out by Arthur: generic storage hosts, a seller and a training site.
  for (const u of ["https://qr-code-documents.s3.amazonaws.com/HTPG/HT-EN-IOM.pdf",
    "https://dc2kentprodcontent.blob.core.windows.net/installationmanuals/TDBD_TSID/TDBD_English.pdf",
    "https://www.radiantcompany.com/wp-content/uploads/radiantcompanymanual.pdf",
    "https://hvaclearningcampus.com/a.pdf", "https://www.hvaclearningcampus.com/a.pdf"]) assert.ok(!isOfficialUrl(u), u);
  // Exact hosts only: the parent domain and sibling subdomains are not opened up.
  for (const u of ["https://daikin.eu/a.pdf", "https://shop.daikin.eu/a.pdf", "https://daikincloud.io/a.pdf", "https://other.daikincloud.io/a.pdf",
    "https://johnsoncontrols.com/a.pdf", "https://parker.com/a.pdf", "https://mate.com/a.pdf", "https://hoshizakiamerica.com/a.pdf",
    "https://rinnai.us/a.pdf", "https://k-rp.com/a.pdf", "https://www.parker.com.evil.example/a.pdf"]) assert.ok(!isOfficialUrl(u), u);
});
