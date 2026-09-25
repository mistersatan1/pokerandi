/* GameManager.js — 전역 상태와 상태 머신.
 * 다른 시스템은 여기서 상태를 읽고, 변경은 반드시 이 파일의 메서드를 통해서만 한다.
 * 상태가 바뀌면 EventBus 로 알린다 → UI 는 GameManager 를 폴링하지 않는다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;
  var CFG = RPD.Config;
  var S = RPD.GameState;

  var GameManager = {
    state: S.BOOT,
    mode: RPD.Modes.NORMAL,
    wave: 0,
    gold: 0,
    life: 0,
    shield: 0,        // 페어리 시너지 보호막. 라이프보다 먼저 깎인다.
    elapsed: 0,
    started: false
  };

  GameManager.reset = function (modeId, diffId) {
    // 난이도를 주지 않으면 지난번 난이도를 유지한다(다시 시작 버튼)
    var keep = this.mode && this.mode.id === modeId ? this.mode.difficulty : 'NORMAL';
    this.mode = RPD.effectiveMode(modeId, diffId || keep);
    this.wave = 0;
    this.targetAll = null;   // 공격 대상 "전체 적용" — 판마다 초기화(UnitManager.setTargetingAll)
    var mod = this.mode.modifiers || {};
    var dexGold = RPD.DexBonus ? RPD.DexBonus.totals().startGold : 0;
    this.gold = Math.round(CFG.startGold * (mod.startGoldMul || 1)) + dexGold;
    this.life = Math.max(1, Math.round(CFG.startLife * (mod.lifeMul || 1)) + (this.mode.lifeAdd || 0));
    this.shield = 0;
    this.elapsed = 0;
    this.started = false;
    RPD.Utils.resetUid();
    // 이미 READY 였어도 리셋 사실을 UI 에 반드시 알린다 (setState 는 같은 값이면 무시하므로)
    this.state = S.BOOT;
    this.setState(S.READY);
    RPD.bus.emit('game:reset', this);
    this.emitStats();
  };

  GameManager.setState = function (next) {
    if (this.state === next) return;
    var prev = this.state;
    this.state = next;
    RPD.bus.emit('game:state', { from: prev, to: next });
  };

  GameManager.isPlayable = function () {
    return this.state === S.RUNNING;
  };

  GameManager.addGold = function (amount, reason) {
    if (!amount) return;
    this.gold = Math.max(0, this.gold + amount);
    RPD.bus.emit('economy:gold', { gold: this.gold, delta: amount, reason: reason || '' });
    this.emitStats();
  };

  GameManager.canAfford = function (cost) { return this.gold >= cost; };

  GameManager.spendGold = function (cost, reason) {
    if (!this.canAfford(cost)) return false;
    this.addGold(-cost, reason || 'spend');
    return true;
  };

  GameManager.loseLife = function (amount) {
    amount = amount || 1;

    // 보호막이 먼저 받아 낸다
    if (this.shield > 0) {
      var absorbed = Math.min(this.shield, amount);
      this.shield -= absorbed;
      amount -= absorbed;
      RPD.bus.emit('game:shield', { shield: this.shield, absorbed: absorbed });
      if (amount <= 0) { this.emitStats(); return; }
    }

    this.life = Math.max(0, this.life - amount);
    RPD.bus.emit('game:life', { life: this.life, delta: -amount });
    this.emitStats();
    if (this.life <= 0 && this.state !== S.GAMEOVER) {
      this.setState(S.GAMEOVER);
      RPD.bus.emit('game:over', { wave: this.wave, elapsed: this.elapsed });
    }
  };

  /* 마지막 라운드 보스를 놓치면 라이프가 남아 있어도 진다 (세션 42 — 클리어 = 마지막 보스 처치).
   * 예전엔 보스가 걸어 나가도 라이프만 남으면 클리어였고, 노멀 70R 보스는 실제로 아무도 못 잡았다. */
  GameManager.failFinalBoss = function () {
    if (this.state === S.GAMEOVER || this.state === S.VICTORY) return;
    this.setState(S.GAMEOVER);
    RPD.bus.emit('game:over', { wave: this.wave, elapsed: this.elapsed, reason: 'finalBoss' });
  };

  GameManager.isFinalWave = function (wave) {
    var f = this.mode && this.mode.finalWave;
    return f > 0 && wave >= f;
  };

  GameManager.gainLife = function (amount) {
    this.life += amount;
    RPD.bus.emit('game:life', { life: this.life, delta: amount });
    this.emitStats();
  };

  GameManager.setWave = function (n) {
    this.wave = n;
    RPD.bus.emit('game:wave', { wave: n });
    this.emitStats();
  };

  /* 웨이브가 시작될 때 페어리 보호막을 다시 채운다.
   * 쌓이지 않고 매번 새로 채워진다 — 모아 뒀다 한 번에 쓰는 플레이를 막는다. */
  GameManager.refillShield = function () {
    var amount = RPD.SynergyManager.bonus.lifeShield;
    if (amount === this.shield) return;
    this.shield = amount;
    RPD.bus.emit('game:shield', { shield: this.shield, absorbed: 0 });
    this.emitStats();
  };

  GameManager.emitStats = function () {
    RPD.bus.emit('stats:changed', {
      wave: this.wave, gold: this.gold, life: this.life, shield: this.shield,
      elapsed: this.elapsed, mode: this.mode
    });
  };

  // 고정 timestep 으로만 호출된다.
  GameManager.update = function (dt) {
    if (this.state === S.RUNNING) {
      this.elapsed += dt;
    }
  };

  RPD.GameManager = GameManager;
})(typeof window !== 'undefined' ? window : globalThis);
