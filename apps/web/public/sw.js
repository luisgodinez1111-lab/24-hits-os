/* Service worker de 24 HITS OS — resiliencia offline para el reparto en campo.
 * Reglas:
 *  - NUNCA cachea mutaciones (POST/PATCH/etc.) ni auth → seguridad y frescura.
 *  - GET de la API: network-first, cae al último dato cacheado si no hay señal
 *    (así el repartidor sigue viendo su ruta/pedidos offline).
 *  - Navegación (HTML): network-first con caída a la última página / a /app.
 *  - Estáticos (_next/static, fuentes, íconos): cache-first (rápido y offline).
 *  - Externos (R2, CDN, OSRM): no se tocan.
 * Los estáticos de Next llevan hash en el nombre → un deploy nuevo invalida solo.
 *
 * Auto-update: el registrador registra este SW como `/sw.js?v=<build>` (build = commit
 * o timestamp del deploy). Cada deploy ⇒ URL distinta ⇒ el navegador instala un SW
 * nuevo. Leemos ese `?v=` para nombrar la caché del shell POR BUILD, así `activate`
 * purga la del build anterior. La caché de la API se mantiene estable entre deploys
 * (no perder los últimos datos offline del reparto).
 */
const BUILD = (() => {
  try {
    return new URL(self.location.href).searchParams.get("v") || "v1";
  } catch {
    return "v1";
  }
})();
const SHELL_CACHE = `hits-shell-${BUILD}`;
const API_CACHE = "hits-api-v1"; // estable entre deploys (datos offline)
const MAP_CACHE = "hits-map-v1"; // mapa self-hosted (R2): estable entre deploys, offline en campo

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== SHELL_CACHE && k !== API_CACHE && k !== MAP_CACHE).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // mutaciones: siempre a la red, nunca caché
  const url = new URL(req.url);

  // Mapa self-hosted (R2/CDN, cross-origin): cachear para navegar OFFLINE en campo.
  // Network-first (fresco online, resiliente sin señal). El .pmtiles usa range requests
  // → clave de caché por rango; y como la Cache API no admite guardar respuestas 206,
  // guardamos el cuerpo como 200 con el Content-Range en X-Content-Range y reconstruimos
  // el 206 al servir offline (lo que MapLibre/pmtiles espera).
  const isMapAsset =
    /\.pmtiles$/.test(url.pathname) ||
    /\/fonts\/.+\.pbf$/.test(url.pathname) ||
    /\/style(\.light)?\.json$/.test(url.pathname);
  if (isMapAsset) {
    const range = req.headers.get("range") || "";
    const key = new Request(range ? req.url + "|range=" + range : req.url);
    event.respondWith(
      (async () => {
        const cache = await caches.open(MAP_CACHE);
        try {
          const res = await fetch(req);
          if (res.status === 206) {
            const buf = await res.clone().arrayBuffer();
            await cache.put(
              key,
              new Response(buf, {
                status: 200,
                headers: {
                  "X-Content-Range": res.headers.get("Content-Range") || "",
                  "Content-Type": res.headers.get("Content-Type") || "application/octet-stream",
                },
              })
            );
          } else if (res.ok) {
            await cache.put(key, res.clone());
          }
          return res;
        } catch {
          const cached = await cache.match(key);
          if (!cached) return Response.error();
          const cr = cached.headers.get("X-Content-Range");
          if (cr) {
            const buf = await cached.arrayBuffer();
            return new Response(buf, {
              status: 206,
              headers: {
                "Content-Range": cr,
                "Accept-Ranges": "bytes",
                "Content-Type": cached.headers.get("Content-Type") || "application/octet-stream",
              },
            });
          }
          return cached;
        }
      })()
    );
    return;
  }

  if (url.origin !== self.location.origin) return; // no interceptar OSRM u otros externos

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
