const CACHE="dorenbos-v33";

self.addEventListener("install", event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Always fetch the main app and manifest fresh.
  if (
    url.pathname.endsWith("/index.html") ||
    url.pathname.endsWith("/dorenbos/") ||
    url.pathname.endsWith("/dorenbos") ||
    url.pathname.endsWith("/manifest.json") ||
    url.pathname.endsWith("/sw.js")
  ) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
        .then(response => {
          if (url.pathname.endsWith("/index.html") || url.pathname.endsWith("/manifest.json")) {
            const copy = response.clone();
            caches.open(CACHE).then(cache => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
        return response;
      });
    })
  );
});
