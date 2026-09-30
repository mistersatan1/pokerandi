/* Haptics.js — 진동 (모바일 ③ 편의 기능 · 세션 68).
 *
 * navigator.vibrate 가 있는 휴대폰에서만 떤다(아이폰 사파리 · PC 는 없어서 조용히 넘어간다 — 오류 없음).
 * 무늬는 여기 한 곳에만 둔다. 같은 무늬든 다른 무늬든 0.1초 안에 또 오면 무시한다
 * (정예 실패는 elite:result 와 game:life 가 같이 온다 · 끌어 놓기는 select 와 place 가 같이 온다).
 * [더보기] → [진동] 으로 끈다 — 설정 haptics(기본 켬)는 SaveManager 에 저장.
 * 게임 규칙은 모른다 — 이벤트만 듣는다(init 은 main.js).
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  var PATTERNS = {
    select: 8,                         // 칸 고르기
    place: 15,                         // 배치 · 이동 · 창고로 · 필드로
    craft: [20, 40, 20],               // 조합
    spell: [30, 50, 30, 50, 80],       // 주문
    boss: 60,                          // 보스 등장
    hurt: [80, 40, 80]                 // 정예 실패 · 라이프 잃음
  };
  var GAP_MS = 100;

  var H = { PATTERNS: PATTERNS, GAP_MS: GAP_MS, _last: -1e9, calls: 0 };

  function now() { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }
  function nav() { return global.navigator || null; }

  H.supported = function () { var n = nav(); return !!(n && typeof n.vibrate === 'function'); };
  H.enabled = function () {
    var SM = RPD.SaveManager;
    return !(SM && SM.data && SM.getSetting('haptics', true) === false);
  };
  H.setEnabled = function (on) {
    if (RPD.SaveManager && RPD.SaveManager.data) RPD.SaveManager.setSetting('haptics', !!on);
    if (RPD.bus) RPD.bus.emit('settings:haptics', !!on);
  };

  /* 떨기 — 떨었으면 true */
  H.buzz = function (name) {
    var p = PATTERNS[name];
    if (p == null || !H.enabled() || !H.supported()) return false;
    var t = now();
    if (t - H._last < GAP_MS) return false;
    H._last = t;
    try { nav().vibrate(p); H.calls += 1; return true; } catch (e) { return false; }   // 막힌 브라우저(사용자 동작 전 등)
  };

  H.init = function () {
    var bus = RPD.bus;
    bus.on('field:select', function (p) { if (p && p.index >= 0 && p.slot && p.slot.unit) H.buzz('select'); });
    ['field:swapped', 'storage:deployed', 'storage:stored'].forEach(function (ev) { bus.on(ev, function () { H.buzz('place'); }); });
    bus.on('recipe:crafted', function () { H.buzz('craft'); });
    bus.on('spell:cast', function () { H.buzz('spell'); });
    bus.on('boss:appeared', function () { H.buzz('boss'); });
    bus.on('elite:result', function (p) { if (p && p.ok === false) H.buzz('hurt'); });
    bus.on('game:life', function (p) { if (p && p.delta < 0) H.buzz('hurt'); });
  };

  RPD.Haptics = H;
})(typeof window !== 'undefined' ? window : globalThis);
