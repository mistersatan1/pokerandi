/* UnitManager.js — 필드에 올라간 포켓몬 개체의 생성과 실효 스탯 계산.
 *
 * 데이터(def)는 불변이고, 개체(unit)는 강화·각성·오라를 반영한 값을 따로 갖는다.
 * 스탯이 바뀔 수 있는 사건(배치, 이동, 합성, 강화)마다 recomputeAll 을 한 번만 돌린다.
 * → 전투 루프는 매 프레임 스탯을 다시 계산하지 않는다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;
  var CFG = RPD.Config;
  var U = RPD.Utils;

  var UnitManager = {};

  function flagsOf(types) {
    var f = {};
    for (var i = 0; i < (types || []).length; i++) f[types[i]] = true;
    return f;
  }

  UnitManager.flagsOf = flagsOf;

  /* 일정 시간 공격을 막는다. 보스 패턴(침묵·충격파)이 쓴다.
   * 더 긴 쪽이 이긴다 — 짧은 기절이 긴 침묵을 덮어쓰면 안 된다. */
  UnitManager.disable = function (unit, seconds) {
    if (!unit) return;
    var until = RPD.CombatManager.clock + seconds;
    if (until <= unit.disabledUntil) return;
    unit.disabledUntil = until;
    RPD.bus.emit('unit:disabled', { unit: unit, seconds: seconds });
  };

  UnitManager.isDisabled = function (unit) {
    return unit.disabledUntil > RPD.CombatManager.clock;
  };

  UnitManager.create = function (defId) {
    var def = RPD.PokemonData.get(defId);
    if (!def) return null;

    var unit = {
      uid: U.uid('unit'),
      defId: def.id,
      def: def,
      name: def.name,
      tier: def.tier,
      types: def.types,
      // 타입 조회를 매 타격마다 indexOf 로 하면 초당 수백 번이다. 한 번 만들어 둔다.
      typeFlags: flagsOf(def.types),
      role: def.role,
      roleLabel: def.roleLabel,

      level: 0,

      slotIndex: -1,
      x: 0, y: 0,

      cooldown: 0,
      skill: null,          // 고유 스킬 (희귀함부터). SkillManager.attach 가 채운다
      skillCooldown: 0,
      skillMax: 0,
      disabledUntil: 0,   // 침묵·기절. CombatManager 가 이 시각까지 공격을 건너뛴다.
      target: null,
      targetCheckAt: 0,
      attackFlash: 0,

      totalDamage: 0,
      kills: 0,
      goldEarned: 0,

      // 실효 스탯 — recompute 가 채운다
      attack: 0, attackSpeed: 0, range: 0, critRate: 0, critDamage: 0
    };

    if (RPD.SkillManager) RPD.SkillManager.attach(unit);
    this.recompute(unit, 0);
    return unit;
  };

  /* 오라(주변/전체 공격력 증가)를 합산한다. 버퍼가 실제로 의미를 갖게 하는 부분. */
  function auraBonusFor(slotIndex) {
    var F = RPD.FieldManager;
    var self = F.get(slotIndex);
    if (!self) return 0;

    var bonus = 0;
    for (var i = 0; i < F.slots.length; i++) {
      var other = F.slots[i];
      if (!other.unit || i === slotIndex) continue;
      var d = other.unit.def;
      if (!d.auraAttack) continue;

      // 버퍼 역할 보정(roletuning.js) — 오라 세기 자체를 키운다
      var amt = d.auraAttack * (RPD.RoleTuning ? RPD.RoleTuning.aura(d.role) : 1);
      if (d.auraGlobal || isNeighbor(self, other)) bonus += amt;
    }
    return bonus;
  }

  /* 버퍼의 패시브 버프(auras.js) — 공격력 오라와 같은 이웃 규칙으로 모은다 */
  function auraExtrasFor(slotIndex) {
    var F = RPD.FieldManager;
    var self = F.get(slotIndex);
    var out = { attackSpeed: 0, critRate: 0, critDamage: 0, range: 0, cooldown: 0, armorPierce: 0, bossDamage: 0, from: [] };
    if (!self || !RPD.AuraData) return out;
    for (var i = 0; i < F.slots.length; i++) {
      var other = F.slots[i];
      if (!other.unit || i === slotIndex) continue;
      var a = RPD.AuraData.get(other.unit.def.id);
      if (!a || !isNeighbor(self, other)) continue;
      out.attackSpeed += a.attackSpeed || 0;
      out.critRate += a.critRate || 0;
      out.critDamage += a.critDamage || 0;
      out.range += a.range || 0;
      out.cooldown += a.cooldown || 0;
      out.armorPierce += a.armorPierce || 0;
      out.bossDamage += a.bossDamage || 0;
      out.from.push(other.unit.def.id);
    }
    var cap = RPD.AuraData.cap;
    ['attackSpeed', 'critRate', 'critDamage', 'range', 'cooldown', 'armorPierce', 'bossDamage'].forEach(function (k) {
      out[k] = Math.min(cap[k], out[k]);
    });
    return out;
  }
  UnitManager.auraExtrasFor = auraExtrasFor;

  // 4×4 격자에서 상하좌우·대각선으로 맞닿은 칸
  function isNeighbor(a, b) {
    return Math.abs(a.row - b.row) <= 1 && Math.abs(a.col - b.col) <= 1;
  }

  UnitManager.isNeighbor = isNeighbor;

  UnitManager.recompute = function (unit, auraBonus, extras) {
    var def = unit.def;
    var syn = RPD.SynergyManager.bonus;
    var dex = RPD.DexBonus ? RPD.DexBonus.totals() : { damage: 0, attackSpeed: 0, critRate: 0 };
    var atk = def.attack * (1 + dex.damage);   // 강화는 사거리를 올린다(아래) — 공격력은 골드 상점 몫
    // 골드 상점 — 타입별 · 등급별 판 전체 강화(개체를 갈아 넣어도 사라지지 않는다)
    if (RPD.GoldShopManager) atk *= RPD.GoldShopManager.attackMul(def);
    // 조합 난이도 보정 — 까다롭게 만든 것 · 히든은 더 세다(js/data/craftpower.js)
    if (RPD.CraftPower) atk *= RPD.CraftPower.mulOf(def);
    // 역할 보정 — 연쇄·광역 살짝 ↓, 단일·보스킬러 피해 ↑ (js/data/roletuning.js)
    if (RPD.RoleTuning) atk *= RPD.RoleTuning.attack(def.role);

    /* 스킬 버프와 전설 패시브는 실효 공격력에 곱한다 —
     * 스킬 피해도 unit.attack 을 쓰므로 버프가 스킬에도 그대로 실린다. */
    var SK = RPD.SkillManager;
    if (SK) atk *= SK.attackMul();

    // 에스퍼 시너지는 버프의 효과 자체를 키운다
    var aura = (auraBonus || 0) * syn.auraMul;

    unit.attack = atk * (1 + aura);
    unit.attackSpeed = def.attackSpeed * syn.attackSpeedMul * (1 + dex.attackSpeed) *
      (RPD.RoleTuning ? RPD.RoleTuning.speedOf(def) : 1);
    if (RPD.GoldShopManager) unit.attackSpeed *= RPD.GoldShopManager.speedMul(def);
    if (SK) unit.attackSpeed *= SK.speedMul();
    // 비행 타입은 스스로도 공격속도를 얻는다 (시너지와 별개)
    if (unit.typeFlags.FLYING) unit.attackSpeed *= RPD.TypeParams.attackSpeedMul;
    if (unit.typeFlags.FLYING) unit.attackSpeed *= syn.flyingAttackSpeedMul || 1;   // 비행에게만 붙는 시너지 몫

    // 강화 — 사거리. 전체 사거리(GLOBAL)는 늘릴 게 없어 강화 자체가 막혀 있다(EconomyManager.canUpgrade)
    unit.range = def.range >= RPD.Range.GLOBAL ? def.range
      : Math.round(def.range * (1 + unit.level * RPD.Config.upgradeRangeStep));
    unit.critRate = Math.min(0.95, (def.critRate || 0) + syn.critRateAdd + dex.critRate);
    unit.critDamage = (def.critDamage || 1.5) + syn.critDamageAdd +
                      (unit.typeFlags.DRAGON ? RPD.TypeParams.critDamageAdd : 0);
    unit.attackType = def.attackType || 'SINGLE';
    unit.splash = def.splash || 0;
    unit.pierce = def.pierce || 1;
    unit.chain = (def.chain || 0) + (def.attackType === 'CHAIN' ? syn.chainAdd : 0);
    unit.targeting = UnitManager.targetingOf(unit);
    unit.ignoreArmor = !!def.ignoreArmor;
    unit.auraBonus = aura;

    // 표시용 DPS. 실제 타격 계산과 같은 값을 쓰도록 여기서 직접 만든다.
    // 특성 중 항상 붙는 능력치(공격속도·사거리·치명타 피해)
    if (RPD.TraitManager) RPD.TraitManager.applyStats(unit);

    // 전설 패시브 — 용의기운(치명타 피해) · 축전(공격속도)
    if (RPD.SkillManager) {
      unit.critDamage += RPD.SkillManager.passive.teamCritDamageAdd || 0;
      unit.attackSpeed *= RPD.SkillManager.passive.teamAttackSpeedMul || 1;
    }

    // 옆 버퍼가 주는 패시브 버프
    unit.auraExtras = extras || null;
    unit.cooldownMul = 1;
    if (extras) {
      unit.attackSpeed *= (1 + extras.attackSpeed);
      unit.critRate = Math.min(0.95, unit.critRate + extras.critRate);
      unit.critDamage += extras.critDamage;
      if (unit.range < RPD.Range.GLOBAL) unit.range = Math.round(unit.range * (1 + (extras.range || 0)));
      unit.cooldownMul = 1 - (extras.cooldown || 0);
      // 방어 무시 · 보스 피해는 EnemyManager.damage 가 source.auraExtras 로 읽는다(기본 공격·스킬·특성 모두)
    }

    var expected = unit.attack * (1 + unit.critRate * (unit.critDamage - 1)) * unit.attackSpeed;
    if (unit.attackType === 'SPLASH') expected *= 1.6;
    else if (unit.attackType === 'PIERCE') expected *= Math.min(unit.pierce, 2.2);
    else if (unit.attackType === 'CHAIN') expected *= 1 + unit.chain * 0.45;
    unit.dps = expected;
  };

  /* ---------- 공격 대상 선택 (세션 42) ----------
   * 우선순위: 개체에 고른 것 > "전체 적용"으로 고른 것(판 동안, 새로 뽑은 개체에도) > 종 기본값.
   * 보스를 쳐야 할 때 잡몹을 먼저 치는 개체를 사람이 바로잡을 수 있게. 스킬도 같은 선택을 따른다(SkillManager). */
  UnitManager.TARGET_MODES = ['FIRST', 'BOSS', 'STRONGEST', 'WEAKEST', 'LAST'];

  UnitManager.targetingOf = function (unit) {
    var all = RPD.GameManager && RPD.GameManager.targetAll;
    return unit.targetChoice || all || (unit.def && unit.def.targeting) || 'FIRST';
  };

  function applyTargeting(unit) {
    unit.targeting = UnitManager.targetingOf(unit);
    unit.target = null;          // 바로 다시 고르게
    unit.targetCheckAt = 0;
  }

  /* mode 가 null 이면 이 개체의 선택을 지우고 전체 설정 · 종 기본값으로 돌아간다 */
  UnitManager.setTargeting = function (unit, mode) {
    if (!unit || (mode != null && UnitManager.TARGET_MODES.indexOf(mode) < 0)) return false;
    unit.targetChoice = mode || null;
    applyTargeting(unit);
    RPD.bus.emit('unit:targeting', { unit: unit, mode: unit.targeting });
    return true;
  };

  UnitManager.cycleTargeting = function (unit) {
    if (!unit) return false;
    var M = UnitManager.TARGET_MODES;
    return UnitManager.setTargeting(unit, M[(M.indexOf(unit.targeting) + 1) % M.length]);
  };

  /* 필드 · 창고의 모든 개체와 앞으로 뽑을 개체에 한꺼번에. 개체별 선택은 지운다. */
  UnitManager.setTargetingAll = function (mode) {
    if (mode != null && UnitManager.TARGET_MODES.indexOf(mode) < 0) return false;
    RPD.GameManager.targetAll = mode || null;
    var units = RPD.FieldManager.getUnits().concat(RPD.StorageManager ? RPD.StorageManager.units : []);
    units.forEach(function (u) { u.targetChoice = null; applyTargeting(u); });
    RPD.bus.emit('unit:targeting', { all: true, mode: mode || null });
    return true;
  };

  UnitManager.recomputeAll = function () {
    var F = RPD.FieldManager;
    // 시너지를 먼저 센다. 순서를 이벤트 구독 순서에 맡기면 조용히 한 프레임 어긋난다.
    RPD.SynergyManager.recompute();
    for (var i = 0; i < F.slots.length; i++) {
      var slot = F.slots[i];
      if (!slot.unit) continue;
      UnitManager.recompute(slot.unit, auraBonusFor(i), auraExtrasFor(i));
    }
    RPD.bus.emit('units:recomputed');
  };

  UnitManager.init = function () {
    RPD.bus.on('field:changed', function () { UnitManager.recomputeAll(); });
  };

  /* 결과 화면용 — 이번 판 최고 피해 포켓몬 */
  UnitManager.topDamage = function () {
    var best = null;
    var units = RPD.FieldManager.getUnits();
    for (var i = 0; i < units.length; i++) {
      if (!best || units[i].totalDamage > best.totalDamage) best = units[i];
    }
    return best;
  };

  RPD.UnitManager = UnitManager;
})(typeof window !== 'undefined' ? window : globalThis);
