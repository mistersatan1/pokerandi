/* specialrules.js — 특수 런 규칙(세션 99).
 *
 * 일반 모드(난이도 아무거나) 위에 얹는 규칙. 여러 개를 함께 켤 수 있다. 판을 시작할 때 고르고, 판 도중엔 못 바꾼다.
 * 켠 규칙은 RPD.effectiveMode 가 modifiers 에 합친다 — 규칙을 읽는 곳은 아래 mods 주석에 적었다.
 * 특수 런 기록은 일반 기록과 따로 남는다(recordKey 'SPECIAL:규칙+규칙:난이도'). 클리어 횟수(칭호)는 센다.
 *
 * ┌─ 고치는 법 ─────────────────────────────────────────────────────────┐
 * │ id: 저장 · 기록 키(바꾸면 지난 기록과 갈라진다) · icon · name · desc(화면에 그대로) │
 * │ tone: 'hard' 어려워짐 · 'easy' 쉬워짐 · 'mix' 판이 달라짐 — 고르는 화면의 색        │
 * │ mods: 이 규칙이 켜면 더하는 모드 보정                                          │
 * └────────────────────────────────────────────────────────────────────┘
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  var LIST = [
    {
      id: 'fireOnly', icon: '🔥', name: '불꽃만 사용', tone: 'hard',
      desc: '전투 칸에는 불꽃 타입만 설 수 있다(응원 칸은 그대로). 소환은 불꽃 포켓몬과 그 조합 재료만 나오고 불꽃 타입이 더 자주 나온다. 대신 불꽃 공격력 ×3 · 70R 마지막 보스 체력 ×0.3.',
      /* fieldType     FieldManager.canPlace — 전투 칸에 이 타입이 아니면 'TYPE_RULE'
       * summonTree    SpecialRunManager.tree — 소환 · 라운드 지급 · 보스 보상 종을 이 타입 계열(그 타입 + 조합 재료 전부)로 좁힌다
       * treeTypeWeight SummonManager.speciesWeights — 계열 안에서 그 타입 종의 가중치
       * typeDamageMul UnitManager.recompute — 그 타입 공격력. 칸이 반 넘게 비는 판(필드 평균 8 → 14~16마리)을 메운다
       * finalBossHpMul WaveData — 70R 마지막 보스(노멀 0.2227 × 0.3). 불꽃은 화상 · 광역 위주라 단일 보스에 약하다
       * 세션 99 측정(노멀 80판씩 · 정예 판단 봇 · 도감 0): 보정 없음 0% · 중앙 20R. 공격력 ×2 · ×3 · ×4 → 0% (×4 도 70R 도달 21판이
       *   전부 마지막 보스에서 짐). ×3 + 보스 ×0.5 → 1% · ×3 + 보스 ×0.3 → 7.5% · 중앙 40R(규칙 없음 15% · 중앙 64R) — 이 값 */
      mods: { fieldType: 'FIRE', summonTree: 'FIRE', treeTypeWeight: 3, typeDamageMul: { FIRE: 3 }, finalBossHpMul: RPD.Modes.NORMAL.modifiers.finalBossHpMul * 0.3 }
    },
    {
      id: 'cost2', icon: '💰', name: '소환 비용 2배', tone: 'hard',
      desc: '소환 한 번에 드는 골드가 두 배. 방출 환급도 들인 만큼(절반)이라 같이 오른다.',
      /* 세션 99 측정(80판씩): 클리어 1% · 중앙 46R · 판당 소환 190 → 68회(규칙 없음 15% · 중앙 64R). 요청대로 2배 그대로 — 보정 없음 */
      mods: { summonCostMul: 2 }              // EconomyManager.summonCost
    },
    {
      id: 'shuffle', icon: '🎲', name: '조합식 랜덤', tone: 'mix',
      desc: '판마다 조합식 재료가 같은 등급끼리 뒤섞인다(결과 · 등급 · 재료 수는 그대로). 히든 재료와 주문은 그대로.',
      /* 세션 99 측정(80판씩): 클리어 14% · 중앙 64R(규칙 없음 15%). 봇은 조합식을 데이터로 읽어 안 흔들린다 — 사람은 외운 길이 막혀 더 어렵다 */
      mods: { recipeShuffle: true }           // SpecialRunManager.applyShuffle — RecipeData 재료를 판 시드로 섞는다
    },
    {
      id: 'lucky', icon: '🍀', name: '높은 등급 확률 증가', tone: 'mix',
      desc: '소환에서 안흔함 ×1.3 · 특별함 ×1.8, 흔함 최소 비중 50% → 35%. 희귀함 · 전설은 지금처럼 조합으로만 얻는다.',
      /* 세션 99 측정(80판씩): 클리어 10% · 흔함 바닥 0.42 → 10% · 0.5 → 11%(규칙 없음 15%) — 잡음 안에서 쉬워지지 않는다.
       * 후반은 61R 벽 · 조합 전설이 가르고, 흔함이 줄면 재료가 모자라 판이 빨라지지 않는다. 그래서 tone 'mix'(쉬움 표시 안 함) */
      mods: { summonTierMul: { T2: 1.3, T3: 1.8 }, minCommonShare: 0.35 }   // SummonTable.weightsFor · SummonManager.currentWeights
    }
  ];

  var byId = {};
  LIST.forEach(function (r) { byId[r.id] = r; });

  RPD.SpecialRules = {
    list: LIST,
    get: function (id) { return byId[id] || null; },
    /* 알려진 규칙만 · 목록 순서대로 · 중복 없이 */
    normalize: function (ids) {
      if (!ids || !ids.length) return [];
      return LIST.filter(function (r) { return ids.indexOf(r.id) >= 0; }).map(function (r) { return r.id; });
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
