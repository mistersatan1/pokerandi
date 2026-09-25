/* SynergyManager.js — 타입 시너지.
 *
 * "이 조합을 유지할까, 더 센 애로 갈아탈까"를 만드는 장치다.
 * 시너지가 없으면 항상 DPS 높은 개체만 올리면 되고, 조합을 고민할 이유가 없다.
 *
 * 계산은 한 곳에서만 한다. 필드가 바뀔 때마다 다시 세고, 결과를 bonus 하나에 담는다.
 * 전투·경제·UI 는 전부 그 bonus 만 읽는다 — 각자 세면 표시와 실제가 어긋난다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  /* 보너스의 기본값. 여기 없는 키를 시너지 표가 쓰면 조용히 무시되므로
   * 새 시너지를 추가할 때는 반드시 여기에도 키를 만들어야 한다. */
  function baseBonus() {
    return {
      burnMul: 1,
      poisonMul: 1,
      poisonStackAdd: 0,
      slowAdd: 0,
      slowDurationAdd: 0,
      freezeChanceAdd: 0,
      freezeDurationAdd: 0,
      stunChanceAdd: 0,
      chainAdd: 0,
      chainDecayAdd: 0,
      splashRadiusMul: 1,
      splashDamageAdd: 0,
      bossDamageAdd: 0,
      critRateAdd: 0,
      critDamageAdd: 0,
      armorPierceRatio: 0,
      armorShredAdd: 0,
      executeAdd: 0,
      attackSpeedMul: 1,
      auraMul: 1,
      goldMul: 1,
      summonCostMul: 1,
      lifeShield: 0
    };
  }

  var SynergyManager = {
    counts: {},        // { FIRE: 3, ... }
    active: [],        // [{ typeId, label, count, tier, next, tierIndex }]
    bonus: baseBonus()
  };

  SynergyManager.reset = function () {
    this.counts = {};
    this.active = [];
    this.bonus = baseBonus();
    RPD.bus.emit('synergy:changed', this);
  };

  /* 필드의 개체들을 훑어 타입을 센다.
   * 한 개체가 두 타입이면 둘 다 1씩 센다 — 복합 타입이 조합의 재미가 된다.
   * 같은 종이 여러 마리면 각각 센다. */
  SynergyManager.recompute = function () {
    var counts = {};
    var units = RPD.FieldManager.getUnits();

    for (var i = 0; i < units.length; i++) {
      var types = units[i].types || [];
      for (var t = 0; t < types.length; t++) {
        counts[types[t]] = (counts[types[t]] || 0) + 1;
      }
    }

    var bonus = baseBonus();
    var active = [];

    for (var typeId in RPD.Synergies) {
      if (!Object.prototype.hasOwnProperty.call(RPD.Synergies, typeId)) continue;

      var tiers = RPD.Synergies[typeId];
      var count = counts[typeId] || 0;
      var reached = -1;

      for (var k = 0; k < tiers.length; k++) {
        if (count >= tiers[k].count) reached = k;
      }

      var next = reached + 1 < tiers.length ? tiers[reached + 1] : null;

      if (reached >= 0) {
        apply(bonus, tiers[reached].bonus);
        active.push({
          typeId: typeId,
          count: count,
          tier: tiers[reached],
          tierIndex: reached,
          next: next
        });
      } else if (count > 0) {
        // 아직 못 채운 타입도 "몇 개 더 필요한지" 보여 줘야 모으는 재미가 생긴다
        active.push({
          typeId: typeId, count: count, tier: null, tierIndex: -1, next: tiers[0]
        });
      }
    }

    // 완성된 시너지를 위로, 그다음 보유 수가 많은 순
    active.sort(function (a, b) {
      if ((a.tierIndex >= 0) !== (b.tierIndex >= 0)) return a.tierIndex >= 0 ? -1 : 1;
      if (b.tierIndex !== a.tierIndex) return b.tierIndex - a.tierIndex;
      return b.count - a.count;
    });

    var changed = this.bonus.attackSpeedMul !== bonus.attackSpeedMul ||
                  this.active.length !== active.length;

    this.counts = counts;
    this.active = active;
    this.bonus = bonus;

    RPD.bus.emit('synergy:changed', this);
    return changed;
  };

  function apply(bonus, add) {
    if (!add) return;
    for (var key in add) {
      if (!Object.prototype.hasOwnProperty.call(add, key)) continue;
      if (!(key in bonus)) {
        console.warn('[Synergy] 알 수 없는 보너스 키: ' + key);
        continue;
      }
      // Mul 로 끝나는 값은 곱, 나머지는 최댓값을 쓴다.
      // 같은 타입의 상위 단계만 적용되므로 단계끼리 겹쳐 쌓이지 않는다.
      if (/Mul$/.test(key)) bonus[key] *= add[key];
      else bonus[key] = Math.max(bonus[key], add[key]);
    }
  }

  SynergyManager.countOf = function (typeId) { return this.counts[typeId] || 0; };

  SynergyManager.activeCount = function () {
    var n = 0;
    for (var i = 0; i < this.active.length; i++) if (this.active[i].tierIndex >= 0) n += 1;
    return n;
  };

  RPD.SynergyManager = SynergyManager;
})(typeof window !== 'undefined' ? window : globalThis);
