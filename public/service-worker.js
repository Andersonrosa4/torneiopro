const CACHE_NAME = "torneio-pro-v7";
const STATIC_ASSETS = [
  "/",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/favicon.ico",
];

// Install — pre-cache static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch — Network First for navigations, Cache First for assets
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Skip non-GET and chrome-extension requests
  if (request.method !== "GET" || request.url.startsWith("chrome-extension")) {
    return;
  }

  // Skip OAuth routes — must always hit network
  if (request.url.includes("/~oauth")) {
    return;
  }

  // Skip Supabase API calls
  if (request.url.includes("supabase")) {
    return;
  }

  // NEVER cache Vite dev server files — they must always be fresh
  if (request.url.includes("/node_modules/.vite/") || 
      request.url.includes("/src/") || 
      request.url.includes("/@vite/") ||
      request.url.includes("?v=") ||
      request.url.includes("?t=")) {
    return;
  }

  // Navigation requests — Network First
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("/")))
    );
    return;
  }

  // Static assets — Cache First
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        // Only cache successful same-origin responses
        if (response.ok && request.url.startsWith(self.location.origin)) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});
