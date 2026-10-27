/** The open call card's plate, for Troubleshooting (tree.html). The scan that was sent to the card is
 *  stored with the card (CARD_SCAN_KEY, next to the call draft); the card's own fields win, so hand-edits
 *  to the Data plate, Refrigerant or Equipment carry over. Nothing leaves the device. */
import { plateRecord } from "./last-plate.js?v=27";
import { parsePlate } from "./plate-parse.js?v=27";

export const DRAFT_KEY = "serviceTechCallDraft_v1"; // app.js STORAGE_KEY
export const CARD_SCAN_KEY = "serviceTechCardScan_v1";
const ID = ["brand", "model", "serial", "unitType", "refrigerant"];

const read = (s, k) => { try { const r = JSON.parse(s.getItem(k) || "null"); return r && typeof r === "object" ? r : null; } catch (e) { return null; } };

/** Store the confirmed plate as this call card's scan (called when the scan is sent to the card). */
export function saveCardScan(v, storage = globalThis.localStorage) {
  try { storage.setItem(CARD_SCAN_KEY, JSON.stringify(Object.assign(plateRecord(v), { at: Date.now() }))); } catch (e) { /* private mode */ }
}

/**
 * Plate data for the open call card, or null when no card is open (no Data plate text).
 * draft: the call draft {plate, refrigerant, equipment}; rec: the card's stored scan (may be null).
 * Returns {brand, model, serial, unitType, refrigerant, equipment, voltage, rla, summary, edited}.
 */
export function cardPlate(draft, rec) {
  const text = String((draft && draft.plate) || "").trim();
  if (!text) return null;
  let out;
  if (rec && rec.summary && rec.summary === text) out = Object.assign({}, rec, { edited: false });
  else {
    const f = parsePlate({ text: text.replace(/\s*\|\s*/g, "\n") }).fields;
    const val = (k) => f[k] && f[k].value;
    out = { summary: text, edited: !!rec };
    for (const k of [...ID, "voltage", "rla", "charge", "phase"]) {
      const v = val(k) || (rec && rec[k] && text.toUpperCase().includes(String(rec[k]).toUpperCase()) ? rec[k] : "");
      if (v) out[k] = String(v);
    }
  }
  const r = String((draft && draft.refrigerant) || "").trim();
  if (r) out.refrigerant = r; // the card's Refrigerant field (hand-editable) wins
  if (draft && draft.equipment) out.equipment = draft.equipment;
  return out.brand || out.model ? out : null;
}

/** cardPlate() from localStorage. */
export function getCardPlate(storage = globalThis.localStorage) {
  try { return cardPlate(read(storage, DRAFT_KEY), read(storage, CARD_SCAN_KEY)); } catch (e) { return null; }
}
