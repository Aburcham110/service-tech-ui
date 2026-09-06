/** Nameplate + job log */
function dash(v) { return (v == null || String(v).trim() === "") ? "—" : String(v).trim(); }


const FAULT_DB = {
  generic: {
    E1: { meaning: "Sensor / thermistor fault (stub)", causes: ["Open/shorted sensor", "Loose plug", "Board input failed"], parts: ["Thermistor", "Harness"], tools: ["Multimeter", "OEM chart"] },
    E2: { meaning: "High pressure / high limit (stub)", causes: ["Dirty condenser", "Failed fan", "Overcharge"], parts: ["Fan motor", "HP switch"], tools: ["Manifold", "Amp clamp"] },
    E3: { meaning: "Low pressure / loss of charge (stub)", causes: ["Leak", "Restriction", "Failed LP switch"], parts: ["LP switch", "Drier"], tools: ["Leak detector", "Micron gauge"] },
    LO: { meaning: "Lockout after retries (stub)", causes: ["Repeated flame/pressure failures"], parts: ["Igniter", "Pressure switch", "Board"], tools: ["Manometer", "Multimeter"] }
  },
  carrier: {
    "33": { meaning: "Carrier-style comm / board fault (stub)", causes: ["Comm wiring", "Failed control"], parts: ["Control board"], tools: ["OEM flowchart"] },
    "41": { meaning: "Blower motor fault (stub)", causes: ["ECM module", "High static"], parts: ["Blower motor/module"], tools: ["Static probes"] }
  },
  trane: { "E.172": { meaning: "Trane-style outdoor fault (stub)", causes: ["OD fan", "Inverter", "Sensor"], parts: ["OD fan", "Inverter"], tools: ["OEM facts"] } },
  rheem: { L6: { meaning: "Rheem-style pressure switch (stub)", causes: ["Blocked vent", "Bad switch", "Inducer"], parts: ["Pressure switch", "Inducer"], tools: ["Manometer"] } },
  copeland: {
    "1": { meaning: "Comfort Alert — long run / low capacity (stub)", causes: ["Low charge", "TXV", "Dirty filter"], parts: ["TXV", "Drier"], tools: ["Manifold"] },
    "5": { meaning: "Comfort Alert — open circuit (stub)", causes: ["Open winding", "Contactor"], parts: ["Contactor", "Compressor"], tools: ["Megger"] }
  }
};

export function runNameplateFaults(f) {
  const lines = [
    "Equipment card:",
    `  Brand: ${dash(f.brand)}`,
    `  Model: ${dash(f.model)}`,
    `  Serial: ${dash(f.serial)}`,
    `  Voltage: ${dash(f.voltage)}`,
    `  Refrigerant: ${dash(f.refrigerant)}`,
    `  Charge: ${dash(f.chargeLbs)}`,
    `  Fault / blink: ${dash(f.faultCode)}`
  ];
  if (f.notes) lines.push(`  Notes: ${f.notes}`);
  const code = (f.faultCode || "").trim();
  if (code) {
    lines.push("");
    const brand = (f.brand || "").trim().toLowerCase().replace(/\s+/g, "");
    let hits = 0;
    for (const source of [brand, "generic"]) {
      const table = FAULT_DB[source];
      if (!table) continue;
      for (const [k, entry] of Object.entries(table)) {
        if (k.toUpperCase() === code.toUpperCase()) {
          hits++;
          lines.push(`Stub match (${source}): ${entry.meaning}`);
          lines.push("  Likely causes:");
          entry.causes.forEach((c, i) => lines.push(`    ${i + 1}. ${c}`));
          lines.push(`  Parts: ${entry.parts.join(", ")}`);
          lines.push(`  Tools: ${entry.tools.join(", ")}`);
        }
      }
    }
    if (!hits) {
      lines.push(`No stub match for code '${code}'. Check OEM manual.`);
      lines.push("Tip: photograph nameplate + board LED chart.");
    }
  }
  lines.push("", "Verify every code with OEM service literature.");
  return { lines };
}

export function runJobLog(f) {
  const today = new Date().toISOString().slice(0, 10);
  return { lines: [
    "HVAC/R SERVICE JOB LOG (educational)",
    "",
    `Date: ${dash(f.date) === "—" ? today : dash(f.date)}`,
    `Technician: ${dash(f.technician)}`,
    `Customer: ${dash(f.customer)}`,
    `Site: ${dash(f.site)}`,
    "",
    "--- Equipment ---",
    `Equipment: ${dash(f.equipment)}`,
    `Model: ${dash(f.model)}`,
    `Serial: ${dash(f.serial)}`,
    "",
    "--- Refrigerant / leak (608-style; NOT compliance) ---",
    `Refrigerant: ${dash(f.refrigerant)}`,
    `System charge lbs: ${dash(f.systemCharge)}`,
    `Lbs added: ${dash(f.lbsAdded)}`,
    `Lbs recovered: ${dash(f.lbsRecovered)}`,
    `Leak found: ${dash(f.leakFound)}`,
    `Leak repaired: ${dash(f.leakRepaired)}`,
    "",
    "--- Work ---",
    `Work performed: ${dash(f.work)}`,
    `Parts used: ${dash(f.parts)}`,
    `Follow-ups: ${dash(f.followUps)}`,
    "",
    "NOT legal advice / NOT an EPA compliance system."
  ]};
}
