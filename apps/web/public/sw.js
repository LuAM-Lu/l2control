/**
 * Service Worker mínimo de la aplicación.
 *
 * Existe para que Chrome ofrezca instalar la app. La caché sin conexión
 * (ADR-003) llegará con el backend; cachear ahora serviría pantallas viejas.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Deja pasar la petición a la red sin tocarla
  if (event.request.method === "GET" && event.request.url.startsWith(self.location.origin)) {
    event.respondWith(fetch(event.request));
  }
});
