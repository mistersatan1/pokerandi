/* EconomyManager.js — 골드가 들어오고 나가는 모든 경로.
 *
 * 원래 PHASE 12 계획이었지만 처치 보상과 이자가 없으면 웨이브가 성립하지 않아 앞당겼다.
 * 여기서 구현된 것: 처치 보상, 웨이브 클리어 보상, 이자, 보스 보상, 소환 비용 계산.
 * 아직 아닌 것: 개별 강화 비용 집행, 방출 환급, 슬롯 확장 (PHASE 12).
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;
  var GM = RPD.GameManager;
  var CFG = RPD.Config;

  var EconomyManager = {
    summonCount: 0,
    totalEarned: 0
  };

  EconomyManager.reset = function () {
    this.summonCount = 0;
    this.totalEarned = 0;
  };

  EconomyManager.init = function () {
    RPD.bus.on('enemy:died', function (payload) {
      EconomyManager.payKill(payload.enemy, payload.source);
    });
  };

  /* 보스 처치 골드(모드 배율 전). 세션 33 ⑤: 150+5R → 300+25R.
   * 보스를 놓쳐도 라이프 5 만 깎여서 "안 잡아도 그만"이었다 — 잡으면 확실히 남게 올렸다.
   * 보스 러시는 매 라운드가 보스라 모드 보정 bossGoldMul 로 줄인다. */
  EconomyManager.bossGoldBase = function (wave) {
    return (300 + 25 * (wave || 1)) * RPD.modeMod('bossGoldMul', 1);
  };
  /* 화면용 — 실제로 받을 골드(모드·시너지·도감 배율까지) */
  EconomyManager.bossGoldPreview = function (wave) {
    return this.killReward({ isBoss: true, wave: wave, def: { bounty: 0 } });
  };

  EconomyManager.killReward = function (enemy) {
    var gold;
    if (enemy.isBoss) {
      gold = EconomyManager.bossGoldBase(enemy.wave);
    } else {
      var base = CFG.killGoldBase + Math.floor(enemy.wave / CFG.killGoldPerWaves);
      gold = base * (enemy.def.bounty || 1);
    }
    // 풀 시너지 + 모드 보정
    gold *= RPD.SynergyManager.bonus.goldMul * RPD.modeMod('goldMul', 1) *
            (1 + (RPD.DexBonus ? RPD.DexBonus.totals().gold : 0));
    return Math.max(1, Math.round(gold));
  };

  EconomyManager.payKill = function (enemy, source) {
    if (enemy.isElite) return;   // 정예 보상은 EliteManager 가 따로 준다(최소 1골드도 붙이지 않는다)
    var gold = this.killReward(enemy);
    if (source && source.def && source.def.goldPerKill) {
      gold += source.def.goldPerKill;
      source.goldEarned += source.def.goldPerKill;
    }
    this.totalEarned += gold;
    GM.addGold(gold, 'kill');
    return gold;
  };

  EconomyManager.waveClearReward = function (wave) {
    var gold = Math.round((CFG.waveClearBase + wave * CFG.waveClearPerWave) *
                          RPD.modeMod('goldMul', 1));
    this.totalEarned += gold;
    GM.addGold(gold, 'waveClear');
    return gold;
  };

  /* 이자: 안 쓰고 모아둔 골드에 이자가 붙는다.
   * "지금 뽑을까, 한 웨이브 굴릴까"를 매번 고민하게 만드는 장치. */
  EconomyManager.interestFor = function (gold) {
    return Math.min(CFG.interestCap, Math.floor(gold / CFG.interestPer));
  };

  EconomyManager.payInterest = function () {
    var interest = this.interestFor(GM.gold);
    if (interest > 0) {
      this.totalEarned += interest;
      GM.addGold(interest, 'interest');
    }
    return interest;
  };

  /* 소환 비용은 뽑을수록 오른다 → 후반에 무지성 소환이 불가능해지고
   * 상대적으로 합성과 이자의 가치가 올라간다. */
  EconomyManager.summonCost = function () {
    var step = Math.floor(this.summonCount / CFG.summonCostStepEvery) * CFG.summonCostStep;
    var cost = Math.min(CFG.summonCostCap, CFG.summonBaseCost + step);
    // 벌레 시너지: 소환 비용 할인
    return Math.max(5, Math.round(cost * RPD.SynergyManager.bonus.summonCostMul));
  };

  /* 방출 환급. 그 개체에 실제로 넣은 골드의 절반을 돌려준다.
   * 등급이 아니라 "들인 비용" 기준이라, 비싸게 뽑은 커먼도 손해가 덜하다. */
  EconomyManager.sellValue = function (unit) {
    if (!unit) return 0;
    var invested = unit.investedGold || CFG.summonBaseCost;
    return Math.max(1, Math.floor(invested * CFG.sellRefundRate));
  };

  EconomyManager.sell = function (slotIndex) {
    var slot = RPD.FieldManager.get(slotIndex);
    if (!slot || !slot.unit) return 0;

    var unit = slot.unit;
    var refund = this.sellValue(unit);

    RPD.FieldManager.remove(slotIndex);
    GM.addGold(refund, 'sell');
    RPD.bus.emit('unit:sold', { unit: unit, refund: refund, slotIndex: slotIndex });
    return refund;
  };

  /* 창고에 있는 개체도 방출할 수 있어야 한다.
   * 창고가 차면 소환도 조합도 막히는데, 예전에는 필드에 올린 뒤에야 버릴 수 있었다. */
  EconomyManager.sellStored = function (storageIndex) {
    var unit = RPD.StorageManager.units[storageIndex];
    if (!unit) return 0;

    var refund = this.sellValue(unit);
    RPD.StorageManager.removeAt(storageIndex);
    GM.addGold(refund, 'sell');
    RPD.bus.emit('unit:sold', { unit: unit, refund: refund, fromStorage: true });
    return refund;
  };

  /* 강화 — 한 개체의 공격력을 확실하게 올린다.
   * 소환이 "운"이라면 강화는 "확실하지만 비싼" 선택지다.
   * 비용이 지수로 오르므로 아무 개체나 끝까지 올릴 수는 없다. */
  EconomyManager.upgradeCost = function (unit) {
    if (!unit) return 0;
    var tierIndex = RPD.tierPower(unit.tier);
    // 상위 등급일수록 한 번의 강화가 주는 절대 화력이 크므로 비용도 비싸다
    var base = CFG.upgradeBaseCost * Math.pow(CFG.upgradeTierMul, Math.max(0, tierIndex));
    return Math.round(base * Math.pow(CFG.upgradeCostGrowth, unit.level));
  };

  /* 이 칸에서 강화하면 덮는 경로가 얼마나 느는가 — 화면 표시·봇 판단용 { now, next } (px) */
  EconomyManager.upgradeCoverage = function (unit) {
    if (!unit || unit.slotIndex == null || unit.slotIndex < 0) return null;
    var slot = RPD.FieldManager.slots[unit.slotIndex];
    if (!slot || unit.def.range >= RPD.Range.GLOBAL) return null;
    var step = RPD.Config.upgradeRangeStep;
    var r = function (lv) { return Math.round(unit.def.range * (1 + lv * step)); };
    return {
      now: RPD.MapData.coverageAt(slot.x, slot.y, r(unit.level)),
      next: RPD.MapData.coverageAt(slot.x, slot.y, r(Math.min(unit.level + 1, CFG.upgradeMaxLevel)))
    };
  };

  EconomyManager.canUpgrade = function (unit) {
    return !!unit && unit.level < CFG.upgradeMaxLevel && unit.def.range < RPD.Range.GLOBAL;
  };

  EconomyManager.upgrade = function (slotIndex) {
    var slot = RPD.FieldManager.get(slotIndex);
    if (!slot || !slot.unit) return { ok: false, reason: 'NO_UNIT' };

    var unit = slot.unit;
    if (!this.canUpgrade(unit)) return { ok: false, reason: 'MAX_LEVEL' };

    var cost = this.upgradeCost(unit);
    if (!GM.spendGold(cost, 'upgrade')) return { ok: false, reason: 'NO_GOLD' };

    unit.level += 1;
    unit.investedGold = (unit.investedGold || 0) + cost;
    RPD.UnitManager.recomputeAll();

    RPD.bus.emit('unit:upgraded', { unit: unit, level: unit.level, cost: cost });
    return { ok: true, unit: unit, level: unit.level, cost: cost };
  };

  /* 슬롯 확장 — 공간을 산다.
   * 확장 칸은 두 레인에서 같은 거리라 사거리 하나로 양쪽을 덮는다. */
  EconomyManager.unlockSlot = function (slotIndex) {
    var slot = RPD.FieldManager.get(slotIndex);
    if (!slot) return { ok: false, reason: 'NO_SLOT' };
    if (slot.unlocked) return { ok: false, reason: 'ALREADY' };
    // 모드 제한으로 막힌 칸은 값이 0 이라 그냥 두면 "공짜로 구매 성공"이 된다
    if (slot.blocked) return { ok: false, reason: 'BLOCKED' };
    if (!(slot.cost > 0)) return { ok: false, reason: 'NOT_FOR_SALE' };

    if (!GM.spendGold(slot.cost, 'slot')) return { ok: false, reason: 'NO_GOLD' };

    // 열기에 실패하면 낸 돈을 돌려준다
    if (!RPD.FieldManager.unlock(slotIndex)) {
      GM.addGold(slot.cost, 'refund');
      return { ok: false, reason: 'BLOCKED' };
    }
    RPD.bus.emit('field:slotBought', { slot: slot, cost: slot.cost });
    return { ok: true, slot: slot, cost: slot.cost };
  };

  RPD.EconomyManager = EconomyManager;
})(typeof window !== 'undefined' ? window : globalThis);
