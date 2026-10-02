/* CraftFx.js — 조합 성공 · 소환 연출(리디자인 ③ · 세션 87). 캔버스만 — 결과 칸 옆 카드(DOM)는 UIManager.onCrafted.
 *
 * 예전: 조합하면 결과 칸에 링 + 이름 글자, 처음 만들었거나 특별함 이상이면 화면 한가운데 큰 카드 1.9초(필드를 덮고, 결과 칸과 떨어져 있었다).
 *       소환도 특별함이면 같은 가운데 카드 — 판당 약 190번 소환하는 게임에서 흐름이 끊겼다.
 * 지금(약 0.75초 · 필드를 덮지 않는다):
 *   조합 — ① 0 ~ 0.32초 재료가 있던 칸(창고에서 온 재료는 필드 아래 가장자리)에서 결과 칸으로 빛줄기가 모인다
 *          ② 0.32 ~ 0.75초 결과 칸에서 터짐 — 링 크기 · 불꽃 수가 등급에 비례(T1 작게 … T5 이상 크게)
 *   소환 — 특별함은 ② 만 칸 위에서(가운데 카드 없음). 흔함 · 안흔함은 원래대로 이름 글자 · 링만.
 * 효과 "최소": 빛줄기 · 불꽃 없이 링만. "줄임": 불꽃 절반. 불꽃 방향은 고정 각도(연출이 게임 난수를 밀지 않게).
 * 시간은 벽시계 — 3배속 · 일시정지와 무관한 연출 시간. 게임 규칙은 안 건드린다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  var C = { jobs: [] };
  var GATHER = 0.32, POP = 0.43;
  var RANK = { T1: 1, T2: 2, T3: 3, T4: 4, T5: 5, T6: 5, T7: 5 };
  function now() { return (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) / 1000; }
  function level() { return RPD.Effects && RPD.Effects.levelId ? RPD.Effects.levelId() : 'normal'; }
  // 라운드 사이(쉬는 중)엔 FramePacer 가 초당 10장만 그린다 — 연출이 도는 동안은 깨워 둔다(조합 · 소환은 대개 라운드 사이에 한다)
  function wake() { if (RPD.FramePacer && RPD.FramePacer.wake) RPD.FramePacer.wake(); }
  function ease(k) { return k < 0 ? 0 : k > 1 ? 1 : 1 - Math.pow(1 - k, 3); }
  function hexA(hex, a) {
    var n = parseInt(String(hex).slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a.toFixed(3) + ')';
  }

  /* 조합 — p: recipe:crafted 페이로드(from · fromStore 는 RecipeManager 가 연출용으로 싣는다) */
  C.craft = function (p) {
    if (!p || !p.unit) return null;
    var tier = RPD.Tiers[p.tier] || RPD.Tiers.T1, u = p.unit;
    var to = u.slotIndex >= 0 ? { x: u.x, y: u.y } : { x: RPD.VIEW.width / 2, y: RPD.VIEW.height - 40 };   // 창고로 갔으면 필드 아래쪽 가운데
    var from = (p.from || []).slice();
    for (var i = 0; i < (p.fromStore || 0); i++) from.push({ x: to.x + (i - (p.fromStore - 1) / 2) * 60, y: RPD.VIEW.height + 30 });
    var job = { t0: null, skip: 0, to: to, from: from, color: tier.color, rank: RANK[tier.id] || 1, gather: true, toStorage: u.slotIndex < 0 };
    C.jobs.push(job);
    wake();
    return job;
  };
  /* 소환 — 칸 위에서 터짐만 */
  C.summon = function (unit, tierId) {
    if (!unit || !(unit.slotIndex >= 0)) return null;
    var tier = RPD.Tiers[tierId] || RPD.Tiers.T1;
    var job = { t0: null, skip: GATHER, to: { x: unit.x, y: unit.y }, from: [], color: tier.color, rank: RANK[tier.id] || 1, gather: false };
    C.jobs.push(job);
    wake();
    return job;
  };
  C.reset = function () { C.jobs.length = 0; };
  C.isBusy = function () { return C.jobs.length > 0; };

  function drawGather(ctx, j, k, lvl) {
    if (lvl === 'minimal' || !j.from.length) return;
    var e = ease(k);
    for (var i = 0; i < j.from.length; i++) {
      var f = j.from[i];
      var hx = f.x + (j.to.x - f.x) * e, hy = f.y + (j.to.y - f.y) * e;
      var t2 = ease(Math.max(0, k - 0.3)), tx = f.x + (j.to.x - f.x) * t2, ty = f.y + (j.to.y - f.y) * t2;
      ctx.lineCap = 'round';
      ctx.strokeStyle = hexA(j.color, 0.85); ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
      ctx.beginPath(); ctx.arc(hx, hy, 4.5, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
      // 출발 칸에 남는 옅은 원 — 어디서 왔는지
      ctx.beginPath(); ctx.arc(f.x, f.y, 22 * (1 - k), 0, Math.PI * 2); ctx.strokeStyle = hexA(j.color, 0.5 * (1 - k)); ctx.lineWidth = 2; ctx.stroke();
    }
  }

  function drawPop(ctx, j, k, lvl) {
    var x = j.to.x, y = j.to.y, rank = j.rank;
    var R = 26 + rank * 11;
    var e = ease(k);
    // 흰 섬광(처음 0.15)
    if (k < 0.35) {
      ctx.beginPath(); ctx.arc(x, y, 18 + 14 * e, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,' + (0.55 * (1 - k / 0.35)).toFixed(3) + ')'; ctx.fill();
    }
    // 링 — 등급색 · 바깥으로 퍼지며 옅어진다
    ctx.beginPath(); ctx.arc(x, y, 16 + R * e, 0, Math.PI * 2);
    ctx.strokeStyle = hexA(j.color, 0.9 * (1 - k)); ctx.lineWidth = 2 + rank * 0.8; ctx.stroke();
    if (rank >= 4) {   // 희귀함 이상은 두 겹
      ctx.beginPath(); ctx.arc(x, y, 10 + R * 0.65 * e, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,224,122,' + (0.8 * (1 - k)).toFixed(3) + ')'; ctx.lineWidth = 2; ctx.stroke();
    }
    if (lvl === 'minimal') return;
    var n = 4 + rank * 2;
    if (lvl === 'reduced') n = Math.ceil(n / 2);
    ctx.lineCap = 'round';
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2 + rank * 0.3;
      var r1 = 14 + R * 0.55 * e, r2 = r1 + 8 + rank * 2.5 * (1 - k);
      ctx.strokeStyle = i % 2 ? hexA(j.color, 1 - k) : 'rgba(255,240,190,' + (1 - k).toFixed(3) + ')';
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1); ctx.lineTo(x + Math.cos(a) * r2, y + Math.sin(a) * r2); ctx.stroke();
    }
  }

  C.draw = function (ctx) {
    if (!C.jobs.length) return;
    var t = now(), lvl = level();
    ctx.save();
    for (var i = C.jobs.length - 1; i >= 0; i--) {
      var j = C.jobs[i];
      // 시계는 첫 프레임부터 — 조합 직후 화면 갱신(보유 · 조합식 · 추천)이 한 번에 몰려 첫 프레임이 늦게 오면(헤드리스 0.2초)
      // 조합 순간부터 재던 예전 방식은 빛줄기 구간(0.32초)을 거의 다 잃었다(세션 87 캡처에서 찾음)
      if (j.t0 == null) j.t0 = t - j.skip;
      var e = t - j.t0;
      if (e >= GATHER + POP) { C.jobs.splice(i, 1); continue; }
      if (e < GATHER) drawGather(ctx, j, e / GATHER, lvl);
      else drawPop(ctx, j, (e - GATHER) / POP, lvl);
    }
    ctx.restore();
  };

  C.init = function () {
    RPD.bus.on('recipe:crafted', C.craft);
    RPD.bus.on('summon:result', function (r) {
      if (r && r.ok && r.unit && (RANK[r.tier] || 1) >= 3) C.summon(r.unit, r.tier);   // 특별함만 — 흔함 · 안흔함은 원래 링 · 이름 글자
    });
    RPD.bus.on('game:reset', C.reset);
  };

  C.RANK = RANK;
  RPD.CraftFx = C;
})(typeof window !== 'undefined' ? window : globalThis);
