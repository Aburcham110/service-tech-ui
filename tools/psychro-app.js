/* psychro.html: 4 steps (Return, Supply, Air, Results). Values persist on this phone. */
import { evaluate, pointRows, copyText } from "./psychro-ui.js?v=34";
import { buildChart } from "./psychro-chart.js?v=34";
import { prefillFromQuery } from "./psychro-link.js?v=34";

const STEPS = ["return", "supply", "air", "results"];
const FIELDS = ["retDb", "retHumMode", "retHum", "supDb", "supHumMode", "supHum", "pressureMode", "pressureValue", "cfm", "airflowAt", "tesp", "ratedTons"];
const KEY = "st-psychro-form";
const $ = (id) => document.getElementById(id);
let step = 0;

function form() { const f = {}; for (const k of FIELDS) f[k] = $(k).value; return f; }
function save() { try { localStorage.setItem(KEY, JSON.stringify(form())); } catch (e) {} }
function load() { try { const f = JSON.parse(localStorage.getItem(KEY) || "{}"); for (const k of FIELDS) if (f[k] !== undefined) $(k).value = f[k]; } catch (e) {} }
function labels() {
  for (const s of ["ret", "sup"]) $(s + "HumLabel").textContent = (s === "ret" ? "Return " : "Supply ") + ($(s + "HumMode").value === "wb" ? "wet bulb (°F)" : "RH (%)");
  $("pressureLabel").textContent = { altitudeFt: "Altitude (ft)", inHg: "Barometer (inHg)", psia: "Barometer (psia)" }[$("pressureMode").value];
}
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const fmt0 = (x) => Math.round(x).toLocaleString("en-US");

function table(rows, id) {
  const t = el("table", "psy-table"); if (id) t.id = id;
  for (const [l, v, key] of rows) { const tr = el("tr"); if (key) tr.dataset.k = key; tr.append(el("th", "", l), el("td", "", v)); t.append(tr); }
  return t;
}

let lowTemp = false, zoomed = false;
function chartBlock(ev) {
  const wrap = el("div", "psy-chart-wrap" + (zoomed ? " zoom" : "")); wrap.id = "psy-chart-wrap";
  const bar = el("div", "psy-chart-bar");
  const lt = el("label", "check"); const cb = el("input"); cb.type = "checkbox"; cb.id = "psy-lowtemp"; cb.checked = lowTemp;
  cb.addEventListener("change", () => { lowTemp = cb.checked; render(); });
  lt.append(cb, el("span", "", "Low-temp range (to −20 °F)"));
  const zb = el("button", "btn btn-secondary psy-zoom-btn", zoomed ? "Close full screen" : "⤢ Full screen"); zb.type = "button"; zb.id = "psy-zoom";
  zb.addEventListener("click", () => { zoomed = !zoomed; render(); if (zoomed) document.getElementById("psy-chart-wrap").scrollIntoView(); });
  bar.append(lt, zb);
  const box = el("div", "psy-chart-box"); box.innerHTML = buildChart(ev.a.psia, { ret: ev.a.ret, sup: ev.a.sup }, { lowTemp }).svg;
  box.addEventListener("click", () => { if (!zoomed) { zoomed = true; render(); } });
  wrap.append(bar, box);
  if (zoomed) wrap.append(el("p", "footer-note", "Scroll or pinch to look around. Tap Close full screen when done."));
  return wrap;
}

function render() {
  const out = $("psy-results"); out.textContent = "";
  const ev = evaluate(form());
  $("psy-copy").hidden = !ev.ok;
  if (!ev.ok) {
    const box = el("div", "psy-warn"); box.id = "psy-problems";
    box.append(el("strong", "", "Fix these first:")); const ul = el("ul"); for (const p of ev.problems) ul.append(el("li", "", p)); box.append(ul);
    out.append(box); return ev;
  }
  const a = ev.a;
  if (ev.warnings.length) { const box = el("div", "psy-warn"); box.id = "psy-warnings"; box.append(el("strong", "", "Check probes:")); const ul = el("ul"); for (const w of ev.warnings) ul.append(el("li", "", w)); box.append(ul); out.append(box); }
  out.append(chartBlock(ev));
  out.append(el("h2", "psy-h", "Capacity"));
  if (ev.capacity) {
    const rows = [];
    ev.capacity.totals.forEach((t, i) => rows.push([`Total${i === 0 ? "" : " (alt.)"}: ${t.label}`, `${fmt0(t.btuh)} Btu/h · ${t.tons.toFixed(2)} tons`, "total-" + t.key]));
    rows.push([a.sensibleLabel.replace("Standard air", "Sensible, standard air"), fmt0(a.sensibleStd) + " Btu/h", "sensible"],
      [a.latentLabel.replace("Standard air", "Latent, standard air"), fmt0(a.latentStd) + " Btu/h", "latent"],
      ["SHR (default): sensible ÷ standard-air total", a.shrAll.std.toFixed(2), "shr"],
      ["SHR (alternative): sensible ÷ (sensible + latent)", a.shrAll.sum.toFixed(2), "shr-alt"],
      [`Airflow (measured in ${a.airflowAt} air)`, fmt0(a.cfm) + " cfm", "cfm"],
      ["cfm per measured ton", fmt0(ev.cfmPerMeasuredTon) + " cfm/ton", "cfm-ton"]);
    if (ev.cfmPerRatedTon) rows.push([`cfm per rated ton (${ev.ratedTons} tons)`, fmt0(ev.cfmPerRatedTon) + " cfm/ton", "cfm-rated-ton"]);
    if (Number.isFinite(ev.tesp)) rows.push(["TESP", ev.tesp + " inH₂O", "tesp"]);
    out.append(table(rows, "psy-capacity"));
  } else out.append(el("p", "tool-meta", "Enter cfm on the Air step to get Btu/h, tons and SHR."));
  out.append(table([["ΔT (split)", a.dT.toFixed(1) + " °F", "dT"], ["Δh", a.dh.toFixed(2) + " Btu/lb", "dh"], ["ΔW", a.dGrains.toFixed(1) + " gr/lb", "dW"],
    ["Coil leaving dew point", a.coilLeavingDewPoint.toFixed(1) + " °F", "coil-dp"],
    ["Pressure", a.psia.toFixed(3) + " psia" + (ev.pressureEntered ? "" : " (blank = sea level)"), "psia"]], "psy-deltas"));
  for (const [k, n] of [["ret", "Return"], ["sup", "Supply"]]) { out.append(el("h2", "psy-h", n)); out.append(table(pointRows(a[k]), "psy-" + k)); }
  if (ev.hints.length) {
    const box = el("div", "psy-hints"); box.id = "psy-hints"; box.append(el("strong", "", "Notes (cited):"));
    const ul = el("ul"); for (const h of ev.hints) { const li = el("li", "", h.text + " "); const link = el("a", "", "Source: " + h.source); link.href = h.url; link.target = "_blank"; link.rel = "noopener"; li.append(link); ul.append(li); }
    box.append(ul); out.append(box);
  }
  return ev;
}

function go(i) {
  step = Math.max(0, Math.min(STEPS.length - 1, i));
  STEPS.forEach((s, j) => { $("panel-" + s).classList.toggle("hidden", j !== step);
    const pill = document.querySelector(`.step-pill[data-step="${s}"]`); pill.classList.toggle("active", j === step); pill.classList.toggle("done", j < step); });
  $("psy-back").disabled = step === 0;
  $("psy-next").textContent = step === STEPS.length - 2 ? "See results" : step === STEPS.length - 1 ? "Start over" : "Next";
  if (STEPS[step] === "results") render();
  window.scrollTo(0, 0);
}

load();
const fromCall = prefillFromQuery(location.search);
if (fromCall) {
  for (const [k, v] of Object.entries(fromCall)) $(k).value = v;
  save();
  const b = $("psy-from-call"); b.hidden = false;
  const missing = ["ret", "sup"].filter((s) => s + "Db" in fromCall && fromCall[s + "Hum"] === "").map((s) => (s === "ret" ? "return" : "supply"));
  $("psy-from-call-note").textContent = "Dry bulb filled from the call." + (missing.length ? " Add " + missing.join(" and ") + " RH (%) or wet bulb (°F)." : " Humidity filled too.");
  history.replaceState(null, "", "psychro.html?from=call");
}
if (new URLSearchParams(location.search).get("from") === "call") $("psy-from-call").hidden = false;
labels();
for (const k of FIELDS) $(k).addEventListener("input", () => { labels(); save(); });
for (const k of FIELDS) $(k).addEventListener("change", () => { labels(); save(); if (STEPS[step] === "results") render(); });
document.querySelectorAll(".step-pill").forEach((p) => p.addEventListener("click", () => go(STEPS.indexOf(p.dataset.step))));
$("psy-back").addEventListener("click", () => go(step - 1));
$("psy-next").addEventListener("click", () => {
  if (step === STEPS.length - 1) { for (const k of ["retDb", "retHum", "supDb", "supHum", "cfm", "tesp"]) $(k).value = ""; save(); go(0); }
  else go(step + 1);
});
$("psy-copy").addEventListener("click", async () => {
  const t = copyText(evaluate(form())); if (!t) return;
  try { await navigator.clipboard.writeText(t); $("psy-copy").textContent = "✓ Copied"; } catch (e) { $("psy-copy").textContent = "Copy failed"; }
  setTimeout(() => { $("psy-copy").textContent = "Copy results"; }, 1500);
});
go(0);
