/**
 * Data-plate text parser (pure ES module, no DOM, no network).
 *
 * parsePlate(input) takes either the OCR text as a string, or
 * { text, words: [{ text, confidence }] } where confidence is Tesseract's 0-100
 * per-word value.
 *
 * It returns { fields, lowConfidence, text }. fields[name] = { value, confidence (0..1),
 * quality (0..1), ocr (0..100|null), raw, note? } and is present ONLY when the
 * text actually contains a match. Nothing is ever guessed or defaulted.
 */

export const LOW_CONFIDENCE = 0.6;

export const REFRIGERANTS = [
  "410A", "22", "32", "454B", "134A", "404A", "407C", "407A", "407F", "448A", "449A",
  "452B", "513A", "507A", "507", "290", "744", "1234YF", "1234ZE", "466A", "454C", "455A",
];

const NUM = "(\\d{1,4}(?:[.,]\\d{1,3})?)";

/** Fix common OCR slips inside tokens that are mostly digits (O→0, l/I→1). */
function fixDigits(line) {
  return line.replace(/\b[0-9OIl.,]*\d[0-9OIl.,]*\b/g, (tok) => tok.replace(/O/g, "0").replace(/[Il]/g, "1"));
}

function toNum(s) {
  return s == null ? null : parseFloat(String(s).replace(",", "."));
}

function round(n, d = 2) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

function normWord(w) {
  return String(w || "").toUpperCase().replace(/[^A-Z0-9.]/g, "");
}

/** Mean Tesseract confidence of the OCR words that make up `raw`, or null. */
function ocrConfidence(raw, words) {
  if (!words || !words.length || !raw) return null;
  const target = normWord(raw);
  if (!target) return null;
  // Prefer words that are exactly the value; otherwise words that make up a
  // large part of it (a stray "6" must not count toward "62.9").
  let hits = words.filter((w) => normWord(w.text).replace(/\.$/, "") === target.replace(/\.$/, ""));
  if (!hits.length) {
    hits = words.filter((w) => {
      const n = normWord(w.text);
      return n.length >= 2 && ((target.includes(n) && n.length * 2 >= target.length) || (n.includes(target) && target.length * 2 >= n.length));
    });
  }
  if (!hits.length) return null;
  return hits.reduce((a, w) => a + (Number(w.confidence) || 0), 0) / hits.length;
}

function field(value, quality, raw, words, note) {
  const ocr = ocrConfidence(raw, words);
  const confidence = round(quality * (ocr == null ? 1 : ocr / 100), 2);
  const f = { value, confidence, quality: round(quality, 2), ocr: ocr == null ? null : round(ocr, 1), raw };
  if (note) f.note = note;
  return f;
}

/** First match across lines. Returns { m, line, index } or null. */
function findLine(lines, re) {
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re);
    if (m) return { m, line: lines[i], index: i };
  }
  return null;
}

/** Labelled number: "LABEL ... 12.3" on the same line, or the label alone with the number on the next line. */
function labelled(lines, labelRe, opts = {}) {
  const same = new RegExp("(?:" + labelRe.source + ")" + "\\s*(?:\\((?:A|AMPS?)\\))?\\s*[:=.#-]?\\s*" + NUM + "(?!\\s*(?:HZ|V\\b|VOLT|PH|%))", "i");
  for (let i = 0; i < lines.length; i++) {
    if (opts.lineFilter && !opts.lineFilter(lines[i])) continue;
    const m = lines[i].match(same);
    if (m) return { num: toNum(m[1]), raw: m[1], quality: 1, line: lines[i] };
  }
  // Label on its own at the end of a line, value starts the next line (lower quality).
  const alone = new RegExp("(?:" + labelRe.source + ")" + "\\s*(?:\\((?:A|AMPS?)\\))?\\s*[:=]?\\s*$", "i");
  for (let i = 0; i < lines.length - 1; i++) {
    if (opts.lineFilter && !opts.lineFilter(lines[i])) continue;
    if (alone.test(lines[i])) {
      const m = lines[i + 1].match(new RegExp("^\\s*" + NUM + "\\b"));
      if (m) return { num: toNum(m[1]), raw: m[1], quality: 0.75, line: lines[i + 1] };
    }
  }
  return null;
}

const IDENT = "([A-Z0-9][A-Z0-9\\-\\/.]{3,}[A-Z0-9])";

function parseIdent(lines, labelRe) {
  const r = findLine(lines, new RegExp("(?:" + labelRe.source + ")" + "\\s*[:#.]?\\s*" + IDENT, "i"));
  if (!r) return null;
  let v = r.m[1].toUpperCase();
  // A label word can't be the value ("MODEL NO SERIAL ...").
  if (/^(SERIAL|MODEL|NUMBER|VOLTS?)$/.test(v)) return null;
  // Identifiers have digits; pure words are probably a mis-read label.
  const q = /\d/.test(v) ? 1 : 0.4;
  return { value: v, raw: r.m[1], quality: q };
}

function parseRefrigerant(lines) {
  // OCR slips inside refrigerant codes: "R-41OA" -> "R-410A", "REFRlGERANT" -> "REFRIGERANT".
  lines = lines.map((l) => l
    .replace(/REFR[l1|]GERANT/gi, "REFRIGERANT")
    .replace(/\bR(\s?-?\s?)([0-9OIl]{2,4})([A-Z]{0,2})\b/g, (m, sep, d, suf) => "R" + sep + d.replace(/O/g, "0").replace(/[Il]/g, "1") + suf));
  const codes = REFRIGERANTS.map((c) => c.replace(/([A-Z])$/, "$1?")).join("|");
  // Optional "R" prefix only after a REFRIGERANT label; otherwise require R.
  const withR = new RegExp("\\bR\\s?[-\\u2010-\\u2014]?\\s?(" + codes + ")\\b", "i");
  const labelled = new RegExp("REFRIG(?:ERANT)?\\.?\\s*(?:TYPE)?\\s*[:.]?\\s*(?:HFC-?|HFO-?)?R?\\s?[-]?\\s?(" + codes + ")\\b", "i");
  let r = findLine(lines, labelled), quality = 1;
  if (!r) { r = findLine(lines, withR); quality = 0.85; }
  if (!r) return null;
  let code = r.m[1].toUpperCase();
  // OCR often drops the trailing letter. Fill it back in only where the
  // family has a single common blend, and say so.
  let note;
  const exact = REFRIGERANTS.includes(code);
  if (!exact) {
    const cand = REFRIGERANTS.filter((c) => c.startsWith(code) && c.length === code.length + 1);
    if (cand.length === 1) { code = cand[0]; quality *= 0.6; note = "suffix letter inferred from OCR text"; }
    else if (cand.length > 1) { quality *= 0.3; note = "ambiguous blend suffix"; }
  }
  return { value: "R-" + code, raw: r.m[0], quality, note };
}

function parseCharge(lines) {
  const label = /(?:FACTORY\s*)?(?:CHARGE|CHG|CHRG)\b|REFRIG(?:ERANT)?\b[^\n]*?\b(?:LBS?|OZ|KG)\b/i;
  const reLbOz = new RegExp(NUM + "\\s*(?:LBS?\\.?|POUNDS?|#)\\s*[,-]?\\s*(?:" + NUM + "\\s*(?:OZ\\.?|OUNCES?))?", "i");
  const reOz = new RegExp(NUM + "\\s*(?:OZ\\.?|OUNCES?)\\b", "i");
  const reKg = new RegExp(NUM + "\\s*KG\\b", "i");
  const ordered = lines.map((l, i) => ({ l, i, lab: label.test(l) })).sort((a, b) => b.lab - a.lab);
  for (const { l, lab } of ordered) {
    let lb = null, oz = null, kg = null, raw = null;
    const m = l.match(reLbOz);
    if (m) { lb = toNum(m[1]); oz = m[2] ? toNum(m[2]) : 0; raw = m[0]; }
    else {
      const mo = l.match(reOz);
      if (mo) { lb = 0; oz = toNum(mo[1]); raw = mo[0]; }
    }
    const mk = l.match(reKg);
    if (mk) kg = toNum(mk[1]);
    if (lb == null && kg == null) continue;
    let totalLb = lb != null ? lb + oz / 16 : kg * 2.20462;
    const quality = (lab ? 1 : 0.55) * (lb != null ? 1 : 0.9);
    if (lb == null) raw = mk[0];
    totalLb = round(totalLb, 2);
    const wholeLb = Math.floor(totalLb + 1e-9);
    const remOz = round((totalLb - wholeLb) * 16, 1);
    let note = lb == null ? "converted from kg" : undefined;
    if (lb != null && kg != null && Math.abs(kg * 2.20462 - totalLb) > 0.15 * totalLb) note = "lb and kg on plate disagree";
    return {
      value: { lb: totalLb, oz: round(totalLb * 16, 1), display: `${wholeLb} lb ${remOz} oz (${totalLb} lb)` },
      raw, quality: note === "lb and kg on plate disagree" ? quality * 0.5 : quality, note,
    };
  }
  return null;
}

const STD_VOLTS = [100, 110, 115, 120, 127, 200, 208, 220, 230, 240, 265, 277, 380, 400, 415, 440, 460, 480, 575, 600];

function parseElectrical(lines) {
  const out = {};
  // Combined "208/230-1-60" or "460-3-60".
  const combo = findLine(lines, /\b(\d{3}(?:\s*[\/-]\s*\d{3})?)\s*V?\s*[-\/]\s*([13])\s*[-\/]\s*(50|60)\b/i);
  if (combo) {
    out.voltage = { value: combo.m[1].replace(/\s+/g, "").replace(/-/g, "/"), raw: combo.m[1], quality: 0.9 };
    out.phase = { value: Number(combo.m[2]), raw: combo.m[2], quality: 0.9 };
    out.hz = { value: Number(combo.m[3]), raw: combo.m[3], quality: 0.9 };
  }
  if (!out.voltage) {
    const v = findLine(lines, /\b(?:VOLTS?|VOLTAGE|V)\s*(?:AC)?\s*[:.]?\s*(\d{3}(?:\s*[\/-]\s*\d{3})?)\b/i)
      || findLine(lines, /\b(\d{3}(?:\s*[\/-]\s*\d{3})?)\s*(?:VAC|V\b|VOLTS?)/i);
    if (v) out.voltage = { value: v.m[1].replace(/\s+/g, "").replace(/-/g, "/"), raw: v.m[1], quality: 1 };
  }
  if (out.voltage) {
    const parts = out.voltage.value.split("/").map(Number);
    if (!parts.every((p) => STD_VOLTS.includes(p))) { out.voltage.quality *= 0.5; out.voltage.note = "non-standard voltage"; }
  }
  if (!out.phase) {
    const p = findLine(lines, /\b(?:PH(?:ASE)?|Ø|Φ)\s*[:.]?\s*([13])\b/i) || findLine(lines, /\b([13])\s*(?:PH(?:ASE)?|Ø|Φ|~)/i);
    if (p) out.phase = { value: Number(p.m[1]), raw: p.m[1], quality: 1 };
  }
  if (!out.hz) {
    const h = findLine(lines, /\b(50|60)\s*HZ\b/i) || findLine(lines, /\bHZ\s*[:.]?\s*(50|60)\b/i);
    if (h) out.hz = { value: Number(h.m[1]), raw: h.m[1], quality: 1 };
  }
  return out;
}

/**
 * @param {string|{text:string, words?:Array<{text:string,confidence:number}>}} input
 */
export function parsePlate(input) {
  const text = typeof input === "string" ? input : (input && input.text) || "";
  const words = typeof input === "string" ? null : (input && input.words) || null;
  const lines = text.split(/\r?\n/).map((l) => fixDigits(l.replace(/\s+/g, " ").trim())).filter(Boolean);
  const fields = {};
  const put = (name, r) => { if (r) fields[name] = field(r.value, r.quality, r.raw, words, r.note); };

  put("model", parseIdent(lines, /\b(?:MODEL|MOD\.?)(?![A-Z])\s*(?:NO\.?|NUMBER|#)?|\bM\/N/));
  put("serial", parseIdent(lines, /\b(?:SERIAL|SER\.?)(?![A-Z])\s*(?:NO\.?|NUMBER|#)?|\bS\/N/));
  put("refrigerant", parseRefrigerant(lines));
  put("charge", parseCharge(lines));
  const el = parseElectrical(lines);
  put("voltage", el.voltage); put("phase", el.phase); put("hz", el.hz);

  const RLA = /\b(?:COMP(?:RESSOR)?\.?\s*)?R\.?\s?L\.?\s?A\.?/;
  const LRA = /\b(?:COMP(?:RESSOR)?\.?\s*)?L\.?\s?R\.?\s?A\.?/;
  const FLA = /\bF\.?\s?L\.?\s?A\.?/;
  const isFanLine = (l) => /\b(?:FAN|OFM|IFM|COND(?:ENSER)?\.?\s*FAN|BLOWER|MOTOR)\b/i.test(l);
  const num = (r) => r && { value: r.num, raw: r.raw, quality: r.quality };

  put("rla", num(labelled(lines, RLA)));
  put("lra", num(labelled(lines, LRA)));
  let fan = labelled(lines, FLA, { lineFilter: isFanLine });
  if (!fan) { fan = labelled(lines, FLA); if (fan) fan.quality *= 0.5; }
  put("fanFla", num(fan));
  put("mca", num(labelled(lines, /\b(?:MCA|M\.C\.A\.?|MIN(?:IMUM)?\.?\s*(?:CIRCUIT|CIR\.?|CKT\.?)\s*AMP(?:ACITY|S)?\.?)/)));
  put("mop", num(labelled(lines, /\b(?:MOCP|MOP|M\.O\.C\.?P\.?|M\.O\.P\.?|MAX(?:IMUM)?\.?\s*(?:OVERCURRENT\s*(?:PROT(?:ECTION|\.)?(?:\s*DEVICE)?)?|O\.?C\.?P\.?|FUSE(?:\s*(?:\/|OR)\s*(?:HACR\s*)?(?:CKT\.?\s*)?(?:BKR\.?|BREAKER))?(?:\s*SIZE)?|BKR|BREAKER))/)));

  // Cross-checks: implausible combinations lower confidence (values are never changed).
  const chk = (cond, names, note) => {
    if (!cond) return;
    names.forEach((n) => {
      const f = fields[n];
      if (!f) return;
      f.confidence = round(f.confidence * 0.5, 2);
      f.note = f.note ? f.note + "; " + note : note;
    });
  };
  const g = (n) => fields[n] && fields[n].value;
  chk(g("rla") != null && g("lra") != null && g("lra") <= g("rla"), ["rla", "lra"], "LRA should exceed RLA");
  chk(g("mca") != null && g("mop") != null && g("mop") < g("mca"), ["mca", "mop"], "MOP below MCA");
  chk(g("mca") != null && g("rla") != null && g("mca") < g("rla"), ["mca", "rla"], "MCA below RLA");

  const lowConfidence = Object.keys(fields).filter((k) => fields[k].confidence < LOW_CONFIDENCE);
  return { fields, lowConfidence, text };
}
