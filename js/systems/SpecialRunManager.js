/* SpecialRunManager.js — 특수 런 규칙 중 "판마다 계산이 필요한 것"(세션 99).
 *
 * 규칙 자체(목록 · 설명 · 보정값)는 js/data/specialrules.js, 모드에 합치는 건 RPD.effectiveMode.
 * 보정값 하나로 끝나는 규칙(소환 비용 · 등급 확률 · 칸 타입)은 그 값을 읽는 매니저가 직접 본다. 여기는 둘만:
 *
 *   조합식 랜덤(recipeShuffle) — 판 시드로 RecipeData 재료를 같은 등급 · 같은 무리끼리 뒤섞는다.
 *     무리: 소환되는 종끼리 / 조합으로 만드는 종끼리. 히든(주문 전용) · 조합식이 없는 종은 그대로 — 얻을 길이 없는 재료가 생기지 않게.
 *     재료는 늘 결과보다 낮은 등급이라(검사로 지킨다) 같은 등급끼리 바꿔도 순환이 안 생긴다. 한 종을 한 종으로만 바꾸므로(일대일)
 *     "같은 재료 2마리" 조합식은 그대로 같은 종 2마리, 서로 다른 재료는 계속 서로 다르다.
 *     강함(craftpower — 원래 조합식 기준으로 불러올 때 정한 값)은 안 바꾼다. 판이 끝나 규칙 없는 판을 세우면 원래대로.
 *   불꽃만 사용(summonTree) — 그 타입 종 + 그 종들의 조합 재료 전부(지금 조합식 기준 · 섞인 판이면 섞인 재료로)를 tree 에 둔다.
 *     SummonManager.speciesWeights 가 소환 종을 tree 로 좁힌다.
 *
 * 시드는 판 이어하기(RunSave)에 남겨 같은 판을 이으면 같은 조합식이다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  var SR = { seed: 0, shuffled: false, tree: null };

  /* 시드 난수(mulberry32) — 같은 시드면 같은 조합식 */
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function RD() { return RPD.RecipeData; }

  /* 처음 한 번 원래 재료를 따로 둔다 */
  function keepBase() {
    RD().list.forEach(function (r) { if (!r.base) r.base = r.materials.slice(); });
  }

  /* byMaterial(쓰이는 곳) 다시 세우기 — recipes.js 와 같은 규칙 */
  function reindex() {
    var by = {};
    RD().list.forEach(function (r) {
      var seen = {};
      r.materials.forEach(function (m) {
        if (seen[m]) return;
        seen[m] = true;
        (by[m] = by[m] || []).push(r);
      });
    });
    RD().byMaterial = by;
  }

  /* 같은 등급 · 같은 무리 — { 'T2:summon': [id…], 'T2:craft': [id…] } */
  function groups() {
    var out = {};
    RPD.PokemonData.list.forEach(function (d) {
      if (d.hidden || RPD.Tiers[d.tier].special) return;
      var kind = d.summon ? 'summon' : (RD().routesOf(d.id).length ? 'craft' : null);
      if (!kind) return;
      (out[d.tier + ':' + kind] = out[d.tier + ':' + kind] || []).push(d.id);
    });
    return out;
  }

  /* 시드로 종 → 종 짝을 만든다(무리 안에서 섞기) */
  SR.mapping = function (seed) {
    var rand = rng(seed), map = {}, g = groups();
    Object.keys(g).sort().forEach(function (k) {
      var ids = g[k].slice(), to = ids.slice();
      for (var i = to.length - 1; i > 0; i--) {
        var j = Math.floor(rand() * (i + 1));
        var t = to[i]; to[i] = to[j]; to[j] = t;
      }
      ids.forEach(function (id, n) { map[id] = to[n]; });
    });
    return map;
  };

  SR.applyShuffle = function (seed) {
    keepBase();
    var map = SR.mapping(seed);
    RD().list.forEach(function (r) {
      r.materials = r.base.map(function (m) { return map[m] || m; });
    });
    reindex();
    SR.seed = seed; SR.shuffled = true;
  };

  SR.restore = function () {
    if (!SR.shuffled) return;
    RD().list.forEach(function (r) { if (r.base) r.materials = r.base.slice(); });
    reindex();
    SR.shuffled = false; SR.seed = 0;
  };

  /* 그 타입 계열 — 그 타입 종 + 조합식 재료를 끝까지(지금 조합식 기준) */
  SR.buildTree = function (type) {
    var tree = {}, stack = [];
    RPD.PokemonData.list.forEach(function (d) { if ((d.types || []).indexOf(type) >= 0) stack.push(d.id); });
    while (stack.length) {
      var id = stack.pop();
      if (tree[id]) continue;
      tree[id] = true;
      RD().routesOf(id).forEach(function (r) { r.materials.forEach(function (m) { stack.push(m); }); });
    }
    return tree;
  };

  /* 판을 세울 때(game:reset) · 이어할 때(loadState) — 지금 모드의 규칙대로 */
  SR.setup = function (seed) {
    var GM = RPD.GameManager;
    SR.restore();
    if (RPD.modeMod('recipeShuffle', false)) {
      SR.applyShuffle(seed != null ? seed : (Math.floor(Math.random() * 4294967296) >>> 0) || 1);
    }
    var type = RPD.modeMod('summonTree', null);
    SR.tree = type ? SR.buildTree(type) : null;
    if (RPD.LegendAdvisor && RPD.LegendAdvisor.invalidate) RPD.LegendAdvisor.invalidate();
    if (GM && GM.mode) RPD.bus.emit('special:setup', { rules: GM.mode.rules || [], seed: SR.seed });
  };

  SR.reset = function () { SR.setup(null); };
  SR.saveState = function () { return { seed: SR.shuffled ? SR.seed : 0 }; };
  /* 이 기록이 없는 예전 저장본(세션 98 이전)은 규칙도 없다 — 지금 규칙대로 다시 세운다 */
  SR.loadState = function (s) {
    SR.setup(s && s.seed ? s.seed : null);
    if (RPD.RecipeManager && RPD.RecipeManager.refresh) RPD.RecipeManager.refresh();
  };

  SR.init = function () {
    RPD.bus.on('game:reset', function () { SR.reset(); if (RPD.RecipeManager && RPD.RecipeManager.refresh) RPD.RecipeManager.refresh(); });
  };

  RPD.SpecialRunManager = SR;
})(typeof window !== 'undefined' ? window : globalThis);
