/* Service Tech PWA — offline cache.
   Paths are relative to this file so it works at the GitHub Pages project
   path (/service-tech-ui/) and at a root domain alike.
   When you bump the ?v= cache-bust in the HTML/JS imports, bump VERSION here
   too (and update the versioned URLs below) so clients get a fresh cache. */
const VERSION = "v3";
const CACHE = "service-tech-" + VERSION;

// Exact URLs the pages request (versioned ones include ?v=3).
const ASSETS = [
  "./",
  "./index.html",
  "./call.html",
  "./toolkit.html",
  "./tool.html",
  "./docs.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./styles.css?v=3",
  "./app.js?v=3",
  "./tools/tool-app.js?v=3",
  "./tools/registry.js",
  "./tools/registry-a.js",
  "./tools/registry-b.js",
  "./tools/logic.js?v=3",
  "./tools/logic-1.js?v=3",
  "./tools/logic-1b.js",
  "./tools/logic-2.js",
  "./tools/logic-2a.js",
  "./tools/logic-2b.js",
  "./tools/pt-tables.js?v=3",
];

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

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Cross-origin (e.g. Notion OEM map, GitHub links): network only, not cached.
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    // Pages like tool.html?id=... : match the HTML file regardless of query.
    event.respondWith(
      caches.match(req, { ignoreSearch: true }).then((cached) =>
        cached || fetch(req).then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(url.pathname, copy));
          }
          return res;
        }).catch(() => caches.match("./index.html"))
      )
    );
    return;
  }

  // Assets: exact match (keeps ?v= versions distinct), then network, caching 200s.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      });
    })
  );
});
