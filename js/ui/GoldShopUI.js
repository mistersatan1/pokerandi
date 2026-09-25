/* GoldShopUI.js — 골드 상점 창 (G). 규칙·가격은 GoldShopManager 가 갖고, 여기서는 그리기만 한다. */
(function (global) {
  'use strict';
  var RPD = global.RPD;
  var UI = { open: false };
  var el = {};
  function $(id) { return document.getElementById(id); }

  var REASON = { NO_GOLD: '골드 부족', MAX_LEVEL: '최대', NOT_PLAYING: '게임 중에만' };

  function card(kind, key, label, color) {
    var G = RPD.GoldShopManager, CFG = G.CFG;
    var lv = kind === 'type' ? G.typeLevel(key) : G.tierLevel(key);
    var step = kind === 'type' ? CFG.typeStep : CFG.tierStep;
    var c = G.check(kind, key);
    var max = lv >= CFG.maxLevel;
    var now = Math.round(lv * step * 100), next = Math.round((lv + 1) * step * 100);
    var n = G.affected(kind, key);
    var pips = '';
    for (var i = 0; i < CFG.maxLevel; i++) pips += '<i class="' + (i < lv ? 'is-on' : '') + '"></i>';
    return '<button type="button" class="gcard' + (c.ok ? ' is-buyable' : '') + (max ? ' is-max' : '') +
      '" data-kind="' + kind + '" data-key="' + key + '" style="--c:' + (color || '#8aa') + '"' + (c.ok ? '' : ' aria-disabled="true"') + '>' +
      '<span class="gcard__name">' + label + '</span>' +
      '<span class="gcard__lv">Lv ' + lv + '<small>/' + CFG.maxLevel + '</small></span>' +
      '<span class="gcard__pips">' + pips + '</span>' +
      '<span class="gcard__eff">공격력 +' + now + '%' + (max ? '' : ' → <b>+' + next + '%</b>') + '</span>' +
      '<span class="gcard__field">필드 ' + n + '마리</span>' +
      '<span class="gcard__price">' + (max ? '최대 레벨' : (c.price || G.cost(kind, key)) + 'G' +
        (c.ok ? '' : ' · ' + (REASON[c.reason] || ''))) + '</span>' +
    '</button>';
  }

  UI.render = function () {
    if (!el.overlay || el.overlay.hidden) return;
    var G = RPD.GoldShopManager;
    el.gold.textContent = RPD.GameManager.gold + 'G';
    el.tiers.innerHTML = G.TIER_SLOTS.map(function (t) {
      return card('tier', t.id, t.label, t.color || (RPD.Tiers[t.id] ? RPD.Tiers[t.id].color : RPD.Tiers.T6.color));
    }).join('');
    el.types.innerHTML = G.types().map(function (t) {
      return card('type', t, RPD.Types[t].label, RPD.Types[t].color);
    }).join('');
  };

  UI.show = function () { if (!el.overlay) return; el.overlay.hidden = false; UI.render(); };
  UI.hide = function () { if (el.overlay) el.overlay.hidden = true; };
  UI.toggle = function () { if (!el.overlay) return; if (el.overlay.hidden) UI.show(); else UI.hide(); };

  function onClick(e) {
    var b = e.target.closest && e.target.closest('.gcard');
    if (!b) return;
    var r = RPD.GoldShopManager.buy(b.dataset.kind, b.dataset.key);
    if (!r.ok) { b.classList.remove('is-nope'); void b.offsetWidth; b.classList.add('is-nope'); return; }
    if (RPD.AudioManager && RPD.AudioManager.play) RPD.AudioManager.play('upgrade');
  }

  UI.init = function () {
    el.overlay = $('goldShopOverlay'); el.gold = $('goldShopGold');
    el.tiers = $('goldShopTiers'); el.types = $('goldShopTypes');
    el.btn = $('btnGoldShop'); el.close = $('btnGoldShopClose');
    if (!el.overlay) return;
    if (el.btn) el.btn.addEventListener('click', UI.toggle);
    if (el.close) el.close.addEventListener('click', UI.hide);
    el.overlay.addEventListener('click', function (e) { if (e.target === el.overlay) UI.hide(); else onClick(e); });
    ['goldshop:changed', 'economy:gold', 'field:changed', 'game:reset', 'units:recomputed'].forEach(function (ev) {
      RPD.bus.on(ev, UI.render);
    });
  };

  RPD.GoldShopUI = UI;
})(typeof window !== 'undefined' ? window : globalThis);
