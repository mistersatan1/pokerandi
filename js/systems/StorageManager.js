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

  /* 판의 창고 칸 = 기본(Config.storageBase) + 도감 보상(세션 97) */
  StorageManager.baseCapacity = function () {
    return RPD.Config.storageBase + (RPD.DexBonus ? RPD.DexBonus.totals().storage || 0 : 0);
  };
  StorageManager.reset = function () {
    this.units = [];
    this.capacity = this.baseCapacity();
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
      ? RPD.FieldManager.firstEmpty(unit)
      : RPD.FieldManager.get(fieldIndex);

    if (!slot) return { ok: false, reason: 'NO_SLOT' };
    if (!slot.unlocked) return { ok: false, reason: 'LOCKED' };
    // 응원 칸은 응원 가능 포켓몬만 — 창고에서 빼기 전에 본다(빼고 나서 실패하면 개체가 사라진다)
    var can = RPD.FieldManager.canPlace(slot.index, unit);
    if (!can.ok) { RPD.bus.emit('field:rejected', { index: slot.index, unit: unit, reason: can.reason }); return { ok: false, reason: can.reason }; }

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
    RPD.bus.emit('storage:stored', { unit: unit, from: fieldIndex });
    return { ok: true, unit: unit };
  };

  /* ---------- 일괄 창고로 (필드 → 창고, 등급별) ----------
   * 등급 칸은 골드 상점 · 조합식 [히든] 칩과 같은 규칙(GoldShopManager.tierSlotOf): 히든은 자기 강함 등급이 아니라 [히든] 칸에만,
   * 불멸 · 초월은 [불멸 · 초월] 칸. 잠긴 개체는 건너뛰고, 약한(DPS 낮은) 것부터 보내며, 창고 자리가 모자라면 들어가는 만큼만 보낸다
   * (나머지는 필드에 그대로 — 개체는 절대 사라지지 않는다). 되돌리기는 'storage:bulk' 한 건으로 묶는다(UndoManager). */
  StorageManager.bulkGroups = function () {
    var G = RPD.GoldShopManager;
    var groups = G.TIER_SLOTS.map(function (t) {
      var tier = RPD.Tiers[t.id];
      return { id: t.id, label: t.label, color: t.color || (tier ? tier.color : RPD.Tiers.T6.color), units: [], locked: 0 };
    });
    var at = {};
    groups.forEach(function (g) { at[g.id] = g; });
    RPD.FieldManager.slots.forEach(function (s) {
      if (!s.unit || s.zone === 'cheer') return;   // 응원 칸은 일괄 창고로에서 뺀다
      var g = at[G.tierSlotOf(s.unit.def)];
      if (!g) return;
      if (s.unit.locked) g.locked += 1; else g.units.push({ unit: s.unit, slot: s.index });
    });
    groups.forEach(function (g) {
      g.units.sort(function (a, b) { return (a.unit.dps - b.unit.dps) || (a.unit.uid > b.unit.uid ? 1 : -1); });
      g.count = g.units.length;     // 보낼 수 있는 수(잠금 제외)
    });
    return groups;
  };

  /* 고른 칸들을 보낸다. { moved, noRoom, locked, groups:{id:{moved,noRoom,locked}}, items:[{uid,from}] } */
  StorageManager.bulkStore = function (ids) {
    var want = {};
    (ids || []).forEach(function (id) { want[id] = true; });
    var res = { moved: 0, noRoom: 0, locked: 0, groups: {}, items: [] };
    var F = RPD.FieldManager, self = this, picked = [];
    this.bulkGroups().forEach(function (g) {
      if (!want[g.id]) return;
      res.groups[g.id] = { moved: 0, noRoom: 0, locked: g.locked };
      res.locked += g.locked;
      g.units.forEach(function (x) { picked.push({ g: g, x: x }); });
    });
    // 여러 칸을 골랐으면 전체에서 약한 것부터(칸 안에서도 약한 순서는 이미 같다)
    picked.sort(function (a, b) { return (a.x.unit.dps - b.x.unit.dps) || (a.x.unit.uid > b.x.unit.uid ? 1 : -1); });
    picked.forEach(function (p) {
      var u = p.x.unit, gr = res.groups[p.g.id];
      if (self.isFull()) { gr.noRoom += 1; res.noRoom += 1; return; }
      var removed = F.remove(p.x.slot);
      if (!removed) return;
      if (!self.add(removed)) { F.place(p.x.slot, removed); gr.noRoom += 1; res.noRoom += 1; return; }   // 안전망 — 사라지지 않게 제자리로
      gr.moved += 1; res.moved += 1;
      res.items.push({ uid: removed.uid, from: p.x.slot });
      RPD.bus.emit('storage:stored', { unit: removed, from: p.x.slot, bulk: true });
    });
    if (res.moved) {
      RPD.UnitManager.recomputeAll();
      RPD.bus.emit('storage:bulk', { items: res.items });
    }
    return res;
  };

  /* 필드 + 창고를 합친 보유 현황 — 조합식이 이걸 본다 */
  StorageManager.allUnits = function () {
    return RPD.FieldManager.getAllUnits().concat(this.units);   // 응원 칸 포함 — 조합 · 주문 · 추천의 보유
  };

  /* ---------- 판 이어하기(RunSave · 세션 70) — 라운드 시작 때의 상태만 ---------- */
  StorageManager.saveState = function () {
    return { capacity: this.capacity, units: this.units.map(function (u) { return RPD.UnitManager.serialize(u); }) };
  };
  StorageManager.loadState = function (s) {
    var self = this;
    // 옛 저장(용량 14 · 확장으로 늘린 값)이 지금 기본값보다 작을 수 있다 — 더 큰 쪽(세션 76 에 골드 확장을 없앴다)
    this.capacity = Math.max(s.capacity || 0, this.baseCapacity());
    (s.units || []).forEach(function (d) { var u = RPD.UnitManager.revive(d); if (u) self.add(u); });
    RPD.bus.emit('storage:changed', this.units);
  };

  RPD.StorageManager = StorageManager;
})(typeof window !== 'undefined' ? window : globalThis);
