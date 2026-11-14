import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildManualIndex, parseCsv, KEEP_STATUSES } from "../tools/gen-manual-index.mjs";
import { isOfficialUrl } from "../tools/official-domains.js";

const fx = (n) => new URL("./fixtures/manual-index/" + n, import.meta.url);
const GEN = new URL("../tools/gen-manual-index.mjs", import.meta.url).pathname;
const run = (csv) => {
  const out = join(mkdtempSync(join(tmpdir(), "mi-")), "out.json");
  const r = spawnSync(process.execPath, [GEN, fx(csv).pathname, "--out", out], { encoding: "utf8" });
  return { ...r, out };
};

test("generator: keeps only listed statuses with an Official URL", () => {
  const r = buildManualIndex(readFileSync(fx("ok.csv"), "utf8"));
  assert.deepEqual(KEEP_STATUSES, ["MATCHED", "MATCHED (newer rev)", "MATCHED (newer edition)", "RELATED", "REFERENCE"]);
  // A, B, H (dropped for allowlist), I, J are kept; C/E/F/G by status and D by missing URL are excluded.
  assert.equal(r.counts.kept, 5);
  const titles = r.entries.map((e) => e.docTitle);
  assert.deepEqual(titles, ["TEST FIXTURE doc A", "TEST FIXTURE doc B (blank key)", "TEST FIXTURE doc I, with comma", "TEST FIXTURE doc J"]);
  for (const bad of ["C", "D", "E", "F", "G"]) assert.ok(!titles.some((t) => t.startsWith("TEST FIXTURE doc " + bad)), bad);
});

test("generator: output fields only (no Filename, Library folder or Notes); ; keys split and trimmed", () => {
  const r = buildManualIndex(readFileSync(fx("ok.csv"), "utf8"));
  for (const e of r.entries) assert.deepEqual(Object.keys(e), ["brand", "model", "matchKeys", "docTitle", "status", "url", "verifiedDate", "nonOem"]);
  const s = JSON.stringify(r.entries);
  assert.ok(!/SECRET-NOTE|SECRET-FOLDER|fx-a\.pdf|multi\s+line note/.test(s));
  assert.deepEqual(r.entries[0].matchKeys, ["FXA*TEST", "FXB*TEST"]);
  assert.deepEqual(r.entries[1].matchKeys, []);
  assert.equal(r.entries[2].model, 'FX-I, "quoted"');
});

test("generator: hosts not on the allowlist are dropped (not fatal) and listed", () => {
  const r = buildManualIndex(readFileSync(fx("ok.csv"), "utf8"));
  assert.deepEqual(r.dropped.map((d) => d.host), ["www.not-on-allowlist.invalid"]);
  assert.equal(r.fatal.length, 0);
  const cli = run("ok.csv");
  assert.equal(cli.status, 0, cli.stderr);
  assert.match(cli.stdout, /\| Otherco \| OT-H \| www\.not-on-allowlist\.invalid \| https:\/\/www\.not-on-allowlist\.invalid\/h\.pdf \|/);
  assert.equal(JSON.parse(readFileSync(cli.out, "utf8")).entries.length, 4);
});

test("generator: exits nonzero on http://, shareddocs and manualslib URLs", () => {
  for (const f of ["http.csv", "shareddocs.csv", "manualslib.csv"]) {
    const r = run(f);
    assert.notEqual(r.status, 0, f);
    assert.match(r.stderr, /FATAL/, f);
  }
  assert.equal(run("http-not-kept.csv").status, 0, "a dropped-status row is never checked");
});

test("parseCsv: quotes, escaped quotes and embedded newlines", () => {
  assert.deepEqual(parseCsv('a,b\n"x, y","he said ""hi""\nbye"\n'), [["a", "b"], ["x, y", 'he said "hi"\nbye']]);
});

test("bundled data/manual-index.json: allowlisted https links only, no excluded fields", () => {
  const d = JSON.parse(readFileSync(new URL("../data/manual-index.json", import.meta.url), "utf8"));
  assert.ok(d.entries.length > 0);
  for (const e of d.entries) {
    assert.deepEqual(Object.keys(e), ["brand", "model", "matchKeys", "docTitle", "status", "url", "verifiedDate", "nonOem"]);
    assert.match(e.url, /^https:\/\//);
    assert.ok(isOfficialUrl(e.url), e.url);
    assert.ok(!/shareddocs|manualslib/i.test(e.url));
    assert.ok(KEEP_STATUSES.includes(e.status));
  }
});
