/* GoldShopManager.js — 골드 상점: 타입별 · 등급별 업그레이드 (세션 33 ③).
 *
 * 한 판 동안만 유지되는 "판 전체" 강화다. 개체 하나를 올리는 [강화](EconomyManager.upgrade)와 다르다 —
 * 여기서 올린 레벨은 지금 필드에 있는 개체뿐 아니라 **앞으로 뽑거나 만들 개체에도** 붙는다.
 * 그래서 조합 재료로 갈아 넣어도 날아가지 않는다(개체 강화의 가장 큰 약점이던 부분).
 *
 * 두 갈래
 *   타입  — 불꽃·물·… 타입마다 레벨. 그 타입을 가진 개체의 공격력이 오른다.
 *           두 타입을 가진 개체는 **둘 중 높은 레벨 하나만** 받는다(두 번 받으면 이중 타입만 두 배로 세진다).
 *   등급  — 흔함·안흔함·특별함·희귀함·전설, 히든, 불멸·초월.
 *           **히든 개체는 자기 강함 등급(안흔함~전설) 대신 "히든" 칸만 받는다** — 조합식 목록에서
 *           히든을 한 칸으로 모은 것과 같은 규칙. 불멸과 초월은 한 칸을 같이 쓴다.
 *
 * 한 레벨이 공격력과 공격속도를 같이 올린다(세션 37). 끝까지 올렸을 때의 곱은 예전 "공격력만"과 거의 같게 나눴다
 *   타입 +5% → 공격력 +2.5% · 공속 +2%   (최대 1.25 × 1.20 = 1.50, 예전 1.50)
 *   등급 +6% → 공격력 +3% · 공속 +2.5%   (최대 1.30 × 1.25 = 1.625, 예전 1.60)
 * 배율 = (1 + 타입 보너스) × (1 + 등급 보너스) — 공격력 · 공격속도 따로. 개체 강화·시너지·스킬 버프와는 곱으로 쌓인다.
 * 수치는 첫 패스다 — 요청 ④(정예 소환)로 골드 수급이 늘면 가격을 다시 본다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  /* ---------- 설정 ---------- */
  var CFG = {
    maxLevel: 10,
    typeStep: 0.025,         // 타입 1레벨당 공격력 +2.5% (최대 +25%)
    typeSpeedStep: 0.02,     //            공격속도 +2%  (최대 +20%)
    tierStep: 0.03,          // 등급 1레벨당 공격력 +3%   (최대 +30%)
    tierSpeedStep: 0.025,    //            공격속도 +2.5% (최대 +25%)
    typeBaseCost: 60,
    costGrowth: 1.4,         // 레벨이 오를수록 이만큼씩 비싸진다
    /* 등급 칸 1레벨 가격. 높은 등급일수록 개체 하나가 버는 몫이 크니 비싸다.
     * 흔함은 싸게 둔다 — 초반에 소환 말고 할 게 없는 공백을 메운다. */
    tierBaseCost: { T1: 40, T2: 60, T3: 90, T4: 130, T5: 180, HIDDEN: 110, SPECIAL: 250 }
  };

  /* 등급 칸 — 순서가 곧 화면 순서다 */
  var TIER_SLOTS = [
    { id: 'T1', label: '흔함' },
    { id: 'T2', label: '안흔함' },
    { id: 'T3', label: '특별함' },
    { id: 'T4', label: '희귀함' },
    { id: 'T5', label: '전설' },
    { id: 'HIDDEN', label: '🔒 히든', color: '#2ee6c6' },
    { id: 'SPECIAL', label: '불멸 · 초월' }
  ];

  var GoldShopManager = { CFG: CFG, TIER_SLOTS: TIER_SLOTS, typeLv: {}, tierLv: {} };

  GoldShopManager.reset = function () {
    this.typeLv = {};
    this.tierLv = {};
    RPD.bus.emit('goldshop:changed', {});
  };

  GoldShopManager.init = function () {
    var self = this;
    RPD.bus.on('game:reset', function () { self.reset(); });
    this.reset();
  };

  /* 실제로 포켓몬이 있는 타입만 판다(강철·악처럼 1세대에 없는 타입은 빼고) */
  GoldShopManager.types = function () {
    var seen = {};
    RPD.PokemonData.list.forEach(function (d) { (d.types || []).forEach(function (t) { seen[t] = true; }); });
    return Object.keys(RPD.Types).filter(function (t) { return seen[t]; });
  };

  /* 개체가 받는 등급 칸 */
  GoldShopManager.tierSlotOf = function (def) {
    if (!def) return null;
    if (def.tier === 'T6' || def.tier === 'T7') return 'SPECIAL';
    if (def.hidden) return 'HIDDEN';
    return def.tier;
  };

  function levelOf(map, key) { return map[key] || 0; }

  GoldShopManager.typeLevel = function (type) { return levelOf(this.typeLv, type); };
  GoldShopManager.tierLevel = function (slot) { return levelOf(this.tierLv, slot); };

  /* 이 개체가 받는 타입 레벨 — 두 타입이면 높은 쪽 하나 */
  GoldShopManager.typeLevelOf = function (def) {
    var best = 0, self = this;
    (def && def.types || []).forEach(function (t) { best = Math.max(best, self.typeLevel(t)); });
    return best;
  };
  GoldShopManager.tierLevelOf = function (def) { return this.tierLevel(this.tierSlotOf(def)); };

  GoldShopManager.typeBonus = function (def) { return this.typeLevelOf(def) * CFG.typeStep; };
  GoldShopManager.tierBonus = function (def) { return this.tierLevelOf(def) * CFG.tierStep; };
  GoldShopManager.typeSpeedBonus = function (def) { return this.typeLevelOf(def) * CFG.typeSpeedStep; };
  GoldShopManager.tierSpeedBonus = function (def) { return this.tierLevelOf(def) * CFG.tierSpeedStep; };

  /* UnitManager.recompute 가 공격력 · 공격속도에 곱한다 */
  GoldShopManager.attackMul = function (def) {
    return (1 + this.typeBonus(def)) * (1 + this.tierBonus(def));
  };
  GoldShopManager.speedMul = function (def) {
    return (1 + this.typeSpeedBonus(def)) * (1 + this.tierSpeedBonus(def));
  };

  /* ---------- 가격 · 구매 ---------- */

  GoldShopManager.cost = function (kind, key) {
    var lv = kind === 'type' ? this.typeLevel(key) : this.tierLevel(key);
    var base = kind === 'type' ? CFG.typeBaseCost : CFG.tierBaseCost[key];
    if (base == null) return null;
    return Math.round(base * Math.pow(CFG.costGrowth, lv));
  };

  GoldShopManager.check = function (kind, key) {
    var GM = RPD.GameManager;
    if (kind === 'type' && !RPD.Types[key]) return { ok: false, reason: 'NO_SUCH' };
    if (kind === 'tier' && CFG.tierBaseCost[key] == null) return { ok: false, reason: 'NO_SUCH' };
    var lv = kind === 'type' ? this.typeLevel(key) : this.tierLevel(key);
    if (lv >= CFG.maxLevel) return { ok: false, reason: 'MAX_LEVEL', level: lv };
    var price = this.cost(kind, key);
    if (!GM.isPlayable || !GM.isPlayable()) return { ok: false, reason: 'NOT_PLAYING', price: price, level: lv };
    if (GM.gold < price) return { ok: false, reason: 'NO_GOLD', price: price, level: lv };
    return { ok: true, price: price, level: lv };
  };

  GoldShopManager.buy = function (kind, key) {
    var c = this.check(kind, key);
    if (!c.ok) return c;
    if (!RPD.GameManager.spendGold(c.price, 'goldshop')) return { ok: false, reason: 'NO_GOLD', price: c.price };
    var map = kind === 'type' ? this.typeLv : this.tierLv;
    map[key] = (map[key] || 0) + 1;
    RPD.UnitManager.recomputeAll();
    RPD.bus.emit('goldshop:bought', { kind: kind, key: key, level: map[key], price: c.price });
    RPD.bus.emit('goldshop:changed', {});
    return { ok: true, kind: kind, key: key, level: map[key], price: c.price };
  };

  /* 지금 필드에 있는 개체 중 이 칸의 혜택을 받는 수 — 화면에서 "지금 사면 몇 마리가 세진다" */
  GoldShopManager.affected = function (kind, key) {
    var self = this, n = 0;
    RPD.FieldManager.getUnits().forEach(function (u) {
      if (kind === 'type' ? (u.def.types || []).indexOf(key) >= 0 : self.tierSlotOf(u.def) === key) n += 1;
    });
    return n;
  };

  RPD.GoldShopManager = GoldShopManager;
})(typeof window !== 'undefined' ? window : globalThis);
