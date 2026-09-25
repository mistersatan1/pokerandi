/* skills.js — 고유 스킬과 전설 패시브.
 *
 * 왜 필요한가:
 * 스킬이 없으면 상위 등급은 "숫자가 큰 포켓몬"일 뿐이다. 뽑았을 때의 쾌감이
 * 등급 색깔뿐이고, 희귀함과 전설의 차이가 화면에서 안 보인다.
 *
 * 규칙
 *   - 희귀함(T4)부터 고유 스킬, 전설(T5)은 스킬 + 패시브를 갖는다.
 *   - 배율은 **실효 공격력** 기준이다. 강화·시너지·버프가 스킬에도 그대로 실린다.
 *   - 허공에 쓰지 않는다. 사거리(또는 지정 범위) 안에 적이 있을 때만 터진다.
 *   - 침묵·기절 중에는 쿨다운도 멈춘다. 보스 패턴과 맞물리게 하기 위해서다.
 *
 * kind 가 하는 일은 SkillManager 가 실행한다. 여기에는 수치만 적는다.
 *   areaBurst  범위 안 전체에 damageMul 배 피해 (+ 상태이상)
 *   single     한 대상에게 damageMul 배 (hits 번). target 으로 고르는 규칙이 다르다
 *   zone       범위 안을 duration 초 동안 태운다/독지대로 만든다
 *   teamBuff   아군 전체에 duration 초 동안 공격력·공격속도 배율
 *
 * scope: 'range'(시전자 사거리) | 'global'(필드 전체)
 * target: 'current'(지금 때리던 적) | 'strongest' | 'boss'(없으면 최강)
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  var SKILLS = {
    /* ---------- 희귀함 ----------
     * (조합식 개편 v2) 이 칸의 일부 스킬 — 날개치기·전광석화·달의축복 등 16종 — 은 주인이 전설·불멸로
     * 올라가 전설 예산(쿨다운 19~23초, 위력 ×1.5)으로 올렸다. 스킬은 종마다 하나씩이라 제자리에서 고쳤다. */
    sleepPowder: {
      id: 'sleepPowder', name: '수면가루', kind: 'areaBurst', scope: 'range',
      cooldown: 13, damageMul: 2.2, freeze: 2.4,
      desc: '사거리 안 적을 2.4초 잠재우고 피해를 준다.'
    },
    twinSting: {
      id: 'twinSting', name: '더블니들', kind: 'single', scope: 'range', target: 'current',
      cooldown: 12, damageMul: 5.5, hits: 2, poisonMul: 2.5,
      desc: '한 대상을 두 번 찔러 강한 독을 남긴다.'
    },
    skyRush: {
      id: 'skyRush', name: '날개치기', kind: 'areaBurst', scope: 'range',
      cooldown: 19, damageMul: 5.1, slowMul: 0.6, slowDuration: 4,
      desc: '돌풍으로 사거리 안을 쓸고 느리게 만든다.'
    },
    voltBurst: {
      id: 'voltBurst', name: '전광석화', kind: 'areaBurst', scope: 'global', maxTargets: 12,
      cooldown: 20, damageMul: 3.9, freeze: 0.6,
      desc: '필드 전체에 번개를 떨어뜨려 최대 12체를 감전시킨다.'
    },
    earthquake: {
      id: 'earthquake', name: '지진', kind: 'areaBurst', scope: 'range',
      cooldown: 14, damageMul: 4.2, armorShred: 60,
      desc: '땅을 흔들어 사거리 안 전체를 때리고 방어력을 깎는다.'
    },
    moonBlessing: {
      id: 'moonBlessing', name: '달의축복', kind: 'teamBuff',
      cooldown: 22, duration: 6, attackMul: 1.53,
      desc: '6초간 아군 전체 공격력 +53%.'
    },
    toxicGarden: {
      id: 'toxicGarden', name: '독의화원', kind: 'zone', scope: 'range',
      cooldown: 15, damageMul: 3.6, duration: 5,
      desc: '사거리 안을 5초간 독지대로 만든다.'
    },
    lullaby: {
      id: 'lullaby', name: '자장가', kind: 'areaBurst', scope: 'range',
      cooldown: 16, damageMul: 2.0, slowMul: 0.45, slowDuration: 4,
      desc: '노래로 사거리 안 적을 크게 느리게 만든다.'
    },

    /* ---------- 1세대 확장 · 희귀함 ---------- */
    dynamicPunch: { id: 'dynamicPunch', name: '폭발펀치', kind: 'single', scope: 'range', target: 'current',
      cooldown: 19, damageMul: 11.2, freeze: 1.4, desc: '눈앞의 적을 강하게 쳐 1.4초 혼란(정지)시킨다.' },
    psychicBlast: { id: 'psychicBlast', name: '사이코키네시스', kind: 'single', scope: 'global', target: 'strongest',
      cooldown: 20, damageMul: 13.5, ignoreArmor: true, desc: '가장 단단한 적을 방어 무시로 짓누른다.' },
    crossChop: { id: 'crossChop', name: '크로스촙', kind: 'single', scope: 'range', target: 'current',
      cooldown: 19, damageMul: 8.2, hits: 2, desc: '한 대상을 두 번 내려친다.' },
    sludgeWave: { id: 'sludgeWave', name: '오물웨이브', kind: 'zone', scope: 'range',
      cooldown: 15, damageMul: 3.4, duration: 5, desc: '사거리 안을 5초간 독 늪으로 만든다.' },
    rockSlide: { id: 'rockSlide', name: '스톤샤워', kind: 'areaBurst', scope: 'range',
      cooldown: 19, damageMul: 6, freeze: 1, desc: '바위를 쏟아 사거리 안을 때리고 잠깐 멈춘다.' },
    shadowBall: { id: 'shadowBall', name: '섀도볼', kind: 'single', scope: 'global', target: 'strongest',
      cooldown: 19, damageMul: 10.5, armorShred: 70, desc: '가장 강한 적의 방어를 무너뜨린다.' },
    flareBlitz: { id: 'flareBlitz', name: '플레어드라이브', kind: 'areaBurst', scope: 'range',
      cooldown: 21, damageMul: 7.5, burn: { ratio: 0.4, duration: 5 }, desc: '불길에 휩싸여 돌진, 화상을 남긴다.' },
    hornDrill: { id: 'hornDrill', name: '뿔드릴', kind: 'single', scope: 'global', target: 'boss',
      cooldown: 22, damageMul: 18, ignoreArmor: true, desc: '보스에게 방어를 꿰뚫는 일격.' },
    spikeCannon: { id: 'spikeCannon', name: '가시대포', kind: 'areaBurst', scope: 'range',
      cooldown: 15, damageMul: 2.8, slowMul: 0.5, slowDuration: 3.5, desc: '가시를 퍼부어 크게 느리게 만든다.' },
    slashCut: { id: 'slashCut', name: '베어가르기', kind: 'single', scope: 'range', target: 'current',
      cooldown: 12, damageMul: 5.0, hits: 3, desc: '낫으로 세 번 벤다.' },
    hyperBeam: { id: 'hyperBeam', name: '파괴광선', kind: 'areaBurst', scope: 'global', maxTargets: 14,
      cooldown: 22, damageMul: 5.4, desc: '필드를 가로질러 최대 14체를 태운다.' },
    furyCutter: { id: 'furyCutter', name: '연속자르기', kind: 'single', scope: 'range', target: 'current',
      cooldown: 19, damageMul: 6, hits: 3, desc: '빠르게 세 번 자른다.' },
    iceBeam: { id: 'iceBeam', name: '냉동빔', kind: 'areaBurst', scope: 'range',
      cooldown: 20, damageMul: 4.5, freeze: 1.9, desc: '사거리 안을 얼려 1.9초 멈춘다.' },
    ancientPower: { id: 'ancientPower', name: '원시의힘', kind: 'teamBuff',
      cooldown: 22, duration: 6, attackMul: 1.42, desc: '6초간 아군 전체 공격력 +42%.' },
    bodySlam: { id: 'bodySlam', name: '누르기', kind: 'areaBurst', scope: 'range',
      cooldown: 21, damageMul: 4.8, slowMul: 0.4, slowDuration: 4, desc: '몸으로 짓눌러 크게 느리게 만든다.' },

    /* ---------- 히든 ---------- */
    rainDance: { id: 'rainDance', name: '비바라기', kind: 'areaBurst', scope: 'global', maxTargets: 20,
      cooldown: 16, damageMul: 1.8, slowMul: 0.4, slowDuration: 4, desc: '필드 전체에 비를 뿌려 최대 20체를 크게 느리게 만든다.' },
    ancestorGlow: { id: 'ancestorGlow', name: '원시의빛', kind: 'teamBuff',
      cooldown: 22, duration: 7, attackMul: 1.6, desc: '7초간 아군 전체 공격력 +60%.' },

    /* ---------- 불멸 · 초월 ---------- */
    psychoBreakX: { id: 'psychoBreakX', name: '초월 · 사이코브레이크', kind: 'areaBurst', scope: 'global', maxTargets: 30,
      cooldown: 19, damageMul: 12, ignoreArmor: true, desc: '필드 전체 최대 30체를 방어 무시로 짓누른다.' },
    blastBurnX: { id: 'blastBurnX', name: '초월 · 블래스트번', kind: 'areaBurst', scope: 'global', maxTargets: 30,
      cooldown: 19, damageMul: 10, burn: { ratio: 0.8, duration: 6 }, desc: '필드 전체 최대 30체를 불바다로 만든다.' },

    /* ---------- 조합식 개편 v2 — 새로 희귀함이 된 종 ---------- */
    toxicTentacle: { id: 'toxicTentacle', name: '독침파도', kind: 'zone', scope: 'range',
      cooldown: 15, damageMul: 3.2, duration: 5, desc: '사거리 안을 5초간 독 물결로 덮는다.' },
    auroraBeam: { id: 'auroraBeam', name: '오로라빔', kind: 'areaBurst', scope: 'range',
      cooldown: 15, damageMul: 2.8, freeze: 1.4, desc: '사거리 안을 얼려 1.4초 멈춘다.' },
    eggBomb: { id: 'eggBomb', name: '알폭탄', kind: 'areaBurst', scope: 'range',
      cooldown: 14, damageMul: 4.0, desc: '사거리 안에 알을 던져 한꺼번에 터뜨린다.' },
    crabhammer: { id: 'crabhammer', name: '찝게햄머', kind: 'single', scope: 'global', target: 'boss',
      cooldown: 16, damageMul: 10, desc: '보스를 집게로 내려친다. 보스가 없으면 가장 강한 적.' },
    hypnosis: { id: 'hypnosis', name: '최면술', kind: 'areaBurst', scope: 'range',
      cooldown: 14, damageMul: 1.8, freeze: 2.2, desc: '사거리 안 적을 2.2초 잠재운다.' },
    slackWave: { id: 'slackWave', name: '멍때리기', kind: 'areaBurst', scope: 'range',
      cooldown: 16, damageMul: 2.4, slowMul: 0.45, slowDuration: 4, desc: '사거리 안 적을 4초간 크게 느리게 만든다.' },
    dragonTail: { id: 'dragonTail', name: '드래곤테일', kind: 'single', scope: 'global', target: 'strongest',
      cooldown: 14, damageMul: 8, desc: '가장 강한 적을 꼬리로 후려친다.' },
    zapCannon: { id: 'zapCannon', name: '전자포', kind: 'areaBurst', scope: 'global', maxTargets: 8,
      cooldown: 15, damageMul: 2.8, freeze: 0.6, desc: '필드 전체 최대 8체를 감전시킨다.' },
    flameCharge: { id: 'flameCharge', name: '니트로차지', kind: 'areaBurst', scope: 'range',
      cooldown: 14, damageMul: 4.2, burn: { ratio: 0.35, duration: 4 }, desc: '불꽃을 두르고 돌진해 화상을 남긴다.' },
    highJumpKick: { id: 'highJumpKick', name: '무릎차기', kind: 'single', scope: 'global', target: 'boss',
      cooldown: 15, damageMul: 11, desc: '보스에게 날아올라 무릎을 꽂는다.' },
    cometPunch: { id: 'cometPunch', name: '연속펀치', kind: 'single', scope: 'range', target: 'current',
      cooldown: 12, damageMul: 4.5, hits: 3, desc: '눈앞의 적을 세 번 친다.' },
    barrier: { id: 'barrier', name: '배리어', kind: 'teamBuff',
      cooldown: 17, duration: 5, attackMul: 1.25, desc: '5초간 아군 전체 공격력 +25%.' },
    lovelyKiss: { id: 'lovelyKiss', name: '악마의키스', kind: 'areaBurst', scope: 'range',
      cooldown: 15, damageMul: 2.6, freeze: 1.8, desc: '사거리 안 적을 1.8초 얼어붙게 한다.' },
    thunderPunch: { id: 'thunderPunch', name: '번개펀치', kind: 'areaBurst', scope: 'global', maxTargets: 6,
      cooldown: 14, damageMul: 3.0, freeze: 0.5, desc: '필드 전체 최대 6체에 번개를 꽂는다.' },
    flamethrower: { id: 'flamethrower', name: '화염방사', kind: 'zone', scope: 'range',
      cooldown: 15, damageMul: 3.8, duration: 5, desc: '사거리 안을 5초간 불태운다.' },
    viceGrip: { id: 'viceGrip', name: '찝기', kind: 'single', scope: 'global', target: 'boss',
      cooldown: 15, damageMul: 10, desc: '보스를 뿔로 집어 조인다.' },
    rockTomb: { id: 'rockTomb', name: '암석봉인', kind: 'areaBurst', scope: 'range',
      cooldown: 15, damageMul: 3.4, slowMul: 0.5, slowDuration: 3, desc: '바위로 가둬 크게 느리게 만든다.' },
    softBoiled: { id: 'softBoiled', name: '알낳기', kind: 'teamBuff',
      cooldown: 17, duration: 5, attackMul: 1.25, desc: '5초간 아군 전체 공격력 +25%.' },

    /* ---------- 조합식 개편 v2 — 특별함 이하에서 바로 전설이 된 종 ---------- */
    willOWisp: { id: 'willOWisp', name: '도깨비불', kind: 'areaBurst', scope: 'global', maxTargets: 12,
      cooldown: 20, damageMul: 4.2, burn: { ratio: 0.5, duration: 6 }, desc: '아홉 갈래 불꽃으로 최대 12체를 태운다.' },
    icicleCrash: { id: 'icicleCrash', name: '고드름떨구기', kind: 'areaBurst', scope: 'range',
      cooldown: 19, damageMul: 5.5, freeze: 1.5, desc: '사거리 안에 고드름을 떨어뜨려 1.5초 멈춘다.' },
    swiftStar: { id: 'swiftStar', name: '스피드스타', kind: 'areaBurst', scope: 'global', maxTargets: 12,
      cooldown: 19, damageMul: 4.0, desc: '빗나가지 않는 별로 최대 12체를 때린다.' },

    /* ---------- 전설 ---------- */
    petalStorm: {
      id: 'petalStorm', name: '꽃잎폭풍', kind: 'areaBurst', scope: 'global', maxTargets: 14,
      cooldown: 22, damageMul: 4.0, slowMul: 0.7, slowDuration: 2.5,
      desc: '필드 전체를 꽃잎으로 덮어 최대 14체를 때린다.'
    },
    inferno: {
      id: 'inferno', name: '대문자불꽃', kind: 'areaBurst', scope: 'range',
      cooldown: 19, damageMul: 7.0, burn: { ratio: 0.5, duration: 6 },
      desc: '사거리 안을 태우고 6초간 화상을 남긴다.'
    },
    hydroCannon: {
      id: 'hydroCannon', name: '하이드로캐논', kind: 'single', scope: 'global', target: 'strongest',
      cooldown: 20, damageMul: 11, splash: 90, splashRatio: 0.45, slowMul: 0.5, slowDuration: 3,
      desc: '가장 단단한 적을 관통하고 주변까지 밀어낸다.'
    },
    queenGuard: {
      id: 'queenGuard', name: '여왕의결계', kind: 'areaBurst', scope: 'global', maxTargets: 20,
      cooldown: 21, damageMul: 2.4, slowMul: 0.5, slowDuration: 5, armorShred: 80,
      desc: '필드 전체를 5초간 묶고 방어력을 무너뜨린다.'
    },
    kingBreaker: {
      id: 'kingBreaker', name: '왕의일격', kind: 'single', scope: 'global', target: 'boss',
      cooldown: 19, damageMul: 16, ignoreArmor: true,
      desc: '보스에게 방어를 무시하는 일격. 보스가 없으면 가장 강한 적에게.'
    },

    /* ---------- 1세대 확장 · 전설 ---------- */
    dragonRush: { id: 'dragonRush', name: '역린', kind: 'single', scope: 'global', target: 'strongest',
      cooldown: 19, damageMul: 14, hits: 2, desc: '가장 강한 적을 두 번 들이받는다.' },
    blizzard: { id: 'blizzard', name: '눈보라', kind: 'areaBurst', scope: 'global', maxTargets: 16,
      cooldown: 21, damageMul: 3.0, freeze: 2.0, desc: '필드 전체를 얼려 최대 16체를 2초 멈춘다.' },
    thunderStorm: { id: 'thunderStorm', name: '번개', kind: 'areaBurst', scope: 'global', maxTargets: 14,
      cooldown: 19, damageMul: 4.2, freeze: 0.6, desc: '하늘에서 번개를 떨어뜨려 최대 14체를 때린다.' },
    skyFire: { id: 'skyFire', name: '불새의날개', kind: 'areaBurst', scope: 'global', maxTargets: 12,
      cooldown: 20, damageMul: 4.5, burn: { ratio: 0.5, duration: 6 }, desc: '불타는 날개로 최대 12체를 태운다.' },
    psystrike: { id: 'psystrike', name: '사이코브레이크', kind: 'single', scope: 'global', target: 'boss',
      cooldown: 19, damageMul: 20, ignoreArmor: true, desc: '보스에게 방어를 무시하는 초능력 일격.' }
  };

  /* 전설 패시브 — 그 개체가 필드에 있기만 하면 팀 전체에 걸린다.
   * 처음 열 개가 서로 다른 축을 건드린다(공격력·광역·감속·쿨다운·보스·치명타 피해·빙결·공격속도·화상·방어 무시).
   * 서로 다른 패시브는 전부 겹친다 — 같은 전설 두 마리만 한 번으로 친다(SkillManager). */
  var PASSIVES = {
    legend_venusaur:  { id: 'legend_venusaur',  name: '대지의은혜', teamAttackMul: 1.10,
                        desc: '아군 전체 공격력 +10%' },
    legend_charizard: { id: 'legend_charizard', name: '융기',       splashRadiusMul: 1.30,
                        desc: '광역 반경 +30%' },
    legend_blastoise: { id: 'legend_blastoise', name: '심해',       slowOnHit: 0.85, slowOnHitDuration: 1.2,
                        desc: '아군이 때린 적은 항상 느려진다' },
    legend_nidoqueen: { id: 'legend_nidoqueen', name: '여왕의호령', cooldownMul: 0.85,
                        desc: '스킬 쿨다운 -15%' },
    legend_nidoking:  { id: 'legend_nidoking',  name: '집중',       bossDamageAdd: 0.40,
                        desc: '보스 피해 +40%' },
    // 1세대 확장 전설 — 기존 다섯과 겹치지 않는 축
    legend_dragonite: { id: 'legend_dragonite', name: '용의기운',   teamCritDamageAdd: 0.30,
                        desc: '아군 전체 치명타 피해 +30%' },
    legend_articuno:  { id: 'legend_articuno',  name: '냉기',       freezeOnHit: 0.06, freezeOnHitDuration: 0.8,
                        desc: '아군이 때릴 때 6% 확률로 0.8초 빙결(보스 제외)' },
    legend_zapdos:    { id: 'legend_zapdos',    name: '번개의가호', teamAttackSpeedMul: 1.10,
                        desc: '아군 전체 공격속도 +10%' },
    legend_moltres:   { id: 'legend_moltres',   name: '불꽃의몸',   burnOnHit: 0.12,
                        desc: '아군이 때린 적은 피해의 12% 화상을 입는다' },
    legend_mewtwo:    { id: 'legend_mewtwo',    name: '프레셔',     teamArmorPierce: 0.30,
                        desc: '아군 전체 방어 무시 +30%' },
    // 조합식 개편 v2 — 새 전설 18종.
    // 전설이 10종 → 24종이 되자 한 축씩으로는 서로 다를 수가 없다(축이 10개뿐이다).
    // 그래서 새 전설은 **두 축을 절반 세기로** 묶는다 — 조합이 전부 다르고, 기존 열 개의 한 축보다 약하다.
    // 서로 다른 패시브는 전부 겹치므로 수치를 작게 잡았다. 밸런스 측정 후 조정 대상이다.
    legend_pidgeot:    { id: 'legend_pidgeot',    name: '순풍',       teamAttackSpeedMul: 1.03, splashRadiusMul: 1.06,
                         desc: '아군 전체 공격속도 +3% · 광역 반경 +6%' },
    legend_poliwrath:  { id: 'legend_poliwrath',  name: '격투혼',     bossDamageAdd: 0.12, slowOnHit: 0.92, slowOnHitDuration: 0.8,
                         desc: '보스 피해 +12% · 아군이 때린 적은 조금 느려진다' },
    legend_alakazam:   { id: 'legend_alakazam',   name: '예지',       cooldownMul: 0.96, teamArmorPierce: 0.08,
                         desc: '스킬 쿨다운 -4% · 아군 전체 방어 무시 +8%' },
    legend_machamp:    { id: 'legend_machamp',    name: '노가드',     teamCritDamageAdd: 0.10, bossDamageAdd: 0.12,
                         desc: '아군 전체 치명타 피해 +10% · 보스 피해 +12%' },
    legend_golem:      { id: 'legend_golem',      name: '옹골참',     splashRadiusMul: 1.06, teamArmorPierce: 0.08,
                         desc: '광역 반경 +6% · 아군 전체 방어 무시 +8%' },
    legend_gengar:     { id: 'legend_gengar',     name: '저주',       teamArmorPierce: 0.08, freezeOnHit: 0.03, freezeOnHitDuration: 0.5,
                         desc: '아군 전체 방어 무시 +8% · 3% 확률로 0.5초 빙결(보스 제외)' },
    legend_ninetales:  { id: 'legend_ninetales',  name: '타오르는불꽃', burnOnHit: 0.05, teamArmorPierce: 0.08,
                         desc: '아군이 때린 적은 피해의 5% 화상 · 아군 전체 방어 무시 +8%' },
    legend_raichu:     { id: 'legend_raichu',     name: '정전기',     teamAttackSpeedMul: 1.03, freezeOnHit: 0.03, freezeOnHitDuration: 0.5,
                         desc: '아군 전체 공격속도 +3% · 3% 확률로 0.5초 마비(보스 제외)' },
    legend_gyarados:   { id: 'legend_gyarados',   name: '위협',       teamAttackMul: 1.03, slowOnHit: 0.92, slowOnHitDuration: 0.8,
                         desc: '아군 전체 공격력 +3% · 아군이 때린 적은 조금 느려진다' },
    legend_clefable:   { id: 'legend_clefable',   name: '매직가드',   teamAttackMul: 1.03, cooldownMul: 0.96,
                         desc: '아군 전체 공격력 +3% · 스킬 쿨다운 -4%' },
    legend_arcanine:   { id: 'legend_arcanine',   name: '신속',       teamAttackSpeedMul: 1.03, burnOnHit: 0.05,
                         desc: '아군 전체 공격속도 +3% · 아군이 때린 적은 피해의 5% 화상' },
    legend_cloyster:   { id: 'legend_cloyster',   name: '껍질갑옷',   freezeOnHit: 0.03, freezeOnHitDuration: 0.5, teamCritDamageAdd: 0.10,
                         desc: '3% 확률로 0.5초 빙결(보스 제외) · 아군 전체 치명타 피해 +10%' },
    legend_rhydon:     { id: 'legend_rhydon',     name: '피뢰침',     bossDamageAdd: 0.12, splashRadiusMul: 1.06,
                         desc: '보스 피해 +12% · 광역 반경 +6%' },
    legend_starmie:    { id: 'legend_starmie',    name: '자연회복',   cooldownMul: 0.96, teamAttackSpeedMul: 1.03,
                         desc: '스킬 쿨다운 -4% · 아군 전체 공격속도 +3%' },
    legend_scyther:    { id: 'legend_scyther',    name: '테크니션',   teamCritDamageAdd: 0.10, teamAttackSpeedMul: 1.03,
                         desc: '아군 전체 치명타 피해 +10% · 공격속도 +3%' },
    legend_lapras:     { id: 'legend_lapras',     name: '축축한몸',   slowOnHit: 0.92, slowOnHitDuration: 0.8, freezeOnHit: 0.03, freezeOnHitDuration: 0.5,
                         desc: '아군이 때린 적은 조금 느려지고 3% 확률로 0.5초 빙결(보스 제외)' },
    legend_aerodactyl: { id: 'legend_aerodactyl', name: '긴장감',     bossDamageAdd: 0.12, teamAttackSpeedMul: 1.03,
                         desc: '보스 피해 +12% · 아군 전체 공격속도 +3%' },
    legend_snorlax:    { id: 'legend_snorlax',    name: '두꺼운지방', teamAttackMul: 1.03, splashRadiusMul: 1.06,
                         desc: '아군 전체 공격력 +3% · 광역 반경 +6%' },
    // 불멸 · 초월 — 전설 패시브보다 한 단계 센 같은 축
    // (파이어·썬더·프리져·뮤츠는 원래 갖던 전설 패시브를 그대로 쓴다)
    immortal_mew:      { id: 'immortal_mew',      name: '유전자의근원', teamAttackMul: 1.15, cooldownMul: 0.9,
                         desc: '아군 전체 공격력 +15% · 스킬 쿨다운 -10%' },
    transcend_mewtwo:   { id: 'transcend_mewtwo',   name: '각성',       teamArmorPierce: 0.5, bossDamageAdd: 0.5,
                          desc: '아군 전체 방어 무시 +50% · 보스 피해 +50%' },
    transcend_charizard:{ id: 'transcend_charizard',name: '겁화',       splashRadiusMul: 1.5, teamAttackMul: 1.15,
                          desc: '광역 반경 +50% · 아군 전체 공격력 +15%' }
  };

  var SkillData = { list: SKILLS, passives: PASSIVES };

  SkillData.get = function (id) { return SKILLS[id] || null; };
  SkillData.passive = function (id) { return PASSIVES[id] || null; };
  SkillData.ids = function () { return Object.keys(SKILLS); };

  /* 그 개체가 실제로 스킬을 쓰는가. 등급표의 skillLevel 이 기준이다
   * (T4 = 3 고유 스킬, T5 = 4 고유 스킬 + 패시브). */
  SkillData.forUnit = function (def) {
    if (!def || !def.skill) return null;
    var tier = RPD.Tiers[def.tier];
    if (!tier || tier.skillLevel < 3) return null;
    return SKILLS[def.skill] || null;
  };

  SkillData.passiveForUnit = function (def) {
    if (!def || !def.passive) return null;
    var tier = RPD.Tiers[def.tier];
    if (!tier || tier.skillLevel < 4) return null;   // T2·T3 의 계열 특성은 아직 쓰지 않는다
    return PASSIVES[def.passive] || null;
  };

  RPD.SkillData = SkillData;
})(typeof window !== 'undefined' ? window : globalThis);
