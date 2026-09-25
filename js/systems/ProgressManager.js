/* ProgressManager.js — 클리어 기록 · 칭호 · 시작 보너스.
 *
 * 기록은 SaveManager 에 남고(난이도별 클리어 횟수·최고 기록), 여기서는 그것을 읽어
 *   지금 칭호가 무엇인지, 다음 칭호까지 몇 번 남았는지, 판을 시작할 때 무엇을 줄지 정한다.
 * 칭호가 오르는 순간 'progress:title' 을 보낸다(결과 화면이 축하한다).
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  var ProgressManager = { lastBonus: null };

  function clears() {
    var S = RPD.SaveManager;
    return S && S.data && S.data.totals ? (S.data.totals.clears || 0) : 0;
  }
  ProgressManager.clears = clears;

  /* 지금 칭호(없으면 null) */
  ProgressManager.title = function (n) {
    n = n == null ? clears() : n;
    var got = null;
    RPD.TitleData.list.forEach(function (t) { if (n >= t.clears) got = t; });
    return got;
  };

  ProgressManager.next = function (n) {
    n = n == null ? clears() : n;
    var list = RPD.TitleData.list;
    for (var i = 0; i < list.length; i++) if (n < list[i].clears) return list[i];
    return null;
  };

  /* 난이도 칭호 — 일반 모드에서 그 난이도를 한 번이라도 깼으면 */
  ProgressManager.specialTitles = function () {
    var by = (RPD.SaveManager.data.clearsBy) || {};
    var out = [];
    for (var id in RPD.TitleData.special) {
      if ((by['NORMAL:' + id] || 0) > 0) out.push(RPD.TitleData.special[id]);
    }
    return out;
  };

  /* 쌓인 시작 보너스 합계 */
  ProgressManager.bonus = function (n) {
    n = n == null ? clears() : n;
    var sum = { gold: 0, tickets: 0, shards: 0, units: [] };
    RPD.TitleData.list.forEach(function (t) {
      if (n < t.clears) return;
      var b = t.bonus || {};
      sum.gold += b.gold || 0;
      sum.tickets += b.tickets || 0;
      sum.shards += b.shards || 0;
      if (b.unit) sum.units.push(b.unit);
    });
    return sum;
  };

  ProgressManager.describeBonus = function (b) {
    b = b || this.bonus();
    var parts = [];
    if (b.gold) parts.push('골드 +' + b.gold);
    if (b.tickets) parts.push('소환권 +' + b.tickets);
    if (b.shards) parts.push('조각 +' + b.shards);
    b.units.forEach(function (t) { parts.push(RPD.Tiers[t].label + ' 1마리'); });
    return parts.join(' · ');
  };

  /* 판을 새로 세울 때(Game.resetAll) 부른다 */
  ProgressManager.applyStartBonus = function () {
    var b = this.bonus();
    if (b.gold) {
      RPD.GameManager.gold += b.gold;
      RPD.GameManager.emitStats && RPD.GameManager.emitStats();
    }
    if (b.tickets) RPD.SummonManager.grantTicket(b.tickets);
    if (b.shards) RPD.ShardManager.add(b.shards, 'title');
    b.units.forEach(function (t) { RPD.SummonManager.grantUnit(t); });
    this.lastBonus = b;
    RPD.bus.emit('progress:bonus', b);
    return b;
  };

  ProgressManager.init = function () {
    var self = this;
    // 기록이 남은 뒤 칭호가 올랐는지 본다
    RPD.bus.on('save:runRecorded', function (p) {
      if (!p || !p.cleared) return;
      var n = clears();
      var now = self.title(n), before = self.title(n - 1);
      var special = null;
      if (p.firstClearOfKey && RPD.TitleData.special[p.difficulty] && p.mode === 'NORMAL') {
        special = RPD.TitleData.special[p.difficulty];
      }
      RPD.bus.emit('progress:cleared', {
        clears: n, title: now, newTitle: now !== before ? now : null,
        special: special, next: self.next(n)
      });
    });
  };

  RPD.ProgressManager = ProgressManager;
})(typeof window !== 'undefined' ? window : globalThis);
