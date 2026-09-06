/** Mount interactive tool UI from ?id= */
import { getTool } from "./registry.js";
import { runTool } from "./logic.js";

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
  const form = document.createElement("div");
  form.id = "tool-form";
  tool.fields.forEach((f) => form.appendChild(renderField(f)));
  root.appendChild(form);

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

  function run() {
    const fields = readFields(form);
    const result = runTool(tool.id, fields);
    showOut(out, result);
    copyBtn.disabled = !out.dataset.copy;
  }

  calc.addEventListener("click", run);
  copyBtn.addEventListener("click", () => {
    if (out.dataset.copy) copyText(out.dataset.copy);
  });

  // Auto-run checklists on load (and when selects change)
  if (tool.kind === "checklist") {
    run();
    form.querySelectorAll("select").forEach((el) => el.addEventListener("change", run));
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const id = qsId();
  const tool = getTool(id);
  if (!tool) {
    $("#tool-title").textContent = "Tool not found";
    $("#tool-disclaimer").textContent = "Unknown tool id. Go back to the toolkit.";
    $("#tool-root").innerHTML = '<a class="btn btn-secondary" href="toolkit.html">Back to toolkit</a>';
    $("#cli-link").style.display = "none";
    return;
  }
  mount(tool);
});
