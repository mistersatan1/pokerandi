/* BulkStoreUI.js — [일괄 창고로] 선택 창 (세션 75). 규칙은 StorageManager.bulkGroups / bulkStore — 여기는 고르고 · 확인하고 · 알리기만 한다.
 *
 *   등급 칸(흔함 … 전설 · 🔒히든 · 불멸 · 초월) 각각 "필드 N마리"와 체크박스. 히든은 [히든] 칸에만(골드 상점과 같은 규칙).
 *   잠긴 개체는 건너뛰고 "잠금 N마리 제외"로 알린다. 창고 자리가 모자라면 약한 것부터 들어가는 만큼만.
 *   전설 · 히든 · 불멸 · 초월 칸이 체크돼 있으면 [보내기]가 한 번 더 묻는다.
 *   휴대폰에서는 .board > .book 이라 시트(MobileSheet OVERLAYS)로 뜬다. 결과는 토스트(휴대폰 정보 바 · PC 필드 글자). */
(function (global) {
  'use strict';
  var RPD = global.RPD;
  var UI = { open: false, picked: {}, confirming: false };
  var el = {};
  var BIG = { T5: true, HIDDEN: true, SPECIAL: true };    // 한 번 더 확인하는 칸
  function $(id) { return document.getElementById(id); }

  function pickedIds(groups) {
    return groups.filter(function (g) { return UI.picked[g.id] && g.count > 0; }).map(function (g) { return g.id; });
  }
  function needsConfirm(ids) { return ids.some(function (id) { return BIG[id]; }); }

  UI.render = function () {
    if (!el.overlay || el.overlay.hidden) return;
    var SM = RPD.StorageManager, groups = SM.bulkGroups();
    groups.forEach(function (g) { if (!g.count) UI.picked[g.id] = false; });
    var ids = pickedIds(groups), sel = 0, lockedPicked = 0;
    groups.forEach(function (g) { if (ids.indexOf(g.id) >= 0) { sel += g.count; lockedPicked += g.locked; } });
    var free = SM.freeSlots();

    el.list.innerHTML = groups.map(function (g) {
      var on = !!UI.picked[g.id] && g.count > 0;
      return '<label class="bulkrow' + (on ? ' is-on' : '') + (g.count ? '' : ' is-empty') + '" style="--c:' + g.color + '">' +
        '<input type="checkbox" data-id="' + g.id + '"' + (on ? ' checked' : '') + (g.count ? '' : ' disabled') + '>' +
        '<span class="bulkrow__name">' + g.label + '</span>' +
        '<span class="bulkrow__n">필드 ' + (g.count + g.locked) + '마리</span>' +
        (g.locked ? '<span class="bulkrow__lk">🔒 잠금 ' + g.locked + '마리 제외</span>' : '') +
      '</label>';
    }).join('');

    var line = sel ? '보낼 ' + sel + '마리 · 창고 빈 자리 ' + free + '칸' : '보낼 등급을 고르세요 · 창고 빈 자리 ' + free + '칸';
    if (sel && sel > free) line += ' — <b>' + free + '마리만 보냅니다</b>(약한 것부터 · 나머지 ' + (sel - free) + '마리는 필드에 남아요)';
    if (lockedPicked) line += ' · 잠금 ' + lockedPicked + '마리 제외';
    el.summary.innerHTML = line;
    el.send.disabled = !sel || !RPD.GameManager.isPlayable() || free < 1;
    el.confirm.hidden = !UI.confirming;
    if (UI.confirming) el.confirmText.textContent = '전설 · 히든 · 불멸 · 초월이 들어 있어요. 정말 창고로 보낼까요?';
    el.send.hidden = UI.confirming;
  };

  UI.show = function () {
    if (!el.overlay) return;
    UI.confirming = false;
    el.overlay.hidden = false;
    UI.render();
  };
  UI.hide = function () { UI.confirming = false; if (el.overlay) el.overlay.hidden = true; };
  UI.toggle = function () { if (!el.overlay) return; if (el.overlay.hidden) UI.show(); else UI.hide(); };

  /* 토스트 글 — "흔함 5마리를 창고로 보냈어요 (3마리는 창고가 가득 차 남음)" */
  UI.message = function (res, groups) {
    var names = [];
    groups.forEach(function (g) { if (res.groups[g.id] && res.groups[g.id].moved) names.push(g.label.replace('🔒 ', '')); });
    var text;
    if (!res.moved) text = res.noRoom ? '창고가 가득 차 보내지 못했어요' : '보낼 포켓몬이 없어요';
    else text = names.join(' · ') + ' ' + res.moved + '마리를 창고로 보냈어요';
    if (res.moved && res.noRoom) text += ' (' + res.noRoom + '마리는 창고가 가득 차 남음)';
    else if (!res.moved && res.noRoom) text += ' (' + res.noRoom + '마리 남음)';
    if (res.locked) text += ' · 잠금 ' + res.locked + '마리 제외';
    return text;
  };

  UI.send = function () {
    var SM = RPD.StorageManager, groups = SM.bulkGroups(), ids = pickedIds(groups);
    if (!ids.length) return null;
    var res = SM.bulkStore(ids);
    var text = UI.message(res, groups);
    UI.hide();
    if (RPD.Convenience && RPD.Convenience.say) RPD.Convenience.say(text, 3500);
    UI.lastMessage = text;
    return res;
  };

  UI.init = function () {
    el.overlay = $('bulkOverlay');
    el.list = $('bulkList'); el.summary = $('bulkSummary');
    el.send = $('btnBulkSend'); el.cancel = $('btnBulkCancel'); el.close = $('btnBulkClose');
    el.confirm = $('bulkConfirm'); el.confirmText = $('bulkConfirmText');
    el.yes = $('btnBulkYes'); el.no = $('btnBulkNo');
    el.btn = $('btnBulkStore');
    if (!el.overlay) return;
    if (el.btn) el.btn.addEventListener('click', UI.toggle);
    if (el.close) el.close.addEventListener('click', UI.hide);
    if (el.cancel) el.cancel.addEventListener('click', UI.hide);
    if (el.send) el.send.addEventListener('click', function () {
      var groups = RPD.StorageManager.bulkGroups(), ids = pickedIds(groups);
      if (!ids.length) return;
      if (needsConfirm(ids)) { UI.confirming = true; UI.render(); return; }   // 전설 · 히든 · 불멸 · 초월 — 한 번 확인
      UI.send();
    });
    if (el.yes) el.yes.addEventListener('click', UI.send);
    if (el.no) el.no.addEventListener('click', function () { UI.confirming = false; UI.render(); });
    el.overlay.addEventListener('click', function (e) { if (e.target === el.overlay) UI.hide(); });
    el.list.addEventListener('change', function (e) {
      var t = e.target;
      if (!t || !t.getAttribute || !t.getAttribute('data-id')) return;
      UI.picked[t.getAttribute('data-id')] = !!t.checked;
      UI.confirming = false;      // 고른 칸이 바뀌면 확인을 다시 받는다
      UI.render();
    });
    ['field:changed', 'storage:changed', 'economy:gold', 'units:recomputed'].forEach(function (ev) { RPD.bus.on(ev, UI.render); });
    RPD.bus.on('game:reset', function () { UI.picked = {}; UI.hide(); });
  };

  RPD.BulkStoreUI = UI;
})(typeof window !== 'undefined' ? window : globalThis);
