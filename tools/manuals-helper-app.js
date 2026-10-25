/** manuals.html: renders the offline manuals helper from the precached index. */
import { loadManualsIndex, brandKey } from "./manuals.js?v=12";
import { searchTerms, portalLinks, LABEL } from "./manuals-helper.js?v=12";

const q = new URLSearchParams(location.search);
const pick = document.getElementById("mh-brand");
const modelIn = document.getElementById("mh-model");
const root = document.getElementById("mh-root");
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

function copy(text, btn) {
  const done = () => { btn.textContent = "Copied"; setTimeout(() => (btn.textContent = "Copy"), 1200); };
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, done); else done();
}

loadManualsIndex().then((index) => {
  pick.appendChild(new Option("Choose brand…", ""));
  Object.keys(index.brands).sort().forEach((b) => pick.appendChild(new Option(b, b)));
  pick.value = brandKey(index, q.get("brand")) || "";
  modelIn.value = (q.get("model") || "").slice(0, 60);
  const render = () => {
    root.innerHTML = "";
    const b = pick.value;
    if (!b) { root.appendChild(el("p", "use-when", "Pick a brand (Bohn, Ruud, Coleman… are listed under their parent).")); return; }
    root.appendChild(el("div", "disclaimer mh-label", LABEL));
    root.appendChild(el("h2", null, "Search terms"));
    const ul = el("ul", "mh-terms");
    searchTerms(index, b, modelIn.value).forEach((t) => {
      const li = el("li"); li.appendChild(el("code", null, t));
      const c = el("button", "btn btn-secondary mh-copy", "Copy"); c.type = "button"; c.addEventListener("click", () => copy(t, c));
      li.appendChild(c); ul.appendChild(li);
    });
    root.appendChild(ul);
    root.appendChild(el("h2", null, "Official portals"));
    const pl = el("ul", "mh-links");
    portalLinks(index, b).forEach((o) => {
      const li = el("li"); const a = el("a", null, o.title); a.href = o.url; a.target = "_blank"; a.rel = "noopener";
      li.appendChild(a); li.appendChild(el("small", null, " " + new URL(o.url).hostname + (o.note ? " — " + o.note : "")));
      pl.appendChild(li);
    });
    root.appendChild(pl);
    root.appendChild(el("p", "footer-note online-only", "Portals open online. Aliases: " + (index.brands[b].aliases || []).join(", ") + "."));
  };
  pick.addEventListener("change", render);
  modelIn.addEventListener("input", render);
  render();
}).catch(() => { root.textContent = "Manuals index unavailable."; });
