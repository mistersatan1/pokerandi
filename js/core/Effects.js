/* Effects.js — 효과 줄이기 3단계 (모바일 ③ 편의 기능 · 세션 68).
 *
 *   보통(normal)  : 지금 그대로.
 *   줄임(reduced) : 파티클 · 피해 숫자 절반 · 화면 흔들림 없음 · 해상도 상한 1.5.
 *   최소(minimal) : 줄임 + 스킬 연출 단순화(잔상 · 남는 연출 없이 번쩍 한 번) · 파티클 상한 더 낮게 · 해상도 1 · 30fps 로 그리기.
 * 기본값: 코어 4개 이하 또는 메모리 4GB 이하 휴대폰이면 줄임, 아니면 보통. 운영체제 "동작 줄이기"(prefers-reduced-motion)면 줄임부터.
 * 사람이 고르면 SaveManager 설정 fx 에 저장하고 그 뒤로는 그걸 쓴다.
 *
 * 그리기만 바꾼다 — 게임 규칙 · 시간은 그대로(Loop 는 고정 60Hz). js/systems/ 는 이 설정을 읽지 않는다(검사가 막는다).
 * 연출용 난수(rand)도 여기 따로 둔다: 연출이 Math.random 을 같이 쓰면 파티클 수가 달라질 때 뒤따르는 게임 난수(치명타 · 소환 …)가
 * 밀려 같은 판이 다르게 흘러간다. 연출은 이 난수만 쓰니 효과 단계를 바꿔도 게임 난수 흐름은 한 칸도 안 바뀐다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  var LEVELS = {
    normal:  { id: 'normal',  name: '보통', particleMul: 1,    particleCap: 1600, damageEvery: 1, shake: true,  dprCap: 2,   fpsCap: 60, skillSimple: false },
    reduced: { id: 'reduced', name: '줄임', particleMul: 0.5,  particleCap: 800,  damageEvery: 2, shake: false, dprCap: 1.5, fpsCap: 60, skillSimple: false },
    minimal: { id: 'minimal', name: '최소', particleMul: 0.5,  particleCap: 400,  damageEvery: 2, shake: false, dprCap: 1,   fpsCap: 30, skillSimple: true }
  };
  var ORDER = ['normal', 'reduced', 'minimal'];

  var E = { LEVELS: LEVELS, ORDER: ORDER, _override: null, _dmgTick: 0 };

  /* 이 기기의 기본값 — 저장된 선택이 없을 때 */
  E.autoLevel = function () {
    var n = global.navigator || {};
    try {
      if (global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'reduced';
    } catch (e) { /* 없는 브라우저 */ }
    if ((n.hardwareConcurrency && n.hardwareConcurrency <= 4) || (n.deviceMemory && n.deviceMemory <= 4)) return 'reduced';
    return 'normal';
  };

  E.levelId = function () {
    if (E._override) return E._override;
    var SM = RPD.SaveManager;
    var saved = SM && SM.data ? SM.getSetting('fx', null) : null;
    return LEVELS[saved] ? saved : E.autoLevel();
  };
  E.get = function () { return LEVELS[E.levelId()]; };
  E.isSaved = function () { var SM = RPD.SaveManager; return !!(SM && SM.data && LEVELS[SM.getSetting('fx', null)]); };

  E.set = function (id) {
    if (!LEVELS[id]) return;
    if (RPD.SaveManager && RPD.SaveManager.data) RPD.SaveManager.setSetting('fx', id);
    E.apply();
  };
  E.cycle = function () {
    var i = ORDER.indexOf(E.levelId());
    E.set(ORDER[(i + 1) % ORDER.length]);
    return E.levelId();
  };
  /* 검사 · 성능 재기용 — 저장하지 않고 잠깐 바꾼다(null 이면 풀기) */
  E.force = function (id) { E._override = LEVELS[id] ? id : null; E.apply(); };

  /* 바뀐 걸 반영 — 해상도는 캔버스 크기를 다시 잡아야 한다 */
  E.apply = function () {
    if (RPD.Renderer && RPD.Renderer.canvas && RPD.Renderer.resize) RPD.Renderer.resize();
    if (RPD.bus) RPD.bus.emit('settings:fx', E.levelId());
  };

  /* 피해 숫자를 띄울까 — 줄임 · 최소는 두 개에 하나 */
  E.showDamage = function () {
    var every = E.get().damageEvery;
    if (every <= 1) return true;
    E._dmgTick = (E._dmgTick + 1) % every;
    return E._dmgTick === 0;
  };

  /* 연출 전용 난수(xorshift32) — 게임 난수(Math.random)를 건드리지 않는다 */
  var seed = 0x9e3779b9 | 0;
  E.rand = function () {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };

  RPD.Effects = E;
})(typeof window !== 'undefined' ? window : globalThis);
