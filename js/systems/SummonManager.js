/* SummonManager.js — 랜덤 소환.
 *
 * v2 의 소환은 세 가지가 v1 과 다르다.
 *   1) 등급 확률이 라운드마다 바뀐다 — 새 등급이 열릴 때 기대감이 생긴다
 *   2) 조합 보정 — 재료 하나만 남은 레시피의 그 재료가 더 잘 나온다
 *   3) 자동 배치 — 소환 직후 사거리에 맞는 칸을 시스템이 골라 준다
 *
 * 2번은 플레이어에게 수치를 노출하지 않는다. 보이는 순간 확률 계산 게임이 된다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;
  var U = RPD.Utils;
  var GM = RPD.GameManager;

  var SummonManager = {
    count: 0,
    tickets: 0,
    sinceTier: {},      // 등급별 미등장 횟수 (천장용)
    lastTier: null
  };

  SummonManager.reset = function () {
    this.count = 0;
    this.tickets = 0;
    this.sinceTier = {};
    this.lastTier = null;
    RPD.bus.emit('summon:stateChanged', this.state());
  };

  /* ---------- 확률 ---------- */

  SummonManager.currentWeights = function (opts) {
    opts = opts || {};
    var round = GM.wave || 1;
    var T = RPD.SummonTable;
    var w = T.weightsFor(round);

    // 소프트 천장 — 해금된 상위 등급이 계속 안 나오면 가중치를 얹는다
    for (var i = 0; i < RPD.TIER_ORDER.length; i++) {
      var id = RPD.TIER_ORDER[i];
      if (!w[id]) continue;
      var dry = this.sinceTier[id] || 0;
      if (T.hardPity[id] && dry > T.softPityAfter) {
        w[id] += (dry - T.softPityAfter) * T.softPityStep;
      }
    }

    /* 흔함 최소 비중 — 소프트 천장이 상위 등급을 부풀려도 흔함이 minCommonShare 밑으로
     * 내려가지 않게 나머지를 줄인다. (확정 천장·소환권은 "보장"이라 이 규칙 밖이다.) */
    var minShare = T.minCommonShare || 0;
    if (minShare > 0 && w.T1) {
      var rest = 0;
      for (var r in w) if (r !== 'T1') rest += w[r];
      var share = w.T1 / (w.T1 + rest);
      if (share < minShare && rest > 0) {
        var scale = (w.T1 * (1 - minShare) / minShare) / rest;
        for (var q in w) if (q !== 'T1') w[q] *= scale;
      }
    }

    // 하드 천장 — 확정 등급이 있으면 그 등급만 남긴다
    var forced = opts.floorTier || this.pityTier();
    if (forced) {
      var floorIdx = RPD.TIER_ORDER.indexOf(forced);
      for (var k = 0; k < RPD.TIER_ORDER.length; k++) {
        if (k < floorIdx) delete w[RPD.TIER_ORDER[k]];
      }
      if (!Object.keys(w).length) w[forced] = 1;
    }
    return w;
  };

  /* 지금 확정으로 터져야 하는 등급 (없으면 null) */
  SummonManager.pityTier = function () {
    var T = RPD.SummonTable;
    var round = GM.wave || 1;
    /* 천장은 "소환으로 나오는 등급"에만 건다.
     * 희귀함·전설은 소환에서 빠졌는데 천장이 해금 등급 전체를 보고 있어서,
     * 25라운드 이후 40회 · 33라운드 이후 70회마다 확정으로 새어 나왔다(약 2.5%). */
    var unlocked = RPD.tiersUnlockedAt(round).filter(function (id) {
      return RPD.Tiers[id].summonable !== false;
    });
    // 높은 등급부터 검사한다
    for (var i = unlocked.length - 1; i >= 0; i--) {
      var id = unlocked[i];
      var limit = T.hardPity[id];
      if (limit && (this.sinceTier[id] || 0) >= limit) return id;
    }
    return null;
  };

  SummonManager.currentOdds = function () {
    var w = this.currentWeights();
    var total = 0, k;
    for (k in w) if (Object.prototype.hasOwnProperty.call(w, k)) total += w[k];

    var out = {};
    for (var i = 0; i < RPD.TIER_ORDER.length; i++) {
      var id = RPD.TIER_ORDER[i];
      out[id] = (total > 0 && w[id]) ? (w[id] / total) * 100 : 0;
    }
    return out;
  };

  SummonManager.rollTier = function (opts) {
    var tier = U.weightedPick(this.currentWeights(opts));

    // 천장 카운터 갱신
    for (var i = 0; i < RPD.TIER_ORDER.length; i++) {
      var id = RPD.TIER_ORDER[i];
      if (RPD.TIER_ORDER.indexOf(tier) >= i) this.sinceTier[id] = 0;
      else this.sinceTier[id] = (this.sinceTier[id] || 0) + 1;
    }
    this.lastTier = tier;
    return tier;
  };

  /* ---------- 종 고르기 ---------- */

  /* 같은 등급 안에서 어떤 종이 나올지.
   * 조합 보정: 재료 하나만 남은 레시피의 그 재료에 가중치를 얹는다.
   * 중복 보정: 이미 여러 마리 보유한 종은 가중치를 낮춘다. */
  SummonManager.pickSpecies = function (tier, opts) {
    /* 소환은 summon:true 인 종만(흔함 15 · 안흔함 21 · 특별함 7).
     * 보스 보상은 그 등급에서 히든만 뺀 전체 — 희귀함·전설은 소환 대상이 없어서다.
     * 예전에는 판마다 계열을 추첨했다(PoolManager). 조합식 개편 v2 에서 없앴다 —
     * 재료가 전부 이름으로 못박혀 있어, 추첨에서 빠진 계열이 있으면 조합이 막힌다. */
    var pool = opts && opts.reward ? RPD.PokemonData.rewardPool(tier) : RPD.PokemonData.summonPool(tier);
    if (!pool.length) return null;

    var T = RPD.SummonTable;
    var wanted = RPD.RecipeManager ? RPD.RecipeManager.missingMaterials(T.recipeBoostMaxMissing) : {};

    var owned = {};
    var units = RPD.FieldManager.getUnits();
    for (var u = 0; u < units.length; u++) {
      owned[units[u].defId] = (owned[units[u].defId] || 0) + 1;
    }

    var entries = [];
    for (var i = 0; i < pool.length; i++) {
      var id = pool[i];
      var weight = 1;
      if (wanted[id]) weight *= T.recipeBoostMul;
      if ((owned[id] || 0) >= T.duplicateSoftenFrom) weight *= T.duplicateSoftenMul;
      entries.push({ id: id, weight: weight });
    }
    return U.weightedPick(entries);
  };

  /* ---------- 자동 배치 ---------- */

  /* 소환 직후 시스템이 기본 위치를 고른다.
   * '좋은 기본값'이지 '최적해 강제'가 아니다 — 플레이어는 언제든 옮길 수 있다.
   * 기준은 하나뿐이다: 그 개체의 사거리로 경로를 가장 많이 덮는 빈 칸. */
  SummonManager.autoPlace = function (unit) {
    var F = RPD.FieldManager;
    var best = null, bestCover = -1;

    for (var i = 0; i < F.slots.length; i++) {
      var slot = F.slots[i];
      if (!slot.unlocked || slot.unit) continue;
      var cover = RPD.MapData.coverageAt(slot.x, slot.y, unit.range);
      if (cover > bestCover) { bestCover = cover; best = slot; }
    }
    if (!best) return false;
    return F.place(best.index, unit);
  };

  /* ---------- 소환 ---------- */

  SummonManager.summon = function (opts) {
    opts = opts || {};
    /* 소환권이 있으면 먼저 쓴다.
     * 예전에는 소환권이 쌓이기만 하고 쓰이지 않았다 — 버튼은 "소환권 N"을 보여 주면서
     * 정작 summon() 을 소환권 없이 불러 골드를 요구했다(봇도 마찬가지). */
    var useTicket = opts.useTicket !== false && this.tickets > 0;
    var cost = useTicket ? 0 : RPD.EconomyManager.summonCost();

    // 정예를 놓친 벌칙 — 몇 라운드 동안 소환(소환권 포함)이 막힌다
    if (RPD.EliteManager && RPD.EliteManager.isBanned()) {
      return { ok: false, reason: 'BANNED', rounds: RPD.EliteManager.banRoundsLeft() };
    }

    // 필드가 차 있어도 창고에 자리가 있으면 뽑을 수 있다.
    // 창고가 생기기 전에는 "뽑으려면 뭔가 버려야" 했고, 그게 조합을 막았다.
    if (!RPD.FieldManager.firstEmpty() && RPD.StorageManager.isFull()) {
      return { ok: false, reason: 'NO_ROOM' };
    }
    if (!useTicket && !GM.canAfford(cost)) {
      return { ok: false, reason: 'NO_GOLD', cost: cost };
    }

    var floorTier = null;
    if (useTicket) {
      // 티켓은 소환으로 나올 수 있는 등급 중 위에서 두 번째를 최소 보장한다.
      // (해금 등급 전체를 보면 33라운드 이후 소환권이 희귀함을 확정으로 뽑았다)
      var unlocked = RPD.tiersUnlockedAt(GM.wave || 1).filter(function (id) {
        return RPD.Tiers[id].summonable !== false;
      });
      var idx = Math.max(0, unlocked.length - 1 - RPD.SummonTable.ticketFloorOffset);
      floorTier = unlocked[idx];
    }

    var tier = this.rollTier({ floorTier: floorTier });
    var speciesId = this.pickSpecies(tier);
    if (!speciesId) return { ok: false, reason: 'NO_SPECIES' };

    if (useTicket) this.tickets -= 1;
    else GM.spendGold(cost, 'summon');

    RPD.EconomyManager.summonCount += 1;
    this.count += 1;

    var unit = RPD.UnitManager.create(speciesId);
    unit.investedGold = useTicket ? RPD.Config.summonBaseCost : cost;

    var toStorage = !this.autoPlace(unit);
    if (toStorage && !RPD.StorageManager.add(unit)) return { ok: false, reason: 'NO_ROOM' };
    RPD.UnitManager.recomputeAll();

    var result = { ok: true, unit: unit, tier: tier, cost: cost,
                   ticket: useTicket, toStorage: toStorage };
    RPD.bus.emit('summon:result', result);
    RPD.bus.emit('summon:stateChanged', this.state());
    return result;
  };

  /* 라운드마다 주는 무료 흔함 한 마리.
   *
   * 소환을 대체하지 않는다. 랜덤 소환은 이 장르의 핵심이고,
   * 라운드별 등급 해금·천장·기대감이 전부 그 위에 얹혀 있다.
   * 이건 "라운드마다 뭔가 받는다"는 리듬과 초반 물량을 보장하는 바닥이다.
   *
   * 조합 보정도 그대로 적용된다 — 필요한 재료가 공짜로 올 수도 있다. */
  SummonManager.grantRound = function (count) {
    count = count || RPD.Config.roundGrant || 0;
    var given = [];
    for (var i = 0; i < count; i++) {
      if (!RPD.FieldManager.firstEmpty() && RPD.StorageManager.isFull()) break;
      var speciesId = this.pickSpecies('T1');
      if (!speciesId) break;

      var unit = RPD.UnitManager.create(speciesId);
      unit.investedGold = 0;          // 공짜로 받은 것은 환급도 없다
      if (!this.autoPlace(unit) && !RPD.StorageManager.add(unit)) break;
      given.push(unit);
    }
    if (given.length) {
      RPD.UnitManager.recomputeAll();
      RPD.bus.emit('summon:granted', { units: given });
    }
    return given;
  };

  /* 등급을 정해 한 마리를 준다. 보스 보상처럼 "소환으로는 안 나오는 등급"도 줄 수 있다.
   * 종은 조합 보정을 그대로 따른다 — 필요한 재료가 올 확률이 높다.
   * 필드도 창고도 차 있으면 null (호출한 쪽이 다른 보상으로 바꾼다). */
  SummonManager.grantUnit = function (tier) {
    if (!RPD.FieldManager.firstEmpty() && RPD.StorageManager.isFull()) return null;
    var speciesId = this.pickSpecies(tier, { reward: true });
    if (!speciesId) return null;
    var unit = RPD.UnitManager.create(speciesId);
    unit.investedGold = 0;
    if (!this.autoPlace(unit) && !RPD.StorageManager.add(unit)) return null;
    RPD.UnitManager.recomputeAll();
    RPD.bus.emit('summon:granted', { units: [unit], reward: true });
    return unit;
  };

  SummonManager.grantTicket = function (n) {
    this.tickets += (n || 1);
    RPD.bus.emit('summon:stateChanged', this.state());
  };

  SummonManager.state = function () {
    var round = GM.wave || 1;
    return {
      odds: this.currentOdds(),
      round: round,
      unlocked: RPD.tiersUnlockedAt(round),
      nextUnlock: nextUnlockInfo(round),
      tickets: this.tickets,
      count: this.count,
      pity: this.pityProgress()
    };
  };

  function nextUnlockInfo(round) {
    for (var i = 0; i < RPD.TIER_ORDER.length; i++) {
      var t = RPD.Tiers[RPD.TIER_ORDER[i]];
      if (t.unlockRound > round) {
        return { tier: t, inRounds: t.unlockRound - round };
      }
    }
    return null;
  }

  /* 천장 진행도 — UI 가 막대로 그린다 */
  SummonManager.pityProgress = function () {
    var T = RPD.SummonTable;
    var round = GM.wave || 1;
    var out = [];
    var unlocked = RPD.tiersUnlockedAt(round);
    for (var i = 0; i < unlocked.length; i++) {
      var id = unlocked[i];
      if (!T.hardPity[id]) continue;
      out.push({
        tier: RPD.Tiers[id],
        current: this.sinceTier[id] || 0,
        limit: T.hardPity[id]
      });
    }
    return out;
  };

  SummonManager.init = function () {
    var self = this;
    RPD.bus.on('enemy:died', function (p) {
      if (p.enemy && p.enemy.isBoss) self.grantTicket(1);
    });
  };

  RPD.SummonManager = SummonManager;
})(typeof window !== 'undefined' ? window : globalThis);
