/** Last confirmed plate scan, kept on this phone (localStorage) so the call card, trees, tools and
 *  manuals helper can use it without re-scanning. Only plate fields; nothing leaves the device. */
import { plateSummary } from "./plate-scan.js?v=40";

export const SCAN_KEY = "serviceTechLastScan_v1";
export const PLATE_FIELDS = ["brand", "model", "serial", "unitType", "refrigerant", "charge", "voltage", "phase", "hz", "rla", "fla", "mca", "mop"];

/** The stored record for confirmed values (blank fields dropped). */
export function plateRecord(v) {
  const out = {};
  PLATE_FIELDS.forEach((k) => { if (v && v[k] != null && String(v[k]).trim()) out[k] = String(v[k]).trim(); });
  out.summary = plateSummary(v || {});
  return out;
}

export function saveLastPlate(v, storage = globalThis.localStorage) {
  try { storage.setItem(SCAN_KEY, JSON.stringify(Object.assign(plateRecord(v), { at: Date.now() }))); } catch (e) { /* private mode */ }
}

export function getLastPlate(storage = globalThis.localStorage) {
  try { const r = JSON.parse(storage.getItem(SCAN_KEY) || "null"); return r && typeof r === "object" ? r : null; } catch (e) { return null; }
}

/** "Carrier · 24ACC636A003" for banners; "" when nothing useful is stored. */
export function plateLabel(p) {
  if (!p) return "";
  return [p.brand, p.model].filter(Boolean).join(" · ");
}

/** First number in a plate voltage like "208/230" or "460-3-60" (the nameplate nominal), or null. */
export function nominalVoltage(raw) {
  const m = String(raw || "").match(/\d{3}/);
  return m ? Number(m[0]) : null;
}

/** Rows for the call card's "Scanned equipment" summary (label, value), in plate order. */
export function summaryRows(p) {
  if (!p) return [];
  const L = [["brand", "Brand"], ["model", "Model"], ["serial", "Serial"], ["refrigerant", "Refrigerant"], ["charge", "Charge (lb)"],
    ["voltage", "Voltage"], ["phase", "Phase"], ["rla", "RLA"], ["mca", "MCA"], ["mop", "MOP"]];
  return L.filter(([k]) => p[k]).map(([k, l]) => [l, p[k]]);
}

/** The stored plate is on this call card when the Data plate box still contains its model (or summary). */
export function plateOnCard(p, plateText) {
  const t = String(plateText || "");
  return !!(p && t.trim() && ((p.summary && t.includes(p.summary)) || (p.model && t.includes(p.model))));
}
