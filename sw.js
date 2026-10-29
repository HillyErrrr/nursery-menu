/* Kitchen pages offline: keeps a copy of the page itself (app.html, the
   login page, logos, icons, fonts) so an iPad that reloads while the Wi-Fi
   is down still opens. The menu data is NOT handled here -- the page keeps
   its own copy of the last menu it loaded (see fetchSeasonJson in
   app.html), because only the page knows when an old copy is acceptable
   (a kitchen) and when it is not (Staff admin).

   Network first, always: when the connection works, everything comes from
   the site exactly as before, so a new deploy shows straight away. The
   copy is only used when the network fails or takes more than 8 seconds.

   To switch this off, replace this file with one that only unregisters
   itself (self.registration.unregister()) and deploy. */
const CACHE = 'kitchen-shell-v1';
const TIMEOUT_MS = 8000;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('kitchen-shell-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

function handled(url) {
  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/.netlify/')) return false;   // data and logins: the page decides
    if (/\/db-setup\.html$/.test(url.pathname)) return false;   // the database page is never served from a copy
    return true;
  }
  return url.hostname === 'cdnjs.cloudflare.com' || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (!handled(url)) return;
  event.respondWith(networkFirst(event, req, url));
});

async function networkFirst(event, req, url) {
  const cache = await caches.open(CACHE);
  const network = fetch(req).then((res) => {
    if (res && (res.ok || res.type === 'opaque')) {
      const copy = res.clone();
      cache.put(req, copy).catch(() => {});
    }
    return res;
  });
  network.catch(() => {});   // a late failure after the copy was served is not an error
  const timeout = new Promise((resolve) => setTimeout(() => resolve('timeout'), TIMEOUT_MS));
  try {
    const first = await Promise.race([network, timeout]);
    if (first !== 'timeout') return first;
  } catch (e) { /* offline: use the copy */ }
  const page = req.mode === 'navigate' || /\.html$/.test(url.pathname) || url.pathname === '/';
  const hit = (await cache.match(req)) || (page ? await cache.match(req, { ignoreSearch: true }) : null);
  if (hit) return hit;
  return network;   // nothing kept: wait for the network after all (or fail as before)
}
