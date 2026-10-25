/** URL-param prefill for tool pages (tool.html?id=superheat-subcool&refrigerant=R-410A). Only fills
 *  fields the tool already has; select values must match one of the tool's own options. */
const norm = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** "r410a" / "R-410A" / "410A" -> "R-410A"; "R134A" -> "R-134a" (the option's own spelling). */
export function matchOption(options, raw) {
  const n = norm(raw);
  if (!n) return null;
  const hit = (options || []).find(([val, label]) => norm(val) === n || norm(label) === n || norm(val) === "R" + n);
  return hit ? hit[0] : null;
}

/** Value to put in a field for a raw URL value, or null to leave the field alone. */
export function prefillValue(field, raw) {
  if (raw == null || raw === "") return null;
  if (field.type === "select") return matchOption(field.options, raw);
  if (field.type === "checkbox") return null;
  if (field.type === "number") return Number.isFinite(Number(raw)) ? String(raw) : null;
  return String(raw).slice(0, 500);
}

/** Applies ?<field>=<value> params to the rendered form; returns the names it filled. */
export function applyPrefill(form, fields, params) {
  const filled = [];
  for (const f of fields || []) {
    const v = prefillValue(f, params.get(f.name));
    const el = v != null && form.querySelector('[data-field="' + f.name + '"]');
    if (el) { el.value = v; filled.push(f.name); }
  }
  return filled;
}
