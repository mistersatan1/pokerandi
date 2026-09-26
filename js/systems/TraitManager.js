/* TraitManager.js — 특성을 실제로 발동시킨다.
 *
 * CombatManager 는 두 곳에서만 이쪽을 부른다.
 *   beforeAttack(unit, target)  → true 면 이번 공격을 쉰다(멍함)
 *   afterAttack(unit, target, damage)  → 공격 뒤에 붙는 효과(감전·포자)
 * 처치 보너스(금전운)는 'enemy:died' 이벤트만 듣는다.
 *
 * "공격 시" 확률은 공격 한 번에 한 번만 굴린다. 연쇄·관통처럼 한 번에 여러 적을 때리는
 * 공격에서 타격마다 굴리면 적힌 확률보다 몇 배 자주 터진다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;
  var U = RPD.Utils;

  var TraitManager = { procs: {} };

  TraitManager.reset = function () { this.procs = {}; };

  TraitManager.init = function () {
    var self = this;
    RPD.bus.on('game:wave', onWave);
    RPD.bus.on('enemy:died', function (p) {
      if (!p || !p.source || !p.source.def) return;
      var t = RPD.TraitData.get(p.source.def.id);
      if (!t || t.kind !== 'bonusGoldOnKill') return;
      if (!U.chance(t.chance)) return;
      var wave = RPD.GameManager.wave || 1;
      var gold = Math.round(t.gold + wave * (t.goldPerWave || 0));
      RPD.GameManager.addGold(gold, 'trait');
      self.proc(p.source, t, { x: p.enemy.x, y: p.enemy.y, gold: gold });
    });
  };

  function onWave() {
    var units = RPD.FieldManager.getUnits();
    for (var i = 0; i < units.length; i++) {
      var t = TraitManager.of(units[i]);
      if (!t || t.kind !== 'goldOnWave') continue;
      RPD.GameManager.addGold(t.gold, 'trait');
      TraitManager.proc(units[i], t, { gold: t.gold });
    }
  }

  TraitManager.of = function (unit) {
    return unit && unit.def ? RPD.TraitData.get(unit.def.id) : null;
  };

  /* 멍함 — 공격하지 않고 주변을 느리게 만든다 */
  TraitManager.beforeAttack = function (unit, target) {
    var t = this.of(unit);
    if (!t || t.kind !== 'dazeInsteadOfAttack') return false;
    if (!U.chance(t.chance)) return false;

    var near = RPD.EnemyManager.queryInRange(unit.x, unit.y, t.radius, RPD.CombatManager.scratch);
    for (var i = 0; i < near.length; i++) {
      if (near[i].alive) RPD.EnemyManager.applySlow(near[i], t.slowMul, t.duration);
    }
    this.proc(unit, t, { x: unit.x, y: unit.y, radius: t.radius, count: near.length });
    return true;
  };

  var EXTRA_GUARD = false;

  TraitManager.afterAttack = function (unit, target, damage) {
    var t = this.of(unit);
    if (!t || !target) return;
    var EM = RPD.EnemyManager;

    switch (t.kind) {
      case 'chainOnAttack':
        if (U.chance(t.chance)) chainFrom(unit, target, t.count, t.radius, t.damageMul, t);
        return;

      case 'poisonOnAttack':
        if (!U.chance(t.chance)) return;
        var victims = t.radius
          ? EM.queryInRange(target.x, target.y, t.radius, RPD.CombatManager.scratch).slice()
          : [target];
        for (var v = 0; v < victims.length; v++) poison(unit, victims[v], damage, t.poisonMul || 1);
        this.proc(unit, t, { x: target.x, y: target.y, radius: t.radius || 0, tint: 'poison' });
        return;

      case 'burnOnAttack':
        if (!target.alive || !U.chance(t.chance)) return;
        var P = RPD.TypeParams, syn = RPD.SynergyManager.bonus;
        EM.applyDot(target, damage * P.burnRatio * syn.burnMul * t.burnMul / P.burnDuration,
          P.burnDuration, unit, 'burn');
        this.proc(unit, t, { x: target.x, y: target.y });
        return;

      case 'stunOnAttack':
        // 보스는 멈추지 않는다 — 기절 특성 네 마리가 모이면 보스가 한 발짝도 못 움직인다
        if (!target.alive || target.isBoss || !U.chance(t.chance)) return;
        EM.applyFreeze(target, t.duration);
        this.proc(unit, t, { x: target.x, y: target.y });
        return;

      case 'slowOnAttack':
        if (!target.alive || !U.chance(t.chance)) return;
        EM.applySlow(target, t.slowMul, t.duration);
        this.proc(unit, t, { x: target.x, y: target.y });
        return;

      case 'knockbackOnAttack':
        // 보스를 밀면 보스전이 무너진다 — 보스는 제외
        if (!target.alive || target.isBoss || !U.chance(t.chance)) return;
        target.distance = Math.max(0, target.distance - t.push);
        var pos = RPD.MapData.pathFor(target).pointAt(target.distance);
        target.x = pos.x; target.y = pos.y;
        this.proc(unit, t, { x: target.x, y: target.y });
        return;

      case 'extraAttackOnAttack':
        // 추가 공격에서 다시 추가 공격이 터지지 않게 막는다
        if (EXTRA_GUARD || !target.alive || !U.chance(t.chance)) return;
        EXTRA_GUARD = true;
        try { RPD.CombatManager.fireOnce(unit, target); } finally { EXTRA_GUARD = false; }
        this.proc(unit, t, { x: target.x, y: target.y });
        return;

      case 'bonusDamageOnAttack':
        if (!target.alive) return;
        if (t.when === 'boss' && !target.isBoss) return;
        if (t.when === 'lowHp' && target.hp > target.maxHp * (t.lowHpRatio || 0.3)) return;
        if (!U.chance(t.chance)) return;
        var extra = EM.damage(target, damage * (t.mul - 1), { source: unit, trait: true });
        unit.totalDamage += extra;
        // 항상 붙는(확률 100%) 보너스는 매번 글자를 띄우면 화면이 시끄럽다
        if (t.chance < 1) this.proc(unit, t, { x: target.x, y: target.y });
        return;

      case 'armorBreakOnAttack':
        if (!target.alive || !U.chance(t.chance)) return;
        target.effects.armorShred = Math.max(target.effects.armorShred || 0, t.armor);
        this.proc(unit, t, { x: target.x, y: target.y });
        return;

      case 'randomOnAttack':
        if (!U.chance(t.chance)) return;
        var roll = Math.floor(Math.random() * 3);
        var label;
        if (roll === 0) { EM.applySlow(target, 0.6, 2); label = '감속'; }
        else if (roll === 1) { poison(unit, target, damage, 1.5); label = '독'; }
        else { chainFrom(unit, target, 2, 110, 0.5, null); label = '연쇄'; }
        this.proc(unit, t, { x: target.x, y: target.y, label: label });
        return;
    }
  };

  function poison(unit, enemy, damage, mul) {
    if (!enemy || !enemy.alive) return;
    var P = RPD.TypeParams, syn = RPD.SynergyManager.bonus;
    RPD.EnemyManager.applyDot(enemy,
      damage * P.poisonRatio * syn.poisonMul * mul / P.poisonDuration,
      P.poisonDuration, unit, 'poison', P.poisonMaxStacks + syn.poisonStackAdd);
  }

  function chainFrom(unit, target, count, radius, damageMul, trait) {
    var near = RPD.EnemyManager.queryInRange(target.x, target.y, radius, RPD.CombatManager.scratch)
      .filter(function (e) { return e.alive && e !== target; })
      .sort(function (a, b) {
        var da = (a.x - target.x) * (a.x - target.x) + (a.y - target.y) * (a.y - target.y);
        var db = (b.x - target.x) * (b.x - target.x) + (b.y - target.y) * (b.y - target.y);
        return da - db;
      })
      .slice(0, count);
    var from = target;
    for (var i = 0; i < near.length; i++) {
      var dealt = RPD.EnemyManager.damage(near[i], unit.attack * damageMul, { source: unit, trait: true });
      unit.totalDamage += dealt;
      RPD.bus.emit('combat:chain', { from: from, to: near[i] });
      from = near[i];
    }
    if (trait && near.length) TraitManager.proc(unit, trait, { x: target.x, y: target.y, count: near.length });
  }

  /* 항상 붙는 능력치 — UnitManager.recompute 가 부른다 */
  TraitManager.applyStats = function (unit) {
    var t = this.of(unit);
    if (!t || t.kind !== 'statBonus') return;
    if (t.attackSpeedMul) unit.attackSpeed *= t.attackSpeedMul;
    if (t.rangeMul && unit.range < RPD.Range.GLOBAL) unit.range = Math.round(unit.range * t.rangeMul);
    if (t.critDamageAdd) unit.critDamage += t.critDamageAdd;
    if (t.critRateAdd) unit.critRate = Math.min(0.95, unit.critRate + t.critRateAdd);
  };

  /* 발동 기록 + 화면에 알림. 연출은 이벤트로만 보낸다. */
  TraitManager.proc = function (unit, trait, info) {
    var id = unit.def.id;
    this.procs[id] = (this.procs[id] || 0) + 1;
    RPD.bus.emit('trait:proc', { unit: unit, trait: trait, info: info || {} });
  };

  RPD.TraitManager = TraitManager;
})(typeof window !== 'undefined' ? window : globalThis);
