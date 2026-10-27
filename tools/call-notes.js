/** "Add to current call notes" from trees and toolkit results. Appends to the open call's Mid "Found" notes
 *  (app.js draft, serviceTechCallDraft_v1). Only shown when a call is open. Pure helpers + one DOM mount. */
export const DRAFT_KEY = "serviceTechCallDraft_v1"; // app.js STORAGE_KEY
const AUTO = ["step", "techName", "startDate", "startTime", "endDate", "endTime", "partsList"]; // stamped/remembered, not typed
const DEFAULTS = { equipment: "cooler", photosReady: false, partsList: "[]" };

/** A call is open when its draft has anything typed in it (same rule as Home's "Resume last call"). */
export function callOpen(d) {
  if (!d || typeof d !== "object") return false;
  const rows = (() => { try { return JSON.parse(d.partsList || "[]").length; } catch (e) { return 0; } })();
  return rows > 0 || Object.keys(d).some((k) => !AUTO.includes(k) && d[k] !== "" && d[k] != null && d[k] !== false && d[k] !== DEFAULTS[k]);
}

/** Draft with `text` appended to Found on its own line(s). */
export function appendNote(d, text) {
  const t = String(text || "").trim();
  const base = String((d && d.found) || "").replace(/\s+$/, "");
  return Object.assign({}, d, { found: t ? (base ? base + "\n" : "") + t : base });
}

/** Tree walk as a note: "Troubleshooting — Title: step → answer; …; result". */
export function treeNote(tree, path) {
  if (!tree || !path || !path.length) return "";
  const steps = [];
  path.slice(0, -1).forEach((id, i) => {
    const n = tree.nodes[id]; if (!n) return;
    const o = (n.options || []).find((x) => x.next === path[i + 1]);
    steps.push(n.text.split(/(?<=\?)\s/)[0] + (o ? " → " + o.label : ""));
  });
  const last = tree.nodes[path[path.length - 1]];
  if (last && last.end) steps.push(last.text);
  return "Troubleshooting — " + tree.title + ": " + steps.join("; ");
}

/** Tool result as a note: "Tool title: line · line". */
export function toolNote(title, text) {
  const lines = String(text || "").split("\n").map((s) => s.trim()).filter(Boolean);
  return lines.length ? title + ": " + lines.join(" · ") : "";
}

const read = () => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); } catch (e) { return null; } };

/** Button + status in `host`. getText() -> note text ("" = nothing to add yet). Hidden unless a call is open. */
export function mountAddToCall(host, getText, { id = "add-to-call" } = {}) {
  if (!host || !callOpen(read())) return null;
  const b = document.createElement("button"); b.type = "button"; b.className = "btn btn-secondary add-to-call"; b.id = id;
  b.textContent = "Add to current call notes";
  const st = document.createElement("p"); st.className = "footer-note add-to-call-status"; st.id = id + "-status"; st.setAttribute("role", "status");
  b.addEventListener("click", () => {
    const text = getText(); const d = read();
    if (!text) { st.textContent = "Nothing to add yet."; return; }
    if (!callOpen(d)) { st.textContent = "No open call."; b.hidden = true; return; }
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(appendNote(d, text))); } catch (e) { st.textContent = "Could not save to the call."; return; }
    st.innerHTML = ""; st.append("✓ Added to the call's Found notes (Mid step). ");
    const a = document.createElement("a"); a.href = "call.html"; a.textContent = "Open call →"; st.appendChild(a);
    let t = document.getElementById("toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; document.body.appendChild(t); }
    t.textContent = "Added to call notes"; t.classList.add("show"); clearTimeout(t._timer); t._timer = setTimeout(() => t.classList.remove("show"), 1800);
  });
  host.append(b, st);
  return b;
}
