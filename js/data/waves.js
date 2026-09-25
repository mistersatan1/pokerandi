/* waves.js — 웨이브 구성과 스케일링.
 *
 * 웨이브를 하나하나 손으로 적지 않는다. 구간(band) 규칙 + 가중치 풀로 만들어
 * 엔드리스에서도 같은 규칙이 계속 굴러가게 한다.
 * 새 적을 웨이브에 넣고 싶으면 아래 bands 의 pool 에 id 와 가중치만 추가하면 된다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;
  var U = RPD.Utils;

  var WaveData = {
    /* v2 는 라운드 사이를 세우지 않는다.
     * v1 은 라운드마다 8초 정지였고 그게 전체 시간의 16%였다.
     * 지금은 라운드가 끝나면 0.8초 피드백만 주고 바로 다음이 온다. */
    interludeSeconds: 0.6,
    // 적을 못 잡고 있어도 이 시간이 지나면 다음 라운드가 겹쳐 들어온다.
    // 강하면 빠르게 넘어가고, 밀리면 더 몰린다.
    // 6초면 14.2분, 4.5초면 11.2분이지만 클리어율이 40%→20%로 떨어졌다.
    // 5.5초로 두고 물량을 줄여 시간을 벌었다.
    carryOverLimit: 5.5,

    /* 라운드당 체력 배율. 50라운드 기준으로 다시 잡았다.
     * 1.084^49 ≈ 51배. 플레이어 전력이 흔함 몇 마리(보드 65 DPS)에서
     * 희귀함 중심 보드(약 14,000 DPS)까지 220배 자라는 것과 짝을 맞춘 값이다.
     * 20라운드용이던 1.202 를 그대로 쓰면 50라운드에서 8700배가 된다. */
    hpGrowth: 1.109,
    /* 후반 곡선 (세션 33 — 노멀·챌린지 70라운드).
     * 한 성장률로 70까지 늘리면 50→70 사이 체력이 7.9배가 돼 60 전후에서 일괄 붕괴했다(노멀 클리어 18%).
     * 요청: "후반부만 완만하게 하되, 불멸·초월급이 없으면 60을 넘기 힘들게".
     *   ~50    hpGrowth   그대로
     *   51~60  lateGrowth 완만 — 여기까지는 전설 보드로 따라온다
     *   61     wallStep   한 번에 오르는 벽 — 불멸·초월 없이는 여기서 막힌다
     *   62~    wallGrowth 거의 평평(벽을 넘은 보드는 끝까지 간다 — 벽 뒤에 또 벽을 만들지 않는다)
     * 기울기(60 이후 라운드마다 1.17)로 먼저 시도했는데, 61~62 에선 오히려 예전보다 쉬워
     * 불멸 없는 봇이 22/23 으로 60을 넘었다 — 벽은 기울기가 아니라 계단이어야 했다. */
    lateFrom: 50, lateGrowth: 1.07,
    wallAt: 61, wallStep: 3.5, wallGrowth: 1.02,   // 2.5 → 3.5: 역할 보정·버퍼 상향 뒤 불멸 없이도 넘는 판이 늘어 되돌렸다
    speedGrowth: 1.006,        // 이동속도는 아주 천천히만 오른다 (사거리 설계가 무너지지 않게)
    armorGrowth: 1.2,          // 웨이브당 방어력 가산


    /* 구간이 바뀌는 순간 적 구성이 통째로 갈리면 난이도가 절벽처럼 뛴다.
     * (블렌딩 없이 재보면 웨이브 11에서 필요 DPS 가 3.6배로 뛴다 — 보스 직후에 벽이 생긴다.)
     * 그래서 새 구간의 앞 몇 웨이브는 이전 구간 풀과 섞어서 서서히 갈아탄다. */
    blendWaves: 5
  };

  /* 구간 정의. until 은 "이 웨이브까지"를 뜻한다. 마지막 구간은 until: Infinity. */
  /* 구간 정의. until 은 "이 라운드까지".
   *
   * 50라운드를 10~12분에 끝내려면 라운드당 스폰 시간이 11초를 넘으면 안 된다.
   * count × interval 이 그 예산이다. v1(20라운드용)은 후반에 24초까지 갔다.
   * 난이도는 물량이 아니라 체력·방어력·보스 패턴으로 올린다 (기획 §23). */
  WaveData.bands = [
    { until: 10, label: '흔함 구간',
      pool: { grunt: 100 },
      count: function (w) { return Math.round(8 + w * 0.6); },
      interval: 0.80 },
    { until: 20, label: '속공 합류',
      pool: { grunt: 58, swift: 30, tank: 7, armored: 5 },
      count: function (w) { return Math.round(10 + w * 0.5); },
      interval: 0.62 },
    { until: 30, label: '중장 합류',
      pool: { grunt: 34, swift: 22, tank: 17, armored: 18, swarm: 9 },
      count: function (w) { return Math.round(12 + w * 0.4); },
      interval: 0.52 },
    /* 새 적은 한 구간에 1종만 넣는다.
     * 예전에는 재생·분열·보막 셋이 31라운드에 한꺼번에 들어왔고,
     * 그 직후(30~34)가 사망의 대부분을 먹었다(20판 중 8판). 셋을 나눠 넣는다. */
    { until: 34, label: '재생 합류',
      pool: { grunt: 32, swift: 16, tank: 16, armored: 16, swarm: 8, regen: 12 },
      count: function (w) { return Math.round(14 + w * 0.35); },
      interval: 0.45 },
    { until: 40, label: '분열 합류',
      pool: { grunt: 24, swift: 16, tank: 16, armored: 16, swarm: 8, regen: 12, splitter: 10 },
      count: function (w) { return Math.round(14 + w * 0.35); },
      interval: 0.45 },
    /* 마지막 구간에서 간격을 0.45 → 0.40 으로 줄였더니 같은 물량이 더 빨리 쏟아져
     * 이전 라운드 잔당과 겹쳤다. 한 번 밀리면 눈덩이처럼 쌓여 42라운드에서 붕괴했다.
     * 간격을 유지하고 물량 상한만 둔다. */
    { until: Infinity, label: '심화',
      pool: { grunt: 12, swift: 16, tank: 18, armored: 16, swarm: 8, regen: 12, splitter: 10, shielded: 8 },
      count: function (w) { return Math.min(26, Math.round(14 + w * 0.22)); },
      interval: 0.45 }
  ];

  /* 해당 웨이브에서 실제로 쓸 적 가중치 풀.
   * 구간 경계 직후에는 이전 구간 풀과 선형으로 섞는다. */
  WaveData.poolFor = function (wave) {
    var band = this.bandFor(wave);
    var idx = this.bands.indexOf(band);
    if (idx <= 0) return band.pool;

    var prev = this.bands[idx - 1];
    var into = wave - (prev.until + 1);          // 이 구간에 들어온 지 몇 웨이브째인가
    if (into >= this.blendWaves) return band.pool;

    var t = (into + 1) / (this.blendWaves + 1);  // 0 < t < 1, 새 구간의 비중
    var mixed = {};
    var k;
    for (k in prev.pool) mixed[k] = (mixed[k] || 0) + prev.pool[k] * (1 - t);
    for (k in band.pool) mixed[k] = (mixed[k] || 0) + band.pool[k] * t;
    return mixed;
  };

  WaveData.bandFor = function (wave) {
    for (var i = 0; i < this.bands.length; i++) {
      if (wave <= this.bands[i].until) return this.bands[i];
    }
    return this.bands[this.bands.length - 1];
  };

  WaveData.isBossWave = function (wave, mode) {
    var every = (mode && mode.bossEvery) || 10;
    return wave > 0 && wave % every === 0;
  };

  WaveData.bossIdFor = function (wave, mode) {
    var every = (mode && mode.bossEvery) || 10;
    var nth = Math.floor(wave / every);
    var order = ['boss_charger', 'boss_warden', 'boss_breaker'];
    // 4번째 이후 보스부터는 순환하며 체력 스케일만 계속 오른다.
    return order[Math.min(nth - 1, order.length - 1)] || order[0];
  };

  /* 웨이브 하나의 스폰 계획을 만든다.
   * 반환: { wave, isBoss, label, entries: [{ enemyId, at }], totalEnemies }
   * at 은 웨이브 시작 후 몇 초에 나오는지.
   */
  WaveData.build = function (wave, mode) {
    var isBoss = this.isBossWave(wave, mode);
    var entries = [];

    if (isBoss) {
      /* 세션 33 ②: 보스 라운드엔 보스만 나온다. 호위를 없앴다 — 필드가 보스로만
       * 채워져야 "보스 라운드"라는 게 한눈에 보인다. 다음 라운드도 이 보스가
       * 필드에서 완전히 사라질 때까지(잡히거나 끝까지 걸어가거나) 안 넘어간다(WaveManager 쪽).
       *
       * 대가: 호위가 없어져 보스 라운드의 골드 수입이 줄었다 — 특히 매 웨이브가
       * 보스인 보스 러시 모드는 호위가 거의 유일한 수입원이었다. 보상을 올리는 건
       * 별도 요청(요청 5)에서 다룬다. */
      var bossId = this.bossIdFor(wave, mode);
      entries.push({ enemyId: bossId, at: 1.2 });
      return {
        wave: wave, isBoss: true, label: '보스',
        entries: entries, totalEnemies: countUnits(entries)
      };
    }

    var band = this.bandFor(wave);
    var pool = this.poolFor(wave);
    var total = band.count(wave);
    var t = 0;

    for (var i = 0; i < total; i++) {
      var id = U.weightedPick(pool);
      entries.push({ enemyId: id, at: t });
      // 군집은 한 덩어리로 몰려 나오므로 그다음 간격을 조금 벌린다.
      t += (id === 'swarm') ? band.interval * 1.8 : band.interval;
    }

    return {
      wave: wave, isBoss: false, label: band.label,
      entries: entries, totalEnemies: countUnits(entries)
    };
  };

  // 군집(packSize)은 항목 1개가 실제로는 여러 마리다. 남은 적 카운터가 맞도록 미리 센다.
  function countUnits(entries) {
    var n = 0;
    for (var i = 0; i < entries.length; i++) {
      var def = RPD.EnemyData.get(entries[i].enemyId);
      n += def.packSize || 1;
    }
    return n;
  }

  WaveData.countUnits = countUnits;

  /* ---------- 스케일링 ---------- */

  /* 초반 가중치.
   * 지수 곡선은 초반이 평평해서 1~20라운드가 너무 헐거웠다.
   * R1 에 ×1.45, R20 에 ×1.0 으로 선형 감소시켜 앞을 들어 올린다.
   * 후반은 건드리지 않으므로 전체 곡선이 완만해진다. */
  WaveData.earlyBoost = 0.45;
  WaveData.earlyUntil = 20;

  /* 1라운드 대비 체력 배율 — ~50 hpGrowth · 이후 lateGrowth · 61 에서 wallStep 계단 */
  WaveData.growthTo = function (wave) {
    var w = Math.max(1, wave);
    var a = Math.min(w, this.lateFrom) - 1;
    var b = Math.max(0, Math.min(w, this.wallAt - 1) - this.lateFrom);
    var c = Math.max(0, w - (this.wallAt - 1));
    var f = Math.pow(this.hpGrowth, a) * Math.pow(this.lateGrowth, b) * Math.pow(this.wallGrowth, c);
    if (w >= this.wallAt) f *= this.wallStep;
    return f;
  };

  WaveData.scaleHp = function (baseHp, wave, mode) {
    var modeMul = (mode && mode.hpMul) || 1;
    var early = 1 + this.earlyBoost * Math.max(0, (this.earlyUntil - wave) / (this.earlyUntil - 1));
    return Math.round(baseHp * this.growthTo(wave) * modeMul * early);
  };

  /* 보스 체력을 고정 배수로 정하면 모드가 바뀌는 순간 무너진다.
   * (엔드리스는 5웨이브마다 보스라 같은 배수가 벽이 되고, 후반에는 반대로 물러진다)
   * 그래서 "직전 웨이브를 잡는 데 든 일의 몇 배인가"로 정의한다.
   * 이러면 bossEvery 가 몇이든, 어느 웨이브에 나오든 체감 난이도가 유지된다. */
  WaveData.bossShareBase = 1.9;
  WaveData.bossShareStep = 0.12;
  WaveData.bossShareRampCap = 8;

  WaveData.bandBlendWaves = 3;   // 구간이 바뀔 때 기준선을 이만큼에 걸쳐 서서히 옮긴다

  function bandWaveHp(band, wave, mode) {
    var ids = Object.keys(band.pool);
    var weighted = 0, totalWeight = 0;

    for (var i = 0; i < ids.length; i++) {
      var def = RPD.EnemyData.get(ids[i]);
      var units = def.packSize || 1;
      weighted += band.pool[ids[i]] * WaveData.scaleHp(def.hp, wave, mode) * units;
      totalWeight += band.pool[ids[i]];
    }
    if (totalWeight === 0) return 0;
    return (weighted / totalWeight) * band.count(wave);
  }

  /* 그 웨이브가 잡몹으로만 구성됐다면 나왔을 총 체력 (보스 체력의 기준선).
   *
   * 구간 경계에서 값이 계단처럼 뛰면 보스 러시처럼 매 웨이브가 보스인 모드에서
   * 그 계단이 그대로 벽이 된다. 그래서 경계 직후 몇 웨이브 동안은
   * 이전 구간 기준선에서 새 구간 기준선으로 선형으로 옮겨 간다.
   * (실제 등장 구성은 그대로다. 보스 체력을 재는 자만 매끈해진다) */
  WaveData.trashWaveHp = function (wave, mode) {
    var band = this.bandFor(wave);
    var value = bandWaveHp(band, wave, mode);

    var idx = this.bands.indexOf(band);
    if (idx <= 0) return value;

    var prev = this.bands[idx - 1];
    var bandStart = prev.until + 1;
    var t = (wave - bandStart + 1) / this.bandBlendWaves;
    if (t >= 1) return value;

    var prevValue = bandWaveHp(prev, wave, mode);
    return prevValue + (value - prevValue) * Math.max(0, t);
  };

  /* 적 하나의 최종 최대 체력. */
  WaveData.enemyMaxHp = function (def, wave, mode) {
    if (def.isElite) return Math.round(this.trashWaveHp(Math.max(1, wave), mode) * def.eliteShare);
    if (!def.isBoss) return this.scaleHp(def.hp, wave, mode);

    var every = (mode && mode.bossEvery) || 10;
    var nth = Math.max(1, Math.round(wave / every));
    var ramp = Math.min(this.bossShareRampCap, Math.max(0, nth - 2));
    var share = this.bossShareBase + ramp * this.bossShareStep;

    // 모드가 보스 비중을 조정할 수 있다.
    // 보스 러시는 매 웨이브가 보스라, 같은 배수를 쓰면 2웨이브부터 벽이 된다.
    // 잡몹 웨이브의 체력은 여러 마리에 나뉘어 있지만 보스는 한 덩어리라
    // 광역 딜러가 통째로 놀기 때문이다.
    var modeMul = (mode && mode.modifiers && mode.modifiers.bossShareMul) || 1;

    var reference = this.trashWaveHp(Math.max(1, wave - 1), mode);
    // 마지막 라운드 보스 — 놓치면 진다(GameManager.failFinalBoss). 벽(61R) 뒤 체력을 그대로 물려받아 아무도 못 잡던 것을 모드별로 맞춘다.
    var mods = (mode && mode.modifiers) || {};
    if (mode && mode.finalWave > 0 && wave >= mode.finalWave && mods.finalBossHpMul != null) modeMul *= mods.finalBossHpMul;

    return Math.round(reference * share * modeMul * (def.bossToughness || 1));
  };

  WaveData.scaleSpeed = function (baseSpeed, wave) {
    return baseSpeed * Math.pow(this.speedGrowth, wave - 1);
  };

  WaveData.scaleArmor = function (baseArmor, wave) {
    return baseArmor + this.armorGrowth * (wave - 1);
  };


  RPD.WaveData = WaveData;
})(typeof window !== 'undefined' ? window : globalThis);
