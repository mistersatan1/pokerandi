/* traits.js — 일부 포켓몬만 갖는 특성.
 *
 * ┌─ 특성 추가·수정하는 법 ─────────────────────────────────────────┐
 * │ 포켓몬 id 를 키로 한 줄씩 적는다. 없는 포켓몬은 특성이 없다.        │
 * │   pikachu: { icon: '⚡', name: '감전', desc: '...', 효과 칸들 }    │
 * │ 효과는 아래 "종류" 네 가지 중 하나를 고르고 숫자만 바꾸면 된다.     │
 * │ desc 는 화면에 그대로 나오는 설명이다 — 숫자를 바꾸면 같이 고친다.  │
 * │ 저장하고 새로고침하면 반영. 확인: node tools/uicheck.js            │
 * └──────────────────────────────────────────────────────────────┘
 *
 * 종류(kind) — 공격할 때 굴리는 것은 "공격 한 번에 한 번"만 굴린다
 *   chainOnAttack       chance 확률로 대상 주변 count 마리에게 번개 (radius, 피해 공격력×damageMul)
 *   dazeInsteadOfAttack chance 확률로 공격 대신 자기 주변 radius 안 적을 duration 초 slowMul 배 속도로
 *   bonusGoldOnKill     이 포켓몬이 잡으면 chance 확률로 골드 gold + 라운드×goldPerWave
 *   poisonOnAttack      chance 확률로 독(보통 독의 poisonMul 배). radius 를 주면 대상 주변 전부에게
 *   burnOnAttack        chance 확률로 화상(보통 화상의 burnMul 배)
 *   stunOnAttack        chance 확률로 대상을 duration 초 멈춘다(잠재우기·기절, 보스는 안 멈춘다)
 *   slowOnAttack        chance 확률로 대상을 duration 초 slowMul 배 속도로
 *   knockbackOnAttack   chance 확률로 대상을 경로 뒤로 push 만큼 밀어낸다(보스는 안 밀린다)
 *   extraAttackOnAttack chance 확률로 같은 대상을 한 번 더 공격한다
 *   bonusDamageOnAttack chance 확률로 피해 mul 배. when: 'always' | 'boss'(보스에게만) | 'lowHp'(체력 lowHpRatio 이하)
 *   randomOnAttack      chance 확률로 감속·독·연쇄 중 하나가 무작위로 터진다
 *   goldOnWave          필드에 있으면 라운드가 시작될 때마다 골드 gold
 *   armorBreakOnAttack  chance 확률로 대상 방어력을 armor 만큼 깎는다
 *   statBonus           항상 붙는 능력치: attackSpeedMul · rangeMul · critDamageAdd · critRateAdd
 *
 * 특성은 전투 규칙에 얹히는 작은 보너스다. 스킬(희귀함부터)처럼 판을 뒤집는 힘이 아니다.
 * 확률을 크게 올리면 특별함 한 마리가 희귀함보다 강해질 수 있으니 조심한다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  var TRAITS = {
    /* ================= 특별함 — 전부 (기존) ================= */
    pikachu: {
      icon: '⚡', name: '감전',
      desc: '공격 시 5% 확률로 주변 적에게 연쇄.',
      kind: 'chainOnAttack', chance: 0.05, count: 3, radius: 120, damageMul: 0.6
    },
    psyduck: {
      icon: '💧', name: '멍함',
      desc: '가끔(12%) 공격 대신 주변 적의 이동속도를 크게(60%) 감소.',
      kind: 'dazeInsteadOfAttack', chance: 0.12, radius: 130, slowMul: 0.4, duration: 2.5
    },
    meowth: {
      icon: '💰', name: '금전운',
      desc: '적 처치 시 5% 확률로 추가 골드.',
      kind: 'bonusGoldOnKill', chance: 0.05, gold: 8, goldPerWave: 0.6
    },
    paras: {
      icon: '🍄', name: '포자',
      desc: '적을 공격할 때 20% 확률로 독 데미지 2배.',
      kind: 'poisonOnAttack', chance: 0.2, poisonMul: 2
    },
    diglett: {
      icon: '🕳️', name: '땅파기',
      desc: '공격 시 12% 확률로 땅속에서 발을 붙잡아 1초 멈춘다(보스 제외).',
      kind: 'stunOnAttack', chance: 0.12, duration: 1.0
    },
    dugtrio: {
      icon: '👥', name: '삼연타',
      desc: '공격 시 15% 확률로 한 번 더 공격한다.',
      kind: 'extraAttackOnAttack', chance: 0.15
    },
    mankey: {
      icon: '💢', name: '분노',
      desc: '보스를 공격할 때 25% 확률로 피해 2배.',
      kind: 'bonusDamageOnAttack', chance: 0.25, mul: 2, when: 'boss'
    },
    parasect: {
      icon: '💤', name: '버섯포자',
      desc: '공격 시 12% 확률로 대상을 1.5초 잠재운다(보스 제외).',
      kind: 'stunOnAttack', chance: 0.12, duration: 1.5
    },
    persian: {
      icon: '🗡️', name: '급소찌르기',
      desc: '치명타 피해 +50%.',
      kind: 'statBonus', critDamageAdd: 0.5
    },
    sandshrew: {
      icon: '🏜️', name: '모래바람',
      desc: '공격 시 20% 확률로 맞은 적을 2초간 40% 감속.',
      kind: 'slowOnAttack', chance: 0.2, slowMul: 0.6, duration: 2
    },
    venomoth: {
      icon: '🦋', name: '인분',
      desc: '공격 시 15% 확률로 대상 주변 적 모두에게 독을 뿌린다.',
      kind: 'poisonOnAttack', chance: 0.15, poisonMul: 1, radius: 90
    },
    venonat: {
      icon: '👁️', name: '복안',
      desc: '사거리 +20%.',
      kind: 'statBonus', rangeMul: 1.2
    },

    /* ================= 1세대 확장 · 특별함 34종 ================= */
    dragonair: {
      icon: '🐉', name: '신비의비늘',
      desc: '치명타율 +12%.',
      kind: 'statBonus', critRateAdd: 0.12
    },
    tentacruel: {
      icon: '🪼', name: '독촉수',
      desc: '공격 시 15% 확률로 대상 주변 적 모두에게 독.',
      kind: 'poisonOnAttack', chance: 0.15, poisonMul: 1, radius: 80
    },
    rapidash: {
      icon: '🔥', name: '불꽃질주',
      desc: '공격 시 20% 확률로 화상 2배.',
      kind: 'burnOnAttack', chance: 0.2, burnMul: 2
    },
    slowbro: {
      icon: '🐚', name: '느긋함',
      desc: '가끔(10%) 공격 대신 주변 적을 2초간 60% 감속.',
      kind: 'dazeInsteadOfAttack', chance: 0.10, radius: 120, slowMul: 0.4, duration: 2
    },
    magneton: {
      icon: '🧲', name: '자력파',
      desc: '공격 시 8% 확률로 주변 적 3마리에게 연쇄(공격력 60%).',
      kind: 'chainOnAttack', chance: 0.08, count: 3, radius: 120, damageMul: 0.6
    },
    dodrio: {
      icon: '🐦', name: '세머리',
      desc: '공격 시 15% 확률로 한 번 더 공격한다.',
      kind: 'extraAttackOnAttack', chance: 0.15
    },
    dewgong: {
      icon: '❄️', name: '오로라빔',
      desc: '공격 시 20% 확률로 대상을 2초간 40% 감속.',
      kind: 'slowOnAttack', chance: 0.2, slowMul: 0.6, duration: 2
    },
    muk: {
      icon: '🟣', name: '독찌꺼기',
      desc: '공격 시 25% 확률로 독 데미지 2배.',
      kind: 'poisonOnAttack', chance: 0.25, poisonMul: 2
    },
    cloyster: {
      icon: '🧊', name: '고드름침',
      desc: '공격 시 20% 확률로 대상 방어력 -40.',
      kind: 'armorBreakOnAttack', chance: 0.2, armor: 40
    },
    hypno: {
      icon: '🌀', name: '최면술',
      desc: '공격 시 10% 확률로 대상을 1.2초 잠재운다(보스 제외).',
      kind: 'stunOnAttack', chance: 0.10, duration: 1.2
    },
    kingler: {
      icon: '🦀', name: '찝게햄머',
      desc: '보스를 공격할 때 25% 확률로 피해 2배.',
      kind: 'bonusDamageOnAttack', chance: 0.25, mul: 2, when: 'boss'
    },
    electrode: {
      icon: '💥', name: '방전',
      desc: '공격 시 10% 확률로 주변 적 4마리에게 연쇄(공격력 50%).',
      kind: 'chainOnAttack', chance: 0.10, count: 4, radius: 110, damageMul: 0.5
    },
    exeggutor: {
      icon: '🥥', name: '열매수확',
      desc: '필드에 있으면 라운드가 시작될 때마다 골드 +3.',
      kind: 'goldOnWave', gold: 3
    },
    marowak: {
      icon: '🦴', name: '뼈다귀부메랑',
      desc: '체력 30% 이하인 적에게 피해 +35%.',
      kind: 'bonusDamageOnAttack', chance: 1, mul: 1.35, when: 'lowHp', lowHpRatio: 0.3
    },
    weezing: {
      icon: '☁️', name: '독가스',
      desc: '공격 시 15% 확률로 대상 주변 적 모두에게 독.',
      kind: 'poisonOnAttack', chance: 0.15, poisonMul: 1, radius: 90
    },
    seadra: {
      icon: '🌫️', name: '연막',
      desc: '공격 시 15% 확률로 대상을 1.5초간 40% 감속.',
      kind: 'slowOnAttack', chance: 0.15, slowMul: 0.6, duration: 1.5
    },
    seaking: {
      icon: '🐟', name: '뿔찌르기',
      desc: '공격속도 +12%.',
      kind: 'statBonus', attackSpeedMul: 1.12
    },
    starmie: {
      icon: '⭐', name: '코스믹파워',
      desc: '공격 시 8% 확률로 주변 적 3마리에게 연쇄(공격력 60%).',
      kind: 'chainOnAttack', chance: 0.08, count: 3, radius: 120, damageMul: 0.6
    },
    vaporeon: {
      icon: '💧', name: '녹기',
      desc: '공격 시 20% 확률로 대상을 2초간 45% 감속.',
      kind: 'slowOnAttack', chance: 0.2, slowMul: 0.55, duration: 2
    },
    jolteon: {
      icon: '⚡', name: '전기엔진',
      desc: '공격속도 +15%.',
      kind: 'statBonus', attackSpeedMul: 1.15
    },
    flareon: {
      icon: '🔥', name: '타오르는불꽃',
      desc: '공격 시 20% 확률로 화상 2배.',
      kind: 'burnOnAttack', chance: 0.2, burnMul: 2
    },
    onix: {
      icon: '🪨', name: '조이기',
      desc: '공격 시 10% 확률로 대상을 뒤로 밀어낸다(보스 제외).',
      kind: 'knockbackOnAttack', chance: 0.10, push: 50
    },
    hitmonlee: {
      icon: '🦵', name: '무릎차기',
      desc: '보스를 공격할 때 30% 확률로 피해 2배.',
      kind: 'bonusDamageOnAttack', chance: 0.30, mul: 2, when: 'boss'
    },
    hitmonchan: {
      icon: '🥊', name: '연속펀치',
      desc: '공격 시 15% 확률로 한 번 더 공격한다.',
      kind: 'extraAttackOnAttack', chance: 0.15
    },
    chansey: {
      icon: '🥚', name: '행복의알',
      desc: '필드에 있으면 라운드가 시작될 때마다 골드 +4.',
      kind: 'goldOnWave', gold: 4
    },
    kangaskhan: {
      icon: '👶', name: '부모의사랑',
      desc: '공격 시 12% 확률로 한 번 더 공격한다.',
      kind: 'extraAttackOnAttack', chance: 0.12
    },
    mr_mime: {
      icon: '🤡', name: '흉내내기',
      desc: '공격 시 8% 확률로 감속·독·연쇄 중 하나가 무작위로 터진다.',
      kind: 'randomOnAttack', chance: 0.08
    },
    jynx: {
      icon: '💋', name: '악마의키스',
      desc: '공격 시 12% 확률로 대상을 1.2초 잠재운다(보스 제외).',
      kind: 'stunOnAttack', chance: 0.12, duration: 1.2
    },
    electabuzz: {
      icon: '🔌', name: '번개펀치',
      desc: '공격 시 10% 확률로 주변 적 3마리에게 연쇄(공격력 70%).',
      kind: 'chainOnAttack', chance: 0.10, count: 3, radius: 120, damageMul: 0.7
    },
    magmar: {
      icon: '🌋', name: '불꽃펀치',
      desc: '공격 시 20% 확률로 화상 2배.',
      kind: 'burnOnAttack', chance: 0.2, burnMul: 2
    },
    pinsir: {
      icon: '✂️', name: '가위자르기',
      desc: '보스를 공격할 때 25% 확률로 피해 2배.',
      kind: 'bonusDamageOnAttack', chance: 0.25, mul: 2, when: 'boss'
    },
    tauros: {
      icon: '🐂', name: '돌진',
      desc: '공격 시 20% 확률로 피해 1.8배.',
      kind: 'bonusDamageOnAttack', chance: 0.20, mul: 1.8, when: 'always'
    },
    golduck: {
      icon: '🔮', name: '염동력',
      desc: '사거리 +15%.',
      kind: 'statBonus', rangeMul: 1.15
    },
    primeape: {
      icon: '👊', name: '분노의주먹',
      desc: '공격속도 +20%.',
      kind: 'statBonus', attackSpeedMul: 1.2
    },

    /* ================= 조합식 개편 v2 — 새로 특별함이 된 14종 =================
     * 특별함은 전부 특성을 갖는다(검사가 본다). 기존 특별함 특성과 같은 세기로 맞췄다. */
    raticate: {
      icon: '🦷', name: '필살앞니',
      desc: '체력 30% 이하인 적에게 피해 +30%.',
      kind: 'bonusDamageOnAttack', chance: 1, mul: 1.3, when: 'lowHp', lowHpRatio: 0.3
    },
    fearow: {
      icon: '🪶', name: '드릴부리',
      desc: '공격 시 12% 확률로 한 번 더 공격한다.',
      kind: 'extraAttackOnAttack', chance: 0.12
    },
    arbok: {
      icon: '🐍', name: '뱀눈초리',
      desc: '공격 시 12% 확률로 대상을 1초 멈춘다(보스 제외).',
      kind: 'stunOnAttack', chance: 0.12, duration: 1.0
    },
    ponyta: {
      icon: '🔥', name: '불꽃몸',
      desc: '공격 시 20% 확률로 화상 2배.',
      kind: 'burnOnAttack', chance: 0.2, burnMul: 2
    },
    magnemite: {
      icon: '🧲', name: '자력',
      desc: '공격 시 10% 확률로 주변 적 3마리에게 연쇄(공격력 50%).',
      kind: 'chainOnAttack', chance: 0.10, count: 3, radius: 110, damageMul: 0.5
    },
    shellder: {
      icon: '🐚', name: '조가비',
      desc: '공격 시 20% 확률로 대상 방어력 -20.',
      kind: 'armorBreakOnAttack', chance: 0.2, armor: 20
    },
    growlithe: {
      icon: '🐕', name: '위협',
      desc: '공격 시 12% 확률로 대상을 1.5초간 40% 감속.',
      kind: 'slowOnAttack', chance: 0.12, slowMul: 0.6, duration: 1.5
    },
    rhyhorn: {
      icon: '🦏', name: '박치기',
      desc: '공격 시 10% 확률로 대상을 뒤로 밀어낸다(보스 제외).',
      kind: 'knockbackOnAttack', chance: 0.10, push: 40
    },
    omanyte: {
      icon: '🌀', name: '조개껍질',
      desc: '공격 시 15% 확률로 대상을 1.5초간 40% 감속.',
      kind: 'slowOnAttack', chance: 0.15, slowMul: 0.6, duration: 1.5
    },
    kabuto: {
      icon: '🦀', name: '전투무장',
      desc: '치명타 확률 +8%.',
      kind: 'statBonus', critRateAdd: 0.08
    },
    farfetchd: {
      icon: '🥬', name: '대파휘두르기',
      desc: '치명타 피해 +40%.',
      kind: 'statBonus', critDamageAdd: 0.4
    },
    lickitung: {
      icon: '👅', name: '핥기',
      desc: '공격 시 10% 확률로 대상을 1초 멈춘다(보스 제외).',
      kind: 'stunOnAttack', chance: 0.10, duration: 1.0
    },
    tangela: {
      icon: '🌿', name: '덩굴휘감기',
      desc: '공격 시 15% 확률로 대상을 2초간 40% 감속.',
      kind: 'slowOnAttack', chance: 0.15, slowMul: 0.6, duration: 2
    },
    porygon: {
      icon: '💾', name: '다운로드',
      desc: '공격 시 12% 확률로 감속·독·연쇄 중 하나가 무작위로 터진다.',
      kind: 'randomOnAttack', chance: 0.12
    },

    /* ================= 희귀함 — 8종 중 5종 =================
     * 희귀함은 이미 고유 스킬이 있다. 특성은 스킬과 겹치지 않는 결로, 특별함보다 한 단계 세게.
     * 버터플·라플레시아·푸크린은 스킬 자체가 광역 제어라 특성까지 얹으면 넘친다 — 비워 둔다. */
    raichu: {
      icon: '⚡', name: '축전',
      desc: '공격 시 10% 확률로 주변 적 4마리에게 강한 연쇄(공격력 80%).',
      kind: 'chainOnAttack', chance: 0.10, count: 4, radius: 140, damageMul: 0.8
    },
    beedrill: {
      icon: '🐝', name: '맹독침',
      desc: '공격 시 30% 확률로 독 데미지 2.5배.',
      kind: 'poisonOnAttack', chance: 0.30, poisonMul: 2.5
    },
    pidgeot: {
      icon: '🪶', name: '순풍',
      desc: '공격속도 +15%.',
      kind: 'statBonus', attackSpeedMul: 1.15
    },
    sandslash: {
      icon: '🦔', name: '가시발톱',
      desc: '공격 시 20% 확률로 대상 방어력 -40.',
      kind: 'armorBreakOnAttack', chance: 0.20, armor: 40
    },
    clefable: {
      icon: '🍀', name: '행운',
      desc: '치명타율 +12%.',
      kind: 'statBonus', critRateAdd: 0.12
    },

    /* ================= 안흔함 — 14종 중 6종 ================= */
    ivysaur: {
      icon: '🌱', name: '광합성',
      desc: '필드에 있으면 라운드가 시작될 때마다 골드 +3.',
      kind: 'goldOnWave', gold: 3
    },
    charmeleon: {
      icon: '🔥', name: '맹화',
      desc: '체력 30% 이하인 적에게 피해 +30%.',
      kind: 'bonusDamageOnAttack', chance: 1, mul: 1.3, when: 'lowHp', lowHpRatio: 0.3
    },
    wartortle: {
      icon: '💦', name: '물대포',
      desc: '공격 시 8% 확률로 대상을 뒤로 밀어낸다(보스 제외).',
      kind: 'knockbackOnAttack', chance: 0.08, push: 45
    },
    ninetales: {
      icon: '👻', name: '도깨비불',
      desc: '공격 시 15% 확률로 화상 2배.',
      kind: 'burnOnAttack', chance: 0.15, burnMul: 2
    },
    golbat: {
      icon: '🦇', name: '초음파',
      desc: '공격 시 8% 확률로 대상을 1초 혼란(정지)시킨다(보스 제외).',
      kind: 'stunOnAttack', chance: 0.08, duration: 1.0
    },
    nidorino: {
      icon: '🦏', name: '뿔드릴',
      desc: '보스에게 주는 피해 +20%.',
      kind: 'bonusDamageOnAttack', chance: 1, mul: 1.2, when: 'boss'
    },

    /* ================= 흔함 — 16종 중 4종 ================= */
    caterpie: {
      icon: '🕸️', name: '실뿜기',
      desc: '공격 시 12% 확률로 대상을 1.5초간 30% 감속.',
      kind: 'slowOnAttack', chance: 0.12, slowMul: 0.7, duration: 1.5
    },
    jigglypuff: {
      icon: '🎵', name: '노래하기',
      desc: '공격 시 5% 확률로 대상을 1초 잠재운다(보스 제외).',
      kind: 'stunOnAttack', chance: 0.05, duration: 1.0
    },
    clefairy: {
      icon: '✨', name: '손가락흔들기',
      desc: '공격 시 8% 확률로 감속·독·연쇄 중 하나가 무작위로 터진다.',
      kind: 'randomOnAttack', chance: 0.08
    },
    rattata: {
      icon: '🐭', name: '앞니',
      desc: '공격속도 +10%.',
      kind: 'statBonus', attackSpeedMul: 1.1
    }
  };

  var KINDS = ['chainOnAttack', 'dazeInsteadOfAttack', 'bonusGoldOnKill', 'poisonOnAttack',
    'burnOnAttack', 'stunOnAttack', 'slowOnAttack', 'knockbackOnAttack', 'extraAttackOnAttack',
    'bonusDamageOnAttack', 'randomOnAttack', 'goldOnWave', 'statBonus', 'armorBreakOnAttack'];

  var TraitData = {
    list: TRAITS,
    kinds: KINDS,
    get: function (id) { return TRAITS[id] || null; },
    label: function (id) {
      var t = TRAITS[id];
      return t ? t.icon + ' ' + t.name : '';
    }
  };

  RPD.TraitData = TraitData;
})(typeof window !== 'undefined' ? window : globalThis);
