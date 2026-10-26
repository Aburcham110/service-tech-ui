/**
 * Manual links for a scanned/typed brand + model, from the bundled data/manuals-index.json
 * (generated from Arthur's Notion pages by tools/gen-manuals-index.mjs; official OEM URLs only).
 *
 * findManuals(index, { brand, model, family }) ->
 *   { status: "match", brand, docs: [...], oem: [...] }   an index entry matched by model prefix, family or brand-wide doc
 *   { status: "oem",   brand, docs: [],    oem: [...] }   nothing on file: the brand's official OEM literature pages
 *   { status: "none",  brand, docs: [],    oem: [] }      neither ("No manual on file")
 * Every result also carries .match = matchModel(...) (model-level match, see below).
 *
 * Index schema (additions, all optional so older indexes keep working):
 *   models:   [{ brand, model,  docType, title, url, source, loginRequired? }]   exact model numbers
 *   prefixes: [{ brand, prefix, docType, title, url, source, loginRequired? }]   model-family prefixes
 *   brands[B].searchTemplate: { url: "https://<OEM>/...{model}...", source }      OEM literature search
 *   docType is one of DOC_TYPES. Official OEM URLs only.
 */
export const DOC_TYPES = ["install", "service", "owner", "wiring"];
export const MATCH_LABELS = { exact: "Exact model", prefix: "Model family", search: "Search results for ", brand: " brand page" };

const norm = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Canonical brand key in the index for a parser/typed brand name, or null. */
export function brandKey(index, brand) {
  if (!brand || !index) return null;
  const b = norm(brand);
  for (const [key, v] of Object.entries(index.brands || {})) {
    if ((v.aliases || [key]).some((a) => norm(a) === b)) return key;
  }
  // "Emerson / Copeland" etc.: any alias as a whole word of the given name
  const words = String(brand).toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  for (const [key, v] of Object.entries(index.brands || {})) {
    if ((v.aliases || [key]).some((a) => words.includes(norm(a)))) return key;
  }
  // Index entries can name a brand that has no OEM map section.
  const e = (index.entries || []).find((x) => norm(x.brand) === b);
  return e ? e.brand : null;
}

function entryMatches(e, key, model, family) {
  if (key && norm(e.brand) !== norm(key)) return false;
  const m = norm(model);
  if (m && (e.prefixes || []).some((p) => p && m.startsWith(norm(p)))) return "prefix";
  const fam = norm(family);
  if (fam && (e.families || []).some((f) => norm(f) === fam)) return "family";
  if (m && (e.families || []).some((f) => norm(f).length >= 3 && m.startsWith(norm(f)))) return "family";
  if (key && e.brandWide) return "brand";
  return false;
}

/** OEM search template URL with {model} filled in, URL-encoded. */
export function fillTemplate(tpl, model) {
  return String(tpl || "").split("{model}").join(encodeURIComponent(String(model || "").trim()));
}

/** Human label for a match kind. */
export function matchLabel(m) {
  if (!m || m.kind === "none") return "No manual on file";
  if (m.kind === "search") return MATCH_LABELS.search + m.model;
  if (m.kind === "brand") return m.brand + MATCH_LABELS.brand;
  return MATCH_LABELS[m.kind];
}

/**
 * Model-level match, in order: exact model -> longest prefix -> brand search template (model filled in)
 * -> brand page. -> { kind: "exact"|"prefix"|"search"|"brand"|"none", brand, model, label, docs:[{title,url,docType,loginRequired}] }
 * kind "search"/"brand" = brand-level only (nothing filed for this model).
 */
export function matchModel(index, { brand, model } = {}) {
  const key = brandKey(index, brand);
  const raw = String(model || "").trim();
  const m = norm(raw);
  const same = (e) => !key || brandKey(index, e.brand) === key;
  const out = (kind, docs, b) => { const r = { kind, brand: b || key || brand || null, model: raw, docs }; r.label = matchLabel(r); return r; };
  if (m) {
    const exact = ((index && index.models) || []).filter((e) => same(e) && norm(e.model) === m);
    if (exact.length) return out("exact", exact, brandKey(index, exact[0].brand) || exact[0].brand);
    if (key) { // a short prefix without a brand is too ambiguous
      const hits = ((index && index.prefixes) || []).filter((e) => same(e) && norm(e.prefix) && m.startsWith(norm(e.prefix)));
      const longest = Math.max(0, ...hits.map((e) => norm(e.prefix).length));
      if (longest) return out("prefix", hits.filter((e) => norm(e.prefix).length === longest));
    }
  }
  const b = key && index.brands && index.brands[key];
  const t = b && b.searchTemplate;
  if (m && t && t.url) return out("search", [{ title: key + " literature search: " + raw, url: fillTemplate(t.url, raw), source: t.source, loginRequired: !!t.loginRequired }]);
  if (b && (b.oem || []).length) return out("brand", b.oem.slice(0, 1));
  return out("none", []);
}

export const isBrandLevel = (m) => !!m && (m.kind === "search" || m.kind === "brand");

/** "Models without a manual": local list only (never uploaded). */
export const UNMATCHED_KEY = "serviceTechNoManual_v1";
const store = (s) => s || (typeof localStorage !== "undefined" ? localStorage : null);
export function listUnmatched(storage) {
  try { const v = JSON.parse(store(storage).getItem(UNMATCHED_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}
/** Saves {brand, model, date} when the best match is brand-level only. Returns true if saved/updated. */
export function recordUnmatched(match, storage, now = new Date()) {
  const s = store(storage);
  if (!s || !match || !match.model || !(isBrandLevel(match) || !match.brand)) return false; // brand-level, or no brand read
  const list = listUnmatched(s).filter((x) => !(norm(x.brand) === norm(match.brand) && norm(x.model) === norm(match.model)));
  list.unshift({ brand: match.brand || "", model: match.model, kind: match.kind, date: now.toISOString().slice(0, 10) });
  try { s.setItem(UNMATCHED_KEY, JSON.stringify(list.slice(0, 100))); return true; } catch { return false; }
}
export function clearUnmatched(storage) { try { store(storage).removeItem(UNMATCHED_KEY); } catch { /* ignore */ } }
export const unmatchedText = (list) => ["Models without a manual:", ...list.map((x) => x.date + "  " + (x.brand || "(no brand)") + "  " + x.model)].join("\n");

/** Lock label for login-only docs. */
export const LOCK = "\u{1F512}";
export const loginLabel = (d) => (d && d.loginRequired ? LOCK + " dealer login" : "");

export function findManuals(index, { brand, model, family } = {}) {
  const match = matchModel(index, { brand, model });
  const res = findManualsOld(index, { brand, model, family });
  res.match = match;
  return res;
}

function findManualsOld(index, { brand, model, family } = {}) {
  const key = brandKey(index, brand);
  const docs = [];
  for (const e of (index && index.entries) || []) {
    if (!key && !(e.prefixes || []).length) continue; // without a brand only an exact model prefix can match
    if (e.requireBrand && !key) continue; // brand-specific model families (Trane) need the brand too
    const how = entryMatches(e, key, model, family);
    if (how) docs.push({ ...e, matchedBy: how });
  }
  // Model-specific first, brand-wide handbooks last.
  const rank = { prefix: 0, family: 1, brand: 2 };
  docs.sort((a, b) => rank[a.matchedBy] - rank[b.matchedBy]);
  const docBrand = key || (docs[0] && docs[0].brand) || null;
  const oem = (docBrand && index.brands && index.brands[docBrand] && index.brands[docBrand].oem) || [];
  if (docs.length) return { status: "match", brand: docBrand, docs, oem };
  if (oem.length) return { status: "oem", brand: docBrand, docs: [], oem };
  return { status: "none", brand: brand || null, docs: [], oem: [] };
}

let cached = null;
/** Loads the bundled index (precached by sw.js, so it works offline). */
export function loadManualsIndex(url = new URL("../data/manuals-index.json?v=22", import.meta.url).href) {
  if (!cached) cached = fetch(url).then((r) => { if (!r.ok) throw new Error("manuals index " + r.status); return r.json(); }).catch((e) => { cached = null; throw e; });
  return cached;
}

import { renderSendButton } from "./missing-model.js?v=22";

/** Renders the result of findManuals into host (DOM). */
export function renderManuals(host, res, { brand, model } = {}) {
  host.innerHTML = "";
  host.className = "manuals";
  const h = document.createElement("div");
  h.className = "manuals-head";
  h.textContent = "Manuals" + (brand || model ? " — " + [brand, model].filter(Boolean).join(" ") : "");
  host.appendChild(h);
  const m = res.match;
  if (m && m.model && (m.kind !== "none" || !m.brand)) {
    const box = document.createElement("div");
    box.className = "manuals-match manuals-match-" + m.kind;
    const k = document.createElement("strong"); k.className = "match-kind"; k.textContent = m.label;
    box.appendChild(k);
    const ml = document.createElement("ul");
    m.docs.forEach((d) => {
      const li = document.createElement("li");
      const a = document.createElement("a"); a.href = d.url; a.target = "_blank"; a.rel = "noopener";
      a.textContent = d.title; li.appendChild(a);
      const meta = [d.docType, loginLabel(d)].filter(Boolean).join(" · ");
      if (meta) { const s = document.createElement("small"); s.className = d.loginRequired ? "login-lock" : ""; s.textContent = " " + meta; li.appendChild(s); }
      ml.appendChild(li);
    });
    box.appendChild(ml);
    if (!m.brand) box.appendChild(Object.assign(document.createElement("small"), { className: "unmatched-note", textContent: "No brand read from the plate." }));
    if ((isBrandLevel(m) || !m.brand) && recordUnmatched(m)) {
      const n = document.createElement("small"); n.className = "unmatched-note";
      n.textContent = "Saved to \u201cModels without a manual\u201d on this phone (not uploaded).";
      box.appendChild(n);
    }
    renderSendButton(box, m);
    host.appendChild(box);
  }
  const list = document.createElement("ul");
  const add = (title, url, note) => {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = url; a.target = "_blank"; a.rel = "noopener"; a.textContent = title;
    li.appendChild(a);
    if (note) { const s = document.createElement("small"); s.textContent = " " + note; li.appendChild(s); }
    list.appendChild(li);
  };
  if (res.status === "none") {
    const p = document.createElement("p");
    p.className = "manuals-none";
    p.textContent = "No manual on file" + (brand ? " for " + brand : "") + ".";
    host.appendChild(p);
    return;
  }
  res.docs.forEach((d) => add(d.title, d.url, d.note ? "(" + d.note + ")" : ""));
  if (res.status === "oem") {
    const p = document.createElement("p");
    p.className = "manuals-note";
    p.textContent = "No manual on file for this model. Official " + res.brand + " literature:";
    host.appendChild(p);
  }
  res.oem.forEach((o) => add(res.brand + ": " + o.title, o.url, o.note ? "(" + o.note + ")" : ""));
  host.appendChild(list);
  const n = document.createElement("small");
  n.className = "online-only";
  n.textContent = "Links open the OEM site (online only).";
  host.appendChild(n);
  if (res.brand) {
    const h = document.createElement("a");
    h.className = "manuals-helper-link";
    h.href = "manuals.html?" + new URLSearchParams({ brand: res.brand, model: model || "" }).toString();
    h.textContent = " Offline search terms →";
    host.appendChild(h);
  }
}
