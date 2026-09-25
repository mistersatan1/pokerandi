/* SkillManager.js — 고유 스킬을 실제로 터뜨린다.
 *
 * CombatManager 는 평타만 본다. 스킬은 여기서 따로 돌린다 —
 * 공격 루프에 섞으면 "쿨다운이 두 개"가 되어 어느 쪽이 밀렸는지 추적이 어렵다.
 *
 * 규칙 (data/skills.js 와 같은 규칙, 실행은 여기)
 *   - 허공에 쓰지 않는다: 범위 안에 적이 있을 때만 터진다. 없으면 쿨다운을 소모하지 않는다.
 *   - 침묵·기절 중에는 쿨다운도 멈춘다.
 *   - 배율은 unit.attack(실효 공격력) 기준이라 강화·시너지·버프가 스킬에도 실린다.
 *   - 연출은 이벤트로만 알린다('unit:skill'). 여기서는 캔버스를 모른다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  var SkillManager = {
    clock: 0,
    zones: [],           // 진행 중인 장판 (독의화원 등)
    buff: null,          // { attackMul, speedMul, until, from }
    passive: basePassive()
  };

  function basePassive() {
    return {
      teamAttackMul: 1,
      splashRadiusMul: 1,
      bossDamageAdd: 0,
      cooldownMul: 1,
      slowOnHit: 0,
      slowOnHitDuration: 0,
      teamCritDamageAdd: 0,
      teamAttackSpeedMul: 1,
      freezeOnHit: 0,
      freezeOnHitDuration: 0,
      burnOnHit: 0,
      teamArmorPierce: 0
    };
  }

  SkillManager.reset = function () {
    this.clock = 0;
    this.zones.length = 0;
    this.buff = null;
    this.passive = basePassive();
  };

  SkillManager.init = function () {
    var self = this;
    // 필드 구성이 바뀌면 전설 패시브를 다시 센다. 매 프레임 세지 않는다.
    RPD.bus.on('field:changed', function () { self.recomputePassives(); });
    RPD.bus.on('storage:changed', function () { self.recomputePassives(); });
    this.recomputePassives();
  };

  /* ---------- 전설 패시브 ---------- */

  SkillManager.recomputePassives = function () {
    var p = basePassive();
    var units = RPD.FieldManager.getUnits();
    var seen = {};
    for (var i = 0; i < units.length; i++) {
      var def = units[i].def;
      var pas = RPD.SkillData.passiveForUnit(def);
      // 같은 전설을 두 마리 올려도 패시브는 한 번만 — 중복 스택은 후반을 무너뜨린다
      if (!pas || seen[pas.id]) continue;
      seen[pas.id] = true;
      if (pas.teamAttackMul) p.teamAttackMul *= pas.teamAttackMul;
      if (pas.splashRadiusMul) p.splashRadiusMul *= pas.splashRadiusMul;
      if (pas.bossDamageAdd) p.bossDamageAdd += pas.bossDamageAdd;
      if (pas.cooldownMul) p.cooldownMul *= pas.cooldownMul;
      if (pas.slowOnHit) {
        p.slowOnHit = p.slowOnHit ? Math.min(p.slowOnHit, pas.slowOnHit) : pas.slowOnHit;
        p.slowOnHitDuration = Math.max(p.slowOnHitDuration, pas.slowOnHitDuration || 1);
      }
      if (pas.teamCritDamageAdd) p.teamCritDamageAdd += pas.teamCritDamageAdd;
      if (pas.teamAttackSpeedMul) p.teamAttackSpeedMul *= pas.teamAttackSpeedMul;
      if (pas.freezeOnHit) {
        p.freezeOnHit = Math.max(p.freezeOnHit, pas.freezeOnHit);
        p.freezeOnHitDuration = Math.max(p.freezeOnHitDuration, pas.freezeOnHitDuration || 0.8);
      }
      if (pas.burnOnHit) p.burnOnHit = Math.max(p.burnOnHit, pas.burnOnHit);
      if (pas.teamArmorPierce) p.teamArmorPierce += pas.teamArmorPierce;
    }
    // 능력치에 들어가는 축이 바뀌면 전체를 다시 계산한다
    var changed = p.teamAttackMul !== this.passive.teamAttackMul ||
      p.teamCritDamageAdd !== this.passive.teamCritDamageAdd ||
      p.teamAttackSpeedMul !== this.passive.teamAttackSpeedMul;
    this.passive = p;
    if (changed) RPD.UnitManager.recomputeAll();
    return p;
  };

  /* 지금 걸려 있는 팀 버프 배율. UnitManager.recompute 가 읽는다. */
  SkillManager.attackMul = function () {
    var b = this.buff && this.buff.until > this.clock ? this.buff.attackMul : 1;
    return b * this.passive.teamAttackMul;
  };
  SkillManager.speedMul = function () {
    return this.buff && this.buff.until > this.clock ? (this.buff.speedMul || 1) : 1;
  };

  /* ---------- 루프 ---------- */

  SkillManager.update = function (dt) {
    this.clock += dt;

    var slots = RPD.FieldManager.slots;
    for (var i = 0; i < slots.length; i++) {
      var unit = slots[i].unit;
      if (!unit || !unit.skill) continue;

      // 침묵 중에는 쿨다운도 멈춘다
      if (RPD.UnitManager.isDisabled(unit)) continue;

      unit.skillCooldown -= dt;
      if (unit.skillCooldown > 0) continue;

      if (this.cast(unit)) {
        unit.skillCooldown = unit.skillMax * this.passive.cooldownMul * (unit.cooldownMul || 1);   // 옆 버퍼의 쿨다운 감소
      }
    }

    updateZones(this, dt);

    if (this.buff && this.buff.until <= this.clock) {
      this.buff = null;
      RPD.UnitManager.recomputeAll();   // 버프가 끝났으니 실효 스탯을 되돌린다
      RPD.bus.emit('skill:buffEnded', {});
    }
  };

  /* ---------- 발동 ---------- */

  SkillManager.cast = function (unit) {
    var skill = unit.skill;
    if (!skill) return false;

    var targets = collect(unit, skill);
    if (skill.kind !== 'teamBuff' && !targets.length) return false;   // 허공에 쓰지 않는다
    if (skill.kind === 'teamBuff' && !anyEnemyInRange(unit)) return false;

    var focus = targets[0] || unit.target || null;
    RPD.bus.emit('unit:skill', { unit: unit, skill: skill, target: focus, targets: targets });

    switch (skill.kind) {
      case 'single':   castSingle(unit, skill, targets); break;
      case 'zone':     castZone(this, unit, skill); break;
      case 'teamBuff': castBuff(this, unit, skill); break;
      default:         castArea(unit, skill, targets); break;
    }
    return true;
  };

  function anyEnemyInRange(unit) {
    return collect(unit, { scope: 'range' }).length > 0;
  }

  /* 범위 안의 적을 모은다. 전역 스킬도 상한(maxTargets)을 둔다 —
   * 후반 물량에서 한 방에 전부 지우면 라운드가 의미를 잃는다. */
  function collect(unit, skill) {
    var list = RPD.EnemyManager.enemies;
    var out = [];
    var global = skill.scope === 'global';
    var r2 = unit.range * unit.range;

    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e.alive) continue;
      if (!global && unit.range < RPD.Range.GLOBAL) {
        var dx = e.x - unit.x, dy = e.y - unit.y;
        if (dx * dx + dy * dy > r2) continue;
      }
      out.push(e);
    }

    // 출구에 가까운 적부터 — 놓치면 라이프가 깎이는 순서다. 공격 대상을 '보스 우선'으로 고른 개체는 보스를 맨 앞에.
    var bossFirst = unit.targeting === 'BOSS';
    out.sort(function (a, b) {
      if (bossFirst && a.isBoss !== b.isBoss) return a.isBoss ? -1 : 1;
      return b.distance - a.distance;
    });
    if (skill.maxTargets && out.length > skill.maxTargets) out.length = skill.maxTargets;
    return out;
  }

  function damage(unit, enemy, amount, opts) {
    opts = opts || {};
    var syn = RPD.SynergyManager.bonus;
    var amt = amount;
    if (enemy.isBoss) {
      var bossAdd = syn.bossDamageAdd + SkillManager.passive.bossDamageAdd +
                    (unit.typeFlags.FIGHTING ? RPD.TypeParams.bossDamageMul - 1 : 0);
      amt *= (1 + bossAdd);
    }
    var dealt = RPD.EnemyManager.damage(enemy, amt, {
      crit: false,
      ignoreArmor: !!opts.ignoreArmor || unit.ignoreArmor,
      armorPierce: enemy.armor * Math.min(1, syn.armorPierceRatio + SkillManager.passive.teamArmorPierce),
      source: unit,
      skill: true
    });
    unit.totalDamage += dealt;
    return dealt;
  }

  function applyStatus(unit, enemy, skill, dealt) {
    var EM = RPD.EnemyManager;
    if (skill.freeze) EM.applyFreeze(enemy, skill.freeze);
    if (skill.slowMul) EM.applySlow(enemy, skill.slowMul, skill.slowDuration || 2);
    if (skill.armorShred) {
      enemy.effects.armorShred = Math.max(enemy.effects.armorShred || 0, skill.armorShred);
    }
    if (skill.burn && dealt > 0) {
      EM.applyDot(enemy, dealt * skill.burn.ratio / skill.burn.duration,
        skill.burn.duration, unit, 'burn');
    }
    if (skill.poisonMul && dealt > 0) {
      var P = RPD.TypeParams;
      EM.applyDot(enemy, dealt * P.poisonRatio * skill.poisonMul / P.poisonDuration,
        P.poisonDuration, unit, 'poison', P.poisonMaxStacks);
    }
  }

  function castArea(unit, skill, targets) {
    var base = unit.attack * skill.damageMul;
    for (var i = 0; i < targets.length; i++) {
      var e = targets[i];
      if (!e.alive) continue;
      var dealt = damage(unit, e, base, skill);
      applyStatus(unit, e, skill, dealt);
    }
  }

  function castSingle(unit, skill, targets) {
    var focus = pickFocus(skill, targets, unit);
    if (!focus) return;
    var base = unit.attack * skill.damageMul;
    var hits = skill.hits || 1;
    var dealt = 0;
    for (var h = 0; h < hits; h++) {
      if (!focus.alive) break;
      dealt += damage(unit, focus, base, skill);
    }
    applyStatus(unit, focus, skill, dealt);

    if (skill.splash) {
      var near = RPD.EnemyManager.queryInRange(focus.x, focus.y, skill.splash, RPD.CombatManager.scratch);
      var side = base * (skill.splashRatio || 0.4);
      for (var i = 0; i < near.length; i++) {
        if (near[i] === focus || !near[i].alive) continue;
        var d2 = damage(unit, near[i], side, skill);
        applyStatus(unit, near[i], skill, d2);
      }
      RPD.bus.emit('combat:splash', { x: focus.x, y: focus.y, radius: skill.splash, unit: unit });
    }
  }

  function pickFocus(skill, targets, unit) {
    if (!targets.length) return null;
    // 공격 대상을 '보스 우선'으로 고른 개체는 스킬도 보스에게 (collect 가 보스를 맨 앞에 둔다)
    if (unit && unit.targeting === 'BOSS' && targets[0].isBoss) return targets[0];
    var best = targets[0];
    for (var i = 1; i < targets.length; i++) {
      var e = targets[i];
      if (skill.target === 'boss') {
        if ((e.isBoss ? 1 : 0) > (best.isBoss ? 1 : 0)) best = e;
        else if (e.isBoss === best.isBoss && e.hp + e.shield > best.hp + best.shield) best = e;
      } else if (skill.target === 'strongest') {
        if (e.hp + e.shield > best.hp + best.shield) best = e;
      }
    }
    return best;
  }

  /* 장판 — 그 자리에 머무는 지속 피해. 0.5초마다 정산한다. */
  function castZone(mgr, unit, skill) {
    mgr.zones.push({
      unit: unit, skill: skill,
      x: unit.x, y: unit.y,
      radius: unit.range >= RPD.Range.GLOBAL ? RPD.Range.LONG : unit.range,
      perTick: unit.attack * skill.damageMul / (skill.duration * 2),
      remaining: skill.duration,
      tick: 0
    });
    RPD.bus.emit('skill:zone', { unit: unit, skill: skill, x: unit.x, y: unit.y });
  }

  function updateZones(mgr, dt) {
    for (var i = mgr.zones.length - 1; i >= 0; i--) {
      var z = mgr.zones[i];
      z.remaining -= dt;
      z.tick += dt;
      if (z.tick >= 0.5) {
        z.tick = 0;
        var near = RPD.EnemyManager.queryInRange(z.x, z.y, z.radius, RPD.CombatManager.scratch);
        for (var k = 0; k < near.length; k++) {
          if (near[k].alive) damage(z.unit, near[k], z.perTick, z.skill);
        }
      }
      if (z.remaining <= 0) mgr.zones.splice(i, 1);
    }
  }

  function castBuff(mgr, unit, skill) {
    mgr.buff = {
      attackMul: skill.attackMul || 1,
      speedMul: skill.speedMul || 1,
      until: mgr.clock + skill.duration,
      from: unit
    };
    RPD.UnitManager.recomputeAll();
    RPD.bus.emit('skill:buff', { unit: unit, skill: skill, duration: skill.duration });
  }

  /* 개체가 만들어질 때 스킬을 붙인다. UnitManager.create 가 부른다. */
  SkillManager.attach = function (unit) {
    var skill = RPD.SkillData ? RPD.SkillData.forUnit(unit.def) : null;
    unit.skill = skill;
    unit.skillMax = skill ? skill.cooldown : 0;
    // 뽑자마자 터지지 않는다. 첫 발동은 쿨다운 절반을 기다린다.
    unit.skillCooldown = skill ? skill.cooldown * 0.5 : 0;
  };

  SkillManager.ready = function (unit) {
    return !!(unit && unit.skill && unit.skillCooldown <= 0);
  };

  RPD.SkillManager = SkillManager;
})(typeof window !== 'undefined' ? window : globalThis);
