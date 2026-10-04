/* SkillFx.js — 스킬별 고유 연출(세션 94). 캔버스만 — 무엇을 그릴지는 js/data/skillfx.js(RPD.SkillFxData).
 *
 * 예전: 스킬이 터지면 "그 포켓몬 평타 연출을 2배로 + 발밑 링 + 이름 글자"(AttackFx.skill) — 58개 스킬이 평타를 키운 모양이라 서로 비슷했다.
 * 지금: 스킬마다 모티프 하나(낙하 · 번개 · 균열 · 충격파 · 광선 · 참격 · 주먹 · 구체 · 압축 · 드릴 · 바늘 · 지대 · 오라 · 화염 · 눈보라 · 도깨비불 · 꽃잎)를
 *       색 · 모양 · 수를 달리해 쓴다. 범위가 있는 스킬은 그 범위를, 대상이 있는 스킬은 맞은 적마다 보여 준다(무엇이 어디에 터졌는지).
 *       불멸 · 초월 스킬은 화면 위에 이름 띠(컷인 · 4초에 한 번).
 * 원칙
 *   - 게임 규칙 · 판정은 안 건드린다. 'unit:skill' 을 듣고 그 순간 대상 위치를 찍어 둔다(적이 움직여도 연출은 그 자리).
 *   - 난수는 연출 전용 Effects.rand(게임 난수를 밀지 않게). 시간은 벽시계 · 첫 프레임부터(CraftFx 와 같다).
 *   - "위에서 떨어지는" 것 · 컷인은 화면 기준(Renderer.at · withScreenFrame) — 휴대폰 세로(필드 90° 돌림)에서도 위에서 떨어진다.
 *   - 효과 "줄임": 조각 수 절반 · "최소": 모티프마다 핵심 한 겹(링 · 맞은 자리 번쩍)만, 지대는 남기되 거품 없이, 흔들림 없음.
 *   - 한꺼번에 최대 MAX 개 — 넘치면 가장 오래된 것부터 버린다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  var S = { list: [], MAX: 40, lastCutin: -99 };
  var TAU = Math.PI * 2;

  function now() { return (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) / 1000; }
  /* 효과 단계 — 설정이 "보통"이어도 FramePacer 가 이미 화질을 3단 이상 내렸으면(느린 기기 · 바쁜 판) "줄임"처럼 조각을 반으로 */
  function level() {
    var l = RPD.Effects && RPD.Effects.levelId ? RPD.Effects.levelId() : 'normal';
    if (l === 'normal' && RPD.FramePacer && RPD.FramePacer.level >= 3) return 'reduced';
    return l;
  }
  function rnd() { return RPD.Effects && RPD.Effects.rand ? RPD.Effects.rand() : 0.5; }
  function wake() { if (RPD.FramePacer && RPD.FramePacer.wake) RPD.FramePacer.wake(); }
  function at(x, y, dx, dy) { return RPD.Renderer && RPD.Renderer.at ? RPD.Renderer.at(x, y, dx, dy) : { x: x + dx, y: y + dy }; }
  function clamp01(k) { return k < 0 ? 0 : k > 1 ? 1 : k; }
  function easeOut(k) { k = clamp01(k); return 1 - Math.pow(1 - k, 3); }
  function rgba(hex, a) {
    var h = String(hex || '#ffffff').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + clamp01(a).toFixed(3) + ')';
  }
  function n(base) { var l = level(); return l === 'minimal' ? 1 : l === 'reduced' ? Math.max(1, Math.ceil(base / 2)) : base; }

  /* ---------- 작은 그림들 ---------- */
  function ring(ctx, x, y, r, w, color, a) {
    if (r <= 0) return;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.lineWidth = w; ctx.strokeStyle = rgba(color, a); ctx.stroke();
  }
  function disc(ctx, x, y, r, color, a) {
    if (r <= 0) return;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = rgba(color, a); ctx.fill();
  }
  /* 번지는 빛 — 방사형 그라데이션 대신 원 세 겹(투명도 겹침). 그라데이션은 저사양 휴대폰(CPU 그리기)에서 비싸다(perf.js 로 확인) */
  function glowDisc(ctx, x, y, r, color, a) {
    if (r <= 0 || a <= 0.01) return;
    disc(ctx, x, y, r, color, a * 0.22);
    disc(ctx, x, y, r * 0.66, color, a * 0.3);
    disc(ctx, x, y, r * 0.36, color, a * 0.45);
  }
  function star(ctx, x, y, r, points, inner, rot, fill, a) {
    ctx.beginPath();
    for (var i = 0; i < points * 2; i++) {
      var rr = i % 2 ? r * inner : r, ang = rot + i * Math.PI / points;
      ctx.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr);
    }
    ctx.closePath(); ctx.fillStyle = rgba(fill, a); ctx.fill();
  }
  function poly(ctx, pts, fill, a, stroke) {
    ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
    for (var i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath(); ctx.fillStyle = rgba(fill, a); ctx.fill();
    if (stroke) { ctx.lineWidth = 1.5; ctx.strokeStyle = rgba(stroke, a); ctx.stroke(); }
  }
  function glyph(ctx, ch, x, y, size, color, a) {
    ctx.font = '900 ' + Math.round(size) + 'px ' + (RPD.FONT_STACK || 'sans-serif');
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3; ctx.strokeStyle = rgba('#1a1030', a * 0.7); ctx.strokeText(ch, x, y);
    ctx.fillStyle = rgba(color, a); ctx.fillText(ch, x, y);
  }
  /* 떨어지는 조각 모양 — 화면 기준 위아래(dir: 화면 아래로 향하는 논리 단위 벡터) */
  function shard(ctx, kind, x, y, s, rot, c1, c2, a, dir) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    if (kind === 'rock') {
      poly(ctx, [-s, -s * 0.6, -s * 0.3, -s, s * 0.7, -s * 0.8, s, s * 0.1, s * 0.4, s * 0.9, -s * 0.8, s * 0.6], c1, a, c2);
    } else if (kind === 'ice') {
      ctx.restore(); ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(dir.y, dir.x) - Math.PI / 2);
      poly(ctx, [0, s * 1.6, -s * 0.45, -s * 0.8, s * 0.45, -s * 0.8], c1, a, c2);
    } else if (kind === 'star') {
      star(ctx, 0, 0, s, 5, 0.45, 0, c1, a);
    } else if (kind === 'drop') {
      ctx.restore(); ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(dir.y, dir.x) - Math.PI / 2);
      ctx.beginPath(); ctx.moveTo(0, s * 1.3); ctx.quadraticCurveTo(s * 0.8, -s * 0.2, 0, -s * 0.7); ctx.quadraticCurveTo(-s * 0.8, -s * 0.2, 0, s * 1.3);
      ctx.fillStyle = rgba(c1, a); ctx.fill();
    } else if (kind === 'petal') {
      ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.45, 0, 0, TAU); ctx.fillStyle = rgba(c1, a); ctx.fill();
      ctx.beginPath(); ctx.ellipse(s * 0.2, 0, s * 0.45, s * 0.16, 0, 0, TAU); ctx.fillStyle = rgba(c2, a * 0.8); ctx.fill();
    } else if (kind === 'ember') {
      glowDisc(ctx, 0, 0, s * 1.6, c1, a * 0.8); disc(ctx, 0, 0, s * 0.55, c2, a);
    } else {
      disc(ctx, 0, 0, s, c1, a);
    }
    ctx.restore();
  }
  function zigzag(ctx, x0, y0, x1, y1, seg, amp, seeds) {
    ctx.beginPath(); ctx.moveTo(x0, y0);
    var dx = x1 - x0, dy = y1 - y0, len = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / len, ny = dx / len;
    for (var i = 1; i < seg; i++) {
      var k = i / seg, o = (seeds[i % seeds.length] - 0.5) * 2 * amp;
      ctx.lineTo(x0 + dx * k + nx * o, y0 + dy * k + ny * o);
    }
    ctx.lineTo(x1, y1);
  }
  function burst(ctx, x, y, r, k, c1, c2, spikes) {
    var a = 1 - k;
    glowDisc(ctx, x, y, r * (0.6 + 0.6 * easeOut(k)), c1, 0.75 * a);
    if (spikes) star(ctx, x, y, r * (0.5 + 0.5 * easeOut(k)), spikes, 0.42, k * 0.6, c2, 0.9 * a);
    ring(ctx, x, y, r * (0.4 + 0.9 * easeOut(k)), 3, c2, a);
  }

  /* ---------- 모티프 ----------
   * 각 함수는 { dur, draw(ctx, e, k, el) } 를 돌려준다. k = 0~1 진행, el = 흐른 초.
   * c = 스킬 설정(color · color2 · …), P = { from, to, targets[], allies[], radius } */
  var M = {};

  /* 하늘에서 떨어진다(돌 · 얼음 · 별 · 빗방울 · 불똥) — 대상마다 per 개 */
  M.rain = function (c, P) {
    var items = [], per = n(c.per || 2), tg = P.targets.slice(0, n(c.maxTargets || 8));
    if (!tg.length) tg = [P.to];
    tg.forEach(function (t, ti) {
      for (var i = 0; i < per; i++) {
        var ox = (rnd() - 0.5) * 26, oy = (rnd() - 0.5) * 18;
        var end = { x: t.x + ox, y: t.y + oy }, sx = (rnd() - 0.5) * 70 + (c.slant || 0);
        var start = at(end.x, end.y, sx, -(170 + rnd() * 60));
        items.push({ s: start, e: end, d: ti * 0.04 + i * 0.07 + rnd() * 0.05, rot: rnd() * TAU, sz: (c.size || 9) * (0.8 + rnd() * 0.5) });
      }
    });
    var fall = 0.26, dur = 0.85;
    return { dur: dur, draw: function (ctx, e, k, el) {
      for (var i = 0; i < items.length; i++) {
        var it = items[i], lt = (el - it.d) / fall;
        if (lt < 0) continue;
        var dir = { x: it.e.x - it.s.x, y: it.e.y - it.s.y }, dl = Math.sqrt(dir.x * dir.x + dir.y * dir.y) || 1;
        dir.x /= dl; dir.y /= dl;
        if (lt < 1) {
          var p = { x: it.s.x + (it.e.x - it.s.x) * lt * lt, y: it.s.y + (it.e.y - it.s.y) * lt * lt };
          if (c.trail !== false) {
            ctx.beginPath(); ctx.moveTo(p.x - dir.x * 26, p.y - dir.y * 26); ctx.lineTo(p.x, p.y);
            ctx.lineWidth = it.sz * 0.6; ctx.lineCap = 'round'; ctx.strokeStyle = rgba(c.color2, 0.35); ctx.stroke();
          }
          shard(ctx, c.shape, p.x, p.y, it.sz, it.rot + lt * 3, c.color, c.color2, 1, dir);
        } else {
          var ik = clamp01((lt - 1) * fall / 0.35);
          if (ik < 1) burst(ctx, it.e.x, it.e.y, it.sz * 2.2, ik, c.color, c.color2, c.shape === 'star' ? 5 : 0);
        }
      }
    } };
  };

  /* 번개 — 화면 위에서 대상마다 지그재그 + 맞은 자리 번쩍 */
  M.bolt = function (c, P) {
    var tg = P.targets.slice(0, n(c.maxTargets || 10)); if (!tg.length) tg = [P.to];
    var strikes = [];
    tg.forEach(function (t, i) {
      for (var j = 0; j < (c.per || 1); j++) {
        var seeds = []; for (var s = 0; s < 9; s++) seeds.push(rnd());
        strikes.push({ t: t, top: at(t.x, t.y, (rnd() - 0.5) * 60, -230), seeds: seeds, d: i * 0.035 + j * 0.12 });
      }
    });
    return { dur: 0.6, draw: function (ctx, e, k, el) {
      if (c.dim && el < 0.25) { var fb = RPD.Renderer && RPD.Renderer.logicalBounds ? RPD.Renderer.logicalBounds() : { x: 0, y: 0, w: 1000, h: 600 };
        ctx.fillStyle = 'rgba(10,10,40,' + (0.28 * (1 - el / 0.25)).toFixed(3) + ')'; ctx.fillRect(fb.x, fb.y, fb.w, fb.h); }
      for (var i = 0; i < strikes.length; i++) {
        var s = strikes[i], lt = (el - s.d) / 0.3;
        if (lt < 0 || lt > 1.4) continue;
        var a = lt < 1 ? (0.6 + 0.4 * Math.sin(el * 60)) : 1.4 - lt;
        if (lt < 1) {
          zigzag(ctx, s.top.x, s.top.y, s.t.x, s.t.y, 8, 14, s.seeds);
          ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          ctx.lineWidth = 9; ctx.strokeStyle = rgba(c.color, 0.35 * a); ctx.stroke();
          ctx.lineWidth = 3; ctx.strokeStyle = rgba(c.color2, a); ctx.stroke();
        }
        burst(ctx, s.t.x, s.t.y, 22, clamp01(lt / 1.4), c.color, c.color2, c.fist ? 8 : 6);
      }
    } };
  };

  /* 땅 균열 — 시전자(또는 대상) 중심에서 갈라지는 금 + 먼지 + 충격 링 */
  M.quake = function (c, P) {
    var C = c.at === 'target' ? P.to : P.from, R = P.radius || 120, cracks = [], dust = [];
    for (var i = 0; i < n(c.cracks || 7); i++) {
      var ang = i / (c.cracks || 7) * TAU + rnd() * 0.5, pts = [C.x, C.y], r = 0;
      while (r < R) { r += 18 + rnd() * 18; var aa = ang + (rnd() - 0.5) * 0.5; pts.push(C.x + Math.cos(aa) * r, C.y + Math.sin(aa) * r); }
      cracks.push(pts);
    }
    P.targets.slice(0, n(10)).forEach(function (t) { dust.push({ x: t.x, y: t.y, r: 10 + rnd() * 8 }); });
    return { dur: 0.9, draw: function (ctx, e, k) {
      var a = 1 - k, g = easeOut(k / 0.35);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      cracks.forEach(function (pts) {
        var m = Math.max(4, Math.floor(pts.length * g / 2) * 2);
        ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
        for (var i = 2; i < m; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
        ctx.lineWidth = 5; ctx.strokeStyle = rgba('#2a1a08', 0.55 * a); ctx.stroke();
        ctx.lineWidth = 2; ctx.strokeStyle = rgba(c.color2, 0.8 * a); ctx.stroke();
      });
      ring(ctx, C.x, C.y, R * easeOut(k), 6 * a + 1, c.color, 0.8 * a);
      dust.forEach(function (d) { glowDisc(ctx, d.x, d.y, d.r * (1 + 1.5 * k), c.color, 0.6 * a); });
    } };
  };

  /* 퍼지는 물결 + 떠오르는 글자(Z · 음표 · 하트 · 소용돌이 · 육각) */
  M.wave = function (c, P) {
    var C = c.at === 'target' ? P.to : P.from, R = P.radius || 140, marks = [];
    var tg = P.targets.slice(0, n(10));
    tg.forEach(function (t) { marks.push({ x: t.x + (rnd() - 0.5) * 14, y: t.y, ph: rnd() * TAU, d: rnd() * 0.2 }); });
    for (var i = 0; i < n(c.extra || 6); i++) { var ang = rnd() * TAU, rr = R * (0.3 + rnd() * 0.6); marks.push({ x: C.x + Math.cos(ang) * rr, y: C.y + Math.sin(ang) * rr, ph: rnd() * TAU, d: 0.1 + rnd() * 0.3 }); }
    return { dur: 1.0, draw: function (ctx, e, k, el) {
      var a = 1 - k;
      for (var w = 0; w < (level() === 'minimal' ? 1 : 3); w++) {
        var wk = clamp01(k * 1.3 - w * 0.18);
        if (wk > 0 && wk < 1) ring(ctx, C.x, C.y, R * easeOut(wk), 5 * (1 - wk) + 1, w % 2 ? c.color2 : c.color, 0.8 * (1 - wk));
      }
      if (c.glyph === 'hex') {
        ctx.beginPath();
        for (var h = 0; h <= 6; h++) { var ha = h / 6 * TAU + el; ctx.lineTo(C.x + Math.cos(ha) * R * 0.85 * easeOut(k * 2), C.y + Math.sin(ha) * R * 0.85 * easeOut(k * 2)); }
        ctx.lineWidth = 3; ctx.strokeStyle = rgba(c.color2, a); ctx.stroke(); ctx.fillStyle = rgba(c.color, 0.12 * a); ctx.fill();
      }
      if (level() === 'minimal') return;
      marks.forEach(function (m) {
        var lt = clamp01((el - m.d) / 0.8); if (lt <= 0) return;
        var up = at(m.x, m.y, Math.sin(m.ph + el * 4) * 6, -lt * 34);
        var ma = (1 - lt) * a + 0.15 * (1 - lt);
        if (c.glyph === 'spiral') {
          ctx.beginPath();
          for (var s = 0; s < 22; s++) { var sa = s * 0.6 + el * 9 + m.ph, sr = s * 0.75; ctx.lineTo(up.x + Math.cos(sa) * sr, up.y + Math.sin(sa) * sr); }
          ctx.lineWidth = 2; ctx.strokeStyle = rgba(c.color2, ma); ctx.stroke();
        } else if (c.glyph === 'spore') {
          disc(ctx, up.x, up.y, 3.5, c.color, ma); disc(ctx, up.x + 5, up.y + 3, 2.5, c.color2, ma);
        } else if (c.glyph === 'wind') {
          ctx.beginPath(); ctx.arc(up.x, up.y, 10, m.ph, m.ph + 2.2); ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.strokeStyle = rgba(c.color2, ma); ctx.stroke();
        } else if (c.glyph && c.glyph !== 'hex') {
          glyph(ctx, c.glyph, up.x, up.y, c.glyphSize || 16, c.glyphColor || c.color2, ma);
        }
      });
    } };
  };

  /* 광선 — 시전자 → 대상 방향으로 화면 끝까지(through) 또는 대상까지. 무지개 · 얼음 결정 · 물보라 */
  M.beam = function (c, P) {
    var f = P.from, t = P.to, dx = t.x - f.x, dy = t.y - f.y, L = Math.sqrt(dx * dx + dy * dy) || 1;
    var ux = dx / L, uy = dy / L, len = c.through ? Math.max(L, 700) : L, W = c.width || 16;
    var bits = []; for (var i = 0; i < n(10); i++) bits.push({ s: rnd(), o: (rnd() - 0.5) * W, r: rnd() * TAU });
    return { dur: 0.65, draw: function (ctx, e, k, el) {
      var grow = easeOut(k / 0.25), a = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4, w = W * (k < 0.6 ? 1 : a);
      var ex = f.x + ux * len * grow, ey = f.y + uy * len * grow;
      ctx.lineCap = 'round';
      var layers = c.rainbow ? ['#ff5f6d', '#ffc371', '#7dffb0', '#62c8ff', '#c38bff'] : null;
      if (layers) {
        for (var j = 0; j < layers.length; j++) {
          var off = (j - 2) * w * 0.22;
          ctx.beginPath(); ctx.moveTo(f.x - uy * off, f.y + ux * off); ctx.lineTo(ex - uy * off, ey + ux * off);
          ctx.lineWidth = w * 0.3; ctx.strokeStyle = rgba(layers[j], 0.85 * a); ctx.stroke();
        }
      } else {
        ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(ex, ey);
        ctx.lineWidth = w * 1.8; ctx.strokeStyle = rgba(c.color, 0.3 * a); ctx.stroke();
        ctx.lineWidth = w; ctx.strokeStyle = rgba(c.color, 0.85 * a); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(ex, ey);
      ctx.lineWidth = w * 0.35; ctx.strokeStyle = rgba(c.color2, a); ctx.stroke();
      glowDisc(ctx, f.x, f.y, W * 1.6, c.color2, 0.8 * a);
      if (level() !== 'minimal') bits.forEach(function (b) {
        var bx = f.x + ux * len * grow * b.s - uy * b.o, by = f.y + uy * len * grow * b.s + ux * b.o;
        if (c.bits === 'crystal') star(ctx, bx, by, 6, 6, 0.35, b.r, c.color2, a);
        else if (c.bits === 'bubble') ring(ctx, bx, by, 4 + 3 * Math.sin(el * 8 + b.r), 1.5, c.color2, a);
        else disc(ctx, bx, by, 2, c.color2, a);
      });
      P.targets.slice(0, n(8)).forEach(function (tt) { burst(ctx, tt.x, tt.y, W * 1.4, clamp01(k * 1.4), c.color, c.color2, 0); });
    } };
  };

  /* 참격 — x(교차) · claw(세 줄) · big(긴 사선 하나) · multi(연속) · tail(휘두르는 호) */
  M.slash = function (c, P) {
    var t = P.to, cuts = [], cnt = c.style === 'x' ? 2 : c.style === 'claw' ? 3 : (c.count || 1);
    for (var i = 0; i < cnt; i++) {
      var ang = c.style === 'x' ? (i ? -0.8 : 0.8) : c.style === 'claw' ? 0.9 : (rnd() - 0.5) * 2.4;
      var off = c.style === 'claw' ? (i - 1) * 9 : 0;
      cuts.push({ ang: ang, off: off, d: c.style === 'multi' ? i * 0.09 : c.style === 'x' ? i * 0.07 : 0 });
    }
    var len = c.len || 46;
    return { dur: 0.55 + (c.style === 'multi' ? cnt * 0.09 : 0), draw: function (ctx, e, k, el) {
      if (c.style === 'tail') {
        var g = easeOut(clamp01(el / 0.3)), a = 1 - k;
        ctx.beginPath(); ctx.arc(P.from.x, P.from.y, 46, -1.4, -1.4 + g * 4.2);
        ctx.lineWidth = 14 * a + 2; ctx.lineCap = 'round'; ctx.strokeStyle = rgba(c.color, 0.7 * a); ctx.stroke();
        ctx.lineWidth = 4; ctx.strokeStyle = rgba(c.color2, a); ctx.stroke();
        burst(ctx, t.x, t.y, 30, k, c.color, c.color2, 6);
        return;
      }
      cuts.forEach(function (s) {
        var lt = (el - s.d) / 0.22; if (lt < 0) return;
        var g = easeOut(clamp01(lt)), a = clamp01(1.6 - lt);
        var cx = t.x + Math.cos(s.ang + Math.PI / 2) * s.off, cy = t.y + Math.sin(s.ang + Math.PI / 2) * s.off;
        var x0 = cx - Math.cos(s.ang) * len, y0 = cy - Math.sin(s.ang) * len;
        var x1 = x0 + Math.cos(s.ang) * len * 2 * g, y1 = y0 + Math.sin(s.ang) * len * 2 * g;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
        ctx.lineWidth = 9; ctx.strokeStyle = rgba(c.color, 0.55 * a); ctx.stroke();
        ctx.lineWidth = 3; ctx.strokeStyle = rgba(c.color2, a); ctx.stroke();
      });
      if (k > 0.2) burst(ctx, t.x, t.y, 26, (k - 0.2) / 0.8, c.color, c.color2, 0);
    } };
  };

  /* 주먹 — 맞은 자리 큰 별 + 충격 링 + 효과선. count 번 연속 · kick 은 화면 위에서 내리꽂음 · crown 은 금관 */
  M.punch = function (c, P) {
    var t = P.to, hits = [];
    for (var i = 0; i < (c.count || 1); i++) hits.push({ x: t.x + (i ? (rnd() - 0.5) * 22 : 0), y: t.y + (i ? (rnd() - 0.5) * 16 : 0), d: i * 0.1, rot: rnd() });
    var R = c.size || 30;
    return { dur: 0.6 + hits.length * 0.1, draw: function (ctx, e, k, el) {
      if (c.style === 'kick' && el < 0.18) {
        var p0 = at(t.x, t.y, 0, -150), g = el / 0.18, px = p0.x + (t.x - p0.x) * g, py = p0.y + (t.y - p0.y) * g;
        ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(px, py); ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.strokeStyle = rgba(c.color2, 0.6); ctx.stroke();
        disc(ctx, px, py, 9, c.color, 1);
        return;
      }
      var base = c.style === 'kick' ? 0.18 : 0;
      hits.forEach(function (h) {
        var lt = (el - base - h.d) / 0.42; if (lt < 0 || lt > 1) return;
        var a = 1 - lt;
        star(ctx, h.x, h.y, R * (0.6 + 0.6 * easeOut(lt)), c.style === 'crown' ? 5 : 8, 0.45, h.rot, c.color, 0.85 * a);
        star(ctx, h.x, h.y, R * 0.5 * (0.6 + 0.6 * easeOut(lt)), 8, 0.5, h.rot + 0.3, c.color2, a);
        ring(ctx, h.x, h.y, R * 1.7 * easeOut(lt), 4 * a + 1, c.color2, a);
        if (level() !== 'minimal') for (var s = 0; s < 8; s++) {
          var sa = s / 8 * TAU + h.rot, r0 = R * (0.9 + lt), r1 = r0 + 14 * a;
          ctx.beginPath(); ctx.moveTo(h.x + Math.cos(sa) * r0, h.y + Math.sin(sa) * r0); ctx.lineTo(h.x + Math.cos(sa) * r1, h.y + Math.sin(sa) * r1);
          ctx.lineWidth = 2.5; ctx.strokeStyle = rgba(c.color2, a); ctx.stroke();
        }
        if (c.style === 'crown' && lt < 0.8) {
          var cp = at(h.x, h.y, 0, -R * 1.4 - 10 * lt);
          poly(ctx, [cp.x - 14, cp.y + 7, cp.x - 14, cp.y - 5, cp.x - 7, cp.y + 1, cp.x, cp.y - 9, cp.x + 7, cp.y + 1, cp.x + 14, cp.y - 5, cp.x + 14, cp.y + 7], '#ffd23f', a, '#7a4a00');
        }
        if (c.style === 'claw') for (var cl = -1; cl <= 1; cl++) {
          ctx.beginPath(); ctx.arc(h.x + cl * 8, h.y, R * 0.9, -2.3, -0.8); ctx.lineWidth = 3; ctx.strokeStyle = rgba(c.color2, a); ctx.stroke();
        }
      });
    } };
  };

  /* 구체 — 시전자에서 대상으로 날아가 터진다(arc 면 포물선 · 알폭탄). bolts 면 터질 때 주변 대상에 번개 */
  M.orb = function (c, P) {
    var f = P.from, t = P.to, fly = 0.3, R = c.size || 14;
    var extra = c.bolts ? P.targets.slice(1, n(6)) : [];
    return { dur: fly + 0.5, draw: function (ctx, e, k, el) {
      if (el < fly) {
        var g = el / fly, x = f.x + (t.x - f.x) * g, y = f.y + (t.y - f.y) * g;
        if (c.arc) { var up = at(0, 0, 0, -c.arc * 4 * g * (1 - g)); x += up.x; y += up.y; }
        glowDisc(ctx, x, y, R * 2.2, c.color, 0.6);
        disc(ctx, x, y, R, c.color, 1); disc(ctx, x - R * 0.3, y - R * 0.3, R * 0.4, c.color2, 0.9);
        if (c.dark) ring(ctx, x, y, R + 3 + Math.sin(el * 40) * 2, 2, c.color2, 0.8);
        return;
      }
      var bk = clamp01((el - fly) / 0.5);
      burst(ctx, t.x, t.y, R * 3.4, bk, c.color, c.color2, c.dark ? 0 : 7);
      if (c.dark) ring(ctx, t.x, t.y, R * 4 * (1 - bk), 3, c.color2, 1 - bk);   // 섀도볼: 터진 뒤 안으로 빨려드는 링
      extra.forEach(function (o, i) {
        if (bk > 0.6) return;
        zigzag(ctx, t.x, t.y, o.x, o.y, 6, 10, [0.2, 0.8, 0.4, 0.6, 0.1, 0.9]);
        ctx.lineWidth = 2.5; ctx.strokeStyle = rgba(c.color2, 1 - bk / 0.6); ctx.stroke();
      });
    } };
  };

  /* 압축 — 대상 둘레 링이 안으로 조여들다 터진다(사이코키네시스 · 사이코브레이크). all 이면 맞은 적 전부 */
  M.squeeze = function (c, P) {
    var tg = c.all ? P.targets.slice(0, n(10)) : [P.to];
    if (!tg.length) tg = [P.to];
    var R = c.size || 44;
    return { dur: 0.75, draw: function (ctx, e, k) {
      tg.forEach(function (t) {
        if (k < 0.55) {
          var g = k / 0.55, rr = R * (1 - easeOut(g) * 0.8);
          for (var i = 0; i < 3; i++) ring(ctx, t.x, t.y, rr + i * 7, 3, i % 2 ? c.color2 : c.color, 0.5 + 0.5 * g);
          glowDisc(ctx, t.x, t.y, R * 0.6, c.color, 0.35 * g);
        } else burst(ctx, t.x, t.y, R * 1.1, (k - 0.55) / 0.45, c.color, c.color2, 10);
      });
      if (c.shock) ring(ctx, P.from.x, P.from.y, (P.radius || 300) * easeOut(k), 4 * (1 - k) + 1, c.color, 0.7 * (1 - k));
    } };
  };

  /* 드릴 — 나선 원뿔이 대상으로 꽂힌다 */
  M.drill = function (c, P) {
    var f = P.from, t = P.to, dx = t.x - f.x, dy = t.y - f.y, L = Math.sqrt(dx * dx + dy * dy) || 1, ang = Math.atan2(dy, dx);
    return { dur: 0.7, draw: function (ctx, e, k, el) {
      var g = easeOut(clamp01(el / 0.3)), x = f.x + dx * g, y = f.y + dy * g;
      if (el < 0.42) {
        ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
        poly(ctx, [18, 0, -22, -11, -22, 11], c.color, 1, c.color2);
        for (var s = 0; s < 4; s++) { var sx = -20 + s * 9 + ((el * 160) % 9); ctx.beginPath(); ctx.moveTo(sx, -10 + s * 2.5); ctx.lineTo(sx + 5, 10 - s * 2.5); ctx.lineWidth = 2; ctx.strokeStyle = rgba(c.color2, 0.9); ctx.stroke(); }
        ctx.restore();
        ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(x, y); ctx.lineWidth = 3; ctx.strokeStyle = rgba(c.color2, 0.35); ctx.stroke();
      }
      if (el > 0.28) { var bk = clamp01((el - 0.28) / 0.42); burst(ctx, t.x, t.y, 30, bk, c.color, c.color2, 12); }
    } };
  };

  /* 바늘 · 별 일제 사격 — 시전자에서 대상마다 count 개 */
  M.needles = function (c, P) {
    var tg = P.targets.slice(0, n(c.maxTargets || 6)); if (!tg.length) tg = [P.to];
    var shots = [];
    tg.forEach(function (t, ti) { for (var i = 0; i < n(c.count || 3); i++) shots.push({ t: t, d: ti * 0.03 + i * 0.06, curve: (rnd() - 0.5) * (c.curve || 40) }); });
    return { dur: 0.75, draw: function (ctx, e, k, el) {
      shots.forEach(function (s) {
        var lt = (el - s.d) / 0.28; if (lt < 0) return;
        var f = P.from, t = s.t;
        if (lt < 1) {
          var g = lt, mx = (f.x + t.x) / 2 - (t.y - f.y) / 300 * s.curve, my = (f.y + t.y) / 2 + (t.x - f.x) / 300 * s.curve;
          var x = (1 - g) * (1 - g) * f.x + 2 * (1 - g) * g * mx + g * g * t.x, y = (1 - g) * (1 - g) * f.y + 2 * (1 - g) * g * my + g * g * t.y;
          var ang = Math.atan2(t.y - y, t.x - x);
          if (c.shape === 'star') star(ctx, x, y, 8, 5, 0.45, el * 12, c.color, 1);
          else { ctx.save(); ctx.translate(x, y); ctx.rotate(ang); poly(ctx, [12, 0, -10, -2.5, -10, 2.5], c.color, 1, c.color2); ctx.restore(); }
        } else { var bk = clamp01((lt - 1) * 0.28 / 0.3); if (bk < 1) burst(ctx, t.x, t.y, 12, bk, c.color, c.color2, c.shape === 'star' ? 5 : 0); }
      });
    } };
  };

  /* 지대 — 스킬 지속 시간 동안 바닥에 남는다(독 · 오물 · 불 · 물결). 범위 = 판정 범위 */
  M.pool = function (c, P) {
    // 지대는 판정과 같은 자리 · 반경(SkillManager.castZone — 시전자 중심 · 사거리, 필드 전체 사거리면 LONG)
    var C = c.at === 'target' ? P.to : P.from, R = P.zoneRadius || P.radius || 120, dur = Math.max(1, P.duration || 4), bub = [];
    for (var i = 0; i < n(14); i++) { var ang = rnd() * TAU, rr = Math.sqrt(rnd()) * R * 0.9; bub.push({ x: C.x + Math.cos(ang) * rr, y: C.y + Math.sin(ang) * rr, ph: rnd(), sp: 0.6 + rnd() }); }
    return { dur: dur, draw: function (ctx, e, k, el) {
      var a = Math.min(1, el / 0.25) * Math.min(1, (dur - el) / 0.5);
      glowDisc(ctx, C.x, C.y, R, c.color, 0.42 * a);
      ring(ctx, C.x, C.y, R * (0.97 + 0.03 * Math.sin(el * 3)), 2.5, c.color2, 0.55 * a);
      if (el < 0.5) ring(ctx, C.x, C.y, R * easeOut(el / 0.5), 4, c.color2, 1 - el / 0.5);
      if (level() === 'minimal') return;
      bub.forEach(function (b) {
        var ph = (el * b.sp + b.ph) % 1, ba = a * Math.sin(ph * Math.PI);
        if (c.bits === 'flame') {
          var fp = at(b.x, b.y, 0, -ph * 18);
          poly(ctx, [fp.x, fp.y - 12 * (1 - ph * 0.5), fp.x + 6, fp.y, fp.x, fp.y + 4, fp.x - 6, fp.y], c.color2, ba);
        } else if (c.bits === 'ripple') {
          ring(ctx, b.x, b.y, 4 + ph * 14, 2, c.color2, ba);
        } else {
          ring(ctx, b.x, b.y, 2 + ph * 6, 1.8, c.color2, ba); disc(ctx, b.x, b.y, 1.5 + ph * 2, c.color, ba * 0.6);
        }
      });
    } };
  };

  /* 아군 오라 — 필드 전투 유닛마다 빛기둥 + 떠오르는 무늬(달 · 바위 · 빛살 · 육각 방패 · 알) */
  M.aura = function (c, P) {
    var al = P.allies.slice(0, n(20)), marks = [];
    al.forEach(function (u) { marks.push({ x: u.x, y: u.y, d: rnd() * 0.25, ph: rnd() * TAU }); });
    return { dur: 1.2, draw: function (ctx, e, k, el) {
      var a = 1 - k;
      ring(ctx, P.from.x, P.from.y, 120 * easeOut(k), 5 * a + 1, c.color, 0.8 * a);
      marks.forEach(function (m) {
        var lt = clamp01((el - m.d) / 0.9); if (lt <= 0) return;
        var ma = Math.sin(lt * Math.PI);
        var top = at(m.x, m.y, 0, -48);
        ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(top.x, top.y); ctx.lineCap = 'round';
        ctx.lineWidth = 16; ctx.strokeStyle = rgba(c.color, 0.22 * ma); ctx.stroke();
        ctx.lineWidth = 4; ctx.strokeStyle = rgba(c.color2, 0.6 * ma); ctx.stroke();
        if (level() === 'minimal') return;
        var g = at(m.x, m.y, Math.sin(m.ph + el * 5) * 8, -18 - lt * 30);
        if (c.glyph === 'moon') { disc(ctx, g.x, g.y, 7, c.color2, ma); disc(ctx, g.x + 3, g.y - 2, 6, c.color, ma); }
        else if (c.glyph === 'rocks') { for (var r = 0; r < 3; r++) { var ra = m.ph + el * 4 + r * TAU / 3; shard(ctx, 'rock', m.x + Math.cos(ra) * 22, m.y + Math.sin(ra) * 22, 5, ra, c.color, c.color2, ma, { x: 0, y: 1 }); } }
        else if (c.glyph === 'hex') { ctx.beginPath(); for (var h = 0; h <= 6; h++) { var ha = h / 6 * TAU; ctx.lineTo(m.x + Math.cos(ha) * 26, m.y + Math.sin(ha) * 26); } ctx.lineWidth = 2.5; ctx.strokeStyle = rgba(c.color2, ma); ctx.stroke(); ctx.fillStyle = rgba(c.color, 0.15 * ma); ctx.fill(); }
        else if (c.glyph === 'egg') { ctx.beginPath(); ctx.ellipse(g.x, g.y, 6, 8, 0, 0, TAU); ctx.fillStyle = rgba('#fffaf0', ma); ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = rgba(c.color, ma); ctx.stroke(); }
        else star(ctx, g.x, g.y, 7, 4, 0.35, el * 3, c.color2, ma);
      });
    } };
  };

  /* 화염 폭발 — 시전자(또는 대상) 둘레 불길. style: ring(기본) · kanji(대문자 — 다섯 갈래) · wings(불새 — 양 날개) · dash(돌진 꼬리) */
  M.nova = function (c, P) {
    // 판정 범위(사거리)를 그대로 쓰면 장거리 포켓몬은 불길이 필드를 덮는다 — 시전자 둘레는 120 · 대상 자리는 70 으로 묶는다
    var C = c.at === 'target' ? P.to : P.from, R = c.at === 'target' ? 70 : Math.min(P.radius || 110, 120), tongues = [];
    for (var i = 0; i < n(14); i++) tongues.push({ a: i / 14 * TAU + rnd() * 0.3, l: 0.6 + rnd() * 0.5 });
    var dash = c.style === 'dash' ? { x: P.to.x, y: P.to.y } : null;
    return { dur: c.style === 'wings' ? 1.1 : 0.85, draw: function (ctx, e, k, el) {
      var a = 1 - k, g = easeOut(k / 0.5);
      glowDisc(ctx, C.x, C.y, R * (0.5 + 0.7 * g), c.color, 0.55 * a);
      if (c.style === 'kanji') {
        var arms = [[-1.57, 1], [0.35, 0.9], [2.8, 0.9], [-0.6, 0.75], [-2.55, 0.75]];
        arms.forEach(function (am) {
          var ex = C.x + Math.cos(am[0]) * R * am[1] * g, ey = C.y + Math.sin(am[0]) * R * am[1] * g;
          ctx.beginPath(); ctx.moveTo(C.x, C.y); ctx.lineTo(ex, ey); ctx.lineCap = 'round';
          ctx.lineWidth = 18 * a + 3; ctx.strokeStyle = rgba(c.color, 0.85 * a); ctx.stroke();
          ctx.lineWidth = 6; ctx.strokeStyle = rgba(c.color2, a); ctx.stroke();
        });
      } else if (c.style === 'wings') {
        for (var sd = -1; sd <= 1; sd += 2) {
          for (var fth = 0; fth < 5; fth++) {
            var base = at(P.from.x, P.from.y, sd * 8, 0), tip = at(P.from.x, P.from.y, sd * (60 + fth * 22) * g, -(70 - fth * 14) * g);
            ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.quadraticCurveTo((base.x + tip.x) / 2 + 4, (base.y + tip.y) / 2 - 18, tip.x, tip.y);
            ctx.lineWidth = 9 - fth; ctx.lineCap = 'round'; ctx.strokeStyle = rgba(fth % 2 ? c.color2 : c.color, 0.85 * a); ctx.stroke();
          }
        }
      } else {
        tongues.forEach(function (t) {
          var r0 = R * 0.3 * g, r1 = R * t.l * g * (0.85 + 0.15 * Math.sin(el * 20 + t.a));
          ctx.beginPath(); ctx.moveTo(C.x + Math.cos(t.a - 0.15) * r0, C.y + Math.sin(t.a - 0.15) * r0);
          ctx.lineTo(C.x + Math.cos(t.a) * r1, C.y + Math.sin(t.a) * r1);
          ctx.lineTo(C.x + Math.cos(t.a + 0.15) * r0, C.y + Math.sin(t.a + 0.15) * r0);
          ctx.closePath(); ctx.fillStyle = rgba(t.l > 0.85 ? c.color2 : c.color, 0.85 * a); ctx.fill();
        });
      }
      ring(ctx, C.x, C.y, R * easeOut(k), 5 * a + 1, c.color2, 0.8 * a);
      if (dash && el < 0.35) {
        ctx.beginPath(); ctx.moveTo(P.from.x, P.from.y); ctx.lineTo(dash.x, dash.y);
        ctx.lineWidth = 12 * (1 - el / 0.35); ctx.lineCap = 'round'; ctx.strokeStyle = rgba(c.color, 0.6); ctx.stroke();
      }
      P.targets.slice(0, n(8)).forEach(function (t) { if (k > 0.15) burst(ctx, t.x, t.y, 16, (k - 0.15) / 0.85, c.color, c.color2, 0); });
    } };
  };

  /* 눈보라 — 필드 전체를 가로지르는 눈발(화면 기준 비스듬히) + 맞은 적마다 성에 */
  M.blizzard = function (c, P) {
    var fb = RPD.Renderer && RPD.Renderer.logicalBounds ? RPD.Renderer.logicalBounds() : { x: 0, y: 0, w: 1000, h: 600 };
    var flakes = []; for (var i = 0; i < n(60); i++) flakes.push({ x: fb.x + rnd() * fb.w, y: fb.y + rnd() * fb.h, s: 2 + rnd() * 3, sp: 0.7 + rnd() * 0.6 });
    var tg = P.targets.slice(0, n(12));
    return { dur: 1.2, draw: function (ctx, e, k, el) {
      var a = Math.min(1, el / 0.2) * (1 - k);
      ctx.fillStyle = rgba(c.color, 0.12 * a); ctx.fillRect(fb.x, fb.y, fb.w, fb.h);
      flakes.forEach(function (f) {
        var p = at(f.x, f.y, (el * 420 * f.sp) % 300 - 150, (el * 260 * f.sp) % 200 - 100);
        var q = at(p.x, p.y, -12, -7);
        ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(p.x, p.y); ctx.lineWidth = f.s; ctx.lineCap = 'round'; ctx.strokeStyle = rgba(c.color2, 0.85 * a); ctx.stroke();
      });
      tg.forEach(function (t) { star(ctx, t.x, t.y, 16 * easeOut(k * 2), 6, 0.3, 0, c.color2, 0.9 * a); ring(ctx, t.x, t.y, 18, 2, c.color, a); });
    } };
  };

  /* 도깨비불 — 푸른 불꽃이 시전자에서 출렁이며 대상마다 날아가 붙는다 */
  M.wisp = function (c, P) {
    var tg = P.targets.slice(0, n(8)); if (!tg.length) tg = [P.to];
    var fl = tg.map(function (t, i) { return { t: t, d: i * 0.07, ph: rnd() * TAU }; });
    return { dur: 1.0, draw: function (ctx, e, k, el) {
      fl.forEach(function (w) {
        var lt = (el - w.d) / 0.55; if (lt < 0) return;
        var f = P.from, t = w.t;
        if (lt < 1) {
          var x = f.x + (t.x - f.x) * lt, y = f.y + (t.y - f.y) * lt, sw = at(0, 0, Math.sin(lt * 9 + w.ph) * 14, 0);
          x += sw.x; y += sw.y;
          glowDisc(ctx, x, y, 16, c.color, 0.7);
          var tip = at(x, y, 0, -14);
          poly(ctx, [tip.x, tip.y, x + 6, y, x, y + 6, x - 6, y], c.color2, 0.95);
        } else { var bk = clamp01((lt - 1) * 0.55 / 0.4); if (bk < 1) burst(ctx, t.x, t.y, 20, bk, c.color, c.color2, 0); }
      });
    } };
  };

  /* 꽃잎 폭풍 — 시전자 둘레를 도는 꽃잎 소용돌이가 커지며 대상마다 꽃잎이 흩어진다 */
  M.petals = function (c, P) {
    var C = P.from, R = P.radius || 220, ps = [];
    for (var i = 0; i < n(36); i++) ps.push({ a: rnd() * TAU, r: rnd(), s: 5 + rnd() * 4, sp: 2 + rnd() * 2 });
    var tg = P.targets.slice(0, n(10));
    return { dur: 1.2, draw: function (ctx, e, k, el) {
      var a = Math.min(1, el / 0.15) * (1 - k);
      ps.forEach(function (p) {
        var ang = p.a + el * p.sp, rr = (0.15 + p.r * 0.85) * R * easeOut(k * 1.4);
        shard(ctx, 'petal', C.x + Math.cos(ang) * rr, C.y + Math.sin(ang) * rr, p.s, ang * 2, c.color, c.color2, a, { x: 0, y: 1 });
      });
      tg.forEach(function (t) { if (k > 0.25) burst(ctx, t.x, t.y, 16, (k - 0.25) / 0.75, c.color, c.color2, 5); });
    } };
  };

  /* 둘을 겹친다 — 예: 전자포 = 구체 + 번개 · 블래스트번 = 화염 + 불똥 비 */
  function combo(c, P) {
    var parts = (c.parts || []).map(function (pc) {
      var cc = {}; for (var key in c) if (key !== 'parts') cc[key] = c[key]; for (var k2 in pc) cc[k2] = pc[k2];
      return M[cc.m] ? M[cc.m](cc, P) : null;
    }).filter(Boolean);
    var dur = 0; parts.forEach(function (p) { dur = Math.max(dur, p.dur + (p.delay || 0)); });
    return { dur: dur, draw: function (ctx, e, k, el) {
      parts.forEach(function (p) { var pe = el; if (pe >= 0 && pe <= p.dur) p.draw(ctx, e, pe / p.dur, pe); });
    } };
  }

  /* ---------- 컷인(불멸 · 초월 스킬) — 화면 위쪽 띠 0.9초, 4초에 한 번 ---------- */
  function cutin(name, color) {
    return { dur: 0.95, screen: true, draw: function (ctx, e, k, el, W) {
      var g = easeOut(clamp01(el / 0.18)), a = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25, y = 14, h = 36;   // 필드 맨 위 띠 — 포켓몬 칸을 덜 가린다
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(W * (1 - g) * 0.4, 0);
      ctx.fillStyle = 'rgba(8,10,30,0.82)';
      ctx.beginPath(); ctx.moveTo(W * 0.12, y); ctx.lineTo(W * 0.92, y); ctx.lineTo(W * 0.88, y + h); ctx.lineTo(W * 0.08, y + h); ctx.closePath(); ctx.fill();
      ctx.fillStyle = color; ctx.fillRect(W * 0.1, y + h - 4, W * 0.8, 4); ctx.fillRect(W * 0.14, y, W * 0.78, 3);
      ctx.font = '900 22px ' + (RPD.FONT_STACK || 'sans-serif'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeText(name, W * 0.5, y + h / 2 + 1);
      ctx.fillStyle = '#ffffff'; ctx.fillText(name, W * 0.5, y + h / 2 + 1);
      ctx.restore();
    } };
  }

  /* ---------- 공개 ---------- */
  S.handles = function (skill) { return !!(skill && RPD.SkillFxData && RPD.SkillFxData[skill.id]); };

  S.play = function (p) {
    if (!p || !p.unit || !S.handles(p.skill)) return null;
    var c0 = RPD.SkillFxData[p.skill.id], c = {};
    for (var key in c0) c[key] = c0[key];
    var u = p.unit, sk = p.skill;
    var targets = (p.targets || []).filter(function (t) { return t && isFinite(t.x); }).map(function (t) { return { x: t.x, y: t.y }; });
    var to = p.target && isFinite(p.target.x) ? { x: p.target.x, y: p.target.y } : (targets[0] || { x: u.x + 80, y: u.y });
    var radius = sk.scope === 'global' ? 320 : (sk.radius || u.range || 120);
    var allies = RPD.FieldManager && RPD.FieldManager.getBattleUnits ? RPD.FieldManager.getBattleUnits().map(function (a) { return { x: a.x, y: a.y }; }) : [];
    var Rg = RPD.Range || {};
    var zoneRadius = Rg.GLOBAL && u.range >= Rg.GLOBAL ? Rg.LONG : u.range;
    var P = { from: { x: u.x, y: u.y }, to: to, targets: targets, allies: allies, radius: radius, zoneRadius: zoneRadius, duration: sk.duration };
    var fx = c.m === 'combo' ? combo(c, P) : (M[c.m] ? M[c.m](c, P) : null);
    if (!fx) return null;
    S.push(fx);
    // 시전 표시 — 시전자 발밑 한 겹(모든 스킬 공통 · 무엇이 쐈는지)
    S.push({ dur: 0.45, draw: function (ctx, e, k) { ring(ctx, u.x, u.y, 14 + 36 * easeOut(k), 4 * (1 - k) + 1, c.color, 1 - k); glowDisc(ctx, u.x, u.y, 30, c.color2, 0.45 * (1 - k)); } });
    var t = now(), special = !!(RPD.Tiers[u.tier] && RPD.Tiers[u.tier].special);   // 불멸 · 초월
    if ((c.cutin || special) && t - S.lastCutin > 4 && level() !== 'minimal') {
      S.lastCutin = t;
      S.push(cutin(sk.name, c.color));
    }
    if (c.shake && level() === 'normal' && RPD.AttackFx && RPD.AttackFx.shake) RPD.AttackFx.shake(c.shake);
    wake();
    return fx;
  };

  S.push = function (fx) {
    fx.t0 = null;
    S.list.push(fx);
    var lv = level(), cap = lv === 'normal' ? S.MAX : lv === 'reduced' ? 16 : 8;   // 줄임 · 최소(느린 기기 포함)는 동시에 덜
    while (S.list.length > cap) S.list.shift();
  };
  S.reset = function () { S.list.length = 0; S.lastCutin = -99; };
  S.isBusy = function () { return S.list.length > 0; };

  S.draw = function (ctx) {
    if (!S.list.length) return;
    var t = now(), screen = [];
    ctx.save();
    for (var i = S.list.length - 1; i >= 0; i--) {
      var fx = S.list[i];
      if (fx.t0 == null) fx.t0 = t;
      var el = t - fx.t0;
      if (el >= fx.dur) { S.list.splice(i, 1); continue; }
      if (fx.screen) { screen.push({ fx: fx, el: el }); continue; }
      try { fx.draw(ctx, fx, el / fx.dur, el); } catch (err) { S.list.splice(i, 1); }
    }
    ctx.restore();
    if (screen.length && RPD.Renderer && RPD.Renderer.withScreenFrame) {
      RPD.Renderer.withScreenFrame(ctx, function (c2, W) {
        screen.forEach(function (s) { s.fx.draw(c2, s.fx, s.el / s.fx.dur, s.el, W); });
      });
    }
    if (S.list.length) wake();
  };

  S.init = function () {
    RPD.bus.on('unit:skill', function (p) { S.play(p); });
    RPD.bus.on('game:reset', S.reset);
  };

  S.MOTIFS = M;
  RPD.SkillFx = S;
})(typeof window !== 'undefined' ? window : globalThis);
