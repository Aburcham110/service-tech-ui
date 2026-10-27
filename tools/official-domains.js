/**
 * The one list of hosts the app may link to (checked by tests/official-domains.test.js across data/*.json, tools/ and the html pages).
 * OEM_DOMAINS match the domain and its subdomains. PATH_ONLY hosts are shared infrastructure allowed only under one OEM path.
 * shareddocs.com is deliberately NOT here (removed 2026-10-26).
 */
export const OEM_DOMAINS = {
  "carrier.com": "Carrier", "carrier.com.pr": "Carrier Puerto Rico", "hvacpartners.com": "Carrier dealer portal",
  "fujitsugeneral.com": "Fujitsu General", "airstagehvac.com": "Fujitsu General (AIRSTAGE)",
  "mylinkdrive.com": "Mitsubishi Electric Trane US (LinkDrive)",
  "daikincomfort.com": "Daikin Comfort Technologies NA", "daikincity.com": "Daikin Comfort Technologies NA (B2B)",
  "lg.com": "LG Electronics", "lghvac.com": "LG HVAC",
  "yorknow.com": "York (Johnson Controls)", "york.com": "York (Johnson Controls)", "upgnet.com": "Unitary Products Group (York)",
  "tranetechnologies.com": "Trane Technologies", "trane.com": "Trane",
  "rheem.com": "Rheem", "hvacliteraturelibrary.com": "Rheem literature library (accepted with the index's attribution caveat)",
  "lennox.com": "Lennox", "lennoxpros.com": "Lennox (dealer site)",
  "goodmanmfg.com": "Goodman",
  "copeland.com": "Copeland", "tecumseh.com": "Tecumseh",
  "heatcraftrpd.com": "Heatcraft Refrigeration Products", "intelligencontrols.com": "Heatcraft (InteliGen controls)",
  "manitowocice.com": "Manitowoc Ice",
};
export const PATH_ONLY = { "s3.amazonaws.com": ["/enter.mehvac.com/"] }; // Mitsubishi Electric US asset bucket only, not all of S3

// Non-OEM URLs that are allowed, each listed explicitly (app infrastructure, not documentation links).
export const EXCLUDED = [
  ["https://script.google.com/macros/s/", "Apps Script endpoint for missing-model reports (tools/missing-model.js)"],
  ["https://app.notion.com/p/", "Notion research pages recorded as each row's provenance"],
  ["https://github.com/Aburcham110/", "this app's own repositories (tool CLI links)"],
  ["https://www.bpa.gov/-/media/Aep/energy-efficiency/residential/residential-ptcs-essentials/ptcs-esp-cfm-lookup-tables-final.pdf", "BPA PTCS ESP–CFM lookup tables: the cited source for the psychrometrics cfm/ton and TESP notes (tools/psychro-ui.js)"],
  ["http://www.w3.org/2000/svg", "SVG XML namespace string, not a link"],
  ["https://apps.apple.com/us/app/carrier-service-technician/", "App Store listing of Carrier's official technician app"],
];

export function isOfficialUrl(url) {
  let u; try { u = new URL(url); } catch (e) { return false; }
  const h = u.hostname.toLowerCase();
  if (PATH_ONLY[h]) return PATH_ONLY[h].some((p) => u.pathname.startsWith(p));
  return Object.keys(OEM_DOMAINS).some((d) => h === d || h.endsWith("." + d));
}
export const isExcluded = (url) => EXCLUDED.some(([p]) => url.startsWith(p));
