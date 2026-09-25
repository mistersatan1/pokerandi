/* enemies.js — 적 아키타입.
 *
 * 원칙: 체력만 다른 적은 만들지 않는다. 각 적은 "이 적에게 통하는 것"이 서로 달라야 한다.
 *   질풍  → 슬로우/빙결이 없으면 그냥 지나간다
 *   철갑  → 방어력이 높아 잔딜이 안 통한다. 고스트(방어 무시)나 강철(방어 감소)이 답
 *   재생체 → 잔딜로는 절대 못 죽인다. 순간 화력이 필요
 *   분열체 → 단일 딜러로 잡으면 파편이 두 배로 늘어난다. 광역이 답
 *   보막  → 실드가 타격 횟수에 비례해 깎인다. 연쇄/다단히트가 답
 *
 * hp / speed 는 웨이브 1 기준값이다. 실제 수치는 WaveData.enemyMaxHp 로 스케일된다.
 * 보스 체력은 여기 hp 값을 쓰지 않는다. WaveData.enemyMaxHp 가 "직전 웨이브를 잡는 데
 * 든 일의 몇 배인가"로 계산한다. bossToughness 는 그 위에 얹는 보스별 개성 배수다.
 * (hp 는 웨이브 1 기준 참고값으로만 남겨 둔다)
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  var E = {
    grunt: {
      id: 'grunt', name: '잡졸', role: '기본',
      hp: 100, speed: 82, armor: 0, bounty: 1.0, lifeCost: 1,
      size: 26, color: '#8f9b7e',
      sprite: 'assets/enemies/grunt.png',
      desc: '기준이 되는 적. 특별한 저항이 없다.'
    },

    swift: {
      id: 'swift', name: '질풍', role: '고속',
      hp: 58, speed: 196, armor: 0, bounty: 1.1, lifeCost: 1,
      size: 22, color: '#6fd4c4',
      sprite: 'assets/enemies/swift.png',
      desc: '이동속도 2.4배. 사거리가 짧으면 손도 못 대고 놓친다.'
    },

    tank: {
      id: 'tank', name: '육중', role: '탱커',
      hp: 460, speed: 54, armor: 6, bounty: 2.4, lifeCost: 1,
      size: 34, color: '#a07b52',
      sprite: 'assets/enemies/tank.png',
      desc: '체력이 매우 높고 느리다. 지속 피해(화상·독)로 녹이는 편이 낫다.'
    },

    armored: {
      id: 'armored', name: '철갑', role: '방어형',
      hp: 210, speed: 72, armor: 52, bounty: 2.0, lifeCost: 1,
      size: 29, color: '#93a2b3',
      sprite: 'assets/enemies/armored.png',
      desc: '방어력이 높아 약한 타격이 거의 안 들어간다. 방어 무시·방어 감소가 답.'
    },

    swarm: {
      id: 'swarm', name: '무리', role: '군집',
      hp: 44, speed: 98, armor: 0, bounty: 0.45, lifeCost: 1,
      size: 18, color: '#b8c465',
      sprite: 'assets/enemies/swarm.png',
      packSize: 8,           // 한 번에 이만큼 몰려나온다
      packInterval: 0.12,
      desc: '한 번에 여덟 마리씩 몰려온다. 단일 딜러만으로는 감당이 안 된다.'
    },

    regen: {
      id: 'regen', name: '재생체', role: '재생',
      hp: 280, speed: 70, armor: 4, bounty: 2.2, lifeCost: 1,
      size: 28, color: '#7fc98a',
      sprite: 'assets/enemies/regen.png',
      regenPerSecond: 0.035,   // 최대 체력의 3.5%/초
      desc: '초당 체력 3.5% 회복. 잔딜로는 영원히 안 죽는다.'
    },

    splitter: {
      id: 'splitter', name: '분열체', role: '분열',
      hp: 230, speed: 76, armor: 2, bounty: 1.6, lifeCost: 1,
      size: 30, color: '#c07fd0',
      sprite: 'assets/enemies/splitter.png',
      splitInto: { id: 'splitling', count: 2, spread: 34 },
      desc: '죽으면 파편 두 마리로 쪼개진다. 광역이 없으면 오히려 수가 늘어난다.'
    },

    splitling: {
      id: 'splitling', name: '파편', role: '분열 잔해',
      hp: 76, speed: 116, armor: 0, bounty: 0.5, lifeCost: 1,
      size: 19, color: '#d9a5e4',
      sprite: 'assets/enemies/splitling.png',
      hidden: true,          // 웨이브 구성표에는 직접 등장하지 않는다
      desc: '분열체가 남긴 조각. 본체보다 빠르다.'
    },

    shielded: {
      id: 'shielded', name: '보막', role: '보호막',
      hp: 190, speed: 74, armor: 0, bounty: 2.0, lifeCost: 1,
      size: 28, color: '#7f9ee0',
      sprite: 'assets/enemies/shielded.png',
      shieldRatio: 0.9,      // 최대 체력의 90%만큼 실드를 추가로 가진다
      shieldFlatReduction: 6, // 실드는 타격 1회당 최소 6 씩 깎인다 → 다단히트가 유리
      desc: '실드가 먼저 깎인다. 한 방보다 여러 번 때리는 쪽이 잘 듣는다.'
    },

    /* ---------- 보스 ---------- */
    boss_charger: {
      id: 'boss_charger', name: '폭주대장', role: '보스',
      hp: 3200, bossToughness: 0.9, speed: 46, armor: 12, bounty: 0, lifeCost: 5,
      size: 54, color: '#e0554f',
      sprite: 'assets/enemies/boss_charger.png',
      isBoss: true,
      timeLimit: 60,
      enrageSpeedMul: 2.6,
      // 주기 패턴: 잡몹을 계속 불러 광역 딜러가 놀지 않게 만든다
      patterns: [
        // 첫 보스다. 질풍(속도 2.4배)을 20마리 풀면 약한 보드는 손도 못 댄다.
        // 증원의 목적은 "광역 딜러가 놀지 않게"지, 여기서 판을 끝내는 게 아니다.
        { id: 'summon', label: '증원', first: 9, every: 15,
          enemyId: 'grunt', count: 3, spread: 40 }
      ],
      // 체력 절반에서 한 번 더 빨라진다 — 사거리 짧은 배치가 흔들린다
      phase2: { at: 0.5, label: '가속', speedMul: 1.45,
                note: '이동속도가 크게 오른다' },
      desc: '주기적으로 잡졸을 부른다. 절반부터 빨라지고, 60초가 지나면 출구로 돌진한다.'
    },

    boss_warden: {
      id: 'boss_warden', name: '방해자', role: '보스',
      hp: 11500, bossToughness: 1.05, speed: 42, armor: 34, bounty: 0, lifeCost: 5,
      size: 58, color: '#c95fd0',
      sprite: 'assets/enemies/boss_warden.png',
      isBoss: true,
      timeLimit: 60,
      enrageSpeedMul: 2.6,
      // 침묵: 포켓몬 몇 칸을 잠시 못 쏘게 만든다.
      // "한 마리에 화력을 몰아주는" 배치를 벌주는 패턴이다.
      patterns: [
        { id: 'silence', label: '침묵', first: 9, every: 11, slots: 2, duration: 3.5 },
        { id: 'summon', label: '증원', first: 16, every: 18,
          enemyId: 'armored', count: 2, spread: 34 }
      ],
      phase2: { at: 0.5, label: '경화', armorMul: 2.0,
                note: '방어력이 두 배가 된다' },
      desc: '슬롯을 침묵시키고 철갑을 부른다. 절반부터 방어력이 두 배가 된다.'
    },

    boss_breaker: {
      id: 'boss_breaker', name: '파괴자', role: '보스',
      hp: 17500, bossToughness: 1.15, speed: 40, armor: 48, bounty: 0, lifeCost: 8,
      size: 64, color: '#f0742e',
      sprite: 'assets/enemies/boss_breaker.png',
      isBoss: true,
      timeLimit: 75,
      enrageSpeedMul: 3.0,
      patterns: [
        { id: 'shockwave', label: '충격파', first: 8, every: 10, radius: 240, duration: 2.2 },
        { id: 'silence', label: '침묵', first: 14, every: 13, slots: 3, duration: 3.0 },
        { id: 'summon', label: '증원', first: 11, every: 15,
          enemyId: 'shielded', count: 3, spread: 38 }
      ],
      phase2: { at: 0.5, label: '폭주', speedMul: 1.3, armorMul: 1.6, patternSpeedMul: 0.65,
                note: '패턴 주기가 짧아지고 더 단단해진다' },
      desc: '충격파로 근처 포켓몬을 기절시키고, 침묵과 증원을 함께 쓴다. 절반부터 패턴이 빨라진다.'
    }
  };

  /* ---------- 정예 (세션 33 ④) — 플레이어가 [정예 소환]으로 불러낸다 ----------
   * 웨이브에는 안 나온다. 체력은 고정값이 아니라 "지금 라운드 잡몹 전체 체력의 몇 배"(eliteShare)다 —
   * 어느 라운드에 불러도 같은 체감이 되게(보스 체력과 같은 방식). 보상·벌칙은 EliteManager 가 준다:
   * 처치 보상(bounty)과 새어 나갈 때 라이프(lifeCost)는 0 으로 두고 그쪽에서 따로 계산한다. */
  E.elite_1 = {
    id: 'elite_1', name: '정예 · 하급', role: '정예', isElite: true, eliteShare: 2.0, skinAs: 'tank',
    hp: 1, speed: 58, armor: 8, bounty: 0, lifeCost: 0, size: 32, color: '#c89bff',
    sprite: 'assets/enemies/tank.png', desc: '불러낸 정예. 잡으면 골드와 안흔함 포켓몬, 놓치면 벌칙.'
  };
  E.elite_2 = {
    id: 'elite_2', name: '정예 · 중급', role: '정예', isElite: true, eliteShare: 4.5, skinAs: 'armored',
    hp: 1, speed: 54, armor: 24, bounty: 0, lifeCost: 0, size: 36, color: '#b07aff',
    sprite: 'assets/enemies/armored.png', desc: '불러낸 정예. 잡으면 골드와 특별함 포켓몬, 놓치면 벌칙.'
  };
  E.elite_3 = {
    id: 'elite_3', name: '정예 · 상급', role: '정예', isElite: true, eliteShare: 9.0, skinAs: 'shielded',
    hp: 1, speed: 50, armor: 40, bounty: 0, lifeCost: 0, size: 40, color: '#9a55ff',
    sprite: 'assets/enemies/shielded.png', desc: '불러낸 정예. 잡으면 골드와 희귀함 포켓몬, 놓치면 벌칙.'
  };

  // 보스 처치 보상은 웨이브 기반이라 개체 데이터가 아니라 여기서 계산한다.
  RPD.EnemyData = E;

  RPD.EnemyData.list = Object.keys(E).filter(function (k) {
    return typeof E[k] === 'object' && E[k].id;
  });

  RPD.EnemyData.get = function (id) {
    var def = E[id];
    if (!def) console.warn('[EnemyData] 알 수 없는 적 id: ' + id);
    return def || E.grunt;
  };
})(typeof window !== 'undefined' ? window : globalThis);
