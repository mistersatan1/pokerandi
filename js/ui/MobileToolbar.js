/* MobileToolbar.js — 휴대폰 하단 툴바 · "★ 조합 가능" 줄 · 보상 알림 (모바일 ② · 세션 66).
 *
 * 엄지가 닿는 화면 맨 아래 줄: [소환] [조합] [창고] [더보기]. 필드 밖에 고정 — 정보 바(세션 65)는 그 위, 시트는 필드 위로 올라온다.
 *   [소환]  .pane--action 의 #btnSummon 을 CSS 로 이 줄에 놓는다 — 비용 · 소환권 · "금지 NR" · 가득 참 규칙은 UIManager 그대로.
 *   [조합]  완성 가능한 조합식 수 배지(0 이면 배지 없음 · 흐리게). 누르면 PC 의 조합 버튼(#btnCraft)을 누른다(같은 조합식 하나).
 *           위로 밀거나 길게 누르면 조합식 시트.
 *   [창고]  보유 포켓몬 시트(창고 개체 수 배지). 필드 포켓몬을 끌어 여기에 놓으면 창고로(UIManager 의 [data-mtab="owned"] 규칙 그대로).
 *   [더보기] ☰ 메뉴(골드 상점 · 정예 · 조합 사전 · 도감 · 설명서 · 소리 · 시너지 · 주문 · 전체 화면 · 앱 설치 · 처음부터)를 툴바 위로 연다.
 *           정예가 진행 중이거나 소환 금지 중이면 작은 점.
 * 툴바 바로 위 줄(필드 밖): 완성 가능한 조합이 있으면 "★ 조합 가능 · 리자몽" 한 줄 버튼 — [조합] 과 같은 것을 바로 조합.
 *   보스 보상 지급 알림도 필드를 덮지 않게 여기에 잠깐(PC 는 예전 그대로 필드 위 보상 카드).
 * 휴대폰 판별은 MobileSheet.isMobile(세션 65 와 같은 기준). PC(1100px 이상)에서는 CSS 가 숨기고 여기 입력도 막는다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;
  var GM = RPD.GameManager;

  var HOLD_MS = 450;
  var SWIPE_UP = 24;
  var TOAST_MS = 3200;

  var T = { toastText: '', toastTimer: null, lastBest: null };
  var el = {};

  function doc() { return typeof document !== 'undefined' ? document : null; }
  function isMobile() { return !!(RPD.MobileSheet && RPD.MobileSheet.isMobile()); }
  function byId(id) { var d = doc(); return d ? d.getElementById(id) : null; }
  function clickById(id) {
    var n = byId(id);
    if (n && !n.disabled && n.click) { n.click(); return true; }
    return false;
  }
  function esc(s) { return RPD.UI && RPD.UI.escape ? RPD.UI.escape(s) : String(s); }

  /* 완성 가능한 조합식 — [조합] · PC 조합 버튼 · "★ 조합 가능" 줄이 같은 목록 · 같은 첫 항목(RecipeManager.craftBest)을 쓴다 */
  T.ready = function () { return RPD.RecipeManager ? RPD.RecipeManager.readyList() : []; };

  T.render = function () {
    var ready = T.ready();
    var playable = GM.isPlayable ? GM.isPlayable() : true;
    var n = ready.length;
    if (el.craft) {
      var dim = !playable || n === 0;
      el.craft.classList.toggle('is-dim', dim);
      el.craft.classList.toggle('is-ready', !dim);
      if (el.craft.setAttribute) el.craft.setAttribute('aria-disabled', String(dim));
    }
    if (el.craftBadge) { el.craftBadge.hidden = n === 0; el.craftBadge.textContent = n; }
    if (el.ownedBadge) {
      var s = RPD.StorageManager ? RPD.StorageManager.units.length : 0;
      el.ownedBadge.hidden = s === 0;
      el.ownedBadge.textContent = s;
    }
    if (el.dot) {
      var E = RPD.EliteManager;
      el.dot.hidden = !(E && (E.active || E.isBanned()));
    }
    renderStrip(ready, playable);
  };

  function renderStrip(ready, playable) {
    if (!el.strip) return;
    if (T.toastText) {
      el.strip.innerHTML = '<div class="mstrip__toast" role="status">' + T.toastText + '</div>';
      return;
    }
    if (playable && ready.length) {
      var best = ready[0];
      T.lastBest = best.key;
      el.strip.innerHTML = '<button type="button" class="mstrip__craft" data-strip="craft" title="조합 (C)">' +
        '<b>★ 조합 가능</b> · ' + esc(best.resultName) + (ready.length > 1 ? ' <small>외 ' + (ready.length - 1) + '</small>' : '') + '</button>';
      return;
    }
    T.lastBest = null;
    el.strip.innerHTML = '';
  }

  /* 한 줄 알림 — 툴바 바로 위 줄에 잠깐 */
  T.toast = function (html, ms) {
    T.toastText = html;
    clearTimeout(T.toastTimer);
    T.toastTimer = setTimeout(function () { T.toastText = ''; T.render(); }, ms || TOAST_MS);
    T.render();
  };

  /* 보스 보상 지급 — 휴대폰이면 필드 위 카드 대신 알림 줄로(true 를 돌려주면 HudPanels 가 카드를 안 띄운다) */
  T.rewardToast = function (entry) {
    if (!isMobile() || !entry || !entry.items || !entry.items.length) return false;
    var RM = RPD.RewardManager;
    T.toast('<b>' + entry.wave + 'R 보스 처치</b> · 보상 ' + esc(RM ? RM.describe(entry.items) : ''), TOAST_MS);
    return true;
  };

  function bindCraft() {
    var b = el.craft;
    if (!b || !b.addEventListener) return;
    var g = null, eat = false;
    function openSheet() {
      var H = RPD.HudPanels, bd = doc().body;
      if (H && bd && bd.getAttribute && bd.getAttribute('data-mtab') !== 'recipes') H.setDrawer('recipes');
    }
    b.addEventListener('pointerdown', function (e) {
      if (!isMobile()) return;
      g = { x: e.clientX, y: e.clientY, done: false };
      g.timer = setTimeout(function () { if (g && !g.done) { g.done = true; eat = true; openSheet(); } }, HOLD_MS);
    });
    b.addEventListener('pointermove', function (e) {
      if (!g || g.done) return;
      if (g.y - e.clientY > SWIPE_UP) { g.done = true; eat = true; clearTimeout(g.timer); openSheet(); }
      else if (Math.abs(e.clientX - g.x) + Math.abs(e.clientY - g.y) > 10) clearTimeout(g.timer);
    });
    ['pointerup', 'pointercancel'].forEach(function (ev) { b.addEventListener(ev, function () { if (g) clearTimeout(g.timer); g = null; }); });
    b.addEventListener('touchmove', function (e) { if (g && e.cancelable && e.preventDefault) e.preventDefault(); }, { passive: false });
    b.addEventListener('click', function (e) {
      if (eat) { eat = false; if (e.preventDefault) e.preventDefault(); return; }   // 길게 누르기 · 밀기 끝의 click 은 조합이 아니다
      if (b.classList.contains('is-dim')) return;
      clickById('btnCraft');
    });
  }

  /* ☰ 메뉴는 툴바 바로 위로 연다 — 툴바(소환 · 탭 줄) 윗변까지의 거리 */
  T.measure = function () {
    var d = doc();
    if (!d || !d.documentElement || !d.documentElement.style) return;
    var tops = [byId('mobileTabs'), d.querySelector ? d.querySelector('.pane--action') : null]
      .filter(function (n) { return n && n.getBoundingClientRect; })
      .map(function (n) { return n.getBoundingClientRect().top; })
      .filter(function (t) { return t > 0; });
    if (!tops.length) return;
    var vh = global.innerHeight || 0;
    d.documentElement.style.setProperty('--more-bottom', Math.round(vh - Math.min.apply(null, tops) + 6) + 'px');
  };

  T.init = function () {
    var d = doc();
    if (!d) return;
    el.craft = byId('tbCraft');
    el.craftBadge = byId('mtabCraft');
    el.ownedBadge = byId('tbOwnedBadge');
    el.more = byId('tbMore');
    el.dot = byId('tbMoreDot');
    el.strip = byId('craftStrip');
    el.synergy = byId('btnSynergy');

    bindCraft();
    if (el.more && el.more.addEventListener) {
      el.more.addEventListener('click', function () {
        var H = RPD.HudPanels;
        var on = H && H.toggleMore ? H.toggleMore() : false;
        if (el.more.setAttribute) el.more.setAttribute('aria-expanded', String(!!on));
      });
    }
    if (el.synergy && el.synergy.addEventListener) {
      el.synergy.addEventListener('click', function () {
        var H = RPD.HudPanels, bd = d.body;
        if (H && bd && bd.getAttribute && bd.getAttribute('data-mtab') !== 'synergy') H.setDrawer('synergy');
        if (H && H.toggleMore) H.toggleMore(false);
      });
    }
    if (el.strip && el.strip.addEventListener) {
      el.strip.addEventListener('click', function (e) {
        var t = e.target && e.target.closest ? e.target.closest('[data-strip="craft"]') : null;
        if (t) clickById('btnCraft');
      });
    }

    ['recipe:changed', 'storage:changed', 'field:changed', 'elite:changed', 'game:wave', 'game:state', 'summon:stateChanged', 'recipe:crafted']
      .forEach(function (ev) { RPD.bus.on(ev, T.render); });
    RPD.bus.on('game:reset', function () { T.toastText = ''; clearTimeout(T.toastTimer); T.render(); });
    RPD.bus.on('render:resize', T.measure);
    if (global.addEventListener) global.addEventListener('resize', T.measure);
    T.render();
    T.measure();
  };

  RPD.MobileToolbar = T;
})(typeof window !== 'undefined' ? window : globalThis);
