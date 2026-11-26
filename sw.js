// The service worker that lets Firelight be installed as an app (a Chromebook, a phone's home screen) and keep
// working with no connection. Online it always asks the network first, so a new version shows up on the next
// load; if the network is gone or too slow, it plays from what it saved last time.

const CACHE = 'firelight-v1';
const CORE = [
  './', 'index.html', 'style.css', 'main.js', 'sound.js', 'doom.js', 'score.js', 'achievements.js', 'challenges.js',
  'manifest.webmanifest', 'favicon.svg', 'favicon-32.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png',
  'assets/doom-shotgun.webp', 'sounds/manifest.json',
];
const FONTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const SLOW = 3000;   // ms to wait for the network before falling back to the saved copy

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(CORE);
    // every recorded sound the game knows about
    try {
      const man = await (await fetch('sounds/manifest.json')).json();
      await c.addAll(Object.values(man).flat().map((f) => `sounds/${f}`));
    } catch (err) { /* the game falls back to synthesized sound */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // the font never changes: saved copy first
  if (FONTS.includes(url.hostname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
      return res;
    })));
    return;
  }
  if (url.origin !== self.location.origin) return;
  // the big soundtrack file streams with range requests; leave it to the network
  if (url.pathname.startsWith('/music/') || req.headers.has('range')) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const net = fetch(req).then((res) => {
      if (res.ok) c.put(req, res.clone());
      return res;
    });
    const timeout = new Promise((resolve) => setTimeout(resolve, SLOW));
    try {
      const res = await Promise.race([net, timeout]);
      if (res) return res;
    } catch (err) { /* offline */ }
    const hit = await c.match(req, { ignoreSearch: true });
    if (hit) return hit;
    return net;   // nothing saved: keep waiting on the network
  })());
});
