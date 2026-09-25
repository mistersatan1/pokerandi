/* SpellManager.js — 채팅 주문으로 조합한다(히든 · 불멸 · 초월). 종류는 spell.kind 로 가른다.
 *
 * cast(text) 한 번이 전부다.
 *   - 주문이 아니면: 아무 일도 없다(UNKNOWN). 틀린 주문으로 무엇이 있는지 짐작할 수 없게.
 *   - 주문은 맞는데 재료가 모자라면: NOT_READY — "아직 때가 아니다" 한 줄.
 *     (주문이 맞았다는 것만 넌지시 알려 준다)
 *   - 초월: 초월의 조각이 없거나 이번 판에 이미 초월했으면 거부.
 *   - 성공: 재료를 소모하고 결과를 필드(없으면 창고)에 둔다. 발견 기록을 남긴다.
 * 연출(대사·배경음악)은 'spell:cast' 이벤트를 받은 화면 쪽이 한다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  var SpellManager = { transcendShards: 0, transcendUsed: false };

  SpellManager.reset = function () {
    this.transcendShards = 0;
    this.transcendUsed = false;
  };

  SpellManager.init = function () {
    var self = this;
    RPD.bus.on('game:reset', function () { self.reset(); });
    // 40라운드 보스 보상 — 초월의 조각
    RPD.bus.on('reward:granted', function (e) {
      if (!e || !e.items) return;
      e.items.forEach(function (it) {
        if (it.kind === 'item' && it.item === 'transcendShard') {
          self.transcendShards += it.count || 1;
          RPD.bus.emit('spell:shard', { total: self.transcendShards });
        }
      });
    });
  };

  /* 재료를 필드·창고에서 찾는다. 같은 재료 두 번이면 두 마리. 창고 먼저. */
  function findUnits(materials) {
    var SM = RPD.StorageManager, F = RPD.FieldManager;
    var usedS = {}, usedF = {}, out = [];
    for (var i = 0; i < materials.length; i++) {
      var want = materials[i], found = null;
      for (var k = 0; k < SM.units.length && !found; k++) {
        if (!usedS[k] && SM.units[k].defId === want) { usedS[k] = true; found = { where: 'store', unit: SM.units[k] }; }
      }
      for (var s = 0; s < F.slots.length && !found; s++) {
        var u = F.slots[s].unit;
        if (!usedF[s] && u && u.defId === want) { usedF[s] = true; found = { where: 'field', slot: s, unit: u }; }
      }
      if (!found) return null;
      out.push(found);
    }
    return out;
  }

  SpellManager.check = function (spell) {
    if (spell.kind === 'transcend') {
      if (this.transcendUsed) return { ok: false, reason: 'ONCE' };
      if (this.transcendShards < 1) return { ok: false, reason: 'NO_SHARD' };
    }
    var found = findUnits(spell.materials);
    if (!found) return { ok: false, reason: 'NOT_READY' };
    return { ok: true, found: found };
  };

  SpellManager.cast = function (text) {
    var spell = RPD.SpellData.byPhrase(text);
    if (!spell) return { ok: false, reason: 'UNKNOWN' };
    if (!RPD.GameManager.isPlayable || !RPD.GameManager.isPlayable()) return { ok: false, reason: 'NOT_PLAYING', spell: spell };

    var c = this.check(spell);
    if (!c.ok) {
      c.spell = spell;
      RPD.bus.emit('spell:failed', c);
      return c;
    }

    // 재료 소모 — 필드에서 빠진 첫 칸을 결과 자리로 쓴다
    var slotForResult = -1;
    var removeStore = [];
    c.found.forEach(function (f) {
      if (f.where === 'field') {
        if (slotForResult < 0) slotForResult = f.slot;
        RPD.FieldManager.remove(f.slot);
      } else {
        removeStore.push(RPD.StorageManager.units.indexOf(f.unit));
      }
    });
    removeStore.sort(function (a, b) { return b - a; }).forEach(function (i) { RPD.StorageManager.removeAt(i); });

    var unit = RPD.UnitManager.create(spell.result);
    unit.investedGold = 0;
    // 조합식과 같은 규칙 — 재료 중 가장 높은 강화 레벨의 절반을 이어받는다
    var topLevel = c.found.reduce(function (m, f) { return Math.max(m, (f.unit && f.unit.level) || 0); }, 0);
    unit.level = Math.min(RPD.Config.upgradeMaxLevel, Math.floor(topLevel / 2));
    if (slotForResult >= 0) RPD.FieldManager.place(slotForResult, unit);
    else if (!RPD.SummonManager.autoPlace(unit)) RPD.StorageManager.add(unit);
    RPD.UnitManager.recomputeAll();

    if (spell.kind === 'transcend') { this.transcendShards -= 1; this.transcendUsed = true; }

    var first = RPD.SaveManager.recordSpell ? RPD.SaveManager.recordSpell(spell.id) : false;
    RPD.SaveManager.recordSpecies && RPD.SaveManager.recordSpecies(spell.result);
    RPD.bus.emit('spell:cast', { spell: spell, unit: unit, firstTime: first });
    RPD.bus.emit('field:changed', {});
    return { ok: true, spell: spell, unit: unit, firstTime: first };
  };

  SpellManager.state = function () {
    return { transcendShards: this.transcendShards, transcendUsed: this.transcendUsed };
  };

  RPD.SpellManager = SpellManager;
})(typeof window !== 'undefined' ? window : globalThis);
