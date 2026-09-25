/* StorageManager.js — 창고.
 *
 * 왜 필요한가:
 * 조합식이 29개인데 다 외울 수 없다. 그 상태에서 필드 18칸이 차면
 * "뭘 버리고 뭘 남길까"가 고민이 아니라 도박이 된다. 잘못 버리면 조합이 막힌다.
 *
 * 창고가 생기면 고민이 바뀐다.
 *   버릴까 말까  →  어떤 걸 필드에 올릴까
 *
 * 무한은 아니다. 무한이면 방출과 조각이 죽는다.
 * 기본 20칸이고 골드로 늘릴 수 있다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  var StorageManager = {
    units: [],
    capacity: 0
  };

  StorageManager.reset = function () {
    this.units = [];
    this.capacity = RPD.Config.storageBase;
    RPD.bus.emit('storage:changed', this.units);
  };

  StorageManager.isFull = function () { return this.units.length >= this.capacity; };
  StorageManager.freeSlots = function () { return Math.max(0, this.capacity - this.units.length); };

  StorageManager.add = function (unit) {
    if (!unit || this.isFull()) return false;
    unit.slotIndex = -1;
    unit.inStorage = true;
    this.units.push(unit);
    RPD.bus.emit('storage:changed', this.units);
    RPD.bus.emit('field:changed');   // 조합식·시너지가 다시 계산된다
    return true;
  };

  StorageManager.removeAt = function (index) {
    if (index < 0 || index >= this.units.length) return null;
    var unit = this.units.splice(index, 1)[0];
    unit.inStorage = false;
    RPD.bus.emit('storage:changed', this.units);
    return unit;
  };

  StorageManager.remove = function (unit) {
    return this.removeAt(this.units.indexOf(unit));
  };

  StorageManager.indexOfSpecies = function (defId) {
    for (var i = 0; i < this.units.length; i++) {
      if (this.units[i].defId === defId) return i;
    }
    return -1;
  };

  StorageManager.countSpecies = function (defId) {
    var n = 0;
    for (var i = 0; i < this.units.length; i++) if (this.units[i].defId === defId) n += 1;
    return n;
  };

  /* ---------- 창고 ↔ 필드 ---------- */

  StorageManager.deploy = function (storageIndex, fieldIndex) {
    var unit = this.units[storageIndex];
    if (!unit) return { ok: false, reason: 'NO_UNIT' };

    var slot = fieldIndex === undefined || fieldIndex === null
      ? RPD.FieldManager.firstEmpty()
      : RPD.FieldManager.get(fieldIndex);

    if (!slot) return { ok: false, reason: 'NO_SLOT' };
    if (!slot.unlocked) return { ok: false, reason: 'LOCKED' };

    // 이미 누가 있으면 자리를 맞바꾼다 — 필드가 꽉 차도 교체가 된다
    var swapped = slot.unit;
    if (swapped) RPD.FieldManager.remove(slot.index);

    this.removeAt(storageIndex);
    RPD.FieldManager.place(slot.index, unit);
    if (swapped) this.add(swapped);

    RPD.UnitManager.recomputeAll();
    RPD.bus.emit('storage:deployed', { unit: unit, slotIndex: slot.index, swapped: swapped });
    return { ok: true, unit: unit, slotIndex: slot.index, swapped: swapped };
  };

  StorageManager.store = function (fieldIndex) {
    var slot = RPD.FieldManager.get(fieldIndex);
    if (!slot || !slot.unit) return { ok: false, reason: 'NO_UNIT' };
    if (this.isFull()) return { ok: false, reason: 'FULL' };

    var unit = RPD.FieldManager.remove(fieldIndex);
    this.add(unit);
    RPD.UnitManager.recomputeAll();
    RPD.bus.emit('storage:stored', { unit: unit });
    return { ok: true, unit: unit };
  };

  /* ---------- 확장 ---------- */

  StorageManager.expandCost = function () {
    var bought = (this.capacity - RPD.Config.storageBase) / RPD.Config.storageStep;
    return Math.round(RPD.Config.storageExpandCost *
                      Math.pow(RPD.Config.storageExpandGrowth, bought));
  };

  StorageManager.canExpand = function () {
    return this.capacity < RPD.Config.storageMax;
  };

  StorageManager.expand = function () {
    if (!this.canExpand()) return { ok: false, reason: 'MAX' };
    var cost = this.expandCost();
    if (!RPD.GameManager.spendGold(cost, 'storage')) return { ok: false, reason: 'NO_GOLD', cost: cost };

    this.capacity += RPD.Config.storageStep;
    RPD.bus.emit('storage:changed', this.units);
    RPD.bus.emit('storage:expanded', { capacity: this.capacity, cost: cost });
    return { ok: true, capacity: this.capacity, cost: cost };
  };

  /* 필드 + 창고를 합친 보유 현황 — 조합식이 이걸 본다 */
  StorageManager.allUnits = function () {
    return RPD.FieldManager.getUnits().concat(this.units);
  };

  RPD.StorageManager = StorageManager;
})(typeof window !== 'undefined' ? window : globalThis);
