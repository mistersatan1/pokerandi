/* SaveManager.js — 판을 넘어 남는 것.
 *
 * 한 판의 진행(웨이브·골드·보드)은 저장하지 않는다. 랜덤 디펜스는 매 판이 새로 시작하는
 * 게임이고, 중간 저장은 "운이 나쁘면 되돌리기"를 만들어 판을 망친다.
 * 대신 판을 넘어 쌓이는 것만 남긴다 — 도감, 최고 기록, 설정.
 *
 * 저장은 절대 게임을 멈추게 하면 안 된다. 사파리 프라이빗 모드나 용량 초과처럼
 * localStorage 가 통째로 막히는 환경이 실제로 있다. 그럴 땐 메모리에만 들고 간다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  var CURRENT_VERSION = 2;

  var memoryFallback = null;   // localStorage 가 막혔을 때 쓰는 대체 저장소
  var storageBroken = false;

  function emptySave() {
    return {
      version: CURRENT_VERSION,
      pokedex: {},        // { speciesId: { seen, best } }  best = 도달한 최고 단계
      records: {},        // { 기록키: { wave, kills, elapsed, cleared, at } } — 일반 모드는 'NORMAL:HARD' 처럼 난이도별
      clearsBy: {},       // { 기록키: 클리어 횟수 }
      spells: {},         // { 주문 id: 처음 발견한 시각 } — 조합 사전·도감이 주문을 보여 준다
      totals: { runs: 0, clears: 0, kills: 0, bossKills: 0, playSeconds: 0 },
      settings: { speed: 1 },
      updatedAt: 0
    };
  }

  var SaveManager = {
    data: emptySave(),
    available: true
  };

  /* ---------- 저장소 접근 ---------- */

  function readRaw() {
    if (storageBroken) return memoryFallback;
    try {
      return global.localStorage.getItem(RPD.SAVE_KEY);
    } catch (err) {
      storageBroken = true;
      SaveManager.available = false;
      console.warn('[Save] localStorage 를 쓸 수 없어 메모리에만 보관합니다.', err.message);
      return memoryFallback;
    }
  }

  function writeRaw(text) {
    if (!storageBroken) {
      try {
        global.localStorage.setItem(RPD.SAVE_KEY, text);
        return true;
      } catch (err) {
        storageBroken = true;
        SaveManager.available = false;
        console.warn('[Save] 저장에 실패해 메모리로 전환합니다.', err.message);
      }
    }
    memoryFallback = text;
    return false;
  }

  /* ---------- 마이그레이션 ---------- */

  /* 저장 포맷이 바뀌어도 기존 플레이어 데이터를 버리지 않는다.
   * 각 단계는 "이전 버전 → 다음 버전" 하나만 책임진다. */
  var MIGRATIONS = {
    1: function (data) {
      // v1 에는 totals 가 없었다
      data.totals = data.totals || { runs: 0, clears: 0, kills: 0, bossKills: 0, playSeconds: 0 };
      data.version = 2;
      return data;
    }
  };

  function migrate(data) {
    var guard = 0;
    while (data.version < CURRENT_VERSION && guard < 20) {
      var step = MIGRATIONS[data.version];
      if (!step) {
        console.warn('[Save] v' + data.version + ' 에서 올라갈 길이 없어 초기화합니다.');
        return emptySave();
      }
      data = step(data);
      guard += 1;
    }
    // 미래 버전 파일을 만나면 건드리지 않고 새로 시작한다 (덮어써서 망치지 않게)
    if (data.version > CURRENT_VERSION) return emptySave();
    return data;
  }

  /* ---------- 공개 API ---------- */

  SaveManager.load = function () {
    var raw = readRaw();
    if (!raw) {
      this.data = emptySave();
      return this.data;
    }

    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.warn('[Save] 저장 파일이 깨져 있어 초기화합니다.', err.message);
      this.data = emptySave();
      return this.data;
    }

    if (!parsed || typeof parsed !== 'object' || typeof parsed.version !== 'number') {
      this.data = emptySave();
      return this.data;
    }

    var merged = emptySave();
    var migrated = migrate(parsed);
    // 필드가 빠져 있어도 기본값으로 메운다 — 부분 손상에 버티게 한다
    for (var key in merged) {
      if (Object.prototype.hasOwnProperty.call(migrated, key)) merged[key] = migrated[key];
    }
    merged.version = CURRENT_VERSION;

    this.data = merged;
    RPD.bus.emit('save:loaded', this.data);
    return this.data;
  };

  SaveManager.save = function () {
    this.data.version = CURRENT_VERSION;
    this.data.updatedAt = Date.now();
    var ok = writeRaw(JSON.stringify(this.data));
    RPD.bus.emit('save:written', { ok: ok, persistent: !storageBroken });
    return ok;
  };

  SaveManager.wipe = function () {
    this.data = emptySave();
    if (!storageBroken) {
      try { global.localStorage.removeItem(RPD.SAVE_KEY); } catch (err) { /* 무시 */ }
    }
    memoryFallback = null;
    RPD.bus.emit('save:loaded', this.data);
    return this.save();
  };

  /* ---------- 도감 ---------- */

  SaveManager.recordSpecies = function (defId) {
    var entry = this.data.pokedex[defId];
    if (!entry) {
      entry = { seen: 0, firstAt: Date.now() };
      this.data.pokedex[defId] = entry;
    }
    entry.seen += 1;
  };

  SaveManager.dexCount = function () {
    return Object.keys(this.data.pokedex).length;
  };

  SaveManager.dexTotal = function () {
    return RPD.PokemonData.all().length;
  };

  SaveManager.hasSeen = function (defId) {
    return !!this.data.pokedex[defId];
  };

  /* ---------- 기록 ---------- */

  /* 한 판이 끝났을 때 호출한다. 기록이 나아졌을 때만 갱신한다. */
  SaveManager.submitRun = function (modeId, summary, cleared) {
    var t = this.data.totals;
    if (!this.data.clearsBy) this.data.clearsBy = {};
    var firstClearOfKey = false;
    if (cleared) {
      firstClearOfKey = !this.data.clearsBy[modeId];
      this.data.clearsBy[modeId] = (this.data.clearsBy[modeId] || 0) + 1;
    }
    t.runs += 1;
    t.kills += summary.kills || 0;
    t.bossKills += summary.bossKills || 0;
    t.playSeconds += Math.round(summary.elapsed || 0);
    if (cleared) t.clears += 1;

    var prev = this.data.records[modeId];
    var better = !prev ||
      summary.wave > prev.wave ||
      (summary.wave === prev.wave && summary.kills > prev.kills);

    if (better) {
      this.data.records[modeId] = {
        wave: summary.wave,
        kills: summary.kills,
        elapsed: Math.round(summary.elapsed || 0),
        cleared: !!cleared,
        at: Date.now()
      };
    }

    this.save();
    return { isBest: better, record: this.data.records[modeId], firstClearOfKey: firstClearOfKey };
  };

  /* 주문을 처음 성공시키면 기록한다. 처음이면 true. */
  SaveManager.recordSpell = function (id) {
    if (!this.data.spells) this.data.spells = {};
    if (this.data.spells[id]) return false;
    this.data.spells[id] = Date.now();
    this.save();
    return true;
  };
  SaveManager.knowsSpell = function (id) {
    return !!(this.data.spells && this.data.spells[id]);
  };

  SaveManager.clearsFor = function (key) {
    return (this.data.clearsBy && this.data.clearsBy[key]) || 0;
  };

  SaveManager.recordFor = function (modeId) {
    return this.data.records[modeId] || null;
  };

  /* ---------- 설정 ---------- */

  SaveManager.setSetting = function (key, value) {
    this.data.settings[key] = value;
    this.save();
  };

  SaveManager.getSetting = function (key, fallback) {
    var v = this.data.settings[key];
    return v === undefined ? fallback : v;
  };

  /* ---------- 연결 ---------- */

  SaveManager.init = function () {
    this.load();
    // 난이도가 생기기 전 기록(노멀)은 '보통' 기록으로 옮긴다
    if (!this.data.clearsBy) this.data.clearsBy = {};
    if (this.data.records.NORMAL && !this.data.records['NORMAL:NORMAL']) {
      this.data.records['NORMAL:NORMAL'] = this.data.records.NORMAL;
      delete this.data.records.NORMAL;
      if (this.data.records['NORMAL:NORMAL'].cleared && !this.data.clearsBy['NORMAL:NORMAL']) {
        this.data.clearsBy['NORMAL:NORMAL'] = 1;
      }
      this.save();
    }
    var self = this;

    // 소환·합성으로 새로 만난 개체를 도감에 남긴다
    RPD.bus.on('summon:result', function (r) {
      if (r.ok && r.unit) self.recordSpecies(r.unit.defId);
    });

    RPD.bus.on('recipe:crafted', function (p) {
      if (p.unit) self.recordSpecies(p.unit.defId);
    });

    RPD.bus.on('game:over', function () { finishRun(self, false); });
    RPD.bus.on('game:victory', function () { finishRun(self, true); });

    RPD.bus.on('loop:speed', function (speed) {
      if (self.data.settings.speed !== speed) self.setSetting('speed', speed);
    });
  };

  function finishRun(self, cleared) {
    var summary = RPD.StatsManager.summary();
    var mode = RPD.GameManager.mode;
    var key = mode.recordKey || mode.id;
    var result = self.submitRun(key, summary, cleared);
    RPD.bus.emit('save:runRecorded', {
      mode: mode.id, difficulty: mode.difficulty, key: key,
      isBest: result.isBest, record: result.record, cleared: cleared,
      firstClearOfKey: result.firstClearOfKey
    });
  }

  RPD.SaveManager = SaveManager;
})(typeof window !== 'undefined' ? window : globalThis);
