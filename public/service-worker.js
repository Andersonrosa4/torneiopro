const CACHE_NAME = "torneio-pro-v9";
const STATIC_ASSETS = [
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/favicon.ico",
];

// Allow page to trigger immediate activation of a new SW version.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Install — pre-cache static assets and activate immediately
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

// Activate — clean old caches and take control immediately
self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      ),
      self.clients.claim(),
    ])
  );
});

// Fetch strategy:
// - HTML/navigations + JS/CSS bundles: Network First (always pull fresh app code)
// - Other static assets: Cache First
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = request.url;
  if (url.startsWith("chrome-extension")) return;
  if (url.includes("/~oauth")) return;
  if (url.includes("supabase")) return;
  if (
    url.includes("/node_modules/.vite/") ||
    url.includes("/src/") ||
    url.includes("/@vite/") ||
    url.includes("/@react-refresh") ||
    url.includes("?v=") ||
    url.includes("?t=")
  ) {
    return;
  }

  const isAppCode =
    request.mode === "navigate" ||
    request.destination === "document" ||
    request.destination === "script" ||
    request.destination === "style" ||
    url.endsWith(".html") ||
    url.endsWith(".js") ||
    url.endsWith(".css");

  if (isAppCode) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && url.startsWith(self.location.origin)) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("/")))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && url.startsWith(self.location.origin)) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => {});
        }
        return response;
      });
    })
  );
});
