/* sw.js — 오프라인 서비스 워커 (세션 53 · 모바일 ④ 세션 71 에 다시 짰다).
 *
 * 인터넷 주소(https · localhost)로 열었을 때만 돈다. 더블클릭(file://)과 테스트판 한 파일에서는 js/core/Pwa.js 가 등록하지 않는다.
 * 무엇을 미리 받을지는 pwa-precache.js(tools/build-pwa.js 가 만들어 커밋 — npm run check 가 실제 파일과 같은지 본다).
 *
 * 최우선: "옛 버전이 계속 뜨는" 일을 만들지 않는다.
 *   코드 · 화면(HTML · JS · CSS · 매니페스트) : 인터넷 먼저 → 받으면 저장소도 새것으로 → 안 되면(오프라인 · 3초 넘게 응답 없음) 저장소.
 *                                         인터넷이 되면 항상 최신이라, 코드를 올릴 때마다 저장소 이름을 올릴 필요가 없다.
 *   그림(assets/**.png)                  : 저장소 먼저. 저장소 이름에 그림 목록 · 내용의 해시(PRECACHE.hash)가 들어가
 *                                         그림이 바뀌면 새 서비스 워커 → 새 저장소로 받고, 켜질 때 예전 그림 저장소를 지운다.
 *   assets/music                          : 가로채지 않는다(사파리가 서비스 워커로 받은 오디오의 Range 요청을 못 다루고, 용량도 크다).
 *   다른 주소(글꼴 등) · GET 이 아닌 요청 : 손대지 않는다.
 *
 * 새 서비스 워커는 스스로 끼어들지 않는다(skipWaiting 없음). 페이지가 "새 버전이 있어요 [새로고침]"을 띄우고,
 * 사람이 누를 때만 SKIP_WAITING 을 받아 바뀐다 — 판 도중에 페이지가 바뀌어 판이 사라지는 일이 없다.
 */
'use strict';

importScripts('pwa-precache.js');

var PRECACHE = self.PRECACHE || { hash: 'none', code: [], images: [] };
var CODE_CACHE = 'porandi-code';
var IMG_CACHE = 'porandi-img-' + PRECACHE.hash;
var NETWORK_TIMEOUT_MS = 3000;

function scoped(path) { return new URL(path, self.location).href; }
function isMusic(url) { return url.pathname.indexOf('/assets/music/') >= 0; }
function isImage(req, url) { return req.destination === 'image' || /\.png$/i.test(url.pathname); }

/* 설치 — 목록을 미리 받는다. 한 파일이 없어도(404 · 끊김) 나머지는 받는다(게임은 대체 그림으로 그린다). */
function precache(cacheName, list, onlyMissing) {
  return caches.open(cacheName).then(function (c) {
    return Promise.all(list.map(function (p) {
      var url = scoped(p);
      return (onlyMissing ? c.match(url) : Promise.resolve(null)).then(function (hit) {
        if (hit) return;
        return fetch(new Request(url, { cache: 'reload' })).then(function (res) {
          if (res && res.ok) return c.put(url, res);
        }).catch(function () {});
      });
    }));
  });
}

self.addEventListener('install', function (event) {
  event.waitUntil(Promise.all([
    precache(CODE_CACHE, PRECACHE.code, false),
    precache(IMG_CACHE, PRECACHE.images, true)
  ]));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k.indexOf('porandi-') === 0 && k !== CODE_CACHE && k !== IMG_CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* 페이지와 이야기 — SKIP_WAITING(사람이 [새로고침]을 눌렀다) · STATUS(오프라인 준비가 얼마나 됐나) */
self.addEventListener('message', function (event) {
  var msg = event.data || {};
  if (msg.type === 'SKIP_WAITING') { self.skipWaiting(); return; }
  if (msg.type === 'STATUS') {
    var reply = function (s) { if (event.ports && event.ports[0]) event.ports[0].postMessage(s); };
    Promise.all([caches.open(CODE_CACHE), caches.open(IMG_CACHE)]).then(function (cs) {
      var all = PRECACHE.code.map(function (p) { return [cs[0], p]; }).concat(PRECACHE.images.map(function (p) { return [cs[1], p]; }));
      return Promise.all(all.map(function (x) { return x[0].match(scoped(x[1])).then(function (h) { return h ? null : x[1]; }); }));
    }).then(function (res) {
      var missing = res.filter(Boolean);
      reply({ hash: PRECACHE.hash, total: res.length, saved: res.length - missing.length, missing: missing });
    }, function (err) { reply({ error: String(err) }); });
  }
});

function fromCache(cacheName, req) {
  return caches.open(cacheName).then(function (c) {
    return c.match(req, { ignoreSearch: true }).then(function (hit) {
      if (hit || req.mode !== 'navigate') return hit;
      // 오프라인에서 주소를 조금 다르게 열어도(./ · ./index.html?x · 홈 화면 아이콘) 게임 화면
      return c.match(scoped('index.html'), { ignoreSearch: true }).then(function (page) { return page || c.match(scoped('./')); });
    });
  });
}

function store(cacheName, req, res) {
  if (!res || !res.ok || res.type === 'opaque') return;
  var copy = res.clone();
  return caches.open(cacheName).then(function (c) { return c.put(req, copy); });
}

function networkFirst(event) {
  var req = event.request;
  return new Promise(function (resolve, reject) {
    var done = false;
    var timer = setTimeout(function () {
      // 응답이 너무 늦으면(약한 신호) 저장해 둔 것으로 — 인터넷 응답은 뒤에서 계속 받아 저장한다
      fromCache(CODE_CACHE, req).then(function (hit) { if (hit && !done) { done = true; resolve(hit); } });
    }, NETWORK_TIMEOUT_MS);
    fetch(req).then(function (res) {
      event.waitUntil(Promise.resolve(store(CODE_CACHE, req, res)));
      clearTimeout(timer);
      if (!done) { done = true; resolve(res); }
    }).catch(function (err) {
      clearTimeout(timer);
      fromCache(CODE_CACHE, req).then(function (hit) {
        if (done) return;
        done = true;
        if (hit) resolve(hit); else reject(err);
      });
    });
  });
}

/* 그림 — 저장소 먼저. 없으면 받아서 넣는다(그림이 바뀌면 hash 가 바뀌어 새 저장소가 되므로 뒤에서 다시 받을 필요가 없다) */
function cacheFirst(event) {
  var req = event.request;
  return fromCache(IMG_CACHE, req).then(function (hit) {
    if (hit) return hit;
    return fetch(req).then(function (res) { return Promise.resolve(store(IMG_CACHE, req, res)).then(function () { return res; }); });
  });
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (isMusic(url)) return;                         // 음악은 브라우저가 직접(Range 요청 · 용량)
  event.respondWith(isImage(req, url) ? cacheFirst(event) : networkFirst(event));
});
