const shell = 'counting-room-2026-v17';
const assets = ['./','index.html','style.css','app.js','geography.js','county.js','elections.html','elections.js','compare.js','local.js','local-2026.json','history/index.json','elections.css','outlook.js','national.js','prior-party.js','celebrate.js','coverage.js','states.json','manifest.webmanifest','icon.svg','icon-192.png','icon-512.png','snapshot-senate.json','snapshot-house.json','snapshot-governor.json',...Array.from({length:10},(_,index)=>'history/'+(2016+index)+'.json')];
self.addEventListener('install',event=>event.waitUntil(caches.open(shell).then(cache=>cache.addAll(assets))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('counting-room-2026-') && key!==shell).map(key=>caches.delete(key))))));
self.addEventListener('fetch',event=>{
  if (event.request.method!=='GET' || new URL(event.request.url).origin!==location.origin) return;
  event.respondWith(fetch(event.request).catch(()=>caches.match(event.request,{ignoreSearch:event.request.mode==='navigate'})));
});
