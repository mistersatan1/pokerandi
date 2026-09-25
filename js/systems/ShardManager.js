/* ShardManager.js — 조각.
 *
 * 조합식 재료가 끝내 안 나오는 판이 그대로 사망 확정이 되면
 * "운이 나쁘면 아무것도 못 한다"가 된다. 그걸 막는 유일한 장치다.
 *
 *   중복 포켓몬 방출 → 등급별 조각 획득
 *   조각 → 원하는 재료를 직접 구매
 *
 * 확률을 통제하게 해 주지는 않는다. 시간을 들이면 반드시 얻을 수 있는 경로만 준다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  var ShardManager = {
    shards: 0
  };

  /* 방출 시 주는 조각 — 등급이 높을수록 많이 */
  var GAIN = { T1: 1, T2: 2, T3: 3, T4: 5, T5: 8 };

  /* 조각으로 사는 값 — 등급이 높을수록 비싸게 */
  /* 조각은 구제책이지 상점이 아니다.
   * 실측: 판당 43회 → 가격을 두 배로 올려 1회 안팎.
   * 그 뒤 필드가 차면 창고로 보내도록 고치자 상점이 후반에도 열려 판당 10.5회가 됐다.
   * 다시 40% 올려 판당 5~6회로 맞췄다 — "막혔을 때 한두 번 쓰는 것"이 기준이다. */
  /* 특별함 이하는 싸게 — 흔함 5 · 안흔함 10 · 특별함 25.
   * 막힌 재료를 바로 사서 풀라는 뜻이다. 희귀함·전설은 그대로 비싸게 둔다(보스 보상·조합이 본길). */
  var PRICE = { T1: 5, T2: 10, T3: 25, T4: 245, T5: 550 };

  ShardManager.reset = function () {
    this.shards = 0;
    RPD.bus.emit('shard:changed', 0);
  };

  ShardManager.gainFor = function (tier) { return GAIN[tier] || 1; };
  ShardManager.priceFor = function (tier) { return PRICE[tier] || 999; };

  ShardManager.add = function (amount, reason) {
    if (!amount) return;
    this.shards += amount;
    RPD.bus.emit('shard:changed', this.shards);
    RPD.bus.emit('shard:gained', { amount: amount, total: this.shards, reason: reason || '' });
  };

  /* 지금 이 개체를 살 수 있는가. 못 사는 이유까지 알려 준다(상점 줄에 그대로 쓴다). */
  ShardManager.checkBuy = function (speciesId) {
    var def = RPD.PokemonData.get(speciesId);
    if (!def) return { ok: false, reason: 'NO_SPECIES' };
    var price = this.priceFor(def.tier);
    // 불멸·초월, 그리고 히든(주문 전용)은 조각으로 못 산다 — 사면 주문이 의미를 잃는다
    if (RPD.Tiers[def.tier].special || def.hidden) return { ok: false, reason: 'LOCKED', price: price, unlockRound: 999 };
    if ((RPD.GameManager.wave || 1) < RPD.Tiers[def.tier].unlockRound) {
      return { ok: false, reason: 'LOCKED', price: price, unlockRound: RPD.Tiers[def.tier].unlockRound };
    }
    if (this.shards < price) return { ok: false, reason: 'NO_SHARD', price: price };
    if (!RPD.FieldManager.firstEmpty() && RPD.StorageManager.isFull()) {
      return { ok: false, reason: 'NO_ROOM', price: price };
    }
    return { ok: true, price: price };
  };

  ShardManager.canBuy = function (speciesId) {
    var def = RPD.PokemonData.get(speciesId);
    if (!def) return false;
    if (RPD.Tiers[def.tier].special || def.hidden) return false;
    // 아직 해금되지 않은 등급은 조각으로도 못 산다 — 라운드 해금을 우회하면 안 된다
    if ((RPD.GameManager.wave || 1) < RPD.Tiers[def.tier].unlockRound) return false;
    return this.shards >= this.priceFor(def.tier);
  };

  ShardManager.buy = function (speciesId) {
    var def = RPD.PokemonData.get(speciesId);
    if (!def) return { ok: false, reason: 'NO_SPECIES' };
    if (RPD.Tiers[def.tier].special || def.hidden) return { ok: false, reason: 'LOCKED' };
    if ((RPD.GameManager.wave || 1) < RPD.Tiers[def.tier].unlockRound) {
      return { ok: false, reason: 'LOCKED' };
    }

    var price = this.priceFor(def.tier);
    if (this.shards < price) return { ok: false, reason: 'NO_SHARD', price: price };

    /* 필드가 차 있으면 창고로 보낸다 — 소환과 같은 규칙.
     * 이게 없으면 후반(필드가 늘 꽉 차 있는 시점)에 조각 상점이 통째로 잠긴다. */
    var slot = RPD.FieldManager.firstEmpty();
    var toStorage = false;
    if (!slot) {
      if (RPD.StorageManager.isFull()) return { ok: false, reason: 'NO_ROOM' };
      toStorage = true;
    }

    this.shards -= price;
    var unit = RPD.UnitManager.create(speciesId);
    unit.investedGold = 0;
    if (toStorage) {
      RPD.StorageManager.add(unit);
    } else {
      RPD.FieldManager.place(slot.index, unit);
    }
    RPD.UnitManager.recomputeAll();

    RPD.bus.emit('shard:changed', this.shards);
    RPD.bus.emit('shard:spent', { unit: unit, price: price, toStorage: toStorage });
    return { ok: true, unit: unit, price: price, toStorage: toStorage };
  };

  /* 지금 조각으로 살 수 있는 것 중, 조합 완성에 바로 쓰이는 재료를 추천한다 */
  ShardManager.suggestions = function () {
    var missing = RPD.RecipeManager.missingMaterials(1);
    var out = [];
    for (var id in missing) {
      if (!Object.prototype.hasOwnProperty.call(missing, id)) continue;
      var def = RPD.PokemonData.get(id);
      if (!def || def.hidden || RPD.Tiers[def.tier].special) continue;   // 주문 전용은 상점에 없다
      out.push({
        id: id, name: def.name, tier: def.tier,
        price: this.priceFor(def.tier),
        affordable: this.canBuy(id)
      });
    }
    out.sort(function (a, b) { return a.price - b.price; });
    return out;
  };

  ShardManager.init = function () {
    var self = this;
    // 방출하면 조각이 나온다 — 중복이 완전히 버려지지 않게
    RPD.bus.on('unit:sold', function (p) {
      self.add(self.gainFor(p.unit.tier), 'sell');
    });
  };

  RPD.ShardManager = ShardManager;
})(typeof window !== 'undefined' ? window : globalThis);
