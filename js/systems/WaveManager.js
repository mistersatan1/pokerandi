/* WaveManager.js — 라운드 진행 (v2 · 연속 진행).
 *
 *   IDLE ──시작──▶ SPAWNING ──스폰 끝──▶ CLEARING ──▶ INTERLUDE(0.8초) ──▶ 다음 라운드
 *                      ▲                                                      │
 *                      └──────────────────────────────────────────────────────┘
 *
 * v1 은 라운드마다 8초를 세우고 그동안만 조작하게 했다. 전체 시간의 16%가 정지였고,
 * "전투가 이어지고 있다"는 느낌이 끊겼다.
 *
 * v2 는 멈추지 않는다. 소환·배치·조합·강화를 전투 중에 한다.
 * 라운드 사이에는 0.8초짜리 피드백만 있다.
 *
 * CLEARING 을 무한정 기다리지는 않는다. 적을 다 잡으면 바로 다음 라운드가 오지만,
 * 못 잡고 있으면 carryOverLimit 초 뒤에 다음 라운드가 겹쳐서 들어온다.
 * 강하면 빠르게, 밀리면 더 몰리는 구조다 — 이게 랜덤 디펜스의 압박감이다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;
  var GM = RPD.GameManager;
  var S = RPD.GameState;

  var PHASE = {
    IDLE: 'IDLE',
    SPAWNING: 'SPAWNING',
    CLEARING: 'CLEARING',
    INTERLUDE: 'INTERLUDE'
  };

  var WaveManager = {
    phase: PHASE.IDLE,
    wave: 0,
    plan: null,
    timer: 0,          // SPAWNING 이면 경과 시간, 그 외에는 남은 시간
    carryOver: 0,      // CLEARING 에서 기다린 시간
    spawnCursor: 0,
    spawnedUnits: 0,
    PHASE: PHASE
  };

  WaveManager.reset = function () {
    this.phase = PHASE.IDLE;
    this.wave = 0;
    this.plan = null;
    this.timer = 0;
    this.carryOver = 0;
    this.spawnCursor = 0;
    this.spawnedUnits = 0;
    emitPhase(this);
  };

  WaveManager.begin = function () {
    if (this.phase !== PHASE.IDLE) return;
    GM.setState(S.RUNNING);
    this.startRound(1);
  };

  /* ---------- 라운드 시작 ---------- */

  WaveManager.startRound = function (round) {
    this.wave = round;
    this.plan = RPD.WaveData.build(round, GM.mode);
    this.phase = PHASE.SPAWNING;
    this.timer = 0;
    this.carryOver = 0;
    this.spawnCursor = 0;
    this.spawnedUnits = 0;

    GM.setState(S.RUNNING);
    GM.setWave(round);
    GM.refillShield();
    RPD.SummonManager.grantRound();

    // 새 등급이 열리는 라운드라면 알린다 — 이 게임에서 가장 큰 기대 지점이다
    var unlocked = RPD.tierUnlockedAt(round);
    if (unlocked && round > 1) {
      RPD.bus.emit('tier:unlocked', { tier: unlocked, round: round });
    }

    RPD.bus.emit('wave:started', this.plan);
    emitPhase(this);
  };

  /* ---------- 갱신 ---------- */

  WaveManager.update = function (dt) {
    if (GM.state === S.GAMEOVER || GM.state === S.VICTORY) return;

    switch (this.phase) {
      case PHASE.SPAWNING:
        this.timer += dt;
        while (this.spawnCursor < this.plan.entries.length &&
               this.plan.entries[this.spawnCursor].at <= this.timer) {
          var entry = this.plan.entries[this.spawnCursor];
          this.spawnedUnits += RPD.EnemyManager.spawnEntry(entry.enemyId, this.wave).length;
          this.spawnCursor += 1;
        }
        if (this.spawnCursor >= this.plan.entries.length) {
          this.phase = PHASE.CLEARING;
          this.carryOver = 0;
          RPD.bus.emit('wave:spawnDone', this.plan);
        }
        emitPhase(this);
        break;

      case PHASE.CLEARING:
        this.carryOver += dt;
        /* 보스 라운드는 겹쳐 넘어가지 않는다 — 보스가 필드에서 완전히 사라질 때까지
         * (잡히거나 끝까지 걸어 나가거나) 기다린다. 그 외 라운드는 원래대로,
         * 너무 오래 끌면 다음 라운드가 겹쳐 들어온다. */
        if (RPD.EnemyManager.waveAliveCount() === 0 ||
            (!this.plan.isBoss && this.carryOver >= RPD.WaveData.carryOverLimit)) {
          this.complete();
        } else {
          emitPhase(this);
        }
        break;

      case PHASE.INTERLUDE:
        this.timer -= dt;
        if (this.timer <= 0) this.startRound(this.wave + 1);
        else emitPhase(this);
        break;
    }
  };

  /* ---------- 라운드 종료 ---------- */

  WaveManager.complete = function () {
    var round = this.wave;
    var cleared = RPD.EnemyManager.waveAliveCount() === 0;

    var reward = RPD.EconomyManager.waveClearReward(round);
    var interest = RPD.EconomyManager.payInterest();

    RPD.bus.emit('wave:cleared', {
      wave: round, reward: reward, interest: interest, perfect: cleared
    });

    var final = GM.mode.finalWave;
    if (final > 0 && round >= final) {
      GM.setState(S.VICTORY);
      RPD.bus.emit('game:victory', { wave: round, elapsed: GM.elapsed });
      return;
    }

    // 다음 라운드에 무엇이 달라지는지 미리 알린다 (기획 §28)
    var preview = RPD.SummonTable.previewNext(round);
    if (preview) RPD.bus.emit('wave:preview', preview);

    this.phase = PHASE.INTERLUDE;
    this.timer = RPD.WaveData.interludeSeconds;
    emitPhase(this);
  };

  function emitPhase(wm) {
    RPD.bus.emit('wave:phase', {
      phase: wm.phase,
      wave: wm.wave,
      timer: Math.max(0, wm.timer),
      remaining: RPD.EnemyManager.aliveCount(),
      total: wm.plan ? wm.plan.totalEnemies : 0,
      spawned: wm.spawnedUnits,
      isBoss: wm.plan ? wm.plan.isBoss : false
    });
  }

  WaveManager.emitPhase = function () { emitPhase(this); };

  RPD.WaveManager = WaveManager;
})(typeof window !== 'undefined' ? window : globalThis);
