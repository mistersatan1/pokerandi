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

  var STEPS = [
    { at: 10, key: 'damage',      value: 0.01, label: '전체 피해 +1%' },
    { at: 20, key: 'attackSpeed', value: 0.01, label: '공격속도 +1%' },
    { at: 30, key: 'gold',        value: 0.02, label: '골드 획득 +2%' },
    { at: 40, key: 'critRate',    value: 0.01, label: '치명타율 +1%p' },
    { at: 50, key: 'startGold',   value: 40,   label: '시작 골드 +40' },
    { at: 55, key: 'damage',      value: 0.02, label: '전체 피해 +2%' }
  ];

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
    var t = { damage: 0, attackSpeed: 0, gold: 0, critRate: 0, startGold: 0 };
    var on = this.activeFor(count === undefined ? currentCount() : count);
    for (var i = 0; i < on.length; i++) t[on[i].key] += on[i].value;
    return t;
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
