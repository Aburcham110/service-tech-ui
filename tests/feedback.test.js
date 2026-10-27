import test from "node:test";
import assert from "node:assert/strict";
import { feedbackPayload, sendFeedback, flushFeedback, feedbackQueueLength, MAX_FEEDBACK, FEEDBACK_QUEUE_KEY } from "../tools/feedback.js";

const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), m }; };
const URL_ = "https://script.example/exec";

test("feedback payload: exactly type, message, version", () => {
  const p = feedbackPayload("  Scan was great \r\n", "v29");
  assert.deepEqual(Object.keys(p).sort(), ["message", "type", "version"]);
  assert.deepEqual(p, { type: "feedback", message: "Scan was great", version: "v29" });
  assert.equal(feedbackPayload("x".repeat(5000), "v29").message.length, MAX_FEEDBACK);
});

test("feedback send: same no-cors text/plain POST, body has only the three keys", async () => {
  const calls = [];
  const r = await sendFeedback("hi", { url: URL_, storage: mem(), online: true, version: "v29", fetchFn: async (u, o) => { calls.push([u, o]); return {}; } });
  assert.equal(r, "sent");
  const [u, o] = calls[0];
  assert.equal(u, URL_); assert.equal(o.method, "POST"); assert.equal(o.mode, "no-cors");
  assert.equal(o.headers["Content-Type"], "text/plain;charset=utf-8");
  assert.deepEqual(JSON.parse(o.body), { type: "feedback", message: "hi", version: "v29" });
  assert.equal(await sendFeedback("   ", { url: URL_, storage: mem(), fetchFn: async () => ({}) }), "empty");
  assert.equal(await sendFeedback("hi", { url: "", storage: mem() }), "unset");
});

test("feedback queue: offline or network failure queues; flush on online sends in order and keeps failures", async () => {
  const s = mem();
  let n = 0;
  assert.equal(await sendFeedback("one", { url: URL_, storage: s, online: false, version: "v29", fetchFn: async () => { n++; } }), "queued");
  assert.equal(n, 0, "nothing sent while offline");
  assert.equal(await sendFeedback("two", { url: URL_, storage: s, online: true, version: "v29", fetchFn: async () => { throw new TypeError("Failed to fetch"); } }), "queued");
  assert.equal(feedbackQueueLength(s), 2);
  assert.equal(await flushFeedback({ url: URL_, storage: s, online: false, fetchFn: async () => {} }), 0);
  // Tampered queue entries are rebuilt: only the three keys ever leave.
  const q = JSON.parse(s.getItem(FEEDBACK_QUEUE_KEY)); q[0].photo = "data:image/jpeg;base64,xxx"; s.setItem(FEEDBACK_QUEUE_KEY, JSON.stringify(q));
  const bodies = []; let fail = true;
  const sent = await flushFeedback({ url: URL_, storage: s, online: true, fetchFn: async (u, o) => { if (JSON.parse(o.body).message === "two" && fail) throw new Error("net"); bodies.push(JSON.parse(o.body)); } });
  assert.equal(sent, 1);
  assert.deepEqual(bodies, [{ type: "feedback", message: "one", version: "v29" }]);
  assert.equal(feedbackQueueLength(s), 1, "the failed one stays queued");
  fail = false;
  assert.equal(await flushFeedback({ url: URL_, storage: s, online: true, fetchFn: async (u, o) => { bodies.push(JSON.parse(o.body)); } }), 1);
  assert.equal(feedbackQueueLength(s), 0);
});
