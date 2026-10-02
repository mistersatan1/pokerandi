/* UnitRenderer.js — 필드에 올라간 포켓몬과 공격 연출.
 *
 * 전투는 즉시 타격(hitscan)이라 날아가는 탄이 없다. 대신 "누가 누구를 때렸는지"를
 * 짧게 남는 선으로 보여 준다. 선이 없으면 데미지 숫자만 떠서 무엇이 일하는지 안 보인다.
 *
 * 연출 객체는 전부 풀링한다. 3배속에서 초당 수백 개가 생기고 사라지기 때문이다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;
  // 연출 전용 난수 — 게임 난수(Math.random) 흐름을 밀지 않게(Effects.js · 세션 68)
  var fxRand = RPD.Effects ? RPD.Effects.rand : Math.random;

  var POOL_BEAM = 180;
  var POOL_BLAST = 60;

  var beams = [];
  var blasts = [];

  for (var i = 0; i < POOL_BEAM; i++) {
    beams.push({ alive: false, x1: 0, y1: 0, x2: 0, y2: 0, life: 0, maxLife: 1, color: '#fff', width: 2 });
  }
  for (var j = 0; j < POOL_BLAST; j++) {
    blasts.push({ alive: false, x: 0, y: 0, radius: 0, life: 0, maxLife: 1, color: '#fff' });
  }

  function takeBeam() {
    for (var k = 0; k < beams.length; k++) if (!beams[k].alive) return beams[k];
    return beams[(fxRand() * beams.length) | 0];
  }

  function takeBlast() {
    for (var k = 0; k < blasts.length; k++) if (!blasts[k].alive) return blasts[k];
    return blasts[(fxRand() * blasts.length) | 0];
  }

  var UnitRenderer = {};

  UnitRenderer.reset = function () {
    for (var k = 0; k < beams.length; k++) beams[k].alive = false;
    for (var m = 0; m < blasts.length; m++) blasts[m].alive = false;
  };

  UnitRenderer.init = function () {
    /* 공격 연출은 AttackFxRenderer 가 포켓몬별로 그린다. 그쪽이 없을 때만 예전 선 연출로 대신한다. */
    RPD.bus.on('unit:attack', function (p) {
      if (RPD.AttackFx) return;
      var color = typeColor(p.unit.types && p.unit.types[0]);
      addBeam(p.unit.x, p.unit.y, p.target.x, p.target.y, color, p.crit ? 3.4 : 2);
    });

    RPD.bus.on('combat:chain', function (p) {
      if (RPD.AttackFx) return;
      addBeam(p.from.x, p.from.y, p.to.x, p.to.y, '#e8c341', 2);
    });

    RPD.bus.on('combat:splash', function (p) {
      if (RPD.AttackFx) return;
      var b = takeBlast();
      b.alive = true;
      b.x = p.x; b.y = p.y;
      b.radius = p.radius;
      b.maxLife = 0.3; b.life = b.maxLife;
      b.color = typeColor(p.unit.types && p.unit.types[0]);
    });

    // 보스 충격파 — 어디까지 닿았는지 링으로 보여 준다
    RPD.bus.on('boss:pattern', function (p) {
      if (p.id === 'shockwave' && p.result.radius) {
        var b = takeBlast();
        b.alive = true;
        b.x = p.result.x; b.y = p.result.y;
        b.radius = p.result.radius;
        b.maxLife = 0.55; b.life = b.maxLife;
        b.color = '#e0554f';
      }
    });

    // 소환된 포켓몬이 어느 칸에 앉았는지 눈으로 잡아 준다
    // 등급 프레임 반짝 쓸림(세션 85) — 희귀함 이상을 칸에 놓는 순간(소환 · 조합 · 이동 · 창고에서)
    RPD.bus.on('render:resize', function () { frameCache = {}; });
    RPD.bus.on('field:placed', function (p) {
      var u = p && p.unit;
      if (u && (RANK[u.tier] || 1) >= 4) {
        u._sheenAt = nowSec();
        if (RPD.FramePacer && RPD.FramePacer.wake) RPD.FramePacer.wake();   // 쉬는 중(초당 10장)에도 0.7초 쓸림이 끊기지 않게(세션 87에 찾음)
      }
    });

    RPD.bus.on('summon:result', function (r) {
      if (!r.ok || !r.unit) return;
      var color = (RPD.Tiers[r.tier] || {}).color || '#fff';
      RPD.FxRenderer.ring(r.unit.x, r.unit.y, color, 52, 0.7);
    });
  };

  function addBeam(x1, y1, x2, y2, color, width) {
    var b = takeBeam();
    b.alive = true;
    b.x1 = x1; b.y1 = y1; b.x2 = x2; b.y2 = y2;
    b.maxLife = 0.16; b.life = b.maxLife;
    b.color = color;
    b.width = width;
  }

  function typeColor(typeId) {
    var t = RPD.Types[typeId];
    return (t && t.color) || '#e9e7d8';
  }

  /* 고정 timestep 으로 갱신 → 배속을 올리면 연출도 같이 빨라져 화면이 밀리지 않는다. */
  UnitRenderer.update = function (dt) {
    var k;
    for (k = 0; k < beams.length; k++) {
      if (!beams[k].alive) continue;
      beams[k].life -= dt;
      if (beams[k].life <= 0) beams[k].alive = false;
    }
    for (k = 0; k < blasts.length; k++) {
      if (!blasts[k].alive) continue;
      blasts[k].life -= dt;
      if (blasts[k].life <= 0) blasts[k].alive = false;
    }
  };

  /* ---------- 공격 연출 (적 아래 레이어) ---------- */

  UnitRenderer.drawAttacks = function (ctx) {
    var k;

    for (k = 0; k < blasts.length; k++) {
      var bl = blasts[k];
      if (!bl.alive) continue;
      var t = bl.life / bl.maxLife;
      ctx.save();
      ctx.globalAlpha = t * 0.42;
      ctx.beginPath();
      ctx.arc(bl.x, bl.y, bl.radius * (1.25 - t * 0.35), 0, Math.PI * 2);
      ctx.fillStyle = bl.color;
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.lineCap = 'round';
    for (k = 0; k < beams.length; k++) {
      var b = beams[k];
      if (!b.alive) continue;
      var a = b.life / b.maxLife;
      ctx.globalAlpha = a * 0.85;
      ctx.strokeStyle = b.color;
      ctx.lineWidth = b.width * a + 0.6;
      ctx.beginPath();
      ctx.moveTo(b.x1, b.y1);
      ctx.lineTo(b.x2, b.y2);
      ctx.stroke();
    }
    ctx.restore();
  };

  /* ---------- 포켓몬 본체 ---------- */

  UnitRenderer.draw = function (ctx) {
    var F = RPD.FieldManager;
    for (var i = 0; i < F.slots.length; i++) {
      var slot = F.slots[i];
      if (!slot.unit) continue;
      drawUnit(ctx, slot, slot.unit, i === F.selectedIndex);
    }
  };

  function hexA(hex, a) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return 'rgba(' + parseInt(h.slice(0, 2), 16) + ',' + parseInt(h.slice(2, 4), 16) + ',' + parseInt(h.slice(4, 6), 16) + ',' + a + ')';
  }

  /* ---------- 등급 프레임(세션 85) ----------
   *   T1 얇은 단색 · T2 굵게 + 모서리 컷 · T3 겹선 + 보석 1 · T4 호일(그라데이션) + 보석 2 + 놓는 순간 반짝 쓸림
   *   T5 이상 홀로(여러 색) + 보석 3 + 발밑 소환진(천천히 돈다 · 효과 "최소"면 멈춤) + 반짝 쓸림. 불멸 · 초월의 오라는 위에서 그대로.
   * 그리기 비용: 칸마다 선 몇 줄 · 그라데이션 하나(T4 이상만) — 28칸이어도 가볍다(perf.js 로 전후 비교). */
  var RANK = { T1: 1, T2: 2, T3: 3, T4: 4, T5: 5, T6: 5, T7: 5 };
  var SHEEN_SEC = 0.7;
  function nowSec() { return (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) / 1000; }
  function fxLevel() { return RPD.Effects && RPD.Effects.levelId ? RPD.Effects.levelId() : 'normal'; }
  UnitRenderer.RANK = RANK;

  // 모서리를 잘라 낸 사각형 — 둥근 카드(웹 UI) 대신 "패" · "카드 프레임" 느낌
  function chamferPath(ctx, x, y, w, h, c) {
    ctx.beginPath();
    ctx.moveTo(x + c, y); ctx.lineTo(x + w - c, y); ctx.lineTo(x + w, y + c);
    ctx.lineTo(x + w, y + h - c); ctx.lineTo(x + w - c, y + h); ctx.lineTo(x + c, y + h);
    ctx.lineTo(x, y + h - c); ctx.lineTo(x, y + c); ctx.closePath();
  }
  function roundPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
  }
  function lighten(hex, k) {
    var n = parseInt(String(hex).slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return 'rgb(' + Math.round(r + (255 - r) * k) + ',' + Math.round(g + (255 - g) * k) + ',' + Math.round(b + (255 - b) * k) + ')';
  }
  // 등급 보석 — 화면 기준 위쪽 가장자리 가운데(왼쪽 위 H · 잠금, 오른쪽 위 +강화와 안 겹친다)
  function drawGems(ctx, cx, cy, half, n, color) {
    var gap = 9.5;
    for (var i = 0; i < n; i++) {
      var p = RPD.Renderer.at(cx, cy, (i - (n - 1) / 2) * gap, -half);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - 5); ctx.lineTo(p.x + 4, p.y); ctx.lineTo(p.x, p.y + 5); ctx.lineTo(p.x - 4, p.y); ctx.closePath();
      ctx.fillStyle = color; ctx.fill();
      ctx.lineWidth = 1.3; ctx.strokeStyle = 'rgba(10,26,54,0.9)'; ctx.stroke();
      ctx.beginPath(); ctx.arc(p.x - 0.9, p.y - 1.3, 0.9, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
    }
  }

  /* 움직이지 않는 부분(바탕 · 바깥선 · 등급선 · 겹선 · 보석) — 등급마다 한 번 구워 캐시한다(frameImage).
   * 처음엔 매 프레임 그렸더니 유닛 레이어가 두 배가 됐다(perf.js 4배 느림: 초당 40ms → 80~100ms · 세션 85) */
  function drawFrameStatic(ctx, cx, cy, half, tier) {
    var rank = RANK[tier.id] || 1;
    var x = cx - half, y = cy - half, w = half * 2;
    var path = rank >= 2 ? function (inset) { chamferPath(ctx, x + inset, y + inset, w - inset * 2, w - inset * 2, 9 - inset * 0.6); }
                         : function (inset) { roundPath(ctx, x + inset, y + inset, w - inset * 2, w - inset * 2, 10); };
    // 바탕 — 낮은 등급일수록 옅게
    path(0);
    ctx.fillStyle = 'rgba(10,26,54,' + (0.10 + rank * 0.025).toFixed(3) + ')';
    ctx.fill();
    // 어두운 바깥선(필드의 밝은 풀밭 위에서 등급색이 뜨게) → 등급선
    path(0);
    ctx.strokeStyle = 'rgba(10,26,54,0.6)';
    ctx.lineWidth = rank === 1 ? 3 : 4.6;
    ctx.stroke();
    path(0);
    if (rank >= 5) {
      var hg = ctx.createLinearGradient(x, y, x + w, y + w);   // 홀로 — 등급색 · 금 · 하늘 · 등급색
      hg.addColorStop(0, tier.color); hg.addColorStop(0.35, '#ffe07a'); hg.addColorStop(0.65, '#9ff0ff'); hg.addColorStop(1, tier.color);
      ctx.strokeStyle = hg; ctx.lineWidth = 3.4;
    } else if (rank === 4) {
      var fg = ctx.createLinearGradient(x, y, x + w, y + w);   // 호일 — 등급색 사이에 밝은 띠
      fg.addColorStop(0, tier.color); fg.addColorStop(0.45, lighten(tier.color, 0.65)); fg.addColorStop(0.55, lighten(tier.color, 0.65)); fg.addColorStop(1, tier.color);
      ctx.strokeStyle = fg; ctx.lineWidth = 3.2;
    } else {
      ctx.strokeStyle = tier.color; ctx.lineWidth = rank === 1 ? 1.6 : rank === 2 ? 2.6 : 2.8;
    }
    ctx.stroke();
    // T3 이상 — 안쪽 겹선 · 보석
    if (rank >= 3) {
      path(4.5);
      ctx.strokeStyle = hexA(tier.color, 0.55); ctx.lineWidth = 1; ctx.stroke();
      drawGems(ctx, cx, cy, half, rank >= 5 ? 3 : rank - 2, rank >= 5 ? '#ffe07a' : lighten(tier.color, 0.25));
    }
  }

  /* 캐시 — 등급 · 칸 크기 · 화면 배율 · 돌림(세로 화면은 보석이 화면 위쪽 = 논리 왼쪽)마다 한 장. 화면 크기가 바뀌면 비운다 */
  var frameCache = {};
  var FRAME_PAD = 8;
  UnitRenderer.clearFrameCache = function () { frameCache = {}; };
  function frameImage(tier, half) {
    if (typeof document === 'undefined' || !document.createElement) return null;
    var R = RPD.Renderer, k = Math.max(1, Math.round((R.scale || 1) * (R.dpr || 1) * 4) / 4);
    var key = tier.id + '|' + half + '|' + k + '|' + (R.rotated ? 1 : 0);
    if (frameCache[key] !== undefined) return frameCache[key];
    var side = (half + FRAME_PAD) * 2;
    var c = document.createElement('canvas');
    c.width = Math.ceil(side * k); c.height = Math.ceil(side * k);
    var cctx = c.getContext && c.getContext('2d');
    if (!cctx) { frameCache[key] = null; return null; }
    cctx.setTransform(k, 0, 0, k, 0, 0);
    drawFrameStatic(cctx, side / 2, side / 2, half, tier);
    frameCache[key] = c;
    return c;
  }

  /* T4 이상 — 놓는 순간 반짝 한 번 쓸림(0.7초) · 효과 "최소"면 없음. 포켓몬 그림 위에 그려야 보인다 */
  function drawSheen(ctx, slot, unit, half) {
    if (!unit._sheenAt || (RANK[unit.tier] || 1) < 4 || fxLevel() === 'minimal') return;
    var k = (nowSec() - unit._sheenAt) / SHEEN_SEC;
    if (k > 1) { unit._sheenAt = 0; return; }
    if (k < 0) return;
    var x = slot.x - half, y = slot.y - half, w = slot.size;
    ctx.save();
    chamferPath(ctx, x, y, w, w, 9); ctx.clip();
    var bx = x - w + k * w * 3;
    var sg = ctx.createLinearGradient(bx, y, bx + w * 0.6, y + w);
    sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,0.6)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sg; ctx.fillRect(x, y, w, w);
    ctx.restore();
  }
  function drawTierFrame(ctx, slot, unit, tier, half) {
    var rank = RANK[tier.id] || 1;
    // T5 이상 — 발밑 소환진(포켓몬 그림 뒤 · 칸 안). 천천히 돈다 · 효과 "최소"면 멈춤
    if (rank >= 5) {
      var spin = fxLevel() === 'minimal' ? 0 : nowSec() * 0.6;
      ctx.save();
      ctx.beginPath(); ctx.arc(slot.x, slot.y + 4, half * 0.78, 0, Math.PI * 2);
      ctx.fillStyle = hexA(tier.color, 0.14); ctx.fill();
      ctx.setLineDash([5, 4]); ctx.lineDashOffset = -spin * 20;
      ctx.lineWidth = 1.6; ctx.strokeStyle = hexA(tier.color, 0.7); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
    var img = frameImage(tier, half);
    if (img) {
      var side = (half + FRAME_PAD) * 2;
      ctx.drawImage(img, slot.x - side / 2, slot.y - side / 2, side, side);
    } else {
      drawFrameStatic(ctx, slot.x, slot.y, half, tier);   // 캔버스를 못 만드는 환경(검사)
    }
  }

  function drawUnit(ctx, slot, unit, selected) {
    var tier = RPD.Tiers[unit.tier] || RPD.Tiers.T1;
    /* UI 리디자인: 포켓몬이 작아 보이지 않게 칸(56px)을 거의 꽉 채운다.
     * 칸끼리 최소 간격이 60px 이라 이 크기에서도 옆 칸과 겹치지 않는다. */
    var size = slot.size * 1.22;

    // 공격 직후 살짝 커진다 — 무엇이 일하고 있는지 한눈에 보인다
    var punch = 1 + unit.attackFlash * 0.1;
    var clock = RPD.CombatManager.clock || 0;

    ctx.save();

    // 발밑 그림자 — 밝은 풀밭 위에서 떠 보이지 않게
    ctx.beginPath();
    ctx.ellipse(unit.x, unit.y + size * 0.36, size * 0.3, size * 0.1, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(10,40,20,0.28)';
    ctx.fill();

    /* 불멸·초월 — 발밑에서 숨쉬는 오라. 한눈에 "특별한 기물"로 보이게 */
    if (tier.special) {
      var tt = (RPD.Loop && RPD.Loop.elapsed ? RPD.Loop.elapsed : Date.now() / 1000);
      var pulse = 0.55 + 0.45 * Math.sin(tt * (tier.id === 'T7' ? 4 : 2.6));
      var rad = slot.size * (tier.id === 'T7' ? 0.95 : 0.8);
      var g = ctx.createRadialGradient(slot.x, slot.y, rad * 0.2, slot.x, slot.y, rad);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.6, hexA(tier.color, 0.25 * pulse));
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(slot.x, slot.y, rad, 0, Math.PI * 2); ctx.fill();
    }

    /* 등급 프레임(리디자인 ① · 세션 85) — 색 하나로는 필드에서 T3 · T5 가 비슷하게 읽혔다.
     * 색은 그대로 두고 모양 · 층 · 움직임을 등급마다 쌓는다(색각 이상에도 갈리게). 보석 개수 = T3 1 · T4 2 · T5 이상 3 */
    var half = slot.size / 2;
    drawTierFrame(ctx, slot, unit, tier, half);
    /* 히든(주문으로만 만드는 개체) — 테두리는 강함 등급 색 그대로, 왼쪽 위 모서리에 H 표시.
     * 히든은 등급이 아니라 얻는 법이라 색을 따로 쓰지 않는다. */
    if (unit.def && unit.def.hidden) {
      var hAt = RPD.Renderer.at(slot.x, slot.y, -half + 7, -half + 7);   // 화면 기준 왼쪽 위
      ctx.beginPath();
      ctx.arc(hAt.x, hAt.y, 6.5, 0, Math.PI * 2);
      ctx.fillStyle = '#0b2a2a';
      ctx.fill();
      ctx.strokeStyle = '#2ee6c6';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#2ee6c6';
      ctx.font = '900 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('H', hAt.x, hAt.y + 0.5);
    }

    if (selected) {
      // 선택: 등급색 발광 원판 + 숨쉬는 금색 링
      var sp = 0.5 + 0.5 * Math.sin(clock * 6);
      ctx.beginPath();
      ctx.arc(unit.x, unit.y, size * 0.56, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,210,63,' + (0.16 + sp * 0.1).toFixed(3) + ')';
      ctx.fill();
    }

    if (unit.awakened) {
      var pulse = 0.5 + 0.5 * Math.sin(RPD.CombatManager.clock * 3);
      ctx.beginPath();
      ctx.arc(unit.x, unit.y, size * 0.62 + pulse * 2.5, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 214, 102, 0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    RPD.Assets.drawSprite(ctx, unit.def.sprite, unit.x, unit.y - 2, size * punch, {
      label: unit.name,
      color: typeColor(unit.types && unit.types[0]),
      ring: null,
      def: unit.def,
      awakened: unit.awakened
    });
    drawSheen(ctx, slot, unit, half);

    // 진화 단계는 아래쪽 점으로. 숫자를 쓰면 작은 칸에서 안 읽힌다.
    var stage = unit.def.stage || 1;
    if (stage > 1 || unit.awakened) {
      var dots = unit.awakened ? stage + 1 : stage;
      var dotY = unit.y + size * 0.52;
      var spread = 6;
      var startX = unit.x - ((dots - 1) * spread) / 2;
      for (var d = 0; d < dots; d++) {
        ctx.beginPath();
        ctx.arc(startX + d * spread, dotY, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = (unit.awakened && d === dots - 1) ? '#ffd666' : tier.color;
        ctx.fill();
      }
    }

    if (unit.level > 0) {
      ctx.font = '900 11px ' + RPD.FONT_STACK;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(12,26,52,0.85)';
      var lvAt = RPD.Renderer.at(slot.x, slot.y, slot.size / 2 - 3, -slot.size / 2 + 2);   // 화면 기준 오른쪽 위
      ctx.strokeText('+' + unit.level, lvAt.x, lvAt.y);
      ctx.fillStyle = '#ffd23f';
      ctx.fillText('+' + unit.level, lvAt.x, lvAt.y);
    }

    // 잠금 — 왼쪽 위 작은 자물쇠(재료 · 방출에서 빠진 포켓몬). 레벨 글자는 오른쪽 위라 겹치지 않는다
    if (unit.locked) {
      var lkAt = RPD.Renderer.at(slot.x, slot.y, -slot.size / 2 + 8, -slot.size / 2 + 8);
      ctx.beginPath();
      ctx.arc(lkAt.x, lkAt.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(12,26,52,0.82)';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#f0b429';
      ctx.stroke();
      ctx.font = '900 10px ' + RPD.FONT_STACK;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffd23f';
      ctx.fillText('🔒', lkAt.x, lkAt.y + 0.5);
    }

    // 침묵·기절 — 회색으로 죽이고 X 표시. 색만 바꾸면 작은 칸에서 안 읽힌다.
    if (unit.disabledUntil > RPD.CombatManager.clock) {
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.arc(unit.x, unit.y, size * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(12, 18, 13, 0.72)';
      ctx.fill();
      ctx.globalAlpha = 1;

      var r = size * 0.2;
      ctx.strokeStyle = '#ff8a7a';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(unit.x - r, unit.y - r); ctx.lineTo(unit.x + r, unit.y + r);
      ctx.moveTo(unit.x + r, unit.y - r); ctx.lineTo(unit.x - r, unit.y + r);
      ctx.stroke();
    }

    /* 스킬 쿨다운 링 — 언제 터질지 보이게. 다 차면 한 바퀴가 금색으로 채워지고 숨쉰다. */
    if (unit.skill && unit.skillMax > 0) {
      var left = Math.max(0, unit.skillCooldown);
      var ratio = 1 - left / unit.skillMax;
      var rr = size * 0.52;
      ctx.beginPath();
      ctx.arc(unit.x, unit.y, rr, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(10,22,44,0.35)';
      ctx.lineWidth = 3;
      ctx.stroke();
      if (ratio > 0) {
        var full = ratio >= 1;
        var glow = full ? 0.75 + 0.25 * Math.sin(clock * 6) : 1;
        ctx.beginPath();
        ctx.arc(unit.x, unit.y, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, ratio));
        ctx.strokeStyle = full ? 'rgba(255,210,63,' + glow.toFixed(2) + ')' : 'rgba(150,200,255,0.85)';
        ctx.lineWidth = full ? 3.4 : 2.6;
        ctx.stroke();
      }
    }

    if (selected) {
      var pulse2 = 0.5 + 0.5 * Math.sin(clock * 6);
      ctx.beginPath();
      ctx.arc(unit.x, unit.y, size * (0.6 + pulse2 * 0.03), 0, Math.PI * 2);
      ctx.strokeStyle = '#ffd23f';
      ctx.lineWidth = 2.4;
      ctx.stroke();
    }

    ctx.restore();
  }

  RPD.UnitRenderer = UnitRenderer;
})(typeof window !== 'undefined' ? window : globalThis);
