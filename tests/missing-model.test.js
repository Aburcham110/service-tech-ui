import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MISSING_MODEL_URL, needsSend, payload, sendMissing, flushQueue, isSent, isQueued, queueLength, SENT_KEY, QUEUE_KEY, ONLY_NOTE, APP } from "../tools/missing-model.js";
import { recordUnmatched, listUnmatched } from "../tools/manuals.js";

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };
const URL_ = "https://script.google.com/macros/s/TEST/exec";
const spy = (fail = false) => { const calls = []; const f = async (url, init) => { calls.push({ url, init }); if (fail) throw new TypeError("Failed to fetch"); return { type: "opaque" }; }; f.calls = calls; return f; };
// A scan result with everything a scan carries; only brand/model/kind may leave the phone.
const SCAN = { kind: "search", brand: "Trane", model: "4TTR5036", serial: "21123ABC", photo: "data:image/jpeg;base64,xx", location: { lat: 1, lon: 2 }, callCard: { customer: "Smith" }, docs: [{ url: "x" }] };

test("config: Apps Script URL is a placeholder (unset) for now, so nothing can send", async () => {
  assert.equal(MISSING_MODEL_URL, "");
  const f = spy();
  assert.equal(await sendMissing(SCAN, { storage: mem(), fetchFn: f, online: true }), "unset");
  assert.equal(f.calls.length, 0);
  assert.equal(await flushQueue({ storage: mem(), fetchFn: f, online: true }), 0);
});

test("when to offer it: search template, brand page, or no brand — not exact/prefix", () => {
  assert.ok(needsSend({ kind: "search", brand: "Trane", model: "X1" }));
  assert.ok(needsSend({ kind: "brand", brand: "Lennox", model: "X1" }));
  assert.ok(needsSend({ kind: "none", brand: null, model: "X1" }));
  assert.ok(!needsSend({ kind: "exact", brand: "Fujitsu", model: "ASUG15LZAS" }));
  assert.ok(!needsSend({ kind: "prefix", brand: "Trane", model: "5TTR7024" }));
  assert.ok(!needsSend({ kind: "brand", brand: "Lennox", model: "" }));
});

test("payload: exactly brand, model, match, app — no photo, serial, location or call card", async () => {
  assert.deepEqual(payload(SCAN), { brand: "Trane", model: "4TTR5036", match: "search", app: APP });
  assert.deepEqual(payload({ kind: "none", brand: null, model: " AB12 " }), { brand: "", model: "AB12", match: "no-brand", app: APP });
  const f = spy(); const s = mem();
  assert.equal(await sendMissing(SCAN, { url: URL_, storage: s, fetchFn: f, online: true }), "sent");
  const { url, init } = f.calls[0];
  assert.equal(url, URL_); assert.equal(init.method, "POST"); assert.equal(init.mode, "no-cors");
  assert.match(init.headers["Content-Type"], /^text\/plain/);
  assert.deepEqual(Object.keys(JSON.parse(init.body)).sort(), ["app", "brand", "match", "model"]);
  assert.doesNotMatch(init.body, /21123ABC|base64|Smith|lat/);
});

test("dedupe: the same brand+model is never sent twice from one phone (case/spacing ignored)", async () => {
  const f = spy(); const s = mem();
  assert.equal(await sendMissing(SCAN, { url: URL_, storage: s, fetchFn: f, online: true }), "sent");
  assert.equal(await sendMissing({ ...SCAN, model: "4ttr-5036" }, { url: URL_, storage: s, fetchFn: f, online: true }), "already");
  assert.equal(f.calls.length, 1);
  assert.ok(isSent(SCAN, s));
  assert.equal(await sendMissing({ ...SCAN, model: "4TTR5048" }, { url: URL_, storage: s, fetchFn: f, online: true }), "sent");
  assert.equal(f.calls.length, 2);
});

test("offline: queued (once), then sent on retry; network failure also queues", async () => {
  const s = mem(); const f = spy();
  assert.equal(await sendMissing(SCAN, { url: URL_, storage: s, fetchFn: f, online: false }), "queued");
  assert.equal(await sendMissing(SCAN, { url: URL_, storage: s, fetchFn: f, online: false }), "queued");
  assert.equal(queueLength(s), 1); assert.equal(f.calls.length, 0);
  assert.equal(await flushQueue({ url: URL_, storage: s, fetchFn: f, online: false }), 0); // still offline
  assert.equal(await flushQueue({ url: URL_, storage: s, fetchFn: f, online: true }), 1);  // 'online' / app start
  assert.equal(queueLength(s), 0); assert.ok(isSent(SCAN, s)); assert.equal(f.calls.length, 1);
  assert.deepEqual(Object.keys(JSON.parse(f.calls[0].init.body)).sort(), ["app", "brand", "match", "model"]);
  assert.equal(await flushQueue({ url: URL_, storage: s, fetchFn: f, online: true }), 0);
  // fetch rejects (flaky signal): stays queued, retried later
  const s2 = mem();
  assert.equal(await sendMissing(SCAN, { url: URL_, storage: s2, fetchFn: spy(true), online: true }), "queued");
  assert.ok(isQueued(SCAN, s2));
  assert.equal(await flushQueue({ url: URL_, storage: s2, fetchFn: spy(true), online: true }), 0);
  assert.ok(isQueued(SCAN, s2));
  assert.equal(await flushQueue({ url: URL_, storage: s2, fetchFn: spy(), online: true }), 1);
  assert.ok(!isQueued(SCAN, s2) && isSent(SCAN, s2));
  assert.ok(s2.getItem(SENT_KEY) && s2.getItem(QUEUE_KEY) === "[]");
});

test("unmatched list keeps no-brand reads too; UI shows the one-line note; app start retries", () => {
  const s = mem();
  assert.ok(recordUnmatched({ kind: "none", brand: null, model: "AB12" }, s));
  assert.equal(listUnmatched(s)[0].brand, "");
  assert.ok(!recordUnmatched({ kind: "exact", brand: "Fujitsu", model: "ASUG15LZAS" }, s));
  assert.equal(ONLY_NOTE, "Only the brand and model number are sent.");
  const ui = readFileSync(new URL("../tools/manuals-helper-app.js", import.meta.url), "utf8");
  assert.match(ui, /renderSendButton\(li,/); assert.match(ui, /renderSendButton\(box, m\)/);
  assert.match(readFileSync(new URL("../tools/manuals.js", import.meta.url), "utf8"), /renderSendButton\(box, m\)/);
  assert.match(readFileSync(new URL("../app.js", import.meta.url), "utf8"), /startMissingSender\(\)/);
  assert.match(readFileSync(new URL("../tools/missing-model.js", import.meta.url), "utf8"), /addEventListener\("online"/);
});
