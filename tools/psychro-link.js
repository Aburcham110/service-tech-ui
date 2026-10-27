/** Call card -> Psychrometrics hand-off (pure, node-testable). The call's supply/return dry bulb (and RH or
 *  wet bulb when the draft has them) travel in the URL; psychro.html fills its form from them. No network. */
const num = (v) => { const s = String(v == null ? "" : v).trim().replace(",", "."); return s !== "" && Number.isFinite(Number(s)) ? s : ""; };

/** draft -> "psychro.html?from=call&..." (only numeric values are carried). */
export function psychroHref(d) {
  d = d || {};
  const p = new URLSearchParams({ from: "call" });
  const put = (k, v) => { const n = num(v); if (n) p.set(k, n); };
  put("retDb", d.returnTemp); put("supDb", d.supplyTemp);
  put("retRh", d.returnRh); put("retWb", d.returnWb); put("supRh", d.supplyRh); put("supWb", d.supplyWb);
  return "psychro.html?" + p.toString();
}

/** Which dry bulbs the call has (for the button hint). */
export function carried(d) {
  d = d || {};
  return { ret: !!num(d.returnTemp), sup: !!num(d.supplyTemp) };
}

/** URL query -> psychro form values to apply, or null when not from a call. Humidity: RH wins over WB;
 *  with neither, the humidity box is cleared so an older reading is not mixed with this call's dry bulb. */
export function prefillFromQuery(search) {
  const q = new URLSearchParams(search || "");
  if (q.get("from") !== "call") return null;
  const f = {};
  for (const [side, db] of [["ret", "retDb"], ["sup", "supDb"]]) {
    const v = num(q.get(db));
    if (!v) continue;
    f[db] = v;
    const rh = num(q.get(side + "Rh")), wb = num(q.get(side + "Wb"));
    if (rh) { f[side + "HumMode"] = "rh"; f[side + "Hum"] = rh; }
    else if (wb) { f[side + "HumMode"] = "wb"; f[side + "Hum"] = wb; }
    else f[side + "Hum"] = "";
  }
  return f;
}
