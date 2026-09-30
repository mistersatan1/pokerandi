/* AppUI.js — 홈 화면 앱 화면 쪽(모바일 ④ · 세션 71). 규칙은 js/core/Pwa.js · SaveManager.
 *
 *   [앱으로 설치]   크롬(안드로이드 · PC)은 들고 있던 설치 창(beforeinstallprompt)을 띄운다. 아이폰 사파리는 설치 API 가 없어
 *                  안내 시트 "공유(□↑) → 홈 화면에 추가". 앱으로 실행 중이면 버튼을 숨긴다(HudPanels.refreshAppButtons).
 *                  설치 안내는 스스로 띄우지 않는다 — 첫 게임 오버 뒤에 한 번만 작은 배너(설정 installNudged).
 *   새 버전        새 서비스 워커가 기다리면 "새 버전이 있어요 [새로고침]" — 판 도중이면 판이 끝날 때까지 미뤘다가,
 *                  [더보기] 에는 🆕 가 바로 생긴다. 자동 새로고침은 없다(판 도중 사라짐).
 *   화면 켜짐      [더보기] 🔆 켬/끔(기본 켬 · 배터리를 더 씁니다). 요청 · 해제는 Pwa.syncWake.
 *   기록 옮기기    [더보기] 🔁 — 내보내기(복사) · 가져오기(형식 · 버전 검사 → 덮어쓰기 확인).
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  var UI = { updateDeferred: false };
  var el = {};
  function $(id) { return typeof document !== 'undefined' ? document.getElementById(id) : null; }
  function midRun() {
    var GM = RPD.GameManager, S = RPD.GameState;
    return GM.state === S.RUNNING || GM.state === S.PAUSED;
  }

  /* ---------- 설치 ---------- */
  UI.installSteps = function () {
    var P = RPD.Pwa;
    if (P && P.isIOS && P.isIOS()) {
      return ['사파리 아래쪽 <b>공유</b> 버튼(<b>□↑</b>)을 누르세요', '목록을 내려 <b>홈 화면에 추가</b>를 누르세요', '오른쪽 위 <b>추가</b> — 홈 화면의 <b>포랜디</b> 아이콘으로 여세요'];
    }
    if (P && !P.supported()) {
      return ['홈 화면 앱은 인터넷 주소(https)로 열었을 때만 만들 수 있어요', '파일을 바로 열었거나 테스트판 한 파일이면 브라우저가 허락하지 않습니다'];
    }
    return ['브라우저 메뉴(<b>⋮</b>)를 누르세요', '<b>앱 설치</b> 또는 <b>홈 화면에 추가</b>를 누르세요'];
  };
  UI.openInstallSheet = function () {
    if (el.steps) el.steps.innerHTML = UI.installSteps().map(function (t) { return '<li>' + t + '</li>'; }).join('');
    if (el.installSheet) el.installSheet.hidden = false;
  };
  /* 설치 — 띄울 수 있는 창이 있으면 그것, 아니면 안내 시트. 무엇을 했는지 돌려준다(검사용) */
  UI.install = function () {
    var P = RPD.Pwa;
    if (P && P.install()) return 'prompt';
    UI.openInstallSheet();
    return 'sheet';
  };
  function hideBanner() { if (el.banner) el.banner.hidden = true; }

  /* 첫 게임 오버 뒤 한 번만 — 앱으로 이미 실행 중이거나, 설치할 수 없는 곳(file:// · 테스트판)이면 안 띄운다 */
  UI.maybeNudge = function () {
    var P = RPD.Pwa, SM = RPD.SaveManager;
    if (!P || !SM || !SM.data || P.isApp() || !P.supported()) return false;
    if (SM.getSetting('installNudged', false)) return false;
    SM.setSetting('installNudged', true);
    if (el.banner) el.banner.hidden = false;
    return true;
  };

  /* ---------- 새 버전 ---------- */
  UI.showUpdate = function () {
    if (el.updateBtn) el.updateBtn.hidden = false;
    if (midRun()) { UI.updateDeferred = true; return false; }   // 판 도중엔 미룬다
    UI.updateDeferred = false;
    if (el.update) el.update.hidden = false;
    return true;
  };
  function afterRun() {
    hideBannerIfRun();
    if (UI.updateDeferred) UI.showUpdate();
  }
  function hideBannerIfRun() { if (midRun()) hideBanner(); }

  /* ---------- 화면 켜짐 ---------- */
  function renderWake() {
    var P = RPD.Pwa;
    if (!el.wake || !P) return;
    var on = P.wakeEnabled();
    el.wake.hidden = !P.wakeSupported();   // 못 쓰는 기기면 버튼도 없다
    el.wake.textContent = on ? '🔆' : '🔅';
    if (el.wake.setAttribute) {
      el.wake.setAttribute('aria-pressed', String(on));
      el.wake.setAttribute('aria-label', on ? '화면 켜짐' : '화면 꺼짐 허용');
      el.wake.setAttribute('title', (on ? '화면 켜짐 — 판 도중 화면이 꺼지지 않아요' : '화면 켜짐 끔 — 기기 설정대로 꺼져요') + ' (켜 두면 배터리를 더 씁니다)');
    }
  }

  /* ---------- 기록 옮기기 ---------- */
  var pendingImport = null;
  function msg(t) { if (el.recordMsg) el.recordMsg.textContent = t || ''; }
  function sumText(s) { return '도감 ' + s.dex + '종 · 클리어 ' + s.clears + '회 · 주문 ' + s.spells + '개 · ' + s.runs + '판'; }
  UI.openRecords = function () {
    var SM = RPD.SaveManager;
    if (el.recordExport) el.recordExport.value = SM.exportText();
    if (el.recordSummary) el.recordSummary.textContent = '지금 기록: ' + sumText(SM.summaryOf(SM.data));
    if (el.recordImport) el.recordImport.value = '';
    if (el.recordConfirm) el.recordConfirm.hidden = true;
    pendingImport = null; msg('');
    if (el.recordSheet) el.recordSheet.hidden = false;
  };
  UI.copyRecords = function () {
    var t = el.recordExport ? el.recordExport.value : RPD.SaveManager.exportText();
    var nav = global.navigator;
    function fallback() {
      try { el.recordExport.focus(); el.recordExport.select(); var ok = document.execCommand && document.execCommand('copy'); msg(ok ? '복사했어요' : '글자를 길게 눌러 전체 선택 → 복사하세요'); }
      catch (e) { msg('글자를 길게 눌러 전체 선택 → 복사하세요'); }
    }
    if (nav && nav.clipboard && nav.clipboard.writeText) nav.clipboard.writeText(t).then(function () { msg('복사했어요'); }, fallback);
    else fallback();
  };
  var REASON = { EMPTY: '붙여 넣은 글자가 없어요', JSON: '글자가 잘렸거나 기록 형식이 아니에요', FORMAT: '포랜디 기록이 아니에요', VERSION: '더 새 게임에서 내보낸 기록이에요 — 게임을 새로고침한 뒤 다시 해 보세요' };
  /* 가져오기 1단계 — 검사하고 덮어쓰기 확인을 띄운다(아직 안 바꾼다) */
  UI.checkImport = function () {
    var r = RPD.SaveManager.parseImport(el.recordImport ? el.recordImport.value : '');
    if (!r.ok) { msg(REASON[r.reason] || '가져올 수 없어요'); if (el.recordConfirm) el.recordConfirm.hidden = true; return r; }
    pendingImport = r.data;
    if (el.recordConfirmText) el.recordConfirmText.textContent = '가져올 기록: ' + sumText(r.summary) + ' — 지금 기록(' + sumText(RPD.SaveManager.summaryOf(RPD.SaveManager.data)) + ')을 덮어씁니다.';
    if (el.recordConfirm) el.recordConfirm.hidden = false;
    msg('');
    return r;
  };
  /* 2단계 — 확인을 누른 뒤에만 */
  UI.confirmImport = function () {
    if (!pendingImport) return false;
    RPD.SaveManager.importData(pendingImport);
    pendingImport = null;
    if (el.recordConfirm) el.recordConfirm.hidden = true;
    if (el.recordExport) el.recordExport.value = RPD.SaveManager.exportText();
    if (el.recordSummary) el.recordSummary.textContent = '지금 기록: ' + sumText(RPD.SaveManager.summaryOf(RPD.SaveManager.data));
    msg('가져왔어요');
    return true;
  };

  UI.init = function () {
    el.installSheet = $('installSheet'); el.steps = $('installSteps'); el.installTitle = $('installTitle');
    el.installClose = $('btnInstallClose');
    el.banner = $('installBanner'); el.bannerInstall = $('btnBannerInstall'); el.bannerClose = $('btnBannerClose');
    el.update = $('updateToast'); el.updateNow = $('btnUpdateNow'); el.updateLater = $('btnUpdateLater'); el.updateBtn = $('btnUpdate');
    el.wake = $('btnWake');
    el.records = $('btnRecords'); el.recordSheet = $('recordSheet'); el.recordTitle = $('recordTitle');
    el.recordExport = $('recordExport'); el.recordSummary = $('recordSummary'); el.recordImport = $('recordImport');
    el.recordConfirm = $('recordConfirm'); el.recordConfirmText = $('recordConfirmText'); el.recordMsg = $('recordMsg');
    el.recordCopy = $('btnRecordCopy'); el.recordImportBtn = $('btnRecordImport'); el.recordClose = $('btnRecordClose');
    el.recordOverwrite = $('btnRecordOverwrite'); el.recordCancel = $('btnRecordCancel');

    if (el.installClose) el.installClose.addEventListener('click', function () { el.installSheet.hidden = true; });
    if (el.bannerInstall) el.bannerInstall.addEventListener('click', function () { hideBanner(); UI.install(); });
    if (el.bannerClose) el.bannerClose.addEventListener('click', hideBanner);
    if (el.updateNow) el.updateNow.addEventListener('click', function () { if (RPD.Pwa) RPD.Pwa.applyUpdate(); });
    if (el.updateLater) el.updateLater.addEventListener('click', function () { el.update.hidden = true; });
    if (el.updateBtn) el.updateBtn.addEventListener('click', function () { if (RPD.Pwa) RPD.Pwa.applyUpdate(); });
    if (el.wake) el.wake.addEventListener('click', function () { var P = RPD.Pwa; if (!P) return; P.setWakeEnabled(!P.wakeEnabled()); renderWake(); });
    if (el.records) el.records.addEventListener('click', UI.openRecords);
    if (el.recordCopy) el.recordCopy.addEventListener('click', UI.copyRecords);
    if (el.recordImportBtn) el.recordImportBtn.addEventListener('click', UI.checkImport);
    if (el.recordOverwrite) el.recordOverwrite.addEventListener('click', UI.confirmImport);
    if (el.recordCancel) el.recordCancel.addEventListener('click', function () { pendingImport = null; el.recordConfirm.hidden = true; msg('가져오지 않았어요'); });
    if (el.recordClose) el.recordClose.addEventListener('click', function () { el.recordSheet.hidden = true; });

    RPD.bus.on('pwa:update', UI.showUpdate);
    RPD.bus.on('pwa:status', renderWake);
    RPD.bus.on('game:over', function () { UI.maybeNudge(); afterRun(); });
    RPD.bus.on('game:victory', afterRun);
    RPD.bus.on('game:reset', afterRun);
    RPD.bus.on('game:state', hideBannerIfRun);
    renderWake();
  };

  RPD.AppUI = UI;
})(typeof window !== 'undefined' ? window : globalThis);
