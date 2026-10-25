/** tree.html: walks a troubleshooting tree (tools/trees.js) one step at a time. */
import { TREES, toolHref, treeHref, quickLinks } from "./trees.js?v=12";
import { getTool } from "./registry.js";

const params = new URLSearchParams(location.search);
const TYPE_KEY = "serviceTechTreeType_v1"; // last equipment type picked here
const SCAN_KEY = "serviceTechLastScan_v1"; // last confirmed plate scan (call card / nameplate tool)
const store = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) { /* ignore */ } } };
let known = {};
try { known = JSON.parse(store.get(SCAN_KEY) || "{}") || {}; } catch (e) { /* ignore */ }
if (params.get("refrigerant")) known.refrigerant = params.get("refrigerant");
const pick = document.getElementById("tree-pick");
const root = document.getElementById("tree-root");
let treeId = TREES[params.get("type")] ? params.get("type") : (TREES[store.get(TYPE_KEY)] ? store.get(TYPE_KEY) : null);
if (treeId) store.set(TYPE_KEY, treeId);
let path = [];

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

pick.appendChild(new Option("Choose…", ""));
Object.entries(TREES).forEach(([id, t]) => pick.appendChild(new Option(t.title, id)));
pick.value = treeId || "";
pick.addEventListener("change", () => { treeId = pick.value || null; store.set(TYPE_KEY, treeId); path = treeId ? [TREES[treeId].start] : []; history.replaceState(null, "", treeId ? treeHref(treeId) : "tree.html"); render(); });
if (treeId) path = [TREES[treeId].start];

function render() {
  root.innerHTML = "";
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
