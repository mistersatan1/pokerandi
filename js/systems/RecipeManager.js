/* RecipeManager.js — 지정 조합식으로 진화시킨다.
 *
 * v1 의 FusionManager(같은 종 3마리 + 등급 합성)를 대체한다.
 * 성장 경로는 하나뿐이다: 정해진 재료를 모아 정해진 결과를 만든다.
 *
 * 중복 처리는 조각(Shard)이 맡는다. 재료가 끝내 안 나오는 판이
 * 그대로 사망 확정이 되면 "운이 나쁘면 아무것도 못 한다"가 되기 때문이다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;
  var F = RPD.FieldManager;

  var RecipeManager = {
    /* 조합식 UI 가 그대로 그리는 목록. 필드가 바뀔 때만 다시 만든다. */
    view: [],
    discovered: {}   // 한 번이라도 만든 결과물 — 아직이면 ??? 로 가린다
  };

  RecipeManager.reset = function () {
    this.view = [];
    this.discovered = {};
    this.refresh();
  };

  /* ---------- 보유 현황 ---------- */

  /* 필드와 창고를 합쳐서 센다. 창고에 있는 재료도 조합에 쓸 수 있어야
   * "일단 모아 두고 나중에 조합한다"가 성립한다. */
  function countOnField() {
    var counts = {};
    var units = RPD.StorageManager
      ? RPD.StorageManager.allUnits()
      : F.getUnits();
    for (var i = 0; i < units.length; i++) {
      counts[units[i].defId] = (counts[units[i].defId] || 0) + 1;
    }
    return counts;
  }

  /* 재료를 보유 개체에 하나씩 대응시킨다.
   * 안흔함은 같은 흔함 2마리(캐터피 ×2)라, 재료 칸마다 따로 세야 한다 —
   * 캐터피가 한 마리뿐이면 첫 칸은 채워지고 둘째 칸은 비어 있다. */
  var DITTO = 'ditto';

  function isCommon(id) {
    var d = RPD.PokemonData.get(id);
    return !!d && d.tier === 'T1';
  }

  function resolveMaterials(recipe, counts) {
    var have = [], missing = [], owned = [], viaDitto = [], usedAs = [];
    var n = recipe.materials.length, i;
    for (i = 0; i < n; i++) { owned.push(false); viaDitto.push(false); usedAs.push(null); }
    for (i = 0; i < n; i++) {
      var m = recipe.materials[i];
      if (counts[m] > 0) { have.push(m); counts[m] -= 1; owned[i] = true; usedAs[i] = m; }
    }
    for (i = 0; i < n; i++) if (!owned[i]) missing.push(recipe.materials[i]);
    /* 메타몽 — 모자란 흔함 한 마리를 대신한다. 조합식 하나에 한 마리만.
     * 메타몽이 재료 자체인 조합식에는 쓰지 않는다(자기 자신을 대신할 수는 없다). */
    if (missing.length && counts[DITTO] > 0 && recipe.materials.indexOf(DITTO) < 0) {
      for (var j = 0; j < recipe.materials.length; j++) {
        if (!owned[j] && isCommon(recipe.materials[j])) {
          owned[j] = true; viaDitto[j] = true; counts[DITTO] -= 1;
          missing.splice(missing.indexOf(recipe.materials[j]), 1);
          break;
        }
      }
    }
    return { have: have, missing: missing, owned: owned, viaDitto: viaDitto, usedAs: usedAs };
  }

  /* ---------- 목록 만들기 ---------- */

  /* 조합식 영역에 뿌릴 목록.
   * 정렬: ① 지금 합성 가능 ② 재료 1개 부족 ③ 나머지
   * 전부 보여주면 읽히지 않으므로 UI 가 상위 몇 개만 잘라 쓴다. */
  RecipeManager.refresh = function () {
    var round = RPD.GameManager.wave || 1;
    var list = RPD.RecipeData.availableAt(round);
    var out = [];

    for (var i = 0; i < list.length; i++) {
      var recipe = list[i];
      var counts = countOnField();
      var r = resolveMaterials(recipe, counts);
      var result = RPD.PokemonData.get(recipe.id);
      if (!result) continue;

      out.push({
        recipe: recipe,
        key: recipe.key,                 // 경로 이름 — 대체 경로면 'machoke#2'
        route: recipe.route,
        routeCount: recipe.routeCount,
        resultId: recipe.id,
        resultName: result.name,
        resultTier: result.tier,
        discovered: !!this.discovered[recipe.id],
        materials: recipe.materials.map(function (m, idx) {
          return { id: m, name: RPD.RecipeData.labelOf(m), owned: r.owned[idx], viaDitto: r.viaDitto[idx],
                   hidden: RPD.PokemonData.isHidden(m), usedAs: r.usedAs[idx] };
        }),
        missingCount: r.missing.length,
        ready: r.missing.length === 0
      });
    }

    out.sort(function (a, b) {
      if (a.ready !== b.ready) return a.ready ? -1 : 1;
      if (a.missingCount !== b.missingCount) return a.missingCount - b.missingCount;
      return RPD.TIER_ORDER.indexOf(b.resultTier) - RPD.TIER_ORDER.indexOf(a.resultTier);
    });

    this.view = out;
    RPD.bus.emit('recipe:changed', out);
    return out;
  };

  RecipeManager.readyList = function () {
    return this.view.filter(function (v) { return v.ready; });
  };

  /* 소환 보정이 참조한다 — 재료가 이만큼만 부족한 레시피의 남은 재료에 가중치를 얹는다. */
  RecipeManager.missingMaterials = function (maxMissing) {
    var out = {};
    for (var i = 0; i < this.view.length; i++) {
      var v = this.view[i];
      if (v.missingCount === 0 || v.missingCount > maxMissing) continue;
      for (var m = 0; m < v.materials.length; m++) {
        if (v.materials[m].owned) continue;
        out[v.materials[m].id] = true;
      }
    }
    return out;
  };

  /* ---------- 합성 실행 ---------- */

  /* resultId 또는 경로 이름(key). 결과로 물으면 경로 중 하나라도 되면 된다. */
  RecipeManager.canCraft = function (resultOrKey) {
    for (var i = 0; i < this.view.length; i++) {
      var v = this.view[i];
      if ((v.key === resultOrKey || v.resultId === resultOrKey) && v.ready) return true;
    }
    return false;
  };

  /* 재료가 놓인 슬롯을 찾는다. 결과물은 재료 중 "가장 좋은 자리"에 앉힌다 —
   * 플레이어가 신경 써서 잡아 둔 위치를 존중한다. */
  /* 재료가 어디 있는지 찾는다. 창고를 먼저 쓴다 —
   * 필드에 올려 둔 것은 지금 싸우고 있으니 가급적 건드리지 않는다. */
  function findMaterials(recipe) {
    var usedField = {}, usedStore = {};
    var out = [];
    var SM = RPD.StorageManager;

    for (var i = 0; i < recipe.materials.length; i++) {
      var want = recipe.materials[i];
      var found = null;

      // 창고 먼저(필드에서 싸우는 개체를 덜 빼앗는다)
      if (SM) {
        for (var k = 0; k < SM.units.length; k++) {
          if (usedStore[k]) continue;
          if (SM.units[k].defId === want) { found = { where: 'store', at: k }; usedStore[k] = true; break; }
        }
      }
      if (!found) {
        // 필드에서는 강화 안 한 개체부터 쓴다
        var bestS = -1;
        for (var s = 0; s < F.slots.length; s++) {
          if (usedField[s]) continue;
          var unit = F.slots[s].unit;
          if (unit && unit.defId === want && (bestS < 0 || unit.level < F.slots[bestS].unit.level)) bestS = s;
        }
        if (bestS >= 0) { found = { where: 'field', at: bestS }; usedField[bestS] = true; }
      }
      out.push(found);
    }

    // 못 찾은 칸이 흔함 하나뿐이면 메타몽으로 채운다
    var missingIdx = [];
    for (var q = 0; q < out.length; q++) if (!out[q]) missingIdx.push(q);
    if (!missingIdx.length) return out;
    if (missingIdx.length > 1 || !isCommon(recipe.materials[missingIdx[0]]) ||
        recipe.materials.indexOf(DITTO) >= 0) return null;
    var ditto = null;
    if (SM) {
      for (var d = 0; d < SM.units.length; d++) {
        if (!usedStore[d] && SM.units[d].defId === DITTO) { ditto = { where: 'store', at: d, ditto: true }; break; }
      }
    }
    if (!ditto) {
      for (var f = 0; f < F.slots.length; f++) {
        var u = F.slots[f].unit;
        if (!usedField[f] && u && u.defId === DITTO) { ditto = { where: 'field', at: f, ditto: true }; break; }
      }
    }
    if (!ditto) return null;
    out[missingIdx[0]] = ditto;
    return out;
  }

  function bestSlot(slots) {
    var best = slots[0], bestCover = -1;
    for (var i = 0; i < slots.length; i++) {
      var slot = F.get(slots[i]);
      var cover = (slot.coverage && slot.coverage[RPD.Range.MID]) || 0;
      if (slot.unit && slot.unit.level > 0) cover += 100000;   // 강화한 자리를 최우선
      if (cover > bestCover) { bestCover = cover; best = slots[i]; }
    }
    return best;
  }

  /* resultOrKey — 결과 id('machoke') 또는 경로 이름('machoke#2').
   * 결과 id 로 부르면 경로를 적힌 순서대로 시도해 재료가 다 있는 첫 경로를 쓴다.
   * (조합식 줄을 눌렀을 때는 그 줄의 경로 이름이 온다 — 고른 길을 그대로 쓴다)
   * 두 경로가 동시에 되는 경우 따로 묻지 않는다 — 조합 버튼 사이에 확인창이 끼면
   * "대기 시간을 만들지 않는다"는 원칙과 부딪힌다. 줄을 직접 누르면 원하는 길을 고를 수 있다. */
  RecipeManager.craft = function (resultOrKey) {
    var routes = RPD.RecipeData.byRouteKey(resultOrKey) && resultOrKey.indexOf('#') > 0
      ? [RPD.RecipeData.byRouteKey(resultOrKey)]
      : RPD.RecipeData.routesOf(resultOrKey);
    if (!routes.length) return { ok: false, reason: 'NO_RECIPE' };
    var resultId = routes[0].id;

    var round = RPD.GameManager.wave || 1;
    var recipe = null, mats = null, locked = false;
    for (var ri = 0; ri < routes.length && !mats; ri++) {
      if (round < routes[ri].unlockRound) { locked = true; continue; }
      mats = findMaterials(routes[ri]);
      if (mats) recipe = routes[ri];
    }
    if (!mats) return { ok: false, reason: locked && routes.length === 1 ? 'LOCKED' : 'NO_MATERIAL' };

    var SM = RPD.StorageManager;
    var fieldSlots = mats.filter(function (m) { return m.where === 'field'; })
                         .map(function (m) { return m.at; });

    var investedGold = 0, topLevel = 0;
    for (var i = 0; i < mats.length; i++) {
      var u = mats[i].where === 'field' ? F.slots[mats[i].at].unit : SM.units[mats[i].at];
      investedGold += (u && u.investedGold) || 0;
      topLevel = Math.max(topLevel, (u && u.level) || 0);
    }

    // 결과물이 앉을 자리: 재료가 쓰던 필드 칸 > 빈 필드 칸 > 창고
    var keep = fieldSlots.length ? bestSlot(fieldSlots) : null;

    for (var f = 0; f < fieldSlots.length; f++) F.remove(fieldSlots[f]);
    // 창고는 인덱스가 밀리므로 뒤에서부터 지운다
    var storeIdx = mats.filter(function (m) { return m.where === 'store'; })
                       .map(function (m) { return m.at; })
                       .sort(function (a, b) { return b - a; });
    for (var t = 0; t < storeIdx.length; t++) SM.removeAt(storeIdx[t]);

    var made = RPD.UnitManager.create(resultId);
    if (!made) return { ok: false, reason: 'NO_SPECIES' };

    // 재료가 넣은 골드는 승계한다. 조합이 손해가 되면 아무도 안 한다.
    made.investedGold = investedGold;
    /* 재료 중 가장 높은 강화 레벨의 절반을 결과물이 이어받는다.
     * VERSION.md(5차 경제 재설계)에 "승계한다"고 적혀 있었지만 실제로는 구현돼 있지 않았다(세션 33 발견) —
     * 그래서 조합 재료로 쓸 포켓몬을 강화하면 그대로 날아갔고, 강화가 늘 외면받은 원인 중 하나였다. */
    made.level = Math.min(RPD.Config.upgradeMaxLevel, Math.floor(topLevel / 2));

    if (keep === null) {
      var empty = F.firstEmpty();
      if (empty) keep = empty.index;
    }
    if (keep !== null) F.place(keep, made);
    else if (!SM.add(made)) return { ok: false, reason: 'NO_ROOM' };

    RPD.UnitManager.recomputeAll();

    var isFirst = !this.discovered[resultId];
    this.discovered[resultId] = true;

    RPD.bus.emit('recipe:crafted', {
      unit: made, slotIndex: keep === null ? -1 : keep, tier: made.tier,
      materials: recipe.materials, route: recipe.route, firstTime: isFirst
    });
    this.refresh();
    return { ok: true, unit: made, slotIndex: keep, toStorage: keep === null, firstTime: isFirst, route: recipe.route };
  };

  /* 지금 만들 수 있는 것 중 가장 높은 등급을 만든다 — 하단 [합성] 버튼용 */
  RecipeManager.craftBest = function () {
    var ready = this.readyList();
    if (!ready.length) return { ok: false, reason: 'NO_MATCH' };
    return this.craft(ready[0].key);
  };

  RecipeManager.init = function () {
    var self = this;
    RPD.bus.on('field:changed', function () { self.refresh(); });
    RPD.bus.on('storage:changed', function () { self.refresh(); });
    RPD.bus.on('game:wave', function () { self.refresh(); });
  };

  RPD.RecipeManager = RecipeManager;
})(typeof window !== 'undefined' ? window : globalThis);
