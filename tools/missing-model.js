/**
 * "Send missing model": tells whoever keeps the Model Manual Index that a scanned model has no manual on file.
 * Sends ONLY {brand, model, match, app} — never the photo, serial, location or call-card data.
 * Offline sends wait in a local queue and go out on the 'online' event or the next app start.
 * Each brand+model is sent at most once from this phone.
 */
import { isBrandLevel } from "./manuals.js?v=26";

// Google Apps Script web-app URL. If emptied, the Send button is hidden and nothing sends.
export const MISSING_MODEL_URL = "https://script.google.com/macros/s/AKfycbx_JTOt1P_z2wP6JnKkBMNV_NSyBH3fMnkhhM9YMwaeE3Pb8l5IzKzJm1nO-w6JkMTI/exec";

export const APP = "service-tech-ui";
export const SENT_KEY = "serviceTechMissingSent_v1";
export const QUEUE_KEY = "serviceTechMissingQueue_v1";
export const ONLY_NOTE = "Only the brand and model number are sent.";

const norm = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
export const keyOf = (p) => norm(p.brand) + "|" + norm(p.model);
const store = (s) => s || (typeof localStorage !== "undefined" ? localStorage : null);
const read = (s, k) => { try { const v = JSON.parse(store(s).getItem(k) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
const write = (s, k, v) => { try { store(s).setItem(k, JSON.stringify(v)); } catch { /* storage full/blocked */ } };
const isOnline = () => typeof navigator === "undefined" || navigator.onLine !== false;

/** True when the best match is only a search template or brand page, or no brand was read. */
export function needsSend(m) {
  if (!m || !String(m.model || "").trim()) return false;
  return isBrandLevel(m) || !m.brand;
}

/** The whole payload. Nothing else is ever sent. */
export function payload(m) {
  return { brand: String(m.brand || ""), model: String(m.model || "").trim(), match: m.brand ? String(m.kind || "none") : "no-brand", app: APP };
}

export const isSent = (m, storage) => read(storage, SENT_KEY).includes(keyOf(m));
export const isQueued = (m, storage) => read(storage, QUEUE_KEY).some((p) => keyOf(p) === keyOf(m));
export const queueLength = (storage) => read(storage, QUEUE_KEY).length;
export const sendStatus = (m, storage) => (isSent(m, storage) ? "sent" : isQueued(m, storage) ? "queued" : "");

function post(url, p, fetchFn) {
  // no-cors + text/plain = a "simple" request Apps Script accepts without a CORS preflight. The response is opaque.
  return fetchFn(url, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(p) });
}
const markSent = (p, s) => { const sent = read(s, SENT_KEY); if (!sent.includes(keyOf(p))) { sent.push(keyOf(p)); write(s, SENT_KEY, sent); } };

/** -> "unset" | "sent" | "already" | "queued" */
export async function sendMissing(m, { url = MISSING_MODEL_URL, storage, fetchFn = globalThis.fetch, online = isOnline() } = {}) {
  if (!url) return "unset";
  const p = payload(m);
  if (isSent(p, storage)) return "already";
  if (isQueued(p, storage)) { if (online) await flushQueue({ url, storage, fetchFn, online }); return sendStatus(p, storage) || "queued"; }
  if (online) {
    try { await post(url, p, fetchFn); markSent(p, storage); return "sent"; } catch { /* network failed: queue it */ }
  }
  write(storage, QUEUE_KEY, [...read(storage, QUEUE_KEY), p]);
  return "queued";
}

let flushing = null;
/** Sends everything queued; failures stay queued. -> number sent. */
export function flushQueue({ url = MISSING_MODEL_URL, storage, fetchFn = globalThis.fetch, online = isOnline() } = {}) {
  if (!url || !online) return Promise.resolve(0);
  if (flushing) return flushing;
  flushing = (async () => {
    let n = 0;
    for (const p of read(storage, QUEUE_KEY)) {
      if (!isSent(p, storage)) { try { await post(url, { brand: String(p.brand || ""), model: String(p.model || ""), match: String(p.match || ""), app: APP }, fetchFn); markSent(p, storage); n++; } catch { continue; } }
      write(storage, QUEUE_KEY, read(storage, QUEUE_KEY).filter((q) => keyOf(q) !== keyOf(p)));
    }
    return n;
  })().finally(() => { flushing = null; });
  return flushing;
}

/** App start + 'online' retry. Safe to call more than once. */
let started = false;
export function startMissingSender(opts = {}) {
  if (started || typeof window === "undefined") return;
  started = true;
  flushQueue(opts);
  window.addEventListener("online", () => flushQueue(opts));
}

const LABEL = { sent: "✓ Sent", queued: "Queued — sends when online" };
/** Adds the button + one-line note into host. Hidden entirely while the URL is unset. */
export function renderSendButton(host, m, opts = {}) {
  const url = opts.url === undefined ? MISSING_MODEL_URL : opts.url;
  if (!url || !needsSend(m)) return null;
  const wrap = document.createElement("div"); wrap.className = "send-missing";
  const b = document.createElement("button"); b.type = "button"; b.className = "link-btn send-missing-btn";
  const set = (st) => { b.textContent = LABEL[st] || "Send missing model"; b.disabled = !!LABEL[st]; b.dataset.state = st || ""; };
  set(sendStatus(payload(m), opts.storage));
  b.addEventListener("click", async () => { b.disabled = true; set(await sendMissing(m, { ...opts, url }) === "already" ? "sent" : sendStatus(payload(m), opts.storage)); });
  const note = document.createElement("small"); note.className = "send-missing-note"; note.textContent = ONLY_NOTE;
  wrap.append(b, note); host.appendChild(wrap);
  return b;
}
