/* ResumeUI.js — 판 이어하기 화면(세션 70). 규칙은 js/systems/RunSave.js.
 *
 *   이어하기 카드  시작 화면(게임 시작 버튼 위) — "노멀 · 보통 · 34라운드 · 라이프 41 · 골드 1,420 · 3분 전" [이어하기] [새 판].
 *                  저장이 있어도 자동으로 이어하지 않는다.
 *   확인창         저장이 있는데 [게임 시작] · [새 판] 을 누르면 "저장된 판이 사라집니다" — [새 판 시작] 이면 저장을 지우고 모드 선택.
 *   눌러서 계속    이어한 직후는 멈춘 채 "일시정지됨 — 눌러서 계속"(자리 비움 덮개 · Convenience 재사용) — 누르면 저장된 라운드가 시작된다.
 *   안내 한 줄     저장본이 지금 게임 버전과 안 맞으면 한 번 · 다른 탭이 같은 판에 쓰면 이 탭은 저장을 멈추고 알린다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  var UI = { noticeShown: false };
  var el = {};

  function $(id) { return typeof document !== 'undefined' ? document.getElementById(id) : null; }
  function comma(n) { return String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  UI.ago = function (t, now) {
    var s = Math.max(0, ((now || Date.now()) - t) / 1000);
    if (s < 60) return '방금';
    if (s < 3600) return Math.floor(s / 60) + '분 전';
    if (s < 86400) return Math.floor(s / 3600) + '시간 전';
    return Math.floor(s / 86400) + '일 전';
  };
  UI.describe = function (d) {
    var m = d.summary;
    return m.label + ' · ' + m.wave + '라운드 · 라이프 ' + comma(m.life) + ' · 골드 ' + comma(m.gold) + ' · ' + UI.ago(d.savedAt);
  };

  function atStart() {
    var GM = RPD.GameManager, S = RPD.GameState;
    return GM.state === S.READY || GM.state === S.BOOT || GM.state === S.IDLE;
  }

  /* 카드 — 시작 화면에서 저장이 있을 때만. 맞지 않는 저장본은 read 가 지우고 여기서 한 번 알린다 */
  UI.render = function () {
    if (!el.card) return;
    // 판 도중에는 저장을 읽지 않는다 — 읽기가 맞지 않는 저장본을 지우므로, 떠나는 페이지(자리 비움 일시정지 → game:state)에서
    // 지우고 안내는 못 보는 일이 있었다(세션 70 캡처에서 찾음). 시작 화면에서만 읽고 알린다
    if (!atStart()) { el.card.hidden = true; UI.saved = null; return; }
    var r = RPD.RunSave.read();
    if (!r.ok && r.reason === 'VERSION') UI.notice('저장된 판이 현재 게임 버전과 맞지 않아 이어할 수 없어요');
    var show = r.ok;
    el.card.hidden = !show;
    if (show && el.info) el.info.textContent = UI.describe(r.data);
    UI.saved = r.ok ? r.data : null;
  };

  UI.notice = function (text) {
    if (!el.notice) return;
    if (el.noticeText) el.noticeText.textContent = text;
    el.notice.hidden = false;
  };
  UI.hideNotice = function () { if (el.notice) el.notice.hidden = true; };

  /* 이어하기 */
  UI.resume = function () {
    var r = RPD.RunSave.read();
    if (!r.ok) { UI.render(); return false; }
    RPD.RunSave.restore(r.data);
    UI.render();
    if (RPD.Convenience) RPD.Convenience.showPaused();
    return true;
  };

  /* 새 판 — 저장이 있으면 먼저 묻는다. then 은 확인 뒤에 할 일(모드 선택 열기) */
  var afterConfirm = null;
  UI.confirmNew = function (then) {
    var r = RPD.RunSave.read();
    if (!r.ok) { if (then) then(); return false; }
    afterConfirm = then || null;
    if (el.confirmText) el.confirmText.textContent = '이어할 수 있는 판(' + UI.describe(r.data) + ')을 지우고 새로 시작할까요?';
    if (el.confirm) el.confirm.hidden = false;
    return true;
  };
  function closeConfirm() { if (el.confirm) el.confirm.hidden = true; afterConfirm = null; }

  UI.init = function () {
    el.card = $('resumeCard');
    el.info = $('resumeInfo');
    el.resume = $('btnResume');
    el.newRun = $('btnNewRun');
    el.confirm = $('runConfirm');
    el.confirmText = $('runConfirmText');
    el.confirmTitle = $('runConfirmTitle');   // aria-labelledby 대상
    el.confirmNew = $('btnConfirmNew');
    el.confirmCancel = $('btnConfirmCancel');
    el.notice = $('runNotice');
    el.noticeText = $('runNoticeText');
    el.noticeOk = $('btnNoticeOk');
    el.start = $('btnStart');

    function openModes() { if (el.start && el.start.click) el.start.click(); }
    if (el.resume && el.resume.addEventListener) el.resume.addEventListener('click', function () { UI.resume(); });
    if (el.newRun && el.newRun.addEventListener) el.newRun.addEventListener('click', function () { UI.confirmNew(openModes); });
    if (el.confirmNew && el.confirmNew.addEventListener) {
      el.confirmNew.addEventListener('click', function () {
        var then = afterConfirm;
        closeConfirm();
        RPD.RunSave.clear();
        UI.render();
        if (then) then();
      });
    }
    if (el.confirmCancel && el.confirmCancel.addEventListener) el.confirmCancel.addEventListener('click', closeConfirm);
    if (el.noticeOk && el.noticeOk.addEventListener) el.noticeOk.addEventListener('click', UI.hideNotice);
    // [게임 시작] — 저장이 있으면 확인부터(UIManager 의 모드 선택보다 먼저 받는다)
    if (el.start && el.start.addEventListener) {
      el.start.addEventListener('click', function (e) {
        if (!UI.saved) return;
        if (e && e.stopImmediatePropagation) e.stopImmediatePropagation();
        if (e && e.preventDefault) e.preventDefault();
        UI.confirmNew(openModes);
      }, true);
    }

    ['game:reset', 'game:state', 'run:restored', 'game:over', 'game:victory'].forEach(function (ev) { RPD.bus.on(ev, UI.render); });
    RPD.bus.on('runsave:otherTab', function () { UI.notice('다른 탭에서 같은 판이 진행 중이에요 — 이 탭은 더 저장하지 않아요'); });
    UI.render();
  };

  RPD.ResumeUI = UI;
})(typeof window !== 'undefined' ? window : globalThis);
