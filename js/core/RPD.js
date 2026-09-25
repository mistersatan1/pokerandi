/* RPD.js — 전역 네임스페이스와 게임 전체 설정값.
 * 로직 파일에는 매직넘버를 두지 않는다. 밸런스 수정은 전부 여기 또는 js/data/ 에서.
 */
(function (global) {
  'use strict';

  var RPD = global.RPD || {};
  global.RPD = RPD;

  RPD.VERSION = '0.3.0';
  RPD.SAVE_KEY = 'rpd.save.v1';

  // 캔버스 논리 좌표계. 실제 픽셀은 devicePixelRatio 로 스케일된다.
  RPD.VIEW = { width: 1000, height: 600 };

  RPD.Config = {
    // --- 루프 ---
    fixedStep: 1 / 60,      // 초. 모든 게임 로직은 이 간격으로만 갱신된다.
    maxStepsPerFrame: 12,   // 탭 복귀 시 따라잡기 폭주 방지
    maxFrameDelta: 0.1,     // 초. dt 클램프
    speedOptions: [1, 2, 3],

    // --- 플레이어 ---
    /* 라이프 = 후반 한 라운드 적 수(약 30마리)의 2배.
     * 아무것도 못 잡아도 두 라운드는 버틴다 — 한 번 흘려도 만회할 기회가 있어야
     * "충분하거나 즉사" 두 갈래로만 갈리지 않는다. */
    startLife: 60,
    // 소환 비용을 45로 올리면서 함께 맞춘 값. 첫 판에 10마리로 시작한다.
    // 실측: 420→80% / 460→92% / 500→96% 가 6웨이브를 넘긴다.
    startGold: 300,
    bossLifeLoss: 5,

    // --- 경제 (PHASE 12 에서 사용) ---
    /* v2 실측: 라운드당 5.9회 소환할 골드가 들어왔다. 슬롯은 18칸인데
     * 50라운드 동안 296회를 뽑을 수 있었다. "쓸 곳이 없을 만큼 많다"는 뜻이다.
     * 수입을 3분의 1로 줄이고 비용 상한을 올려 라운드당 2회 수준으로 맞췄다.
     * 대신 라운드마다 흔함 1마리를 무료로 줘서 바닥 물량은 보장한다.
     *
     * v1 측정 결과: 골드가 남아도는 시간이 전체의 3.1%였다. 늘 빈털터리라
     * "지금 쓸까 아낄까"가 고민이 아니라 "생기면 바로 소환"이라는 단일 정답이었다.
     * 수입과 비용을 함께 키워 보유 골드 자릿수를 올리고, 이자를 체감되게 바꿨다. */
    summonBaseCost: 45,
    // 라운드마다 흔함 1마리를 공짜로 준다. 소환을 대체하지 않고 바닥을 깔아 준다.
    roundGrant: 1,

    /* 창고 — 조합식을 다 외울 수 없으니 재료를 쌓아 둘 곳이 필요하다.
     * 무한이면 방출과 조각이 죽으므로 한도를 두고 골드로 늘린다. */
    storageBase: 14,
    storageStep: 4,
    storageMax: 40,
    storageExpandCost: 120,
    storageExpandGrowth: 1.55,
    summonCostStep: 12,      // 누적 소환 10회마다 +9
    summonCostStepEvery: 10,
    summonCostCap: 190,
    // 이자: 정률 4%(최대 40)는 보유 20골드 구간에서 0원이라 없는 시스템이었다.
    // "10골드당 1골드"로 바꾸면 50골드만 모아도 5골드가 보인다.
    interestPer: 10,
    interestCap: 35,
    killGoldBase: 2,   // 처치 골드
    killGoldPerWaves: 15,
    waveClearBase: 21,   // 초반 라운드당 소환 1회 안팎을 지킨다(흔함 재료 수요가 크다)
    waveClearPerWave: 0.9,
    sellRefundRate: 0.5,

    // --- 필드 ---
    slotCols: 4,
    slotRows: 4,
    /* 칸 크기. 68 이었을 때 한 띠에 두 줄을 넣으면 세로로 28px 씩 겹쳤다.
     * 겹친 칸은 클릭 판정이 앞 칸에 먹혀서 드래그가 엉뚱한 곳으로 갔다.
     * 56 이면 레인 사이(185px)에 두 줄이 여유 있게 들어간다. */
    slotSize: 56,

    // --- 합성 / 성장 ---
    fusionCount: 3,               // 같은 개체 몇 마리로 합성하는가
    // 등급 합성: 서로 다른 종이라도 같은 등급 N마리면 상위 등급 랜덤 1마리로 바꾼다.
    // 소환 가능한 종이 33개라 같은 종 3마리는 잘 안 모인다. 이 장치가 없으면
    // 중복이 아닌 개체들이 전부 죽은 자원이 되고, 결국 "운빨 게임"이 된다.
    // v1 측정: 신화 1마리 = 커먼 81마리인데 한 판에 240회 소환해서
    // 매 판 신화 4종이 전부 등장했다. 등급이 올라갈수록 비싸지게 바꾼다.
    // 커먼→레어 3, 레어→에픽 3, 에픽→전설 4, 전설→신화 5.
    tierUpCountBy: { T1: 3, T2: 3, T3: 4, T4: 5 },
    tierUpCount: 3,   // 기본값 (표에 없는 등급용)
    // 등급 합성에 골드를 물린다. 공짜면 "남는 자리는 무조건 등급 합성"이 정답이 되고,
    // 실제로 판당 30회씩 돌아 같은 종 합성(5회)을 압도했다.
    tierUpCostBy: { T1: 35, T2: 80, T3: 180, T4: 400 },
    // 단계별 공격력 배율. 3마리를 1마리로 합치므로 3배보다 커야 "슬롯을 아끼는 이득"이 생긴다.
    stageAttackMul: [1, 3.4, 11.5],
    // 각성(최종 단계 3마리) 배율. 진화 단계가 짧은 개체일수록 크게 준다.
    awakenMulByStageCount: { 1: 6.0, 2: 2.8, 3: 2.1 },
    /* 강화는 "운 없이 확실하게 세지는" 선택지여야 한다.
     * 처음 잡은 값(+8%, 비용 배수 1.9)으로는 같은 골드를 소환에 쓰는 게 언제나 이득이라
     * 아무도 누를 이유가 없는 함정 버튼이었다. 오토플레이가 그걸 잡아냈다. */
    /* 강화 = 사거리 (세션 33). 예전엔 공격력 +12% 였는데, 골드 상점(판 전체 공격력 · 재료로 써도 유지)이
     * 골드당 이득에서 늘 이겨 판당 1~4회밖에 안 쓰였다. 상점이 절대 주지 않는 "사거리"로 바꿨다 —
     * 이 게임의 핵심인 "칸마다 덮는 경로가 다르다"와 직결된다. 구석 자리에 앉은 좋은 포켓몬을 살리는 도구. */
    upgradeRangeStep: 0.08,       // 강화 1회당 사거리 +8% (최대 +40%)
    upgradeMaxLevel: 5,
    upgradeBaseCost: 24,          // 커먼 1회차 비용
    upgradeCostGrowth: 1.5,       // 강화할수록 지수로 비싸진다
    upgradeTierMul: 1.6,        // 등급이 한 단계 오를 때마다 비용 배수

    // --- 전투 ---
    targetRecheckInterval: 0.15,  // 타겟 재탐색 주기(초). 매 프레임 전수 탐색을 피한다.
    splashDamageRatio: 0.6,       // 광역 부수 피해 비율
    chainDamageDecay: 0.5,        // 연쇄 시 다음 대상 피해 비율
    pierceMaxTargets: 3
  };

  // 사거리 프리셋. 슬롯~레인 거리가 65 / 145 이므로 아래 값이 곧 "몇 개 레인을 때리는가"가 된다.
  RPD.Range = {
    SHORT: 100,   // 인접 레인 일부만
    MID: 155,     // 인접 레인 넓게 + 반대 레인 살짝
    LONG: 235,    // 두 레인 모두 넓게
    GLOBAL: 9999
  };

  /* 등급 — 5단계.
   *
   * ID 를 T1~T5 중립 이름으로 둔 이유가 있다. 리디자인 전에는 RARE 가 2번째 등급이었는데
   * 새 체계에서 RARE(희귀함)는 4번째다. 같은 문자열이 다른 서열을 뜻하게 되면
   * 코드 103곳 중 어딘가는 반드시 옛 의미로 남는다. 이름을 아예 갈아치워 그 사고를 막는다.
   *
   * unlockRound  이 라운드부터 소환에 등장한다
   *
   * 처음엔 11/21/31/41 이었다. 실측해 보니 도달 중앙값이 42라운드라
   * 전설(41 해금)을 한 번도 못 쓰고 끝났다. 존재하지 않는 콘텐츠였다.
   * 1/9/18/27/36 으로 당겨 각 등급을 쓸 시간을 만들었다.
   * (기획서도 이 수치를 "예시"로 명시했다)
   * skillLevel   0 기본공격만 / 1 약한 특성 / 2 특성 / 3 고유 스킬 / 4 고유 스킬 + 전설 패시브
   */
  RPD.Tiers = {
    T1: { id: 'T1', label: '흔함',   color: '#8a9a8f', unlockRound: 1, summonable: true,  skillLevel: 0, statMul: 1.0,
          role: '초반 전투의 핵심. 대부분의 조합식 재료가 여기서 나온다.' },
    T2: { id: 'T2', label: '안흔함', color: '#4f8fd6', unlockRound: 9, summonable: true, skillLevel: 1, statMul: 1.45,
          role: '중반 주력. 흔함보다 강하고 여러 조합의 핵심 재료다.' },
    T3: { id: 'T3', label: '특별함', color: '#a366e0', unlockRound: 17, summonable: true, skillLevel: 2, statMul: 2.1,
          role: '중상위 전력. 특정 조합의 결과물로 자주 등장한다.' },
    T4: { id: 'T4', label: '희귀함', color: '#f0a02e', unlockRound: 25, skillLevel: 3, summonable: false, statMul: 3.2,
          role: '고유 스킬을 가진 주요 전력.' },
    T5: { id: 'T5', label: '전설',   color: '#ff5fa2', unlockRound: 33, skillLevel: 4, summonable: false, statMul: 4.5,
          role: '고유 스킬 + 전설 패시브. 후반 핵심이지만 이것만으로 이기지는 못한다.' },

    /* ---------- 특수 등급 — 조합식 목록에 없고, 채팅 주문으로만 만든다 ----------
     * 소환·조각 상점·보스 보상 어디에서도 나오지 않는다(special: true).
     *
     * 예전에는 '히든(TH)'도 여기 있는 등급이었다. 조합식 개편 v2 에서 히든은
     * 등급이 아니라 **얻는 법**이 됐다 — 포켓몬 데이터의 hidden:true 로 표시하고,
     * 강함은 안흔함~전설 중 하나다(js/data/pokemon.js).
     * 강함: 전설 < 불멸 < 초월 */
    T6: { id: 'T6', label: '불멸',   color: '#e8ecff', unlockRound: 999, skillLevel: 4, summonable: false, special: true,
          statMul: 6.0, role: '전설 셋 이상을 바쳐 만드는 기물. 여러 번 만들 수 있다.' },
    T7: { id: 'T7', label: '초월',   color: '#ffd23f', unlockRound: 999, skillLevel: 4, summonable: false, special: true,
          statMul: 8.0, role: '초월의 조각으로만 만드는 판 최고 기물. 판당 하나.' }
  };

  // 소환·확률·조합식 목록이 쓰는 기본 다섯 등급
  RPD.TIER_ORDER = ['T1', 'T2', 'T3', 'T4', 'T5'];
  // 특수 등급까지 포함한 강함 순서 — 정렬·도감·그림 크기가 쓴다
  RPD.SPECIAL_TIERS = ['T6', 'T7'];
  RPD.ALL_TIERS = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  RPD.tierRank = function (id) { return RPD.ALL_TIERS.indexOf(id); };
  /* 연출·비용 표처럼 다섯 칸짜리 배열을 쓰는 곳에 넣을 단계(0~4) */
  RPD.tierPower = function (id) {
    return { T1: 0, T2: 1, T3: 2, T4: 3, T5: 4, T6: 4, T7: 4 }[id] || 0;
  };

  /* 이 라운드에서 등장 가능한 등급 목록 */
  RPD.tiersUnlockedAt = function (round) {
    return RPD.TIER_ORDER.filter(function (t) { return round >= RPD.Tiers[t].unlockRound; });
  };

  /* 이 라운드에 새로 해금되는 등급 (없으면 null) — 해금 연출에 쓴다 */
  RPD.tierUnlockedAt = function (round) {
    for (var i = 0; i < RPD.TIER_ORDER.length; i++) {
      if (RPD.Tiers[RPD.TIER_ORDER[i]].unlockRound === round) return RPD.Tiers[RPD.TIER_ORDER[i]];
    }
    return null;
  };



  RPD.GameState = {
    BOOT: 'BOOT',
    READY: 'READY',       // 시작 전 대기
    RUNNING: 'RUNNING',
    PAUSED: 'PAUSED',
    GAMEOVER: 'GAMEOVER',
    VICTORY: 'VICTORY'
  };

  /* 게임 모드.
   *
   * hpMul 만 다르면 "노멀인데 더 아픈 것"에 불과하다. 모드마다 판을 푸는 방식이
   * 달라지도록 modifiers 를 둔다. 각 modifier 를 실제로 읽는 곳은 주석에 적어 둔다.
   *
   *   startGoldMul  GameManager.reset
   *   lifeMul       GameManager.reset
   *   slotLimit     FieldManager.init      (이 수를 넘는 칸은 잠기고 살 수도 없다)
   *   tierMul     SummonManager          (등급별 소환 가중치)
   *   goldMul       EconomyManager         (처치·클리어 보상)
   *   bossShareMul  WaveData.enemyMaxHp    (보스 체력 비중)
   */
  RPD.Modes = {
    NORMAL: {
      id: 'NORMAL', label: '일반', finalWave: 70, hpMul: 1.0, bossEvery: 10,
      tagline: '70라운드를 지켜내면 승리 · 난이도 4단계',
      desc: '기준이 되는 모드. 10라운드마다 보스가 오고, 9·17·25·33라운드에 새 등급이 열린다.',
      modifiers: {}
    },
    ENDLESS: {
      id: 'ENDLESS', label: '엔드리스', finalWave: 0, hpMul: 0.9, bossEvery: 7,
      tagline: '끝이 없다. 어디까지 가는지가 기록',
      desc: '7라운드마다 보스가 온다. 수입이 15% 많지만 언젠가는 반드시 뚫린다.',
      modifiers: { goldMul: 1.15 }
    },
    BOSS_RUSH: {
      id: 'BOSS_RUSH', label: '보스 러시', finalWave: 20, hpMul: 2.1, bossEvery: 1,
      tagline: '20라운드 전부가 보스',
      desc: '잡몹이 거의 없어 광역 딜러가 논다. 단일 화력과 격투 타입이 답이다.',
      // 처치할 잡몹이 없으니 처치 보상이 거의 안 들어온다.
      // 보정 없이는 웨이브 4에서 소환할 골드가 떨어져 굶어 죽는다 (실측).
      /* 20라운드면 체력 곡선이 3.4배밖에 안 오른다(50라운드는 26배).
       * 짧은 모드는 자체 배수로 난이도를 만들어야 한다. */
      /* 세션 33: 보스 라운드 호위를 없애자(요청 ②) 이 모드의 유일한 수입원이 사라져 중앙 5라운드에 무너졌다.
       * 보스 골드만 올려서는 안 풀렸다 — 1라운드부터 보스뿐이라 시작 보드로는 첫 보스를 못 잡고,
       * 못 잡으면 보스 골드도 0 이다(닭과 달걀). 호위가 주던 초반 자금을 시작 골드로 미리 준다:
       * startGoldMul 1.5 → 4 (1200G). 초반 보스 체력만 낮추는 안(bossShareMul 0.6)은 20% 로 효과가 없었다.
       * 보스 골드는 매 라운드 나오므로 bossGoldMul 0.5 로 깎는다. 실측 클리어 70% · 중앙 20. */
      modifiers: { startGoldMul: 4, goldMul: 2.2, bossShareMul: 0.95, bossGoldMul: 0.5 }
    },
    CHALLENGE: {
      id: 'CHALLENGE', label: '챌린지', finalWave: 70, hpMul: 1.0, bossEvery: 10,
      tagline: '칸 12개 · 라이프 10 · 상위 등급 확률 절반',
      desc: '공간과 여유가 모두 부족하다. 뽑기에 기대지 말고 합성으로 올라가야 한다.',
      modifiers: {
        slotLimit: 14,
        lifeMul: 0.75,
        startGoldMul: 1.3,
        tierMul: { T3: 0.75, T4: 0.65, T5: 0.55 }
      }
    }
  };

  RPD.MODE_ORDER = ['NORMAL', 'ENDLESS', 'BOSS_RUSH', 'CHALLENGE'];

  /* 일반 모드의 난이도.
   * 핵심은 적 체력(hpMul)이고, 판의 "여유"를 바꾸는 라이프·보스 체력·수입을 함께 조금씩 움직인다.
   * 체력만 올리면 어려움·지옥이 "오래 걸리는 보통"이 될 뿐이라, 실수를 받아 주는 폭(라이프)도 줄인다.
   * 보통이 지금까지의 균형이다(모든 배율 1). 예상 클리어율은 자동 플레이 30판 실측값이다. */
  RPD.Difficulties = {
    EASY: {
      id: 'EASY', label: '쉬움', color: '#5ee08a',
      hpMul: 0.6, lifeAdd: 20, bossShareMul: 0.85, goldMul: 1.08,
      desc: '적 체력 -40% · 라이프 +20 · 보스 약화 · 수입 +8%'
    },
    NORMAL: {
      id: 'NORMAL', label: '보통', color: '#62a4ff',
      hpMul: 1, lifeAdd: 0, bossShareMul: 1, goldMul: 1,
      desc: '기준 난이도'
    },
    HARD: {
      id: 'HARD', label: '어려움', color: '#ffb35c',
      hpMul: 1.3, lifeAdd: -10, bossShareMul: 1.15, goldMul: 1,
      desc: '적 체력 +30% · 라이프 -10 · 보스 강화'
    },
    HELL: {
      id: 'HELL', label: '지옥', color: '#ff5f6d',
      hpMul: 1.7, lifeAdd: -20, bossShareMul: 1.3, goldMul: 0.92,
      desc: '적 체력 +70% · 라이프 -20 · 보스 크게 강화 · 수입 -8%'
    }
  };
  RPD.DIFFICULTY_ORDER = ['EASY', 'NORMAL', 'HARD', 'HELL'];

  /* 모드 + 난이도 → 이번 판에 실제로 쓰는 모드. 난이도는 일반 모드에만 있다. */
  RPD.effectiveMode = function (modeId, diffId) {
    var base = RPD.Modes[modeId] || RPD.Modes.NORMAL;
    var diff = (base.id === 'NORMAL' && RPD.Difficulties[diffId]) || RPD.Difficulties.NORMAL;
    var mods = {};
    var k;
    for (k in (base.modifiers || {})) mods[k] = base.modifiers[k];
    mods.bossShareMul = (mods.bossShareMul || 1) * diff.bossShareMul;
    mods.goldMul = (mods.goldMul || 1) * diff.goldMul;
    var mode = {};
    for (k in base) mode[k] = base[k];
    mode.hpMul = (base.hpMul || 1) * diff.hpMul;
    mode.modifiers = mods;
    mode.difficulty = diff.id;
    mode.lifeAdd = diff.lifeAdd;
    mode.baseLabel = base.label;
    mode.label = base.id === 'NORMAL' ? base.label + ' · ' + diff.label : base.label;
    // 기록은 난이도별로 따로 남긴다
    mode.recordKey = base.id === 'NORMAL' ? 'NORMAL:' + diff.id : base.id;
    return mode;
  };

  /* 모드 보정값 조회. 모드가 지정하지 않으면 기본값을 준다. */
  RPD.modeMod = function (key, fallback) {
    var m = RPD.GameManager && RPD.GameManager.mode && RPD.GameManager.mode.modifiers;
    var v = m ? m[key] : undefined;
    return v === undefined ? fallback : v;
  };

})(typeof window !== 'undefined' ? window : globalThis);
