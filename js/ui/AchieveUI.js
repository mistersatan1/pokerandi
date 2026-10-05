/* AchieveUI.js — 업적 창 · 달성 알림 · 칭호 고르기(세션 98).
 *
 *   [🏆] (HUD · 휴대폰은 ☰ 메뉴) → 업적 창: 묶음별 카드(이룬 것 · 진행 막대 · 숨은 업적 ???) · 이룬 업적의 [칭호 달기]
 *   achieve:unlocked → 필드 위 금색 알림(여러 개면 차례로 3.2초씩) · 진동 · 소리
 *   결과 화면 "이번 판 업적" 줄 · 모드 선택 / 판 시작 화면의 칭호는 UIManager 가 AchievementManager.equipped() 로 그린다.
 * 규칙은 AchievementManager — 여기는 그리기만.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;
  var d = global.document;

  var UI = { queue: [], showing: false, timer: null };
  var el = {};
  function $(id) { return d.getElementById(id); }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function dateOf(t) {
    if (!t) return '';
    var x = new Date(t);
    return x.getFullYear() + '.' + (x.getMonth() + 1) + '.' + x.getDate();
  }

  /* 칭호 한 줄(다른 화면도 쓴다) — 단 칭호가 없으면 '' */
  UI.titleBadge = function () {
    var a = RPD.AchievementManager && RPD.AchievementManager.equipped();
    return a ? '<span class="achtitle">' + a.icon + ' ' + esc(a.title) + '</span>' : '';
  };

  function cardHtml(a) {
    var AM = RPD.AchievementManager, done = AM.has(a.id);
    var at = done ? RPD.SaveManager.data.achievements[a.id] : 0;
    var secret = a.secret && !done;
    var on = done && AM.equipped() && AM.equipped().id === a.id;
    var pr = done ? null : AM.progress(a);
    var bar = pr && pr[1] > 1
      ? '<span class="ach__bar"><i style="width:' + Math.min(100, pr[0] / pr[1] * 100).toFixed(1) + '%"></i></span>' +
        '<span class="ach__num">' + Math.min(pr[0], pr[1]) + ' / ' + pr[1] + '</span>'
      : '';
    return '<li class="ach' + (done ? ' is-done' : '') + (on ? ' is-on' : '') + '" data-ach="' + a.id + '">' +
      '<span class="ach__icon">' + (secret ? '❓' : a.icon) + '</span>' +
      '<span class="ach__body">' +
        '<b class="ach__name">' + (secret ? '???' : esc(a.name)) + '</b>' +
        '<span class="ach__desc">' + (secret ? '숨은 업적 — 이루면 드러납니다' : esc(a.desc)) + '</span>' +
        bar +
        '<span class="ach__title">칭호 <b>' + (secret ? '???' : esc(a.title)) + '</b>' + (done ? ' · ' + dateOf(at) : '') + '</span>' +
      '</span>' +
      (done ? '<button type="button" class="ach__equip" data-equip="' + a.id + '"' + (on ? ' disabled' : '') + '>' + (on ? '단 칭호' : '칭호 달기') + '</button>' : '') +
    '</li>';
  }

  UI.render = function () {
    if (!el.body) return;
    var AM = RPD.AchievementManager, D = RPD.AchievementData;
    if (el.count) el.count.textContent = AM.count() + ' / ' + AM.total();
    var eq = AM.equipped();
    if (el.equipped) {
      el.equipped.innerHTML = eq
        ? '<span>단 칭호</span><span class="achtitle">' + eq.icon + ' ' + esc(eq.title) + '</span><button type="button" class="btn btn--ghost achbar__off" data-equip="">떼기</button>'
        : '<span>단 칭호 없음 — 업적을 이루면 칭호를 달 수 있습니다</span>';
    }
    el.body.innerHTML = D.cats.map(function (c) {
      var items = D.list.filter(function (a) { return a.cat === c.id; });
      var got = items.filter(function (a) { return AM.has(a.id); }).length;
      return '<section class="achgroup"><h3 class="achgroup__head">' + c.label + ' <small>' + got + ' / ' + items.length + '</small></h3>' +
        '<ul class="achgroup__list">' + items.map(cardHtml).join('') + '</ul></section>';
    }).join('');
  };

  UI.open = function () {
    if (!el.overlay) return;
    UI.render();
    el.overlay.hidden = false;
    if (RPD.HudPanels && RPD.HudPanels.toggleMore) RPD.HudPanels.toggleMore(false);   // 휴대폰 ☰ 메뉴에서 열었으면 메뉴는 닫는다
  };
  UI.close = function () { if (el.overlay) el.overlay.hidden = true; };
  UI.isOpen = function () { return !!(el.overlay && !el.overlay.hidden); };

  /* ---------- 달성 알림 ---------- */
  function next() {
    if (!el.toast) return;
    var p = UI.queue.shift();
    if (!p) { UI.showing = false; return; }
    UI.showing = true;
    var a = p.achievement;
    el.toast.innerHTML = '<span class="achtoast__icon">' + a.icon + '</span>' +
      '<span class="achtoast__txt"><span class="achtoast__kicker">업적 달성 · ' + p.count + ' / ' + p.total + '</span>' +
      '<b class="achtoast__name">' + esc(a.name) + '</b>' +
      '<span class="achtoast__title">칭호 「' + esc(a.title) + '」</span></span>';
    el.toast.classList.remove('is-on');
    void el.toast.offsetWidth;
    el.toast.classList.add('is-on');
    if (RPD.Haptics && RPD.Haptics.buzz) RPD.Haptics.buzz('discover');
    if (RPD.AudioManager && RPD.AudioManager.play) RPD.AudioManager.play('discover');
    if (UI.timer) clearTimeout(UI.timer);
    UI.timer = setTimeout(function () { el.toast.classList.remove('is-on'); UI.timer = setTimeout(next, 260); }, 3200);
  }

  /* 결과 화면 "이번 판 업적" */
  UI.renderResult = function () {
    if (!el.result) return;
    var ids = RPD.AchievementManager.unlockedThisRun;
    if (!ids.length) { el.result.hidden = true; return; }
    el.result.innerHTML = '<span class="ra__head">이번 판 업적 ' + ids.length + '개</span>' + ids.map(function (id) {
      var a = RPD.AchievementData.get(id);
      return '<span class="ra__item">' + a.icon + ' <b>' + esc(a.name) + '</b> · 칭호 「' + esc(a.title) + '」</span>';
    }).join('');
    el.result.hidden = false;
  };

  UI.init = function () {
    el.overlay = $('achieveOverlay');
    el.body = $('achieveBody');
    el.count = $('achieveCount');
    el.equipped = $('achieveEquipped');
    el.toast = $('achieveToast');
    el.result = $('resultAch');
    el.openBtn = $('btnAchieve');
    el.closeBtn = $('btnAchieveClose');
    if (el.openBtn) el.openBtn.addEventListener('click', UI.open);
    if (el.closeBtn) el.closeBtn.addEventListener('click', UI.close);
    if (el.overlay) {
      el.overlay.addEventListener('click', function (e) {
        var t = e.target;
        var b = t && t.closest ? t.closest('[data-equip]') : null;
        if (b) { RPD.AchievementManager.equip(b.getAttribute('data-equip') || null); return; }
        if (t === el.overlay) UI.close();
      });
    }
    d.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && UI.isOpen()) { UI.close(); if (e.stopPropagation) e.stopPropagation(); }
    });
    RPD.bus.on('achieve:unlocked', function (p) {
      UI.queue.push(p);
      if (!UI.showing) next();
      if (UI.isOpen()) UI.render();
      UI.renderResult();
    });
    RPD.bus.on('achieve:equipped', function () {
      if (UI.isOpen()) UI.render();
      if (RPD.UIManager && RPD.UIManager.renderTrainerInfo) RPD.UIManager.renderTrainerInfo();
    });
    RPD.bus.on('game:reset', function () { if (el.result) el.result.hidden = true; });
    RPD.bus.on('game:victory', function () { UI.renderResult(); });
    RPD.bus.on('game:over', function () { UI.renderResult(); });
  };

  RPD.AchieveUI = UI;
})(typeof window !== 'undefined' ? window : globalThis);
