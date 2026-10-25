/** manuals.html: renders the offline manuals helper from the precached index. Picking a brand renders its
 *  terms and links immediately (change event); the last scanned plate pre-fills brand/model. */
import { loadManualsIndex, brandKey } from "./manuals.js?v=12";
import { searchTerms, portalLinks, bestLink, allTermsText, LABEL } from "./manuals-helper.js?v=12";
import { getLastPlate } from "./last-plate.js?v=13";

const q = new URLSearchParams(location.search);
const pick = document.getElementById("mh-brand");
const modelIn = document.getElementById("mh-model");
const root = document.getElementById("mh-root");
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

function copy(text, btn) {
  const label = btn.textContent;
  const done = () => { btn.textContent = "Copied"; setTimeout(() => (btn.textContent = label), 1200); };
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, done); else done();
}

loadManualsIndex().then((index) => {
  pick.appendChild(new Option("Choose brand…", ""));
  Object.keys(index.brands).sort().forEach((b) => pick.appendChild(new Option(b, b)));
  // URL params win; otherwise the last scanned plate pre-fills brand + model.
  const plate = getLastPlate() || {};
  const fromPlate = !q.get("brand") && !q.get("model") ? plate : (brandKey(index, q.get("brand")) === brandKey(index, plate.brand) && !q.get("model") ? { model: plate.model } : {});
  pick.value = brandKey(index, q.get("brand") || fromPlate.brand) || "";
  modelIn.value = (q.get("model") || fromPlate.model || "").slice(0, 60);
  if (fromPlate.model && modelIn.value) modelIn.dataset.fromScan = "1";
  const render = () => {
    root.innerHTML = "";
    const b = pick.value;
    if (!b) { root.appendChild(el("p", "use-when", "Pick a brand (Bohn, Ruud, Coleman… are listed under their parent).")); return; }
    root.appendChild(el("div", "disclaimer mh-label", LABEL));
    if (modelIn.dataset.fromScan) root.appendChild(el("p", "footer-note", "Model pre-filled from your last scan — edit if this is a different unit."));
    root.appendChild(el("h2", null, "Search terms"));
    const terms = searchTerms(index, b, modelIn.value);
    const all = el("button", "btn btn-primary mh-copy-all", "Copy search terms"); all.type = "button"; all.id = "mh-copy-all";
    all.addEventListener("click", () => copy(allTermsText(terms), all));
    root.appendChild(all);
    const ul = el("ul", "mh-terms");
    terms.forEach((t) => {
      const li = el("li"); li.appendChild(el("code", null, t));
      const c = el("button", "btn btn-secondary mh-copy", "Copy"); c.type = "button"; c.addEventListener("click", () => copy(t, c));
      li.appendChild(c); ul.appendChild(li);
    });
    root.appendChild(ul);
    root.appendChild(el("h2", null, "Official portals"));
    const pl = el("ul", "mh-links");
    const best = bestLink(index, b, modelIn.value);
    portalLinks(index, b).forEach((o) => {
      const li = el("li");
      if (best && best.url === o.url) { li.className = "mh-best"; li.appendChild(el("span", "mh-best-tag", "Best match: ")); li.title = best.why; } const a = el("a", null, o.title); a.href = o.url; a.target = "_blank"; a.rel = "noopener";
      li.appendChild(a); li.appendChild(el("small", null, " " + new URL(o.url).hostname + (o.note ? " — " + o.note : "")));
      pl.appendChild(li);
    });
    root.appendChild(pl);
    root.appendChild(el("p", "footer-note online-only", "Portals open online. Aliases: " + (index.brands[b].aliases || []).join(", ") + "."));
  };
  pick.addEventListener("change", render);
  modelIn.addEventListener("input", () => { delete modelIn.dataset.fromScan; render(); });
  render();
}).catch(() => { root.textContent = "Manuals index unavailable."; });
