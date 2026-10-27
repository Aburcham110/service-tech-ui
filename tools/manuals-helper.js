/**
 * Offline manuals helper: Brand -> common service-manual search terms + that brand's official portal URLs.
 * Everything comes from the bundled data/manuals-index.json (precached), so it works with no signal.
 * URLs are only the ones already in the index; nothing is added here. No PDFs.
 * The Notion OEM map / Manuals pages stay the online source of truth.
 */
import { findManuals } from "./manuals.js?v=24";

export const LABEL = "Search terms only — verify with OEM";

// Doc types every OEM publishes in some form.
const GENERIC = ["installation manual", "service manual", "wiring diagram", "installation instructions", "product data"];
// Doc-type words the Notion OEM map itself uses for a brand (picked up from that brand's link titles in the index).
const MAP_TERMS = ["AE bulletin", "I&O manual", "product bulletin", "engineering notice", "technical bulletin", "IOM",
  "service notes", "technical guide", "submittal", "operation manual", "owner's manual", "app note", "QRD", "catalog", "spec sheet", "literature number"];

const titlesOf = (b) => (b.oem || []).map((o) => o.title).join(" ").toLowerCase();
const has = (text, term) => {
  const t = term.toLowerCase();
  if (t === "iom") return /\biom/.test(text);
  if (t === "ae bulletin") return /\bae bulletins?\b/.test(text);
  if (t === "app note") return /app(lication)? notes?/.test(text);
  if (t === "spec sheet") return /\bspecs?\b/.test(text);
  if (t === "i&o manual") return /i&o|i&amp;o/.test(text);
  return text.includes(t.replace(/'s$/, "").replace(/s$/, ""));
};

/** Search terms for one brand (+ optional model). Model families come only from index entries (Trane). */
export function searchTerms(index, brandKey, model = "") {
  const b = index.brands[brandKey];
  if (!b) return [];
  const m = String(model || "").trim();
  const subject = [brandKey, m].filter(Boolean).join(" ");
  const titles = titlesOf(b) + " " + (index.entries || []).filter((e) => e.brand === brandKey).map((e) => e.title + " " + (e.docType || "")).join(" ").toLowerCase();
  const terms = GENERIC.map((t) => subject + " " + t);
  MAP_TERMS.filter((t) => has(titles, t)).forEach((t) => terms.push(subject + " " + t));
  if (!m) (index.entries || []).filter((e) => e.brand === brandKey && (e.prefixes || []).length)
    .forEach((e) => terms.push(brandKey + " " + e.prefixes.join(" / ") + " " + (e.docType || "") + " installation manual"));
  return [...new Set(terms.map((t) => t.replace(/\s+/g, " ").trim()))];
}

/** Official portal URLs for a brand: exactly the index's OEM links (+ model-family docs), never Notion file links. */
export function portalLinks(index, brandKey) {
  const b = index.brands[brandKey];
  if (!b) return [];
  const fam = (index.entries || []).filter((e) => e.brand === brandKey && e.kind === "oem").map((e) => ({ title: e.title, url: e.url, note: e.note }));
  const seen = new Set();
  return [...(b.oem || []), ...fam].filter((o) => !seen.has(o.url) && seen.add(o.url)).map((o) => ({ title: o.title, url: o.url, note: o.note || "" }));
}

export function helperModel(index) {
  return Object.keys(index.brands).sort((a, b) => a.localeCompare(b)).map((brand) => ({
    brand, aliases: index.brands[brand].aliases || [brand], terms: searchTerms(index, brand), links: portalLinks(index, brand),
  }));
}

/** Best portal link to highlight for a model: a model-family doc from the index when the model matches one,
 *  else the brand's first official portal. null without a model (nothing to match). */
export function bestLink(index, brandKey, model = "") {
  const m = String(model || "").trim();
  const links = portalLinks(index, brandKey);
  if (!m || !links.length) return null;
  const urls = new Set(links.map((l) => l.url));
  const hit = findManuals(index, { brand: brandKey, model: m }).docs.find((d) => d.matchedBy !== "brand" && urls.has(d.url));
  return hit ? { url: hit.url, why: "matches model " + m } : { url: links[0].url, why: "brand portal (no model-specific doc in the index)" };
}

/** All search terms as one copyable block (one per line, label first). */
export const allTermsText = (terms) => [LABEL + ":", ...terms].join("\n");
