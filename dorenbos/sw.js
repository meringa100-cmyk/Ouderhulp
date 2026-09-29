const CACHE="dorenbos-v22";
self.addEventListener("install",e=>self.skipWaiting());
self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET") return;
  const url=new URL(e.request.url);
  if(url.pathname.endsWith("/index.html") || url.pathname.endsWith("/dorenbos/") || url.pathname.endsWith("/dorenbos")){
    e.respondWith(fetch(e.request,{cache:"no-store"}).catch(()=>caches.match(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(x=>{const c=x.clone();caches.open(CACHE).then(a=>a.put(e.request,c));return x}).catch(()=>caches.match("./index.html"))));
});