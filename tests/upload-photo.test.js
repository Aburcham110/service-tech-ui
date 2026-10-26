import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { undecodableMessage, UndecodableImageError, UPLOAD_ACCEPT } from "../tools/plate-scan.js";

const src = readFileSync(new URL("../tools/plate-scan.js", import.meta.url), "utf8");

test("upload input accepts images incl. HEIC/HEIF and has no capture attribute", () => {
  assert.equal(UPLOAD_ACCEPT, "image/*,.heic,.heif");
  assert.match(src, /fileInput\("plate-upload-input", UPLOAD_ACCEPT, false\)/);
  assert.match(src, /fileInput\("plate-camera-input", "image\/\*", true\)/);
  assert.match(src, /"btn btn-primary btn-big plate-scan-btn", "📷 Take photo"/);
  assert.match(src, /"btn btn-secondary plate-upload-btn", "🖼 Upload photo"/);
});

test("camera and upload share one pipeline handler", () => {
  assert.match(src, /input\.addEventListener\("change", onPick\(input, "camera"\)\)/);
  assert.match(src, /upInput\.addEventListener\("change", onPick\(upInput, "upload"\)\)/);
  assert.equal((src.match(/await scanPlate\(/g) || []).length, 1);
});

test("undecodable format message suggests JPEG or a screenshot", () => {
  for (const f of [{ name: "IMG_1.HEIC" }, { name: "x.heif" }, { name: "x", type: "image/heic" }]) {
    assert.match(undecodableMessage(f), /HEIC\/HEIF/);
  }
  const m = undecodableMessage({ name: "x.webp" });
  assert.doesNotMatch(m, /HEIC/);
  assert.match(m, /JPEG/); assert.match(m, /screenshot/);
  assert.ok(new UndecodableImageError({ name: "a.heic" }) instanceof Error);
});

test("upload path makes no network requests", () => {
  assert.doesNotMatch(src, /\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
});
