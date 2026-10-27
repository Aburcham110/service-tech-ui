/**
 * "Send feedback": typed text only. Payload is exactly {type:"feedback", message, version} — never a
 * photo, plate, call card, location or anything else. Goes to the same Apps Script URL as Send missing model.
 * Offline sends wait in localStorage and go out on the 'online' event or the next app start.
 */
import { MISSING_MODEL_URL } from "./missing-model.js?v=37";

export const FEEDBACK_QUEUE_KEY = "serviceTechFeedbackQueue_v1";
export const MAX_FEEDBACK = 1000;

const store = (s) => s || (typeof localStorage !== "undefined" ? localStorage : null);
const read = (s) => { try { const v = JSON.parse(store(s).getItem(FEEDBACK_QUEUE_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
const write = (s, v) => { try { store(s).setItem(FEEDBACK_QUEUE_KEY, JSON.stringify(v)); } catch { /* storage full/blocked */ } };
const isOnline = () => typeof navigator === "undefined" || navigator.onLine !== false;
const appVersion = () => String((typeof self !== "undefined" && self.APP_VERSION) || "");

export const cleanMessage = (m) => String(m || "").replace(/\r\n?/g, "\n").trim().slice(0, MAX_FEEDBACK);

/** The whole payload. Nothing else is ever sent. */
export function feedbackPayload(message, version = appVersion()) {
  return { type: "feedback", message: cleanMessage(message), version: String(version || "") };
}

function post(url, p, fetchFn) {
  // Same request shape as Send missing model: no-cors + text/plain is a "simple" request (no CORS preflight).
  // The response is opaque, so we can't read Apps Script's reply: once fetch resolves, the message counts as
  // delivered. Only a network failure (fetch rejects) keeps it queued.
  return fetchFn(url, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(p) });
}

export const feedbackQueueLength = (storage) => read(storage).length;

/** -> "unset" | "empty" | "sent" | "queued" */
export async function sendFeedback(message, { url = MISSING_MODEL_URL, storage, fetchFn = globalThis.fetch, online = isOnline(), version } = {}) {
  if (!url) return "unset";
  const p = feedbackPayload(message, version);
  if (!p.message) return "empty";
  if (online) {
    try { await post(url, p, fetchFn); return "sent"; } catch { /* network failed: queue it */ }
  }
  write(storage, [...read(storage), p]);
  return "queued";
}

let flushing = null;
/** Sends everything queued in order; failures stay queued. -> number sent. */
export function flushFeedback({ url = MISSING_MODEL_URL, storage, fetchFn = globalThis.fetch, online = isOnline() } = {}) {
  if (!url || !online) return Promise.resolve(0);
  if (flushing) return flushing;
  flushing = (async () => {
    let n = 0;
    const q = read(storage), left = [];
    for (const item of q) {
      const p = feedbackPayload(item.message, item.version); // re-built: only the three keys ever leave
      if (!p.message) continue;
      try { await post(url, p, fetchFn); n++; } catch { left.push(p); }
    }
    write(storage, [...left, ...read(storage).slice(q.length)]);
    return n;
  })().finally(() => { flushing = null; });
  return flushing;
}

let started = false;
export function startFeedbackSender(opts = {}) {
  if (started || typeof window === "undefined") return;
  started = true;
  flushFeedback(opts);
  window.addEventListener("online", () => flushFeedback(opts));
}
