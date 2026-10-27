/** tree.html: walks a troubleshooting tree (tools/trees.js) one step at a time. */
import { TREES, toolHref, treeHref, quickLinks, jobLogHref } from "./trees.js?v=37";
import { getTool } from "./registry.js";
import { getLastPlate, plateLabel, nominalVoltage } from "./last-plate.js?v=37";
import { getCardPlate } from "./card-plate.js?v=37";
import { pickTree, manualLink, TREE_LABELS } from "./tree-pick.js?v=37";
import { loadManualsIndex } from "./manuals.js?v=37";
import { mountAddToCall, treeNote, treeStepEntry, hasOpenCall } from "./call-notes.js?v=37";
import { findCodeSet, lookupCode, sourceLink, rowLabel, loadErrorCodes } from "./error-codes.js?v=37";

const params = new URLSearchParams(location.search);
const TYPE_KEY = "serviceTechTreeType_v1"; // last equipment type picked here
const store = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) { /* ignore */ } } };
// An open call card's plate (stored with the card; hand-edits included) wins over the URL and the last scan.
const card = getCardPlate();
const plate = card || getLastPlate(); // else the last scanned plate (nameplate tool)
const known = { refrigerant: plate && plate.refrigerant, nominalV: nominalVoltage(plate && plate.voltage), rla: plate && plate.rla };
if (!card && params.get("refrigerant")) known.refrigerant = params.get("refrigerant");
const pick = document.getElementById("tree-pick");
const root = document.getElementById("tree-root");
// Opened from a scan: brand/model/unit type ride along; the tree is re-picked against the manuals index.
const scan = card ? { brand: card.brand || "", model: card.model || "", serial: card.serial || "", unitType: card.unitType || "", equipment: card.equipment || "", refrigerant: card.refrigerant || "", fromCard: true }
  : params.get("from") === "scan" ? { brand: params.get("brand") || "", model: params.get("model") || "", unitType: params.get("unitType") || "", equipment: params.get("equipment") || "" } : null;
const urlStale = card && params.get("from") === "scan" && ["brand", "model", "unitType"].some((k) => (params.get(k) || "") !== scan[k]);
let choices = scan ? (params.get("choose") || "").split(",").filter((id) => TREES[id]) : [];
if (card && (!choices.length || urlStale)) { const p0 = pickTree(scan, null); choices = p0.certain ? [] : p0.choices; }
let why = "";
let manual = scan ? manualLink(null, scan) : null;
let treeId = TREES[params.get("type")] ? params.get("type") : (TREES[store.get(TYPE_KEY)] ? store.get(TYPE_KEY) : null);
if (scan && (!params.get("type") || urlStale)) treeId = null; // uncertain: ask, don't fall back to the last type
// Card-driven: an explicit ?type= for the same unit (tree jump, reload after a pick) is kept.
const typeFixed = !!(card && TREES[params.get("type")] && !urlStale);
if (card && !treeId) { const p0 = pickTree(scan, null); if (p0.certain) treeId = p0.tree; } // offline-safe first pick
if (treeId) store.set(TYPE_KEY, treeId);
let path = [];
// Error-code step (scan only): "codes" = enter/pick screen, "code" = result screen. One screen at a time.
let codeSet = null, step = scan && /^codes?$/.test(params.get("step")) ? params.get("step") : null, codeQ = params.get("code") || "", codeRow = params.get("row");

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

pick.appendChild(new Option("Choose…", ""));
Object.entries(TREES).forEach(([id, t]) => pick.appendChild(new Option(t.title, id)));
pick.value = treeId || "";
pick.addEventListener("change", () => { treeId = pick.value || null; store.set(TYPE_KEY, treeId); path = treeId ? [TREES[treeId].start] : []; setUrl(); render(); });
function setUrl() {
  if (!scan) { history.replaceState(null, "", treeId ? treeHref(treeId) : "tree.html"); return; }
  const q = new URLSearchParams(location.search); q.delete("choose");
  if (scan.fromCard) { q.set("from", "scan"); ["brand", "model", "unitType", "equipment", "refrigerant"].forEach((k) => (scan[k] ? q.set(k, scan[k]) : q.delete(k))); }
  if (treeId) q.set("type", treeId); else q.delete("type");
  ["step", "code", "row"].forEach((k) => q.delete(k));
  if (step) q.set("step", step);
  if (step === "code" && codeRow != null) q.set("row", codeRow); else if (step === "code" && codeQ) q.set("code", codeQ);
  history.replaceState(null, "", "tree.html?" + q);
}
function choose(id) { treeId = id; store.set(TYPE_KEY, id); pick.value = id; path = [TREES[id].start]; setUrl(); render(); }
if (treeId) path = [TREES[treeId].start];

function unitHeader() {
  const h = el("div", "tree-unit"); h.id = "tree-unit";
  h.appendChild(el("strong", null, [scan.brand, scan.model].filter(Boolean).join(" ") || "Scanned unit"));
  const sub = [scan.serial && "S/N " + scan.serial, scan.refrigerant].filter(Boolean).join(" · ");
  if (sub) h.appendChild(el("small", "tree-unit-sub", sub));
  if (scan.fromCard) h.dataset.source = "call-card";
  if (manual) {
    const a = el("a", "tree-manual", manual.label + " →"); a.id = "tree-manual"; a.href = manual.href; a.dataset.kind = manual.kind;
    if (manual.external) { a.target = "_blank"; a.rel = "noopener"; }
    h.appendChild(a);
    if (manual.kind !== "error-codes" && manual.external && !codeSet) h.appendChild(el("small", "tree-manual-note", "No error-code section is indexed for this model; see the manual."));
  }
  if (codeSet) {
    const b = el("button", "btn btn-secondary tree-codes-step", step ? "← Back to troubleshooting" : "Error codes →"); b.type = "button"; b.id = "tree-codes-step";
    b.addEventListener("click", () => go(step ? null : "codes"));
    h.appendChild(b);
  }
  return h;
}
function go(s, q, row) { step = s; codeQ = q || ""; codeRow = row == null ? null : String(row); setUrl(); render(); window.scrollTo(0, 0); }

// Screen 1: enter or pick a code.
function codesScreen() {
  const c = el("div", "tree-step tree-codes"); c.id = "tree-codes";
  if (codeSet.noTable) {
    c.appendChild(el("p", "tree-no-table", codeSet.noTable.text));
    const a = el("a", "tree-code-src", "Open the manual →"); a.href = codeSet.noTable.url; a.target = "_blank"; a.rel = "noopener"; c.appendChild(a);
    return c;
  }
  if (codeSet.unavailable || !codeSet.rows.length) { c.appendChild(el("p", null, "No codes transcribed for this model yet; see the manual.")); return c; }
  c.appendChild(el("p", null, "Enter the code on the display, or pick it below."));
  const f = el("form", "tree-code-form");
  const inp = el("input"); inp.id = "tree-code-input"; inp.placeholder = "Code, e.g. 11"; inp.autocomplete = "off"; inp.value = codeQ;
  const go1 = el("button", "btn btn-primary", "Look up"); go1.type = "submit";
  f.append(inp, go1);
  f.addEventListener("submit", (e) => { e.preventDefault(); if (inp.value.trim()) go("code", inp.value.trim()); });
  c.appendChild(f);
  const list = el("div", "tree-code-list"); list.id = "tree-code-list";
  const fill = () => {
    list.innerHTML = "";
    const rows = inp.value.trim() ? lookupCode(codeSet, inp.value) : codeSet.rows;
    rows.forEach((r) => { const b = el("button", "btn btn-secondary tree-opt tree-code-opt", rowLabel(r)); b.type = "button"; b.addEventListener("click", () => go("code", null, codeSet.rows.indexOf(r))); list.appendChild(b); });
    if (!rows.length) list.appendChild(el("small", "tree-why", "No match in this manual's table."));
  };
  inp.addEventListener("input", fill); fill();
  c.appendChild(list);
  return c;
}
// Screen 2: the meaning(s), OEM remedy if any, and the source page.
function codeScreen() {
  const c = el("div", "tree-step tree-code"); c.id = "tree-code";
  const picked = codeRow != null && codeSet.rows[+codeRow];
  const rows = picked ? (picked.keys.length ? lookupCode(codeSet, picked.keys[0]) : [picked]) : lookupCode(codeSet, codeQ);
  c.appendChild(el("p", null, picked ? (picked.keys[0] ? "Code " + picked.keys[0] : picked.pattern) : "Code " + codeQ));
  if (!rows.length) c.appendChild(el("p", "tree-why", "No match in this manual's table."));
  if (rows.length > 1) c.appendChild(el("small", "tree-why", rows.length + " meanings in the manual for this code:"));
  rows.forEach((r) => {
    const m = el("div", "tree-code-row");
    if (r.keys.length || !picked) m.appendChild(el("small", "tree-code-pattern", r.pattern));
    m.appendChild(el("p", "tree-code-meaning", r.meaning));
    const flags = r.flags || [];
    if (flags.includes("pattern-blank-in-manual")) m.appendChild(el("small", "tree-flag", "Indicator pattern is blank in the printed table."));
    if (r.remedy) { m.appendChild(el("strong", null, "OEM remedy")); m.appendChild(el("p", "tree-code-remedy", r.remedy)); }
    else m.appendChild(el("small", "tree-code-noremedy", flags.includes("remedy-blank-in-manual") ? "Remedy cell is blank in the printed table." : "The manual gives no remedy for this code."));
    const s = sourceLink(r); const a = el("a", "tree-code-src", s.label + " →"); a.href = s.href; a.target = "_blank"; a.rel = "noopener";
    m.appendChild(a);
    c.appendChild(m);
  });
  const again = el("button", "btn btn-secondary", "Another code"); again.type = "button"; again.id = "tree-code-again";
  again.addEventListener("click", () => go("codes"));
  c.appendChild(again);
  return c;
}

function render() {
  root.innerHTML = "";
  if (scan) root.appendChild(unitHeader());
  if (codeSet && step) { root.appendChild(step === "code" ? codeScreen() : codesScreen()); return; }
  if (!treeId && scan && choices.length) {
    const c = el("div", "tree-step tree-choose"); c.id = "tree-choose";
    c.appendChild(el("p", null, "Which equipment is this?"));
    if (why) c.appendChild(el("small", "tree-why", why));
    choices.forEach((id) => { const b = el("button", "btn btn-secondary tree-opt", TREE_LABELS[id] || TREES[id].title); b.type = "button"; b.dataset.tree = id; b.addEventListener("click", () => choose(id)); c.appendChild(b); });
    root.appendChild(c);
    return;
  }
  if (!treeId) { root.appendChild(el("p", "use-when", "Pick the equipment type to start.")); return; }
  const tree = TREES[treeId];
  document.getElementById("tree-title").textContent = tree.title;
  // Answered steps, newest last.
  const trail = el("ol", "tree-trail");
  path.slice(0, -1).forEach((id, i) => {
    const n = tree.nodes[id];
    const chosen = (n.options || []).find((o) => o.next === path[i + 1]);
    trail.appendChild(el("li", null, n.text.split(/(?<=\?)\s/)[0] + (chosen ? " → " + chosen.label : "")));
  });
  const scanned = !scan && plateLabel(plate);
  if (scanned) {
    const b = el("div", "tree-scanned"); b.id = "tree-scanned";
    b.appendChild(el("strong", null, "Last scanned: ")); b.appendChild(document.createTextNode(scanned));
    root.appendChild(b);
  }
  if (path.length > 1) root.appendChild(trail);
  const node = tree.nodes[path[path.length - 1]];
  const card = el("div", "tree-step" + (node.end ? " tree-end" : ""));
  card.appendChild(el("p", null, node.text));
  const quick = quickLinks(node, known);
  if (quick.length) {
    const ql = el("div", "tree-quick");
    quick.forEach((q) => { const a = el("a", "btn btn-primary tree-quick-link", q.label + " →"); a.href = q.href; a.dataset.tool = q.tool; ql.appendChild(a); });
    card.appendChild(ql);
  }
  if (node.tools && node.tools.length) {
    const tl = el("div", "tree-tools");
    tl.appendChild(el("span", null, "Tools: "));
    node.tools.forEach((t) => { const a = el("a", "chip", (getTool(t) || { title: t }).title); a.href = toolHref(t); tl.appendChild(a); });
    card.appendChild(tl);
  }
  // Reverse flow: this step's answer (or the result) -> the open call's Found/Did notes.
  const stepEntry = treeStepEntry(treeId, tree, path);
  if (stepEntry && hasOpenCall()) {
    const sc = el("div", "tree-add-step");
    mountAddToCall(sc, () => treeStepEntry(treeId, tree, path), { id: "tree-step-add", label: "Add to call notes", chip: true });
    card.appendChild(sc);
  }
  (node.options || []).forEach((o) => {
    const b = el("button", "btn btn-secondary tree-opt", o.label);
    b.type = "button";
    b.addEventListener("click", () => {
      if (o.tree) { location.href = treeHref(o.tree); return; }
      path.push(o.next); render(); window.scrollTo(0, 0);
    });
    card.appendChild(b);
  });
  if (node.end) {
    const log = el("a", "btn btn-secondary tree-log", "Log this in job notes →"); log.id = "tree-log";
    log.href = jobLogHref(treeId, path, plate || {});
    card.appendChild(log);
    mountAddToCall(card, () => ({ field: "found", label: "Tree: " + treeId, text: treeNote(tree, path).replace(/^Troubleshooting — /, "") }), { id: "tree-add-call", label: "Add whole walk to call notes" });
  }
  root.appendChild(card);
  const nav = el("div", "nav-row");
  const back = el("button", "btn btn-secondary", "Back"); back.type = "button"; back.disabled = path.length < 2;
  back.addEventListener("click", () => { path.pop(); render(); });
  const restart = el("button", "btn btn-secondary", "Restart"); restart.type = "button";
  restart.addEventListener("click", () => { path = [tree.start]; render(); });
  nav.append(back, restart);
  root.appendChild(nav);
}
if (card) setUrl();
render();
// Back/forward cache: re-read the card when the page is shown again (the card may have been edited).
addEventListener("pageshow", (e) => { if (e.persisted) location.reload(); });
if (scan) loadManualsIndex().then((index) => {
  const p = pickTree(scan, index);
  manual = manualLink(index, scan); why = p.why;
  const chosen = path.length > 1; // tech already moved on: don't yank the tree
  if (!chosen) {
    if (typeFixed) { /* the tech's (or a tree's) explicit pick for this card's unit: keep it */ }
    else if (p.certain && p.tree !== treeId) { treeId = p.tree; store.set(TYPE_KEY, treeId); pick.value = treeId; path = [TREES[treeId].start]; setUrl(); }
    else if (!p.certain && !params.get("type")) choices = p.choices;
  }
  render();
}).catch(() => { /* offline without the index: keep the link's pick and the Manuals helper link */ });
if (scan) loadErrorCodes().then((data) => { codeSet = findCodeSet(data, scan); if (!codeSet) step = null; render(); }).catch(() => { step = null; render(); });
