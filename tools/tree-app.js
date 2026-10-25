/** tree.html: walks a troubleshooting tree (tools/trees.js) one step at a time. */
import { TREES, toolHref, treeHref } from "./trees.js?v=10";
import { getTool } from "./registry.js";

const params = new URLSearchParams(location.search);
const pick = document.getElementById("tree-pick");
const root = document.getElementById("tree-root");
let treeId = TREES[params.get("type")] ? params.get("type") : null;
let path = [];

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

pick.appendChild(new Option("Choose…", ""));
Object.entries(TREES).forEach(([id, t]) => pick.appendChild(new Option(t.title, id)));
pick.value = treeId || "";
pick.addEventListener("change", () => { treeId = pick.value || null; path = treeId ? [TREES[treeId].start] : []; history.replaceState(null, "", treeId ? treeHref(treeId) : "tree.html"); render(); });
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
