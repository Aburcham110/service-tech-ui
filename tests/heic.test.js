import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { isHeic, isHeicBytes } from "../tools/heic.js";

const fx = (n) => new URL("./fixtures/plates-heic/" + n, import.meta.url);
const ftyp = (major, compat = []) => {
  const brands = [major, "\0\0\0\0", ...compat].join("");
  const size = 8 + brands.length;
  return Uint8Array.from([0, 0, 0, size, ..."ftyp", ...brands].map((c) => (typeof c === "number" ? c : c.charCodeAt(0))));
};
const fakeFile = (bytes, name = "", type = "") => ({ name, type, slice: (a, b) => ({ arrayBuffer: async () => bytes.slice(a, b).buffer }) });

test("heic: magic bytes heic/heix/mif1 (major or compatible brand)", () => {
  for (const b of ["heic", "heix", "mif1", "hevc", "msf1"]) assert.ok(isHeicBytes(ftyp(b)), b);
  assert.ok(!isHeicBytes(ftyp("isom", ["mp42"])));
  assert.ok(!isHeicBytes(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])));
  assert.ok(!isHeicBytes(new Uint8Array(4)));
});

test("heic: detected with empty MIME type and no extension (Android gallery)", async () => {
  const real = new Uint8Array(readFileSync(fx("fujitsu-asug15lzas.heic")));
  assert.equal(await isHeic(fakeFile(real, "IMG_20261026_1.jpg_", "")), true);
  assert.equal(await isHeic(fakeFile(new Uint8Array(64), "x.heic", "")), true); // extension
  assert.equal(await isHeic(fakeFile(new Uint8Array(64), "x", "image/heif")), true); // MIME
  const jpg = new Uint8Array(readFileSync(new URL("./fixtures/plates/fujitsu-asug15lzas.jpg", import.meta.url)));
  assert.equal(await isHeic(fakeFile(jpg, "x.jpg", "image/jpeg")), false);
  assert.equal(await isHeic(fakeFile(jpg, "", "")), false);
});

test("heic: decoder is self-hosted, licensed, precached, and only imported lazily", () => {
  const src = readFileSync(new URL("../tools/heic.js", import.meta.url), "utf8");
  assert.ok(!/https?:\/\//.test(src.replace(/\/\/.*$/gm, "")), "no absolute URLs");
  assert.ok(!/^import .*libheif/m.test(src), "no static import of the decoder");
  assert.match(src, /import\(DECODER_URL\)/);
  const readme = readFileSync(new URL("../vendor/libheif/README.md", import.meta.url), "utf8");
  assert.match(readme, /1\.19\.8/); assert.match(readme, /LGPL-3\.0/);
  statSync(new URL("../vendor/libheif/LICENSE", import.meta.url));
  const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  assert.ok(sw.includes('"./vendor/libheif/libheif-bundle.mjs"'));
  const ps = readFileSync(new URL("../tools/plate-scan.js", import.meta.url), "utf8");
  assert.match(ps, /if \(await isHeic\(file\)\)/);
});
