/** OEM manual links: match a model number (and brand, when known) against data/manual-index.json.
 *  Pure functions (no DOM, no network); runs in node for tests. Links only: no PDFs are fetched or cached.
 *  Rules:
 *  - Normalize model and keys: uppercase, remove spaces and dashes (keys keep "*").
 *  - A key must match the WHOLE model; "*" = any run of characters (also none).
 *  - A key with fewer than 3 literal characters before its first "*" never matches (e.g. "*MXS*W*").
 *  - Brand known: only rows of that brand. Brand unknown: only keys with >= 5 literal characters before
 *    the first "*" (a key without "*" counts when it is >= 5 characters).
 *  - Blank keys never match. Results are deduped by URL and sorted Exact, Newer rev, Related doc, Reference, then title. */

export const NO_MATCH_TEXT = "No indexed manual. Check the OEM portal.";
export const MIN_PREFIX = 3;
export const MIN_PREFIX_NO_BRAND = 5;

export const normModel = (s) => String(s == null ? "" : s).toUpperCase().replace(/[\s-]+/g, "");
export const normKey = normModel; // "*" is kept

/** Literal characters before the first "*" (whole length when there is no "*"). */
export function literalPrefix(key) {
  const k = normKey(key);
  const i = k.indexOf("*");
  return i < 0 ? k.length : i;
}

const esc = (s) => s.replace(/[.+?^${}()|[\]\\\/]/g, "\\$&");
export function keyRegex(key) {
  const k = normKey(key);
  return new RegExp("^" + k.split("*").map(esc).join(".*") + "$");
}

/** Does one key match the model? brandKnown tightens nothing here; it only changes the minimum prefix. */
export function keyMatches(key, model, { brandKnown = false } = {}) {
  const k = normKey(key), m = normModel(model);
  if (!k || !m || k.replace(/\*/g, "") === "") return false;
  const lit = literalPrefix(k);
  if (lit < MIN_PREFIX) return false;
  if (!brandKnown && lit < MIN_PREFIX_NO_BRAND) return false;
  return keyRegex(k).test(m);
}

/** Brand names in the index can carry notes, e.g. "Copeland (Emerson)", "ECR / Utica", "Viessmann (not Daikin)".
 *  A row matches a brand when the brand equals one of its names; notes like "not Daikin" / "likely" are ignored. */
const normBrand = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
export function brandNames(rowBrand) {
  return String(rowBrand || "").split(/[()\/;,]/).map((s) => s.trim())
    .filter((s) => s && !/^(not|likely)\b/i.test(s)).map(normBrand).filter(Boolean);
}
export const brandMatches = (rowBrand, brand) => brandNames(rowBrand).includes(normBrand(brand));

const ORDER = (status) => {
  if (status === "MATCHED") return 0;
  if (/^MATCHED \(newer/.test(status)) return 1;
  if (status === "RELATED") return 2;
  if (status === "REFERENCE") return 3;
  return 4;
};
export function statusLabel(status) {
  if (status === "MATCHED") return "Exact";
  if (/^MATCHED \(newer/.test(status)) return "Newer rev";
  if (status === "RELATED") return "Related doc";
  if (status === "REFERENCE") return "Reference";
  return "";
}

/** Matching rows for { model, brand? }: [{ brand, model, docTitle, status, label, url, verifiedDate }]. */
export function matchManuals(index, { model, brand } = {}) {
  const entries = (index && index.entries) || [];
  if (!normModel(model)) return [];
  const brandKnown = !!normBrand(brand);
  const seen = new Set();
  return entries
    .filter((e) => !brandKnown || brandMatches(e.brand, brand))
    .filter((e) => (e.matchKeys || []).some((k) => keyMatches(k, model, { brandKnown })))
    .filter((e) => /^https:\/\//.test(e.url || ""))
    .sort((a, b) => ORDER(a.status) - ORDER(b.status) || String(a.docTitle).localeCompare(String(b.docTitle)))
    .filter((e) => !seen.has(e.url) && seen.add(e.url))
    .map((e) => ({ brand: e.brand, model: e.model, docTitle: e.docTitle, status: e.status, label: statusLabel(e.status), url: e.url, verifiedDate: e.verifiedDate }));
}

/** Same-origin load of the bundled index (precached by sw.js). */
export function loadManualIndex() {
  return fetch(new URL("../data/manual-index.json?v=44", import.meta.url)).then((r) => {
    if (!r.ok) throw new Error("manual index " + r.status);
    return r.json();
  });
}
