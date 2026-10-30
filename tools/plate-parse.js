/**
 * Data-plate text parser (pure ES module, no DOM, no network).
 *
 * parsePlate(input) takes either the OCR text as a string, or
 * { text, words: [{ text, confidence }] } where confidence is Tesseract's 0-100
 * per-word value.
 *
 * Returns { fields, lowConfidence, hints, text }. fields[name] = { value,
 * confidence (0..1), quality (0..1), ocr (0..100|null), raw, note? } and is
 * present ONLY when the text actually contains a match. Nothing is ever guessed
 * or defaulted: a field that isn't on the plate stays absent (blank).
 */

import { parseLoadTable, voltPhHz } from "./plate-loadtable.js?v=42";
import { assignIdsByPattern, parseHeaderRow, partNumbers, fixHeatcraftModel, HEATCRAFT_MODEL, HEATCRAFT_SERIAL, parseRefrigerantTable, gridFields } from "./plate-heatcraft.js?v=42";

export const LOW_CONFIDENCE = 0.6;
/** Stricter bar for identifiers: a wrong model/serial costs a wrong part or warranty lookup. */
export const LOW_CONFIDENCE_ID = 0.75;
export const ID_FIELDS = ["model", "serial"];
export const lowBar = (name) => (ID_FIELDS.includes(name) ? LOW_CONFIDENCE_ID : LOW_CONFIDENCE);

export const REFRIGERANTS = [
  "410A", "22", "32", "454B", "134A", "404A", "407C", "407A", "407F", "448A", "449A",
  "452B", "513A", "507A", "507", "290", "744", "1234YF", "1234ZE", "466A", "454C", "455A",
];

const BRANDS = [
  ["Carrier", /\bCARR[I1l]ER\b/], ["Bryant", /\bBRYANT\b/], ["Payne", /\bPAYNE\b/],
  ["Trane", /\bTRANE\b/], ["American Standard", /\bAMERICAN\s+STANDARD\b/],
  ["Goodman", /\bGOODMAN\b/], ["Amana", /\bAMANA\b/], ["Daikin", /\bDA[I1l]K[I1l]N\b/],
  ["Lennox", /\bLENNOX\b/], ["Rheem", /\bRHEEM\b/], ["Ruud", /\bRUUD\b/],
  ["Emerson / Copeland", /\bEMERSON\b[\s\S]{0,80}\bCOPELAND\b|\bCOPELAND\b[\s\S]{0,80}\bEMERSON\b/], ["Copeland", /\bCOPELAND\b/],
  ["Emerson / Copeland", /\bEMERSON\b/], ["Unitary Products Group (York/Coleman)", /\bUN[I1l]T[AE]RY\s+PRODUCTS\b|\bPRODUCTS\s+GROUP\b|\bNORMAN\s*[,.]?\s*OK(?:LAHOMA)?\b|\d+\s+YORK\s+(?:DR|DRIVE)\b|\b73069\b/], ["Heatcraft", /\bHEATCRAFT\b/], ["Bohn", /\bBOHN\b/],
  ["Larkin", /\bLARKIN\b/], ["Mitsubishi Electric", /\bM[I1l]TSUB[I1l]SH[I1l]\b/],
  ["Fujitsu", /\bFUJ[I1l]TSU\b/], ["York", /(?<!\d\s{0,3})\bYORK\b(?!\s*(?:,\s*PA|DR\b|DRIVE|NORMAN|ROAD|RD\b|ST\b))/], ["LG", /\bLG\s+ELECTRONICS\b/],
  ["Samsung", /\bSAMSUNG\b/], ["Gree", /\bGREE\b/], ["Bosch", /\bBOSCH\b/],
  ["Heil", /\bHE[I1l]L\b/], ["Tempstar", /\bTEMPSTAR\b/], ["Midea", /\bM[I1l]DEA\b/],
  ["Toshiba", /\bTOSH[I1l]BA\b/], ["Panasonic", /\bPANASON[I1l]C\b/], ["Tecumseh", /\bTECUMSEH\b/],
  ["MRCOOL", /\bMRCOOL\b/], ["Frigidaire", /\bFR[I1l]G[I1l]DA[I1l]RE\b/], ["KeepRite", /\bKEEPR[I1l]TE\b/],
];

// ---------- helpers ----------

function round(n, d = 2) { const f = 10 ** d; return Math.round(n * f) / f; }
function toNum(s) { return s == null ? null : parseFloat(String(s).replace(",", ".")); }

/**
 * Numeric-context OCR repair: inside runs that contain a digit, O/o/Q/D -> 0 and
 * I/l/|/! -> 1 when touching a digit; S->5, B->8, Z->2 only when sandwiched
 * between digits (or a decimal point). Units like "OZ" are protected.
 */
export function fixDigits(s) {
  s = s.replace(/(\d)\s*OZ\b/gi, "$1 \u0001");
  s = s.replace(/[0-9OoQDIl|!SBZ.,]*\d[0-9OoQDIl|!SBZ.,]*/g, (run) => {
    const ch = run.split("");
    const isD = (c) => c != null && /[\d.,]/.test(c);
    for (let i = 0; i < ch.length; i++) {
      const c = ch[i], p = ch[i - 1], n = ch[i + 1];
      const nearD = /\d/.test(p || "") || /\d/.test(n || "") || (/[.,]/.test(p || "") && /\d/.test(ch[i - 2] || ""));
      if (/[OoQD]/.test(c) && nearD) ch[i] = "0";
      else if (/[Il|!]/.test(c) && nearD) ch[i] = "1";
      else if (/[SBZ]/.test(c) && isD(p) && isD(n)) ch[i] = { S: "5", B: "8", Z: "2" }[c];
    }
    return ch.join("");
  });
  return s.replace(/\u0001/g, "OZ");
}

function normWord(w) { return String(w || "").toUpperCase().replace(/[^A-Z0-9.]/g, ""); }

/** Mean Tesseract confidence of the OCR word(s) that make up `raw`, or null. */
function ocrConfidence(raw, words) {
  if (!words || !words.length || !raw) return null;
  const parts = String(raw).split(/\s+/).map((p) => normWord(fixDigits(p)).replace(/\.$/, "")).filter(Boolean);
  if (!parts.length) return null;
  const confs = [];
  for (const target of parts) {
    let hits = words.filter((w) => normWord(fixDigits(w.text)).replace(/\.$/, "") === target);
    if (!hits.length) {
      hits = words.filter((w) => {
        const n = normWord(fixDigits(w.text));
        return n.length >= 2 && ((target.includes(n) && n.length * 2 >= target.length) || (n.includes(target) && target.length * 2 >= n.length));
      });
    }
    // Several identical words (e.g. "60" twice): the best-read one is the evidence.
    if (hits.length) confs.push(Math.max(...hits.map((w) => Number(w.confidence) || 0)));
  }
  if (!confs.length) return null;
  return confs.reduce((a, b) => a + b, 0) / confs.length;
}

function field(value, quality, raw, words, note) {
  const ocr = ocrConfidence(raw, words);
  const confidence = round(quality * (ocr == null ? 1 : ocr / 100), 2);
  const f = { value, confidence, quality: round(quality, 2), ocr: ocr == null ? null : round(ocr, 1), raw };
  if (note) f.note = note;
  return f;
}

// ---------- certification / regulatory text ----------

const CERT_TOKENS = [
  /\bCONTAINS\s+FCC\b/gi, /\bFCC\s*[-:]?\s*ID\s*[:.]?\s*[A-Z0-9-]+/gi, /\bFCC\b[^\n]*?(?=$)/gi,
  /\bIC\s*[-:]?\s*ID\s*[:.]?\s*[A-Z0-9-]+/gi, /\bIC\s*:\s*[0-9A-Z-]+/gi,
  /\b(?:NO\.?\s*)?(?:UL\s*|CSA\s*|IEC\s*|EN\s*|CAN\/CSA[-\s]*)?60335\s*[-–]\s*\d+(?:\s*[-–]\s*\d+)?\.?/gi,
  /\bC\s?22\s?\.\s?2(?:\s*NO\.?\s*[\d.-]+)?/gi, /\bUL\s*(?:STD\.?\s*)?(?:NO\.?\s*)?(?:1995|484|250|60335|1563)\b/gi,
  /\bINTERTEK\b\s*\d*/gi, /\bETL\s*(?:LISTED|CLASSIFIED)?\b/gi, /\bCONFORMS\s+TO\b/gi, /\bCERTIFIED\s+TO\b/gi,
  /\b(?:UL|CSA)\s+STD\.?/gi, /\bAHRI\b[^\n]*/gi, /\bENERGY\s+STAR\b/gi, /\bIPX\d\b/gi, /\bIP\d{2}\b/gi,
  /\bLISTED\b/gi, /\bCSA\b/gi, /\b(?:c\s*)?US\b(?=\s*$)/g,
];
const CERT_LINE = /\b(?:ETL|INTERTEK|CONFORMS|CERTIFIED|LISTED|FCC|IC\s*[-:]?\s*ID|IC\s*:|60335|C\s?22\s?\.\s?2|UL\s+STD|CSA\s+STD|IPX\d)\b/i;
const FIELD_LABEL = /\b(?:MODEL|MOD|M\/N|SERIAL|SER[I1l]AL|S\/N|VOLT|SOURCE|POWER|SUPPLY|PH|HZ|RLA|LRA|FLA|FAN|MCA|MOP|MOCP|AMP|FUSE|BKR|REFRIG|CHARGE|COMP)/i;

/** Remove certification marks/standard numbers so their digits never become field values. */
function stripCerts(line) {
  if (!CERT_LINE.test(line)) return line;
  let out = line;
  for (const re of CERT_TOKENS) out = out.replace(re, " ");
  out = out.replace(/\s+/g, " ").trim();
  // A line that was only certification text (e.g. "91987", "NO.") is dropped.
  if (!FIELD_LABEL.test(out) && !/[A-Z]{3,}/i.test(out.replace(/\bNO\b\.?/gi, ""))) return "";
  return out;
}

// ---------- generic labelled number ----------

const NUMTOK = "([0-9OoQDIl|!SBZ]{0,3}\\d[0-9OoQDIl|!SBZ]{0,3}(?:[.,][0-9OoQDIl|!SBZ]{1,3})?)";
const AMP_SUFFIX = "(?!\\s*(?:HZ|V\\b|VAC|VOLT|PH|%|KW|W\\b|HP\\b(?!\\s*[:.]?\\s*\\d)|MM|IN\\b|PSI|MPA|KPA|\\/\\d|[-–]\\s*\\d{3}))";

function cleanNum(raw) {
  const fixed = fixDigits(raw);
  if (!/^\d+(?:[.,]\d+)?$/.test(fixed)) return null;
  // "035" on an amps line is "0.35" with the printed decimal point lost.
  if (/^0\d{1,2}$/.test(fixed)) return { num: toNum("0." + fixed.slice(1)), fixed: "0." + fixed.slice(1), corrected: true, decimal: true };
  return { num: toNum(fixed), fixed, corrected: fixed !== raw };
}

/**
 * Labelled number: "LABEL ... 12.3" on the same line (':' '.' '-' '=' or no
 * separator), or the label at the end of a line with the number starting one of
 * the next two lines. Returns all matches in order: [{num, raw, quality, index, line}].
 */
function labelledAll(lines, labelRe, opts = {}) {
  const src = "(?:" + labelRe.source + ")";
  const unit = "\\s*(?:\\(\\s*(?:A|AMPS?)\\s*\\)|AMPS?\\b)?";
  const paren = opts.skipParen ? "[.,]?(?:\\s*\\([^)]*\\)?)?" : "";
  const nextLbl = "(?!\\s*(?:R\\.?L\\.?A|L\\.?R\\.?A|F\\.?L\\.?A)\\b)";
  const same = new RegExp(src + unit + paren + "\\s*[:=.#\\-]?\\s*" + NUMTOK + "(?![.,]?\\d)" + AMP_SUFFIX.replace("%|", ""), "gi");
  const before = opts.valueBefore ? new RegExp("(?:^|[\\s:])" + NUMTOK + "\\s*\"?\\s*" + src + "(?![A-Z])", "gi") : null;
  const alone = new RegExp(src + unit + paren + "\\s*[:=.\\-]?\\s*$", "i");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (opts.lineFilter && !opts.lineFilter(lines[i], i, lines)) continue;
    same.lastIndex = 0;
    let m, found = false;
    // "13.6 RLA 73 LRA": amps written value-first; the line ends with a label and has no "LABEL:".
    const firstLbl = lines[i].search(/(?:R\.?L\.?A|L\.?R\.?A|F\.?L\.?A)\b/i);
    const beforeStyle = before && firstLbl > 0 && /\d\s*["']?\s*$/.test(lines[i].slice(0, firstLbl)) && new RegExp(NUMTOK + "\\s*\"?\\s*(?:R\\.?L\\.?A|L\\.?R\\.?A|F\\.?L\\.?A|AMPS)\\.?(?:\\s+[\\d\\/.]+\\s*HP)?[^A-Z0-9]*$", "i").test(lines[i]) && !/(?:R\.?L\.?A|L\.?R\.?A|F\.?L\.?A)\.?\s*[:=]/i.test(lines[i]);
    if (!beforeStyle) while ((m = same.exec(lines[i]))) {
      const c = cleanNum(m[m.length - 1]);
      if (!c) continue;
      const tail = lines[i].slice(m.index + m[0].length);
      if (/^\s*%/.test(tail) && !opts.marks) continue;
      const r = { num: c.num, raw: c.fixed, quality: c.corrected ? 0.85 : 1, corrected: c.corrected, decimal: c.decimal, index: i, line: lines[i], match: m };
      if (/^[%°*º]/.test(tail)) { r.quality *= 0.5; r.obscured = true; }
      out.push(r);
      found = true;
    }
    if (beforeStyle) {
      before.lastIndex = 0;
      while ((m = before.exec(lines[i]))) {
        const c = cleanNum(m[1]);
        if (!c) continue;
        out.push({ num: c.num, raw: c.fixed, quality: 0.95 * (c.corrected ? 0.85 : 1), corrected: c.corrected, decimal: c.decimal, index: i, line: lines[i], match: m });
        found = true;
      }
    }
    if (found) continue;
    if (alone.test(lines[i])) {
      for (let k = 1; k <= 2 && i + k < lines.length; k++) {
        const nm = lines[i + k].match(new RegExp("^\\s*" + NUMTOK + AMP_SUFFIX + "\\s*(?:A|AMPS?)?\\b"));
        if (nm) {
          const c = cleanNum(nm[1]);
          if (c) { out.push({ num: c.num, raw: c.fixed, quality: (k === 1 ? 0.85 : 0.75) * (c.corrected ? 0.85 : 1), corrected: c.corrected, decimal: c.decimal, index: i + k, line: lines[i + k], match: nm, split: true }); break; }
        }
        if (FIELD_LABEL.test(lines[i + k])) break;
      }
      // Sparse-text layouts sometimes put the value on the line BEFORE the label.
      if (opts.prevLine && !out.some((r) => r.index > i) && i > 0) {
        const pm = lines[i - 1].match(new RegExp("^[\\s\\-:=]*" + NUMTOK + "(?![.,]?\\d)([%°*º]?)[\\s.,]*$"));
        const c = pm && cleanNum(pm[1]);
        if (c) out.push({ num: c.num, raw: c.fixed, quality: 0.6 * (pm[2] ? 0.8 : 1), corrected: c.corrected, decimal: c.decimal, index: i - 1, line: lines[i - 1], match: pm, obscured: !!pm[2] });
      }
    }
  }
  return out;
}

const numField = (r, note) => r && { value: r.num, raw: r.raw, quality: r.quality * (r.decimal ? 0.6 : 1), note: [r.decimal ? "decimal point inferred (read without it)" : r.corrected ? "OCR letters read as digits" : null, r.obscured ? "partly obscured: check the plate" : null, note].filter(Boolean).join("; ") || undefined };

// ---------- model / serial ----------

const LABEL_WORDS = /^(?:MODEL|MODELE|MODÈLE|SERIAL|SERIE|SÉRIE|NUMBER|NO\.?|VOLTS?|SOURCE|S\/N|M\/N|MFG|DATE|REFRIGERANT|CHARGE|PH|HZ|RLA|LRA|FLA|MCA|MOP|MOCP)$/i;
const MODEL_LABEL = /\b(?:MODEL|MODE1|M0DEL|MOD|MDL)(?![A-Z])\.?(?:\s*\/\s*MOD[EÈ]LE)?\s*(?:NO\.?|N0\.?|NUMBER|#|N°)?|\bM\s?\/\s?N\b/i;
const SERIAL_LABEL = /\b(?:SER[I1l|]AL|SER)(?:(?![A-Z])|(?=N[O0]\b))\.?(?:\s*\/\s*S[EÉ]RIE)?\s*(?:NO\.?|N0\.?|NUMBER|#|N°)?|\bS\s?\/\s?N\b/i;
const IDENT_TOKEN = /^[A-Z0-9][A-Z0-9\-\/.]*[A-Z0-9]$/;
// Also 3/B at a letter/digit boundary and 0/O, 1/I between letters ("B0A", "C1E").
// Any letter O or I in a model/serial is ambiguous with 0/1 (many makers never use them).
const CONFUSABLE3B = /\d[3B8][A-Z]|[A-Z][3B8]\d|[A-Z][01][A-Z]|[OI]/;
const CONFUSABLE = /\d[OIlSBZQ]\d|[A-Z][0278][A-Z]|[OIl](?=\d{2})|\d{2}[OIl]\b|Q/;

/** Take the identifier tokens after a label: first token + split-digit groups ("WWB 015057"). */
function takeIdent(rest) {
  const toks = rest.replace(/^[\s:#.,\-]+/, "").split(/\s+/).filter(Boolean);
  if (!toks.length) return null;
  // Stray dots inside an identifier are OCR noise ("ASUG15L.ZAS"); trailing punctuation too.
  const first = toks[0].replace(/[.,;:]+$/, "").replace(/\.(?=[A-Za-z0-9])/g, "").toUpperCase();
  if (!IDENT_TOKEN.test(first) || first.length < 3 || LABEL_WORDS.test(first)) return null;
  let value = first, raw = toks[0], joined = false;
  for (let i = 1; i < toks.length; i++) {
    const t = toks[i].replace(/[,;]+$/, "").toUpperCase();
    // Printed letter-spaced digits ("WWB 0 1 5 0 5 7" / "WWB 015057") are one serial.
    if (/^\d{1,8}$/.test(t) && value.length + t.length <= 20) { value += t; raw += " " + toks[i]; joined = true; }
    else break;
  }
  return { value, raw, joined };
}

// Lines that end an identifier continuation in sparse (PSM 11) output: any known label.
const STOP_LINE = /\b(?:MODEL|SERIAL|SER|VOLTS?|SOURCE|PHASE|HZ|RLA|LRA|FLA|MCA|MOP|REFRIG\w*|CHARGE|COMP\w*|FAN|DESIGN|PRESS\w*|ETL|UL|CSA|LISTED|CONFORMS|CERTIFIED|INDOOR|OUTDOOR|APPLICABLE|MIN|MAX|MFG|DATE)\b/i;

/**
 * PSM 11 (sparse) splits one printed value over several "lines" ("ASUG" / "15LZAS",
 * "WWB 0 1 5" / "057"). Join short alphanumeric chunks after the label until the next
 * known label. Leading junk words (e.g. "CONDITIONER" from a neighbouring line) are skipped.
 */
function sparseIdent(rawLines, i, restBefore) {
  let value = restBefore.replace(/^[\s:#.,\-]+/, "").replace(/[\s|]+/g, "").toUpperCase(), raw = restBefore.trim(), used = 0;
  if (value && !/^[A-Z0-9-]{1,14}$/.test(value)) return null;
  for (let k = i + 1; k < rawLines.length && k <= i + 4; k++) {
    const l = rawLines[k].replace(/[|]/g, " ").trim();
    if (STOP_LINE.test(l)) break;
    const toks = l.split(/\s+/).filter(Boolean);
    if (!toks.length) continue;
    const chunk = toks.join("").toUpperCase();
    if (!value && /^[A-Z]{5,}$/.test(chunk)) continue; // junk word before the value
    if (toks.length > 4 || !/^[A-Z0-9-]{1,14}$/.test(chunk) || value.length + chunk.length > 14) break;
    if (value && /\d/.test(value) && /^[A-Z]{4,}$/.test(chunk)) break;
    // Stray OCR bits ("fe", "lc"): lowercase or 1-3 letters never extend an identifier.
    if (/^[a-z]+$/.test(toks.join("")) || (value && /^[A-Z]{1,3}$/.test(chunk))) break;
    value += chunk; raw += " / " + l; used++;
  }
  if (!used || value.length < 6 || (value.match(/\d/g) || []).length < 2) return null;
  return { value, raw, joined: true, sparse: true };
}

// Fujitsu prints "SERIAL No. WWB 015057": the small "WWB"/"WWP" is part of the label, not the
// serial. OCR variants seen: WwB, WWR, WHB, WW8, WMB.
const SERIAL_LABEL_SUFFIX = /^[\s:#.,]*W[WHMVNA]{0,2}[BPR8](?=[\s.\d]|$)\.?/i;

/**
 * Serial written as spaced digit groups after the label ("0 15057", "01 S057", "015057.").
 * Joins the groups, drops trailing punctuation and maps S/O/I/l read inside the digits.
 */
function digitGroups(rest) {
  const t = rest.replace(/[.,;:|]+\s*$/, "").trim();
  if (!/^[\dSOIl]+(?:\s+[\dSOIl]+)*$/.test(t)) return null;
  const joined = t.replace(/\s+/g, "");
  const fixed = joined.replace(/S/g, "5").replace(/O/g, "0").replace(/[Il]/g, "1");
  if ((joined.match(/\d/g) || []).length < 4 || fixed.length < 5 || fixed.length > 12) return null;
  return { value: fixed, raw: t, joined: /\s/.test(t), corrected: fixed !== joined };
}

function parseIdent(rawLines, labelRe, otherLabelRe, which, sparse, partNos) {
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const m = line.match(labelRe);
    if (!m) continue;
    let rest = line.slice(m.index + m[0].length);
    // Stop at the next label on the same line ("MODEL NO. X  SERIAL NO. Y").
    const nxt = rest.match(otherLabelRe);
    let restBefore = nxt ? rest.slice(0, nxt.index) : rest;
    let labelSuffix = false;
    let nextIdx = i + 1;
    // PSM 11 may put the label suffix on its own line: "SERIAL No." / "WWB 0 15057".
    if (which === "second" && !restBefore.trim() && rawLines[i + 1] && SERIAL_LABEL_SUFFIX.test(rawLines[i + 1])) { restBefore = rawLines[i + 1]; nextIdx = i + 2; }
    if (which === "second" && SERIAL_LABEL_SUFFIX.test(restBefore)) { restBefore = restBefore.replace(SERIAL_LABEL_SUFFIX, " ").replace(/^[\s\/|]+/, ""); labelSuffix = true; }
    let r = takeIdent(restBefore), quality = 1, notes = [];
    if (labelSuffix) {
      // After the label suffix only digits belong to the serial; look on the next line too (PSM 11).
      let g = digitGroups(restBefore);
      const next = rawLines[nextIdx];
      if (next && !STOP_LINE.test(next) && (!g || g.value.length < 6)) {
        // PSM 11 splits the groups over lines: "WWB 0 1 5" / "057", "WwB" / "015057".
        const g2 = digitGroups((restBefore + " " + next).trim());
        if (g2 && (!g || g2.value.length <= 10)) { g = g2; quality = 0.9; }
      }
      r = g;
      if (g && g.corrected) { quality *= 0.6; notes.push("letters read as digits"); }
      if (!r) continue;
    }
    if (sparse && !nxt && !labelSuffix) {
      const s2 = sparseIdent(rawLines, i, restBefore);
      if (s2 && (!r || s2.value.length > r.value.length)) { r = s2; quality = 0.9; notes.push("joined across sparse-OCR lines"); }
    }
    if (!r && !restBefore.trim()) {
      // Header row "MODEL NO.   SERIAL NO." with values on the next line, or label alone.
      const next = rawLines[i + 1];
      if (next && !/^\W*(?:VOLTS?|SOURCE|PH|HZ|RLA|LRA|FLA|MCA|MOP|REFRIG|CHARGE|COMP|FAN|DESIGN|MIN|MAX)\b/i.test(next)) {
        const toks = next.split(/\s+/).filter((t) => IDENT_TOKEN.test(t.toUpperCase()) && /\d/.test(t));
        const bothLabels = nxt && labelRe.test(line);
        const pick = bothLabels ? (which === "first" ? toks[0] : toks[1]) : toks[0];
        if (pick) { r = { value: pick.toUpperCase(), raw: pick, joined: false }; quality = 0.85; }
      }
    }
    if (!r) continue;
    if ((r.value.match(/\d/g) || []).length < 2) continue;
    if (r.joined && !r.sparse && !labelSuffix) { quality *= 0.9; notes.push("joined split characters"); }
    const confusable = CONFUSABLE.test(r.value) || CONFUSABLE3B.test(r.value);
    if (confusable) { quality *= 0.55; notes.push("check O/0, I/1, S/5, B/8, Z/2"); }
    if (which === "second") {
      // Barcode caption "S<serial>" elsewhere on the plate confirms the reading.
      const canon = (x) => x.toUpperCase().replace(/O/g, "0").replace(/[Il]/g, "1");
      const target = canon(r.value);
      // Never for a part number: the side sticker prints "P/N <number>" under its own barcode.
      const isPart = (partNos && [...partNos].some((p) => canon(p) === target)) || /^\d{8}$/.test(target) && rawLines.some((l) => /\bP\s*\/\s*N\b|\bPART\s*N/i.test(l) && l.includes(r.value));
      if (!isPart && rawLines.some((l, j) => j !== i && !/\bP\s*\/\s*N\b/i.test(l) && l.split(/\s+/).some((t) => { const c = canon(t.replace(/[^A-Za-z0-9]/g, "")); return c === target || c === "S" + target || c === "5" + target; }))) {
        quality = Math.min(1, quality / 0.55 * 0.8); notes.push("matches barcode caption");
      }
    }
    return { value: r.value, raw: r.raw, quality, note: notes.join("; ") || undefined, labelText: m[0].trim(), lineIndex: i, sameLine: quality !== 0.85 || !!restBefore.trim() };
  }
  return null;
}

// ---------- refrigerant / charge ----------

function normRefrigLine(l) {
  return l
    .replace(/REFR[I1l|]G(?:ERANT)?/gi, (m) => m.replace(/[1l|]/g, "I"))
    .replace(/\b(R|HFC|HFO)(\s?-?\s?)([0-9OIl]{2,4})([A-Z]{0,2})\b/gi, (m, p, sep, d, suf) => p + sep + d.replace(/O/g, "0").replace(/[Il]/g, "1") + suf);
}

function parseRefrigerant(lines) {
  lines = lines.map(normRefrigLine);
  const codes = REFRIGERANTS.map((c) => c.replace(/([A-Z])$/, "$1?")).join("|");
  const withR = new RegExp("\\b(?:R|HFC|HFO)\\s?[-\\u2010-\\u2014]?\\s?(" + codes + ")(?![0-9])\\b", "i");
  const lab = new RegExp("REFRIG(?:ERANT)?\\.?\\s*(?:TYPE)?\\s*[:.\\-]?\\s*(?:HFC|HFO)?\\s?-?\\s?R?\\s?-?\\s?(" + codes + ")(?![0-9])\\b", "i");
  let r = null, quality = 1;
  for (const l of lines) { const m = l.match(lab); if (m) { r = m; break; } }
  if (!r) for (const l of lines) { const m = l.match(withR); if (m) { r = m; quality = 0.85; break; } }
  if (!r) {
    // "FACTORY CHARGED SYS #1 R4l0A": the code after a system number, snapped when one OCR slip from a unique known code.
    for (const l of lines) {
      const m = l.match(/\bSYS(?:TEM)?\.?\s*#?\s*\d\s*[:.\-]?\s*([A-Z0-9|][A-Z0-9|\-]{3,7})/i);
      if (!m) continue;
      const t = m[1].toUpperCase().replace(/-/g, "").replace(/[|L]/g, "1").replace(/O/g, "0");
      const body = t.replace(/^R/, "");
      const near = REFRIGERANTS.filter((c) => body.length === c.length && [...c].filter((ch, i) => ch !== body[i]).length <= 1);
      if (near.length === 1 && /^R/.test(t)) return { value: "R-" + near[0], raw: m[0], quality: near[0] === body ? 0.85 : 0.55, note: near[0] === body ? "after SYS #" : "snapped from OCR " + m[1] + " after SYS #" };
    }
    return null;
  }
  let code = r[1].toUpperCase(), note;
  if (!REFRIGERANTS.includes(code)) {
    const cand = REFRIGERANTS.filter((c) => c.startsWith(code) && c.length === code.length + 1);
    if (cand.length === 1) { code = cand[0]; quality *= 0.6; note = "suffix letter inferred from OCR text"; }
    else if (cand.length > 1) { quality *= 0.3; note = "ambiguous blend suffix"; }
  }
  return { value: "R-" + code, raw: r[0], quality, note };
}

const NUM = "(\\d{1,5}(?:[.,]\\d{1,3})?)";

function parseCharge(lines) {
  const label = /\b(?:FACTORY\s*)?(?:CHARGE[D]?|CHG|CHRG)\b|(?:FAC)?TORY\W{0,3}[CGE]HARGE|\bREFRIG(?:ERANT)?\b|\b(?:R|HFC)\s?-?\s?\d{2,4}[A-Z]?\b/i;
  const bad = /\bTOTAL\s*CHARGE\b|\b(?:WEIGHT|WT\.?|NET|GROSS|SHIPPING|SHIP\.?|PSI|PSIG|KPA|MPA|FT\.?|IN\.?\s*LBS?|FT\.?\s*LBS?)\b/i;
  const reLbOz = new RegExp(NUM + "\\s*-?\\s*[\"'“”‘’]?\\s*(?:LBS?\\.?|L[E8]S\\.?|LB5\\.?|[I1|][B8]S\\.?|LE(?=\\W{0,3}\\d{1,2}\\s*OZ)|POUNDS?|#)\\s*[,\\-]?\\s*(?:" + NUM + "\\s*(?:OZ\\.?|OUNCES?))?", "i");
  const reOz = new RegExp(NUM + "\\s*(?:OZ\\.?|OUNCES?)\\b", "i");
  const reKg = new RegExp(NUM + "\\s*KGS?\\b", "i");
  // Grams only with a G/KG unit that isn't the start of PSIG/GPM ("23g/Psic" is 236 PSIG).
  const reG = new RegExp("(?<![.\\d])(\\d{2,5})\\s*G\\b(?![\\s\\/]*[A-Z\\/])", "i");
  // Metric-only values need a real charge label or a full refrigerant code on the line ("r 23" isn't one).
  const strong = new RegExp("\\b(?:CHARGE[D]?|CHG|CHRG|REFRIG(?:ERANT)?)\\b|\\b(?:R|HFC|HFO)\\s?-?\\s?(?:" + REFRIGERANTS.join("|") + ")\\b", "i");
  // Motor rows (HP column) are never a charge.
  const motor = /\bHP\b|\bH\.P\.|\bBLWR\b|\bBLOWER\b|\bFAN\b|\bMOTOR\b/i;
  const cands = [];
  // A FACTORY CHARGED line (OCR variants: EHARGED, GHARGED, "TORY/CHARGED") is the only source when present.
  const factory = /(?:FAC)?TORY\W{0,3}[CGE]HARGE|\bFACTORY\s*CHARGE/i;
  const fIdx = lines.map((l, i) => (factory.test(l) ? i : -1)).filter((i) => i >= 0);
  if (fIdx.length) {
    for (const i of fIdx) {
      // Sparse OCR splits the row: join the next lines until a pressure/voltage/other label.
      let l = lines[i];
      for (let j = i + 1; j < Math.min(lines.length, i + 7); j++) {
        if (/PRESS|PS[I1L]|\bSIDE\b|DESIGN|VOLT|\bMIN\b|\bMAX\b|FURNACE|GAS|ORIFICE|FLA|RLA|LRA|\bHP\b|H\.P\.|COMP|BLWR|BLOWER|\bFAN\b|MOTOR/i.test(lines[j])) break;
        l += " " + lines[j];
      }
      cands.push({ l: l.replace(/^.*?(?:TORY\W{0,3}[CGE]HARGE\w*|FACTORY\s*CHARGE\w*)/i, ""), q: 1, factory: true });
    }
  } else lines.forEach((l, i) => {
    if (bad.test(l)) return;
    if (motor.test(l) && !/\bCHARGE|\bCHG\b/i.test(l)) return;
    if (label.test(l)) cands.push({ l, q: 1 });
    else if (i > 0 && /\b(?:CHARGED?|CHG)\b\s*[:.]?\s*$/i.test(lines[i - 1])) cands.push({ l, q: 0.85 });
  });
  for (const { l, q, factory: fac } of cands) {
    const st = fac || strong.test(l);
    let lb = null, oz = null, kg = null, raw = null, unitNote, fuzzy = false;
    const m = l.match(reLbOz);
    if (m) { lb = toNum(m[1]); oz = m[2] ? toNum(m[2]) : 0; raw = m[0]; fuzzy = !/^[\d.,]+\s*-?\s*["'“”‘’]?\s*(?:LBS?|POUNDS?|#)/i.test(m[0]); }
    else { const mo = l.match(reOz); if (mo) { lb = 0; oz = toNum(mo[1]); raw = mo[0]; } }
    const mk = l.match(reKg);
    if (mk && (m || st)) kg = toNum(mk[1]);
    else if (!st) { /* no metric value without a charge label */ }
    else { const mg = l.match(reG); if (mg) { kg = toNum(mg[1]) / 1000; unitNote = "converted from g"; if (!raw) raw = mg[0]; } }
    if (lb == null && kg == null) continue;
    if (lb == null && mk && kg != null) raw = mk[0];
    let totalLb = round(lb != null ? lb + oz / 16 : kg * 2.20462, 2);
    if (!(totalLb > 0 && totalLb < 400)) continue;
    let quality = q * (lb != null ? 1 : 0.9) * (fuzzy ? 0.85 : 1); // OCR-variant pound unit (LES, L8S, 4 LE 4 oz)
    let note = lb == null ? (unitNote || "converted from kg") : undefined;
    if (lb === 0 && oz < 16) {
      // Lone "4 oz": the pounds were not read ("[4 188.) 4 oz" is 4 LBS. 4 OZ. with LBS misread). Flag it.
      quality = Math.min(quality * 0.7, 0.45);
      note = /\d[^\d]{0,6}$/.test(l.slice(0, l.toUpperCase().indexOf(raw.toUpperCase()))) ? "pounds unreadable (a number before the ounces may be the pounds) — check the plate" : "only ounces read — check the pounds";
    }
    if (lb != null && kg != null && Math.abs(kg * 2.20462 - totalLb) > 0.15 * totalLb) { note = "lb and kg on plate disagree"; quality *= 0.5; }
    const exactLb = lb != null ? lb + oz / 16 : kg * 2.20462;
    const wholeLb = Math.floor(exactLb + 1e-9);
    const remOz = round((exactLb - wholeLb) * 16, 1);
    return { value: { lb: totalLb, oz: round(totalLb * 16, 1), display: `${wholeLb} lb ${remOz} oz (${totalLb} lb)` }, raw, quality, note };
  }
  return null;
}

// ---------- electrical ----------

const STD_VOLTS = [100, 110, 115, 120, 127, 200, 208, 220, 230, 240, 265, 277, 380, 400, 415, 440, 460, 480, 575, 600];
const VOLT_LABEL = /\b(?:VOLTS?|VOLTAGE|SOURCE|POWER\s*SUPPLY|SUPPLY|RATED\s*VOLTAGE|V[-\/]PH[-\/]HZ|VOLTS?\s*\/\s*PH(?:ASE)?\s*\/\s*HZ|ELEC(?:TRICAL)?\.?\s*(?:DATA|RATING)?|V\.?A\.?C\.?)\b/i;

function normVolt(s) { return s.replace(/\s+/g, "").replace(/[-–]/g, "/").replace(/V$/i, ""); }
function voltOk(v) { return v.split("/").map(Number).every((p) => STD_VOLTS.includes(p)); }

function parseElectrical(lines) {
  const out = {};
  const V = "(\\d{3}(?:\\s*[\\/\\-–]\\s*\\d{3})?)";
  // Combined "208/230-1-60", "460/3/60", "208-230/1/60", "230V-1PH-60HZ".
  for (const l of lines) {
    const m = l.match(new RegExp("\\b" + V + "\\s*V?\\s*[-\\/]\\s*([13])\\s*(?:PH|Ø)?\\s*[-\\/]\\s*(50|60)\\s*(?:HZ)?\\b", "i"));
    if (m && voltOk(normVolt(m[1]))) {
      out.voltage = { value: normVolt(m[1]), raw: m[1], quality: 0.95 };
      out.phase = { value: Number(m[2]), raw: m[2], quality: 0.95 };
      out.hz = { value: Number(m[3]), raw: m[3], quality: 0.95 };
      break;
    }
  }
  if (!out.voltage) for (const l of lines) {
    const m = l.match(new RegExp("\\b" + V + "\\s*V(?:AC)?\\s*,?\\s*([13])\\s*(?:PH|Ø|PHASE)\\b\\.?\\s*,?\\s*(50|60)\\s*HZ\\b", "i"));
    if (m && voltOk(normVolt(m[1]))) {
      out.voltage = { value: normVolt(m[1]), raw: m[1], quality: 0.95 };
      out.phase = { value: Number(m[2]), raw: m[2], quality: 0.95 };
      out.hz = { value: Number(m[3]), raw: m[3], quality: 0.95 };
      break;
    }
  }
  if (!out.voltage) {
    let v = null, q = 1;
    for (let i = 0; i < lines.length && !v; i++) {
      const lm = lines[i].match(VOLT_LABEL);
      if (!lm) continue;
      // "MIN/MAX VOLTAGE: 187V/252V" is the utilization range, not the rating.
      if (/\bMIN\.?\s*\/?\s*MAX\.?\s*VOLT|\bMIN(?:IMUM)?\.?\s*VOLT|\bMAX(?:IMUM)?\.?\s*VOLT/i.test(lines[i])) continue;
      const rest = lines[i].slice(lm.index + lm[0].length);
      let m = rest.match(new RegExp("^\\s*(?:\\(V\\))?\\s*(?:AC)?\\s*[:.\\-]?\\s*" + V + "\\s*(?:V|VAC|VOLTS?)?\\b", "i"));
      if (!m && !rest.trim() && lines[i + 1]) { m = lines[i + 1].match(new RegExp("^\\s*" + V + "\\s*(?:V|VAC|VOLTS?)?\\b", "i")); q = 0.85; }
      if (m) v = m;
    }
    if (!v) for (const l of lines) {
      const m = l.match(new RegExp("\\b" + V + "\\s*(?:V\\b|VAC\\b|VOLTS?\\b)", "i"));
      if (m && voltOk(normVolt(m[1]))) { v = m; q = 0.9; break; }
    }
    if (v) {
      out.voltage = { value: normVolt(v[1]), raw: v[1], quality: q };
      const after = v.input.slice(v.index + v[0].length, v.index + v[0].length + 8);
      if (!/[\/-]/.test(v[1]) && /\d{3}/.test(after)) { out.voltage.quality *= 0.5; out.voltage.note = "possibly partial (another voltage follows)"; }
    }
  }
  if (out.voltage && !voltOk(out.voltage.value)) { out.voltage.quality *= 0.5; out.voltage.note = "non-standard voltage"; }
  if (!out.phase) {
    for (const l of lines) {
      const m = l.match(/\b([13])\s*[-~]?\s*(?:PH(?:ASE)?|Ø|Φ)(?![A-Z])/i) || l.match(/\b(?:PH(?:ASE)?|Ø|Φ)\s*[:.\-]?\s*([13])\b/i);
      if (m) { out.phase = { value: Number(m[1]), raw: m[1], quality: 1 }; break; }
    }
  }
  if (!out.hz) {
    for (const l of lines) {
      const m = l.match(/\b(50|60)\s*HZ\b/i) || l.match(/\bHZ\s*[:.\-]?\s*(50|60)\b/i);
      if (m) { out.hz = { value: Number(m[1]), raw: m[1], quality: 1 }; break; }
    }
  }
  return out;
}

// ---------- model validation ----------

// Known model-number shapes per brand. A model that doesn't fit is flagged, never "fixed".
export const MODEL_PATTERNS = {
  Fujitsu: /^A[SRUBO][UYHE]G\d{2}L[A-Z]{3}\d?$/,
  // Packaged RTUs: "ZS-04N13BTAZZ10001A" (family-tonnage, then option code).
  "Unitary Products Group (York/Coleman)": /^[A-Z]{4}\d{4}[A-Z]{3}$|^[A-Z]{2}-?\d{2}[A-Z]\d{2}[A-Z0-9]{6,12}$/,
  York: /^[A-Z]{2}-?\d{2}[A-Z]\d{2}[A-Z0-9]{6,12}$|^[A-Z]{4}\d{4}[A-Z]{3}$/,
  "Emerson / Copeland": /^(?:Z[A-Z]{1,2}\d{2,3}K[A-Z0-9-]+|[A-Z]{3,4}\d{2,3}[A-Z]\d[A-Z](?:-[A-Z0-9]{3}(?:-[A-Z0-9]{3})?)?)$/,
  Copeland: /^(?:Z[A-Z]{1,2}\d{2,3}K[A-Z0-9-]+|[A-Z]{3,4}\d{2,3}[A-Z]\d[A-Z](?:-[A-Z0-9]{3}(?:-[A-Z0-9]{3})?)?)$/,
  Carrier: /^\d{2}[A-Z]{2,4}[A-Z0-9]{4,12}$/,
  Goodman: /^[A-Z]{3,5}\d{2,4}[A-Z0-9]{2,10}$/,
  Heatcraft: HEATCRAFT_MODEL, // LCH0055LBACZA0300: family, capacity, options, 4-digit tail
};
const CONF_MAP = { O: "0", Q: "0", D: "0", I: "1", L: "1", S: "5", B: "8", "3": "8", Z: "2", G: "6" };
const confNorm = (x) => x.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/[OQDILSB3ZG]/g, (c) => CONF_MAP[c]);

function checkModel(f, brand, lines) {
  const v = String(f.value).toUpperCase();
  const notes = f.note ? [f.note] : [];
  const pat = brand && MODEL_PATTERNS[brand];
  if (pat && !pat.test(v)) { f.confidence = round(Math.min(f.confidence, 0.45), 2); notes.push("doesn't fit the usual " + brand + " model format"); }
  // Barcode captions often repeat the model with a one-letter prefix (Unitary prints "ZBRCS0301BDG").
  const target = confNorm(v);
  for (const l of lines) for (const t0 of l.split(/\s+/)) {
    const t = t0.toUpperCase().replace(/[^A-Z0-9-]/g, "");
    if (t === v || t.length < v.length) continue;
    const cand = [t, t.slice(1)].find((c) => c.length === v.length && confNorm(c) === target);
    if (cand && cand !== v) { f.confidence = round(Math.min(f.confidence, 0.4), 2); notes.push("barcode caption reads " + t + " (check: " + cand + ")"); return void (f.note = notes.join("; ")); }
  }
  f.note = notes.join("; ") || undefined;
}

// Serial shapes per brand: length/shape only (no date decoding). A mismatch is flagged, never fixed.
export const SERIAL_PATTERNS = {
  Carrier: /^\d{4}[A-Z]\d{5}$/, Bryant: /^\d{4}[A-Z]\d{5}$/, Payne: /^\d{4}[A-Z]\d{5}$/,
  Trane: /^(?=[A-Z0-9]*\d{5})[A-Z0-9]{8,10}$/, "American Standard": /^(?=[A-Z0-9]*\d{5})[A-Z0-9]{8,10}$/,
  York: /^[A-Z]\d[A-Z]\d{7}$|^[A-Z]{4}\d{6}$/, "Unitary Products Group (York/Coleman)": /^[A-Z]\d[A-Z]\d{7}$|^[A-Z]{4}\d{6}$/,
  "Emerson / Copeland": /^\d{2}[A-Z]\d{5,6}[A-Z]?$/, Copeland: /^\d{2}[A-Z]\d{5,6}[A-Z]?$/,
  Goodman: /^\d{10}$/, Amana: /^\d{10}$/,
  Lennox: /^\d{4}[A-Z]\d{5}$/,
  Rheem: /^[A-Z]{1,2}\d{8,10}[A-Z]?$/, Ruud: /^[A-Z]{1,2}\d{8,10}[A-Z]?$/,
  Fujitsu: /^\d{6}$/, // the "WWB"/"WWP" before it is label text, not part of the serial
  Daikin: /^(?=[A-Z0-9]*\d{6})[A-Z0-9]{7,11}$/,
  Heatcraft: HEATCRAFT_SERIAL, // letter + 2 digits + letter + digits (T21C05997)
};

/**
 * Why a model/serial needs a closer look (empty = none). Used by the confirm UI to highlight
 * the field; the user must still tick "Looks right" for model and serial regardless.
 */
export function reviewReasons(name, f, brand) {
  if (!f || !ID_FIELDS.includes(name)) return [];
  const v = String(f.value).toUpperCase(), out = [];
  if (CONFUSABLE.test(v) || CONFUSABLE3B.test(v)) out.push("has look-alike characters (O/0, I/1, S/5, B/8/3, Z/2)");
  const pat = brand && (name === "model" ? MODEL_PATTERNS : SERIAL_PATTERNS)[brand];
  if (pat && !pat.test(v)) out.push("doesn't fit the usual " + brand + " " + name + " format");
  if (f.confidence < LOW_CONFIDENCE_ID) out.push("confidence " + Math.round(f.confidence * 100) + "% (< 75%)");
  if (f.candidates && f.candidates.length > 1) out.push("OCR passes disagree: pick one");
  if (f.spatial === false) out.push("value isn't right of or below its label on the photo");
  return out;
}

function checkSerial(f, brand) {
  const pat = brand && SERIAL_PATTERNS[brand];
  if (pat) f.formatOk = pat.test(String(f.value).toUpperCase());
  if (pat && !pat.test(String(f.value).toUpperCase())) {
    f.confidence = round(Math.min(f.confidence, 0.5), 2);
    f.note = (f.note ? f.note + "; " : "") + "doesn't fit the usual " + brand + " serial format";
  }
}

/**
 * Spatial check with Tesseract word boxes: the value should sit right of its label on the same
 * text row, or directly below it (overlapping columns). Returns true/false, or null if unknown.
 */
export function spatialCheck(words, labelText, value) {
  if (!words || !words.some((w) => w.bbox)) return null;
  const nw = (t) => String(t).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const lab0 = nw(String(labelText).split(/\s+/)[0]);
  const labels = words.filter((w) => w.bbox && lab0.length >= 3 && nw(w.text).startsWith(lab0.slice(0, 4)));
  const vals = words.filter((w) => w.bbox && nw(w.text).length >= 3 && (nw(value).startsWith(nw(w.text)) || nw(w.text).includes(nw(value).slice(0, 5))));
  if (!labels.length || !vals.length) return null;
  for (const L of labels) for (const V of vals) {
    const lh = L.bbox.y1 - L.bbox.y0, lcy = (L.bbox.y0 + L.bbox.y1) / 2, vcy = (V.bbox.y0 + V.bbox.y1) / 2;
    const right = V.bbox.x0 >= L.bbox.x0 && Math.abs(vcy - lcy) < lh * 0.8;
    const below = V.bbox.y0 >= L.bbox.y1 - lh * 0.3 && V.bbox.y0 - L.bbox.y1 < lh * 2.5 && V.bbox.x0 < L.bbox.x1 + lh * 3 && V.bbox.x1 > L.bbox.x0 - lh;
    if (right || below) return true;
  }
  return false;
}

// ---------- brand / unit type / matching unit ----------

function parseBrand(lines) {
  const text = lines.join("\n").toUpperCase();
  for (const [name, re] of BRANDS) {
    const m = text.match(re);
    if (m) return { value: name, raw: m[0], quality: 1 };
  }
  return null;
}

function parseUnitType(text) {
  const t = text.toUpperCase();
  let indoor = 0, outdoor = 0;
  const ev = [];
  const add = (re, side, w) => { const m = t.match(re); if (m) { side === "in" ? (indoor += w) : (outdoor += w); ev.push(m[0]); } };
  add(/APPLICABLE\s+OUTDOOR\s+UNITS?/, "in", 3);
  add(/MATCHING\s+OUTDOOR\s+UNITS?|OUTDOOR\s+UNIT\s+MODEL/, "in", 2);
  add(/^(?![^\n]*ABLE)[^\n]*INDOOR\s+(?:UNIT|FAN|BLOWER)/m, "in", 2);
  add(/\bOUTDOOR\s+USE\b|UTILISATION\s+A\s+L.?EXT/, "out", 3);
  add(/\b(?:AIR\s+HANDLER|FAN\s+COIL|EVAPORATOR\s+COIL|UNIT\s+COOLER|WALL[-\s]MOUNTED|CASSETTE|DUCTED\s+INDOOR)\b/, "in", 2);
  add(/(?:APPLICABLE|ABLE)\s+INDOOR\s+UNITS?|MATCHING\s+INDOOR/, "out", 3);
  add(/\bOUTDOOR\s+(?:UNIT|SECTION|AIR\s+CONDITIONER|HEAT\s+PUMP)\b(?![^\n]*APPLICABLE)/, "out", 2);
  add(/\b(?:CONDENSING\s+UNIT|COMPRESSOR|R\.?\s?L\.?\s?A\b|L\.?\s?R\.?\s?A\b|OUTDOOR\s+FAN)\b/, "out", 1);
  if (/APPLICABLE\s+OUTDOOR/.test(t)) outdoor = Math.max(0, outdoor - 2); // "OUTDOOR UNIT" inside that phrase
  if (!indoor && !outdoor) return null;
  if (indoor === outdoor) return null;
  const value = indoor > outdoor ? "indoor" : "outdoor";
  return { value, raw: ev[0], quality: Math.abs(indoor - outdoor) >= 2 ? 1 : 0.7 };
}

function parseMatchedUnits(rawLines, labelRe) {
  const MODEL_TOK = /\b[A-Z]{2,}[A-Z0-9-]*\d[A-Z0-9\-]{2,}\b/g;
  for (let i = 0; i < rawLines.length; i++) {
    const m = rawLines[i].match(labelRe);
    if (!m) continue;
    const found = [];
    // Separators seen in OCR: "/", "|", "I" glued between units, a space; a trailing "{" is a "1".
    const norm = (l) => l.toUpperCase().replace(/([A-Z0-9])\{(?=\s|$|[|\/])/g, "$11").replace(/(\d)I(?=[A-Z]{3,}\d)/g, "$1 / ").replace(/\|/g, " / ");
    const scan = [rawLines[i].slice(m.index + m[0].length), rawLines[i + 1] || "", rawLines[i + 2] || ""].map(norm);
    for (let k = 0; k < scan.length; k++) {
      if (k > 0 && found.length && !/^[\s\/,]*[A-Z]{2,}[A-Z0-9]*\d/.test(scan[k].toUpperCase())) break;
      if (k > 0 && /MADE\s+IN|LIMITED|\bLTD\b|IPX/i.test(scan[k])) break;
      const toks = scan[k].toUpperCase().match(MODEL_TOK) || [];
      toks.forEach((t) => { if (!found.includes(t)) found.push(t); });
    }
    if (found.length) return { value: found.join(" / "), raw: found.join(" "), quality: 1, list: found };
  }
  return null;
}

// ---------- pressures / oil / compressor plates / cool-heat rows ----------

const MPA_PSI = 145.038;
function parsePressures(lines) {
  const out = {};
  const ctx = /\b(?:DESIGN|MAX(?:IMUM)?|WORKING|TEST)\b[^\n]*PRESS|PRESS(?:URE)?\b/i;
  const near = (i) => lines.slice(Math.max(0, i - 3), i + 1).some((l) => ctx.test(l));
  lines.forEach((l, i) => for_each_pressure(l, i));
  function for_each_pressure(l, i) {
    for (const m of l.matchAll(/\b(HIGH|LOW|HI|LO)\s*(?:SIDE)?\b[\s"'.:~\-=]*(\d{1,4}(?:[.,]\d{1,2})?)\s*\.?\s*(PS[I1l]G?|MPA|KPA|BAR)\b/gi)) {
    if (!near(i)) continue;
    const side = /^H/i.test(m[1]) ? "designHigh" : "designLow";
    if (out[side]) continue;
    const n = toNum(m[2]), unit = m[3].toUpperCase().replace(/[1l]/g, "I");
    let psig, display;
    if (unit.startsWith("PS")) { if (n < 50 || n > 1000) continue; psig = n; display = n + " psig"; }
    else if (unit === "MPA") { if (n < 0.3 || n > 7) continue; psig = Math.round(n * MPA_PSI); display = n + " MPa (≈" + psig + " psig)"; }
    else if (unit === "KPA") { if (n < 300 || n > 7000) continue; psig = Math.round(n * 0.145038); display = n + " kPa (≈" + psig + " psig)"; }
    else { if (n < 3 || n > 70) continue; psig = Math.round(n * 14.5038); display = n + " bar (≈" + psig + " psig)"; }
    out[side] = { value: display, raw: m[0], quality: 0.95 };
    }
  }
  return out;
}

function parseOil(lines) {
  for (const l of lines) {
    const m = l.match(/\b(?:OIL\b[\s.:\-]*)?(\d{1,3}(?:\.\d)?)\s*(POE|PVE|PAG|AB|MO)\b/i);
    if (m && (/\bOIL\b/i.test(l) || /POE|PVE|PAG/i.test(m[2]))) return { value: m[1] + " " + m[2].toUpperCase(), raw: m[0], quality: 0.9, note: "as printed (unit not stated)" };
  }
  return null;
}

/** Table layout: a header row of labels ("VOLTS PH Hz LRA") with values in the row below. */
function parseHeaderTable(lines) {
  const out = {};
  const COLS = [["voltage", /^VOLTS?$/], ["phase", /^PH(?:ASE)?$/], ["hz", /^HZ$/], ["lra", /^L\.?R\.?A\.?$/], ["rla", /^R\.?L\.?A\.?$/]];
  for (let i = 0; i + 1 < lines.length; i++) {
    const heads = lines[i].toUpperCase().split(/[\s|\[\]]+/).map((t) => t.replace(/[^A-Z.]/g, "")).filter(Boolean);
    const cols = heads.map((h) => (COLS.find(([, re]) => re.test(h)) || [null])[0]).filter(Boolean);
    if (cols.length < 3) continue;
    for (let k = 1; k <= 2 && i + k < lines.length; k++) {
      const vals = lines[i + k].match(/\d{3}\s*[-\/]\s*\d{3}|\d+(?:[.,]\d+)?/g);
      if (!vals || vals.length !== cols.length) continue;
      const ok = cols.every((c, j) => {
        const v = vals[j];
        if (c === "voltage") return voltOk(normVolt(v));
        if (c === "phase") return v === "1" || v === "3";
        if (c === "hz") return v === "50" || v === "60";
        return toNum(v) > 0 && toNum(v) < 1000;
      });
      if (!ok) continue;
      cols.forEach((c, j) => { out[c] = { value: c === "voltage" ? normVolt(vals[j]) : toNum(vals[j]), raw: vals[j], quality: 0.85, note: "read from table columns" }; });
      return out;
    }
  }
  return out;
}

/** "COMPRESSOR A 9.2 12.7" / "TOTAL A 9.9 14.4" / "CAPACITY BTU/h 14500 18000" (cool / heat columns). */
function parseCoolHeat(lines, labelRe, lo, hi) {
  for (let i = 0; i < lines.length; i++) {
    if (!labelRe.test(lines[i])) continue;
    for (const l of [lines[i], lines[i + 1] || ""]) {
      const nums = (l.replace(labelRe, " ").match(/(?<![\d.])\d+(?:\.\d+)?(?![\d.])/g) || []).map(Number).filter((n) => n >= lo && n <= hi);
      if (nums.length === 2) return { value: nums[0] + " / " + nums[1], raw: l, quality: 0.8, note: "cool / heat" };
    }
  }
  return null;
}

// ---------- main ----------

/**
 * @param {string|{text:string, words?:Array<{text:string,confidence:number}>}} input
 */
export function parsePlate(input) {
  const text = typeof input === "string" ? input : (input && input.text) || "";
  const words = typeof input === "string" ? null : (input && input.words) || null;
  const sparse = typeof input === "object" && input && input.psm === 11;
  // rawLines: whitespace-normalised, certification text removed (identifiers keep their letters).
  const rawLines = text.replace(/[\u2010-\u2014]/g, "-").split(/\r?\n/)
    .map((l) => stripCerts(l.replace(/\s+/g, " ").trim())).filter(Boolean);
  // numLines: same lines with numeric-context OCR repair.
  const lines = rawLines.map(fixDigits);
  const fields = {};
  const hints = [];
  const put = (name, r) => { if (r) fields[name] = field(r.value, r.quality, r.raw, words, r.note); };

  put("brand", parseBrand(rawLines));
  const ut = parseUnitType(rawLines.join("\n"));
  if (ut) fields.unitType = { value: ut.value, confidence: ut.quality, quality: ut.quality, ocr: null, raw: ut.raw };
  const brand0 = fields.brand && fields.brand.value;
  // Heatcraft: assign by value shape (P/N, model, serial), never by header order or line joining.
  const byShape = brand0 === "Heatcraft" ? assignIdsByPattern(rawLines) : null;
  const header = byShape ? null : parseHeaderRow(rawLines);
  const partNos = partNumbers(rawLines, header);
  if (byShape && byShape.part) partNos.add(byShape.part);
  // A Heatcraft model off the LCH/BCH pattern (e.g. PTN030H2B) still comes from its label, never sparse-joined.
  if (byShape && !byShape.model) { const m = parseIdent(rawLines, MODEL_LABEL, SERIAL_LABEL, "first", false, partNos); if (m && !/^\d{8}$/.test(String(m.value).replace(/[^0-9A-Za-z]/g, ""))) byShape.model = m.value, byShape.modelRaw = m.raw || m.value, byShape.modelOk = false, byShape.modelFromLabel = m; }
  const identRaw = header || byShape ? {} : { model: parseIdent(rawLines, MODEL_LABEL, SERIAL_LABEL, "first", sparse, partNos), serial: parseIdent(rawLines, SERIAL_LABEL, MODEL_LABEL, "second", sparse, partNos) };
  if (header) {
    // PART NO | MODEL NO | SERIAL NO header row: values by column, in the order printed.
    put("partNo", { value: header.part, raw: header.part, quality: 0.9, note: "PART NO column" });
    put("model", { value: header.model, raw: header.model, quality: 0.95, note: "MODEL NO column" });
    put("serial", { value: header.serial, raw: header.serial, quality: 0.95, note: "SERIAL NO column" });
  } else if (byShape) {
    if (byShape.part) put("partNo", { value: byShape.part, raw: byShape.part, quality: 0.9, note: "8-digit part number" });
    if (byShape.modelFromLabel) put("model", byShape.modelFromLabel);
    else if (byShape.model) {
      put("model", { value: byShape.model, raw: byShape.modelRaw, quality: byShape.modelOk ? 0.95 : 0.45, note: byShape.modelOk ? "Heatcraft model pattern" : undefined });
      if (byShape.modelChanged) { fields.model.value = byShape.modelRaw; } // fixed (and flagged) below
    }
    if (byShape.serial) put("serial", { value: byShape.serial, raw: byShape.serial, quality: 0.95, note: "Heatcraft serial pattern" });
  } else {
    put("model", identRaw.model);
    put("serial", identRaw.serial);
    if (!fields.model) {
      // No model label read at all: a token in the York/UPG dashed shape is shown, flagged.
      const DASHED = /(?<![A-Z0-9-])([A-Z]{2}-\d{2}[A-Z]\d{2}[A-Z0-9]{6,12})(?![A-Z0-9-])/;
      const hit = rawLines.map((l) => l.match(DASHED)).find(Boolean);
      if (hit) { put("model", { value: hit[1], raw: hit[1], quality: 0.55, note: "no model label read; fits the York/UPG model shape — check it" }); fields.model.byLayout = true; }
    }
    if (!fields.model && fields.serial) {
      // Model label unreadable ("Mossine:"): a dashed ID on a "word:" line next to the serial line, flagged.
      const si = rawLines.findIndex((l) => SERIAL_LABEL.test(l));
      for (let i = Math.max(0, si - 2); si >= 0 && i <= Math.min(rawLines.length - 1, si + 2); i++) {
        if (i === si) continue;
        const m = rawLines[i].match(/^\W{0,3}[A-Za-z]{3,10}\s*[:;]\s*([A-Z0-9]{1,4}-[A-Z0-9]{8,20})(?![A-Z0-9-])/);
        if (!m || !/\d.*\d.*\d/.test(m[1]) || !/[A-Z].*[A-Z].*[A-Z]/.test(m[1])) continue;
        put("model", { value: m[1], raw: m[1], quality: 0.6, note: "model label not read; dashed ID next to the serial — check it" });
        fields.model.byLayout = true;
        break;
      }
    }
  }
  const brandName = fields.brand && fields.brand.value;
  const isHC = brandName === "Heatcraft";
  if (isHC && fields.model) {
    const fx = fixHeatcraftModel(fields.model.value);
    if (fx.changed) {
      fields.model.note = (fields.model.note ? fields.model.note + "; " : "") + "fixed O->0/S->5 in the number slots (OCR read " + fields.model.value + ")";
      fields.model.value = fx.value;
      fields.model.confidence = round(Math.min(fields.model.confidence, 0.7), 2);
    }
  }
  // A part number is never the model or serial, and one value never fills both.
  const idn = (v) => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  for (const k of ID_FIELDS) if (fields[k] && [...partNos].some((p) => idn(p) === idn(fields[k].value))) { delete fields[k]; delete identRaw[k]; }
  for (const k of ID_FIELDS) if (fields[k] && [...partNos].some((p) => p.length >= 6 && idn(fields[k].value).startsWith(idn(p)))) { delete fields[k]; delete identRaw[k]; }
  if (fields.model && fields.serial && idn(fields.model.value) === idn(fields.serial.value)) for (const k of ID_FIELDS) { delete fields[k]; delete identRaw[k]; }
  if (fields.model && fields.model.byLayout) { fields.model.confidence = round(Math.min(fields.model.confidence, 0.6), 2); delete fields.model.byLayout; if (MODEL_PATTERNS[brandName] && !MODEL_PATTERNS[brandName].test(String(fields.model.value))) fields.model.confidence = round(Math.min(fields.model.confidence, 0.45), 2); }
  else if (fields.model && !header && !byShape) checkModel(fields.model, brandName, rawLines);
  else if (fields.model && MODEL_PATTERNS[brandName] && !MODEL_PATTERNS[brandName].test(String(fields.model.value))) { fields.model.confidence = round(Math.min(fields.model.confidence, 0.45), 2); fields.model.note += "; doesn't fit the usual " + brandName + " model format"; }
  if (fields.serial) checkSerial(fields.serial, brandName);
  for (const [k, r] of [["model", identRaw.model], ["serial", identRaw.serial]]) {
    const f = fields[k];
    if (!f || !r) continue;
    const sp = spatialCheck(words, r.labelText, f.value);
    if (sp !== null) f.spatial = sp;
    if (sp === false) { f.confidence = round(Math.min(f.confidence, 0.5), 2); f.note = (f.note ? f.note + "; " : "") + "not beside/below its label on the photo"; }
  }
  const od = parseMatchedUnits(rawLines, /APPLICABLE\s+OUTDOOR\s+UNITS?|MATCHING\s+OUTDOOR\s+UNITS?|OUTDOOR\s+UNIT\s+MODEL\s*(?:NO\.?)?/i);
  put("outdoorUnit", od);
  const idu = parseMatchedUnits(rawLines, /(?:APPLICABLE|ABLE)\s+INDOOR\s+UNITS?|MATCHING\s+INDOOR\s+UNITS?|INDOOR\s+UNIT\s+MODEL\s*(?:NO\.?)?/i);
  put("indoorUnit", idu);
  put("refrigerant", parseRefrigerant(lines));
  put("charge", parseCharge(lines));
  const el = parseElectrical(lines);
  const tbl = parseHeaderTable(lines);
  put("voltage", tbl.voltage || el.voltage); put("phase", tbl.phase || el.phase); put("hz", tbl.hz || el.hz);
  const pr = parsePressures(lines);
  put("designHigh", pr.designHigh); put("designLow", pr.designLow);
  put("oil", parseOil(lines));
  put("compA", parseCoolHeat(lines, /\bCOMPRESSOR\s*(?:A|AMPS?)\b|\bCOMP\.?\s*A\b/i, 0.5, 80));
  put("totalA", parseCoolHeat(lines, /\bTOTAL\s*(?:A|AMPS?|CURRENT)\b/i, 0.5, 120));
  put("capacity", parseCoolHeat(lines, /\bCAPACITY\b|\bBTU\s*\/?\s*H/i, 3000, 200000));
  if (isHC) {
    // Grid plate: each value sits below its label cell. These override the line parsers.
    const gf = gridFields(words);
    for (const k of Object.keys(gf)) put(k, gf[k]);
    if (/WALK\s*[-\u2010-\u2014]?\s*IN\b/i.test(text) || /CONDENSING/i.test(text)) {
      const app = (text.match(/WALK\s*[-\u2010-\u2014]?\s*IN\s+(FREEZER|COOLER)/i) || [])[1];
      const outdoor = /OUT\s*DOOR\s+USE/i.test(text);
      fields.unitType = { value: "condensing unit", confidence: 0.85, quality: 0.85, ocr: null, raw: "Heatcraft condensing unit", note: "walk-in refrigeration" + (outdoor ? "; for outdoor use" : "") };
      if (app || outdoor) fields.application = { value: [app ? "walk-in " + app.toLowerCase() : null, outdoor ? "outdoor" : null].filter(Boolean).join(", "), confidence: 0.85, quality: 0.85, ocr: null, raw: app || "FOR OUTDOOR USE" };
    }
  }
  const rt = parseRefrigerantTable(rawLines, { anywhere: isHC });
  if (rt && (isHC || rt.rows.length >= 2)) {
    // Approved-refrigerant table: list them all, or leave it blank when any row can't be read.
    delete fields.refrigerant;
    // Garbled tokens are snapped only on a unique match; snapped or partial lists are always flagged.
    put("refrigerant", { value: rt.value, raw: rt.rows.map((r) => r.raw).join(" "), quality: 0.9, note: "approved refrigerants (" + rt.rows.length + " rows)" + (rt.corrected ? "; snapped from OCR " + rt.rows.map((r) => r.raw).join(", ") : "") + (rt.unread.length ? "; unreadable row(s): " + rt.unread.join(", ") : "") });
    fields.refrigerant.list = rt.list;
    if (rt.corrected || rt.unread.length) fields.refrigerant.confidence = round(Math.min(fields.refrigerant.confidence, 0.55), 2);
  }
  if (/THERMALLY\s+PROTECTED/i.test(text)) fields.protection = { value: "thermally protected", confidence: 1, quality: 1, ocr: null, raw: "THERMALLY PROTECTED" };

  const COMP = "(?:COMP(?:RESSOR)?\\.?\\s*(?:NO\\.?\\s*|#\\s*)?(?:[1-4]\\s*)?[:.\\-]?\\s*)?";
  const RLA = new RegExp("\\b" + COMP + "(?:R\\.?\\s?L\\.?\\s?A\\.?(?:\\s*-\\s*C\\b|\\s*\\(?C\\)?(?=\\s))?|RATED\\s+LOAD\\s+AMPS?)");
  const LRA = new RegExp("\\b" + COMP + "(?:L\\.?\\s?R\\.?\\s?A\\.?(?:\\s*-\\s*C\\b)?|LOCKED\\s+ROTOR\\s+AMPS?)");
  const FLA = /\bF\.?\s?L\.?\s?A\.?/;
  const FAN_LBL = /\b(?:(?:O\.?D\.?|OUTDOOR|INDOOR|I\.?D\.?|COND(?:ENSER)?\.?|EVAP(?:ORATOR)?\.?|IND\.?)\s*)?(?:FAN|BLOWER)(?:\s*MOTOR)?\s*(?:F\.?\s?L\.?\s?A\.?|LOAD|RATED\s+CURRENT|CURRENT|AMPS?)|\b(?:OFM|IFM)\s*(?:F\.?\s?L\.?\s?A\.?)?/;
  const isFanLine = (l) => /\b(?:FAN|OFM|IFM|BLOWER|MOTOR)\b/i.test(l);
  const compNo = (l) => { const m = l.match(/COMP(?:RESSOR)?\.?\s*(?:NO\.?\s*|#\s*)?([1-4])\b/i); return m ? Number(m[1]) : null; };

  // Compressor amps: first compressor wins; others are noted.
  const multi = (all, name) => {
    if (!all.length) return null;
    const first = all[0];
    const others = all.slice(1).filter((r) => compNo(r.line) && compNo(r.line) !== compNo(first.line));
    const note = others.length ? "multi-compressor: using COMP " + (compNo(first.line) || 1) + "; also " + others.map((r) => "COMP " + compNo(r.line) + " " + r.num).join(", ") : undefined;
    return numField(first, note);
  };
  const notFan = (l) => !/\b(?:FAN|OFM|IFM|BLOWER)\b/i.test(l) || /\bCOMP/i.test(l);
  put("rla", multi(labelledAll(lines, RLA, { lineFilter: notFan, valueBefore: true }), "rla"));
  if (tbl.lra) put("lra", tbl.lra); else put("lra", multi(labelledAll(lines, LRA, { lineFilter: notFan, valueBefore: true }), "lra"));
  if (tbl.rla) put("rla", tbl.rla);

  let fan = labelledAll(lines, FAN_LBL)[0];
  if (!fan) fan = labelledAll(lines, FLA, { lineFilter: isFanLine, valueBefore: true })[0];
  if (!fan) { fan = labelledAll(lines, FLA, { lineFilter: (l) => !/\bCOMP/i.test(l) })[0]; if (fan) fan.quality *= 0.5; }
  if (!fan) {
    // "FAN MOTOR 0.4 A": no FLA label, but an explicit amps unit.
    for (let i = 0; i < lines.length && !fan; i++) {
      const m = lines[i].match(new RegExp("\\b(?:FAN|BLOWER)\\s*MOTOR\\s*[:.\\-]?\\s*" + NUMTOK + "\\s*A(?:MPS?)?\\b", "i"));
      const c = m && cleanNum(m[1]);
      if (c) fan = { num: c.num, raw: c.fixed, quality: 0.9 * (c.corrected ? 0.85 : 1), corrected: c.corrected, decimal: c.decimal, line: lines[i], match: m };
    }
  }
  put("fanFla", numField(fan));
  if (isHC) {
    // Cond-fan row "1/3 3.5" or "1/3..3.5": FLA is the amps token right after the HP fraction.
    for (const l of lines) {
      const m = l.match(/\b1\/\d{1,2}\s*[.,:;\-_ ]*\s*(\d{1,2}[.,]\d{1,2})(?![\d\/])/);
      if (m) { const v = Number(m[1].replace(",", ".")); if (v > 0 && v < 15) { fields.fanFla = { value: v, raw: m[0], confidence: 0.85, note: "after the fan HP in the cond-fan row" }; break; } }
    }
  }
  // "29.9/29.9", "40/40": the same rating printed for both voltages counts once; differing pairs stay unread.
  const ampLines = lines.map((l) => /AMPACITY|\bMCA\b|FUSE|BR?KR|BREAKER|MOCP|\bMOP\b/i.test(l) ? l.replace(/(?<![\d.\/])(\d{1,3}(?:\.\d)?)\s*\/\s*\1(?![\d.\/])/g, "$1") : l);
  put("mca", numField(labelledAll(ampLines, /\b(?:MCA|M\.\s?C\.\s?A\.?|MIN(?:IMUM)?\.?\s*(?:SUPPLY\s*)?(?:CIRCUIT|CIR\.?|CKT\.?)\s*(?:AMP(?:ACITY|S)?|AMPS?)\.?)/, { prevLine: true })[0]));
  const STD_OCP = [3, 6, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 110, 125, 150, 175, 200, 225, 250, 300, 350, 400];
  put("mop", numField(labelledAll(ampLines, /\b(?:MOCP|MOP|M\.\s?O\.\s?C\.?\s?P\.?|M\.\s?O\.\s?P\.?|MAX(?:IMUM)?\.?\s*(?:OVER\s*CURRENT\s*(?:PROT(?:ECTION|\.)?(?:\s*DEVICE)?)?|O\.?C\.?P\.?|FUSE(?:\s*(?:\/|OR)\s*(?:MAX\.?\s*)?(?:HACR\s*)?(?:TYPE\s*)?(?:CKT[.,]?\s*|CIRCUIT\s*)?(?:BKR[.,]?|BREAKER))?(?:\s*SIZE)?|(?:CKT[.,]?\s*|CIRCUIT\s*)?(?:BKR|BRKR|BREAKER)))/, { skipParen: true, prevLine: true, marks: true }).filter((r) => STD_OCP.includes(r.num))[0]));

  // Load table (COMP / ID BLOWER / OD FAN / COMB BLWR rows): each value from its own row only.
  const lt = isHC ? null : parseLoadTable(lines);
  if (lt) {
    // A value the line parsers took from another row ("7.6 FLA" of the ID blower as the fan) is dropped.
    const rowText = (ks) => ks.map((k) => lt.rows[k] && lt.rows[k].text).filter(Boolean).join("\n");
    const fromRow = (f, ks) => f && f.raw && rowText(ks).includes(String(f.raw).trim());
    for (const k of ["rla", "lra", "fanFla"]) {
      if (lt[k]) { delete fields[k]; put(k, lt[k]); continue; }
      const own = k === "fanFla" ? ["odFan"] : ["comp"];
      const others = ["comp", "idBlower", "odFan", "combBlower"].filter((r) => !own.includes(r));
      if (fields[k] && fromRow(fields[k], others) && !fromRow(fields[k], own)) delete fields[k];
      else if (fields[k] && lt.rows[own[0]] == null && k === "fanFla") delete fields[k];
    }
    if (!tbl.phase) {
      // Unit phase: the UNIT VOLTAGE line, else the compressor row; never a 1-phase motor row.
      let uv = null;
      for (let i = 0; i < lines.length && !uv; i++) if (/\bUNIT\s+VOLT/i.test(lines[i])) uv = voltPhHz(lines[i] + " " + (lines[i + 1] || ""));
      const v = uv ? { ...uv, note: "UNIT VOLTAGE line" } : lt.vph;
      if (v) {
        delete fields.voltage; delete fields.phase; delete fields.hz;
        put("voltage", { value: v.voltage, raw: v.raw, quality: uv ? 0.95 : 0.85, note: v.note });
        put("phase", { value: v.phase, raw: v.raw, quality: uv ? 0.95 : 0.85, note: v.note });
        put("hz", { value: v.hz, raw: v.raw, quality: uv ? 0.95 : 0.85, note: v.note });
      } else {
        const el2 = parseElectrical(lines.filter((_, i) => !lt.spans.has(i)));
        for (const k of ["voltage", "phase", "hz"]) { delete fields[k]; put(k, el2[k]); }
      }
    }
  }

  // Cross-checks: implausible combinations lower confidence (values are never changed).
  const chk = (cond, names, note) => {
    if (!cond) return;
    names.forEach((n) => { const f = fields[n]; if (!f) return; f.confidence = round(f.confidence * 0.5, 2); f.note = f.note ? f.note + "; " + note : note; });
  };
  const g = (n) => fields[n] && fields[n].value;
  if (isHC && !fields.defrostA) {
    // Text fallback (no word boxes): "DEFROST HEATER MAX AMPS 30", or the number on the next line.
    for (let i = 0; i < lines.length; i++) {
      if (!/\bDEFROST\b.*\bAMPS?\b/i.test(lines[i])) continue;
      const m = lines[i].match(/\bAMPS?\b\s*[:.]?\s*(\d{1,2})\s*$/i) || (lines[i + 1] || "").match(/^\s*(\d{1,2})\s*$/);
      if (m) fields.defrostA = { value: Number(m[1]), raw: m[1], confidence: 0.85 };
      break;
    }
  }
  saneFanFla(fields, isHC);
  chk(g("rla") != null && g("lra") != null && g("lra") <= g("rla"), ["rla", "lra"], "LRA should exceed RLA");
  chk(g("mca") != null && g("mop") != null && g("mop") < g("mca"), ["mca", "mop"], "MOP below MCA");
  chk(g("mca") != null && g("rla") != null && g("mca") < g("rla"), ["mca", "rla"], "MCA below RLA");

  // Packaged rooftop: gas-heat section text on a plate that also carries the cooling side, or explicit
  // PACKAGED ROOFTOP wording. Anything weaker keeps the current type (split/packaged).
  if (!g("unitType") || g("unitType") === "outdoor") {
    const T = text.toUpperCase();
    const explicit = T.match(/\b(?:PACKAGED\s+(?:ROOF\s*TOP|ROOFTOP|GAS\s*\/?\s*ELECTRIC)|ROOF\s*TOP\s+UNIT|ROOFTOP\s+UNIT)\b/);
    const gas = T.match(/GAS[-\s]*FIRED\s+CENTRAL\s+FURNACE|FORCED\s+AIR\s+FURNACE\s+WITH\s+COO\w*|\bTYPE\s*[\/:.]?\s*(?:OF\s+)?GAS\b|\bGAS\s+SUPPLY\s+PRESS|\bMANIFOLD\s+PRESS/);
    const cooling = fields.rla || fields.refrigerant || fields.charge || /\bCOMP\w*\b|\bR\.?L\.?A\b/.test(T);
    if (explicit || (gas && cooling)) fields.unitType = { value: "packaged rooftop", confidence: 0.8, quality: 0.8, ocr: null, raw: (explicit || gas)[0], note: "packaged rooftop: gas-heat or rooftop markers on the plate" };
  }
  // A bare compressor plate (thermally protected, oil, no fan/MCA/MOP) is a component, not a unit.
  if (!g("unitType") || g("unitType") === "outdoor") {
    const compPlate = (fields.protection || fields.oil || /\bCOPELAND|TECUMSEH|DANFOSS|BRISTOL\b/i.test(text)) && !fields.fanFla && !fields.mca && !fields.mop && !fields.charge;
    if (compPlate) fields.unitType = { value: "compressor", confidence: 0.8, quality: 0.8, ocr: null, raw: "compressor plate", note: "component nameplate" };
  }
  if (g("unitType") === "indoor") {
    const od1 = od && od.list[0];
    hints.push("Indoor unit: refrigerant/charge/MCA/MOP are on the outdoor unit plate" + (od1 ? " (" + od1 + ")" : "") + ". Scan that plate.");
  }
  const lowConfidence = Object.keys(fields).filter((k) => fields[k].confidence < lowBar(k));
  return { fields, lowConfidence, hints, text };
}

/**
 * Merge several parses of the same plate (different preprocessing / PSM passes).
 * Per field, the most confident reading wins. If passes read DIFFERENT values for
 * a field, the winner's confidence is cut and the disagreement is noted, because
 * a wrong value is worse than a blank.
 * @param {Array<{name:string, parsed:ReturnType<typeof parsePlate>}>} list
 */
const passWeight = (p) => { const c = p.confidence != null ? p.confidence : p.parsed && p.parsed.passConfidence; return c != null ? Math.pow(Math.max(1, c) / 100, 3) : 1; };
/** Fan FLA can't reuse another field's value (the LRA bleeding over), must be under RLA, and under 15 A on Heatcraft. Else blank. */
export function saneFanFla(fields, isHC) {
  const f = fields.fanFla;
  if (!f) return;
  const v = Number(f.value);
  const reused = ["lra", "rla", "mca", "mop", "voltage", "hz", "compA", "totalA", "defrostA", "evapFanA", "crankcaseW"].some((k) => fields[k] && Number(fields[k].value) === v);
  const rla = fields.rla && Number(fields.rla.value);
  if (reused || (isHC && v >= 15) || (rla && isHC && v >= rla)) delete fields.fanFla;
}

const AMP_FIELDS = ["rla", "lra", "fanFla", "mca", "mop", "compA", "totalA"];
const INFERRED = /decimal point inferred/;
export function mergeParses(list) {
  const fields = {};
  // Identifiers compare with spaces/dashes removed ("WWB 015057" = "WWB015057").
  const key = (f, n) => JSON.stringify(f.value && f.value.lb != null ? f.value.lb : typeof f.value === "string" ? f.value.toUpperCase().replace(/O/g, "0").replace(ID_FIELDS.includes(n) ? /[\s-]/g : /$^/, "") : f.value);
  const isPsm6 = (name) => /psm\s*6\b|psm6/i.test(name || "");
  const names = new Set(list.flatMap((p) => Object.keys(p.parsed.fields)));
  for (const n of names) {
    let got = list.map((p) => p.parsed.fields[n] && { ...p.parsed.fields[n], pass: p.name, w: passWeight(p) }).filter(Boolean);
    // Amps: a pass that printed the decimal point beats one where it was inferred ("035A" -> 0.35).
    if (AMP_FIELDS.includes(n) && got.some((f) => !INFERRED.test(f.note || ""))) {
      const explicit = got.filter((f) => !INFERRED.test(f.note || ""));
      if (explicit.length < got.length) got = explicit;
    }
    // Amps read without the decimal point ("247" for 24.7): restore it when another pass read N/10.
    if (AMP_FIELDS.includes(n)) {
      const vals = got.map((f) => f.value);
      got = got.map((f) => (typeof f.value === "number" && Number.isInteger(f.value) && f.value >= 100 && vals.some((v) => Math.abs(v * 10 - f.value) < 1e-6)
        ? { ...f, value: f.value / 10, note: (f.note ? f.note + "; " : "") + "decimal point restored (other passes read " + f.value / 10 + ")" } : f));
    }
    // Serial/model: readings that fit the brand's format beat ones that don't.
    if (ID_FIELDS.includes(n) && got.some((f) => f.formatOk === true) && got.some((f) => f.formatOk === false)) got = got.filter((f) => f.formatOk !== false);
    // Approved-refrigerant lists: a pass that missed rows is a subset, not a disagreement.
    if (n === "refrigerant" && got.length > 1 && got.every((f) => Array.isArray(f.list))) {
      const big = got.slice().sort((a, b) => b.list.length - a.list.length)[0];
      if (got.every((f) => f.list.every((r) => big.list.includes(r)))) got = got.filter((f) => f.value === big.value);
    }
    // Most confident first; ties go to PSM 6 (block layout keeps label and value on one line).
    got.sort((a, b) => b.confidence - a.confidence || isPsm6(b.pass) - isPsm6(a.pass));
    // Majority value wins (ties: most confident); a lone confident misread loses to agreement.
    const tally = new Map();
    // Votes are weighted by the pass's mean OCR confidence, cubed, so a junk pass (mean 44 -> 0.09)
    // barely counts against a clean one (mean 80 -> 0.51).
    got.forEach((f) => { const k = key(f, n); tally.set(k, (tally.get(k) || 0) + f.w); });
    const top = Math.max(...tally.values());
    const best = { ...got.find((f) => tally.get(key(f, n)) === top) };
    const distinct = [...new Set(got.map((f) => key(f, n)))];
    if (distinct.length > 1) {
      const total = got.reduce((t, f) => t + f.w, 0);
      const votesFor = (k) => got.filter((f) => key(f, n) === k).length;
      const maxVotes = Math.max(...distinct.map(votesFor));
      // Flag when no weighted majority, or when the weight picked a value fewer passes read.
      const second = [...tally.values()].sort((a, b) => b - a)[1] || 0;
      // Also flag a near tie: a runner-up within 25% of the winner's weight.
      const nearTie = second >= top * 0.75;
      // Amps near tie: the most confident pass's read wins (got[0]); any near tie is flagged.
      if (nearTie && AMP_FIELDS.includes(n)) Object.assign(best, got[0]);
      // A majority of weaker passes outvoting the most confident pass is flagged too.
      if (top * 2 <= total || votesFor(key(best, n)) < maxVotes || nearTie || key(best, n) !== key(got[0], n)) {
        best.confidence = round(best.confidence * 0.55, 2);
        best.note = (best.note ? best.note + "; " : "") + "passes disagree: " + distinct.map((d) => JSON.parse(d)).join(" vs ");
      }
    }
    // A big amp value with no decimal that no other pass read ("247" alone) is flagged.
    if (["rla", "mca", "fanFla"].includes(n) && Number.isInteger(best.value) && best.value >= 100 && got.filter((f) => f.value === best.value).length < 2) {
      best.confidence = round(Math.min(best.confidence, 0.45), 2);
      best.note = (best.note ? best.note + "; " : "") + "no decimal point and no other pass agrees";
    }
    delete best.w;
    best.passes = got.length;
    if (distinct.length > 1) {
      // Never merge silently: offer every distinct reading, most votes first, for the user to pick.
      best.candidates = distinct.map((d) => ({ value: got.find((f) => key(f, n) === d).value, votes: got.filter((f) => key(f, n) === d).length, weight: round(tally.get(d), 2) }))
        .sort((a, b) => b.weight - a.weight || b.votes - a.votes);
    }
    // Serial/model: the exact characters in two or more passes' raw text is independent evidence.
    if (distinct.length === 1 && ID_FIELDS.includes(n) && String(best.value).length >= 8) {
      const v = String(best.value).toUpperCase().replace(/[^A-Z0-9]/g, "");
      const seen = list.filter((p) => (p.parsed.text || "").split(/\n/).some((l) => l.toUpperCase().replace(/[^A-Z0-9]/g, "").includes(v))).length;
      if (seen >= 2 && best.confidence < 0.8 && best.formatOk !== false) {
        best.confidence = 0.8;
        best.note = (best.note ? best.note + "; " : "") + "same characters in " + seen + " OCR passes";
      }
    }
    if (distinct.length > 1 && ID_FIELDS.includes(n)) {
      best.confidence = round(Math.min(best.confidence, LOW_CONFIDENCE_ID - 0.01), 2);
    }
    fields[n] = best;
  }
  // Best pass = most total field confidence (shown first in the raw text panel).
  const score = (p) => Object.values(p.parsed.fields).reduce((a, f) => a + f.confidence, 0);
  const bestPass = list.length ? list.slice().sort((a, b) => score(b) - score(a))[0].name : null;
  const hints = [...new Set(list.flatMap((p) => p.parsed.hints || []))];
  // Keep only the hint that matches the merged unit type.
  const ut = fields.unitType && fields.unitType.value;
  const lowConfidence = Object.keys(fields).filter((k) => fields[k].confidence < lowBar(k));
  saneFanFla(fields, !!(fields.brand && fields.brand.value === "Heatcraft"));
  return { fields, lowConfidence, hints: ut === "indoor" ? hints.slice(0, 1) : [], bestPass, text: list.length ? list.find((p) => p.name === bestPass).parsed.text : "" };
}
