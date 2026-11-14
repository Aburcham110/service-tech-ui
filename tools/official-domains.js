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
  // Exact brand-owned document hosts approved by Arthur 2026-11-13 for the OEM manual links (Model Manual Index).
  // Listed as full hostnames (www. etc.), so only that host and its own subdomains pass, not the rest of the parent domain.
  "cdn.daikincloud.io": "Daikin (PIM document CDN)", "www.daikin.eu": "Daikin Europe",
  "docs.johnsoncontrols.com": "Johnson Controls (York) docs", "docs.k-rp.com": "KeepRite Refrigeration docs",
  "gdchillers.com": "G&D Chillers", "iceomatic.com": "Ice-O-Matic", "media.rinnai.us": "Rinnai (media host)",
  "norlake.com": "Norlake / Master-Bilt (RSG)", "secure.hoshizakiamerica.com": "Hoshizaki America",
  "www.solerpalau-usa.com": "S&P (Soler & Palau) USA", "solerpalaucanada.com": "S&P (Soler & Palau) Canada", "www.solerpalaucanada.com": "S&P (Soler & Palau) Canada",
  "uticaboilers.com": "ECR / Utica Boilers", "www.captiveaire.com": "CaptiveAire", "www.friedrich.com": "Friedrich",
  "www.howecorp.com": "Howe", "www.marleymep.com": "Marley Engineered Products", "www.mate.com": "Mate Precision Technologies",
  "www.neptronic.com": "Neptronic", "www.parker.com": "Parker (Sporlan)", "www.regoproducts.com": "RegO",
  "www.scotsman-ice.com": "Scotsman", "www.turboairinc.com": "Turbo Air", "www.viessmann.ca": "Viessmann Canada",
};
export const PATH_ONLY = { "s3.amazonaws.com": ["/enter.mehvac.com/"], "hvacdirect.com": ["/media/pdf/Fujitsu%20LZAS%20Service%20Manual.pdf"] }; // Mitsubishi Electric US asset bucket only, not all of S3

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
