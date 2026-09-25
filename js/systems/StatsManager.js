/* StatsManager.js — 한 판의 기록.
 * 게임 오버 화면과 (PHASE 13의) 최고 기록 저장이 여기서 값을 가져간다.
 * 어떤 시스템도 StatsManager 를 호출하지 않는다. 이벤트만 듣는다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  var StatsManager = {
    kills: 0,
    leaks: 0,
    bossKills: 0,
    goldEarned: 0,
    highestWave: 0,
    damageDealt: 0,
    killsByType: {}
  };

  StatsManager.reset = function () {
    this.kills = 0;
    this.leaks = 0;
    this.bossKills = 0;
    this.goldEarned = 0;
    this.highestWave = 0;
    this.damageDealt = 0;
    this.killsByType = {};
  };

  StatsManager.init = function () {
    var S = this;

    RPD.bus.on('enemy:died', function (p) {
      S.kills += 1;
      if (p.enemy.isBoss) S.bossKills += 1;
      S.killsByType[p.enemy.defId] = (S.killsByType[p.enemy.defId] || 0) + 1;
    });

    RPD.bus.on('enemy:leaked', function () { S.leaks += 1; });

    RPD.bus.on('enemy:damaged', function (p) { S.damageDealt += p.amount; });

    RPD.bus.on('economy:gold', function (p) {
      if (p.delta > 0) S.goldEarned += p.delta;
    });

    RPD.bus.on('game:wave', function (p) {
      if (p.wave > S.highestWave) S.highestWave = p.wave;
    });
  };

  StatsManager.summary = function () {
    return {
      wave: this.highestWave,
      kills: this.kills,
      leaks: this.leaks,
      bossKills: this.bossKills,
      goldEarned: this.goldEarned,
      damageDealt: Math.round(this.damageDealt),
      elapsed: RPD.GameManager.elapsed
    };
  };

  RPD.StatsManager = StatsManager;
})(typeof window !== 'undefined' ? window : globalThis);
