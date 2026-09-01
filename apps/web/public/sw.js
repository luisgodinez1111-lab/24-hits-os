/* Service worker de 24 HITS OS — resiliencia offline para el reparto en campo.
 * Reglas:
 *  - NUNCA cachea mutaciones (POST/PATCH/etc.) ni auth → seguridad y frescura.
 *  - GET de la API: network-first, cae al último dato cacheado si no hay señal
 *    (así el repartidor sigue viendo su ruta/pedidos offline).
 *  - Navegación (HTML): network-first con caída a la última página / a /app.
 *  - Estáticos (_next/static, fuentes, íconos): cache-first (rápido y offline).
 *  - Externos (R2, CDN, OSRM): no se tocan.
 * Los estáticos de Next llevan hash en el nombre → un deploy nuevo invalida solo.
 */
const VERSION = "v1";
const SHELL_CACHE = `hits-shell-${VERSION}`;
const API_CACHE = `hits-api-${VERSION}`;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== SHELL_CACHE && k !== API_CACHE).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // mutaciones: siempre a la red, nunca caché
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // no interceptar R2/CDN/OSRM

  // API GET: network-first → caché → 503 offline.
  if (url.pathname.startsWith("/api/v1/")) {
    if (url.pathname.startsWith("/api/v1/auth/")) return; // nunca cachear sesión
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok) {
            const cache = await caches.open(API_CACHE);
            cache.put(req, res.clone());
          }
          return res;
        } catch {
          const cached = await caches.match(req);
          if (cached) return cached;
          return new Response(
            JSON.stringify({ error: { code: "OFFLINE", message: "Sin conexión" } }),
            { status: 503, headers: { "Content-Type": "application/json" } }
          );
        }
      })()
    );
    return;
  }

  // Navegación (documentos): network-first → última página cacheada → /app.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          const cache = await caches.open(SHELL_CACHE);
          cache.put(req, res.clone());
          return res;
        } catch {
          return (await caches.match(req)) || (await caches.match("/app")) ||
            new Response("Sin conexión", { status: 503 });
        }
      })()
    );
    return;
  }

  // Estáticos: cache-first.
  if (url.pathname.startsWith("/_next/") || /\.(?:js|css|woff2?|png|svg|ico|webmanifest)$/.test(url.pathname)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        try {
          const res = await fetch(req);
          if (res.ok) {
            const cache = await caches.open(SHELL_CACHE);
            cache.put(req, res.clone());
          }
          return res;
        } catch {
          return cached || Response.error();
        }
      })()
    );
  }
});
