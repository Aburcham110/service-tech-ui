/** Call wizard extras (pure, node-testable): inline SH/SC from the SH/SC tool's code, amps as % of plate
 *  RLA/FLA, job times, quick phrases, and the extra lines for "Copy for Service Tech". No DOM, no network. */
import { shScValues } from "./logic-1.js?v=34";
import { PT } from "./pt-tables.js?v=34";
import { cardPlate } from "./card-plate.js?v=34";

export const TECH_KEY = "serviceTechTechName_v1";

/** Free-typed refrigerant -> PT table key ("r410a" -> "R-410A"), or null when there is no PT table for it. */
export function ptRefrigerant(s) {
  const m = String(s || "").toUpperCase().replace(/\s+/g, "").match(/^R-?(\d{2,4}[A-Z]?)$/);
  if (!m) return null;
  return Object.keys(PT).find((k) => k.toUpperCase() === "R-" + m[1]) || null;
}

const filled = (v) => String(v == null ? "" : v).trim() !== "";
const fix1 = (n) => (Math.round(n * 10) / 10).toFixed(1);

/**
 * Inline superheat / subcool for the call card. Only when refrigerant, suction psig + °F and liquid psig + °F
 * are all filled. Same numbers as the SH/Subcool tool (shScValues). Returns
 *  { state: "incomplete", missing[] } | { state: "error", message } | { state: "ok", refrigerant, superheat, subcool }.
 * No target ranges: none of them has a sourced basis in this app.
 */
export function inlineShSc(d) {
  d = d || {};
  const need = [["refrigerant", "refrigerant"], ["suctionPsig", "suction psig"], ["suctionTemp", "suction °F"], ["liquidPsig", "liquid psig"], ["liquidTemp", "liquid °F"]];
  const missing = need.filter(([k]) => !filled(d[k])).map(([, l]) => l);
  if (missing.length) return { state: "incomplete", missing };
  const ref = ptRefrigerant(d.refrigerant);
  if (!ref) return { state: "error", message: "No PT table for “" + String(d.refrigerant).trim() + "” — superheat/subcool not calculated. Tables: " + Object.keys(PT).join(", ") + "." };
  const bad = ["suctionPsig", "suctionTemp", "liquidPsig", "liquidTemp"].filter((k) => !Number.isFinite(Number(String(d[k]).trim())));
  if (bad.length) return { state: "error", message: "Not a number: " + bad.map((k) => need.find((n) => n[0] === k)[1]).join(", ") + "." };
  const r = shScValues({ mode: "both", refrigerant: ref, suctionPsig: String(d.suctionPsig).trim(), suctionTemp: String(d.suctionTemp).trim(), liquidPsig: String(d.liquidPsig).trim(), liquidTemp: String(d.liquidTemp).trim() });
  if (r.error) return { state: "error", message: r.error.replace(/^Error: /, "") };
  return { state: "ok", refrigerant: ref, superheat: r.superheat, subcool: r.subcool };
}

/** Text lines for an inline result (screen and Copy). */
export function shScLines(r) {
  if (!r || r.state !== "ok") return [];
  return [
    `Superheat: ${fix1(r.superheat.value)} °F (suction ${fix1(r.superheat.psig)} psig → dew ${fix1(r.superheat.sat)} °F, line ${fix1(r.superheat.line)} °F)`,
    `Subcool: ${fix1(r.subcool.value)} °F (liquid ${fix1(r.subcool.psig)} psig → bubble ${fix1(r.subcool.sat)} °F, line ${fix1(r.subcool.line)} °F)`,
    `PT: ${r.refrigerant} table (dew for superheat, bubble for subcool)`,
  ];
}

const nums = (s) => (String(s == null ? "" : s).match(/\d+(?:[.,]\d+)?/g) || []).map((x) => Number(x.replace(",", "."))).filter((n) => n > 0);

/**
 * Plate RLA/FLA reference for amps %. draft: call draft; rec: the card's stored scan (CARD_SCAN_KEY) or null.
 * Order: the card's RLA/FLA field (source named after where its value came from), else RLA read from the
 * Data plate text. Returns { amps, source } or null (no plate value -> no %).
 */
export function ampsReference(draft, rec) {
  draft = draft || {};
  const cp = cardPlate(draft, rec || null);
  const scanR = rec && nums(rec.rla)[0];
  const plateR = cp && nums(cp.rla)[0];
  const field = nums(draft.fla)[0];
  if (field) {
    if (rec && scanR && field === scanR && cp && cp.edited === false) return { amps: field, source: "RLA from plate scan" };
    if (plateR && field === plateR) return { amps: field, source: "RLA from Data plate" };
    return { amps: field, source: "RLA/FLA typed on the call card" };
  }
  if (plateR) return { amps: plateR, source: rec && cp.edited === false ? "RLA from plate scan" : "RLA from Data plate" };
  return null;
}

/** Amps reading(s) as % of the reference. "12.1 / 11.8" -> two values. Returns { items:[{amps,pct}], ref } or null. */
export function ampsPercent(ampsText, ref) {
  const a = nums(ampsText);
  if (!ref || !ref.amps || !a.length) return null;
  return { ref, items: a.map((x) => ({ amps: x, pct: Math.round((x / ref.amps) * 100) })) };
}

export function ampsLine(p) {
  if (!p) return "";
  return p.items.map((i) => `${i.amps} A = ${i.pct}%`).join(", ") + ` of ${p.ref.amps} A (${p.ref.source})`;
}

/* ---------- times ---------- */
const pad = (n) => String(n).padStart(2, "0");
export function stamp(date = new Date()) {
  return { date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`, time: `${pad(date.getHours())}:${pad(date.getMinutes())}` };
}
const mins = (t) => { const m = String(t || "").match(/^(\d{1,2}):(\d{2})/); return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null; };

/**
 * Total time from start/end "HH:MM" (+ optional dates "YYYY-MM-DD"). With both dates the real difference is
 * used; otherwise, or when the dates give a negative time after an edit, an end before the start means it
 * crossed midnight. Returns { minutes, text, crossedMidnight } or null.
 */
export function totalTime(startTime, endTime, startDate, endDate) {
  const s = mins(startTime), e = mins(endTime);
  if (s == null || e == null) return null;
  let diff = null, crossed = false;
  const ds = Date.parse(startDate || ""), de = Date.parse(endDate || "");
  if (Number.isFinite(ds) && Number.isFinite(de)) {
    diff = Math.round((de - ds) / 60000) + e - s;
    crossed = de > ds;
  }
  if (diff == null || diff < 0) { diff = e - s; crossed = false; if (diff < 0) { diff += 1440; crossed = true; } }
  const text = (diff >= 60 ? Math.floor(diff / 60) + " h " : "") + (diff % 60) + " min" + (crossed ? " (past midnight)" : "");
  return { minutes: diff, text, crossedMidnight: crossed };
}

/* ---------- quick phrases ---------- */
export const PHRASES = ["Replaced filter-drier", "Adjusted TXV", "Cleaned condenser coil", "Checked/cleared drain", "Replaced contactor",
  "Replaced capacitor", "Leak checked", "Evacuated to ___ microns", "Recharged by weight"];

/** Resolution phrases for the Close step's "Fixed" box (wording only, no specs or targets). */
export const CLOSE_PHRASES = ["Verified operation after repair", "Box/space temp pulling down", "Monitored ___ min after repair",
  "Leak repaired and verified", "Customer/manager notified", "Parts on order: ___", "Return visit needed: ___", "Left unit running", "Temporary repair: ___"];

/* ---------- parts list ---------- */
/** Parts rows from the draft: JSON in d.partsList ([{part, qty, note}]); an old free-text d.partsUsed becomes one row. */
export function parseParts(d) {
  d = d || {};
  let rows = [];
  try { const j = JSON.parse(d.partsList || "[]"); if (Array.isArray(j)) rows = j; } catch (e) { rows = []; }
  rows = rows.map((r) => ({ part: String((r && r.part) || ""), qty: String((r && r.qty) || ""), note: String((r && r.note) || "") }));
  if (!rows.length && String(d.partsUsed || "").trim()) rows = [{ part: String(d.partsUsed).trim(), qty: "", note: "" }];
  return rows;
}
/** Copy lines for the parts list: "- part × qty ea (note)"; rows with no part are skipped. */
export function partsLines(rows) {
  return (rows || []).filter((r) => String(r.part || "").trim()).map((r) => {
    const q = String(r.qty || "").trim(), n = String(r.note || "").trim();
    return "- " + r.part.trim() + (q ? " × " + q + " ea" : "") + (n ? " (" + n + ")" : "");
  });
}

/** Append a phrase as its own line. Returns { value, selStart, selEnd }: the "___" blank is selected
 *  (typing replaces it); otherwise the caret goes to the end. */
export function appendPhrase(text, phrase) {
  const base = String(text || "").replace(/\s+$/, "");
  const value = (base ? base + "\n" : "") + phrase;
  const at = phrase.indexOf("___");
  if (at >= 0) { const p = value.length - phrase.length + at; return { value, selStart: p, selEnd: p + 3 }; }
  return { value, selStart: value.length, selEnd: value.length };
}

/* ---------- Copy for Service Tech ---------- */
export function headerLines(d) {
  d = d || {};
  const t = totalTime(d.startTime, d.endTime, d.startDate, d.endDate);
  return [
    "Work order / customer #: " + (String(d.workOrder || "").trim() || "—"),
    "Tech: " + (String(d.techName || "").trim() || "—"),
    "Start: " + ([d.startDate, d.startTime].filter(Boolean).join(" ") || "—"),
    "End: " + ([d.endDate, d.endTime].filter(Boolean).join(" ") || "—"),
    "Total time: " + (t ? t.text : "—"),
  ];
}

export function readingsExtraLines(d, rec) {
  const out = [];
  const r = inlineShSc(d);
  if (r.state === "ok") out.push(...shScLines(r));
  else if (r.state === "error") out.push("SH/SC: " + r.message);
  const p = ampsPercent(d && d.amps, ampsReference(d, rec));
  if (p) out.push("Amps: " + ampsLine(p));
  return out;
}
