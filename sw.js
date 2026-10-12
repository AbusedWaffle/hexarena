// HexArena service worker. Netværk først (så nye commits altid slår igennem), cache som offline-fallback.
// Bump VERSION ved udgivelse for at rydde gamle caches.
const VERSION = 'hexarena-v1';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'vendor/phaser.min.js',
  'render/game.js', 'render/hud.js', 'render/inputSystem.js',
  'sim/world.js', 'sim/grid.js', 'sim/ai.js', 'net/transport.js', 'net/codec.js', 'net/session.js', 'vendor/peerjs.min.js',
  'art/palette.js', 'art/shapes.js', 'art/squareMap.js', 'art/abilityFx.js',
  'data/map_paintyard_sq_01.json', 'data/classes.square.json', 'data/ai.json',
  'icons/icon-192.png', 'icons/icon-512.png',
  'ui/menu.js', 'ui/lobby.js', 'vendor/qrcode.mjs', 'ui/menu.css', 'art/menu.css', 'data/menu.json',
  ...['assault', 'sniper', 'engineer', 'scout', 'support'].map((c) => 'art/icons/' + c + '_blue.svg')];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return; // PeerJS/WebRTC og andet eksternt røres ikke
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))));
});
