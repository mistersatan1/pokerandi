/* types.js — 타입 정의.
 * 원작 상성표는 쓰지 않는다. 디펜스에 필요한 "하나의 기계적 효과"만 타입마다 부여한다.
 * effect 는 PHASE 10 에서 CombatManager 가 읽어 실제로 적용한다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  RPD.Types = {
    NORMAL:   { id: 'NORMAL',   label: '노말',   color: '#a8a89a', effect: null,          desc: '고유 효과 없음. 대신 기본 스탯이 높다.' },
    FIRE:     { id: 'FIRE',     label: '불꽃',   color: '#e0623c', effect: 'burn',        desc: '화상 — 3초간 공격력 30% 지속 피해.' },
    WATER:    { id: 'WATER',    label: '물',     color: '#4d8fd6', effect: 'slow',        desc: '슬로우 — 이동속도 25% 감소.' },
    GRASS:    { id: 'GRASS',    label: '풀',     color: '#6fb254', effect: 'goldBonus',   desc: '처치 시 추가 골드.' },
    ELECTRIC: { id: 'ELECTRIC', label: '전기',   color: '#e8c341', effect: 'chain',       desc: '연쇄 — 인접 적에게 50% 피해 전이.' },
    ICE:      { id: 'ICE',      label: '얼음',   color: '#7fd4d8', effect: 'freeze',      desc: '빙결 — 15% 확률로 1.2초 정지.' },
    FIGHTING: { id: 'FIGHTING', label: '격투',   color: '#c05a3e', effect: 'bossDamage',  desc: '보스·정예에게 +40% 피해.' },
    POISON:   { id: 'POISON',   label: '독',     color: '#a05fb0', effect: 'poison',      desc: '중첩 독 — 최대 5스택.' },
    GROUND:   { id: 'GROUND',   label: '땅',     color: '#c8a45c', effect: 'splash',      desc: '착탄 지점 광역 피해.' },
    FLYING:   { id: 'FLYING',   label: '비행',   color: '#8fa8dd', effect: 'attackSpeed', desc: '공격속도 증가.' },
    PSYCHIC:  { id: 'PSYCHIC',  label: '에스퍼', color: '#e06a8c', effect: 'cooldown',    desc: '아군 스킬 쿨다운 감소.' },
    BUG:      { id: 'BUG',      label: '벌레',   color: '#9ab040', effect: 'cheapSummon', desc: '소환 비용 할인.' },
    ROCK:     { id: 'ROCK',     label: '바위',   color: '#b09a5e', effect: 'stun',        desc: '기절 확률.' },
    GHOST:    { id: 'GHOST',    label: '고스트', color: '#7a63b0', effect: 'ignoreArmor', desc: '적 방어력 무시.' },
    DRAGON:   { id: 'DRAGON',   label: '드래곤', color: '#6a52d8', effect: 'critDamage',  desc: '치명타 피해 +60%.' },
    DARK:     { id: 'DARK',     label: '악',     color: '#6b5a4e', effect: 'execute',     desc: '체력 25% 이하 적 처형.' },
    STEEL:    { id: 'STEEL',    label: '강철',   color: '#a0a8b8', effect: 'armorBreak',  desc: '적 방어력 감소.' },
    FAIRY:    { id: 'FAIRY',    label: '페어리', color: '#e8a0c8', effect: 'shield',      desc: '라이프 보호막.' }
  };

  /* 타입 기본 효과의 수치. 개체 데이터(slowMul 등)가 있으면 그쪽이 우선한다.
   * 여기 값은 "그 타입이면 최소한 이만큼은 한다"는 바닥선이다. */
  RPD.TypeParams = {
    burnRatio: 0.30,        // 타격 피해의 30%를 3초에 걸쳐
    burnDuration: 3,
    poisonRatio: 0.14,      // 중첩되는 대신 한 스택이 약하다
    poisonDuration: 4,
    poisonMaxStacks: 5,
    slowMul: 0.78,
    slowDuration: 1.6,
    freezeChance: 0.12,
    freezeDuration: 1.0,
    stunChance: 0.08,
    stunDuration: 0.6,
    bossDamageMul: 1.40,
    critDamageAdd: 0.6,
    armorShred: 10,
    armorShredDuration: 3,
    executeThreshold: 0.18, // 체력 18% 이하면 즉사
    goldPerKill: 1,
    attackSpeedMul: 1.10,
    summonDiscount: 0.10
  };

  /* 시너지: 같은 타입을 보유한 수에 따른 팀 전체 보너스.
   * tiers 는 오름차순. SynergyManager 가 보유 수 이하의 최대 단계를 적용한다.
   * bonus 의 키는 SynergyManager.bonus 가 그대로 들고 있는 이름과 같다.
   */
  /* 시너지 — 10종만 둔다.
   *
   * v1 은 17종이었는데 30판 측정에서 6종이 한 번도 안 켜졌다. 표에만 있고
   * 플레이어가 영영 못 보는 규칙은 없는 것보다 나쁘다. 화면만 복잡해진다.
   * 남긴 10종은 전부 현재 로스터로 최고 단계까지 도달 가능하다.
   *
   * 시너지를 뺀 타입도 고유 효과(빙결·독·기절·처형·방어감소)는 그대로 남는다.
   * 없어진 것은 "여러 마리 모았을 때의 추가 보너스"뿐이다.
   */
  RPD.Synergies = {
    FIRE: [
      { count: 2, label: '화상 피해 +40%', bonus: { burnMul: 1.4 } },
      { count: 4, label: '화상 피해 +100%', bonus: { burnMul: 2.0 } }
    ],
    WATER: [
      { count: 2, label: '감속 +10%p', bonus: { slowAdd: 0.10 } },
      { count: 4, label: '감속 +22%p · 지속 +0.8초', bonus: { slowAdd: 0.22, slowDurationAdd: 0.8 } }
    ],
    ELECTRIC: [
      { count: 2, label: '연쇄 대상 +1', bonus: { chainAdd: 1 } },
      { count: 4, label: '연쇄 대상 +2 · 감쇠 완화', bonus: { chainAdd: 2, chainDecayAdd: 0.2 } }
    ],
    GROUND: [
      { count: 2, label: '광역 반경 +25%', bonus: { splashRadiusMul: 1.25 } },
      { count: 4, label: '광역 반경 +55% · 부수 피해 +25%', bonus: { splashRadiusMul: 1.55, splashDamageAdd: 0.25 } }
    ],
    FLYING: [
      { count: 2, label: '공격속도 +12%', bonus: { attackSpeedMul: 1.12 } },
      { count: 4, label: '공격속도 +26%', bonus: { attackSpeedMul: 1.26 } },
      { count: 6, label: '공격속도 +42%', bonus: { attackSpeedMul: 1.42 } }
    ],
    FIGHTING: [
      { count: 2, label: '보스 피해 +20%', bonus: { bossDamageAdd: 0.20 } },
      { count: 4, label: '보스 피해 +45%', bonus: { bossDamageAdd: 0.45 } }
    ],
    GRASS: [
      { count: 2, label: '골드 획득 +15%', bonus: { goldMul: 1.15 } },
      { count: 3, label: '골드 획득 +32%', bonus: { goldMul: 1.32 } }
    ],

    /* 아래 넷은 로스터에 개체가 가장 많은데도 시너지가 없던 타입이다.
     * 독 21종 · 노말 11종 · 벌레 10종 · 페어리 4종 — 뽑히는 족족 "시너지 없음"이었다.
     * 효과는 각 타입의 고유 효과(TypeParams)와 같은 축을 키운다. */
    POISON: [
      { count: 3, label: '독 피해 +25%',            bonus: { poisonMul: 1.25 } },
      { count: 6, label: '독 피해 +55% · 최대 6스택', bonus: { poisonMul: 1.55, poisonStackAdd: 1 } },
      { count: 9, label: '독 피해 +95% · 최대 7스택', bonus: { poisonMul: 1.95, poisonStackAdd: 2 } }
    ],
    BUG: [
      { count: 2, label: '소환 비용 -10%', bonus: { summonCostMul: 0.90 } },
      { count: 4, label: '소환 비용 -20%', bonus: { summonCostMul: 0.80 } },
      { count: 6, label: '소환 비용 -32%', bonus: { summonCostMul: 0.68 } }
    ],
    NORMAL: [
      { count: 3, label: '치명타율 +10%',              bonus: { critRateAdd: 0.10 } },
      { count: 6, label: '치명타율 +20% · 피해 +25%',   bonus: { critRateAdd: 0.20, critDamageAdd: 0.25 } },
      { count: 9, label: '치명타율 +32% · 피해 +50%',   bonus: { critRateAdd: 0.32, critDamageAdd: 0.50 } }
    ],
    /* 1세대 확장으로 개체가 생긴 타입 — 에스퍼·고스트·드래곤은 되살리고 바위·얼음·강철을 새로 둔다. */
    PSYCHIC: [
      { count: 2, label: '방어 무시 20%', bonus: { armorPierceRatio: 0.20 } },
      { count: 4, label: '방어 무시 40%', bonus: { armorPierceRatio: 0.40 } },
      { count: 6, label: '방어 무시 60%', bonus: { armorPierceRatio: 0.60 } }
    ],
    ROCK: [
      { count: 2, label: '광역 피해 +15%', bonus: { splashDamageAdd: 0.15 } },
      { count: 4, label: '광역 피해 +35%', bonus: { splashDamageAdd: 0.35 } }
    ],
    ICE: [
      { count: 2, label: '빙결 확률 +5%', bonus: { freezeChanceAdd: 0.05 } },
      { count: 4, label: '빙결 확률 +10% · 빙결 +0.5초', bonus: { freezeChanceAdd: 0.10, freezeDurationAdd: 0.5 } }
    ],
    GHOST: [
      { count: 2, label: '체력 8% 이하 즉사', bonus: { executeAdd: 0.08 } },
      { count: 3, label: '체력 14% 이하 즉사', bonus: { executeAdd: 0.14 } }
    ],
    DRAGON: [
      { count: 2, label: '치명타 피해 +40%', bonus: { critDamageAdd: 0.40 } },
      { count: 3, label: '치명타 피해 +80%', bonus: { critDamageAdd: 0.80 } }
    ],
    STEEL: [
      { count: 2, label: '방어력 깎기 +20', bonus: { armorShredAdd: 20 } }
    ],
    FAIRY: [
      { count: 2, label: '버프 효과 +30%',           bonus: { auraMul: 1.30 } },
      { count: 4, label: '버프 효과 +60% · 라이프 보호막', bonus: { auraMul: 1.60, lifeShield: 10 } }
    ]
  };


})(typeof window !== 'undefined' ? window : globalThis);
