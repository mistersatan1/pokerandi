/* AchievementManager.js — 업적 판정 · 칭호(세션 98).
 *
 * 업적 정의는 js/data/achievements.js. 여기서는 게임 이벤트를 듣고 조건을 보고, 이루면
 *   SaveManager.data.achievements[id] = 이룬 시각 을 남기고 'achieve:unlocked' 를 보낸다(화면은 AchieveUI).
 * 누적 수(조합 · 보스 · 정예)는 SaveManager.data.achProgress 에. 한 판 안의 기록(전설 조합 수 · 불멸을 가진 적이 있나)은
 *   run 에 들고 판 이어하기(RunSave)에 같이 남는다 — 이어한 뒤 "불멸 없이" 판정이 풀리면 안 되니까.
 * 단 칭호는 SaveManager.data.title(업적 id · 없으면 null).
 *
 * 규칙에 손대지 않는다 — 이벤트를 듣기만 한다(전투 · 경제에 주는 것 없음).
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  function freshRun() { return { legends: 0, hadImmortal: false }; }

  var AchievementManager = { run: freshRun(), unlockedThisRun: [] };

  function save() { return RPD.SaveManager.data; }
  function store() {
    var d = save();
    if (!d.achievements || typeof d.achievements !== 'object') d.achievements = {};
    return d.achievements;
  }
  function prog() {
    var d = save();
    if (!d.achProgress || typeof d.achProgress !== 'object') d.achProgress = {};
    return d.achProgress;
  }

  AchievementManager.has = function (id) { return !!store()[id]; };
  AchievementManager.count = function () {
    var s = store(), n = 0;
    RPD.AchievementData.list.forEach(function (a) { if (s[a.id]) n += 1; });
    return n;
  };
  AchievementManager.total = function () { return RPD.AchievementData.list.length; };

  /* 지금 단 칭호 — { id, title, name } 또는 null(달지 않았거나 이루지 않은 업적이면) */
  AchievementManager.equipped = function () {
    var id = save().title;
    var a = id && RPD.AchievementData.get(id);
    return a && this.has(id) ? a : null;
  };
  AchievementManager.equip = function (id) {
    if (id != null && (!RPD.AchievementData.get(id) || !this.has(id))) return false;
    save().title = id || null;
    RPD.SaveManager.save();
    RPD.bus.emit('achieve:equipped', { id: id || null });
    return true;
  };

  AchievementManager.unlock = function (id) {
    var a = RPD.AchievementData.get(id);
    if (!a || this.has(id)) return false;
    store()[id] = Date.now();
    this.unlockedThisRun.push(id);
    // 처음 이룬 업적이면 칭호를 바로 단다(달아 둔 게 없을 때만 — 고른 칭호를 바꾸지 않는다)
    if (!save().title) save().title = id;
    RPD.SaveManager.save();
    RPD.bus.emit('achieve:unlocked', { achievement: a, count: this.count(), total: this.total() });
    return true;
  };

  /* ---------- 진행(목표 수가 있는 업적) — [지금, 목표] 또는 null ---------- */

  function heldOfTier(tier) {
    var seen = {}, n = 0;
    var all = RPD.FieldManager.getAllUnits().concat(RPD.StorageManager.units || []);
    for (var i = 0; i < all.length; i++) {
      var u = all[i];
      if (u && u.tier === tier && !seen[u.defId]) { seen[u.defId] = 1; n += 1; }
    }
    return n;
  }
  function spellsOfKind(kind) {
    var known = 0, total = 0;
    RPD.SpellData.list.forEach(function (s) {
      if (s.kind !== kind) return;
      total += 1;
      if (RPD.SaveManager.knowsSpell(s.id)) known += 1;
    });
    return [known, total];
  }
  function dexGoal(a) { return a.goal || RPD.SaveManager.dexTotal(); }

  AchievementManager.progress = function (a) {
    var p = prog(), self = this;
    switch (a.kind) {
      case 'crafts': return [p.crafts || 0, a.goal];
      case 'craftTier': return a.scope === 'run' ? [self.run.legends, a.goal] : [p['craft' + a.tier] || 0, a.goal];
      case 'bosses': return [p.bosses || 0, a.goal];
      case 'elites': return [p.elites || 0, a.goal];
      case 'spellAll': return spellsOfKind(a.spellKind);
      case 'dex': return [RPD.SaveManager.dexCount(), dexGoal(a)];
      default: return null;
    }
  };

  /* 목표 수가 있는 업적을 지금 값으로 한 번 훑는다 */
  AchievementManager.checkCounts = function (kinds) {
    var self = this;
    RPD.AchievementData.list.forEach(function (a) {
      if (self.has(a.id) || kinds.indexOf(a.kind) < 0) return;
      var pr = self.progress(a);
      if (pr && pr[0] >= pr[1]) self.unlock(a.id);
    });
  };

  /* 보유(필드 · 응원 칸 · 창고) — 불멸 동시 보유 · "불멸을 가진 적이 있나" */
  AchievementManager.checkHold = function () {
    if (!RPD.GameManager.isPlayable || !RPD.GameManager.isPlayable()) return;
    var self = this;
    if (!this.run.hadImmortal && (heldOfTier('T6') > 0 || heldOfTier('T7') > 0)) this.run.hadImmortal = true;
    RPD.AchievementData.list.forEach(function (a) {
      if (a.kind === 'holdTier' && !self.has(a.id) && heldOfTier(a.tier) >= a.goal) self.unlock(a.id);
    });
    // 응원 칸 — 열 수 있는 칸을 모두 열고 전부 채웠나
    if (!this.has('cheer_full')) {
      var cheer = RPD.FieldManager.slots.filter(function (s) { return s.zone === 'cheer'; });
      if (cheer.length && cheer.every(function (s) { return s.unlocked && s.unit; })) this.unlock('cheer_full');
    }
  };

  AchievementManager.checkSynergy = function () {
    if (!RPD.GameManager.isPlayable || !RPD.GameManager.isPlayable()) return;
    var maxed = [], self = this;
    (RPD.SynergyManager.active || []).forEach(function (s) {
      var tiers = RPD.Synergies[s.typeId];
      if (tiers && s.tierIndex === tiers.length - 1) maxed.push(s.typeId);
    });
    if (!maxed.length) return;
    RPD.AchievementData.list.forEach(function (a) {
      if (self.has(a.id)) return;
      if (a.kind === 'synMax' && (a.type ? maxed.indexOf(a.type) >= 0 : true)) self.unlock(a.id);
      if (a.kind === 'synMaxCount' && maxed.length >= a.goal) self.unlock(a.id);
    });
  };

  function modeOk(a) { return a.modes.indexOf(RPD.GameManager.mode.id) >= 0; }

  AchievementManager.checkWave = function () {
    var self = this, w = RPD.GameManager.wave;
    RPD.AchievementData.list.forEach(function (a) {
      if (a.kind !== 'wave' || self.has(a.id) || !modeOk(a) || w < a.wave) return;
      if (a.noImmortal && self.run.hadImmortal) return;
      self.unlock(a.id);
    });
  };

  AchievementManager.checkClear = function () {
    var self = this, s = RPD.StatsManager.summary();
    this.checkHold();
    RPD.AchievementData.list.forEach(function (a) {
      if (a.kind !== 'clear' || self.has(a.id) || !modeOk(a)) return;
      if (a.noImmortal && self.run.hadImmortal) return;
      if (a.noLeak && (s.leaks || 0) > 0) return;
      self.unlock(a.id);
    });
  };

  /* ---------- 판 이어하기(RunSave) ---------- */
  AchievementManager.reset = function () { this.run = freshRun(); this.unlockedThisRun = []; };
  AchievementManager.saveState = function () { return { legends: this.run.legends, hadImmortal: this.run.hadImmortal }; };
  AchievementManager.loadState = function (s) {
    // 이 기록이 없는 예전 저장본(세션 97 이전) — 지금 보유로 다시 판단한다
    this.run = freshRun();
    if (s) { this.run.legends = s.legends || 0; this.run.hadImmortal = !!s.hadImmortal; }
  };

  AchievementManager.init = function () {
    var self = this, bus = RPD.bus;
    bus.on('game:reset', function () { self.reset(); });

    bus.on('recipe:crafted', function (p) {
      if (!p || !p.unit) return;
      var pr = prog();
      pr.crafts = (pr.crafts || 0) + 1;
      pr['craft' + p.tier] = (pr['craft' + p.tier] || 0) + 1;
      if (p.tier === 'T5') self.run.legends += 1;
      self.checkCounts(['crafts', 'craftTier', 'dex']);
      self.checkHold();
    });
    bus.on('summon:result', function (r) { if (r && r.ok) self.checkCounts(['dex']); });

    bus.on('spell:cast', function (p) {
      var kind = p && p.spell && p.spell.kind;
      RPD.AchievementData.list.forEach(function (a) {
        if (a.kind === 'spellKind' && a.spellKind === kind) self.unlock(a.id);
      });
      self.checkCounts(['spellAll', 'dex']);
      self.checkHold();
    });

    bus.on('field:changed', function () { self.checkHold(); });
    bus.on('storage:changed', function () { self.checkHold(); });
    bus.on('synergy:changed', function () { self.checkSynergy(); });

    // boss:cleared 는 "보스가 사라졌다"(새 판 reset 에도 나간다) — 처치는 enemy:died 의 isBoss 로 센다(StatsManager 와 같게)
    bus.on('enemy:died', function (p) {
      if (!p || !p.enemy || !p.enemy.isBoss) return;
      var pr = prog(); pr.bosses = (pr.bosses || 0) + 1;
      self.checkCounts(['bosses']);
    });
    bus.on('elite:result', function (p) {
      if (!p || !p.ok) return;
      var pr = prog(); pr.elites = (pr.elites || 0) + 1;
      self.checkCounts(['elites']);
    });

    bus.on('wave:started', function () { self.checkWave(); });
    bus.on('game:victory', function () { self.checkClear(); });
    // 누적 수는 진행 기록과 같이 저장된다(SaveManager.save — 판이 끝날 때 · 업적을 이룰 때)
  };

  RPD.AchievementManager = AchievementManager;
})(typeof window !== 'undefined' ? window : globalThis);
