#!/usr/bin/env node
/**
 * Regenerates data/manuals-index.json from Arthur's Notion pages (Service Tech — Field Docs):
 *   - Manuals              https://app.notion.com/p/3d3402f833af8106af2ae647a39fcf48  (index table + filed PDFs)
 *   - OEM official sources https://app.notion.com/p/3d3402f833af8125a057eaa0304b38ba  (official OEM portals per brand)
 *
 * Input is the page markdown as returned by the Notion connector's read-only fetch (notion-fetch),
 * saved to files. This script does NOT call Notion itself (the pages are private; no API token is
 * stored here). Don't commit the snapshots: the repo is public and the Manuals page is shop-only.
 *
 *   node tools/gen-manuals-index.mjs --manuals=manuals.md --sources=sources.md [--verify] [--out=data/manuals-index.json]
 *
 * --verify fetches every URL (following redirects) and fails unless each one returns 2xx; the final
 * URL after redirects is stored (e.g. fujitsugeneral.com/us -> airstagehvac.com, Fujitsu's own US domain).
 * Only URLs that appear in the Notion pages are used: nothing is guessed or added by hand.
 */
import { readFileSync, writeFileSync } from "node:fs";

export const MANUALS_PAGE = "https://app.notion.com/p/3d3402f833af8106af2ae647a39fcf48";
export const SOURCES_PAGE = "https://app.notion.com/p/3d3402f833af8125a057eaa0304b38ba";

// Plate-parser brand names (tools/plate-parse.js BRANDS) and sub-brands -> the Notion brand heading.
// Heatcraft's sub-brands come from its own heading; the rest map parser spellings.
const EXTRA_ALIASES = {
  Copeland: ["Emerson / Copeland", "Emerson", "Copeland"],
  Fujitsu: ["Fujitsu", "Fujitsu General", "AIRSTAGE"],
  "Manitowoc": ["Manitowoc", "Manitowoc Ice"],
  "Mitsubishi Electric": ["Mitsubishi Electric"], // not Mitsubishi Heavy: different documents
  Trane: ["Trane", "American Standard"], // "American Standard shares literature" (Notion map)
  Rheem: ["Rheem", "Ruud", "Rheem / Ruud"], // "Rheem and Ruud share literature"
  York: ["York", "UPG", "Unitary Products Group", "Johnson Controls Unitary Products", "Coleman", "Luxaire"], // "Coleman/Luxaire share UPG literature"
  LG: ["LG", "LG Electronics", "LG Air Conditioning Technologies"],
};

// Labels for links whose Notion description carries a caveat. Each one restates what the Notion map says.
const LINK_NOTES = [
  [/hvacpartners\.com/i, "Dealer login required (HVACpartners dealer portal)", "login"],
  [/apps\.apple\.com\/.*carrier-service-technician/i, "Official Carrier Service Technician app (fault-code lookup) — an app, not a code list", "app"],
  [/hvacliteraturelibrary\.com/i, "Attribution caveat: hosted on rheemweb.com per search index; domain ownership confirmed only by that host", "caveat"],
  [/lg\.com\/us\/support\/help-library\/lg-air-conditioner-guide-to-error-codes/i, "Consumer / room AC units only — ductless/VRF error tables are in each system's install/service manual", "consumer"],
  [/access\.fujitsugeneral\.com/i, "Contractor login", "login"],
  [/lghvac\.com\/mylg-hvac\/publications/i, "Licensed-pro publications", "pro"],
];

// Model-family patterns. Only Trane's are cited (2026 Residential Product Handbook, per the Notion map).
export const FAMILY_SOURCES = { Trane: /Product Handbook/i };

const LINK = /\[([^\]]+)\]\((https?:[^)\s]+)\)/;
const LINKS = /\[([^\]]+)\]\((https?:[^)\s]+)\)/g;
const strip = (t) => t.replace(LINKS, "$1").replace(/<[^>]+>/g, "").replace(/\\_/g, "_");

/** "## Heatcraft (Bohn, Larkin, …)" -> { brand: "Heatcraft", subs: ["Bohn", "Larkin", …] } */
function brandHeading(h) {
  const m = h.match(/^(.+?)\s*(?:\((.*)\))?\s*$/);
  let brand = m[1].trim(), subs = [];
  if (m[2] && /,/.test(m[2])) subs = m[2].split(",").map((s) => s.trim()).filter(Boolean);
  // "Fujitsu General" -> "Fujitsu", "Manitowoc Ice" -> "Manitowoc" (the names the plate parser emits)
  if (subs.some((x) => /—|\//.test(x))) subs = []; // descriptive parentheticals, not sub-brand lists
  const short = { "Fujitsu General": "Fujitsu", "Manitowoc Ice": "Manitowoc", "Rheem / Ruud": "Rheem", "York / UPG": "York" }[brand];
  return { brand: short || brand, heading: h, subs };
}

/** Model-family entries (Trane only) derived from the sources map: [{brand, prefixes, title, url, ...}]. */
export function familyEntries(brands) {
  return Object.entries(brands).flatMap(([brand, b]) => (b.families || []).map((f) => ({
    brand, families: [], prefixes: f.prefixes, brandWide: false, requireBrand: true,
    title: f.title, docType: f.kind, url: f.url, kind: "oem", note: "Model family per " + f.citation, source: f.source,
  })));
}

export function parseSources(md) {
  const brands = {};
  let cur = null;
  for (const line of md.split("\n")) {
    const h = line.match(/^##\s+(.+)$/);
    if (h) {
      if (/field habit/i.test(h[1])) { cur = null; continue; }
      const b = brandHeading(h[1].replace(/<[^>]+>/g, ""));
      cur = brands[b.brand] = { heading: b.heading, aliases: [...new Set([b.brand, ...b.subs, ...(EXTRA_ALIASES[b.brand] || [])])], oem: [] };
      Object.defineProperty(cur, "key", { value: b.brand }); Object.defineProperty(cur, "families", { value: [] });
      continue;
    }
    const l = cur && line.match(/^\s*-\s+(.*)$/);
    if (!l) continue;
    // The bullet's own link is the first one whose text is the full https URL; other links are inline mentions.
    const link = [...l[1].matchAll(LINKS)].find((m) => m[1].replace(/\\_/g, "_") === m[2].replace(/\\_/g, "_") && /^https:/.test(m[2]));
    if (!link) continue;
    const title = strip(l[1].slice(0, link.index)).replace(/[:\s]+$/, "").trim();
    const url = link[2].replace(/\\_/g, "_");
    const o = { title, url, source: SOURCES_PAGE };
    const rule = LINK_NOTES.find(([re]) => re.test(url));
    if (rule) { o.note = rule[1]; o.flag = rule[2]; }
    cur.oem.push(o);
    // "(model nomenclature + families, e.g. 5TTV/5TTX/5TTR AC, 5TWV/5TWX/5TWR HP, 5TAM/5TEM air handlers)"
    const fam = FAMILY_SOURCES[cur.key] && FAMILY_SOURCES[cur.key].test(title) && title.match(/e\.g\.\s*([^)]*)\)/);
    if (fam) for (const g of fam[1].split(",")) {
      const m = g.trim().match(/^([A-Z0-9/]+)\s+(.+)$/);
      if (!m) continue;
      const prefixes = m[1].split("/").filter(Boolean);
      cur.families.push({ prefixes, kind: m[2].trim(), title: cur.key + " " + m[2].trim() + " (" + prefixes.join("/") + ") — " + title.replace(/\s*\(.*$/, ""), url, source: SOURCES_PAGE, citation: title.replace(/\s*\(.*$/, "") });
    }
  }
  return brands;
}

/** Manuals page: index rows that name a model/family, plus filed PDFs (### headings under "Filed PDFs"). */
export function parseManuals(md) {
  const rows = [];
  let section = "";
  const filed = [];
  for (const line of md.split("\n")) {
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) { section = h2[1].trim(); continue; }
    if (section === "Index" && /^\|/.test(line) && !/^\|\s*-/.test(line) && !/^\|\s*Brand\s*\|/.test(line)) {
      const [brand, family, docType, notes] = line.split("|").slice(1, -1).map((c) => c.trim());
      rows.push({ brand, family, docType, notes });
    }
    const h3 = section === "Filed PDFs" && line.match(/^###\s+(.+)$/);
    if (h3) filed.push(h3[1].trim());
  }
  const entries = [];
  for (const r of rows) {
    if (!r.family || /^other$/i.test(r.brand)) continue; // no model/family named: nothing on file to match
    // "Welded / Copelametic / Scroll / Screw / CU (handbook)" -> families; "(handbook)" = applies brand-wide
    const brandWide = /\(handbook\)/i.test(r.family);
    const families = r.family.replace(/\(.*?\)/g, "").split("/").map((s) => s.trim()).filter(Boolean);
    const file = filed.find((t) => t.toLowerCase().includes(r.brand.toLowerCase()) && (!r.docType || t.toLowerCase().includes(r.docType.split(" ")[0].toLowerCase())));
    entries.push({
      brand: r.brand, families, prefixes: [], brandWide,
      title: file || r.brand + " " + r.docType, docType: r.docType,
      url: MANUALS_PAGE, kind: "notion",
      note: "Filed PDF on your Notion Manuals page (shop-only; needs Notion sign-in)",
      source: MANUALS_PAGE,
    });
  }
  return entries;
}

async function verify(url) {
  const res = await fetch(url, { redirect: "follow", headers: { "user-agent": "Mozilla/5.0 (service-tech-ui gen-manuals-index)", accept: "text/html,application/pdf,*/*" } });
  try { await res.body?.cancel(); } catch {}
  if (!res.ok) throw new Error(url + " -> HTTP " + res.status);
  return res.url;
}

async function main() {
  const arg = (k) => { const a = process.argv.find((x) => x.startsWith("--" + k + "=")); return a && a.split("=").slice(1).join("="); };
  const brands = parseSources(readFileSync(arg("sources"), "utf8"));
  const fams = familyEntries(brands);
  const entries = [...parseManuals(readFileSync(arg("manuals"), "utf8")), ...fams];
  const failed = [];
  if (process.argv.includes("--verify")) {
    // A link that doesn't load is left out of the index (and listed), never kept unverified.
    for (const b of Object.values(brands)) {
      const keep = [];
      for (const o of b.oem) {
        try {
          const final = await verify(o.url);
          if (final !== o.url) { o.notionUrl = o.url; o.url = final; }
          o.verified = new Date().toISOString().slice(0, 10);
          keep.push(o);
          console.error("ok", o.url);
        } catch (e) { failed.push(e.message); console.error("FAILED", e.message); }
      }
      b.oem = keep;
    }
    for (const e of fams) {
      const o = Object.values(brands).flatMap((b) => b.oem).find((x) => x.url === e.url || x.notionUrl === e.url);
      if (!o) { entries.splice(entries.indexOf(e), 1); continue; } // its source link failed to load
      e.url = o.url; e.verified = o.verified;
    }
  }
  const out = {
    about: "Generated by tools/gen-manuals-index.mjs from Arthur's Notion Manuals page and OEM official sources map. Official OEM URLs only.",
    generated: new Date().toISOString().slice(0, 10),
    sources: [MANUALS_PAGE, SOURCES_PAGE],
    brands, entries,
    ...(failed.length ? { failedToLoad: failed } : {}),
  };
  writeFileSync(arg("out") || "data/manuals-index.json", JSON.stringify(out, null, 2) + "\n");
  console.error(Object.keys(brands).length + " brands, " + Object.values(brands).reduce((a, b) => a + b.oem.length, 0) + " OEM links, " + entries.length + " filed entries");
}

if (import.meta.url === "file://" + process.argv[1]) main().catch((e) => { console.error(e.message); process.exit(1); });
