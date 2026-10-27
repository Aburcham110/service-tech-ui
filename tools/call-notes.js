/** Reverse flow: trees and toolkit results write back into the open call card draft (app.js, serviceTechCallDraft_v1).
 *  Every write goes through writeDraft(): read -> normalize to the draft schema -> change -> save. Text is only
 *  ever appended (labeled, timestamped lines), duplicates are skipped, and readings are filled only when empty
 *  unless the tech confirms an overwrite. Pure helpers + one DOM mount. */
export const DRAFT_KEY = "serviceTechCallDraft_v1"; // app.js STORAGE_KEY
const AUTO = ["step", "techName", "startDate", "startTime", "endDate", "endTime", "partsList"]; // stamped/remembered, not typed
const DEFAULTS = { equipment: "cooler", photosReady: false, partsList: "[]" };
/** app.js defaultDraft() fields (techName comes from the phone, so "" here). */
export const SCHEMA = {
  step: "open", workOrder: "", techName: "", startDate: "", startTime: "", endDate: "", endTime: "",
  site: "", equipment: "cooler", symptom: "", refrigerant: "", plate: "", photosReady: false,
  suctionPsig: "", suctionTemp: "", liquidPsig: "", liquidTemp: "",
  supplyTemp: "", returnTemp: "", amps: "", fla: "", voltage: "",
  did: "", found: "", stillSeeing: "", fixed: "", partsUsed: "", partsList: "[]",
};
export const NOTE_FIELDS = { found: "Found", did: "Did", stillSeeing: "Still seeing" };
export const READING_FIELDS = { refrigerant: "Refrigerant", suctionPsig: "Suction psig", suctionTemp: "Suction line °F", liquidPsig: "Liquid psig", liquidTemp: "Liquid line °F", supplyTemp: "Supply air °F", returnTemp: "Return air °F" };

/** A call is open when its draft has anything typed in it (same rule as Home's "Resume last call"). */
export function callOpen(d) {
  if (!d || typeof d !== "object" || Array.isArray(d)) return false;
  const rows = (() => { try { return JSON.parse(d.partsList || "[]").length; } catch (e) { return 0; } })();
  return rows > 0 || Object.keys(d).some((k) => !AUTO.includes(k) && d[k] !== "" && d[k] != null && d[k] !== false && d[k] !== DEFAULTS[k]);
}

/** Schema-valid copy: every app.js field present with its type (strings stay strings); unknown keys kept. */
export function normalizeDraft(d) {
  const src = d && typeof d === "object" && !Array.isArray(d) ? d : {};
  const out = Object.assign({}, src);
  for (const [k, def] of Object.entries(SCHEMA)) {
    const v = src[k];
    if (typeof def === "boolean") out[k] = v === true || v === "true";
    else out[k] = v == null || typeof v === "object" ? def : String(v);
  }
  try { if (!Array.isArray(JSON.parse(out.partsList))) out.partsList = "[]"; } catch (e) { out.partsList = "[]"; }
  if (!["open", "readings", "mid", "close"].includes(out.step)) out.step = "open";
  return out;
}

const hm = (now) => String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
/** "[22:41 Tree: walk-in] Evap fan not running → check fan motor" */
export function stampLine(label, text, now = new Date()) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  return t ? "[" + hm(now) + " " + label + "] " + t : "";
}
const sameNote = (line) => String(line).trim().replace(/^\[\d\d:\d\d /, "[");

/** Append `line` to a note field on its own line. Never edits existing text; an identical note (time ignored) is skipped. */
export function appendLine(d, field, line) {
  if (!NOTE_FIELDS[field]) throw new Error("not a note field: " + field);
  const t = String(line || "").trim();
  const base = String((d && d[field]) || "").replace(/\s+$/, "");
  if (!t) return { draft: d, added: false, reason: "empty" };
  if (base.split("\n").some((l) => sameNote(l) === sameNote(t))) return { draft: d, added: false, reason: "duplicate" };
  return { draft: Object.assign({}, d, { [field]: (base ? base + "\n" : "") + t }), added: true };
}
/** v35 API: append to Found (kept for callers/tests). */
export function appendNote(d, text) { return appendLine(Object.assign({}, d), "found", text).draft; }

/** Fill readings: empty fields are filled; differing values are conflicts unless overwrite. Same value = no-op. */
export function fillReadings(d, vals, { overwrite = false } = {}) {
  const draft = Object.assign({}, d), filled = [], conflicts = [];
  for (const [k, v] of Object.entries(vals || {})) {
    if (!READING_FIELDS[k] || v == null || String(v).trim() === "") continue;
    const nv = String(v).trim(), old = String(draft[k] == null ? "" : draft[k]).trim();
    if (old === nv) continue;
    if (old && !overwrite) { conflicts.push({ key: k, label: READING_FIELDS[k], old, value: nv }); continue; }
    draft[k] = nv; filled.push(k);
  }
  return { draft, filled, conflicts };
}

/** The one write path: read, refuse without an open call, normalize, change, save. change(d) -> {draft, ...}. */
export function writeDraft(storage, change) {
  let raw = null;
  try { raw = JSON.parse(storage.getItem(DRAFT_KEY) || "null"); } catch (e) { raw = null; }
  if (!callOpen(raw)) return { ok: false, reason: "no-draft" };
  const res = change(normalizeDraft(raw)) || {};
  const draft = normalizeDraft(res.draft || raw);
  try { storage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch (e) { return Object.assign({}, res, { ok: false, reason: "save-failed" }); }
  return Object.assign({}, res, { ok: true, draft });
}

/** One entry -> draft: optional readings (with overwrite guard) + one labeled line in entry.field. */
export function applyEntry(d, entry, { overwrite = false, now = new Date() } = {}) {
  let draft = d, filled = [], conflicts = [];
  if (entry.readings) ({ draft, filled, conflicts } = fillReadings(draft, entry.readings, { overwrite }));
  const r = appendLine(draft, entry.field || "found", stampLine(entry.label, entry.text, now));
  return { draft: r.draft, added: r.added, reason: r.reason, filled, conflicts };
}

const firstQ = (t) => String(t).split(/(?<=\?)\s/)[0];
const firstSentence = (t) => { const s = String(t).match(/^.*?[.!?](?=\s|$)/); return (s ? s[0] : String(t)).trim(); };
/** Current tree screen as an entry: the last answer ("Q → answer"), or on a result the answer → result.
 *  Steps that send you to a tool/measurement are things you did -> Did; answers and results are findings -> Found. */
export function treeStepEntry(treeId, tree, path) {
  if (!tree || !path || !path.length) return null;
  const node = tree.nodes[path[path.length - 1]];
  const prevId = path.length > 1 ? path[path.length - 2] : null, prev = prevId && tree.nodes[prevId];
  const opt = prev && (prev.options || []).find((o) => o.next === path[path.length - 1]);
  const ans = prev ? firstQ(prev.text) + (opt ? " → " + opt.label : "") : "";
  if (node && node.end) return { field: "found", label: "Tree: " + treeId, text: (ans ? ans + " → " : "") + firstSentence(node.text) };
  if (!ans) return null;
  return { field: prev.tools && prev.tools.length ? "did" : "found", label: "Tree: " + treeId, text: ans };
}

/** Whole tree walk: "Title: step → answer; …; result" (kept from v35). */
export function treeNote(tree, path) {
  if (!tree || !path || !path.length) return "";
  const steps = [];
  path.slice(0, -1).forEach((id, i) => {
    const n = tree.nodes[id]; if (!n) return;
    const o = (n.options || []).find((x) => x.next === path[i + 1]);
    steps.push(firstQ(n.text) + (o ? " → " + o.label : ""));
  });
  const last = tree.nodes[path[path.length - 1]];
  if (last && last.end) steps.push(last.text);
  return "Troubleshooting — " + tree.title + ": " + steps.join("; ");
}

/** Toolkit tools whose results belong on a call, and the note field they go to. */
export const CALL_TOOLS = {
  "superheat-subcool": "found", "airflow-delta-t": "found", "psychrometrics": "found", "compressor-diag": "found",
  "txv-eev": "found", "electrical": "found", "duct-static": "found", "defrost-checklist": "found",
  "nameplate-faults": "found", "charge-recovery": "did", "vacuum-coach": "did",
};
const NOISE = /^(note|verify|tip|educational)\b|^\[approx\]|^---|^need |^(mode|tool|system): /i;
/** Key result lines: "Label: value" lines (units kept), minus notes/caveats; checklists add their first 3 steps. */
export function toolKeyLines(lines) {
  const ls = (Array.isArray(lines) ? lines : String(lines || "").split("\n")).map((s) => String(s).trim()).filter(Boolean);
  const kv = ls.filter((l) => /^[^:]{1,40}:\s*\S/.test(l) && !NOISE.test(l));
  const steps = ls.filter((l) => /^\d+\.\s/.test(l)).slice(0, 3);
  return kv.concat(steps);
}
/** Tool result as a call entry; SH/SC also carries its inputs for the Readings step. */
export function toolEntry(tool, fields, lines) {
  if (!tool || !CALL_TOOLS[tool.id]) return null;
  const key = toolKeyLines(lines);
  if (!key.length) return null;
  const e = { field: CALL_TOOLS[tool.id], label: "Tool: " + tool.title, text: key.join(" · ") };
  if (tool.id === "superheat-subcool" && fields) {
    e.readings = { refrigerant: fields.refrigerant };
    if (fields.mode !== "subcool") Object.assign(e.readings, { suctionPsig: fields.suctionPsig, suctionTemp: fields.suctionTemp });
    if (fields.mode !== "superheat") Object.assign(e.readings, { liquidPsig: fields.liquidPsig, liquidTemp: fields.liquidTemp });
  }
  return e;
}
/** psychro.html results (copyText) -> short entry; dry bulbs also fill empty Supply/Return air. */
export function psychroEntry(text, f) {
  const ls = String(text || "").split("\n").map((l) => l.trim()).filter(Boolean);
  const pick = [];
  for (const side of ["Return", "Supply"]) {
    const l = ls.find((x) => x.startsWith(side + ": ")); if (!l) continue;
    const parts = l.slice(side.length + 2).split(", ").filter((x) => /^(Dry bulb|Wet bulb|RH) /.test(x));
    pick.push(side + " " + parts.join(", "));
  }
  for (const re of [/^ΔT /, /^Total /, /^SHR /, /^Airflow /]) { const l = ls.find((x) => re.test(x)); if (l) pick.push(l.split(" - ")[0]); }
  if (!pick.length) return null;
  return { field: "found", label: "Tool: Psychrometrics", text: pick.join(" · "), readings: f ? { returnTemp: f.retDb, supplyTemp: f.supDb } : undefined };
}
/** v35 API. */
export function toolNote(title, text) {
  const lines = String(text || "").split("\n").map((s) => s.trim()).filter(Boolean);
  return lines.length ? title + ": " + lines.join(" · ") : "";
}

function toast(msg) {
  let t = document.getElementById("toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add("show"); clearTimeout(t._timer); t._timer = setTimeout(() => t.classList.remove("show"), 1800);
}
const readRaw = () => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); } catch (e) { return null; } };
export const hasOpenCall = () => callOpen(readRaw());

/** Button (or chip) + status in `host`. getEntry() -> {field,label,text,readings?} | null.
 *  No open call: a hint with "Start a call →" instead, and null is returned. */
export function mountAddToCall(host, getEntry, { id = "add-to-call", label = "Add to current call notes", chip = false } = {}) {
  if (!host) return null;
  if (!hasOpenCall()) {
    if (host.querySelector(".add-to-call-hint")) return null;
    const h = document.createElement("p"); h.className = "footer-note add-to-call-hint"; h.id = id + "-hint";
    h.append("No open call — results can't be added. ");
    const a = document.createElement("a"); a.href = "call.html"; a.textContent = "Start a call →"; h.appendChild(a);
    host.appendChild(h);
    return null;
  }
  const b = document.createElement("button"); b.type = "button"; b.id = id;
  b.className = chip ? "chip add-to-call add-to-call-chip" : "btn btn-secondary add-to-call";
  b.textContent = (chip ? "＋ " : "") + label;
  const st = document.createElement("p"); st.className = "footer-note add-to-call-status"; st.id = id + "-status"; st.setAttribute("role", "status");
  const say = (msg, link) => {
    st.textContent = msg + " ";
    if (link) { const a = document.createElement("a"); a.href = "call.html"; a.className = "back-to-call"; a.textContent = "← Back to call"; st.appendChild(a); }
  };
  b.addEventListener("click", () => {
    const entry = getEntry();
    if (!entry || !entry.text) { say("Nothing to add yet."); return; }
    const now = new Date();
    let res = writeDraft(localStorage, (d) => {
      const r = applyEntry(d, entry, { now });
      if (r.conflicts.length) {
        const list = r.conflicts.map((c) => c.label + ": " + c.old + " → " + c.value).join("\n");
        if (confirm("The call card already has different readings:\n" + list + "\n\nReplace them?")) return applyEntry(d, entry, { now, overwrite: true });
      }
      return r;
    });
    if (!res.ok) { say(res.reason === "no-draft" ? "No open call." : "Could not save to the call."); if (res.reason === "no-draft") b.hidden = true; return; }
    const where = NOTE_FIELDS[entry.field || "found"];
    const parts = [];
    if (res.filled.length) parts.push("Readings filled: " + res.filled.map((k) => READING_FIELDS[k]).join(", ") + ".");
    if (res.conflicts.length && !res.filled.some((k) => res.conflicts.find((c) => c.key === k))) parts.push("Kept the card's readings for " + res.conflicts.map((c) => c.label).join(", ") + ".");
    parts.unshift(res.added ? "✓ Added to the call's " + where + " notes (Mid step)." : "Already in the call's " + where + " notes.");
    say(parts.join(" "), true);
    toast(res.added || res.filled.length ? "Added to call" : "Already in call notes");
  });
  host.append(b, st);
  return b;
}
