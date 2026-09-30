/* Pwa.js — 홈 화면 앱 (세션 53 · 모바일 ④ 세션 71 에 다시 짰다).
 *
 * 1) 오프라인: https · localhost 로 열면 서비스 워커(sw.js)를 등록한다. 무엇을 미리 받을지는 sw.js 가 pwa-precache.js 로 안다
 *    (tools/build-pwa.js 가 js/ · css/ · assets/(음악 제외)를 훑어 만들고 커밋 — npm run check 가 실제 파일과 같은지 본다).
 *    페이지는 "얼마나 받았나"만 묻는다(STATUS). 코드는 인터넷 먼저, 그림은 저장소 먼저, 음악은 서비스 워커를 거치지 않는다.
 * 2) 새 버전: 새 서비스 워커가 기다리면 pwa:update — 화면(AppUI)이 "새 버전이 있어요 [새로고침]". 자동 새로고침은 없다(판 도중 사라짐).
 * 3) 설치: 크롬이 주는 설치 이벤트(beforeinstallprompt)를 들고 있다가 [더보기] [앱으로 설치]로 띄운다. 아이폰은 설치 API 가 없어 안내 시트.
 * 4) 전체 화면: 브라우저로 열었을 때 [전체 화면]. 설치한 앱은 매니페스트(display: fullscreen)로 처음부터 전체 화면.
 * 5) 화면 켜짐(Wake Lock): 판이 진행 중일 때만 — 일시정지 · 앱 이탈이면 놓는다.
 *
 * 더블클릭(file://)과 테스트판 한 파일(RPD_INLINE)에서는 서비스 워커를 등록하지 않는다(시도도 안 한다 — 오류 없음).
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;


  var Pwa = {
    status: 'off',               // off(못 씀) · wait · saving · ready(오프라인 준비 끝) · error
    saved: 0, total: 0, missing: [],
    installEvent: null
  };

  function emit() { if (RPD.bus) RPD.bus.emit('pwa:status', Pwa); }

  /* 오프라인 · 설치를 쓸 수 있는가 — 인터넷 주소 + 서비스 워커 + 한 파일 테스트판이 아님 */
  Pwa.supported = function () {
    var loc = global.location;
    if (!loc || global.RPD_INLINE || !global.navigator || !global.navigator.serviceWorker || !global.caches) return false;
    // https, 또는 이 컴퓨터(localhost) 의 http 만 — 서비스 워커는 안전한 주소에서만 돈다
    return loc.protocol === 'https:' || (loc.protocol === 'http:' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(loc.hostname || ''));
  };

  /* 설치한 앱으로 열렸는가(홈 화면 아이콘으로 실행) */
  Pwa.isApp = function () {
    var mm = global.matchMedia;
    return !!((mm && (mm('(display-mode: fullscreen)').matches || mm('(display-mode: standalone)').matches)) ||
      (global.navigator && global.navigator.standalone === true));
  };

  /* ---------- 오프라인 · 새 버전 (세션 71) ----------
   * 무엇을 미리 받을지는 서비스 워커(sw.js)가 pwa-precache.js 로 안다 — 페이지는 "얼마나 됐나"만 묻는다(STATUS).
   * 새 서비스 워커가 기다리면(waiting) pwa:update 를 낸다 — 화면이 "새 버전이 있어요 [새로고침]"을 띄운다. 자동 새로고침은 하지 않는다. */
  Pwa.askStatus = function () {
    var sw = global.navigator && global.navigator.serviceWorker;
    var target = Pwa.reg && (Pwa.reg.active || Pwa.reg.waiting || Pwa.reg.installing);
    if (!sw || !target || typeof global.MessageChannel !== 'function') return Promise.resolve(null);
    return new Promise(function (resolve) {
      var ch = new global.MessageChannel();
      var t = setTimeout(function () { resolve(null); }, 5000);
      ch.port1.onmessage = function (e) { clearTimeout(t); resolve(e.data); };
      target.postMessage({ type: 'STATUS' }, [ch.port2]);
    });
  };

  /* 설치(미리 받기)가 끝날 때까지 기다렸다가 저장 상태를 채운다 */
  function waitActive(reg) {
    return new Promise(function (resolve) {
      function check() {
        if (reg.active && !reg.installing) { resolve(reg); return true; }
        return false;
      }
      if (check()) return;
      var w = reg.installing || reg.waiting;
      if (w && w.addEventListener) w.addEventListener('statechange', function () { if (w.state === 'activated' || w.state === 'redundant') check() || resolve(reg); });
      var n = 0, iv = setInterval(function () { if (check() || ++n > 120) { clearInterval(iv); resolve(reg); } }, 250);
    });
  }

  function watchUpdates(reg) {
    var sw = global.navigator.serviceWorker;
    function waitingNow() {
      // 컨트롤러가 이미 있는데(= 예전 서비스 워커가 이 페이지를 돌린다) 새 것이 기다리면 새 버전
      if (reg.waiting && sw.controller) { Pwa.waiting = reg.waiting; RPD.bus && RPD.bus.emit('pwa:update', Pwa); }
    }
    waitingNow();
    reg.addEventListener && reg.addEventListener('updatefound', function () {
      var w = reg.installing;
      if (w && w.addEventListener) w.addEventListener('statechange', function () { if (w.state === 'installed') waitingNow(); });
    });
    sw.addEventListener && sw.addEventListener('controllerchange', function () {
      if (Pwa._reloading && global.location && global.location.reload) global.location.reload();   // 사람이 [새로고침]을 누른 뒤에만
    });
  }

  /* [새로고침] — 기다리는 서비스 워커를 켜고, 바뀌면 다시 연다 */
  Pwa.applyUpdate = function () {
    var w = Pwa.waiting || (Pwa.reg && Pwa.reg.waiting);
    Pwa._reloading = true;
    if (w) w.postMessage({ type: 'SKIP_WAITING' });
    else if (global.location && global.location.reload) global.location.reload();
    return true;
  };

  Pwa.start = function () {
    if (Pwa._started) return Pwa.ready;
    Pwa._started = true;
    if (global.addEventListener) {
      global.addEventListener('beforeinstallprompt', function (e) { if (e.preventDefault) e.preventDefault(); Pwa.installEvent = e; emit(); });   // 브라우저가 스스로 띄우지 않게 — 사람이 누를 때만
      global.addEventListener('appinstalled', function () { Pwa.installEvent = null; emit(); });
    }
    Pwa.bindWakeLock();
    if (!Pwa.supported()) { Pwa.status = 'off'; Pwa.ready = Promise.resolve(Pwa); return Pwa.ready; }
    Pwa.status = 'wait'; emit();
    Pwa.ready = global.navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(function (reg) {
      Pwa.reg = reg;
      watchUpdates(reg);
      Pwa.status = 'saving'; emit();
      return waitActive(reg);
    }).then(function () {
      return Pwa.askStatus();
    }).then(function (st) {
      if (st && !st.error) { Pwa.total = st.total; Pwa.saved = st.saved; Pwa.missing = st.missing || []; Pwa.hash = st.hash; }
      Pwa.status = st && !st.error && st.saved === st.total ? 'ready' : 'error';
      if (st && st.error) Pwa.error = st.error;
      emit();
      return Pwa;
    }, function (err) {
      Pwa.status = 'error'; Pwa.error = String(err && err.message || err); emit();
      return Pwa;
    });
    return Pwa.ready;
  };

  Pwa.isIOS = function () {
    var n = global.navigator || {};
    return /iPhone|iPad|iPod/.test(n.userAgent || '') || (n.platform === 'MacIntel' && n.maxTouchPoints > 1);
  };

  /* ---------- 화면 켜짐(Screen Wake Lock · 세션 71) ----------
   * 판이 진행 중일 때만(달리는 중 · 일시정지 아님 · 화면이 보임) 요청하고, 아니면 놓는다. [더보기] 에서 끈다(기본 켬 · 설정 wakeLock).
   * 못 쓰는 기기(오래된 브라우저 · file://)면 조용히 넘어간다. */
  var wake = { sentinel: null, pending: false };
  Pwa.wakeSupported = function () { return !!(global.navigator && global.navigator.wakeLock && global.navigator.wakeLock.request); };
  Pwa.wakeEnabled = function () {
    var SM = RPD.SaveManager;
    return !(SM && SM.data && SM.getSetting('wakeLock', true) === false);
  };
  Pwa.setWakeEnabled = function (on) {
    if (RPD.SaveManager && RPD.SaveManager.data) RPD.SaveManager.setSetting('wakeLock', !!on);
    Pwa.syncWake();
    emit();
  };
  Pwa.wakeHeld = function () { return !!wake.sentinel; };
  Pwa.wantWake = function () {
    var GM = RPD.GameManager, S = RPD.GameState, d = global.document;
    return Pwa.wakeEnabled() && !!GM && GM.state === S.RUNNING && !(RPD.Loop && RPD.Loop.paused) &&
      !(d && (d.hidden || d.visibilityState === 'hidden'));
  };
  Pwa.syncWake = function () {
    if (!Pwa.wakeSupported()) return;
    var want = Pwa.wantWake();
    if (want && !wake.sentinel && !wake.pending) {
      wake.pending = true;
      Promise.resolve().then(function () { return global.navigator.wakeLock.request('screen'); }).then(function (s) {
        wake.pending = false;
        if (!Pwa.wantWake()) { s.release && s.release(); return; }
        wake.sentinel = s;
        if (s.addEventListener) s.addEventListener('release', function () { if (wake.sentinel === s) wake.sentinel = null; });
      }, function () { wake.pending = false; });   // 거절(배터리 절약 등) — 조용히
    } else if (!want && wake.sentinel) {
      var s = wake.sentinel;
      wake.sentinel = null;
      try { s.release(); } catch (e) { /* 이미 놓임 */ }
    }
  };
  Pwa.bindWakeLock = function () {
    if (Pwa._wakeBound || !RPD.bus) return;
    Pwa._wakeBound = true;
    ['game:state', 'loop:paused', 'game:reset', 'game:over', 'game:victory'].forEach(function (ev) { RPD.bus.on(ev, Pwa.syncWake); });
    // 화면이 꺼졌다 켜지면 브라우저가 놓는다 — 다시 보이면 다시 청한다
    var d = global.document;
    if (d && d.addEventListener) d.addEventListener('visibilitychange', Pwa.syncWake);
  };

  /* ---------- 설치 ---------- */
  Pwa.installHelp = function () {
    if (Pwa.isApp()) return '이미 앱으로 실행 중입니다.';
    if (!Pwa.supported()) return '홈 화면 앱은 인터넷 주소(https)로 열었을 때만 만들 수 있습니다. 파일을 바로 열었거나 테스트판 한 파일이면 브라우저가 허락하지 않습니다.';
    var ua = (global.navigator && global.navigator.userAgent) || '';
    if (/iPhone|iPad|iPod/.test(ua) || Pwa.isIOS()) return '사파리 아래쪽 공유 버튼(□↑) → [홈 화면에 추가]를 누르세요.';
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
