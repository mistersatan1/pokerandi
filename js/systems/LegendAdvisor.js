/* LegendAdvisor.js — "지금 보유한 포켓몬으로 가장 빨리 만들 수 있는 전설" (세션 78).
 *
 * 추천만 한다 — 조합 · 소환 · 조각 구매는 하지 않는다. 화면은 js/ui/LegendAdvisorUI.js.
 *
 * 후보   조합식 또는 주문으로 만드는 전설(T5) 전체(불멸 · 초월 제외). 전설은 전부 조합 전용이라 라운드(unlockRound)와 무관하게 본다.
 * 빠르다 = 앞으로 필요한 소환 횟수의 기대값이 가장 적다.
 * 보유    필드 + 창고. 잠긴 개체는 "없는 것"(RecipeManager.countsOf().usable). 메타몽은 조합식 하나에 모자란 흔함 1마리를 대신(RecipeManager 와 같은 규칙 · 주문에는 안 씀).
 * 트리    재료마다 가진 것을 먼저 쓰고(쓴 만큼 차감 — 같은 개체를 두 곳에 세지 않는다), 모자란 것은
 *         ① 소환으로 나오면 소환  ② 조합식(OR-조합식은 경로마다) · 주문으로 아래 재료로 내려간다 — 어림 비용이 싼 쪽.
 *         어림 비용 = 바닥 재료마다 마리 수 / 한 번 소환에 그 종이 나올 확률.
 * 바닥    지금 라운드의 실제 소환 확률(SummonManager.currentOdds — 등급 해금 포함) × 등급 안 종 가중치(SummonManager.speciesWeights —
 *         pickSpecies 와 같은 값)로, 바닥 재료가 다 모일 때까지의 소환 수를 몬테카를로로 잰다(후보당 300번 · 고정 시드 — 화면이 안 흔들린다).
 * 조각    모자란 재료 중 조각으로 살 수 있는 것(ShardManager 규칙 — 히든 · 불멸 · 초월 제외 · 해금 등급만)을 비싼 것부터,
 *         보유 조각 안에서 산다고 치고 그 아래 소환을 뺀다(소환이 줄지 않는 재료는 안 산다).
 * 비밀    아직 밝혀지지 않은 히든이 트리에 들어가는 전설은 후보에서 빼고 수만 센다 — 이름 · 재료는 결과에 아예 담지 않는다.
 * 캐시    보유 · 조각 · 라운드 · 소환 확률 · 발견한 주문이 같으면 다시 계산하지 않는다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  var DITTO = 'ditto';
  var MAX_DEPTH = 8;
  var MAX_DRAWS = 20000;   // 몬테카를로 한 번에 이만큼 뽑아도 안 모이면 그 판은 여기서 끊는다(사실상 못 모음)

  var A = { RUNS: 300, SEED: 77801, cache: null, cacheSig: '', lastMs: 0 };

  function def(id) { return RPD.PokemonData.get(id); }
  function knows(spell) { return !!(spell && RPD.SaveManager && RPD.SaveManager.knowsSpell && RPD.SaveManager.knowsSpell(spell.id)); }
  /* 아직 밝혀지지 않은 히든 — UI.isSecret 과 같은 규칙(시스템은 UI 를 안 읽는다) */
  function isSecret(id) {
    if (!RPD.PokemonData.isHidden(id)) return false;
    return !knows(RPD.SpellData && RPD.SpellData.forResult(id));
  }
  A.isSecret = isSecret;
  function isCommon(id) { var d = def(id); return !!d && d.tier === 'T1'; }

  /* 조각으로 살 수 있는 종인가(가격은 따로) — ShardManager.checkBuy 의 종 규칙(자리 · 보유 조각은 여기서 안 본다) */
  function shardBuyable(id) {
    var d = def(id);
    if (!d || d.hidden || !RPD.Tiers[d.tier] || RPD.Tiers[d.tier].special) return false;
    return (RPD.GameManager.wave || 1) >= RPD.Tiers[d.tier].unlockRound;
  }

  /* ---------- 소환 확률 ---------- */
  /* { tiers: [{ tier, p, species: [{ id, w }], wsum }], p: { 종: 한 번 소환에 나올 확률 } } */
  function summonModel() {
    var SM = RPD.SummonManager, odds = SM.currentOdds();
    var tiers = [], p = {};
    RPD.TIER_ORDER.forEach(function (t) {
      var pt = (odds[t] || 0) / 100;
      if (pt <= 0) return;
      var entries = SM.speciesWeights(t);
      var wsum = 0;
      entries.forEach(function (e) { wsum += e.weight; });
      if (wsum <= 0) return;
      entries.forEach(function (e) { p[e.id] = (p[e.id] || 0) + pt * e.weight / wsum; });
      tiers.push({ tier: t, p: pt, species: entries, wsum: wsum });
    });
    // 한 번 소환 = 종 하나 — 누적 확률 표(이진 탐색으로 뽑는다 · 몬테카를로가 빨라진다)
    var ids = [], cum = [], acc = 0;
    Object.keys(p).forEach(function (id) { acc += p[id]; ids.push(id); cum.push(acc); });
    return { tiers: tiers, p: p, ids: ids, cum: cum, total: acc };
  }
  A.summonModel = summonModel;

  /* ---------- 트리 전개 ---------- */
  function clone(o) { var c = {}; for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) c[k] = o[k]; return c; }
  function assign(dst, src) { var k; for (k in dst) if (!(k in src)) delete dst[k]; for (k in src) dst[k] = src[k]; }

  /* 한 마리를 새로 얻는 길 — 이미 가진 것은 부른 쪽(make)이 먼저 썼다 */
  function obtain(id, pool, ctx, depth) {
    var node = { id: id, kind: 'none', cost: Infinity, secret: isSecret(id), children: [], bought: false };
    if (node.secret) ctx.secret = true;
    if (depth > MAX_DEPTH) return node;
    var options = [];
    var p = ctx.model.p[id] || 0;
    if (p > 0) options.push({ kind: 'summon', cost: 1 / p, secret: false, pool: pool });
    var routes = RPD.RecipeData.routesOf(id).map(function (r) { return { materials: r.materials, ditto: true, recipe: r }; });
    var sp = RPD.SpellData && RPD.SpellData.forResult(id);
    if (sp && sp.kind === 'hidden') routes.push({ materials: sp.materials, ditto: false, spell: sp });
    routes.forEach(function (r) {
      var sub = clone(pool);
      var subCtx = { model: ctx.model, secret: false };
      var m = make(r.materials, sub, subCtx, depth + 1, r.ditto);
      options.push({ kind: r.spell ? 'spell' : 'recipe', cost: m.cost, secret: subCtx.secret, pool: sub, made: m, route: r });
    });
    if (!options.length) return node;
    // 비밀이 끼지 않은 길 중 가장 싼 것 — 전부 비밀이면 그중 가장 싼 것(후보는 어차피 빠진다)
    var open = options.filter(function (o) { return !o.secret; });
    var pickFrom = open.length ? open : options;
    var best = pickFrom.reduce(function (a, b) { return b.cost < a.cost ? b : a; });
    if (best.secret) ctx.secret = true;
    if (best.pool !== pool) assign(pool, best.pool);
    node.kind = best.kind; node.cost = best.cost;
    if (best.made) { node.children = best.made.missingNodes; node.made = best.made; }
    return node;
  }

  /* 재료 목록을 맞춘다 — 가진 것 먼저(차감) · 메타몽 · 모자란 것은 obtain */
  function make(materials, pool, ctx, depth, allowDitto) {
    var have = [], missing = [], i;
    for (i = 0; i < materials.length; i++) {
      var m = materials[i];
      if ((pool[m] || 0) > 0) { pool[m] -= 1; have.push(m); if (isSecret(m)) ctx.secret = true; } else missing.push(m);
    }   // 가진 것이라도 아직 밝혀지지 않은 히든이면 비밀(보통은 가졌으면 이미 외쳐 밝혀졌다 — 이름이 새지 않게 엄격히)
    var ditto = null;
    if (allowDitto && missing.length && (pool[DITTO] || 0) > 0 && materials.indexOf(DITTO) < 0) {
      for (i = 0; i < missing.length; i++) {
        if (isCommon(missing[i])) { ditto = missing[i]; pool[DITTO] -= 1; missing.splice(i, 1); if (isSecret(DITTO)) ctx.secret = true; break; }
      }
    }
    var nodes = [], cost = 0;
    for (i = 0; i < missing.length; i++) {
      var n = obtain(missing[i], pool, ctx, depth);
      nodes.push(n); cost += n.cost;
    }
    return { materials: materials, have: have, ditto: ditto, missingNodes: nodes, cost: cost };
  }

  /* 노드 아래 바닥 재료(아직 안 산 것만) */
  function leavesOf(node, out) {
    if (node.bought) return out;
    if (node.kind === 'summon') out[node.id] = (out[node.id] || 0) + 1;
    else if (node.kind === 'none') out['?' + node.id] = (out['?' + node.id] || 0) + 1;   // 얻을 길이 없다(라운드 · 데이터)
    else node.children.forEach(function (c) { leavesOf(c, out); });
    return out;
  }
  function walk(nodes, fn, parentBought) {
    nodes.forEach(function (n) { fn(n, parentBought); walk(n.children, fn, parentBought || n.bought); });
  }

  /* ---------- 기대 소환 수(몬테카를로) ---------- */
  function rng(seed) {   // mulberry32 — 게임 난수(Math.random)는 건드리지 않는다
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  function expectedSummons(need, model, seed, runs) {
    var ids = Object.keys(need);
    if (!ids.length) return 0;
    for (var i = 0; i < ids.length; i++) if (!(model.p[ids[i]] > 0)) return Infinity;
    var r = rng(seed), total = 0;
    for (var run = 0; run < runs; run++) {
      var left = {}, remain = 0, k;
      for (k = 0; k < ids.length; k++) { left[ids[k]] = need[ids[k]]; remain += need[ids[k]]; }
      var draws = 0;
      while (remain > 0 && draws < MAX_DRAWS) {
        draws += 1;
        var x = r() * model.total, lo = 0, hi = model.cum.length - 1;
        while (lo < hi) { var mid = (lo + hi) >> 1; if (model.cum[mid] < x) lo = mid + 1; else hi = mid; }
        var id = model.ids[lo];
        if (left[id] > 0) { left[id] -= 1; remain -= 1; }
      }
      total += draws;
    }
    return total / runs;
  }
  A.expectedSummons = expectedSummons;

  /* ---------- 후보 하나 ---------- */
  function evaluate(id, usable, shards, model) {
    var routes = RPD.RecipeData.routesOf(id).map(function (r) { return { materials: r.materials, ditto: true }; });
    var sp = RPD.SpellData && RPD.SpellData.forResult(id);
    if (sp && sp.kind === 'hidden') routes.push({ materials: sp.materials, ditto: false, spell: sp });
    var best = null;
    routes.forEach(function (r) {
      var pool = clone(usable), ctx = { model: model, secret: isSecret(id) };
      var m = make(r.materials, pool, ctx, 1, r.ditto);
      var cand = { route: r, made: m, secret: ctx.secret, cost: m.cost };
      if (!best || (best.secret && !cand.secret) || (best.secret === cand.secret && cand.cost < best.cost)) best = cand;
    });
    if (!best) return null;
    if (best.secret) return { id: id, secret: true };

    // 조각 — 모자란 노드 중 살 수 있는 것을 비싼 것부터(그 아래 소환이 있을 때만)
    var nodes = [];
    walk(best.made.missingNodes, function (n) { nodes.push(n); });
    nodes.sort(function (a, b) {
      return RPD.ShardManager.priceFor(def(b.id).tier) - RPD.ShardManager.priceFor(def(a.id).tier) || (b.cost - a.cost);
    });
    var left = shards, used = 0;
    nodes.forEach(function (n) {
      if (!shardBuyable(n.id)) return;
      if (isUnderBought(best.made.missingNodes, n)) return;   // 조상을 이미 샀다
      var lv = leavesOf(n, {});
      if (!Object.keys(lv).length) return;
      var price = RPD.ShardManager.priceFor(def(n.id).tier);
      if (price > left) return;
      n.bought = true; left -= price; used += price;
    });

    var need = {};
    best.made.missingNodes.forEach(function (n) { leavesOf(n, need); });
    var unreachable = Object.keys(need).filter(function (k) { return k.charAt(0) === '?'; });
    var exp = unreachable.length ? Infinity : expectedSummons(need, model, A.SEED ^ hash(id), A.RUNS);

    // 맨 위 재료 칩 — 종마다 필요 · 있음 · 조각 · 모자람
    var chips = [], at = {};
    best.route.materials.forEach(function (m) {
      if (at[m] == null) { at[m] = chips.length; chips.push({ id: m, need: 0, have: 0, viaDitto: 0, shard: 0, missing: 0 }); }
      chips[at[m]].need += 1;
    });
    best.made.have.forEach(function (m) { chips[at[m]].have += 1; });
    if (best.made.ditto) chips[at[best.made.ditto]].viaDitto += 1;
    best.made.missingNodes.forEach(function (n) { if (n.bought) chips[at[n.id]].shard += 1; else chips[at[n.id]].missing += 1; });

    // 다음에 모으면 좋은 것 — 모자란 바닥 재료 중 소환으로 나오는 것(많이 필요한 순)
    var next = Object.keys(need).filter(function (k) { return k.charAt(0) !== '?'; })
      .map(function (k) { return { id: k, n: need[k] }; })
      .sort(function (a, b) { return b.n - a.n || (model.p[b.id] || 0) - (model.p[a.id] || 0); });

    var ready = best.made.missingNodes.length === 0;
    return {
      id: id, secret: false, ready: ready, viaSpell: !!best.route.spell,
      expected: ready ? 0 : exp, shardsUsed: used, chips: chips, next: next,
      leaves: need, crafts: countCrafts(best.made.missingNodes)
    };
  }
  /* n 의 조상 중 산 것이 있는가 */
  function isUnderBought(roots, target) {
    var found = false;
    (function rec(list, anc) {
      list.forEach(function (n) {
        if (found) return;
        if (n === target) { if (anc) found = true; return; }
        rec(n.children, anc || n.bought);
      });
    })(roots, false);
    return found;
  }
  function countCrafts(nodes) {
    var c = 0;
    walk(nodes, function (n, pb) { if (!pb && !n.bought && (n.kind === 'recipe' || n.kind === 'spell')) c += 1; });
    return c;
  }

  /* ---------- 전체 ---------- */
  A.candidates = function () {
    return RPD.PokemonData.list.filter(function (d) {
      if (d.tier !== 'T5' || d.form) return false;
      if (RPD.RecipeData.routesOf(d.id).length) return true;
      var sp = RPD.SpellData && RPD.SpellData.forResult(d.id);
      return !!(sp && sp.kind === 'hidden');
    }).map(function (d) { return d.id; });
  };

  function signature(usable, shards, model) {
    var known = RPD.SaveManager && RPD.SaveManager.data && RPD.SaveManager.data.spells ? Object.keys(RPD.SaveManager.data.spells).sort().join(',') : '';
    var ps = Object.keys(model.p).sort().map(function (k) { return k + ':' + model.p[k].toFixed(5); }).join(',');
    return JSON.stringify(usable) + '|' + shards + '|' + (RPD.GameManager.wave || 1) + '|' + ps + '|' + known;
  }

  /* { list: 전부(빠른 순), top: 상위 3, hiddenExcluded: 비밀 때문에 뺀 수, ms } */
  A.compute = function (opts) {
    opts = opts || {};
    var usable = RPD.RecipeManager.countsOf().usable;
    var shards = RPD.ShardManager.shards || 0;
    var model = summonModel();
    var sig = signature(usable, shards, model);
    if (!opts.force && A.cache && sig === A.cacheSig) return A.cache;
    var t0 = Date.now();
    var list = [], hidden = 0;
    A.candidates().forEach(function (id) {
      var r = evaluate(id, usable, shards, model);
      if (!r) return;
      if (r.secret) { hidden += 1; return; }   // 이름 · 재료는 담지 않는다
      list.push(r);
    });
    list.sort(function (a, b) {
      if (a.ready !== b.ready) return a.ready ? -1 : 1;
      if (a.expected !== b.expected) return a.expected - b.expected;
      if (a.crafts !== b.crafts) return a.crafts - b.crafts;
      return a.shardsUsed - b.shardsUsed;
    });
    A.lastMs = Date.now() - t0;
    A.cache = { list: list, top: list.slice(0, 3), hiddenExcluded: hidden, ms: A.lastMs };
    A.cacheSig = sig;
    return A.cache;
  };
  A.invalidate = function () { A.cache = null; A.cacheSig = ''; };

  RPD.LegendAdvisor = A;
})(typeof window !== 'undefined' ? window : globalThis);
