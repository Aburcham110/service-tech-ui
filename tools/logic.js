/** Dispatcher — educational tool logic keyed by tool id */
import { runSuperheatSubcool, runAirflowDeltaT, runPsychrometrics, runChargeRecovery } from "./logic-1.js";
import { runLeakRate, runElectrical, runBoxLoad, runDuctStatic } from "./logic-1b.js";
import { runCompressorDiag, runTxvEev, runVacuumCoach } from "./logic-2a.js";
import { runA2lChecklist, runDefrostChecklist, runOilRack, runCaseController } from "./logic-2.js";
import { runNameplateFaults, runJobLog } from "./logic-2b.js";

const FN = {
  "superheat-subcool": runSuperheatSubcool,
  "airflow-delta-t": runAirflowDeltaT,
  psychrometrics: runPsychrometrics,
  "compressor-diag": runCompressorDiag,
  "txv-eev": runTxvEev,
  "charge-recovery": runChargeRecovery,
  "vacuum-coach": runVacuumCoach,
  "leak-rate": runLeakRate,
  "a2l-checklist": runA2lChecklist,
  "box-load": runBoxLoad,
  "defrost-checklist": runDefrostChecklist,
  "oil-rack": runOilRack,
  "case-controller": runCaseController,
  electrical: runElectrical,
  "nameplate-faults": runNameplateFaults,
  "job-log": runJobLog,
  "duct-static": runDuctStatic
};

export function runTool(id, fields) {
  const fn = FN[id];
  if (!fn) return { lines: ["Unknown tool: " + id] };
  try {
    return fn(fields || {});
  } catch (e) {
    return { lines: ["Error: " + (e && e.message ? e.message : String(e))] };
  }
}
