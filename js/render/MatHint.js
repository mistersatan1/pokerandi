/* MatHint.js — 조합식 줄 ↔ 필드 재료 칸 연결(리디자인 ⑤ · 세션 89). 캔버스만 — 줄을 가리키는 쪽은 UIManager.
 *
 * 조합식 줄을 마우스로 가리키는 동안(PC) · 미완성 줄을 누르면 1.6초(손가락) 그 조합에 쓰일 필드 · 응원 칸 재료에
 * 금색 네모가 숨 쉬고, 칸 위에 작은 ▼ 가 뜬다. 쓰일 개체는 조합과 같은 순서(RecipeManager.locate — 창고 → 전투 칸 → 응원 칸 ·
 * 잠금 제외)로 고른다 — 창고에 있으면 필드 칸은 안 반짝인다(그 개체는 조합에 안 쓰인다).
 * 아직 모르는 히든 재료는 빼고 찾는다(어느 칸이 정답인지 알려 주지 않게).
 * 효과 "최소": 숨쉬기 없이 고정 네모. 시간은 벽시계 · 게임 규칙은 안 건드린다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  var H = { ids: null, list: [], until: 0, hold: false };
  var HOLD_S = 1.6;
  function now() { return (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) / 1000; }
  function level() { return RPD.Effects && RPD.Effects.levelId ? RPD.Effects.levelId() : 'normal'; }
  function wake() { if (RPD.FramePacer && RPD.FramePacer.wake) RPD.FramePacer.wake(); }
  function secret(id) { return RPD.UI && RPD.UI.isSecret ? RPD.UI.isSecret(id) : false; }

  /* ids: 재료 id 배열 · hold: true 면 clear 할 때까지(가리키는 동안), 아니면 1.6초 */
  H.show = function (ids, hold) {
    H.ids = (ids || []).filter(function (id) { return !secret(id); });
    H.hold = !!hold;
    H.until = hold ? Infinity : now() + HOLD_S;
    H.list = H.ids.length ? H.slots() : [];
    wake();
  };
  H.clear = function () { H.ids = null; H.list = []; };
  H.reset = H.clear;

  /* 지금 반짝일 필드 칸 번호 — 보드가 바뀌면 다시 센다(조합 · 이동 뒤에도 맞게) */
  H.slots = function () {
    if (!H.ids || !H.ids.length || !RPD.RecipeManager || !RPD.RecipeManager.locate) return [];
    return RPD.RecipeManager.locate(H.ids).filter(function (m) { return m && m.where === 'field'; })
      .map(function (m) { return m.at; });
  };
  H.isBusy = function () { return !!H.ids; };

  function chevron(ctx, x, y, s, a) {
    var R = RPD.Renderer;
    var p1 = R.at(x, y, 0, s * 0.6), p2 = R.at(x, y, -s * 0.7, -s * 0.4), p3 = R.at(x, y, s * 0.7, -s * 0.4);
    ctx.globalAlpha = a;
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y); ctx.closePath();
    ctx.fillStyle = '#ffd23f'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#5a3a00'; ctx.stroke();
  }

  H.draw = function (ctx) {
    if (!H.ids) return;
    var t = now();
    if (!H.hold && t > H.until) { H.clear(); return; }
    var F = RPD.FieldManager, lvl = level();
    var pulse = lvl === 'minimal' ? 1 : 0.65 + 0.35 * Math.sin(t * 7);
    ctx.save();
    for (var i = 0; i < H.list.length; i++) {
      var sl = F.get(H.list[i]);
      if (!sl || !sl.unit) continue;
      var h = sl.size / 2 + 5 + (lvl === 'minimal' ? 0 : 2 * pulse);
      ctx.globalAlpha = 0.95 * pulse;
      ctx.lineWidth = 4; ctx.strokeStyle = '#ffd23f';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(sl.x - h, sl.y - h, h * 2, h * 2, 10); else ctx.rect(sl.x - h, sl.y - h, h * 2, h * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.18 * pulse; ctx.fillStyle = '#ffd23f'; ctx.fill();
      // 칸 위(화면 기준 — 세로 화면에서도 위) ▼
      var c = RPD.Renderer.at(sl.x, sl.y, 0, -h - 12 - (lvl === 'minimal' ? 0 : 3 * pulse));
      chevron(ctx, c.x, c.y, 8, 1);
    }
    ctx.restore();
    wake();   // 라운드 사이(초당 10장)에도 부드럽게 — 힌트가 떠 있는 동안만
  };

  H.init = function () {
    RPD.bus.on('game:reset', H.reset);
    ['field:changed', 'storage:changed', 'recipe:crafted'].forEach(function (ev) {
      RPD.bus.on(ev, function () { if (H.ids) H.list = H.slots(); });
    });
  };

  RPD.MatHint = H;
})(typeof window !== 'undefined' ? window : globalThis);
