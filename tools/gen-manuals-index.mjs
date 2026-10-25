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
};

const LINK = /\[([^\]]+)\]\((https?:[^)\s]+)\)/;

/** "## Heatcraft (Bohn, Larkin, …)" -> { brand: "Heatcraft", subs: ["Bohn", "Larkin", …] } */
function brandHeading(h) {
  const m = h.match(/^(.+?)\s*(?:\((.*)\))?\s*$/);
  let brand = m[1].trim(), subs = [];
  if (m[2] && /,/.test(m[2])) subs = m[2].split(",").map((s) => s.trim()).filter(Boolean);
  // "Fujitsu General" -> "Fujitsu", "Manitowoc Ice" -> "Manitowoc" (the names the plate parser emits)
  const short = { "Fujitsu General": "Fujitsu", "Manitowoc Ice": "Manitowoc" }[brand];
  return { brand: short || brand, heading: h, subs };
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
      continue;
    }
    const l = cur && line.match(/^\s*-\s+(.*)$/);
    if (!l) continue;
    const link = l[1].match(LINK);
    if (!link) continue;
    const title = l[1].slice(0, l[1].indexOf("[")).replace(/<[^>]+>/g, "").replace(/[:\s]+$/, "").trim();
    cur.oem.push({ title, url: link[2].replace(/\\_/g, "_"), source: SOURCES_PAGE });
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
  const res = await fetch(url, { redirect: "follow", headers: { "user-agent": "Mozilla/5.0 (service-tech-ui gen-manuals-index)" } });
  if (!res.ok) throw new Error(url + " -> HTTP " + res.status);
  return res.url;
}

async function main() {
  const arg = (k) => { const a = process.argv.find((x) => x.startsWith("--" + k + "=")); return a && a.split("=").slice(1).join("="); };
  const brands = parseSources(readFileSync(arg("sources"), "utf8"));
  const entries = parseManuals(readFileSync(arg("manuals"), "utf8"));
  if (process.argv.includes("--verify")) {
    for (const b of Object.values(brands)) for (const o of b.oem) {
      const final = await verify(o.url);
      if (final !== o.url) { o.notionUrl = o.url; o.url = final; }
      o.verified = new Date().toISOString().slice(0, 10);
      console.error("ok", o.url);
    }
  }
  const out = {
    about: "Generated by tools/gen-manuals-index.mjs from Arthur's Notion Manuals page and OEM official sources map. Official OEM URLs only.",
    generated: new Date().toISOString().slice(0, 10),
    sources: [MANUALS_PAGE, SOURCES_PAGE],
    brands, entries,
  };
  writeFileSync(arg("out") || "data/manuals-index.json", JSON.stringify(out, null, 2) + "\n");
  console.error(Object.keys(brands).length + " brands, " + Object.values(brands).reduce((a, b) => a + b.oem.length, 0) + " OEM links, " + entries.length + " filed entries");
}

if (import.meta.url === "file://" + process.argv[1]) main().catch((e) => { console.error(e.message); process.exit(1); });
