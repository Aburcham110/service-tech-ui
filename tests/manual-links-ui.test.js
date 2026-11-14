import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { oemCard, renderOemCard, CARD_TITLE } from "../tools/manual-links-ui.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

// Minimal DOM stand-in: enough for createElement/appendChild/textContent.
function fakeDoc() {
  const mk = (tag) => ({ tag, children: [], className: "", hidden: false, _t: "",
    set textContent(v) { this._t = v; this.children = []; }, get textContent() { return this._t + this.children.map((c) => c.textContent).join(""); },
    appendChild(c) { this.children.push(c); return c; } });
  return { createElement: mk, root: mk("section") };
}
const all = (n, tag) => [...(n.tag === tag ? [n] : []), ...n.children.flatMap((c) => all(c, tag))];
// TEST FIXTURE: .invalid host.
const IX = { entries: [{ brand: "Daikin", model: "fixture", matchKeys: ["RXYQ*TATJU"], docTitle: "Fixture doc", status: "MATCHED (newer rev)", url: "https://fixture.invalid/a.pdf", verifiedDate: "2026-11-13" }] };

test("OEM manuals card: hidden without a model, one card with linked rows when matched", () => {
  assert.equal(oemCard(IX, { model: "  " }), null);
  const d = fakeDoc();
  renderOemCard(d.root, IX, { brand: "", model: "" }, d);
  assert.equal(d.root.hidden, true);
  renderOemCard(d.root, IX, { brand: "daikin", model: "RXYQ72TATJU" }, d);
  assert.equal(d.root.hidden, false);
  assert.equal(all(d.root, "h2").length, 1);
  assert.equal(all(d.root, "h2")[0].textContent, CARD_TITLE);
  const [a] = all(d.root, "a");
  assert.equal(a.href, "https://fixture.invalid/a.pdf");
  assert.equal(a.target, "_blank");
  assert.equal(a.rel, "noopener noreferrer");
  assert.match(a.textContent, /Daikin — Fixture doc/);
  assert.match(a.textContent, /Newer rev · verified 2026-11-13/);
  assert.match(d.root.textContent, /Educational only — verify with OEM/);
});

test("OEM manuals card: non-OEM rows show the 'Not OEM source' label", () => {
  const d = fakeDoc();
  const ix = { entries: [{ brand: "Radiant Floor Company", model: "fixture", matchKeys: ["RADIANT*"], docTitle: "Fixture", status: "MATCHED", url: "https://www.radiantcompany.com/fixture.pdf", verifiedDate: "2026-11-13", nonOem: true }] };
  renderOemCard(d.root, ix, { brand: "", model: "RADIANT1" }, d);
  const [li] = all(d.root, "li");
  assert.equal(li.className, "oem-not-oem");
  assert.match(li.textContent, /Not OEM source · verified 2026-11-13/);
  assert.ok(!/Exact/.test(li.textContent));
});

test("OEM manuals card: no match shows the exact fallback text", () => {
  const d = fakeDoc();
  renderOemCard(d.root, IX, { brand: "Daikin", model: "NOPE12345" }, d);
  assert.equal(all(d.root, "a").length, 0);
  assert.equal(all(d.root, "p")[0].textContent, "No indexed manual. Check the OEM portal.");
});

test("manuals.html hosts one OEM card; same-origin index, precached; disclaimers kept; no localhost / Open WebUI", () => {
  const html = read("manuals.html");
  assert.equal((html.match(/id="mh-oem"/g) || []).length, 1);
  assert.match(html, /Educational only — verify with OEM/);
  const sw = read("sw.js");
  const v = sw.match(/version\.js\?v=(\d+)/)[1];
  for (const f of ["./tools/manual-match.js", "./tools/manual-links-ui.js", "./data/manual-index.json"]) assert.ok(sw.includes('"' + f + "?v=" + v + '"'), f);
  const src = read("tools/manual-match.js") + read("tools/manual-links-ui.js") + read("tools/manuals-helper-app.js");
  assert.match(read("tools/manual-match.js"), /new URL\("\.\.\/data\/manual-index\.json\?v=\d+", import\.meta\.url\)/);
  assert.ok(!/localhost|127\.0\.0\.1|open.?webui/i.test(src + html));
  assert.ok(!/\.pdf["'`]|blob\(|arrayBuffer\(/.test(read("tools/manual-links-ui.js") + read("tools/manual-match.js")), "no PDF fetch or proxy");
  assert.match(read("help.html"), /<strong>OEM manuals<\/strong>/);
});

test("sw: every precached asset is same-origin; off-origin GETs are never answered, fetched or cached", async () => {
  const sw = read("sw.js").replace(/importScripts\([^)]*\);/, "");
  const listeners = {}; const fetched = []; const put = [];
  const self = { APP_VERSION: "vtest", location: new URL("https://app.example/service-tech-ui/sw.js"), addEventListener: (t, f) => (listeners[t] = f), skipWaiting() {}, clients: { claim() {} } };
  const caches = { open: async () => ({ put: (k) => put.push(k), addAll: async () => {}, match: async () => null }), match: async () => null, keys: async () => [] };
  const ctx = { self, caches, URL, Request: class { constructor(u) { this.url = u; } }, Response, fetch: (r) => { fetched.push(r); return Promise.resolve(new Response("x")); } };
  vm.runInNewContext(sw + "\n;self.__ASSETS = ASSETS;", ctx);
  for (const u of self.__ASSETS) assert.equal(new URL(u, self.location).origin, self.location.origin, u);
  for (const url of ["https://daikincomfort.com/docs/a.pdf", "https://www.notion.so/x"]) {
    let responded = false;
    listeners.fetch({ request: { url, method: "GET", mode: "no-cors" }, respondWith: () => { responded = true; } });
    assert.equal(responded, false, url);
  }
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(fetched.length, 0);
  assert.equal(put.length, 0);
  assert.match(read("sw.js"), /res\.type === "basic"/, "only same-origin (basic) responses are ever cached");
});
