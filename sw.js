/* sw.js — 오프라인 서비스 워커 (모바일 ③ · 세션 53).
 *
 * 인터넷 주소(https · localhost)로 열었을 때만 돈다. 더블클릭(file://)과 테스트판 한 파일에서는 js/core/Pwa.js 가 등록하지 않는다.
 * 무엇을 저장할지는 여기서 정하지 않는다 — 페이지(Pwa.js)가 게임 파일 · 그림 목록을 모아 같은 저장소(CACHE)에 넣는다.
 * 이 파일은 "요청이 오면 어디서 줄지"만 정한다.
 *
 *   코드 · 화면(HTML · JS · CSS · 매니페스트): 인터넷 먼저 → 받으면 저장소도 새것으로 → 안 되면(오프라인 · 4초 넘게 응답 없음) 저장소.
 *                                         그래서 인터넷이 되면 항상 최신 판이다(고친 게 안 보이는 일이 없다).
 *   그림(png): 저장소 먼저(빠르다) → 뒤에서 인터넷으로 새것을 받아 저장소만 바꿔 둔다(다음에 열 때 반영).
 *   다른 주소(글꼴 등) · GET 이 아닌 요청: 손대지 않는다.
 */
'use strict';

var CACHE = 'porandi-v1';          // 저장 방식이 바뀔 때만 올린다(파일 내용이 바뀔 때는 안 올려도 된다 — 위 규칙으로 새것이 들어온다)
var NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', function () { self.skipWaiting(); });

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k.indexOf('porandi-') === 0 && k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function isImage(req, url) { return req.destination === 'image' || /\.png$/i.test(url.pathname); }

function fromCache(req) {
  return caches.open(CACHE).then(function (c) {
    return c.match(req, { ignoreSearch: true }).then(function (hit) {
      if (hit || req.mode !== 'navigate') return hit;
      // 오프라인에서 주소를 조금 다르게 열어도(./ · ./index.html?x) 게임 화면
      return c.match('index.html', { ignoreSearch: true }).then(function (page) { return page || c.match('./'); });
    });
  });
}

function store(req, res) {
  if (!res || !res.ok || res.type === 'opaque') return;
  var copy = res.clone();
  return caches.open(CACHE).then(function (c) { return c.put(req, copy); });
}

function networkFirst(event) {
  var req = event.request;
  return new Promise(function (resolve, reject) {
    var done = false;
    var timer = setTimeout(function () {
      // 응답이 너무 늦으면(약한 신호) 저장해 둔 것으로 — 인터넷 응답은 뒤에서 계속 받아 저장한다
      fromCache(req).then(function (hit) { if (hit && !done) { done = true; resolve(hit); } });
    }, NETWORK_TIMEOUT_MS);
    fetch(req).then(function (res) {
      event.waitUntil(Promise.resolve(store(req, res)));
      clearTimeout(timer);
      if (!done) { done = true; resolve(res); }
    }).catch(function (err) {
      clearTimeout(timer);
      fromCache(req).then(function (hit) {
        if (done) return;
        done = true;
        if (hit) resolve(hit); else reject(err);
      });
    });
  });
}

function cacheFirst(event) {
  var req = event.request;
  return fromCache(req).then(function (hit) {
    var refresh = fetch(req).then(function (res) { return Promise.resolve(store(req, res)).then(function () { return res; }); });
    if (hit) { event.waitUntil(refresh.catch(function () {})); return hit; }
    return refresh;
  });
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(isImage(req, url) ? cacheFirst(event) : networkFirst(event));
});
