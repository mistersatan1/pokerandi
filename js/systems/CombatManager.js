/* CombatManager.js — 포켓몬이 적을 때리는 곳.
 *
 * 성능 설계:
 *   16유닛 × 최대 76적 = 프레임당 1216회 거리 검사가 나온다.
 *   그래서 타겟은 0.15초마다만 다시 찾고, 그 사이에는 캐시된 대상을 계속 때린다.
 *   대상이 죽거나 사거리를 벗어나면 캐시를 즉시 버린다.
 *
 * 여기서 하는 일: 대상 선정, 쿨다운, 피해 계산, 공격 방식(단일/광역/관통/연쇄).
 * 여기서 안 하는 일: 스킬(PHASE 8), 타입 효과·시너지(PHASE 10).
 *   단, 개체 데이터에 직접 적힌 효과(감속·빙결·방어감소)는 지금 적용한다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;
  var CFG = RPD.Config;
  var U = RPD.Utils;

  var CombatManager = {
    clock: 0,
    scratch: []     // queryInRange 결과를 담는 재사용 배열 (매 프레임 배열 생성 방지)
  };

  CombatManager.reset = function () {
    this.clock = 0;
  };

  CombatManager.update = function (dt) {
    this.clock += dt;

    var slots = RPD.FieldManager.slots;
    for (var i = 0; i < slots.length; i++) {
      var unit = slots[i].unit;
      if (!unit) continue;

      if (unit.attackFlash > 0) unit.attackFlash = Math.max(0, unit.attackFlash - dt * 6);

      // 침묵·기절 중이면 쿨다운도 돌지 않는다. 풀리자마자 한 방 나가는 게 아니라
      // 정상적으로 다시 조준하게 만든다.
      if (unit.disabledUntil > this.clock) { unit.target = null; continue; }

      unit.cooldown -= dt;
      if (unit.cooldown > 0) continue;

      var target = acquireTarget(unit, this.clock);
      if (!target) {
        unit.cooldown = 0;   // 대상이 없으면 대기. 쿨다운을 소모하지 않는다.
        continue;
      }

      // 특성 '멍함' 처럼 공격 대신 다른 일을 하는 경우 — 쿨다운은 똑같이 쓴다
      if (RPD.TraitManager && RPD.TraitManager.beforeAttack(unit, target)) {
        unit.cooldown = 1 / Math.max(0.05, unit.attackSpeed);
        continue;
      }

      fire(unit, target);
      unit.cooldown = 1 / Math.max(0.05, unit.attackSpeed);
    }
  };

  /* ---------- 대상 선정 ---------- */

  function inRange(unit, enemy) {
    if (!enemy || !enemy.alive) return false;
    if (unit.range >= RPD.Range.GLOBAL) return true;
    var dx = enemy.x - unit.x, dy = enemy.y - unit.y;
    return dx * dx + dy * dy <= unit.range * unit.range;
  }

  function acquireTarget(unit, clock) {
    if (unit.target && inRange(unit, unit.target) && clock < unit.targetCheckAt) {
      return unit.target;
    }
    unit.target = findTarget(unit);
    unit.targetCheckAt = clock + CFG.targetRecheckInterval;
    return unit.target;
  }

  function findTarget(unit) {
    var list = RPD.EnemyManager.enemies;
    var best = null, bestScore = -Infinity;
    var mode = unit.targeting;
    var globalRange = unit.range >= RPD.Range.GLOBAL;
    var r2 = unit.range * unit.range;

    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e.alive) continue;

      if (!globalRange) {
        var dx = e.x - unit.x, dy = e.y - unit.y;
        if (dx * dx + dy * dy > r2) continue;
      }

      var score;
      switch (mode) {
        case 'LAST':       score = -e.distance; break;
        case 'STRONGEST':  score = e.hp + e.shield; break;
        case 'WEAKEST':    score = -(e.hp + e.shield); break;
        case 'BOSS':       score = (e.isBoss ? 1e9 : 0) + e.distance; break;
        default:           score = e.distance; break;   // FIRST: 출구에 가장 가까운 적
      }

      if (score > bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  CombatManager.findTarget = findTarget;

  /* ---------- 발사 ---------- */

  /* 특성 '삼연타' 가 쓰는 추가 한 방. 연출·판정은 보통 공격과 똑같다. */
  CombatManager.fireOnce = function (unit, target) { fire(unit, target); };

  function fire(unit, target) {
    var crit = U.chance(unit.critRate);
    var damage = unit.attack * (crit ? unit.critDamage : 1);

    unit.attackFlash = 1;
    RPD.bus.emit('unit:attack', { unit: unit, target: target, crit: crit });

    switch (unit.attackType) {
      case 'SPLASH': fireSplash(unit, target, damage, crit); break;
      case 'PIERCE': firePierce(unit, target, damage, crit); break;
      case 'CHAIN':  fireChain(unit, target, damage, crit); break;
      default:       hit(unit, target, damage, crit); break;
    }

    // 특성 — 공격 한 번에 한 번만 굴린다(연쇄·관통의 타격마다 굴리지 않는다)
    if (RPD.TraitManager) RPD.TraitManager.afterAttack(unit, target, damage);
  }

  function hit(unit, enemy, damage, crit) {
    if (!enemy || !enemy.alive) return 0;

    var syn = RPD.SynergyManager.bonus;
    var P = RPD.TypeParams;

    // 격투: 보스·정예에게 추가 피해 (전설 패시브 '집중' 도 여기 얹힌다)
    var passiveBoss = RPD.SkillManager ? RPD.SkillManager.passive.bossDamageAdd : 0;
    if (enemy.isBoss && unit.typeFlags.FIGHTING) {
      damage *= (P.bossDamageMul + syn.bossDamageAdd + passiveBoss);
    } else if (enemy.isBoss && syn.bossDamageAdd + passiveBoss > 0) {
      damage *= (1 + syn.bossDamageAdd + passiveBoss);
    }

    // 고스트는 개체 자체가 방어를 무시하고, 시너지는 팀 전체에 관통을 준다
    var pierceRatio = Math.min(1, syn.armorPierceRatio +
      (RPD.SkillManager ? RPD.SkillManager.passive.teamArmorPierce : 0));
    var pierce = pierceRatio > 0
      ? enemy.armor * pierceRatio
      : 0;

    var dealt = RPD.EnemyManager.damage(enemy, damage, {
      crit: crit,
      ignoreArmor: unit.ignoreArmor,
      armorPierce: pierce,
      source: unit
    });

    unit.totalDamage += dealt;
    applyOnHit(unit, enemy, dealt);

    // 악: 체력이 바닥난 적을 즉시 정리한다
    if (enemy.alive && !enemy.isBoss) {
      var threshold = (unit.typeFlags.DARK ? P.executeThreshold : 0) + syn.executeAdd;
      if (threshold > 0 && enemy.hp / enemy.maxHp <= threshold) {
        RPD.bus.emit('combat:execute', { unit: unit, enemy: enemy });
        RPD.EnemyManager.damage(enemy, enemy.hp + 1, { ignoreArmor: true, source: unit });
      }
    }
    return dealt;
  }

  /* 개체 데이터에 적힌 부가 효과. 타입 전체 효과는 PHASE 10 에서 따로 붙는다. */
  /* 타격에 딸려 오는 효과.
   * 개체 데이터(slowMul 등)가 있으면 그 값을 쓰고, 없으면 타입의 기본값을 쓴다.
   * 즉 "물 타입이면 최소한 감속은 한다"가 보장되고, 개체가 더 잘할 수도 있다. */
  function applyOnHit(unit, enemy, dealt) {
    if (!enemy.alive) return;

    var def = unit.def;
    var f = unit.typeFlags;
    var syn = RPD.SynergyManager.bonus;
    var P = RPD.TypeParams;
    var EM = RPD.EnemyManager;

    // 물 — 감속. 전설 패시브 '심해' 가 있으면 물 타입이 아니어도 최소한 느려진다.
    var deep = RPD.SkillManager ? RPD.SkillManager.passive : null;
    if (deep && deep.slowOnHit) {
      EM.applySlow(enemy, deep.slowOnHit, deep.slowOnHitDuration);
    }
    // 전설 패시브 '냉기'(프리져) · '불꽃의몸'(파이어)
    if (deep && deep.freezeOnHit && !enemy.isBoss && enemy.alive && Math.random() < deep.freezeOnHit) {
      EM.applyFreeze(enemy, deep.freezeOnHitDuration);
    }
    if (deep && deep.burnOnHit && enemy.alive && dealt > 0) {
      EM.applyDot(enemy, dealt * deep.burnOnHit / 3, 3, unit, 'burn');
    }
    var slowMul = def.slowMul || (f.WATER ? P.slowMul : 0);
    if (slowMul) {
      EM.applySlow(enemy, Math.max(0.2, slowMul - syn.slowAdd),
        (def.slowDuration || P.slowDuration) + syn.slowDurationAdd);
    }

    // 얼음 — 빙결 / 바위 — 기절 (둘 다 정지라 같은 장치를 쓴다)
    var freezeChance = (def.freezeChance || (f.ICE ? P.freezeChance : 0)) + syn.freezeChanceAdd;
    if (freezeChance > 0 && U.chance(freezeChance)) {
      EM.applyFreeze(enemy, (def.freezeDuration || P.freezeDuration) + syn.freezeDurationAdd);
    } else {
      var stunChance = (f.ROCK ? P.stunChance : 0) + syn.stunChanceAdd;
      if (stunChance > 0 && U.chance(stunChance)) {
        EM.applyFreeze(enemy, P.stunDuration);
        RPD.bus.emit('combat:stun', { unit: unit, enemy: enemy });
      }
    }

    // 강철 — 방어력 감소
    var shred = (def.armorShred || (f.STEEL ? P.armorShred : 0)) + syn.armorShredAdd;
    if (shred > 0) {
      enemy.effects.armorShred = Math.max(enemy.effects.armorShred || 0, shred);
    }

    // 불꽃 — 화상 (지속 피해). 매 타격마다 새로 걸지 않고 남은 시간만 갱신한다.
    if (f.FIRE && dealt > 0) {
      EM.applyDot(enemy,
        dealt * P.burnRatio * syn.burnMul / P.burnDuration,
        P.burnDuration, unit, 'burn');
    }

    // 독 — 중첩되는 지속 피해
    if (f.POISON && dealt > 0) {
      var maxStacks = P.poisonMaxStacks + syn.poisonStackAdd;
      EM.applyDot(enemy,
        dealt * P.poisonRatio * syn.poisonMul / P.poisonDuration,
        P.poisonDuration, unit, 'poison', maxStacks);
    }
  }

  function fireSplash(unit, target, damage, crit) {
    hit(unit, target, damage, crit);

    var syn = RPD.SynergyManager.bonus;
    var radius = unit.splash * syn.splashRadiusMul *
                 (RPD.SkillManager ? RPD.SkillManager.passive.splashRadiusMul : 1);
    if (radius <= 0) return;

    var nearby = RPD.EnemyManager.queryInRange(target.x, target.y, radius, CombatManager.scratch);
    var side = damage * (CFG.splashDamageRatio + syn.splashDamageAdd);

    for (var i = 0; i < nearby.length; i++) {
      if (nearby[i] === target) continue;
      hit(unit, nearby[i], side, false);
    }
    RPD.bus.emit('combat:splash', { x: target.x, y: target.y, radius: radius, unit: unit });
  }

  /* 관통: 대상을 기준으로 경로상 뒤따라오는 적들을 함께 맞춘다.
   * 경로 진행도(distance)로 고르므로 "줄지어 오는 적"에게 자연스럽게 강하다. */
  function firePierce(unit, target, damage, crit) {
    hit(unit, target, damage, crit);

    var max = unit.pierce;
    if (max <= 1) return;

    var list = RPD.EnemyManager.enemies;
    var picked = 1;

    // 대상보다 뒤에 있는(=출구에서 먼) 적 순서대로
    var candidates = [];
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (e === target || !e.alive) continue;
      if (e.distance > target.distance) continue;
      if (!inRange(unit, e)) continue;
      candidates.push(e);
    }
    candidates.sort(function (a, b) { return b.distance - a.distance; });

    for (var k = 0; k < candidates.length && picked < max; k++) {
      hit(unit, candidates[k], damage, crit);
      picked += 1;
    }
  }

  /* 연쇄: 맞은 적에서 가장 가까운 다른 적으로 튄다. 튈 때마다 피해가 줄어든다.
   * 타격 횟수가 많아 보막(실드)에게 특히 잘 듣는다. */
  function fireChain(unit, target, damage, crit) {
    hit(unit, target, damage, crit);

    var jumps = unit.chain;   // 전기 시너지가 이미 반영된 값 (UnitManager.recompute 에서 더한다)
    if (jumps <= 0) return;

    var hitSet = [target];
    var current = target;
    var dmg = damage;

    for (var j = 0; j < jumps; j++) {
      dmg *= Math.min(1, CFG.chainDamageDecay + RPD.SynergyManager.bonus.chainDecayAdd);
      var next = nearestUnhit(current, hitSet, 140);
      if (!next) break;
      hit(unit, next, dmg, false);
      RPD.bus.emit('combat:chain', { from: current, to: next });
      hitSet.push(next);
      current = next;
    }
  }

  function nearestUnhit(from, exclude, maxDist) {
    var list = RPD.EnemyManager.enemies;
    var best = null, bestD = maxDist * maxDist;

    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e.alive || exclude.indexOf(e) >= 0) continue;
      var dx = e.x - from.x, dy = e.y - from.y;
      var d2 = dx * dx + dy * dy;
      if (d2 < bestD) { bestD = d2; best = e; }
    }
    return best;
  }

  /* 처치 기여를 개체 기록에 남긴다 (결과 화면의 "최고 피해 포켓몬") */
  CombatManager.init = function () {
    RPD.bus.on('enemy:died', function (p) {
      if (p.source && p.source.uid) p.source.kills += 1;
    });
  };

  RPD.CombatManager = CombatManager;
})(typeof window !== 'undefined' ? window : globalThis);
