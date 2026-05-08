// KILL-SWITCH SERVICE WORKER
// Limpa qualquer cache antigo e desregistra a si mesmo.
// Garante que TODO dispositivo (PC, celular, tablet) volte a buscar HTML/JS
// frescos do servidor a cada visita — sem nunca mais ficar preso em versão velha.
self.addEventListener("install", (e) => e.waitUntil(self.skipWaiting()));

self.addEventListener("activate", (e) =>
  e.waitUntil(
    (async () => {
      try {
        await self.clients.claim();
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
        const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        await Promise.all(
          clients.map((c) => {
            try {
              const url = new URL(c.url);
              url.searchParams.set("sw-cleanup", Date.now().toString());
              return c.navigate(url.toString());
            } catch {
              return Promise.resolve();
            }
          })
        );
      } finally {
        await self.registration.unregister();
      }
    })()
  )
);

// Nunca intercepta fetch — tudo vai direto pra rede.
self.addEventListener("fetch", () => {});
