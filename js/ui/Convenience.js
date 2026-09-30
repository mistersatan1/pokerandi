/* Convenience.js — 편의 기능 화면 쪽 (모바일 ③ · 세션 68).
 *
 *   되돌리기   정보 바 [되돌리기](MobileSheet) · PC Ctrl+Z(⌘Z). 규칙은 UndoManager — 여기는 누르면 부르고 실패를 알린다.
 *   진동       [더보기] → [진동] 켬/끔(Haptics.js · 설정 haptics).
 *   효과       [더보기] → [효과] 보통 → 줄임 → 최소(Effects.js · 설정 fx).
 *   자리 비움  앱을 벗어나면(visibilitychange hidden · pagehide) 전투를 멈추고 "일시정지됨 — 눌러서 계속"을 덮는다.
 *              돌아와도 저절로 풀지 않는다 — 눌러야 이어간다(주머니에서 켜졌다 꺼졌다 해도 라이프가 새지 않게).
 *              소리는 AudioManager 가 알아서 따른다(가려짐 · 일시정지면 배경음을 끈다) — 여기서는 안 건드린다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;
  var GM = RPD.GameManager;
  var S = RPD.GameState;

  var C = { away: false };
  var el = {};

  function doc() { return typeof document !== 'undefined' ? document : null; }
  function $(id) { var d = doc(); return d ? d.getElementById(id) : null; }
  function isMobile() { return !!(RPD.MobileSheet && RPD.MobileSheet.isMobile()); }

  /* ---------- 되돌리기 ---------- */
  C.undo = function () {
    var U = RPD.UndoManager;
    if (!U) return { ok: false, reason: 'EMPTY' };
    var r = U.undo();
    if (!r.ok && r.reason === 'STALE') C.say('되돌릴 수 없어요');
    return r;
  };
  /* 한 줄 알림 — 휴대폰은 정보 바, PC 는 필드 가운데 글자 */
  C.say = function (text) {
    if (isMobile() && RPD.MobileToolbar) { RPD.MobileToolbar.toast(text, 1800); return; }
    var V = RPD.VIEW, Fx = RPD.FxRenderer;
    if (Fx && Fx.text && V) Fx.text(V.width / 2, V.height / 2, text, '#ffd15c', { size: 16, life: 1.2, vy: -20 });
  };

  function bindUndoKey() {
    var d = doc();
    if (!d || !d.addEventListener) return;
    d.addEventListener('keydown', function (e) {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
      if ((e.key || '').toLowerCase() !== 'z' && e.code !== 'KeyZ') return;
      var t = e.target, tag = t && t.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (t && t.isContentEditable)) return;   // 주문 입력 · 검색칸은 글자 되돌리기
      if (e.preventDefault) e.preventDefault();
      C.undo();
    });
  }

  /* ---------- 진동 · 효과 설정 버튼 ---------- */
  function renderSettings() {
    var H = RPD.Haptics, E = RPD.Effects;
    if (el.haptics && H) {
      var on = H.enabled();
      el.haptics.textContent = on ? '📳' : '📴';
      if (el.haptics.setAttribute) {
        el.haptics.setAttribute('aria-pressed', String(on));
        el.haptics.setAttribute('aria-label', on ? '진동 켬' : '진동 끔');
        el.haptics.setAttribute('title', (on ? '진동 켬' : '진동 끔') + (H.supported() ? '' : ' (이 기기는 진동 없음)'));
      }
    }
    if (el.fx && E) {
      var lv = E.get();
      el.fx.textContent = lv.id === 'normal' ? '✨' : lv.id === 'reduced' ? '✧' : '·';
      if (el.fx.setAttribute) {
        el.fx.setAttribute('aria-label', '효과 ' + lv.name);
        el.fx.setAttribute('title', '효과 ' + lv.name + ' — 누르면 ' + E.LEVELS[E.ORDER[(E.ORDER.indexOf(lv.id) + 1) % E.ORDER.length]].name);
        el.fx.setAttribute('data-fx', lv.id);
      }
    }
  }
  C.renderSettings = renderSettings;

  /* ---------- 자리 비움 일시정지 ---------- */
  C.pauseAway = function () {
    if (C.away || GM.state !== S.RUNNING || !RPD.Loop || RPD.Loop.paused) return false;   // 이미 멈춘 판(일시정지 · 도감 · 주문 연출)은 그대로 둔다
    RPD.Loop.setPaused(true);
    GM.setState(S.PAUSED);
    C.away = true;
    if (el.away) el.away.hidden = false;
    return true;
  };
  /* 판 이어하기(세션 70) — 되살린 판을 멈춘 채 같은 덮개로. 누르면 C.resume → Loop 풀림 → RunSave 가 라운드를 연다 */
  C.showPaused = function () {
    C.away = true;
    if (el.away) el.away.hidden = false;
  };
  C.resume = function () {
    if (!C.away) return;
    C.away = false;
    if (el.away) el.away.hidden = true;
    if (GM.state === S.PAUSED) {
      RPD.Loop.setPaused(false);
      GM.setState(S.RUNNING);
    }
  };
  function hideAway() { C.away = false; if (el.away) el.away.hidden = true; }

  C.init = function () {
    var d = doc();
    if (!d) return;
    el.haptics = $('btnHaptics');
    el.fx = $('btnFx');
    el.away = $('awayOverlay');

    bindUndoKey();
    if (el.haptics && el.haptics.addEventListener) {
      el.haptics.addEventListener('click', function () {
        var H = RPD.Haptics;
        if (!H) return;
        H.setEnabled(!H.enabled());
        H.buzz('select');   // 켜면 한 번 떨어 알려 준다(끄면 조용)
        renderSettings();
      });
    }
    if (el.fx && el.fx.addEventListener) {
      el.fx.addEventListener('click', function () {
        if (!RPD.Effects) return;
        var id = RPD.Effects.cycle();
        C.say('효과 ' + RPD.Effects.LEVELS[id].name);
        renderSettings();
      });
    }
    if (el.away && el.away.addEventListener) el.away.addEventListener('click', C.resume);

    if (d.addEventListener) d.addEventListener('visibilitychange', function () { if (d.hidden || d.visibilityState === 'hidden') C.pauseAway(); });
    if (global.addEventListener) global.addEventListener('pagehide', function () { C.pauseAway(); });
    // 다른 길로 풀리거나(⏸ 버튼 · P) 판이 바뀌면 덮개도 걷는다
    RPD.bus.on('loop:paused', function (p) { if (!p && C.away) hideAway(); });
    RPD.bus.on('game:reset', hideAway);
    RPD.bus.on('game:over', hideAway);
    RPD.bus.on('settings:fx', renderSettings);
    RPD.bus.on('settings:haptics', renderSettings);
    renderSettings();
  };

  RPD.Convenience = C;
})(typeof window !== 'undefined' ? window : globalThis);
