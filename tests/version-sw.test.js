import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import vm from "node:vm";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const load = () => { const ctx = { self: {} }; vm.runInNewContext(read("version.js"), ctx); return ctx.self; };

test("version: footer label and SW cache name come from the same constant", () => {
  const { APP_VERSION } = load();
  assert.match(APP_VERSION, /^v\d+$/);
  const sw = read("sw.js");
  assert.ok(sw.includes('importScripts("./version.js?v=' + APP_VERSION.slice(1) + '")'));
  assert.match(sw, /const VERSION = self\.APP_VERSION;/);
  assert.match(sw, /const CACHE = "service-tech-" \+ VERSION;/);
  assert.ok(!/const VERSION = "v\d+"/.test(sw), "no second hard-coded version");
  assert.ok(sw.includes('"./version.js?v=' + APP_VERSION.slice(1) + '"'), "version.js precached");
  const app = read("app.js");
  assert.match(app, /p\.textContent = "Version " \+ v/);
  assert.match(app, /const v = self\.APP_VERSION/);
  for (const f of readdirSync(new URL("..", import.meta.url)).filter((f) => f.endsWith(".html"))) {
    const h = read(f);
    if (!h.includes("app.js?v=")) continue;
    assert.ok(h.indexOf('version.js?v=' + APP_VERSION.slice(1)) >= 0 && h.indexOf("version.js?v=") < h.indexOf("app.js?v="), f + " loads version.js before app.js");
  }
});

test("sw: skipWaiting on install, clients.claim on activate, page reloads on controllerchange", () => {
  const sw = read("sw.js");
  assert.match(sw, /self\.skipWaiting\(\)/);
  assert.match(sw, /self\.clients\.claim\(\)/);
  const app = read("app.js");
  assert.match(app, /addEventListener\("controllerchange"[\s\S]{0,300}stOnControllerChange/);
  assert.match(app, /updateViaCache: "none"/);
});

test("sw: reload once per update, never on first install, never in a loop", () => {
  const { stOnControllerChange } = load();
  const store = new Map(); const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  let n = 0; const reload = () => n++;
  assert.equal(stOnControllerChange({ hadController: false, storage, reload, now: 1e6 }), false);
  assert.equal(n, 0, "first install: no reload");
  assert.equal(stOnControllerChange({ hadController: true, storage, reload, now: 1e6 }), true);
  assert.equal(stOnControllerChange({ hadController: true, storage, reload, now: 1e6 + 5000 }), false);
  assert.equal(stOnControllerChange({ hadController: true, storage, reload, now: 1e6 + 29000 }), false);
  assert.equal(n, 1, "only one reload");
  assert.equal(stOnControllerChange({ hadController: true, storage, reload, now: 1e6 + 120000 }), true, "a later update reloads again");
  assert.equal(n, 2);
});
