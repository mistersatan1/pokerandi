/* EliteManager.js — 정예 소환 (세션 33 ④). 하이리스크 하이리턴 골드 수급처.
 *
 *   [정예 소환] → 참가비를 내고 정예 한 마리를 경로 입구에 부른다
 *     잡으면  골드(참가비의 몇 배) + 포켓몬 한 마리(하급 안흔함 · 중급 특별함 · 상급 희귀함)
 *     놓치면  라이프 대폭 감소 + 5라운드 동안 소환 금지(소환권 포함)
 *
 * 설계
 *   - 한 번에 한 마리, **한 라운드에 한 번**. 첫 패스(제한 없음 · 체력 0.8/1.6/3배 · 보상 ×4)는
 *     조심스러운 봇도 99% 잡고 판당 3.9만 골드를 벌어 클리어율이 5% → 80% 로 튀었다 — 위험이 없는 금광이었다.
 *     그래서 체력 2/4.5/9배, 보상 ×2.5/3/3.5, 라운드당 1회로 묶었다.
 *   - 정예는 라운드 진행을 막지 않는다(EnemyManager.waveAliveCount 에서 빠진다).
 *     라운드가 넘어가도 정예는 계속 걸어온다 — 잡거나 놓칠 때까지.
 *   - 체력은 "지금 라운드 잡몹 전체의 몇 배"(enemies.js eliteShare) — 어느 라운드에 불러도 같은 체감.
 *   - 참가비·보상 골드는 라운드에 따라 오른다. 소환 비용(45~190)과 같은 선에서 시작한다.
 *   - 벌칙 라이프는 시작 라이프의 비율 — 모드마다 라이프가 달라도 같은 무게로 아프다.
 *   - 소환 금지 중에는 정예도 못 부른다(벌칙 중에 또 걸고 만회하는 연타를 막는다).
 *
 * 수치는 첫 패스다 — 요청 ⑤(보스 보상) 뒤에 골드 상점 가격과 함께 다시 잰다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  var TIERS = [
    { id: 1, enemy: 'elite_1', label: '하급', feeBase: 30,  rewardMul: 2.5, unitTier: 'T2', lifePct: 0.20 },
    { id: 2, enemy: 'elite_2', label: '중급', feeBase: 70,  rewardMul: 3,   unitTier: 'T3', lifePct: 0.30 },
    { id: 3, enemy: 'elite_3', label: '상급', feeBase: 160, rewardMul: 3.5, unitTier: 'T4', lifePct: 0.40 }
  ];
  var CFG = { banRounds: 5, feeWaveGrowth: 0.05 };

  var EliteManager = { TIERS: TIERS, CFG: CFG, active: null, banUntil: 0, log: [] };

  EliteManager.reset = function () {
    this.lastRound = 0;
    // 벌칙은 "시작 라이프의 비율" — game:reset 은 GameManager 가 라이프를 정한 뒤에 나간다
    this.baseLife = RPD.GameManager.life || RPD.Config.startLife || 60;
    this.active = null;
    this.banUntil = 0;
    this.log = [];
    RPD.bus.emit('elite:changed', {});
  };

  EliteManager.init = function () {
    var self = this;
    RPD.bus.on('game:reset', function () { self.reset(); });
    RPD.bus.on('enemy:died', function (p) { if (p && p.enemy && p.enemy === self.active) self.succeed(p.enemy); });
    RPD.bus.on('enemy:leaked', function (e) { if (e && e === self.active) self.fail(e); });
    RPD.bus.on('game:wave', function () { RPD.bus.emit('elite:changed', {}); });   // 남은 금지 라운드 표시 갱신
    this.reset();
  };

  EliteManager.tier = function (id) {
    for (var i = 0; i < TIERS.length; i++) if (TIERS[i].id === Number(id)) return TIERS[i];
    return null;
  };

  function wave() { return Math.max(1, RPD.GameManager.wave || 1); }

  EliteManager.fee = function (t) { return Math.round(t.feeBase * (1 + wave() * CFG.feeWaveGrowth)); };
  EliteManager.rewardGold = function (t) { return this.fee(t) * t.rewardMul; };
  EliteManager.lifePenalty = function (t) {
    return Math.max(1, Math.round(this.baseLife * t.lifePct));
  };
  EliteManager.previewHp = function (t) {
    return RPD.WaveData.enemyMaxHp(RPD.EnemyData.get(t.enemy), wave(), RPD.GameManager.mode);
  };

  /* 금지는 "놓친 라운드부터 banRounds 라운드 동안". 20라운드에 놓치면 20~24 금지, 25에 풀린다. */
  EliteManager.isBanned = function () { return wave() < this.banUntil; };
  EliteManager.banRoundsLeft = function () { return Math.max(0, this.banUntil - wave()); };

  EliteManager.check = function (id) {
    var t = this.tier(id), GM = RPD.GameManager;
    if (!t) return { ok: false, reason: 'NO_SUCH' };
    var fee = this.fee(t);
    if (!GM.isPlayable()) return { ok: false, reason: 'NOT_PLAYING', fee: fee };
    if (this.isBanned()) return { ok: false, reason: 'BANNED', fee: fee, rounds: this.banRoundsLeft() };
    if (this.active) return { ok: false, reason: 'ACTIVE', fee: fee };
    if (this.lastRound === wave()) return { ok: false, reason: 'THIS_ROUND', fee: fee };
    if (GM.gold < fee) return { ok: false, reason: 'NO_GOLD', fee: fee };
    return { ok: true, fee: fee };
  };

  EliteManager.summon = function (id) {
    var c = this.check(id);
    if (!c.ok) return c;
    var t = this.tier(id);
    if (!RPD.GameManager.spendGold(c.fee, 'elite')) return { ok: false, reason: 'NO_GOLD', fee: c.fee };
    var e = RPD.EnemyManager.spawn(t.enemy, wave());
    e.eliteTier = t.id;
    this.lastRound = wave();
    e.eliteFee = c.fee;
    this.active = e;
    RPD.bus.emit('elite:summoned', { enemy: e, tier: t, fee: c.fee });
    RPD.bus.emit('elite:changed', {});
    return { ok: true, enemy: e, fee: c.fee };
  };

  EliteManager.succeed = function (e) {
    var t = this.tier(e.eliteTier);
    var gold = Math.round(e.eliteFee * t.rewardMul);
    RPD.GameManager.addGold(gold, 'elite');
    var unit = RPD.SummonManager.grantUnit(t.unitTier);
    if (!unit) {   // 필드·창고가 다 차 있으면 포켓몬 대신 골드를 절반 더
      var extra = Math.round(gold * 0.5);
      RPD.GameManager.addGold(extra, 'elite');
      gold += extra;
    }
    this.active = null;
    this.log.push({ tier: t.id, ok: true, wave: wave() });
    RPD.bus.emit('elite:result', { ok: true, tier: t, gold: gold, unit: unit, enemy: e });
    RPD.bus.emit('elite:changed', {});
  };

  EliteManager.fail = function (e) {
    var t = this.tier(e.eliteTier);
    var life = this.lifePenalty(t);
    RPD.GameManager.loseLife(life);
    this.banUntil = wave() + CFG.banRounds;
    this.active = null;
    this.log.push({ tier: t.id, ok: false, wave: wave() });
    RPD.bus.emit('elite:result', { ok: false, tier: t, life: life, banRounds: CFG.banRounds, enemy: e });
    RPD.bus.emit('elite:changed', {});
  };

  RPD.EliteManager = EliteManager;
})(typeof window !== 'undefined' ? window : globalThis);
