/* Loop.js — 고정 timestep 게임 루프.
 *
 * 왜 고정 timestep 인가:
 *   가변 dt 로 쿨다운/이동을 계산하면 배속(2x/3x)이나 프레임 드랍 때 밸런스가 흔들린다.
 *   여기서는 항상 1/60초 단위로만 update 하고, 배속은 "프레임당 update 횟수"로 처리한다.
 *   → 1x 든 3x 든 데미지 총량이 정확히 같다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;
  var CFG = RPD.Config;

  var Loop = {
    running: false,
    paused: false,
    speed: 1,
    _accumulator: 0,
    _lastTime: 0,
    _rafId: null,
    _updateFns: [],
    _renderFns: [],
    fps: 0,
    _fpsAcc: 0,
    _fpsFrames: 0
  };

  Loop.onUpdate = function (fn) { Loop._updateFns.push(fn); };
  Loop.onRender = function (fn) { Loop._renderFns.push(fn); };

  Loop.start = function () {
    if (Loop.running) return;
    Loop.running = true;
    Loop._lastTime = now();
    Loop._accumulator = 0;
    Loop._rafId = requestAnimationFrame(tick);
  };

  Loop.stop = function () {
    Loop.running = false;
    if (Loop._rafId != null) cancelAnimationFrame(Loop._rafId);
    Loop._rafId = null;
  };

  Loop.setSpeed = function (s) {
    Loop.speed = RPD.Utils.clamp(s, 0.25, 4);
    RPD.bus.emit('loop:speed', Loop.speed);
  };

  Loop.setPaused = function (v) {
    Loop.paused = !!v;
    Loop._accumulator = 0;   // 재개 시 밀린 시간을 몰아서 돌리지 않는다.
    RPD.bus.emit('loop:paused', Loop.paused);
  };

  Loop.togglePause = function () { Loop.setPaused(!Loop.paused); };

  function now() {
    return (typeof performance !== 'undefined' ? performance.now() : Date.now());
  }

  function tick() {
    if (!Loop.running) return;
    Loop._rafId = requestAnimationFrame(tick);

    var t = now();
    var dt = (t - Loop._lastTime) / 1000;
    Loop._lastTime = t;

    // 탭 전환 후 복귀 시 dt 가 수 초로 튀어 적이 순간이동하는 문제를 막는다.
    if (dt > CFG.maxFrameDelta) dt = CFG.maxFrameDelta;

    // FPS (디버그 표시용)
    Loop._fpsAcc += dt; Loop._fpsFrames += 1;
    if (Loop._fpsAcc >= 0.5) {
      Loop.fps = Math.round(Loop._fpsFrames / Loop._fpsAcc);
      Loop._fpsAcc = 0; Loop._fpsFrames = 0;
    }

    if (!Loop.paused) {
      Loop._accumulator += dt * Loop.speed;
      var steps = 0;
      while (Loop._accumulator >= CFG.fixedStep && steps < CFG.maxStepsPerFrame) {
        step(CFG.fixedStep);
        Loop._accumulator -= CFG.fixedStep;
        steps += 1;
      }
      // 따라잡기 한도를 넘겼으면 남은 시간은 버린다 (죽음의 나선 방지)
      if (steps >= CFG.maxStepsPerFrame) Loop._accumulator = 0;
    }

    for (var r = 0; r < Loop._renderFns.length; r++) Loop._renderFns[r](dt);
  }

  function step(fixed) {
    for (var i = 0; i < Loop._updateFns.length; i++) Loop._updateFns[i](fixed);
  }

  RPD.Loop = Loop;
})(typeof window !== 'undefined' ? window : globalThis);
