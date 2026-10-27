// Heatcraft (Bohn/Larkin/Climate Control) condensing-unit nameplates: a ruled grid with a
// PART NO / MODEL NO / SERIAL NO header row, label cells with the value below, and a
// refrigerant table (TYPE | REF WEIGHT | TEMP MIN MAX | AWEF COOLER FREEZER).
// Rules: values are read by column/cell; nothing is guessed. Any character changed by a fix is flagged.

// Model: 3-letter family (LCH/BCH-style), 4-digit capacity slot, option letters, optional 4-digit tail.
// Only O->0 and S->5, and only inside the two numeric slots.
const MODEL_RE = /^([LBP]C[A-Z])([0-9OS]{4})([A-Z]{2,8})([0-9OS]{4})?$/;
export const HEATCRAFT_MODEL = /^[LBP]C[A-Z]\d{4}[A-Z]{2,8}(?:\d{4})?$/;
// Serial: letter + 2 digits + letter + digits (e.g. T21C05997).
export const HEATCRAFT_SERIAL = /^[A-Z]\d{2}[A-Z]\d{4,7}$/;

export function fixHeatcraftModel(v) {
  const s = String(v || "").toUpperCase();
  const m = s.match(MODEL_RE);
  if (!m) return { value: s, changed: false, ok: HEATCRAFT_MODEL.test(s) };
  const num = (x) => (x || "").replace(/O/g, "0").replace(/S/g, "5");
  const value = m[1] + num(m[2]) + m[3] + num(m[4]);
  return { value, changed: value !== s, ok: HEATCRAFT_MODEL.test(value) };
}

const cleanTok = (t) => String(t).toUpperCase().replace(/€/g, "C").replace(/[^A-Z0-9\-]/g, "");
const ID_TOK = (t) => t.length >= 5 && (t.match(/\d/g) || []).length >= 2;

/**
 * Header row "PART NO.  MODEL NO.  SERIAL NO" with the three values in the row(s) below, same order.
 * Works for PSM 6 (one line each) and PSM 11 (labels on consecutive lines).
 */
export function parseHeaderRow(rawLines) {
  const P = /\bPART\s*N[O0]\b/i, M = /\bMODEL\s*N[O0]\b/i, S = /\bSER[I1l]AL\s*N[O0]\b/i;
  for (let i = 0; i < rawLines.length; i++) {
    let end = -1;
    const l = rawLines[i];
    if (P.test(l) && M.test(l) && S.test(l) && l.search(P) < l.search(M) && l.search(M) < l.search(S)) end = i;
    else if (P.test(l) && M.test(rawLines[i + 1] || "") && S.test(rawLines[i + 2] || "")) end = i + 2;
    if (end < 0) continue;
    const toks = [];
    for (let k = end + 1; k <= end + 3 && k < rawLines.length && toks.length < 3; k++) {
      const t = rawLines[k].split(/\s+/).map(cleanTok).filter(ID_TOK);
      if (!t.length && toks.length) break;
      toks.push(...t);
    }
    if (toks.length !== 3) return null;
    return { part: toks[0], model: toks[1], serial: toks[2], line: end + 1 };
  }
  return null;
}

/** Part numbers on the plate (PART NO row, "P/N" side sticker): never a model or serial. */
export function partNumbers(rawLines, header) {
  const out = new Set();
  if (header) out.add(header.part);
  for (const l of rawLines) for (const m of l.matchAll(/\bP\s*\/\s*N\s*[:#.]?\s*([A-Z0-9-]{4,})/gi)) out.add(cleanTok(m[1]));
  return out;
}

// ---------- refrigerants ----------

export const KNOWN_REFRIGERANTS = ["R22", "R32", "R134A", "R290", "R404A", "R407A", "R407C", "R407F", "R407H", "R410A", "R417A", "R422D",
  "R427A", "R438A", "R448A", "R449A", "R449B", "R450A", "R452A", "R452B", "R454A", "R454B", "R454C", "R455A", "R502", "R507A", "R513A", "R744", "R1234YF", "R1234ZE"];
// What OCR reads for each printed character on these plates.
const LOOKS = { 0: "0ODQ", 1: "1Il|", 2: "2Z", 3: "3", 4: "4A", 5: "5S", 6: "6G", 7: "7T", 8: "8B", 9: "9", R: "R1", A: "A", B: "B", C: "C", D: "D", F: "F", H: "H", Y: "Y", Z: "Z", E: "E" };
const fits = (tok, ref) => tok.length === ref.length && [...ref].every((c, i) => (LOOKS[c] || c).includes(tok[i]));

/** Snap one OCR token to a known R-number. Returns the R-number, or null when no match or ambiguous. */
export function snapRefrigerant(token) {
  const t = String(token || "").toUpperCase().replace(/[^A-Z0-9|]/g, "");
  if (KNOWN_REFRIGERANTS.includes(t)) return t;
  const hits = new Set();
  for (const r of KNOWN_REFRIGERANTS) {
    if (fits(t, r)) hits.add(r);
    if (fits(t, r.slice(1))) hits.add(r); // leading R dropped ("AQ7A")
  }
  return hits.size === 1 ? [...hits][0] : null;
}

/** "R404A/R507A", or two codes glued by a misread slash ("RAOTAIRAOTF"). Null if any part doesn't snap. */
export function snapRow(token) {
  const t = String(token || "").toUpperCase().replace(/[^A-Z0-9\/|]/g, "");
  const parts = t.split("/").filter(Boolean);
  const out = [];
  for (const p of parts) {
    const one = snapRefrigerant(p);
    if (one) { out.push(one); continue; }
    let two = null;
    for (let i = 3; i < p.length - 3 && !two; i++) {
      if (!"Il|1T7".includes(p[i])) continue;
      const a = snapRefrigerant(p.slice(0, i)), b = snapRefrigerant(p.slice(i + 1));
      if (a && b) two = [a, b];
    }
    if (!two) return null;
    out.push(...two);
  }
  return out.length ? out : null;
}

const fmtR = (r) => r.replace(/^R/, "R-");
const ROW_TOK = /^[R1A][A-Z0-9\/|€]{3,12}$/;

/**
 * Refrigerant table rows below the TYPE header. Returns {value, list, rows, unread} or null.
 * value lists every approved refrigerant ("R-404A/R-507A, R-407C, ...").
 */
export function parseRefrigerantTable(rawLines) {
  const h = rawLines.findIndex((l) => /^\W*TYPE\b/i.test(l) || /\bTYPE\b.*\bMIN\b/i.test(l));
  if (h < 0) return null;
  const rows = [], unread = [];
  for (let k = h + 1; k < Math.min(rawLines.length, h + 30); k++) {
    if (/applications|WARNING|ADVERTENC/i.test(rawLines[k])) break;
    const tok = rawLines[k].split(/\s+/)[0].replace(/[^A-Za-z0-9\/|€]/g, "").toUpperCase();
    if (!ROW_TOK.test(tok)) continue;
    const r = snapRow(tok);
    if (r) rows.push({ raw: tok, refs: r }); else if (/\d/.test(tok)) unread.push(tok);
  }
  if (rows.length + unread.length < 2) return null;
  const list = [...new Set(rows.flatMap((r) => r.refs))];
  return { value: rows.map((r) => r.refs.map(fmtR).join("/")).join(", "), list, rows, unread };
}

// ---------- grid cells via word boxes ----------

const nw = (t) => String(t || "").toUpperCase().replace(/[^A-Z0-9.\/\-—_]/g, "");
const box = (w) => w.bbox;
function valuesBelow(words, L, test, { rows = 4, wide = 1 } = {}) {
  const lh = Math.max(10, Math.min(40, box(L).y1 - box(L).y0));
  return words.filter((w) => w.bbox && w !== L && test(nw(w.text)) && (box(w).x0 + box(w).x1) / 2 >= box(L).x0 - lh * wide && (box(w).x0 + box(w).x1) / 2 <= box(L).x1 + lh * wide
    && box(w).y0 >= box(L).y1 - lh * 0.2 && box(w).y0 - box(L).y1 <= lh * rows).sort((a, b) => box(a).y0 - box(b).y0);
}
const fromWord = (w, value, note) => ({ value, raw: w.text, quality: Math.min(0.95, (w.confidence || 0) / 100 + 0.1), note });
function cell(words, labelTest, valTest, conv, opts) {
  for (const L of words.filter((w) => w.bbox && labelTest(nw(w.text)))) {
    const v = valuesBelow(words, L, valTest, opts)[0];
    if (v) return fromWord(v, conv(nw(v.text)));
  }
  return null;
}
const int = (lo, hi) => (t) => /^\d{1,4}$/.test(t) && +t >= lo && +t <= hi;
const dec = (t) => /^\d{1,3}\.\d{1,2}$/.test(t);
const STD_OCP = [15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 110, 125, 150, 175, 200];

/** Values read from the label cells (each value below its label). Only called for Heatcraft plates. */
export function gridFields(words) {
  const out = {};
  if (!words || !words.some((w) => w.bbox)) return out;
  const put = (k, r) => { if (r) out[k] = r; };
  put("partNo", cell(words, (t) => t === "PART", (t) => /^\d{6,10}$/.test(t), String));
  put("voltage", cell(words, (t) => /^V[O0]LTS?$/.test(t), (t) => /^\d{3}[-—]\d{3}$/.test(t), (t) => t.replace(/[-—]/, "/")));
  put("phase", cell(words, (t) => t === "PHASE", (t) => t === "1" || t === "3", Number));
  put("hz", cell(words, (t) => t === "HERTZ" || t === "HZ", (t) => t === "50" || t === "60", Number));
  put("mca", cell(words, (t) => t === "AMPACITY", dec, Number));
  put("mop", cell(words, (t) => t === "PROTECTIVE", (t) => /^\d{2,3}$/.test(t) && STD_OCP.includes(+t), Number));
  put("rla", cell(words, (t) => /^R\.?L\.?A\.?$/.test(t), (t) => dec(t) || int(1, 999)(t), Number, { rows: 2.5 }));
  put("lra", cell(words, (t) => /^L\.?R\.?A\.?$/.test(t), int(5, 999), Number, { rows: 2.5 }));
  if (!out.rla || !out.lra) {
    // Compressor cell: two values (RLA, LRA) left to right under COMPRESSOR.
    const A = words.find((w) => w.bbox && /PRESS?OR$/.test(nw(w.text)) && !/DESIGN/.test(nw(w.text)));
    if (A) {
      const v = valuesBelow(words, A, (t) => dec(t) || int(1, 999)(t), { rows: 3.5 });
      const row = v.filter((w) => Math.abs(box(w).y0 - box(v[0]).y0) < 12).sort((a, b) => box(a).x0 - box(b).x0);
      if (row.length === 2 && +nw(row[1].text) > +nw(row[0].text) && /^\d+$/.test(nw(row[1].text))) {
        if (!out.rla) out.rla = fromWord(row[0], Number(nw(row[0].text)), "read from the compressor cell");
        if (!out.lra) out.lra = fromWord(row[1], Number(nw(row[1].text)), "read from the compressor cell");
      }
    }
  }
  // Condenser fan cell: QTY | HP | FLA left to right under COND. FAN MOTOR.
  const C = words.find((w) => w.bbox && /^COND\.?$/.test(nw(w.text)));
  if (C) {
    const lh = box(C).y1 - box(C).y0;
    const nextCell = words.find((w) => w.bbox && /^CRANKCAS/.test(nw(w.text)));
    const x1 = nextCell ? box(nextCell).x0 : box(C).x0 + lh * 11;
    const span = { ...C, bbox: { ...box(C), x1: x1 - lh } };
    const v = valuesBelow(words, span, (t) => /^[\d.\/]+$/.test(t), { rows: 4, wide: 0.5 });
    const row = v.length ? v.filter((w) => Math.abs(box(w).y0 - box(v[0]).y0) < lh * 0.7).sort((a, b) => box(a).x0 - box(b).x0) : [];
    for (const w of row) {
      const t = nw(w.text);
      if (/^[1-6]$/.test(t) && !out.fanQty && !out.fanHp && !out.fanFla) out.fanQty = fromWord(w, Number(t));
      else if (/^1\/\d{1,2}$|^\d\/\d$|^0?\.\d{2}$/.test(t) && !out.fanHp && !out.fanFla) out.fanHp = fromWord(w, t);
      else if (dec(t) && !out.fanFla) out.fanFla = fromWord(w, Number(t));
    }
  }
  put("crankcaseW", cell(words, (t) => /^CRANKCAS/.test(t), int(10, 400), Number, { rows: 3.5 }));
  put("evapFanA", cell(words, (t) => /^EVAP/.test(t), (t) => int(1, 60)(t) || dec(t), Number, { rows: 2 }));
  put("defrostA", cell(words, (t) => /^DEFROST/.test(t), (t) => int(1, 99)(t) || dec(t), Number, { rows: 3.5 }));
  put("designHigh", cell(words, (t) => t === "HIGH", int(100, 700), (t) => t + " psig", { rows: 2 }));
  put("designLow", cell(words, (t) => t === "LOW", int(50, 500), (t) => t + " psig", { rows: 2 }));
  // AWEF (freezer column): every row must agree.
  const F = words.find((w) => w.bbox && /^FREEZER/.test(nw(w.text)) && words.some((a) => a.bbox && /AWEF/.test(nw(a.text)) || /COOLER/.test(nw(a.text))));
  if (F) {
    const v = valuesBelow(words, F, (t) => /^\d\.\d{2}$/.test(t), { rows: 9 });
    const vals = [...new Set(v.map((w) => nw(w.text)))];
    if (v.length >= 2 && vals.length === 1) out.awef = { value: Number(vals[0]), raw: vals[0], quality: 0.9, note: "freezer AWEF, same on " + v.length + " rows" };
  }
  // Temperature range: MIN column -40 and MAX column 0 on every row read.
  const MIN = words.find((w) => w.bbox && nw(w.text) === "MIN");
  if (MIN) {
    const MAX = words.find((w) => w.bbox && /^MAX/.test(nw(w.text)) && Math.abs(box(w).y0 - box(MIN).y0) < 12 && box(w).x0 > box(MIN).x1);
    const mins = valuesBelow(words, MIN, (t) => /^[-—_~]?\d{1,2}$/.test(t), { rows: 9 }).map((w) => nw(w.text).replace(/^[—_~]/, "-"));
    const maxs = MAX ? valuesBelow(words, { ...MAX, bbox: { ...box(MAX), x1: box(MAX).x0 + (box(MIN).x1 - box(MIN).x0) } }, (t) => /^-?\d{1,2}$/.test(t), { rows: 9 }).map((w) => nw(w.text)) : [];
    const one = (a) => (a.length >= 2 && new Set(a).size === 1 ? a[0] : null);
    if (one(mins) && one(maxs)) out.tempRange = { value: one(mins) + " to " + one(maxs) + " °F", raw: one(mins) + " " + one(maxs), quality: 0.85 };
  }
  return out;
}
