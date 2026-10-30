// Builds data/error-codes.json from the researcher's Notion page "Error codes" (16 sections, 433 rows).
// Usage: node tools/gen-error-codes.mjs <notion-page.md> [--york-pdf path/to/YXV_InstallManual.pdf]
//   <notion-page.md>: the page text as returned by the read-only Notion connector (notion-fetch).
//   --york-pdf: the York YXV manual; every York row is checked against its cited page (needs pdftotext). Rows that fail are dropped.
// Rules (Arthur, 2026-10-26): transcribe exactly, never invent text; blank remedy where the manual gives none;
// keep Mitsubishi rows 2, 3 and 17 as flagged blanks; drop rows on non-OEM domains; no-table models show the manual link.
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { isOfficialUrl } from "./official-domains.js";

// A Carrier link on a host that is not approved is replaced by Carrier's link in the manuals index
// (model/prefix entry for one of the set's models), else the Carrier brand page. Code text is never touched.
const INDEX = JSON.parse(readFileSync(new URL("../data/manuals-index.json", import.meta.url), "utf8"));
export function carrierRelink(models) {
  const e = [...INDEX.models, ...INDEX.prefixes].find((x) => x.brand === "Carrier" && models.some((m) => (x.model || x.prefix) === m));
  return e ? e.url : INDEX.brands.Carrier.oem.find((o) => !o.flag).url;
}

export const NOTION_URL = "https://app.notion.com/p/405402f833af819ea9e1d33df362fa40";
export const NO_TABLE_TEXT = "No code table in the official manual";
const NO_REMEDY = "No remedy stated in table";

// Document hosts checked by hand on 2026-10-26 (each PDF fetched: HTTP 200 application/pdf). Prefix match on host+path.
export const OFFICIAL_HOSTS = {
  "docs.fujitsugeneral.com/": "Fujitsu General's document host",
  "s3.amazonaws.com/enter.mehvac.com/": "Mitsubishi Electric Trane HVAC US asset bucket (mehvac.com DAM; PDF is Mitsubishi Electric OBH873B service manual) — this bucket only, not all of S3",
  "daikincomfort.com/": "Daikin Comfort Technologies North America",
  "www.daikincity.com/": "Daikin City — Daikin Comfort Technologies North America's B2B site (terms name Daikin Comfort Technologies North America, Inc.; contact @daikincomfort.com)",
  "media.us.lg.com/": "LG Electronics USA media host",
  "www.yorknow.com/": "York (Johnson Controls) dealer site",
  "elibrary.tranetechnologies.com/": "Trane Technologies literature library",
  "pts.rheem.com/": "Rheem product technical support docstore",
  "www.carrier.com/": "Carrier (brand product-documents page)",
  "carrier.com.pr/": "Carrier Puerto Rico (already accepted for the manuals index)",
  "www.lennox.com/": "Lennox",
  "mobile.goodmanmfg.com/": "Goodman Manufacturing",
  "hvacdirect.com/media/pdf/Fujitsu%20LZAS%20Service%20Manual.pdf": "HVACDirect dealer copy of Fujitsu General service manual SR_AS025EF_04 — this one file only, approved by Arthur 2026-10-30",
};
export const officialHost = (url) => {
  const hp = url.replace(/^https?:\/\//, "");
  return (isOfficialUrl(url) && Object.keys(OFFICIAL_HOSTS).find((p) => hp.startsWith(p) || hp.startsWith("www." + p))) || null;
};

// Which scanned models each section covers: model prefixes, compared after removing spaces and dashes.
export const SECTIONS = [
  [/^Fujitsu ASUG15LZAS/, "Fujitsu", ["ASUG09LZAS", "ASUG12LZAS", "ASUG15LZAS", "AOUG09LZAS", "AOUG12LZAS", "AOUG15LZAS"]],
  [/^Fujitsu AOUG15LZAH1/, "Fujitsu", ["AOUG09LZAH", "AOUG12LZAH", "AOUG15LZAH"]],
  [/^Fujitsu ASU9RLS3Y/, "Fujitsu", ["ASU9RLS3", "AOU9RLS3"]],
  [/^Mitsubishi MUZ-FS/, "Mitsubishi Electric", ["MUZFS", "MSZFS"]],
  [/^Daikin FIT/, "Daikin", ["DX6VS", "DZ6VS"]],
  [/^Daikin DX17VSS/, "Daikin", ["DX17VSS", "DZ17VSA"]],
  [/^LG Multi F/, "LG", ["LMU"]],
  [/^York YXV/, "York", ["YXV", "AC21", "AL21"]],
  [/^Trane XR16/, "Trane", ["5TTR7", "5TWR7"]],
  [/^Rheem RA17/, "Rheem", ["RA17"]],
  [/^Carrier 25HBC5/, "Carrier", ["25HBC5", "25HCE4"]],
  [/^Carrier 24ACB3/, "Carrier", ["24ACB3", "24ACC6", "24APB6"]],
  [/^Lennox EL16XC1/, "Lennox", ["EL16XC1"]],
  [/^Lennox ML14XC1/, "Lennox", ["ML14XC1"]],
  [/^Lennox ML17XC1/, "Lennox", ["ML17XC1"]],
  [/^Goodman GSXN4/, "Goodman", ["GSXN4"]],
];

const un = (s) => s.replace(/\\([\[\]_*\\|#<>~`-])/g, "$1").trim();
export function parsePage(md) {
  return md.split(/^## /m).slice(1).map((s) => {
    const lines = s.split("\n");
    const body = lines.slice(1).join("\n");
    const rows = [];
    for (const l of lines) if (/^\| /.test(l) && !/^\| ---/.test(l)) rows.push(l.slice(2, -2).split(/ (?<!\\)\| /).map(un));
    for (const tr of body.split("<tr>").slice(1)) rows.push(tr.split("<td>").slice(1).map((c) => un(c.split("</td>")[0])));
    const links = [...body.matchAll(/\[[^\]]*\]\((https?:[^)\s]+)\)/g)].map((m) => m[1]);
    return { title: un(lines[0]), note: un((body.match(/^Verified[^\n]*/m) || [""])[0]), body, header: rows[0] || [], rows: rows.slice(1), links };
  });
}

// Code keys a tech can type. Only taken from the code cell as printed; rows without one are picked from the list.
export function codeKeys(cell) {
  let m;
  if ((m = cell.match(/^E: (\w+) —/))) return [m[1]];
  if ((m = cell.match(/^Thermostat (\w+?)(?:\*\d)? \/ Control board LED (\S+)/))) return [...new Set([m[1], ...(m[2] === "-" ? [] : [m[2]])])];
  if ((m = cell.match(/^Dual 7-segment LED: (\w+)/))) return [m[1]];
  if ((m = cell.match(/^Value (\w+) \(/))) return [m[1]];
  if ((m = cell.match(/^(\w{1,3}) (?:—|\()/))) return [m[1]];
  return [];
}

function verifyYork(pdf, rows) {
  const N = (s) => s.toLowerCase().replace(/[‐-―–—-]/g, "-").replace(/[^a-z0-9]+/g, "");
  const raw = {};
  const page = (n) => (raw[n] ??= execFileSync("pdftotext", ["-f", String(n), "-l", String(n), pdf, "-"]).toString());
  const LABEL = new Set(["blink", "also", "od", "display"]); // researcher's labels in the code cell, not manual text
  return rows.map((r) => {
    const p = +(r[4].match(/PDF p\.(\d+)/) || [])[1];
    const pages = [p - 1, p, p + 1].filter((n) => n > 0 && n <= 28).map(page);
    const flat = pages.map(N).join(""), words = new Set(pages.join(" ").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
    const pieces = [["code", r[0].replace(/^[^:]*:\s*/, "").split(" — ")[0]], ["meaning", r[1]],
      ...r[2].split(/; | → /).filter((x) => x && x !== NO_REMEDY).map((x) => ["remedy", x])];
    const miss = pieces.filter(([, t]) => !flat.includes(N(t)) &&
      !t.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w && !LABEL.has(w)).every((w) => words.has(w)));
    return { ok: !!p && miss.length === 0, why: miss.map(([k]) => k).join(", ") };
  });
}

export function build(md, { yorkPdf } = {}) {
  const dropped = [], relinked = [];
  const sets = parsePage(md).map((sec) => {
    const def = SECTIONS.find(([re]) => re.test(sec.title));
    if (!def) throw new Error("Unmapped section: " + sec.title);
    const [, brand, models] = def;
    // Links in the note on unapproved hosts keep their label only.
    const note = sec.note.replace(/\[([^\]]*)\]\((https?:[^)\s]+)\)/g, (all, label, u) => (isOfficialUrl(u) ? all : label));
    const set = { brand, title: sec.title, models, note, rows: [] };
    if (!sec.rows.length) {
      let manual = sec.links.find((u) => /\.pdf/i.test(u)) || sec.links[0] || null;
      if (manual && !officialHost(manual) && brand === "Carrier") {
        const to = carrierRelink(models);
        relinked.push({ set: sec.title, was: new URL(manual).hostname + " (not an approved host)", now: to }); manual = to;
      }
      if (/no (code|error|fault)[- ]code table|no .*code table/i.test(sec.body) && !/unfetch|could not|couldn't/i.test(sec.body)) {
        set.noTable = { text: NO_TABLE_TEXT, url: manual };
      } else set.unavailable = true;
      return set;
    }
    const york = brand === "York" && yorkPdf ? verifyYork(yorkPdf, sec.rows) : null;
    sec.rows.forEach((r, i) => {
      const [codeCell, meaning, remedyCell, link, pageCell] = r;
      let url = (link.match(/\((https?:[^)\s]+)\)/) || [])[1];
      if (url && !officialHost(url) && brand === "Carrier") { const to = carrierRelink(models); relinked.push({ set: sec.title, row: i + 1, was: new URL(url).hostname + " (not an approved host)", now: to }); url = to; }
      const page = (pageCell.match(/p\.\s*(\d+)/) || [])[1];
      const label = `${brand} ${sec.title.split(" ").slice(1, 3).join(" ")} row ${i + 1} (${codeCell.slice(0, 50)})`;
      if (!url || !officialHost(url)) return dropped.push({ brand, row: label, reason: "source not on an OEM-official host: " + (url || "no URL") });
      if (brand === "York" && !york) throw new Error("York rows must be verified: pass --york-pdf");
      if (york && !york[i].ok) return dropped.push({ brand, row: label, reason: "not found on cited manual page (" + york[i].why + ")" });
      const flags = [];
      let pattern = codeCell, remedy = remedyCell;
      if (/LED cell blank\/merged in printed table/.test(codeCell)) { pattern = codeCell.match(/^(No\.\d+):/)[1]; flags.push("pattern-blank-in-manual"); }
      if (/^\(remedy cell shared with row above in printed table\)$/.test(remedyCell)) { remedy = ""; flags.push("remedy-blank-in-manual"); }
      if (remedyCell === NO_REMEDY) remedy = "";
      if (/ \[as printed\]$/.test(remedy)) { remedy = remedy.replace(/ \[as printed\]$/, ""); flags.push("as-printed"); }
      set.rows.push({ keys: codeKeys(codeCell), pattern, meaning, remedy, url, page: page ? +page : null, ...(flags.length ? { flags } : {}) });
    });
    return set;
  });
  const hosts = {};
  for (const s of sets) for (const u of [...s.rows.map((r) => r.url), s.noTable?.url].filter(Boolean)) {
    const h = officialHost(u); hosts[h] = OFFICIAL_HOSTS[h];
  }
  return { source: NOTION_URL, generator: "tools/gen-error-codes.mjs", noTableText: NO_TABLE_TEXT, hosts, sets, dropped, relinked };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [src, ...rest] = process.argv.slice(2);
  const yi = rest.indexOf("--york-pdf");
  const out = build(readFileSync(src, "utf8"), { yorkPdf: yi >= 0 ? rest[yi + 1] : null });
  writeFileSync(new URL("../data/error-codes.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
  const n = out.sets.reduce((a, s) => a + s.rows.length, 0);
  console.log(`rows kept ${n}, dropped ${out.dropped.length}`);
  for (const s of out.sets) console.log(`${s.title.slice(0, 40)}: ${s.rows.length}${s.noTable ? " (no table)" : ""}${s.unavailable ? " (unavailable)" : ""}`);
  for (const r of out.relinked) console.log("RELINKED", r.set, r.was, "->", r.now);
  for (const d of out.dropped) console.log("DROPPED", d.row, "-", d.reason);
}
