/* dexbonus.js — 도감 영구 버프.
 *
 * 도감은 판을 넘는 성장이고, 실력은 한 판의 승패다. 그 경계를 지킨다.
 * 100% 채운 사람이 약간 유리하되, 신규 플레이어도 충분히 클리어할 수 있어야 한다.
 *
 * 총합 상한: 전투력 기준 +8% 이내.
 * 실측 기준으로 배치를 잘 잡으면 커버리지가 최대 5배 차이 난다.
 * 도감 버프가 그보다 크면 "도감이 부족하면 절대 못 이김"이 된다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  /* 세션 97 — 10 · 20 · 40 · 60 · 100 · 151 이정표 사이를 잘게(21단계). 전투 보너스는 상한(+8%) 안에서 조금씩만 더하고,
   * 나머지는 편의 · 경제(창고 칸 · 시작 골드 · 조각 · 소환권 · 골드 획득)로 채운다 — "도감이 부족하면 못 이김"이 되지 않게.
   * 창고는 기본 48칸(Config.storageBase) + 도감 +4 × 6 = 최대 72칸. */
  var STEPS = [
    { at: 5,   key: 'startGold',    value: 20,   label: '시작 골드 +20' },
    { at: 10,  key: 'damage',       value: 0.01, label: '전체 피해 +1%' },
    { at: 15,  key: 'storage',      value: 4,    label: '창고 +4칸' },
    { at: 20,  key: 'attackSpeed',  value: 0.01, label: '공격속도 +1%' },
    { at: 25,  key: 'startShards',  value: 5,    label: '시작 조각 +5' },
    { at: 30,  key: 'gold',         value: 0.02, label: '골드 획득 +2%' },
    { at: 35,  key: 'storage',      value: 4,    label: '창고 +4칸' },
    { at: 40,  key: 'critRate',     value: 0.01, label: '치명타율 +1%p' },
    { at: 45,  key: 'startTickets', value: 1,    label: '시작 소환권 +1' },
    { at: 50,  key: 'startGold',    value: 40,   label: '시작 골드 +40' },
    { at: 55,  key: 'damage',       value: 0.02, label: '전체 피해 +2%' },
    { at: 60,  key: 'storage',      value: 4,    label: '창고 +4칸' },
    { at: 70,  key: 'gold',         value: 0.02, label: '골드 획득 +2%' },
    { at: 80,  key: 'startShards',  value: 10,   label: '시작 조각 +10' },
    { at: 90,  key: 'storage',      value: 4,    label: '창고 +4칸' },
    { at: 100, key: 'damage',       value: 0.01, label: '전체 피해 +1%' },
    { at: 110, key: 'startTickets', value: 1,    label: '시작 소환권 +1' },
    { at: 120, key: 'storage',      value: 4,    label: '창고 +4칸' },
    { at: 130, key: 'gold',         value: 0.02, label: '골드 획득 +2%' },
    { at: 140, key: 'attackSpeed',  value: 0.01, label: '공격속도 +1%' },
    { at: 151, key: 'storage',      value: 4,    label: '창고 +4칸' }
  ];

  /* 화면용 — 같은 종류를 합쳐 "전체 피해 +4%" 처럼 한 줄씩 */
  var KIND = {
    damage:       { name: '전체 피해',  fmt: function (v) { return '+' + Math.round(v * 100) + '%'; } },
    attackSpeed:  { name: '공격속도',   fmt: function (v) { return '+' + Math.round(v * 100) + '%'; } },
    critRate:     { name: '치명타율',   fmt: function (v) { return '+' + Math.round(v * 100) + '%p'; } },
    gold:         { name: '골드 획득',  fmt: function (v) { return '+' + Math.round(v * 100) + '%'; } },
    startGold:    { name: '시작 골드',  fmt: function (v) { return '+' + v; } },
    startShards:  { name: '시작 조각',  fmt: function (v) { return '+' + v; } },
    startTickets: { name: '시작 소환권', fmt: function (v) { return '+' + v; } },
    storage:      { name: '창고',       fmt: function (v) { return '+' + v + '칸'; } }
  };

  var DexBonus = { steps: STEPS };

  DexBonus.activeFor = function (count) {
    return STEPS.filter(function (s) { return count >= s.at; });
  };

  DexBonus.nextFor = function (count) {
    for (var i = 0; i < STEPS.length; i++) if (count < STEPS[i].at) return STEPS[i];
    return null;
  };

  /* 지금 적용되는 보너스 합계. 전투·경제가 이 값만 읽는다. */
  DexBonus.totals = function (count) {
    var t = { damage: 0, attackSpeed: 0, gold: 0, critRate: 0, startGold: 0, startShards: 0, startTickets: 0, storage: 0 };
    var on = this.activeFor(count === undefined ? currentCount() : count);
    for (var i = 0; i < on.length; i++) t[on[i].key] += on[i].value;
    return t;
  };

  /* 지금 받는 보너스를 종류별 한 줄로 [{ name, value }] — 도감 창 · 도감 미니 패널 */
  DexBonus.summary = function (count) {
    var t = this.totals(count), out = [];
    Object.keys(KIND).forEach(function (k) { if (t[k]) out.push({ key: k, name: KIND[k].name, value: KIND[k].fmt(t[k]) }); });
    return out;
  };

  function currentCount() {
    return RPD.SaveManager ? RPD.SaveManager.dexCount() : 0;
  }

  /* 전투력 환산 총 이득 — 상한을 지키는지 테스트가 검사한다 */
  DexBonus.powerGain = function (count) {
    var t = this.totals(count);
    return (1 + t.damage) * (1 + t.attackSpeed) * (1 + t.critRate * 1.5) - 1;
  };

  RPD.DexBonus = DexBonus;
})(typeof window !== 'undefined' ? window : globalThis);
