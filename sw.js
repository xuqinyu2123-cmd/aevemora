const CACHE="aevemora-v9-8-8-mobile-compact-20260904";
const STATIC_CORE=[
  "./manifest.webmanifest","./icon-192.png","./icon-512.png","./apple-touch-icon.png","./owner-config.js",
  "./quiz-bg-1.svg","./quiz-bg-2.svg","./quiz-bg-3.svg","./quiz-bg-4.svg","./quiz-bg-5.svg","./quiz-bg-6.svg"
];

self.addEventListener("install",event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    await Promise.allSettled(STATIC_CORE.map(async url=>{
      try{
        const r=await fetch(url,{cache:"reload"});
        if(r.ok) await cache.put(url,r);
      }catch(e){}
    }));
    self.skipWaiting();
  })());
});

self.addEventListener("activate",event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE && /aevemora|historia/i.test(k)).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

async function networkWithTimeout(req,ms=4500){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),ms);
  try{return await fetch(req,{signal:controller.signal,cache:"no-store"});}
  finally{clearTimeout(timer);}
}

self.addEventListener("fetch",event=>{
  const req=event.request;
  if(req.method!=="GET") return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin) return; // 外部图片/API完全交给浏览器，SW不再放大失败链路

  if(req.mode==="navigate" || req.destination==="document"){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE);
      const shellKey=new Request(new URL("index.html",self.registration.scope).href);
      try{
        const resp=await networkWithTimeout(req,4500);
        if(resp && resp.ok){
          await cache.put(req,resp.clone());
          await cache.put(shellKey,resp.clone());
        }
        return resp;
      }catch(e){
        return (await cache.match(req)) || (await cache.match(shellKey)) || Response.error();
      }
    })());
    return;
  }

  if(url.pathname.endsWith("/owner-config.js")){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE);
      try{
        const resp=await networkWithTimeout(req,3000);
        if(resp && resp.ok) await cache.put(req,resp.clone());
        return resp;
      }catch(e){return (await cache.match(req)) || Response.error();}
    })());
    return;
  }

  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const hit=await cache.match(req);
    if(hit) return hit;
    try{
      const resp=await fetch(req);
      if(resp && resp.ok) cache.put(req,resp.clone()).catch(()=>{});
      return resp;
    }catch(e){return hit || Response.error();}
  })());
});
