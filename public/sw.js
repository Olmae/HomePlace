/*
 * Service worker — deliberately almost empty.
 *
 * Its job is to make the panel installable on a phone, not to cache it. A
 * dashboard exists to show the *current* state of a server, and a service
 * worker serving yesterday's page from cache would be showing a confident lie:
 * green dots for services that went down an hour ago.
 *
 * So: static assets are cached (they are content-hashed and safe), and
 * everything else goes to the network every time. When the network is gone,
 * the browser's own offline page is the honest answer.
 */

const STATIC_CACHE = "homeplace-static-v1";

self.addEventListener("install", (event) => {
  // Take over immediately instead of waiting for every tab to close — this is
  // one person's panel, not a site with a hundred open sessions.
  self.skipWaiting();
  event.waitUntil(caches.open(STATIC_CACHE));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Build output and icons only: their URLs change when their contents change.
  const cacheable = url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icon-");
  if (!cacheable) return;

  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((response) => {
          const copy = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
    )
  );
});
