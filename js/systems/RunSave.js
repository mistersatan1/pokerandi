/* RunSave.js — 판 이어하기(자동 저장 · 세션 70).
 *
 * 왜: 휴대폰은 앱을 바꾸거나 전화가 오면 브라우저가 뒤로 간 탭을 닫아 버린다 — 15~20분짜리 판이 처음부터였다.
 *
 * 언제 · 무엇을
 *   라운드가 시작될 때마다(wave:started — 라운드 무료 지급 · 특성 골드 · 보호막 같은 시작 효과가 다 끝난 직후) 한 장 찍는다.
 *   라운드 도중의 적 · 투사체 · 스킬 쿨다운 · 버프는 안 남긴다. 이어하면 "저장된 라운드를 처음부터" 다시 연다 —
 *   한 라운드분 행동을 잃는 대신, 적을 잡아 번 골드는 두고 적만 되살리는 골드 파밍이 안 생긴다.
 *   각 매니저의 saveState() / loadState(s) 를 ORDER 순서로 모은다. 저장 안 하는 매니저는 NOT_SAVED 에 이유를 적는다
 *   (검사가 RPD 의 *Manager 를 훑어 둘 다 없으면 실패한다 — 판 상태를 가진 매니저를 새로 만들고 저장을 빠뜨리지 않게).
 *
 * 어디에
 *   RPD.SAVE_KEY + ':run' — 진행 기록(도감 · 칭호 · 발견한 주문 · SaveManager)과 다른 키. 판 저장이 깨져도 진행 기록은 멀쩡하다.
 *   게임 오버 · 클리어 · [처음부터] 에 지운다. RPD.Config.autosave === false 면(자동 플레이 · 검사) 저장하지 않는다.
 *
 * 복원(restore)
 *   RPD.Game.resetAll(모드, 난이도, { restore:true }) — 새 판 흐름을 그대로 쓰되 칭호 시작 보너스는 건너뛴다(값은 저장본으로 덮는다).
 *   GameManager → FieldManager(칸 해금 → 배치) → StorageManager → 나머지 → recomputeAll → RecipeManager.refresh → 화면 갱신 이벤트.
 *   라운드는 바로 시작하지 않는다 — 화면이 "눌러서 계속"을 띄우고, 누르면 begin() 이 WaveManager.resumeRound(라운드 시작 효과 없이 스폰만).
 *   저장된 모드 · 난이도 · 포켓몬 · 정예 등급이 지금 데이터에 없으면 통째로 버린다(VERSION). JSON 이 깨졌거나(BROKEN)
 *   localStorage 를 못 쓰면(STORAGE) 오류 없이 새 판.
 *
 * 다른 탭: 같은 브라우저의 다른 탭이 같은 키에 쓰면(storage 이벤트) 이 탭은 저장을 멈춘다(blocked) — 두 판이 번갈아 덮지 않게.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  var SCHEMA = 1;
  var KEY = RPD.SAVE_KEY + ':run';
  var ORDER = ['GameManager', 'FieldManager', 'StorageManager', 'SummonManager', 'EconomyManager', 'ShardManager',
               'RewardManager', 'SpellManager', 'StatsManager', 'GoldShopManager', 'EliteManager', 'RecipeManager', 'TraitManager',
               'AchievementManager', 'SpecialRunManager'];
  // 나중에 더한 매니저 — 이 기록이 없는 예전 저장본도 버리지 않는다(loadState(undefined) 가 새 값으로 시작)
  var OPTIONAL = { AchievementManager: 1, SpecialRunManager: 1 };
  var NOT_SAVED = {
    WaveManager: '라운드 진행 — 저장된 라운드를 처음부터 다시 짠다(GameManager.wave)',
    EnemyManager: '라운드 도중의 적 — 안 남긴다(되살려 골드를 또 버는 악용 방지)',
    CombatManager: '공격 쿨다운 · 시계 — 라운드 도중 상태',
    BossManager: '보스 패턴 타이머 — 라운드 도중 상태(보스 라운드면 보스를 다시 부른다)',
    SkillManager: '스킬 쿨다운 · 버프 · 장판 — 라운드 도중 상태',
    SynergyManager: '필드 구성에서 다시 센다(recomputeAll)',
    UnitManager: '개체는 FieldManager · StorageManager 가 serialize 로 남긴다',
    UndoManager: '배치 되돌리기 기록 — 이어한 뒤 새로 쌓는다',
    SaveManager: '진행 기록(도감 · 칭호 · 발견한 주문) — 이미 따로 저장한다',
    ProgressManager: '진행 기록(클리어 횟수)에서 계산한다',
    AudioManager: '소리 설정 — 판 상태가 아니다',
    UIManager: '화면 — 복원 뒤 이벤트로 다시 그린다'
  };

  var RunSave = { KEY: KEY, SCHEMA: SCHEMA, ORDER: ORDER, NOT_SAVED: NOT_SAVED, blocked: false, restoring: false, pending: null, lastError: null };

  function store() {
    try { return global.localStorage || null; } catch (e) { return null; }
  }
  RunSave.enabled = function () { return !(RPD.Config && RPD.Config.autosave === false); };

  /* 지금 판 한 장 */
  RunSave.snapshot = function () {
    var GM = RPD.GameManager, state = {};
    ORDER.forEach(function (name) { state[name] = RPD[name].saveState(); });
    return {
      schema: SCHEMA,
      savedAt: Date.now(),
      summary: { mode: GM.mode.id, difficulty: GM.mode.difficulty, label: GM.mode.label, wave: GM.wave, life: GM.life, gold: GM.gold },
      state: state
    };
  };

  RunSave.save = function () {
    if (!this.enabled() || this.blocked || this.restoring) return false;
    var ls = store();
    if (!ls) return false;
    try { ls.setItem(KEY, JSON.stringify(this.snapshot())); return true; }
    catch (e) { this.lastError = String(e && e.message || e); return false; }   // 용량 · 사생활 보호 모드 — 판은 그대로 이어간다
  };

  RunSave.clear = function () {
    var ls = store();
    this.pending = null;
    if (!ls) return;
    try { ls.removeItem(KEY); } catch (e) { /* 못 쓰는 저장소 */ }
  };

  /* 저장본이 지금 데이터와 맞는가 — 모드 · 난이도 · 포켓몬 · 정예 등급 */
  RunSave.validate = function (d) {
    if (!d || d.schema !== SCHEMA || !d.state || !d.summary) return false;
    var st = d.state, g = st.GameManager;
    if (!g || !RPD.Modes[g.mode] || (g.mode === 'NORMAL' && !RPD.Difficulties[g.difficulty])) return false;
    if ((g.rules || []).some(function (id) { return !RPD.SpecialRules || !RPD.SpecialRules.get(id); })) return false;   // 지금 없는 특수 규칙(세션 99)
    if (ORDER.some(function (n) { return !st[n] && !OPTIONAL[n]; })) return false;
    var units = [];
    (st.FieldManager.units || []).forEach(function (e) { units.push(e.unit); });
    (st.StorageManager.units || []).forEach(function (u) { units.push(u); });
    if (units.some(function (u) { return !u || !RPD.PokemonData.get(u.defId); })) return false;
    var slots = RPD.MapData.slots.length;
    if ((st.FieldManager.units || []).some(function (e) { return !(e.slot >= 0 && e.slot < slots); })) return false;
    var el = st.EliteManager.active;
    if (el && !RPD.EliteManager.tier(el.tier)) return false;
    return true;
  };

  /* { ok, data } · { ok:false, reason:'NONE'|'STORAGE'|'BROKEN'|'VERSION' } — 맞지 않는 저장본은 여기서 지운다 */
  RunSave.read = function () {
    var ls = store();
    if (!ls) return { ok: false, reason: 'STORAGE' };
    var text;
    try { text = ls.getItem(KEY); } catch (e) { return { ok: false, reason: 'STORAGE' }; }
    if (text == null) return { ok: false, reason: 'NONE' };
    var d;
    try { d = JSON.parse(text); } catch (e) { this.clear(); return { ok: false, reason: 'BROKEN' }; }
    if (!this.validate(d)) { this.clear(); return { ok: false, reason: d && typeof d === 'object' ? 'VERSION' : 'BROKEN' }; }
    return { ok: true, data: d };
  };
  RunSave.has = function () { var r = this.read(); return r.ok; };

  /* 저장본으로 판을 되살린다(라운드는 아직 안 연다 — begin 으로 연다) */
  RunSave.restore = function (d) {
    var st = d.state, g = st.GameManager;
    this.restoring = true;
    try {
      RPD.Game.resetAll(g.mode, g.difficulty, { restore: true, rules: g.rules || [] });
      ORDER.forEach(function (name) { RPD[name].loadState(st[name]); });
      RPD.UnitManager.recomputeAll();
      RPD.RecipeManager.refresh();
      RPD.bus.emit('field:changed');
      RPD.bus.emit('storage:changed', RPD.StorageManager.units);
      RPD.bus.emit('economy:gold', { gold: RPD.GameManager.gold, delta: 0 });
      RPD.GameManager.emitStats();
      if (RPD.UIManager && RPD.UIManager.refreshAll) RPD.UIManager.refreshAll();
      // 라운드를 누르기 전까지 멈춰 둔다 — 일시정지 상태(⏸ 로도 이어갈 수 있다)
      RPD.GameManager.setState(RPD.GameState.PAUSED);
      RPD.Loop.setPaused(true);
      this.pending = { wave: g.wave };
      RPD.bus.emit('run:restored', { wave: g.wave, summary: d.summary });
    } finally { this.restoring = false; }
    return true;
  };

  /* "눌러서 계속" — 저장된 라운드를 처음부터(시작 효과 없이). 진행 중이던 정예는 입구에서 다시 */
  RunSave.begin = function () {
    var p = this.pending;
    if (!p) return false;
    this.pending = null;
    RPD.Loop.setPaused(false);
    RPD.WaveManager.resumeRound(p.wave);
    if (RPD.EliteManager.pending) RPD.EliteManager.respawnPending();
    return true;
  };

  RunSave.init = function () {
    var self = this, bus = RPD.bus;
    bus.on('wave:started', function () { if (!self.pending) self.save(); });
    bus.on('game:over', function () { self.clear(); });
    bus.on('game:victory', function () { self.clear(); });
    // 이어한 뒤 "눌러서 계속" 대신 ⏸(P)로 풀어도 라운드가 열린다
    bus.on('loop:paused', function (p) { if (!p && self.pending) self.begin(); });
    if (global.addEventListener) {
      global.addEventListener('storage', function (e) {
        if (!e || e.key !== KEY || self.blocked) return;
        self.blocked = true;   // 다른 탭이 같은 판에 쓰고 있다 — 이 탭은 더는 안 쓴다
        bus.emit('runsave:otherTab', {});
      });
    }
  };

  RPD.RunSave = RunSave;
})(typeof window !== 'undefined' ? window : globalThis);
