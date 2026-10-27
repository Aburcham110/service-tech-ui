/* Service Tech field UI */
(function () {
  const STORAGE_KEY = "serviceTechCallDraft_v1";
  const TECH_KEY = "serviceTechTechName_v1"; // tools/call-extras.js TECH_KEY
  const STEPS = ["open", "readings", "mid", "close"];

  const TOOLS = [
  ["Diagnostics",[
    ["SH / Subcool","When charging or verifying capacity","hvac-superheat-subcool","superheat-subcool"],
    ["\u0394T / Airflow","Supply/return split and rough CFM","hvac-airflow-delta-t","airflow-delta-t"],
    ["Psychrometrics","DB + RH/WB dew point & enthalpy","hvac-psychrometrics","psychrometrics"],
    ["Compressor diag","High DLT, floodback, LRA, high amps","hvac-compressor-diag-tree","compressor-diag"],
    ["TXV / EEV path","Hunting, high/low SH metering issues","hvac-txv-eev-path","txv-eev"]
  ]],
  ["Charge & evacuate",[
    ["Charge / recover","Line-set add vs recover estimate","hvac-charge-recovery-estimator","charge-recovery"],
    ["Vacuum coach","Microns, hold/decay, pre-charge","hvac-vacuum-evacuation-coach","vacuum-coach"],
    ["Leak rate practice","Practice annualized % (NOT compliance)","hvac-leak-rate-helper","leak-rate"],
    ["A2L checklist","R-454B / R-32 field service & install","hvac-a2l-field-checklist","a2l-checklist"]
  ]],
  ["Commercial / rack",[
    ["Box load sizer","Rough walk-in cooler/freezer load","commercial-box-load-sizer","box-load"],
    ["Defrost checklist","Time clock vs demand defrost path","hvac-defrost-controls-checklist","defrost-checklist"],
    ["Oil / rack","Separator, filters, oil logging","hvac-oil-rack-checklist","oil-rack"],
    ["Case controller","Probes first, defrost history, EEV hunt","hvac-case-controller-playbook","case-controller"]
  ]],
  ["Electrical & notes",[
    ["Electrical helper","Voltage, amps, FLA / MCA checks","hvac-electrical-helper","electrical"],
    ["Nameplate / codes","Capture plate + stub fault codes","hvac-nameplate-fault-codes","nameplate-faults"],
    ["Job log notes","Structured field job notes","hvac-job-log-notes","job-log"],
    ["Duct / static","Velocity and ESP reminders","hvac-duct-static-helper","duct-static"]
  ]]
];

  const DOCS = [
    { title: "Field Docs", blurb: "Parent field documentation hub", href: "https://app.notion.com/p/3d3402f833af812091c7cda01e2b46dc" },
    { title: "Call card", blurb: "Notion call-card prompts", href: "https://app.notion.com/p/3d2402f833af81e4bf6cd22cbf8c1125" },
    { title: "Manuals", blurb: "Manuals collection", href: "https://app.notion.com/p/3d3402f833af8106af2ae647a39fcf48" },
    { title: "OEM sources map", blurb: "Where to find OEM literature", href: "https://app.notion.com/p/3d3402f833af8125a057eaa0304b38ba" },
  ];

  function $(sel, el) { return (el || document).querySelector(sel); }
  function $all(sel, el) { return Array.from((el || document).querySelectorAll(sel)); }

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

  function loadDraft() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch (_) {
      return {};
    }
  }

  function saveDraft(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    if (data && String(data.techName || "").trim()) try { localStorage.setItem(TECH_KEY, String(data.techName).trim()); } catch (_) { /* ignore */ }
    try { document.dispatchEvent(new CustomEvent("st:draft")); } catch (_) { /* ignore */ }
  }

  function rememberedTech() {
    try { return localStorage.getItem(TECH_KEY) || ""; } catch (_) { return ""; }
  }

  // Auto-stamps (editable): start when the call opens, end when Close is first reached.
  function nowStamp() {
    const n = new Date(), p = (x) => String(x).padStart(2, "0");
    return { date: n.getFullYear() + "-" + p(n.getMonth() + 1) + "-" + p(n.getDate()), time: p(n.getHours()) + ":" + p(n.getMinutes()) };
  }
  function stampStart(d) {
    if (d.startTime) return d;
    const s = nowStamp(); d.startTime = s.time; if (!d.startDate) d.startDate = s.date; return d;
  }
  function stampEnd(d) {
    if (d.step !== "close" || d.endTime) return d;
    const s = nowStamp(); d.endTime = s.time; if (!d.endDate) d.endDate = s.date; return d;
  }

  function defaultDraft() {
    return {
      step: "open",
      workOrder: "", techName: rememberedTech(), startDate: "", startTime: "", endDate: "", endTime: "",
      site: "", equipment: "cooler", symptom: "", refrigerant: "", plate: "", photosReady: false,
      suctionPsig: "", suctionTemp: "", liquidPsig: "", liquidTemp: "",
      supplyTemp: "", returnTemp: "", amps: "", fla: "", voltage: "",
      did: "", found: "", stillSeeing: "",
      fixed: "", partsUsed: "",
    };
  }

  function mergeDraft() {
    return Object.assign(defaultDraft(), loadDraft());
  }

  function readFormIntoDraft(d) {
    const map = {
      workOrder: "workOrder", techName: "techName", startDate: "startDate", startTime: "startTime", endDate: "endDate", endTime: "endTime",
      site: "site", equipment: "equipment", symptom: "symptom", refrigerant: "refrigerant", plate: "plate",
      photosReady: "photosReady",
      suctionPsig: "suctionPsig", suctionTemp: "suctionTemp",
      liquidPsig: "liquidPsig", liquidTemp: "liquidTemp",
      supplyTemp: "supplyTemp", returnTemp: "returnTemp",
      amps: "amps", fla: "fla", voltage: "voltage",
      did: "did", found: "found", stillSeeing: "stillSeeing",
      fixed: "fixed", partsUsed: "partsUsed",
    };
    Object.keys(map).forEach((k) => {
      const el = document.getElementById(map[k]);
      if (!el) return;
      d[k] = el.type === "checkbox" ? !!el.checked : el.value;
    });
    return d;
  }

  function fillForm(d) {
    Object.keys(d).forEach((k) => {
      if (k === "step") return;
      const el = document.getElementById(k);
      if (!el) return;
      if (el.type === "checkbox") el.checked = !!d[k];
      else el.value = d[k] == null ? "" : d[k];
    });
  }

  function line(label, v) {
    const s = (v == null ? "" : String(v)).trim();
    return s ? `${label}: ${s}` : `${label}: —`;
  }

  function buildCard(d, throughStep) {
    const idx = STEPS.indexOf(throughStep);
    const ex = typeof self.stCallCopyExtras === "function" ? self.stCallCopyExtras(d) : null;
    const extras = { header: (ex && ex.header) || [], readings: (ex && ex.readings) || [] };
    const parts = [
      "SERVICE TECH CALL CARD",
      "======================",
      ...extras.header,
      "",
      line("Site", d.site),
      line("Equipment", d.equipment),
      line("Symptom", d.symptom),
      line("Refrigerant", d.refrigerant),
      line("Data plate", d.plate),
      line("Photos ready", d.photosReady ? "yes" : "no"),
    ];
    if (idx >= 1) {
      parts.push(
        "",
        "READINGS",
        line("Suction", `${d.suctionPsig || "—"} psig / ${d.suctionTemp || "—"} °F`),
        line("Liquid", `${d.liquidPsig || "—"} psig / ${d.liquidTemp || "—"} °F`),
        line("Supply / Return", `${d.supplyTemp || "—"} / ${d.returnTemp || "—"} °F`),
        line("Amps / plate RLA-FLA", `${d.amps || "—"} A / ${d.fla || "—"} A`),
        line("Voltage", d.voltage ? d.voltage + " V" : ""),
        ...extras.readings,
      );
    }
    if (idx >= 2) {
      parts.push("", "MID CALL", line("Did", d.did), line("Found", d.found), line("Still seeing", d.stillSeeing));
    }
    if (idx >= 3) {
      parts.push("", "CLOSE", line("Fixed", d.fixed), line("Parts used", d.partsUsed));
    }
    parts.push("", "(Educational field helper — verify with OEM / AHJ)");
    return parts.join("\n");
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast("Copied for Service Tech");
    } catch (_) {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      toast("Copied for Service Tech");
    }
  }

  function page() {
    const p = location.pathname.split("/").pop() || "index.html";
    if (!p || p === "") return "index.html";
    return p;
  }

  /** A saved call draft with anything typed in it (beyond the defaults). */
  function draftHasContent(d) {
    const def = defaultDraft();
    const auto = ["step", "techName", "startDate", "startTime", "endDate", "endTime"]; // stamped/remembered, not typed for this call
    return Object.keys(d || {}).some((k) => !auto.includes(k) && d[k] !== "" && d[k] != null && d[k] !== false && d[k] !== def[k]);
  }

  function initHome() {
    const btn = $("#resume-call");
    if (!btn) return;
    const d = loadDraft();
    if (!draftHasContent(d)) return;
    const what = [d.site, d.equipment, d.symptom && d.symptom.slice(0, 40)].filter(Boolean).join(" · ");
    btn.querySelector("span").textContent = what ? " — " + what : "";
    btn.hidden = false;
  }

  function showStep(name) {
    STEPS.forEach((s) => {
      const panel = document.getElementById("panel-" + s);
      if (panel) panel.classList.toggle("hidden", s !== name);
    });
    $all(".step-pill").forEach((pill) => {
      const s = pill.dataset.step;
      pill.classList.toggle("active", s === name);
      pill.classList.toggle("done", STEPS.indexOf(s) < STEPS.indexOf(name));
    });
  }

  function initCall() {
    let d = mergeDraft();
    if (!d.techName) d.techName = rememberedTech();
    d = stampEnd(stampStart(d));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
    fillForm(d);
    showStep(d.step || "open");
    $all(".step-pill").forEach((pill) => {
      pill.addEventListener("click", () => {
        d = readFormIntoDraft(d);
        d.step = pill.dataset.step;
        d = stampEnd(d); fillForm(d);
        saveDraft(d);
        showStep(d.step);
      });
    });
    $all("input, select, textarea").forEach((el) => {
      el.addEventListener("change", () => { d = readFormIntoDraft(d); saveDraft(d); });
      el.addEventListener("input", () => { d = readFormIntoDraft(d); saveDraft(d); });
    });
    $("#btn-prev")?.addEventListener("click", () => {
      d = readFormIntoDraft(d);
      const i = Math.max(0, STEPS.indexOf(d.step) - 1);
      d.step = STEPS[i];
      d = stampEnd(d); fillForm(d);
      saveDraft(d);
      showStep(d.step);
    });
    $("#btn-next")?.addEventListener("click", () => {
      d = readFormIntoDraft(d);
      const i = Math.min(STEPS.length - 1, STEPS.indexOf(d.step) + 1);
      d.step = STEPS[i];
      d = stampEnd(d); fillForm(d);
      saveDraft(d);
      showStep(d.step);
    });
    $("#btn-copy")?.addEventListener("click", () => {
      d = readFormIntoDraft(d);
      saveDraft(d);
      copyText(buildCard(d, d.step));
    });
    $("#btn-reset")?.addEventListener("click", () => {
      if (!confirm("Clear this call draft?")) return;
      d = stampStart(defaultDraft());
      saveDraft(d);
      fillForm(d);
      showStep("open");
      toast("Draft cleared");
    });
  }

  function renderTools(filter) {
    const root = $("#toolkit-root");
    if (!root) return;
    const q = (filter || "").trim().toLowerCase();
    root.innerHTML = "";
    // Last tool opened (tool.html stores it) sits at the top, unless a search is active.
    let last = null;
    try { last = localStorage.getItem("serviceTechLastTool_v1"); } catch (_) { /* ignore */ }
    const lastItem = !q && last && TOOLS.flatMap(([, items]) => items).find((it) => it[3] === last);
    if (lastItem) {
      const h = document.createElement("div"); h.className = "group-title"; h.textContent = "Last used";
      const grid = document.createElement("div"); grid.className = "tile-grid";
      const a = document.createElement("a"); a.className = "tile tile-last"; a.id = "tile-last"; a.href = "tool.html?id=" + lastItem[3];
      a.innerHTML = "<strong></strong><span></span>";
      a.querySelector("strong").textContent = lastItem[0]; a.querySelector("span").textContent = "Use when: " + lastItem[1];
      grid.appendChild(a); root.append(h, grid);
    }
    TOOLS.forEach(([group, items]) => {
      const filtered = items.filter(([name, use]) => {
        if (!q) return true;
        return (name + " " + use + " " + group).toLowerCase().includes(q);
      });
      if (!filtered.length) return;
      const h = document.createElement("div");
      h.className = "group-title";
      h.textContent = group;
      root.appendChild(h);
      const grid = document.createElement("div");
      grid.className = "tile-grid";
      filtered.forEach(([name, use, repo, id]) => {
        const a = document.createElement("a");
        a.className = "tile";
        a.href = "tool.html?id=" + id;
        a.innerHTML = "<strong>" + name + "</strong><span>Use when: " + use + "</span>";
        grid.appendChild(a);
      });
      root.appendChild(grid);
    });
    if (!root.children.length) {
      root.innerHTML = '<p class="footer-note">No tools match that search.</p>';
    }
  }

  function initToolkit() {
    renderTools("");
    $("#tool-search")?.addEventListener("input", (e) => renderTools(e.target.value));
  }

  function initDocs() {
    const root = $("#docs-root");
    if (!root) return;
    root.innerHTML = DOCS.map((d) =>
      '<a class="tile" href="' + d.href + '" target="_blank" rel="noopener">' +
      "<strong>" + d.title + ' <small class="online-only">(online only)</small></strong><span>' + d.blurb + "</span></a>"
    ).join("");
  }

  /* ---- PWA: service worker registration + offline indicator ----
     Registered here (app.js loads on every page) instead of inline scripts.
     register() is idempotent for the same script URL/scope, and the guard
     below keeps it to one call per page load. */
  let cacheComplete = false;

  function indicator() {
    let el = document.getElementById("offline-indicator");
    if (!el) {
      el = document.createElement("div");
      el.id = "offline-indicator";
      el.className = "offline-indicator";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      el.hidden = true;
      document.body.appendChild(el);
    }
    return el;
  }

  function updateIndicator() {
    const el = indicator();
    if (!navigator.onLine) {
      el.textContent = "Offline";
      el.dataset.state = "offline";
      el.hidden = false;
    } else if (cacheComplete && navigator.serviceWorker && navigator.serviceWorker.controller) {
      el.textContent = "Available offline";
      el.dataset.state = "ready";
      el.hidden = false;
    } else {
      el.textContent = "";
      el.dataset.state = "pending";
      el.hidden = true;
    }
  }

  function askCacheStatus() {
    const ctl = navigator.serviceWorker && navigator.serviceWorker.controller;
    if (!ctl) { updateIndicator(); return; }
    const ch = new MessageChannel();
    ch.port1.onmessage = (e) => {
      cacheComplete = !!(e.data && e.data.complete);
      updateIndicator();
    };
    ctl.postMessage({ type: "cache-status" }, [ch.port2]);
  }

  function initPwa() {
    window.addEventListener("online", updateIndicator);
    window.addEventListener("offline", updateIndicator);
    updateIndicator();
    // Retry queued "Send missing model" posts at app start and whenever the phone comes back online.
    import("./tools/missing-model.js?v=31").then((m) => m.startMissingSender()).catch(() => {});
    import("./tools/feedback.js?v=31").then((m) => m.startFeedbackSender()).catch(() => {});
    if (!("serviceWorker" in navigator) || window.__stSwRegistered) return;
    window.__stSwRegistered = true;
    const hadController = !!navigator.serviceWorker.controller;
    // updateViaCache "none": check sw.js and version.js past the HTTP cache (Pages sends max-age=600).
    navigator.serviceWorker.register("./sw.js", { scope: "./", updateViaCache: "none" })
      .then((reg) => reg && reg.update && reg.update().catch(() => {})).catch(console.error);
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      askCacheStatus();
      // The new version applies right away: reload once (guarded against loops in version.js).
      if (self.stOnControllerChange) {
        try { self.stOnControllerChange({ hadController, storage: sessionStorage, reload: () => location.reload(), now: Date.now() }); } catch (e) { /* storage blocked: skip */ }
      }
    });
    navigator.serviceWorker.ready.then(askCacheStatus);
  }

  // Visible version label in the footer, from the same constant as the service-worker cache name.
  function showVersion() {
    const v = self.APP_VERSION;
    if (!v || document.querySelector(".app-version")) return;
    const p = document.createElement("p");
    p.className = "footer-note app-version";
    p.textContent = "Version " + v;
    const host = document.querySelector("main") || document.body;
    host.appendChild(p);
  }

  document.addEventListener("DOMContentLoaded", () => {
    showVersion();
    initPwa();
    const p = page();
    if (p.includes("call")) initCall();
    else if (p.includes("toolkit")) initToolkit();
    else if (p.includes("docs")) initDocs();
    else initHome();
  });
})();
