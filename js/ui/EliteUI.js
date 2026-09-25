/* EliteUI.js — 정예 소환 창 (E). 규칙·수치는 EliteManager 가 갖고 여기서는 그리기만 한다. */
(function (global) {
  'use strict';
  var RPD = global.RPD;
  var UI = {};
  var el = {};
  function $(id) { return document.getElementById(id); }
  var REASON = { NO_GOLD: '골드 부족', BANNED: '소환 금지 중', ACTIVE: '정예가 이미 나와 있다', THIS_ROUND: '이번 라운드에 이미 불렀다', NOT_PLAYING: '게임 중에만' };
  var TIER_LABEL = { T2: '안흔함', T3: '특별함', T4: '희귀함' };

  function status() {
    var EM = RPD.EliteManager;
    if (EM.active) {
      var e = EM.active;
      var pct = Math.max(0, Math.round((e.hp + e.shield) / Math.max(1, e.maxHp + e.maxShield) * 100));
      var path = Math.round(e.distance / RPD.MapData.path.length * 100);
      return '<b class="elite__live">' + e.name + ' 진행 중</b> — 체력 ' + pct + '% · 경로 ' + Math.max(0, path) + '% 지점';
    }
    if (EM.isBanned()) return '<b class="elite__ban">소환 금지 ' + EM.banRoundsLeft() + '라운드 남음</b> — 정예·일반 소환 모두 막혀 있다';
    if (EM.lastRound === (RPD.GameManager.wave || 1)) return '이번 라운드에는 이미 불렀다 — 다음 라운드에 다시.';
    return '한 라운드에 한 번, 한 마리씩. 정예는 라운드 진행을 막지 않는다 — 잡거나 놓칠 때까지 걸어온다.';
  }

  function card(t) {
    var EM = RPD.EliteManager, c = EM.check(t.id);
    var hp = EM.previewHp(t);
    var trash = RPD.WaveData.trashWaveHp(Math.max(1, RPD.GameManager.wave || 1), RPD.GameManager.mode);
    return '<button type="button" class="ecard' + (c.ok ? ' is-buyable' : '') + '" data-elite="' + t.id + '">' +
      '<span class="ecard__name">' + t.label + ' 정예</span>' +
      '<span class="ecard__hp">체력 ' + hp.toLocaleString() + ' <small>(이번 라운드 적 전체의 ' + (hp / Math.max(1, trash)).toFixed(1) + '배)</small></span>' +
      '<span class="ecard__row ecard__row--win">처치 · <b>+' + EM.rewardGold(t) + 'G</b> + ' + TIER_LABEL[t.unitTier] + ' 포켓몬 1마리</span>' +
      '<span class="ecard__row ecard__row--lose">놓침 · 라이프 <b>-' + EM.lifePenalty(t) + '</b> + ' + EM.CFG.banRounds + '라운드 소환 금지</span>' +
      '<span class="ecard__fee">참가비 ' + (c.fee || EM.fee(t)) + 'G' + (c.ok ? '' : ' · ' + (REASON[c.reason] || '')) + '</span>' +
    '</button>';
  }

  UI.render = function () {
    if (!el.overlay || el.overlay.hidden) return;
    el.gold.textContent = RPD.GameManager.gold + 'G';
    el.status.innerHTML = status();
    el.list.innerHTML = RPD.EliteManager.TIERS.map(card).join('');
  };
  UI.show = function () { if (!el.overlay) return; el.overlay.hidden = false; UI.render(); };
  UI.hide = function () { if (el.overlay) el.overlay.hidden = true; };
  UI.toggle = function () { if (!el.overlay) return; if (el.overlay.hidden) UI.show(); else UI.hide(); };

  function onResult(p) {
    var UIM = RPD.UIManager;
    if (!UIM || !UIM.showBanner) return;
    if (p.ok) UIM.showBanner('정예 처치!  +' + p.gold + 'G' + (p.unit ? ' · ' + p.unit.def.name : ''), false);
    else UIM.showBanner('정예를 놓쳤다  라이프 -' + p.life + ' · ' + p.banRounds + '라운드 소환 금지', true);
  }

  UI.init = function () {
    el.overlay = $('eliteOverlay'); el.gold = $('eliteGold'); el.status = $('eliteStatus'); el.list = $('eliteList');
    el.btn = $('btnElite'); el.close = $('btnEliteClose');
    if (!el.overlay) return;
    if (el.btn) el.btn.addEventListener('click', UI.toggle);
    if (el.close) el.close.addEventListener('click', UI.hide);
    el.overlay.addEventListener('click', function (e) {
      if (e.target === el.overlay) { UI.hide(); return; }
      var b = e.target.closest && e.target.closest('.ecard');
      if (!b) return;
      var r = RPD.EliteManager.summon(b.dataset.elite);
      if (!r.ok) { b.classList.remove('is-nope'); void b.offsetWidth; b.classList.add('is-nope'); return; }
      UI.hide();   // 부르면 창을 닫아 필드를 보게 한다
    });
    ['elite:changed', 'economy:gold', 'game:reset', 'game:wave', 'enemy:damaged'].forEach(function (ev) { RPD.bus.on(ev, UI.render); });
    RPD.bus.on('elite:result', onResult);
    RPD.bus.on('elite:changed', function () {
      if (el.btn) {
        el.btn.classList.toggle('is-live', !!RPD.EliteManager.active);
        el.btn.classList.toggle('is-banned', RPD.EliteManager.isBanned());
      }
    });
  };

  RPD.EliteUI = UI;
})(typeof window !== 'undefined' ? window : globalThis);
