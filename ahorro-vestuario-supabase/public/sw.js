// =============================================================
//  SERVICE WORKER · permite instalar la plataforma como app
//  - Siempre intenta traer la versión más nueva de internet.
//  - Si no hay señal, muestra la última versión guardada de la
//    página (los datos siempre vienen de Supabase, nunca de aquí).
// =============================================================
const CACHE = "danzantes-v2";
const BASE = [
  "./", "index.html", "css/estilos.css",
  "js/app.js", "js/servicio.js", "js/confeti.js", "js/supabase-config.js", "js/vendor/supabase.js",
  "img/logo-claro.png", "img/plumas.png", "img/app-192.png", "img/app-512.png", "manifest.webmanifest"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASE)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(claves => Promise.all(claves.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  const url = new URL(req.url);
  // Solo archivos de esta misma página; nada de Supabase ni de otros sitios
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then(resp => {
        if (resp && resp.ok) { const copia = resp.clone(); caches.open(CACHE).then(c => c.put(req, copia)); }
        return resp;
      })
      .catch(() => caches.match(req).then(r => r || caches.match("index.html")))
  );
});
