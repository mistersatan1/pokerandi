/* FieldManager.js — 배치 슬롯의 소유자.
 * 어떤 슬롯이 비었는지, 무엇이 올라가 있는지, 마우스가 어느 슬롯 위인지를 전부 여기서 답한다.
 * 포켓몬 자체의 능력치나 전투는 모른다 (그건 PHASE 6~7).
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;
  var U = RPD.Utils;

  var FieldManager = {
    slots: [],
    selectedIndex: -1,
    hoverIndex: -1,
    dragFromIndex: -1
  };

  FieldManager.init = function () {
    // 모드가 칸 수를 제한하면 남는 칸은 잠기고, 골드로도 열 수 없다.
    var limit = RPD.modeMod('slotLimit', Infinity);
    var opened = 0;

    this.slots = RPD.MapData.slots.map(function (s) {
      var unlocked = s.unlocked;
      var blocked = false;
      if (unlocked) {
        if (opened >= limit) { unlocked = false; blocked = true; }
        else opened += 1;
      } else if (opened >= limit) {
        blocked = true;   // 확장 칸도 한도를 넘으면 살 수 없다
      }
      return buildSlot(s, unlocked, blocked);
    });
    this.selectedIndex = -1;
    this.hoverIndex = -1;
    this.dragFromIndex = -1;
  };

  function buildSlot(s, unlocked, blocked) {
      return {
        index: s.index,
        row: s.row,
        col: s.col,
        x: s.x,
        y: s.y,
        size: RPD.MapData.slotSize,
        unlocked: unlocked,
        blocked: blocked,
        expansion: !!s.expansion,
        cost: s.cost || 0,
        label: s.label || '',
        unit: null,
        // 이 슬롯에서 경로까지의 최단 거리.
        distToPath: RPD.MapData.path.closestDistanceTo(s.x, s.y),
        // 사거리별로 이 칸이 경로를 몇 px 덮는지. 배치 판단의 근거를 숫자로 보여 준다.
        coverage: {
          100: RPD.MapData.coverageAt(s.x, s.y, RPD.Range.SHORT),
          155: RPD.MapData.coverageAt(s.x, s.y, RPD.Range.MID),
          235: RPD.MapData.coverageAt(s.x, s.y, RPD.Range.LONG)
        },
        kind: s.kind || '',
        kindLabel: s.kindLabel || '',
        note: s.note || ''
      };
  }

  /* 이 칸에 그 사거리를 놓으면 경로를 얼마나 덮는가. UI 가 그대로 보여 준다. */
  FieldManager.coverageFor = function (slot, range) {
    if (!slot) return 0;
    if (range >= RPD.Range.GLOBAL) return Math.round(RPD.MapData.path.length);
    var keys = [100, 155, 235];
    var best = keys[0];
    for (var i = 0; i < keys.length; i++) if (range >= keys[i]) best = keys[i];
    return slot.coverage[best] || 0;
  };

  FieldManager.unlock = function (index) {
    var slot = this.get(index);
    if (!slot || slot.unlocked) return false;
    if (slot.blocked) return false;   // 모드 제한으로 막힌 칸은 골드로도 못 연다
    slot.unlocked = true;
    RPD.bus.emit('field:unlocked', slot);
    RPD.bus.emit('field:changed');
    return true;
  };

  /* 살 수 있는 잠긴 칸만. 모드 제한으로 막힌 칸은 제외한다. */
  FieldManager.lockedSlots = function () {
    return this.slots.filter(function (s) { return !s.unlocked && !s.blocked; });
  };

  FieldManager.blockedSlots = function () {
    return this.slots.filter(function (s) { return s.blocked; });
  };

  FieldManager.get = function (index) {
    return (index >= 0 && index < this.slots.length) ? this.slots[index] : null;
  };

  FieldManager.getSelected = function () { return this.get(this.selectedIndex); };

  FieldManager.firstEmpty = function () {
    for (var i = 0; i < this.slots.length; i++) {
      var s = this.slots[i];
      if (s.unlocked && !s.unit) return s;
    }
    return null;
  };

  FieldManager.emptyCount = function () {
    var n = 0;
    for (var i = 0; i < this.slots.length; i++) {
      if (this.slots[i].unlocked && !this.slots[i].unit) n += 1;
    }
    return n;
  };

  FieldManager.unitCount = function () {
    return this.slots.length - this.emptyCount() -
           this.slots.filter(function (s) { return !s.unlocked; }).length;
  };

  FieldManager.getUnits = function () {
    var out = [];
    for (var i = 0; i < this.slots.length; i++) {
      if (this.slots[i].unit) out.push(this.slots[i].unit);
    }
    return out;
  };

  /* 논리 좌표(캔버스 1000x600 기준)로 슬롯을 찾는다. 없으면 -1. */
  FieldManager.hitTest = function (x, y) {
    for (var i = 0; i < this.slots.length; i++) {
      var s = this.slots[i];
      // 잠긴 칸도 잡는다 — 클릭해서 구매해야 하기 때문이다.
      var half = s.size / 2;
      if (x >= s.x - half && x <= s.x + half && y >= s.y - half && y <= s.y + half) {
        return i;
      }
    }
    return -1;
  };

  FieldManager.setHover = function (index) {
    if (this.hoverIndex === index) return;
    this.hoverIndex = index;
    RPD.bus.emit('field:hover', index);
  };

  FieldManager.select = function (index) {
    if (this.selectedIndex === index) return;
    this.selectedIndex = index;
    RPD.bus.emit('field:select', { index: index, slot: this.get(index) });
  };

  FieldManager.clearSelection = function () { this.select(-1); };

  FieldManager.place = function (index, unit) {
    var slot = this.get(index);
    if (!slot || !slot.unlocked || slot.unit) return false;
    slot.unit = unit;
    unit.slotIndex = index;
    unit.x = slot.x;
    unit.y = slot.y;
    RPD.bus.emit('field:placed', { index: index, unit: unit });
    RPD.bus.emit('field:changed');
    return true;
  };

  FieldManager.remove = function (index) {
    var slot = this.get(index);
    if (!slot || !slot.unit) return null;
    var unit = slot.unit;
    slot.unit = null;
    unit.slotIndex = -1;
    RPD.bus.emit('field:removed', { index: index, unit: unit });
    RPD.bus.emit('field:changed');
    return unit;
  };

  /* 두 슬롯의 내용을 교환한다. 빈 칸으로 옮기는 것도 같은 경로로 처리된다. */
  FieldManager.swap = function (a, b) {
    var sa = this.get(a), sb = this.get(b);
    if (!sa || !sb || a === b) return false;
    if (!sa.unlocked || !sb.unlocked) return false;

    var tmp = sa.unit;
    sa.unit = sb.unit;
    sb.unit = tmp;

    if (sa.unit) { sa.unit.slotIndex = a; sa.unit.x = sa.x; sa.unit.y = sa.y; }
    if (sb.unit) { sb.unit.slotIndex = b; sb.unit.x = sb.x; sb.unit.y = sb.y; }

    RPD.bus.emit('field:changed');
    return true;
  };

  FieldManager.beginDrag = function (index) {
    var slot = this.get(index);
    if (!slot || !slot.unit) return false;
    this.dragFromIndex = index;
    return true;
  };

  FieldManager.endDrag = function (targetIndex) {
    var from = this.dragFromIndex;
    this.dragFromIndex = -1;
    if (from < 0) return false;
    // 필드 밖에 놓으면 아무 일도 일어나지 않는다 (유닛이 사라지지 않게).
    if (targetIndex < 0 || targetIndex === from) return false;
    return this.swap(from, targetIndex);
  };

  FieldManager.cancelDrag = function () { this.dragFromIndex = -1; };

  RPD.FieldManager = FieldManager;
})(typeof window !== 'undefined' ? window : globalThis);
