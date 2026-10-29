/*!
 * Snow Lexis · Service Worker
 * 作用：① 手机「添加到主屏幕」后可离线打开；② 缓存页面外壳与词库数据，断网也能背。
 * 策略：页面/资源用「网络优先，失败回落缓存」；/api/ 请求不缓存（保证同步数据实时）。
 */
const CACHE = 'youyuan-v3';   // 改版本号 = 浏览器下次打开时重建缓存（改过静态资源就升一格）
// 注意：assets/js/words-wiki.js（25k 词，约 5MB）故意不放进 SHELL 预缓存，
// 免得安装时卡住；它由下面的 fetch 处理器在首次加载后按需缓存，断网照样能背。
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/css/styles.css',
  './assets/js/tree.js',
  './assets/js/words.js',
  './assets/js/images.js',
  './assets/js/data.js',
  './assets/js/review.js',
  './assets/js/api.js',
  './assets/js/app.js',
  './assets/icon-192.png',
  './assets/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(SHELL.map(function (u) {
        return c.add(new Request(u, { cache: 'reload' })).catch(function () { /* 单个失败不影响安装 */ });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 同步接口 / 跨域请求：不缓存，直接走网络
  if (url.pathname.indexOf('/api/') === 0 || url.origin !== location.origin) return;

  e.respondWith(
    fetch(req).then(function (res) {
      const copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () {});
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        return hit || caches.match('./index.html');
      });
    })
  );
});
