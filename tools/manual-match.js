/** OEM manual links: match a model number (and brand, when known) against data/manual-index.json.
 *  Pure functions (no DOM, no network); runs in node for tests. Links only: no PDFs are fetched or cached.
 *  Rules:
 *  - Normalize model and keys: uppercase, remove spaces and dashes (keys keep "*").
 *  - A key must match the WHOLE model; "*" = any run of characters (also none).
 *  - A key with fewer than 3 literal characters before its first "*" never matches (e.g. "*MXS*W*").
 *  - Brand known: only rows of that brand. Brand unknown: only keys with >= 5 literal characters before
 *    the first "*" (a key without "*" counts when it is >= 5 characters).
 *  - Blank keys never match. Results are deduped by URL and sorted Exact, Newer rev, Related doc, Reference, then title.
 *  - Rows on NON_OEM_HOSTS (nonOem: true) show "Not OEM source" instead of their status and sort after Reference. */

/** Hosts that are on the allowlist but are not the OEM (training site, seller): shown as "Not OEM source", sorted last. */
export const NON_OEM_HOSTS = ["hvaclearningcampus.com", "www.hvaclearningcampus.com", "www.radiantcompany.com"];
export const NON_OEM_LABEL = "Not OEM source";
export function isNonOem(entry) {
  if (entry && entry.nonOem === true) return true;
  try { return NON_OEM_HOSTS.includes(new URL(entry.url).hostname.toLowerCase()); } catch (e) { return false; }
}

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

/** Brand as shown in a picker: index notes like "(not Daikin)" or "(likely; not Daikin)" removed, other text kept. */
export function brandLabel(rowBrand) {
  return String(rowBrand || "").replace(/\s*\(([^)]*)\)/g, (m, inner) => (/^\s*(not|likely)\b/i.test(inner) ? "" : m)).replace(/\s+/g, " ").trim();
}
/** First real name of an index brand ("ECR / Utica" -> "ECR"): the value the brand filter receives. */
export function brandValue(rowBrand) {
  const parts = String(rowBrand || "").split(/[()\/;,]/).map((x) => x.trim()).filter((x) => x && !/^(not|likely)\b/i.test(x));
  return parts[0] || "";
}
const JUNK_BRANDS = new Set(["unknown", ""]);

/** Brand picker list: the base brands first, in the order given (each { value, label, aliases? }), then every other
 *  brand in the manual index, alphabetical by label. Case-insensitive dedupe on the same brand names the filter uses,
 *  so "Copeland (Emerson)", "York (JCI)" or "Norlake / Master-Bilt (RSG)" never add a second entry. */
export function brandOptions(base, entries) {
  const out = []; const seen = new Set();
  const covered = (names) => names.some((n) => seen.has(n));
  for (const b of base || []) {
    const value = typeof b === "string" ? b : b.value;
    const label = typeof b === "string" ? b : (b.label || b.value);
    const names = [value, ...((b && b.aliases) || [])].flatMap(brandNames);
    if (!value || covered(brandNames(value))) continue;
    out.push({ value, label, extra: false }); names.forEach((n) => seen.add(n));
  }
  const extras = [...new Set((entries || []).map((e) => String(e.brand || "").trim()))]
    .map((raw) => ({ raw, label: brandLabel(raw), value: brandValue(raw), names: brandNames(raw) }))
    .filter((x) => x.value && x.names.length && !JUNK_BRANDS.has(x.names[0]))
    .sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" }));
  for (const x of extras) {
    if (covered(x.names)) continue;
    out.push({ value: x.value, label: x.label, extra: true }); x.names.forEach((n) => seen.add(n));
  }
  return out;
}

const ORDER = (status, entry) => {
  if (entry && isNonOem(entry)) return 5;
  if (status === "MATCHED") return 0;
  if (/^MATCHED \(newer/.test(status)) return 1;
  if (status === "RELATED") return 2;
  if (status === "REFERENCE") return 3;
  return 4;
};
export function statusLabel(status, entry) {
  if (entry && isNonOem(entry)) return NON_OEM_LABEL;
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
    .sort((a, b) => ORDER(a.status, a) - ORDER(b.status, b) || String(a.docTitle).localeCompare(String(b.docTitle)))
    .filter((e) => !seen.has(e.url) && seen.add(e.url))
    .map((e) => ({ brand: e.brand, model: e.model, docTitle: e.docTitle, status: e.status, label: statusLabel(e.status, e), nonOem: isNonOem(e), url: e.url, verifiedDate: e.verifiedDate }));
}

/** Same-origin load of the bundled index (precached by sw.js). */
export function loadManualIndex() {
  return fetch(new URL("../data/manual-index.json?v=49", import.meta.url)).then((r) => {
    if (!r.ok) throw new Error("manual index " + r.status);
    return r.json();
  });
}
