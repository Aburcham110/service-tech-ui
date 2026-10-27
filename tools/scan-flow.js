/**
 * Scan flow guidance: numbered steps, one-line instructions, plain progress text with an estimate,
 * review summary and the Done screen's "where it went". Pure helpers + small DOM renderers; the
 * safety checks (forced Looks-right on model/serial, low-confidence flags, blanks) stay in plate-scan.js.
 */
export const STEPS = [
  { id: "photo", label: "Photo" },
  { id: "crop", label: "Crop" },
  { id: "reading", label: "Reading" },
  { id: "check", label: "Check" },
  { id: "done", label: "Done" },
];

export const INSTRUCTIONS = {
  photo: "Fill the frame with the data plate, hold the phone square to it, then tap Take photo.",
  crop: "Drag the 4 corners to the plate edges, then tap Use this crop.",
  reading: "Hold on — the plate is being read on this phone (works offline).",
  check: "Compare each value with the plate, fix anything wrong, tick Looks right for model and serial, then tap Fill call card.",
  checkRetake: "This read is unreliable — tap Retake, or check every value very carefully before filling the call card.",
  done: "Saved. Check the call card, then open the manual or start troubleshooting.",
};

/** Plain-language status for a scanPlate() progress stage. */
export function plainStage(stage) {
  const s = String(stage || "").replace(/…$/, "");
  let m = s.match(/^Reading plate, pass (\d+)\/(\d+)/);
  if (m) return "Reading plate, pass " + m[1] + " of " + m[2];
  m = s.match(/^Finding orientation (\d+)\/(\d+)/);
  if (m) return "Finding which way is up (" + m[1] + " of " + m[2] + ")";
  if (/^Preparing/.test(s)) return "Preparing the photo";
  if (/^Finding the plate/.test(s)) return "Finding the plate in the photo";
  if (/^Checking the crop/.test(s)) return "Checking the crop";
  if (/^Done/.test(s)) return "Done reading";
  return s;
}

/** Estimated time left from elapsed ms and fraction done. Typical first estimate before there's data. */
export function etaText(elapsedMs, frac) {
  if (frac >= 1) return "";
  if (!(frac > 0.08) || !(elapsedMs > 1500)) return "usually 10–40 s";
  const left = Math.max(1, (elapsedMs / frac) * (1 - frac) / 1000);
  if (left < 5) return "a few seconds left";
  if (left < 60) return "about " + Math.ceil(left / 5) * 5 + " s left";
  return "about " + Math.round(left / 60) + " min left";
}

export const progressLine = (stage, elapsedMs, frac) => {
  const eta = etaText(elapsedMs, frac);
  return plainStage(stage) + (eta ? " · " + eta : "");
};

/** "7 fields filled, 2 need your check" (or "all look OK"). */
export function reviewSummaryText(filled, check) {
  const f = filled + " field" + (filled === 1 ? "" : "s") + " filled";
  if (!filled) return "No fields read — retake, or type the values from the plate";
  return f + ", " + (check ? check + " need" + (check === 1 ? "s" : "") + " your check" : "none flagged — still compare with the plate");
}

export const LOOKS_RIGHT_HELP = "“Looks right” means you compared that value with the plate character by character. " +
  "Model and serial must be ticked before Fill call card works; editing a value clears its tick. Nothing is saved until you tap Fill call card.";

const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

/** Step indicator + instruction line (sticky). Returns { set(stepId, instruction?) }. */
export function mountGuide(host) {
  const g = mk("div", "scan-guide");
  const ol = mk("ol", "scan-steps");
  ol.setAttribute("aria-label", "Scan steps");
  STEPS.forEach((s, i) => { const li = mk("li", "scan-step"); li.dataset.step = s.id; li.append(mk("span", "scan-step-n", String(i + 1)), mk("span", "scan-step-l", s.label)); ol.appendChild(li); });
  const line = mk("p", "scan-instruction"); line.setAttribute("aria-live", "polite");
  // "?" jumps to the scan section of the Help page.
  const help = mk("a", "scan-help-link", "?");
  help.href = "help.html#scan"; help.setAttribute("aria-label", "How to scan a plate (help)"); help.title = "How to scan";
  g.append(ol, help, line);
  host.prepend(g);
  const set = (id, text) => {
    const idx = STEPS.findIndex((s) => s.id === id);
    ol.querySelectorAll(".scan-step").forEach((li, i) => {
      li.classList.toggle("is-done", i < idx); li.classList.toggle("is-current", i === idx);
      if (i === idx) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
    });
    line.textContent = text || INSTRUCTIONS[id] || "";
    g.dataset.step = id;
  };
  set("photo");
  return { el: g, set };
}

/** Review summary box: counts + one jump button per field to check. form = the plate form. */
export function renderReviewSummary(form) {
  const box = mk("div", "scan-review-summary"); box.setAttribute("role", "status");
  const head = mk("strong", "scan-review-count");
  const jumps = mk("div", "scan-review-jumps");
  const help = mk("details", "scan-looks-help");
  help.append(mk("summary", null, "What does “Looks right” do?"), mk("p", null, LOOKS_RIGHT_HELP));
  box.append(head, jumps, help);
  const update = () => {
    const inputs = [...form.querySelectorAll("input[data-plate]")];
    const filled = inputs.filter((i) => i.value.trim()).length;
    const need = inputs.filter((i) => {
      const cb = form.querySelector('[data-looks-right="' + i.name + '"]');
      if (!i.value.trim()) return false;
      return cb ? !cb.checked : i.classList.contains("low-conf"); // model/serial: resolved once ticked
    });
    head.textContent = reviewSummaryText(filled, need.length);
    jumps.innerHTML = "";
    need.forEach((i) => {
      const lab = i.closest("label"); const name = (lab && lab.querySelector("span") ? lab.querySelector("span").firstChild.textContent : i.name).trim();
      const b = mk("button", "link-btn scan-jump", name + " ↓"); b.type = "button"; b.dataset.jump = i.name;
      b.addEventListener("click", () => { i.scrollIntoView && i.scrollIntoView({ block: "center", behavior: "smooth" }); i.focus({ preventScroll: true }); lab && lab.classList.add("scan-flash"); setTimeout(() => lab && lab.classList.remove("scan-flash"), 1200); });
      jumps.appendChild(b);
    });
  };
  form.addEventListener("input", update); form.addEventListener("change", update);
  update();
  return { el: box, update };
}

/** Where the confirmed values went, for the Done screen. */
export function whereItWent(v, { onCard = true } = {}) {
  const ids = [v.brand, v.model && "model " + v.model, v.serial && "serial " + v.serial].filter(Boolean).join(", ");
  const out = [];
  if (onCard) out.push("Call card → Open step: " + ["Data plate box" + (ids ? " (" + ids + ")" : ""), v.refrigerant && "Refrigerant " + v.refrigerant, v.rla && "FLA/RLA " + v.rla].filter(Boolean).join(", ") + " — all still editable");
  out.push("This phone: last scanned plate (pre-fills SH/SC, electrical, troubleshooting and the manuals helper)");
  return out;
}
