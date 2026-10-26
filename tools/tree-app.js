/** tree.html: walks a troubleshooting tree (tools/trees.js) one step at a time. */
import { TREES, toolHref, treeHref, quickLinks, jobLogHref } from "./trees.js?v=18";
import { getTool } from "./registry.js";
import { getLastPlate, plateLabel, nominalVoltage } from "./last-plate.js?v=18";
import { pickTree, manualLink, TREE_LABELS } from "./tree-pick.js?v=18";
import { loadManualsIndex } from "./manuals.js?v=18";

const params = new URLSearchParams(location.search);
const TYPE_KEY = "serviceTechTreeType_v1"; // last equipment type picked here
const store = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) { /* ignore */ } } };
const plate = getLastPlate(); // last scanned plate (call card / nameplate tool)
const known = { refrigerant: plate && plate.refrigerant, nominalV: nominalVoltage(plate && plate.voltage), rla: plate && plate.rla };
if (params.get("refrigerant")) known.refrigerant = params.get("refrigerant");
const pick = document.getElementById("tree-pick");
const root = document.getElementById("tree-root");
// Opened from a scan: brand/model/unit type ride along; the tree is re-picked against the manuals index.
const scan = params.get("from") === "scan" ? { brand: params.get("brand") || "", model: params.get("model") || "", unitType: params.get("unitType") || "", equipment: params.get("equipment") || "" } : null;
let choices = scan ? (params.get("choose") || "").split(",").filter((id) => TREES[id]) : [];
let why = "";
let manual = scan ? manualLink(null, scan) : null;
let treeId = TREES[params.get("type")] ? params.get("type") : (TREES[store.get(TYPE_KEY)] ? store.get(TYPE_KEY) : null);
if (scan && !params.get("type")) treeId = null; // uncertain: ask, don't fall back to the last type
if (treeId) store.set(TYPE_KEY, treeId);
let path = [];

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

pick.appendChild(new Option("Choose…", ""));
Object.entries(TREES).forEach(([id, t]) => pick.appendChild(new Option(t.title, id)));
pick.value = treeId || "";
pick.addEventListener("change", () => { treeId = pick.value || null; store.set(TYPE_KEY, treeId); path = treeId ? [TREES[treeId].start] : []; setUrl(); render(); });
function setUrl() {
  if (!scan) { history.replaceState(null, "", treeId ? treeHref(treeId) : "tree.html"); return; }
  const q = new URLSearchParams(location.search); q.delete("choose");
  if (treeId) q.set("type", treeId); else q.delete("type");
  history.replaceState(null, "", "tree.html?" + q);
}
function choose(id) { treeId = id; store.set(TYPE_KEY, id); pick.value = id; path = [TREES[id].start]; setUrl(); render(); }
if (treeId) path = [TREES[treeId].start];

function unitHeader() {
  const h = el("div", "tree-unit"); h.id = "tree-unit";
  h.appendChild(el("strong", null, [scan.brand, scan.model].filter(Boolean).join(" ") || "Scanned unit"));
  if (manual) {
    const a = el("a", "tree-manual", manual.label + " →"); a.id = "tree-manual"; a.href = manual.href; a.dataset.kind = manual.kind;
    if (manual.external) { a.target = "_blank"; a.rel = "noopener"; }
    h.appendChild(a);
    if (manual.kind !== "error-codes" && manual.external) h.appendChild(el("small", "tree-manual-note", "No error-code section indexed for this model — codes are in the manual."));
  }
  return h;
}

function render() {
  root.innerHTML = "";
  if (scan) root.appendChild(unitHeader());
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
render();
if (scan) loadManualsIndex().then((index) => {
  const p = pickTree(scan, index);
  manual = manualLink(index, scan); why = p.why;
  const chosen = path.length > 1; // tech already moved on: don't yank the tree
  if (!chosen) {
    if (p.certain && p.tree !== treeId) { treeId = p.tree; store.set(TYPE_KEY, treeId); pick.value = treeId; path = [TREES[treeId].start]; setUrl(); }
    else if (!p.certain && !params.get("type")) choices = p.choices;
  }
  render();
}).catch(() => { /* offline without the index: keep the link's pick and the Manuals helper link */ });
