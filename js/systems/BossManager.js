/* BossManager.js — 보스가 "그냥 체력 큰 적"이 되지 않게 하는 부분.
 *
 * 보스는 세 가지로 압박한다.
 *   주기 패턴  — 증원 / 침묵 / 충격파를 정해진 간격으로 쓴다
 *   페이즈 전환 — 체력 절반에서 한 번 더 세진다
 *   제한시간   — 시간이 다하면 출구로 돌진한다 (EnemyManager 가 처리)
 *
 * 패턴은 전부 데이터다(enemies.js 의 patterns). 새 보스를 만들 때
 * 이 파일을 고칠 일이 없도록, 여기에는 "패턴 종류를 실행하는 법"만 둔다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;
  var U = RPD.Utils;

  var BossManager = {
    boss: null,
    timers: [],      // 패턴별 다음 발동 시각
    phase: 1,
    clock: 0
  };

  BossManager.reset = function () {
    this.boss = null;
    this.timers = [];
    this.phase = 1;
    this.clock = 0;
    RPD.bus.emit('boss:cleared');
  };

  BossManager.init = function () {
    var self = this;

    RPD.bus.on('enemy:spawned', function (enemy) {
      if (enemy.isBoss) self.attach(enemy);
    });

    RPD.bus.on('enemy:died', function (p) {
      if (p.enemy === self.boss) self.reset();
    });

    RPD.bus.on('enemy:leaked', function (enemy) {
      if (enemy === self.boss) self.reset();
    });
  };

  BossManager.attach = function (boss) {
    this.boss = boss;
    this.phase = 1;
    this.clock = 0;

    var patterns = boss.def.patterns || [];
    this.timers = patterns.map(function (p) {
      return { pattern: p, nextAt: p.first != null ? p.first : (p.every || 10) };
    });

    boss.phase = 1;
    RPD.bus.emit('boss:appeared', boss);
  };

  BossManager.update = function (dt) {
    var boss = this.boss;
    if (!boss || !boss.alive) return;

    this.clock += dt;
    this.checkPhase(boss);

    var speedMul = (this.phase >= 2 && boss.def.phase2 && boss.def.phase2.patternSpeedMul)
      ? boss.def.phase2.patternSpeedMul : 1;

    for (var i = 0; i < this.timers.length; i++) {
      var t = this.timers[i];
      if (this.clock < t.nextAt) continue;
      run(boss, t.pattern);
      t.nextAt = this.clock + (t.pattern.every || 12) * speedMul;
    }
  };

  BossManager.checkPhase = function (boss) {
    var cfg = boss.def.phase2;
    if (!cfg || this.phase >= 2) return;
    if (boss.hp / boss.maxHp > cfg.at) return;

    this.phase = 2;
    boss.phase = 2;

    if (cfg.speedMul) boss.baseSpeed *= cfg.speedMul;
    if (cfg.armorMul) boss.armor *= cfg.armorMul;
    if (cfg.healRatio) boss.hp = Math.min(boss.maxHp, boss.hp + boss.maxHp * cfg.healRatio);

    RPD.bus.emit('boss:phase', { boss: boss, phase: 2, label: cfg.label, note: cfg.note });
  };

  /* ---------- 패턴 실행 ---------- */

  var HANDLERS = {
    /* 증원: 보스 근처에 잡몹을 풀어 놓는다.
     * 보스 혼자 오면 광역 딜러가 통째로 논다. 그걸 막는 장치다. */
    summon: function (boss, p) {
      var spawned = [];
      for (var i = 0; i < (p.count || 3); i++) {
        var offset = (i - ((p.count || 3) - 1) / 2) * (p.spread || 36);
        var child = RPD.EnemyManager.spawn(p.enemyId || 'grunt', boss.wave, {
          distance: Math.max(0, boss.distance + offset)
        });
        spawned.push(child);
      }
      return { enemies: spawned };
    },

    /* 침묵: 포켓몬 몇 칸을 잠시 못 쏘게 만든다.
     * 한 마리에 버프를 몰아주는 배치를 벌준다. */
    silence: function (boss, p) {
      var occupied = [];
      var slots = RPD.FieldManager.slots;
      for (var i = 0; i < slots.length; i++) {
        if (slots[i].unit) occupied.push(slots[i]);
      }
      if (!occupied.length) return null;

      // 강한 포켓몬부터 노린다. 무작위면 "아무 일도 안 일어난 것 같은" 판이 생긴다.
      occupied.sort(function (a, b) { return b.unit.dps - a.unit.dps; });

      var picked = [];
      var n = Math.min(p.slots || 2, occupied.length);
      for (var k = 0; k < n; k++) {
        RPD.UnitManager.disable(occupied[k].unit, p.duration || 3);
        picked.push(occupied[k].index);
      }
      return { slots: picked, duration: p.duration || 3 };
    },

    /* 충격파: 보스 주변 반경 안의 포켓몬을 기절시킨다.
     * 앞줄에 몰아 둔 배치를 벌주고, 사거리가 긴 포켓몬을 뒤에 두는 이유를 만든다. */
    shockwave: function (boss, p) {
      var radius = p.radius || 220;
      var slots = RPD.FieldManager.slots;
      var hit = [];

      for (var i = 0; i < slots.length; i++) {
        var slot = slots[i];
        if (!slot.unit) continue;
        if (U.dist2(slot.x, slot.y, boss.x, boss.y) > radius * radius) continue;
        RPD.UnitManager.disable(slot.unit, p.duration || 2);
        hit.push(slot.index);
      }
      return { x: boss.x, y: boss.y, radius: radius, slots: hit, duration: p.duration || 2 };
    }
  };

  function run(boss, pattern) {
    var handler = HANDLERS[pattern.id];
    if (!handler) {
      console.warn('[Boss] 알 수 없는 패턴: ' + pattern.id);
      return;
    }
    var result = handler(boss, pattern) || {};
    RPD.bus.emit('boss:pattern', {
      boss: boss, id: pattern.id, label: pattern.label || pattern.id, result: result
    });
  }

  BossManager.handlers = HANDLERS;

  /* 다음 패턴까지 남은 시간 — 보스 체력바 아래 예고 표시에 쓴다 */
  BossManager.nextPattern = function () {
    if (!this.boss || !this.timers.length) return null;
    var best = null;
    for (var i = 0; i < this.timers.length; i++) {
      var t = this.timers[i];
      if (!best || t.nextAt < best.nextAt) best = t;
    }
    if (!best) return null;
    return { label: best.pattern.label || best.pattern.id, inSeconds: Math.max(0, best.nextAt - this.clock) };
  };

  RPD.BossManager = BossManager;
})(typeof window !== 'undefined' ? window : globalThis);
