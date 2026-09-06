/* Service Tech field UI */
(function () {
  const STORAGE_KEY = "serviceTechCallDraft_v1";
  const STEPS = ["open", "readings", "mid", "close"];
  const STEP_LABELS = { open: "Open", readings: "Readings", mid: "Mid", close: "Close" };

  const TOOLS = [
  [
    "Diagnostics",
    [
      [
        "SH / Subcool",
        "When charging or verifying capacity",
        "hvac-superheat-subcool"
      ],
      [
        "\u0394T / Airflow",
        "Supply/return split and rough CFM",
        "hvac-airflow-delta-t"
      ],
      [
        "Psychrometrics",
        "DB + RH/WB dew point & enthalpy",
        "hvac-psychrometrics"
      ],
      [
        "Compressor diag",
        "High DLT, floodback, LRA, high amps",
        "hvac-compressor-diag-tree"
      ],
      [
        "TXV / EEV path",
        "Hunting, high/low SH metering issues",
        "hvac-txv-eev-path"
      ]
    ]
  ],
  [
    "Charge & evacuate",
    [
      [
        "Charge / recover",
        "Line-set add vs recover estimate",
        "hvac-charge-recovery-estimator"
      ],
      [
        "Vacuum coach",
        "Microns, hold/decay, pre-charge",
        "hvac-vacuum-evacuation-coach"
      ],
      [
        "Leak rate practice",
        "Practice annualized % (NOT compliance)",
        "hvac-leak-rate-helper"
      ],
      [
        "A2L checklist",
        "R-454B / R-32 field service & install",
        "hvac-a2l-field-checklist"
      ]
    ]
  ],
  [
    "Commercial / rack",
    [
      [
        "Box load sizer",
        "Rough walk-in cooler/freezer load",
        "commercial-box-load-sizer"
      ],
      [
        "Defrost checklist",
        "Time clock vs demand defrost path",
        "hvac-defrost-controls-checklist"
      ],
      [
        "Oil / rack",
        "Separator, filters, oil logging",
        "hvac-oil-rack-checklist"
      ],
      [
        "Case controller",
        "Probes first, defrost history, EEV hunt",
        "hvac-case-controller-playbook"
      ]
    ]
  ],
  [
    "Electrical & notes",
    [
      [
        "Electrical helper",
        "Voltage, amps, FLA / MCA checks",
        "hvac-electrical-helper"
      ],
      [
        "Nameplate / codes",
        "Capture plate + stub fault codes",
        "hvac-nameplate-fault-codes"
      ],
      [
        "Job log notes",
        "Structured field job notes",
        "hvac-job-log-notes"
      ],
      [
        "Duct / static",
        "Velocity and ESP reminders",
        "hvac-duct-static-helper"
      ]
    ]
  ]
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
  }

  function defaultDraft() {
    return {
      step: "open",
      site: "", equipment: "cooler", symptom: "", refrigerant: "", photosReady: false,
      suctionPsig: "", suctionTemp: "", liquidPsig: "", liquidTemp: "",
      supplyTemp: "", returnTemp: "", amps: "", fla: "", voltage: "",
      did: "", found: "", stillSeeing: "",
      fixed: "", partsUsed: "",
    };
  }

  function mergeDraft() {
    return Object.assign(defaultDraft(), loadDraft());
  }

  function val(id) {
    const el = document.getElementById(id);
    if (!el) return "";
    if (el.type === "checkbox") return !!el.checked;
    return el.value;
  }

  function readFormIntoDraft(d) {
    const map = {
      site: "site", equipment: "equipment", symptom: "symptom", refrigerant: "refrigerant",
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
    const parts = [
      "SERVICE TECH CALL CARD",
      "======================",
      line("Site", d.site),
      line("Equipment", d.equipment),
      line("Symptom", d.symptom),
      line("Refrigerant", d.refrigerant),
      line("Photos ready", d.photosReady ? "yes" : "no"),
    ];
    if (idx >= 1) {
      parts.push(
        "",
        "READINGS",
        line("Suction", `${d.suctionPsig || "—"} psig / ${d.suctionTemp || "—"} °F`),
        line("Liquid", `${d.liquidPsig || "—"} psig / ${d.liquidTemp || "—"} °F`),
        line("Supply / Return", `${d.supplyTemp || "—"} / ${d.returnTemp || "—"} °F`),
        line("Amps / FLA", `${d.amps || "—"} / ${d.fla || "—"}`),
        line("Voltage", d.voltage),
      );
    }
    if (idx >= 2) {
      parts.push(
        "",
        "MID CALL",
        line("Did", d.did),
        line("Found", d.found),
        line("Still seeing", d.stillSeeing),
      );
    }
    if (idx >= 3) {
      parts.push(
        "",
        "CLOSE",
        line("Fixed", d.fixed),
        line("Parts used", d.partsUsed),
      );
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

  /* ---- Home ---- */
  function initHome() {}

  /* ---- Call wizard ---- */
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
    fillForm(d);
    showStep(d.step || "open");

    $all(".step-pill").forEach((pill) => {
      pill.addEventListener("click", () => {
        d = readFormIntoDraft(d);
        d.step = pill.dataset.step;
        saveDraft(d);
        showStep(d.step);
      });
    });

    $all("input, select, textarea").forEach((el) => {
      el.addEventListener("change", () => {
        d = readFormIntoDraft(d);
        saveDraft(d);
      });
      el.addEventListener("input", () => {
        d = readFormIntoDraft(d);
        saveDraft(d);
      });
    });

    $("#btn-prev")?.addEventListener("click", () => {
      d = readFormIntoDraft(d);
      const i = Math.max(0, STEPS.indexOf(d.step) - 1);
      d.step = STEPS[i];
      saveDraft(d);
      showStep(d.step);
    });
    $("#btn-next")?.addEventListener("click", () => {
      d = readFormIntoDraft(d);
      const i = Math.min(STEPS.length - 1, STEPS.indexOf(d.step) + 1);
      d.step = STEPS[i];
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
      d = defaultDraft();
      saveDraft(d);
      fillForm(d);
      showStep("open");
      toast("Draft cleared");
    });
  }

  /* ---- Toolkit ---- */
  function renderTools(filter) {
    const root = $("#toolkit-root");
    if (!root) return;
    const q = (filter || "").trim().toLowerCase();
    root.innerHTML = "";
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
      filtered.forEach(([name, use, repo]) => {
        const a = document.createElement("a");
        a.className = "tile";
        a.href = "https://github.com/Aburcham110/" + repo;
        a.target = "_blank";
        a.rel = "noopener";
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

  /* ---- Docs ---- */
  function initDocs() {
    const root = $("#docs-root");
    if (!root) return;
    root.innerHTML = DOCS.map((d) =>
      '<a class="tile" href="' + d.href + '" target="_blank" rel="noopener">' +
      "<strong>" + d.title + "</strong><span>" + d.blurb + "</span></a>"
    ).join("");
  }

  document.addEventListener("DOMContentLoaded", () => {
    const p = page();
    if (p.includes("call")) initCall();
    else if (p.includes("toolkit")) initToolkit();
    else if (p.includes("docs")) initDocs();
    else initHome();
  });
})();
