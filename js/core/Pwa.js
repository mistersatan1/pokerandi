/* Pwa.js — 홈 화면 앱 (모바일 ③ · 세션 53).
 *
 * 1) 오프라인: 인터넷 주소(https · localhost)로 열면 서비스 워커(sw.js)를 등록하고, 게임을 켤 때 필요한 파일
 *    (HTML · CSS · JS · 매니페스트 · 아이콘 · 게임이 쓰는 그림 전부)을 한 번 받아 저장소에 넣는다.
 *    그림은 게임이 쓰는 순간에야 불러오므로(Assets.get) 미리 넣지 않으면 오프라인에서 처음 보는 포켓몬이 대체 그림으로 나온다.
 *    목록은 손으로 적지 않는다 — index.html 의 <script> · <link> 와 게임 데이터(RPD 안의 'assets/….png' 문자열 ·
 *    EnemySkins.allFiles)에서 모은다. 새 파일 · 새 포켓몬을 넣어도 따로 할 일이 없다.
 * 2) 설치: 안드로이드 크롬이 주는 설치 이벤트(beforeinstallprompt)를 들고 있다가 ☰ 메뉴 [앱 설치]로 띄운다.
 *    이벤트가 없는 곳(아이폰 사파리 · 이미 설치 · 조건 미달)에는 방법을 말풍선으로 알려 준다.
 * 3) 전체 화면: 브라우저로 열었을 때 ☰ 메뉴 [전체 화면]. 설치한 앱은 매니페스트(display: fullscreen)로 처음부터 전체 화면.
 *
 * 더블클릭(file://)과 테스트판 한 파일(RPD_INLINE)에서는 오프라인 · 설치를 하지 않는다 — 브라우저가 허락하지 않는다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  var CACHE = 'porandi-v1';      // sw.js 의 CACHE 와 같아야 한다(검사가 본다)
  var PARALLEL = 4;              // 한꺼번에 받는 파일 수 — 휴대폰 회선을 다 막지 않게

  var Pwa = {
    CACHE: CACHE,
    status: 'off',               // off(못 씀) · wait · saving · ready(오프라인 준비 끝) · error
    saved: 0, total: 0, missing: [],
    installEvent: null
  };

  function emit() { if (RPD.bus) RPD.bus.emit('pwa:status', Pwa); }

  /* 오프라인 · 설치를 쓸 수 있는가 — 인터넷 주소 + 서비스 워커 + 한 파일 테스트판이 아님 */
  Pwa.supported = function () {
    var loc = global.location;
    return !!(loc && /^https?:$/.test(loc.protocol) && global.navigator && global.navigator.serviceWorker &&
      global.caches && !global.RPD_INLINE);
  };

  /* 설치한 앱으로 열렸는가(홈 화면 아이콘으로 실행) */
  Pwa.isApp = function () {
    var mm = global.matchMedia;
    return !!((mm && (mm('(display-mode: fullscreen)').matches || mm('(display-mode: standalone)').matches)) ||
      (global.navigator && global.navigator.standalone === true));
  };

  /* ---------- 저장할 파일 목록 ---------- */
  function collectSprites(out) {
    var seen = new Set();
    (function walk(v, depth) {
      if (typeof v === 'string') { if (/^assets\/[\w\/.-]+\.png$/.test(v)) out[v] = true; return; }
      if (!v || typeof v !== 'object' || depth > 6 || seen.has(v)) return;
      if (typeof Node !== 'undefined' && v instanceof Node) return;    // 화면 요소는 건너뛴다
      seen.add(v);
      for (var k in v) {
        if (!Object.prototype.hasOwnProperty.call(v, k)) continue;
        var x;
        try { x = v[k]; } catch (e) { continue; }
        if (typeof x !== 'function') walk(x, depth + 1);
      }
    })(RPD, 0);
    if (RPD.EnemySkins && RPD.EnemySkins.allFiles) RPD.EnemySkins.allFiles().forEach(function (f) { out[f] = true; });
  }

  Pwa.files = function (doc) {
    doc = doc || global.document;
    var out = { './': true, 'index.html': true };
    if (doc && doc.querySelectorAll) {
      var nodes = doc.querySelectorAll('script[src], link[rel="stylesheet"][href], link[rel="manifest"][href], link[rel~="icon"][href], link[rel="apple-touch-icon"][href]');
      for (var i = 0; i < nodes.length; i++) {
        var u = nodes[i].getAttribute('src') || nodes[i].getAttribute('href');
        if (u && !/^(https?:|data:|\/\/)/.test(u)) out[u] = true;
      }
      // 매니페스트 안의 아이콘(설치 화면)
      ['assets/icons/icon-192.png', 'assets/icons/icon-512.png', 'assets/icons/icon-maskable-512.png'].forEach(function (f) { out[f] = true; });
    }
    collectSprites(out);
    return Object.keys(out);
  };

  /* 저장소에 없는 것만 받아 넣는다. 없는 파일(404)은 건너뛰고 missing 에 남긴다(게임은 대체 그림으로 그린다). */
  Pwa.save = function () {
    var list = Pwa.files();
    Pwa.total = list.length; Pwa.saved = 0; Pwa.missing = [];
    Pwa.status = 'saving'; emit();
    return global.caches.open(CACHE).then(function (cache) {
      var next = 0;
      function one() {
        if (next >= list.length) return Promise.resolve();
        var url = list[next++];
        return cache.match(url, { ignoreSearch: true }).then(function (hit) {
          if (hit) return;
          return global.fetch(url, { cache: 'no-cache' }).then(function (res) {
            if (!res.ok) { Pwa.missing.push(url); return; }
            return cache.put(url, res);
          }, function () { Pwa.missing.push(url); });
        }).then(function () { Pwa.saved += 1; }).then(one);
      }
      var workers = [];
      for (var i = 0; i < PARALLEL; i++) workers.push(one());
      return Promise.all(workers);
    }).then(function () {
      Pwa.status = 'ready'; emit();
      return Pwa;
    }, function (err) {
      Pwa.status = 'error'; Pwa.error = String(err && err.message || err); emit();
      return Pwa;
    });
  };

  Pwa.start = function () {
    if (Pwa._started) return Pwa.ready;
    Pwa._started = true;
    if (global.addEventListener) {
      global.addEventListener('beforeinstallprompt', function (e) { Pwa.installEvent = e; emit(); });
      global.addEventListener('appinstalled', function () { Pwa.installEvent = null; emit(); });
    }
    if (!Pwa.supported()) { Pwa.status = 'off'; Pwa.ready = Promise.resolve(Pwa); return Pwa.ready; }
    Pwa.status = 'wait'; emit();
    // 게임 화면이 먼저 뜨고 나서 — 첫 그림 · 첫 소리와 회선을 다투지 않게
    Pwa.ready = global.navigator.serviceWorker.register('sw.js').then(function () {
      return new Promise(function (r) { setTimeout(r, 1500); });
    }).then(Pwa.save, function (err) {
      Pwa.status = 'error'; Pwa.error = String(err && err.message || err); emit();
      return Pwa;
    });
    return Pwa.ready;
  };

  /* ---------- 설치 ---------- */
  Pwa.installHelp = function () {
    if (Pwa.isApp()) return '이미 앱으로 실행 중입니다.';
    if (!Pwa.supported()) return '홈 화면 앱은 인터넷 주소(https)로 열었을 때만 만들 수 있습니다. 파일을 바로 열었거나 테스트판 한 파일이면 브라우저가 허락하지 않습니다.';
    var ua = (global.navigator && global.navigator.userAgent) || '';
    if (/iPhone|iPad|iPod/.test(ua)) return '사파리 아래쪽 공유 버튼(□↑) → [홈 화면에 추가]를 누르세요.';
    return '브라우저 메뉴(⋮) → [앱 설치] 또는 [홈 화면에 추가]를 누르세요.';
  };

  /* 설치 창을 띄운다. 띄웠으면 true — 못 띄우면 방법(installHelp)을 보여 줄 차례 */
  Pwa.install = function () {
    var ev = Pwa.installEvent;
    if (!ev || !ev.prompt) return false;
    Pwa.installEvent = null;     // 한 번만 쓸 수 있다
    ev.prompt();
    emit();
    return true;
  };

  /* ---------- 전체 화면 ---------- */
  Pwa.canFullscreen = function () {
    var d = global.document;
    return !!(d && (d.fullscreenEnabled || d.webkitFullscreenEnabled));
  };
  Pwa.isFullscreen = function () {
    var d = global.document;
    return !!(d && (d.fullscreenElement || d.webkitFullscreenElement));
  };
  Pwa.toggleFullscreen = function () {
    var d = global.document;
    if (!Pwa.canFullscreen()) return Promise.resolve(false);
    if (Pwa.isFullscreen()) {
      var exit = d.exitFullscreen || d.webkitExitFullscreen;
      return Promise.resolve(exit.call(d)).then(function () { return false; }, function () { return true; });
    }
    var root = d.documentElement;
    var req = root.requestFullscreen || root.webkitRequestFullscreen;
    return Promise.resolve(req.call(root, { navigationUI: 'hide' })).then(function () { return true; }, function () { return false; });
  };

  RPD.Pwa = Pwa;
})(typeof window !== 'undefined' ? window : globalThis);
