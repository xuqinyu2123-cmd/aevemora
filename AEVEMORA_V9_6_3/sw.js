const CACHE="aevemora-v9-6-3-enforced-access-20260904";
const CORE=[
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "./access-config.js",
  "./backgrounds/cn-1-preqin.svg",
  "./backgrounds/cn-2-hantang.svg",
  "./backgrounds/cn-3-songming.svg",
  "./backgrounds/cn-4-frontier.svg",
  "./backgrounds/cn-5-landscape.svg",
  "./backgrounds/cn-6-modern.svg",
  "./backgrounds/fg-1-greece.svg",
  "./backgrounds/fg-2-rome.svg",
  "./backgrounds/fg-3-medieval.svg",
  "./backgrounds/fg-4-renaissance.svg",
  "./backgrounds/fg-5-enlightenment.svg",
  "./backgrounds/fg-6-modern.svg",
  "./backgrounds/mix-1-east.svg",
  "./backgrounds/mix-2-imperial.svg",
  "./backgrounds/mix-3-greece.svg",
  "./backgrounds/mix-4-rome.svg",
  "./backgrounds/mix-5-renaissance.svg",
  "./backgrounds/mix-6-modern.svg",
  "./dossiers/cn-1-preqin.svg",
  "./dossiers/cn-2-hantang.svg",
  "./dossiers/cn-3-songming.svg",
  "./dossiers/cn-4-frontier.svg",
  "./dossiers/cn-5-landscape.svg",
  "./dossiers/cn-6-modern.svg",
  "./dossiers/fg-1-greece.svg",
  "./dossiers/fg-2-rome.svg",
  "./dossiers/fg-3-medieval.svg",
  "./dossiers/fg-4-renaissance.svg",
  "./dossiers/fg-5-enlightenment.svg",
  "./dossiers/fg-6-modern.svg",
  "./dossiers/mix-1-east.svg",
  "./dossiers/mix-2-imperial.svg",
  "./dossiers/mix-3-greece.svg",
  "./dossiers/mix-4-rome.svg",
  "./dossiers/mix-5-renaissance.svg",
  "./dossiers/mix-6-modern.svg"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(CORE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

function isWikiRequest(url){
  return /(^|\.)wikipedia\.org$/.test(url.hostname) ||
         /(^|\.)wikimedia\.org$/.test(url.hostname);
}

self.addEventListener("fetch", event => {
  if(event.request.method !== "GET") return;

  const req=event.request;
  const url=new URL(req.url);

  // HTML：network-first，确保 GitHub Pages 更新后优先得到最新版。
  if(req.mode==="navigate" || req.destination==="document"){
    event.respondWith(
      fetch(req,{cache:"no-store"}).then(resp=>{
        const copy=resp.clone();
        caches.open(CACHE).then(cache=>cache.put("./index.html",copy));
        return resp;
      }).catch(()=>caches.match("./index.html"))
    );
    return;
  }

  // Wikipedia API / Wikimedia 图片：
  // cache-first。首次请求成功（包括 opaque 图片响应）后直接持久缓存，
  // 后续同一人物图片无需再次经过外部网络。
  if(isWikiRequest(url)){
    event.respondWith(
      caches.match(req).then(hit=>{
        if(hit) return hit;
        return fetch(req).then(resp=>{
          if(resp && (resp.ok || resp.type==="opaque")){
            caches.open(CACHE).then(cache=>cache.put(req,resp.clone())).catch(()=>{});
          }
          return resp;
        });
      })
    );
    return;
  }

  // 授权配置必须 network-first，不能让旧空配置长期命中缓存。
  if(url.pathname.endsWith("/access-config.js")){
    event.respondWith(
      fetch(req,{cache:"no-store"}).then(resp=>{
        if(resp && resp.ok){
          caches.open(CACHE).then(cache=>cache.put(req,resp.clone())).catch(()=>{});
        }
        return resp;
      }).catch(()=>caches.match(req))
    );
    return;
  }

  // 站内静态资源：stale-while-revalidate。
  event.respondWith(
    caches.match(req).then(hit=>{
      const network=fetch(req).then(resp=>{
        if(resp && resp.ok){
          caches.open(CACHE).then(cache=>cache.put(req,resp.clone())).catch(()=>{});
        }
        return resp;
      }).catch(()=>hit);
      return hit || network;
    })
  );
});