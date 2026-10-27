/** Mount interactive tool UI from ?id= */
import { getTool } from "./registry.js";
import { runTool } from "./logic.js?v=39";
import { applyPrefill } from "./prefill.js?v=39";
import { mountAddToCall, toolEntry, CALL_TOOLS } from "./call-notes.js?v=39";

function $(sel, el) { return (el || document).querySelector(sel); }

function toast(msg) {
  let t = $("#toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    t.className = "toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 1800);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied");
  } catch (_) {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    toast("Copied");
  }
}

function qsId() {
  const q = new URLSearchParams(location.search);
  return (q.get("id") || "").trim();
}

function readFields(root) {
  const out = {};
  root.querySelectorAll("[data-field]").forEach((el) => {
    out[el.dataset.field] = el.type === "checkbox" ? el.checked : el.value;
  });
  return out;
}

function renderField(f) {
  const lab = document.createElement("label");
  lab.className = "field";
  const span = document.createElement("span");
  span.textContent = f.label;
  lab.appendChild(span);
  let input;
  if (f.type === "select") {
    input = document.createElement("select");
    (f.options || []).forEach(([val, label]) => {
      const o = document.createElement("option");
      o.value = val;
      o.textContent = label;
      input.appendChild(o);
    });
  } else if (f.type === "textarea") {
    input = document.createElement("textarea");
  } else {
    input = document.createElement("input");
    input.type = f.type === "number" ? "number" : "text";
    if (f.step) input.step = f.step;
    input.inputMode = f.type === "number" ? "decimal" : "text";
  }
  input.dataset.field = f.name;
  if (f.value != null && f.value !== "") input.value = f.value;
  if (f.name === "date" && !input.value) {
    input.value = new Date().toISOString().slice(0, 10);
  }
  lab.appendChild(input);
  return lab;
}

function showOut(el, result) {
  const text = (result.lines || []).join("\n");
  el.textContent = text;
  el.dataset.copy = text;
}

function mount(tool) {
  document.title = tool.title + " — Service Tech";
  $("#tool-title").textContent = tool.title;
  $("#tool-use").textContent = "Use when: " + tool.useWhen;
  const disc = $("#tool-disclaimer");
  disc.textContent = tool.disclaimer;
  disc.classList.toggle("hard", !!tool.hardDisclaimer);
  const cli = $("#cli-link");
  cli.href = "https://github.com/Aburcham110/" + tool.repo;
  cli.textContent = "CLI on GitHub ↗";

  const root = $("#tool-root");
  root.innerHTML = "";
  const scanHost = document.createElement("div");
  root.appendChild(scanHost);
  const form = document.createElement("div");
  form.id = "tool-form";
  tool.fields.forEach((f) => form.appendChild(renderField(f)));
  root.appendChild(form);
  applyPrefill(form, tool.fields, new URLSearchParams(location.search)); // e.g. refrigerant from a scan via a tree step

  const actions = document.createElement("div");
  actions.className = "tool-actions";
  const calc = document.createElement("button");
  calc.type = "button";
  calc.className = "btn btn-primary";
  calc.textContent = tool.kind === "checklist" ? "Generate" : "Calculate";
  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "btn btn-copy";
  copyBtn.textContent = "Copy result";
  copyBtn.disabled = true;
  actions.appendChild(calc);
  actions.appendChild(copyBtn);
  root.appendChild(actions);

  const out = document.createElement("pre");
  out.className = "out";
  out.id = "tool-out";
  root.appendChild(out);
  const addHost = document.createElement("div");
  root.appendChild(addHost);
  addHost.className = "tool-add-call-host";
  // Reverse flow: key outputs (with units) -> the open call; SH/SC also fills empty Readings.
  const add = CALL_TOOLS[tool.id] ? mountAddToCall(addHost, () => toolEntry(tool, readFields(form), out.dataset.copy), { id: "tool-add-call", label: "Add results to current call" }) : null;
  if (add) add.disabled = true;

  function run() {
    const fields = readFields(form);
    const result = runTool(tool.id, fields);
    showOut(out, result);
    copyBtn.disabled = !out.dataset.copy;
    if (add) add.disabled = !out.dataset.copy;
  }

  calc.addEventListener("click", run);
  copyBtn.addEventListener("click", () => {
    if (out.dataset.copy) copyText(out.dataset.copy);
  });

  if (tool.id === "superheat-subcool") {
    import("./gauge-import.js?v=39").then(({ mountGaugeImport }) => {
      const refs = (tool.fields.find((f) => f.name === "refrigerant").options || []).map((o) => o[0]);
      mountGaugeImport(scanHost, {
        refrigerants: refs,
        onFill(vals) {
          form.querySelectorAll(".imported").forEach((el) => el.classList.remove("imported"));
          for (const [k, v] of Object.entries(vals)) {
            const el = form.querySelector('[data-field="' + k + '"]');
            if (el) { el.value = v; el.classList.add("imported"); }
          }
          run();
          return "Calculated below.";
        },
      });
    }).catch(console.error);
  }

  if (tool.id === "nameplate-faults") {
    import("./plate-scan.js?v=39").then(({ mountPlateScan, plateSummary }) => {
      mountPlateScan(scanHost, (v) => {
        const set = (k, val) => {
          const el = form.querySelector('[data-field="' + k + '"]');
          if (el && val != null && val !== "") el.value = val;
        };
        set("model", v.model);
        set("serial", v.serial);
        set("refrigerant", v.refrigerant);
        set("chargeLbs", v.charge);
        set("voltage", [v.voltage, v.phase && v.phase + "ph", v.hz && v.hz + "Hz"].filter(Boolean).join(" "));
        const amps = [["rla", "RLA"], ["lra", "LRA"], ["fanFla", "Fan FLA"], ["mca", "MCA"], ["mop", "MOP"]]
          .filter(([k]) => v[k]).map(([k, l]) => l + " " + v[k]).join(", ");
        const notes = form.querySelector('[data-field="notes"]');
        if (amps && notes) notes.value = (notes.value ? notes.value + "\n" : "") + "Plate: " + amps;
        run();
        // "Add to call card" (writes the call draft; then "Added — open call card" / "Go to Readings") + "Start troubleshooting".
        // "Fill call card" already happened (forced model/serial check): write the call draft, then Done.
        import("./call-card.js?v=39").then(({ renderDone, mergeIntoDraft, saveScan, DRAFT_KEY }) => {
          let d = {};
          try { d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}"); } catch (e) { /* ignore */ }
          try { localStorage.setItem(DRAFT_KEY, JSON.stringify(mergeIntoDraft(d, v))); } catch (e) { /* ignore */ }
          saveScan(v);
          const box = scanHost.querySelector(".plate-scan");
          renderDone(box, v, {
            primary: { label: "Open call card", href: "call.html" },
            onScanAgain: () => box.__reset(),
          });
        }).catch(console.error);
        // Manual links for the scanned brand/model.
        import("./manuals.js?v=39").then(async ({ loadManualsIndex, findManuals, renderManuals }) => {
          let host = document.getElementById("manuals-host");
          if (!host) { host = document.createElement("div"); host.id = "manuals-host"; scanHost.after(host); }
          const id = { brand: v.brand, model: v.model };
          renderManuals(host, findManuals(await loadManualsIndex(), id), id);
        }).catch(console.error);
      });
    }).catch(console.error);
  }

  // Auto-run checklists on load (and when selects change)
  if (tool.kind === "checklist") {
    run();
    form.querySelectorAll("select").forEach((el) => el.addEventListener("change", run));
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const id = qsId();
  const tool = getTool(id);
  if (tool) { try { localStorage.setItem("serviceTechLastTool_v1", tool.id); } catch (e) { /* ignore */ } }
  if (!tool) {
    $("#tool-title").textContent = "Tool not found";
    $("#tool-disclaimer").textContent = "Unknown tool id. Go back to the toolkit.";
    $("#tool-root").innerHTML = '<a class="btn btn-secondary" href="toolkit.html">Back to toolkit</a>';
    $("#cli-link").style.display = "none";
    return;
  }
  mount(tool);
});
