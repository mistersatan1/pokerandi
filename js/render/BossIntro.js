/* BossIntro.js — 보스 등장 연출(리디자인 ② · 세션 86). 캔버스 쪽만 — 이름표(DOM)는 js/ui/BossIntroUI.js.
 *
 * 예전에는 boss:appeared 에 소리 · 진동만 걸려 있어 화면은 그대로였다. 필드를 가리지 않는 3박자(약 1.5초, 최종 보스 2.2초):
 *   ① 0 ~ 0.3초  가장자리 붉은 비네팅이 차오르고 입구에 경고 삼각형(!)
 *   ② 0.3초 ~     이름표가 미끄러져 들어온다(DOM)
 *   ③ 0.8초 즈음 짧은 흔들림(효과 "보통"만 — AttackFx 흔들림을 빌린다)
 * 보스 처치: 금색 비네팅 한 번(0.6초 · 최종 보스는 더 길고 세게). 처치 글자 · 링은 FxRenderer 에 원래 있다.
 * 효과 "최소": 맥동 없이 한 번 옅게 차오르고 빠진다 · 흔들림 없음. 시간은 벽시계(게임 속도 · 일시정지와 무관한 연출 시간).
 * 게임 규칙은 안 건드린다 — 이벤트만 듣고 그린다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  var I = { active: false, t0: 0, dur: 0, final: false, shaken: false, down: null };
  function now() { return (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) / 1000; }
  function level() { return RPD.Effects && RPD.Effects.levelId ? RPD.Effects.levelId() : 'normal'; }

  I.start = function (boss) {
    var GM = RPD.GameManager;
    I.final = !!(boss && GM.isFinalWave && GM.isFinalWave(boss.wave));
    I.dur = I.final ? 2.2 : 1.5;
    I.t0 = now();
    I.active = true;
    I.shaken = false;
  };
  I.cleared = function (boss) {
    var GM = RPD.GameManager;
    var fin = !!(boss && GM.isFinalWave && GM.isFinalWave(boss.wave));
    I.active = false;
    I.down = { t0: now(), dur: fin ? 1.2 : 0.6, final: fin };
    if (RPD.AttackFx && RPD.AttackFx.shake && level() === 'normal') RPD.AttackFx.shake(fin ? 1 : 0.6);
  };
  I.reset = function () { I.active = false; I.down = null; };

  /* 0~1 세기 — 빠르게 차오르고(0.25초) 끝 0.4초에 빠진다. 사이에는 두 번 맥동(최소면 평평) */
  function envelope(e, dur, pulse) {
    var a = Math.min(1, e / 0.25) * Math.min(1, Math.max(0, (dur - e) / 0.4));
    if (pulse) a *= 0.7 + 0.3 * Math.cos(e * Math.PI * 2 * (2 / Math.max(0.5, dur - 0.4)));
    return Math.max(0, a);
  }

  function vignette(ctx, color, alpha) {
    var fb = RPD.Renderer && RPD.Renderer.logicalBounds ? RPD.Renderer.logicalBounds() : { x: 0, y: 0, w: RPD.VIEW.width, h: RPD.VIEW.height };
    var cx = RPD.VIEW.width / 2, cy = RPD.VIEW.height / 2;
    var g = ctx.createRadialGradient(cx, cy, Math.min(RPD.VIEW.width, RPD.VIEW.height) * 0.42, cx, cy, Math.max(RPD.VIEW.width, RPD.VIEW.height) * 0.62);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, color.replace('A', alpha.toFixed(3)));
    ctx.save();
    ctx.fillStyle = g;
    ctx.fillRect(fb.x, fb.y, fb.w, fb.h);
    ctx.restore();
  }

  // 입구 경고 — 화면 기준 위를 향하는 삼각형 + "!"(세로 화면에서도 똑바로)
  function entryWarning(ctx, k) {
    var e = RPD.MapData.entry, R = RPD.Renderer;
    // 입구에서 필드 안쪽(논리 x +125 — 세로 화면에서 체력 줄 패널 아래) · 길 옆(논리 y −44) — 세로 화면은 입구가 화면 맨 위라 "화면 위쪽"으로 띄우면 잘린다
    var at = { x: e.x + 125, y: e.y - 44 };
    var s = 15 + 3 * k;
    var p1 = R.at(at.x, at.y, 0, -s), p2 = R.at(at.x, at.y, s * 0.95, s * 0.7), p3 = R.at(at.x, at.y, -s * 0.95, s * 0.7);
    ctx.save();
    ctx.globalAlpha = Math.min(1, 0.35 + k);
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y); ctx.closePath();
    ctx.fillStyle = '#ffd23f'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#5a0b16'; ctx.stroke();
    ctx.font = '900 16px ' + RPD.FONT_STACK;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#5a0b16';
    var tp = R.at(at.x, at.y, 0, 3);
    ctx.fillText('!', tp.x, tp.y);
    ctx.restore();
  }

  I.draw = function (ctx) {
    var t = now(), lvl = level();
    if (I.active) {
      var e = t - I.t0;
      if (e >= I.dur) I.active = false;
      else {
        var a = envelope(e, I.dur, lvl !== 'minimal') * (lvl === 'minimal' ? 0.5 : 1) * (I.final ? 0.62 : 0.46);
        vignette(ctx, 'rgba(190,16,40,A)', a);
        if (e < Math.min(1.3, I.dur)) entryWarning(ctx, lvl === 'minimal' ? 0.6 : 0.5 + 0.5 * Math.abs(Math.sin(e * 7)));
        if (!I.shaken && e > 0.75) {
          I.shaken = true;
          if (lvl === 'normal' && RPD.AttackFx && RPD.AttackFx.shake) RPD.AttackFx.shake(I.final ? 1 : 0.55);
        }
      }
    }
    if (I.down) {
      var d = t - I.down.t0;
      if (d >= I.down.dur) I.down = null;
      else vignette(ctx, 'rgba(255,196,40,A)', envelope(d, I.down.dur, false) * (I.down.final ? 0.55 : 0.32) * (lvl === 'minimal' ? 0.6 : 1));
    }
  };
  I.isBusy = function () { return I.active || !!I.down; };

  I.init = function () {
    var bus = RPD.bus;
    bus.on('boss:appeared', I.start);
    bus.on('enemy:died', function (p) { if (p && p.enemy && p.enemy.isBoss) I.cleared(p.enemy); });
    bus.on('game:reset', I.reset);
  };

  RPD.BossIntro = I;
})(typeof window !== 'undefined' ? window : globalThis);
