// Multi-row load tables on packaged-unit plates (York/UPG, many RTUs):
//   QTY  LOAD        HP    VOLT-PH-HZ    RLA/FLA    LRA
//   1    COMP #1           208/230-3-60  16.0 RLA   120 LRA
//   1    ID BLOWER   1.00  208/230-1-60  7.6 FLA
//   1    OD FAN #1   0.5   208/230-1-60  2.3 FLA
//   1    COMB BLWR   0.05  208/230-1-60  0.78 FLA
// Each value is taken only from its own row: compressor RLA/LRA from COMP, fan FLA from the
// outdoor fan, and the unit phase never from a 1-phase motor row. HP is never an amp or charge.
// Sparse OCR (PSM 11) splits a row over several lines; those are joined until the next row label.

const ROWS = [
  ["comp", /\bCOMP(?:RESSOR|\w{0,3})\b\.?,?\s*(?:#|NO\.?)?\s*\d?/i],
  ["idBlower", /\b(?:[I1l|]\.?\s?D\.?|INDOOR|EVAP(?:ORATOR)?\.?)\s*(?:BLO\w*|FAN)\b|\bVENT\.?\s*INT\b/i],
  ["odFan", /\b(?:[O0Q]\.?\s?D\.?|OUTDOOR|COND(?:ENSER)?\.?)\s*FAN\b|\bVENT\.?\s*EXT\b/i],
  ["combBlower", /\bCOMB(?:USTION)?\.?\s*(?:BL\w*|FAN)\b|\bINDUCER\b|\bDRAFT\s*(?:INDUCER|BLOWER)\b|\bVENT\.?\s*DEVAC\b/i],
];
// Lines that end a row continuation in sparse output.
const STOP = /\b(?:FACTORY|CHARGE|TEST|PRESS|SYS|MIN\/MAX|FURNACE|GAS|MODEL|SERIAL|UNIT\s+VOLT|MINIMUM|MAXIMUM|MAX\.)\b/i;
const MOTORS = ["idBlower", "odFan", "combBlower"];
const STD_V = [115, 120, 200, 208, 220, 230, 240, 265, 277, 380, 400, 415, 440, 460, 480, 575, 600];

const kindOf = (l) => (ROWS.find(([, re]) => re.test(l)) || [null])[0];

/** "208/230-3-60", "208:230-3-60", "208/230-  3-60" (also split over joined sparse lines). */
export function voltPhHz(s) {
  // "\\208230-3-60": the slash between dual voltages can be lost.
  s = String(s).replace(/(?<!\d)(\d{3})(\d{3})(?=\s*-\s*[13]\s*-)/g, "$1/$2");
  const m = String(s).match(/\b(\d{3})\s*[\/:]\s*(\d{3})\s*[-\/]\s*([13])\s*[-\/.]\s*(50|60)\b|\b(\d{3})\s*[-\/]\s*([13])\s*[-\/]\s*(50|60)\b/);
  if (!m) return null;
  const volts = m[1] ? [m[1], m[2]] : [m[5]];
  if (!volts.every((v) => STD_V.includes(Number(v)))) return null;
  return { voltage: volts.join("/"), phase: Number(m[3] || m[6]), hz: Number(m[4] || m[7]), raw: m[0] };
}

/** Amps with their column unit: "16.0 RLA", "2.3 FLA", "0.78 FLA"; "7/6 FLA" (slash for the point) is flagged. */
function amps(s, unit) {
  const re = new RegExp("(?<![\\d.\\/])(\\d{1,3})([.,\\/])(\\d{1,2})\\s*[\"'*]?\\s*" + unit.split("").join("\\s?") + "(?![A-Y])", "i");
  const m = s.match(re);
  if (!m) return null;
  const v = Number(m[1] + "." + m[3]);
  return { value: v, raw: m[0].trim(), quality: m[2] === "/" ? 0.5 : 0.9, note: m[2] === "/" ? "decimal point read as '/'" : undefined };
}

/**
 * @param {string[]} lines OCR lines (numeric repair already applied)
 * @returns {null | {rows: Object, spans: Set<number>, rla?, lra?, fanFla?, vph?}}
 */
export function parseLoadTable(lines) {
  const starts = [];
  lines.forEach((l, i) => { const k = kindOf(l); if (k) starts.push({ k, i }); });
  const kinds = new Set(starts.map((s) => s.k));
  // A table needs the compressor row and at least one motor row.
  // A table: the compressor row plus a motor row, or an outdoor-fan row beside other load rows
  // (a pass that lost the COMP label still must not read the blower's FLA as the fan's).
  const otherLoad = lines.some((l) => kindOf(l) !== "odFan" && /\b(?:BLO\w*|BLWR|COMP\w*)\b/i.test(l))
    || lines.join(" ").split(/F\s?L\s?A\b/i).length > 2; // two or more FLA rows
  if (!(kinds.has("comp") && MOTORS.some((k) => kinds.has(k))) && !(kinds.has("odFan") && otherLoad)) return null;
  const rows = {}, spans = new Set();
  starts.forEach((s, j) => {
    if (rows[s.k]) return; // first row of each kind (COMP #1 before #2)
    const end = Math.min(j + 1 < starts.length ? starts[j + 1].i : lines.length, s.i + 7);
    const part = [lines[s.i].slice(lines[s.i].search(ROWS.find(([k]) => k === s.k)[1]))];
    for (let i = s.i + 1; i < end && !STOP.test(lines[i]); i++) part.push(lines[i]);
    // The next row label on the same line (PSM 6 can merge rows) ends this row.
    let text = part.join(" ");
    for (const [, re] of ROWS) { const m = text.slice(4).search(re); if (m >= 0 && kindOf(text.slice(4 + m)) !== s.k) text = text.slice(0, 4 + m); }
    rows[s.k] = { text, from: s.i, to: s.i + part.length - 1 };
    if (MOTORS.includes(s.k)) for (let i = s.i; i < s.i + part.length; i++) spans.add(i);
  });
  const out = { rows, spans };
  const c = rows.comp;
  if (c) {
    const r = amps(c.text, "RLA");
    if (r) out.rla = { ...r, note: [r.note, "COMP row of the load table"].filter(Boolean).join("; ") };
    const l = c.text.match(/(?<![\d.])(\d{2,4})\s*[\s(\[|*]?\s*L\s?R\s?A\b/i);
    if (l && Number(l[1]) >= 10) out.lra = { value: Number(l[1]), raw: l[0].trim(), quality: 0.9, note: "COMP row of the load table" };
    const v = voltPhHz(c.text);
    if (v) out.vph = { ...v, note: "compressor row of the load table" };
  }
  if (rows.odFan) {
    const f = amps(rows.odFan.text, "FLA");
    if (f) out.fanFla = { ...f, note: [f.note, "OD FAN row of the load table"].filter(Boolean).join("; ") };
  }
  return out;
}
