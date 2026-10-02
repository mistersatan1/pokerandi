/* UndoManager.js — 배치 이동 되돌리기 (모바일 ③ 편의 기능 · 세션 68).
 *
 * 되돌리는 것은 **배치 이동만** — 필드 칸끼리 이동 · 교체, 필드 → 창고, 창고 → 필드. 최대 3번.
 * 소환 · 조합 · 방출 · 강화 · 상점 구매 · 정예는 되돌리지 않는다(골드 이득을 챙기고 되돌리는 악용을 막는다).
 *
 * 기록 = { 무엇을(kind), 개체 uid, 이전 위치(필드 칸 / 창고), 자리가 바뀐 상대 uid }.
 * 되돌리기 직전에 확인해서 관련 개체가 기록한 자리에 그대로 있을 때만 실행한다. 아니면 그 기록을 버리고 STALE 을 돌려준다
 * (화면이 "되돌릴 수 없어요"를 띄운다). 조합 재료로 쓰였거나 방출된 개체가 낀 기록은 그때그때 지운다. 새 판 · 게임 오버에 비운다.
 * 기록은 이동 이벤트(field:swapped · storage:stored · storage:deployed)로 모은다 — 끌기 · 이동 모드 · 버튼 · 단축키 어느 길로 옮겨도 같다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  var MAX = 3;
  var Undo = { MAX: MAX, stack: [], busy: false };

  function F() { return RPD.FieldManager; }
  function S() { return RPD.StorageManager; }
  function uidAt(slotIndex) { var s = F().get(slotIndex); return s && s.unit ? s.unit.uid : null; }
  function storageIndexOf(uid) {
    var list = S().units;
    for (var i = 0; i < list.length; i++) if (list[i].uid === uid) return i;
    return -1;
  }
  function onField(uid) { return F().getAllUnits().some(function (u) { return u.uid === uid; }); }
  function exists(uid) { return onField(uid) || storageIndexOf(uid) >= 0; }

  function push(rec) {
    if (Undo.busy) return;
    Undo.stack.push(rec);
    while (Undo.stack.length > MAX) Undo.stack.shift();
    changed();
  }
  function changed() { RPD.bus.emit('undo:changed', { count: Undo.stack.length }); }

  function alive(r) {
    if (r.kind === 'bulk') return r.items.every(function (it) { return exists(it.uid); });
    return exists(r.uid) && (!r.other || exists(r.other));
  }
  /* 화면 표시용 — 사라진 개체가 낀 기록은 빼고 센다(목록은 안 건드린다) */
  Undo.count = function () { return Undo.stack.filter(alive).length; };
  Undo.canUndo = function () { return Undo.count() > 0; };
  Undo.reset = function () { Undo.stack = []; changed(); };

  /* 재료로 쓰였거나 방출돼 사라진 개체가 낀 기록은 지운다 */
  Undo.prune = function () {
    var before = Undo.stack.length;
    Undo.stack = Undo.stack.filter(alive);
    if (Undo.stack.length !== before) changed();
  };

  /* 기록한 자리에 그대로 있는가(되돌리기 직전 확인) */
  function valid(r) {
    if (r.kind === 'swap') {
      // moved 가 to 에 · other 가 from 에(없었으면 from 은 비어 있어야)
      var fromSlot = F().get(r.from);
      return uidAt(r.to) === r.uid && (r.other ? uidAt(r.from) === r.other : !!(fromSlot && fromSlot.unlocked && !fromSlot.unit));
    }
    if (r.kind === 'store') {
      var s = F().get(r.from);
      return storageIndexOf(r.uid) >= 0 && !!(s && s.unlocked && !s.blocked && !s.unit);
    }
    if (r.kind === 'bulk') {   // 일괄 창고로 — 전부 창고에 그대로 있고 원래 칸이 비어 있어야 한 번에 되돌린다
      var seen = {};
      return r.items.every(function (it) {
        var s = F().get(it.from);
        if (seen[it.from]) return false;
        seen[it.from] = true;
        return storageIndexOf(it.uid) >= 0 && !!(s && s.unlocked && !s.blocked && !s.unit);
      });
    }
    if (r.kind === 'deploy') {
      if (uidAt(r.to) !== r.uid) return false;
      return r.other ? storageIndexOf(r.other) >= 0 : !S().isFull();
    }
    return false;
  }

  function apply(r) {
    if (r.kind === 'swap') return F().swap(r.to, r.from);
    if (r.kind === 'store') return S().deploy(storageIndexOf(r.uid), r.from).ok;
    if (r.kind === 'bulk') {
      var all = true;
      r.items.forEach(function (it) { var i = storageIndexOf(it.uid); if (i < 0 || !S().deploy(i, it.from).ok) all = false; });
      return all;
    }
    if (r.kind === 'deploy') {
      // 창고에서 올리며 자리를 바꿨으면 그 상대를 다시 올린다(= 맞바꿈이 거꾸로) · 아니면 창고로
      return r.other ? S().deploy(storageIndexOf(r.other), r.to).ok : S().store(r.to).ok;
    }
    return false;
  }

  /* 되돌리기 — { ok } · { ok:false, reason:'EMPTY' | 'STALE' } */
  Undo.undo = function () {
    Undo.prune();
    var r = Undo.stack.pop();
    if (!r) return { ok: false, reason: 'EMPTY' };
    if (!valid(r)) { changed(); return { ok: false, reason: 'STALE' }; }
    Undo.busy = true;
    var ok = false;
    try { ok = apply(r); } finally { Undo.busy = false; }
    changed();
    RPD.bus.emit('undo:done', { record: r, ok: !!ok });
    return ok ? { ok: true, record: r } : { ok: false, reason: 'STALE' };
  };

  Undo.init = function () {
    var bus = RPD.bus;
    bus.on('field:swapped', function (p) {
      if (!p || !p.moved) return;
      push({ kind: 'swap', uid: p.moved.uid, from: p.from, to: p.to, other: p.other ? p.other.uid : null });
    });
    bus.on('storage:stored', function (p) {
      if (!p || !p.unit || p.from == null || p.bulk) return;   // 일괄 창고로는 아래 'storage:bulk' 한 건으로
      push({ kind: 'store', uid: p.unit.uid, from: p.from });
    });
    bus.on('storage:bulk', function (p) {
      if (!p || !p.items || !p.items.length) return;
      push({ kind: 'bulk', items: p.items.map(function (it) { return { uid: it.uid, from: it.from }; }) });
    });
    bus.on('storage:deployed', function (p) {
      if (!p || !p.unit) return;
      push({ kind: 'deploy', uid: p.unit.uid, to: p.slotIndex, other: p.swapped ? p.swapped.uid : null });
    });
    // 개체가 사라지는 길(조합 재료 · 방출 · 주문 재료)이 끝난 뒤에 지운다.
    // field:changed · storage:changed(· 그걸 듣는 units:recomputed)에서 지우면 안 된다 —
    // 창고 ↔ 필드 맞바꿈 도중 한 개체가 잠깐 어디에도 없어서 멀쩡한 기록이 지워진다. 화면 숫자(count)는 늘 사라진 것을 빼고 센다
    ['recipe:crafted', 'unit:sold', 'spell:cast'].forEach(function (ev) { bus.on(ev, Undo.prune); });
    bus.on('game:reset', Undo.reset);
    bus.on('game:over', Undo.reset);
  };

  RPD.UndoManager = Undo;
})(typeof window !== 'undefined' ? window : globalThis);
