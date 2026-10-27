/**
 * OEM error-code tables (data/error-codes.json, built by tools/gen-error-codes.mjs from the researcher's Notion page).
 * Pure helpers: which table covers a scanned unit, and which rows a typed code matches.
 * Text is shown exactly as transcribed; an empty remedy means the manual gives none.
 */
export const ERROR_CODES_URL = "./data/error-codes.json?v=32";
// Brand spellings that share a table's literature.
const ALIASES = { mitsubishi: "mitsubishielectric", coleman: "york", luxaire: "york", upg: "york", americanstandard: "trane", ruud: "rheem", lgelectronics: "lg", fujitsugeneral: "fujitsu", airstage: "fujitsu" };
const norm = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const brandNorm = (b) => { const k = norm(b).toLowerCase(); return ALIASES[k] || k; };

/** The code table set for a scanned unit, or null. Model prefix must match; a given brand must agree. */
export function findCodeSet(data, { brand, model } = {}) {
  const m = norm(model);
  if (!data || !m) return null;
  const b = brand ? brandNorm(brand) : "";
  return (data.sets || []).find((s) => (!b || brandNorm(s.brand) === b) && s.models.some((p) => m.startsWith(norm(p)))) || null;
}

/** Rows for a typed code: exact code matches (case-insensitive) first; otherwise rows whose text contains it. */
export function lookupCode(set, q) {
  const k = norm(q);
  if (!set || !k) return [];
  const exact = set.rows.filter((r) => r.keys.some((x) => norm(x) === k));
  if (exact.length) return exact;
  const t = String(q).trim().toLowerCase();
  return set.rows.filter((r) => (r.pattern + " " + r.meaning).toLowerCase().includes(t));
}

/** "Source: manual p.X" link for a row. */
export function sourceLink(row) {
  return { label: row.page ? `Source: manual p.${row.page}` : "Source: manual", href: row.url + (row.page ? `#page=${row.page}` : "") };
}

/** Short pick-list label for a row. */
export const rowLabel = (r) => (r.keys.length ? r.keys.join(" / ") + " — " : "") + (r.keys.length ? r.meaning : r.pattern + " — " + r.meaning);

export async function loadErrorCodes(fetchFn = fetch) {
  const r = await fetchFn(ERROR_CODES_URL);
  if (!r.ok) throw new Error("error codes " + r.status);
  return r.json();
}
