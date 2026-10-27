/* Service Tech PWA — offline cache.
   Paths are relative to this file so it works at the GitHub Pages project
   path (/service-tech-ui/) and at a root domain alike.
   When you bump the ?v= cache-bust in the HTML/JS imports, bump VERSION here
   too (and update the versioned URLs below) so clients get a fresh cache.

   Strategy:
   - App files (ASSETS below): cache-first.
   - Any other same-origin GET: network-first, falling back to cache.
   - Navigations to pages not in the cache while offline: offline.html.
   - Cross-origin (Notion, GitHub): not handled, network only. */
importScripts("./version.js?v=27");
const VERSION = self.APP_VERSION; // "v27": one constant for the cache name and the footer label
const CACHE = "service-tech-" + VERSION;
const OFFLINE_URL = "./offline.html";

// Exact URLs the pages request (versioned ones include ?v=27).
const ASSETS = [
  "./",
  "./index.html",
  "./version.js?v=27",
  "./call.html",
  "./toolkit.html",
  "./tool.html",
  "./tree.html",
  "./manuals.html",
  "./docs.html",
  "./help.html",
  "./tools/help-app.js?v=27",
  "./tools/feedback.js?v=27",
  OFFLINE_URL,
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "./styles.css?v=27",
  "./app.js?v=27",
  // Every tools/*.js module:
  "./tools/tool-app.js?v=27",
  "./tools/registry.js",
  "./tools/registry-a.js",
  "./tools/registry-b.js",
  "./tools/logic.js?v=27",
  "./tools/logic-1.js?v=27",
  "./tools/logic-1b.js",
  "./tools/logic-2.js",
  "./tools/logic-2a.js",
  "./tools/logic-2b.js",
  "./tools/pt-tables.js?v=27",
  "./tools/plate-parse.js?v=27",
  "./tools/plate-heatcraft.js?v=27",
  "./tools/plate-image.js?v=27",
  "./tools/plate-scan.js?v=27",
  "./tools/plate-crop.js?v=27",
  "./tools/call-scan.js?v=27",
  "./tools/manuals.js?v=27",
  "./tools/trees.js?v=27",
  "./tools/tree-app.js?v=27",
  "./tools/tree-pick.js?v=27",
  "./tools/card-plate.js?v=27",
  "./tools/error-codes.js?v=27",
  "./tools/official-domains.js",
  "./data/error-codes.json?v=27",
  "./tools/prefill.js?v=27",
  "./tools/call-card.js?v=27",
  "./tools/manuals-helper.js?v=27",
  "./tools/manuals-helper-app.js?v=27",
  "./tools/last-plate.js?v=27",
  "./tools/scan-flow.js?v=27",
  "./tools/missing-model.js?v=27",
  "./tools/heic.js?v=27",
  // Manual links index (generated from the Notion Manuals page + OEM sources map).
  "./data/manuals-index.json?v=27",
  // On-device OCR (vendored Tesseract.js 7.0.0, ~15 MB; see vendor/tesseract/README.md).
  // All three LSTM core builds: the worker picks one from the device's wasm SIMD support.
  "./vendor/tesseract/tesseract.min.js",
  "./vendor/tesseract/worker.min.js",
  "./vendor/tesseract/core/tesseract-core-lstm.wasm.js",
  "./vendor/tesseract/core/tesseract-core-simd-lstm.wasm.js",
  "./vendor/tesseract/core/tesseract-core-relaxedsimd-lstm.wasm.js",
  "./vendor/tesseract/lang/eng.traineddata.gz",
  // HEIC/HEIF decoder (vendored libheif-js 1.19.8, ~1.4 MB; see vendor/libheif/README.md): precached, import()ed only for HEIC photos.
  "./vendor/libheif/libheif-bundle.mjs",
];
const ASSET_URLS = new Set(ASSETS.map((u) => new URL(u, self.location).href));
const PAGE_PATHS = new Set(
  ASSETS.filter((u) => u === "./" || u.endsWith(".html")).map((u) => new URL(u, self.location).pathname)
);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS.map((u) => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith("service-tech-") && k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Page asks whether every app file is cached (drives the "Available offline" badge).
self.addEventListener("message", (event) => {
  if (!event.data || event.data.type !== "cache-status" || !event.ports[0]) return;
  const port = event.ports[0];
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(ASSETS.map((u) => c.match(u))))
      .then((hits) => {
        const missing = ASSETS.filter((_, i) => !hits[i]);
        port.postMessage({ version: VERSION, complete: missing.length === 0, missing });
      })
      .catch(() => port.postMessage({ version: VERSION, complete: false }))
  );
});

function putInCache(key, res) {
  if (res && res.status === 200 && res.type === "basic") {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(key, copy));
  }
  return res;
}

function networkFirst(req) {
  return fetch(req)
    .then((res) => putInCache(req, res))
    .catch(() => caches.match(req).then((hit) => hit || Promise.reject(new Error("offline"))));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // network only

  if (req.mode === "navigate") {
    if (PAGE_PATHS.has(url.pathname)) {
      // App page (e.g. tool.html?id=...): cache-first, query ignored.
      event.respondWith(
        caches.match(url.pathname, { ignoreSearch: true })
          .then((hit) => hit || fetch(req).then((res) => putInCache(url.pathname, res)))
          .catch(() => caches.match(OFFLINE_URL))
      );
    } else {
      event.respondWith(networkFirst(req).catch(() => caches.match(OFFLINE_URL)));
    }
    return;
  }

  if (ASSET_URLS.has(url.href)) {
    // App files: cache-first (exact match keeps ?v= versions distinct).
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => putInCache(req, res))));
    return;
  }

  event.respondWith(networkFirst(req));
});
