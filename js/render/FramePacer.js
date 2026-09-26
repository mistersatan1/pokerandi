/* FramePacer.js — 언제 · 얼마나 곱게 그릴지 (모바일 ④ 성능 · 세션 54).
 *
 * 잰 것(tools/perf.js · CPU 4배 느린 휴대폰 흉내): 게임 규칙 계산은 싸고(전투 3배속에서도 바쁨 19%),
 * 비용은 거의 전부 "그리기"다 — 그것도 칠하는 픽셀 수(해상도)에 비례한다. 그런데 예전에는
 *   ① 일시정지 · 판 시작 전 · 결과 화면처럼 쉬는 동안에도 매 프레임 필드를 다시 그렸고(바쁨 100%)
 *   ② 120Hz 휴대폰에서는 1초에 120번 그렸다(눈에 보이는 차이 없이 두 배 일)
 *   ③ 느린 휴대폰에서도 해상도를 그대로 둬서 전투가 16~18fps 로 끊겼다.
 * 그래서 여기서 정한다(게임 규칙 · 시간은 건드리지 않는다 — Loop 의 고정 시간 갱신은 그대로라 밸런스는 같다):
 *   전투        : 최대 60fps. 느리면 화질 사다리를 한 칸씩 내린다(해상도 2 → 1.5 → 1.25 → 1배, 마지막은 30fps 고정).
 *   쉬는 중     : 10fps(움직이는 게 거의 없다). 손을 대면(누르기 · 움직이기 · 키) 0.8초 동안 제속도.
 *   가려짐      : 휴대폰에서 전체 화면 창(상점 · 사전 · 도감 …)이 필드를 덮으면 15fps(뒤로 흐리게 보이기만 한다).
 * 화질은 내리기만 한다(오르내리며 깜박이지 않게). 새로 열면 다시 가장 곱게 시작한다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  var LADDER = [
    { dpr: 2, fps: 60 }, { dpr: 1.5, fps: 60 }, { dpr: 1.25, fps: 60 }, { dpr: 1, fps: 60 }, { dpr: 1, fps: 30 }
  ];
  var IDLE_FPS = 10;
  var COVERED_FPS = 15;
  var WAKE_MS = 800;
  var WINDOW_S = 2;          // 이 길이만큼 모아서 판단
  var BAD_WINDOWS = 2;       // 연달아 이만큼 느려야 한 칸 내린다(라운드 시작 · 그림 불러오기 같은 잠깐의 느림은 넘긴다)
  var SLOW_RATIO = 0.75;     // 목표의 75% 밑(60fps 목표면 45fps 밑)이면 느림

  var FramePacer = {
    LADDER: LADDER, IDLE_FPS: IDLE_FPS, COVERED_FPS: COVERED_FPS,
    level: 0,
    mode: 'battle',
    drawFps: 0,              // 최근 창의 실제 그린 횟수/초
    _acc: 0, _since: 0, _wakeUntil: 0, _coverAt: 0, _covered: false,
    _win: { t: 0, draws: 0, bad: 0 }
  };

  function now() { return FramePacer.clock(); }
  /* 시계 — 검사(uicheck)가 흉내 시간으로 바꿔 끼운다 */
  FramePacer.clock = function () { return typeof performance !== 'undefined' ? performance.now() : Date.now(); };

  FramePacer.deviceDpr = function () { return global.devicePixelRatio || 1; };
  /* Renderer.resize 가 쓰는 해상도 상한 */
  FramePacer.maxDpr = function () { return LADDER[FramePacer.level].dpr; };
  FramePacer.targetFps = function () { return LADDER[FramePacer.level].fps; };

  FramePacer.wake = function () { FramePacer._wakeUntil = now() + WAKE_MS; };

  function isIdle() {
    var GM = RPD.GameManager, S = RPD.GameState;
    return !!(RPD.Loop && RPD.Loop.paused) || !GM || !S || GM.state !== S.RUNNING;
  }

  /* 휴대폰에서 전체 화면 창이 필드를 덮었는가 — 매 프레임 DOM 을 뒤지지 않게 0.25초마다 */
  var COVER_SEL = '.board > .book:not([hidden]), .board > .help:not([hidden]), .board > .dex:not([hidden]), ' +
    '.board > .modepick:not([hidden]), .board > .result:not([hidden])';
  function isCovered(t) {
    if (t - FramePacer._coverAt < 250) return FramePacer._covered;
    FramePacer._coverAt = t;
    var d = global.document, mm = global.matchMedia;
    FramePacer._covered = !!(d && d.querySelector && mm && mm('(max-width: 1099.98px)').matches && d.querySelector(COVER_SEL));
    return FramePacer._covered;
  }

  /* 화질 한 칸 내리기 — 이 휴대폰에서 실제로 달라지는 칸까지 건너뛴다(원래 1배 화면이면 해상도 칸은 의미가 없다) */
  FramePacer.stepDown = function () {
    var dev = FramePacer.deviceDpr();
    var cur = LADDER[FramePacer.level];
    var curDpr = Math.min(dev, cur.dpr);
    for (var i = FramePacer.level + 1; i < LADDER.length; i++) {
      var L = LADDER[i];
      if (Math.min(dev, L.dpr) < curDpr - 0.01 || L.fps < cur.fps) {
        FramePacer.level = i;
        if (RPD.Renderer && RPD.Renderer.canvas) RPD.Renderer.resize();
        if (RPD.bus) RPD.bus.emit('render:quality', { level: i, dpr: L.dpr, fps: L.fps });
        return true;
      }
    }
    return false;
  };

  FramePacer.reset = function () {
    FramePacer.level = 0; FramePacer._acc = 0; FramePacer._since = 0; FramePacer._win = { t: 0, draws: 0, bad: 0 };
  };

  /* 매 화면 새로고침(rAF)마다 부른다. 이번에 그릴 거면 그 사이 흐른 시간(초), 건너뛸 거면 0 */
  FramePacer.tick = function (dt) {
    var t = now();
    var mode = isCovered(t) ? 'covered' : (isIdle() && t > FramePacer._wakeUntil ? 'idle' : 'battle');
    if (mode !== FramePacer.mode) { FramePacer.mode = mode; FramePacer._win = { t: t, draws: 0, bad: FramePacer._win.bad }; }
    var fps = mode === 'covered' ? COVERED_FPS : mode === 'idle' ? IDLE_FPS : FramePacer.targetFps();

    var interval = 1 / fps;
    FramePacer._acc += dt;
    FramePacer._since += dt;
    // 4ms 여유 — 60Hz 화면에서 60fps 목표면 매번 그린다(반올림 오차로 한 번씩 건너뛰지 않게)
    if (FramePacer._acc < interval - 0.004) return 0;
    // 남은 시간은 다음으로 넘긴다 — 버리면 90Hz 화면이 45fps(두 번에 한 번)로 떨어진다
    // 여유(4ms)만큼 일찍 그린 몫도 빚으로 남긴다 — 안 그러면 144Hz 가 72fps 가 된다
    FramePacer._acc = Math.min(Math.max(-0.004, FramePacer._acc - interval), interval);
    var drawDt = FramePacer._since;
    FramePacer._since = 0;

    // 화질 판단 — 전투 중 · 손대지 않는 동안만(쉬는 중 · 가려짐은 일부러 덜 그리는 것이라 재지 않는다)
    var w = FramePacer._win;
    if (mode === 'battle' && !isIdle()) {
      if (!w.t) w.t = t;
      w.draws += 1;
      var span = (t - w.t) / 1000;
      if (span >= WINDOW_S) {
        FramePacer.drawFps = w.draws / span;
        w.bad = FramePacer.drawFps < FramePacer.targetFps() * SLOW_RATIO ? w.bad + 1 : 0;
        if (w.bad >= BAD_WINDOWS && FramePacer.stepDown()) w.bad = 0;
        w.t = t; w.draws = 0;
      }
    }
    return drawDt;
  };

  FramePacer.init = function () {
    var d = global.document;
    if (!d || !d.addEventListener) return;
    ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'].forEach(function (ev) {
      d.addEventListener(ev, FramePacer.wake, { passive: true, capture: true });
    });
  };

  RPD.FramePacer = FramePacer;
})(typeof window !== 'undefined' ? window : globalThis);
