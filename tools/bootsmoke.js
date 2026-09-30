/* bootsmoke.js — main.js 의 부팅 경로를 통째로 실행한다.
 * 실행: node tools/bootsmoke.js
 *
 * selftest 는 시스템을 하나씩 직접 불러 검증하고, 여기서는 반대로
 * "실제 게임이 켜지는 순서 그대로" 돌린다. 조립 단계에서만 터지는 버그
 * (없는 DOM 참조, 초기화 순서, 이벤트 핸들러 안의 오타)를 잡는 것이 목적이다.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

/* index.html 이 로드하는 순서를 그대로 읽어 온다 —
   테스트가 자기만의 목록을 들고 있으면 index.html 과 어긋나도 눈치채지 못한다. */
const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);

/* ---------- 최소한의 DOM ---------- */
const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
const nodes = {};
const listeners = {};

function makeNode(id) {
  const node = {
    id,
    textContent: '',
    innerHTML: '',
    hidden: false,
    disabled: false,
    offsetWidth: 100,
    dataset: {},
    style: {},
    children: [],
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      toggle(c, on) { if (on === undefined) on = !this._set.has(c); on ? this._set.add(c) : this._set.delete(c); },
      contains(c) { return this._set.has(c); }
    },
    addEventListener(type, fn) {
      listeners[id] = listeners[id] || {};
      (listeners[id][type] = listeners[id][type] || []).push(fn);
    },
    removeEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 600 }),
    getContext: () => makeCtx(),
    querySelectorAll: () => [],
    querySelector: () => null,
    closest: () => node,
    appendChild(c) { node.children.push(c); return c; },
    remove() {},
    focus() {}
  };
  return node;
}

const CTX_MEMBERS = ['save', 'restore', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo',
  'rect', 'fill', 'stroke', 'fillRect', 'clearRect', 'strokeRect', 'fillText', 'strokeText',
  'measureText', 'drawImage', 'setTransform', 'transform', 'translate', 'scale', 'rotate',
  'setLineDash', 'getLineDash', 'createLinearGradient', 'createRadialGradient', 'clip',
  'quadraticCurveTo', 'bezierCurveTo', 'ellipse', 'roundRect'];

function makeCtx() {
  const c = { canvas: { width: 1000, height: 600 } };
  for (const m of CTX_MEMBERS) {
    c[m] = () => {
      if (m === 'measureText') return { width: 10 };
      if (m.startsWith('create')) return { addColorStop() {} };
      if (m === 'getLineDash') return [];
    };
  }
  return new Proxy(c, {
    get(t, p) {
      if (p in t) return t[p];
      if (typeof p === 'symbol') return undefined;
      if (['globalAlpha', 'fillStyle', 'strokeStyle', 'lineWidth', 'font', 'textAlign',
           'textBaseline', 'lineCap', 'lineJoin', 'imageSmoothingEnabled', 'globalCompositeOperation',
           'shadowBlur', 'shadowColor'].includes(p)) return t[p];
      throw new Error(`캔버스에 없는 멤버 사용: ctx.${String(p)}`);
    },
    set(t, p, v) { t[p] = v; return true; }
  });
}

let rafQueue = [];
const sandbox = {
  console,
  performance: { now: () => Date.now() },
  localStorage: (() => {
    const box = {};
    return {
      getItem: (k) => (k in box ? box[k] : null),
      setItem: (k, v) => { box[k] = String(v); },
      removeItem: (k) => { delete box[k]; }
    };
  })(),
  requestAnimationFrame: (fn) => { rafQueue.push(fn); return rafQueue.length; },
  cancelAnimationFrame: () => {},
  setTimeout: (fn) => { return 0; },      // 배너 타이머 등이 테스트를 붙잡지 않게
  clearTimeout: () => {},
  devicePixelRatio: 2,
  Image: function () {},
  addEventListener: (type, fn) => {
    listeners.__window = listeners.__window || {};
    (listeners.__window[type] = listeners.__window[type] || []).push(fn);
  },
  document: {
    readyState: 'complete',
    addEventListener: () => {},
    createElement: (tag) => makeNode('created_' + tag),
    getElementById: (id) => {
      if (!ids.has(id)) return null;          // 실제 브라우저와 똑같이 null 을 준다
      return nodes[id] || (nodes[id] = makeNode(id));
    }
  }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

let failures = 0;
function check(label, fn) {
  try { fn(); console.log('  PASS  ' + label); }
  catch (err) { failures += 1; console.log('  FAIL  ' + label + '  → ' + err.message); }
}

/* ---------- 부팅 ---------- */
console.log('\n부팅');

const warnings = [];
const realWarn = console.warn;
console.warn = (...a) => { warnings.push(a.join(' ')); };

check(`index.html 의 스크립트 ${scripts.length}개를 순서대로 로드한다`, () => {
  for (const rel of scripts) {
    const file = path.join(ROOT, rel);
    if (!fs.existsSync(file)) throw new Error(`${rel} 없음`);
    vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: rel });
  }
});

const RPD = sandbox.RPD;

/* main.js 는 readyState 가 complete 면 스스로 boot() 한다.
   여기서 또 부르면 핸들러가 이중 등록되므로 자동 부팅 결과를 확인만 한다. */
check('main.js 가 스스로 부팅을 끝냈다', () => {
  if (!RPD.FieldManager.slots.length) throw new Error('슬롯이 초기화되지 않았다');
  if (!RPD.Renderer.ctx) throw new Error('캔버스가 준비되지 않았다');
});

check('boot() 를 다시 불러도 이중 초기화되지 않는다', () => {
  const before = RPD.Renderer.layers.length;
  RPD.Game.boot();
  if (RPD.Renderer.layers.length !== before) throw new Error('레이어가 중복 등록됐다');
});

check('부팅 중 경고가 없다', () => {
  const unexpected = warnings.filter(w => w.indexOf('이미 실행') < 0);
  if (unexpected.length) throw new Error(unexpected.join(' / '));
});
console.warn = realWarn;

check('렌더 레이어가 등록됐다', () => {
  if (!RPD.Renderer.layers.length) throw new Error('레이어가 비었다');
});

check('HUD 에 초기값이 들어갔다', () => {
  const gold = sandbox.document.getElementById('statGold').textContent;
  if (!gold || gold === '') throw new Error('골드 표시가 비어 있다');
});

/* ---------- 버튼 클릭 ---------- */
console.log('\n버튼');

function click(id) {
  const l = listeners[id] && listeners[id].click;
  if (!l || !l.length) throw new Error(`#${id} 에 click 핸들러가 없다`);
  l.forEach(fn => fn({ target: nodes[id], preventDefault() {}, clientX: 0, clientY: 0 }));
}

check('게임 시작 버튼이 모드 선택을 연다', () => {
  click('btnStart');
  const overlay = sandbox.document.getElementById('modeOverlay');
  if (overlay.hidden) throw new Error('모드 선택이 안 열렸다');
  const list = sandbox.document.getElementById('modeList');
  if (list.innerHTML.indexOf('modecard') < 0) throw new Error('모드 카드가 비어 있다');
  for (const id of RPD.MODE_ORDER) {
    if (list.innerHTML.indexOf('data-mode="' + id + '"') < 0) throw new Error(id + ' 카드가 없다');
  }
  sandbox.document.getElementById('modeOverlay').hidden = true;
});

check('모드를 고르면 그 모드로 시작한다', () => {
  RPD.Game.startRun('NORMAL');
  if (RPD.GameManager.mode.id !== 'NORMAL') throw new Error(RPD.GameManager.mode.id);
  // v2 는 준비 단계가 없다. 시작하는 순간 바로 RUNNING 이고 적이 나오기 시작한다.
  if (RPD.GameManager.state !== 'RUNNING') throw new Error(RPD.GameManager.state);
  if (RPD.WaveManager.phase !== RPD.WaveManager.PHASE.SPAWNING) {
    throw new Error('phase=' + RPD.WaveManager.phase);
  }
});

check('배속 버튼이 동작한다', () => {
  const l = listeners.speedGroup.click[0];
  l({ target: { closest: () => ({ dataset: { speed: '3' } }) } });
  if (RPD.Loop.speed !== 3) throw new Error(`speed=${RPD.Loop.speed}`);
  l({ target: { closest: () => ({ dataset: { speed: '1' } }) } });
});

check('일시정지 버튼이 동작한다', () => {
  click('btnPause');
  if (!RPD.Loop.paused) throw new Error('일시정지되지 않았다');
  click('btnPause');
  if (RPD.Loop.paused) throw new Error('해제되지 않았다');
});

/* ---------- 실제 진행 ---------- */
console.log('\n진행');

/* main.js 가 Loop 에 등록한 update 함수를 그대로 돌린다.
 * 여기서 시스템 목록을 따로 적으면, 새 시스템이 추가됐을 때 이 파일만 조용히 뒤처진다.
 * (실제로 PHASE 7 에서 CombatManager 가 빠진 채로 통과할 뻔했다) */
function tick(seconds) {
  const step = RPD.Config.fixedStep;
  const n = Math.round(seconds / step);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < RPD.Loop._updateFns.length; k++) RPD.Loop._updateFns[k](step);
  }
}

check('소환 버튼이 포켓몬을 필드에 올린다', () => {
  const before = RPD.FieldManager.getUnits().length;
  click('btnSummon');
  const after = RPD.FieldManager.getUnits().length;
  if (after !== before + 1) throw new Error(`${before} → ${after}`);
});

check('소환한 포켓몬에 실효 스탯이 들어간다', () => {
  const u = RPD.FieldManager.getUnits()[0];
  if (!u) throw new Error('필드에 개체가 없다');
  if (!(u.attack > 0) || !(u.dps > 0)) throw new Error(`attack=${u.attack} dps=${u.dps}`);
});


check('슬롯을 선택하면 정보 카드가 나온다', () => {
  const u = RPD.FieldManager.getUnits()[0];
  RPD.FieldManager.select(u.slotIndex);
  const html = sandbox.document.getElementById('slotBody').innerHTML;
  if (html.indexOf(u.name) < 0) throw new Error('카드에 이름이 없다');
});

check('방출 버튼이 칸을 비우고 골드를 준다', () => {
  const u = RPD.FieldManager.getUnits()[0];
  RPD.FieldManager.select(u.slotIndex);
  const gold = RPD.GameManager.gold;
  const idx = u.slotIndex;
  click('btnSell');
  if (RPD.FieldManager.get(idx).unit) throw new Error('칸이 비지 않았다');
  if (RPD.GameManager.gold <= gold) throw new Error('환급이 없다');
});

check('골드가 없으면 소환 버튼이 잠긴다', () => {
  const saved = RPD.GameManager.gold;
  RPD.GameManager.gold = 0;
  RPD.bus.emit('economy:gold', { gold: 0, delta: -saved, reason: 'test' });
  const locked = nodes.btnSummon.disabled;
  RPD.GameManager.gold = saved;
  RPD.bus.emit('economy:gold', { gold: saved, delta: saved, reason: 'test' });
  if (!locked) throw new Error('버튼이 잠기지 않았다');
});





check('조합식 영역이 화면에 있다', () => {
  const list = sandbox.document.getElementById('recipeList');
  if (!list) throw new Error('#recipeList 가 없다');
  RPD.GameManager.setWave(21);
  RPD.RecipeManager.refresh();
  if (list.innerHTML.indexOf('rrow') < 0) throw new Error('조합식이 안 그려졌다');
});

check('조합 버튼이 실제로 조합한다', () => {
  for (const slot of RPD.FieldManager.slots) {
    if (slot.unit) RPD.FieldManager.remove(slot.index);
  }
  RPD.GameManager.setWave(21);
  // 안흔함 레시피: 흔함 2마리
  const craftRecipe = RPD.RecipeData.list.find(r => r.materials.length === 2);
  RPD.FieldManager.place(0, RPD.UnitManager.create(craftRecipe.materials[0]));
  RPD.FieldManager.place(1, RPD.UnitManager.create(craftRecipe.materials[1]));
  RPD.UnitManager.recomputeAll();
  RPD.RecipeManager.refresh();

  if (nodes.btnCraft.disabled) throw new Error('조합 버튼이 잠겨 있다');
  click('btnCraft');

  const units = RPD.FieldManager.getUnits();
  if (units.length !== 1 || units[0].defId !== craftRecipe.id) {
    throw new Error(`결과 ${units.map(u => u.defId)}`);
  }
});

check('조합 가능 개수가 배지에 뜬다', () => {
  for (const slot of RPD.FieldManager.slots) {
    if (slot.unit) RPD.FieldManager.remove(slot.index);
  }
  // 레시피에서 직접 재료를 가져온다 — 개체 이름을 적어 두면 데이터가 바뀔 때 조용히 죽는다
  const recipe = RPD.RecipeData.list[0];
  RPD.FieldManager.place(0, RPD.UnitManager.create(recipe.materials[0]));
  RPD.FieldManager.place(1, RPD.UnitManager.create(recipe.materials[1]));
  RPD.UnitManager.recomputeAll();
  RPD.RecipeManager.refresh();
  const badge = sandbox.document.getElementById('craftBadge');
  if (badge.hidden || badge.textContent === '0') throw new Error('배지가 비어 있다');
});

check('창고가 화면에 있다', () => {
  const list = sandbox.document.getElementById('storageList');
  const badge = sandbox.document.getElementById('storageBadge');
  if (!list || !badge) throw new Error('창고 요소가 없다');
  RPD.StorageManager.add(RPD.UnitManager.create('charmander'));
  if (badge.textContent.indexOf('/') < 0) throw new Error(`배지 ${badge.textContent}`);
  if (list.innerHTML.indexOf('scell') < 0) throw new Error('창고 목록이 비어 있다');
});

check('창고에서 필드로 배치된다', () => {
  for (const slot of RPD.FieldManager.slots) {
    if (slot.unit) RPD.FieldManager.remove(slot.index);
  }
  const before = RPD.StorageManager.units.length;
  const r = RPD.StorageManager.deploy(0);
  if (!r.ok) throw new Error(r.reason);
  if (RPD.StorageManager.units.length !== before - 1) throw new Error('창고에서 안 빠졌다');
  if (RPD.FieldManager.getUnits().length !== 1) throw new Error('필드에 안 올라갔다');
});

check('도감 화면이 열린다', () => {
  click('btnDex');
  const overlay = sandbox.document.getElementById('dexOverlay');
  if (overlay.hidden) throw new Error('도감이 안 열렸다');
  const grid = sandbox.document.getElementById('dexGrid');
  if (grid.innerHTML.indexOf('dexcell') < 0) throw new Error('도감 목록이 비어 있다');
  click('btnDexClose');
  if (!overlay.hidden) throw new Error('도감이 안 닫힌다');
});

check('조각 수가 표시된다', () => {
  const el = sandbox.document.getElementById('shardCount');
  const before = parseInt(el.textContent, 10) || 0;
  RPD.ShardManager.add(7);
  const after = parseInt(el.textContent, 10);
  if (after !== before + 7) throw new Error(`${before} → ${after}`);
});

check('준비 시간이 지나면 적이 등장한다', () => {
  tick(40);
  if (RPD.EnemyManager.aliveCount() === 0) throw new Error('적이 하나도 없다');
});

check('적이 경로를 따라 이동한다', () => {
  const e = RPD.EnemyManager.enemies[0];
  const before = e.distance;
  tick(1);
  if (e.distance <= before) throw new Error('제자리에 있다');
});

check('한 프레임 전체 렌더가 예외 없이 끝난다', () => {
  RPD.Renderer.ctx = makeCtx();
  RPD.Renderer.render(0.016);
});

check('배치한 포켓몬이 적을 실제로 때린다', () => {
  RPD.GameManager.gold = 4000;
  for (let i = 0; i < 8; i++) RPD.SummonManager.summon();
  RPD.UnitManager.recomputeAll();

  const before = RPD.StatsManager.damageDealt;
  tick(25);
  if (RPD.StatsManager.damageDealt <= before) {
    throw new Error('누적 피해가 늘지 않았다 — 아무도 공격하지 않는다');
  }
});

check('전투로 적이 죽고 골드가 들어온다', () => {
  if (RPD.StatsManager.kills === 0) throw new Error('처치가 0이다');
});

check('보스 패턴이 실제로 작동한다', () => {
  // 앞 검사에서 라이프가 바닥났을 수 있다. 상태를 다시 세운다.
  RPD.GameManager.life = 50;
  RPD.GameManager.setState('RUNNING');
  RPD.EnemyManager.reset();
  RPD.BossManager.reset();
  for (const slot of RPD.FieldManager.slots) {
    if (!slot.unit) RPD.FieldManager.place(slot.index, RPD.UnitManager.create('pikachu'));
  }
  RPD.UnitManager.recomputeAll();

  const boss = RPD.EnemyManager.spawn('boss_warden', 20);
  boss.hp = boss.maxHp;

  const seen = [];
  const onPattern = (p) => { seen.push(p.id); };
  RPD.bus.on('boss:pattern', onPattern);
  tick(25);
  RPD.bus.off('boss:pattern', onPattern);

  if (!seen.length) throw new Error('패턴이 한 번도 안 나왔다');
  if (seen.indexOf('silence') < 0) throw new Error(`침묵이 없다: ${seen}`);
});

check('보스 페이즈 전환이 일어난다', () => {
  const boss = RPD.EnemyManager.boss;
  if (!boss) throw new Error('보스가 없다');
  boss.hp = boss.maxHp * 0.4;
  tick(0.2);
  if (RPD.BossManager.phase !== 2) throw new Error(`phase=${RPD.BossManager.phase}`);
  RPD.EnemyManager.kill(boss, 'test');
});

check('적이 출구에 닿으면 라이프가 준다', () => {
  RPD.GameManager.life = 30;
  RPD.GameManager.setState('RUNNING');
  // 이제 포켓몬이 실제로 막아 주므로, 방어를 걷어내고 확인해야 한다
  for (const slot of RPD.FieldManager.slots) {
    if (slot.unit) RPD.FieldManager.remove(slot.index);
  }
  const before = RPD.GameManager.life;
  tick(120);
  if (RPD.GameManager.life >= before) throw new Error(`라이프 ${before} → ${RPD.GameManager.life}`);
});

check('방어가 없으면 결국 게임 오버가 된다', () => {
  let guard = 0;
  while (RPD.GameManager.state !== RPD.GameState.GAMEOVER && guard < 200) { tick(20); guard += 1; }
  if (RPD.GameManager.state !== RPD.GameState.GAMEOVER) throw new Error('게임 오버에 도달하지 못했다');
});

check('게임 오버 후에도 렌더가 안전하다', () => {
  RPD.Renderer.render(0.016);
});

check('한 판이 끝나면 기록이 저장된다', () => {
  // 일반 모드는 난이도별로 기록한다('NORMAL:NORMAL')
  const rec = RPD.SaveManager.recordFor(RPD.GameManager.mode.recordKey || RPD.GameManager.mode.id);
  if (!rec) throw new Error('기록이 없다');
  if (!(rec.wave > 0)) throw new Error(`wave=${rec.wave}`);
  if (RPD.SaveManager.data.totals.runs < 1) throw new Error('판 수가 안 올랐다');
});

check('도감에 만난 포켓몬이 남는다', () => {
  if (RPD.SaveManager.dexCount() < 1) throw new Error('도감이 비어 있다');
});

check('저장한 내용이 다시 읽힌다', () => {
  const before = RPD.SaveManager.dexCount();
  RPD.SaveManager.save();
  RPD.SaveManager.data = { version: 0, pokedex: {}, records: {}, totals: {}, settings: {} };
  RPD.SaveManager.load();
  if (RPD.SaveManager.dexCount() !== before) {
    throw new Error(`${before} → ${RPD.SaveManager.dexCount()}`);
  }
});


check('처음부터 버튼이 상태를 되돌린다', () => {
  click('btnRestart');
  if (RPD.GameManager.life !== RPD.Config.startLife) throw new Error(`라이프 ${RPD.GameManager.life}`);
  if (RPD.EnemyManager.aliveCount() !== 0) throw new Error('적이 남아 있다');
  if (RPD.GameManager.state === RPD.GameState.GAMEOVER) throw new Error('게임 오버 상태가 남아 있다');
});

check('재시작 후 다시 정상 진행된다', () => {
  RPD.Game.startRun();
  tick(40);
  if (RPD.EnemyManager.aliveCount() === 0) throw new Error('두 번째 판에서 적이 안 나온다');
});

check('재시작해도 보상이 두 번 들어가지 않는다', () => {
  // init 이 재시작마다 다시 불리면 enemy:died 핸들러가 쌓여 골드가 배로 들어온다.
  const e = RPD.EnemyManager.enemies[0];
  const expected = RPD.EconomyManager.killReward(e);
  const before = RPD.GameManager.gold;
  RPD.EnemyManager.kill(e, 'test');
  const gained = RPD.GameManager.gold - before;
  if (gained !== expected) throw new Error(`기대 ${expected}, 실제 ${gained} (핸들러 중복 등록 의심)`);
});


/* ---------- 리디자인 화면 (패널이 실제로 채워지는가) ---------- */
console.log('\n화면 패널');

function panelHtml(id) { return sandbox.document.getElementById(id).innerHTML; }

check('상단에 소환 확률 5등급이 뜬다', () => {
  const h = panelHtml('oddsBar');
  for (const t of RPD.TIER_ORDER) {
    if (h.indexOf(RPD.Tiers[t].label) < 0) throw new Error(`${t} 배지가 없다`);
  }
});

check('사거리 구성 칩이 보유 개체를 센다', () => {
  RPD.GameManager.gold = 9000;
  for (let i = 0; i < 4; i++) RPD.SummonManager.summon();
  RPD.UnitManager.recomputeAll();
  RPD.bus.emit('field:changed');
  const h = panelHtml('rangeChips');
  if (h.indexOf('근접') < 0 || h.indexOf('장거리') < 0) throw new Error('칩이 비었다');
});

check('시너지 패널이 타입 10종을 모두 그린다', () => {
  const h = panelHtml('synergyBody');
  const missing = Object.keys(RPD.Synergies).filter(t => h.indexOf('data-type="' + t + '"') < 0);
  if (missing.length) throw new Error(missing.join(', '));
});

check('조합식 줄에 재료 그림과 진행도가 있다', () => {
  RPD.GameManager.setWave(21);
  RPD.RecipeManager.refresh();
  const h = panelHtml('recipeList');
  if (h.indexOf('rrow') < 0) throw new Error('조합식이 비었다');
  if (h.indexOf('assets/pokemon/') < 0) throw new Error('재료 그림이 없다');
  if (h.indexOf('rmat__n') < 0) throw new Error('보유 수 표시가 없다');
});

check('보유 포켓몬이 종류별로 묶여 나온다', () => {
  const h = panelHtml('storageList');
  if (h.indexOf('scell') < 0) throw new Error('보유 목록이 비었다');
  if (h.indexOf('data-def=') < 0) throw new Error('개체 종류가 없다');
  if (sandbox.document.getElementById('ownedCount').textContent.indexOf('종') < 0) {
    throw new Error('종류 수 표시가 없다');
  }
});

/* 탭은 위임 클릭이다 — 버튼 노드를 흉내 내 #recipeFilter 의 핸들러를 부른다. */
function clickTab(filter) {
  const l = listeners.recipeFilter && listeners.recipeFilter.click;
  if (!l || !l.length) throw new Error('#recipeFilter 에 click 핸들러가 없다');
  const btn = { dataset: { filter: filter }, classList: { add() {}, remove() {}, toggle() {} },
                closest: () => btn, parentNode: nodes.recipeFilter };
  l.forEach(fn => fn({ target: btn, preventDefault() {} }));
}

/* 등급 칩(#tierFilter)과 조합식 줄(#recipeList) 클릭도 진짜 DOM 이 아니라 이렇게 흉내 낸다 —
 * 위 clickTab 과 같은 방식. querySelector/click()/dispatchEvent 는 이 모의 DOM엔 없다. */
function clickChip(tier) {
  const l = listeners.tierFilter && listeners.tierFilter.click;
  if (!l || !l.length) throw new Error('#tierFilter 에 click 핸들러가 없다');
  const btn = { dataset: { tier }, classList: { add() {}, remove() {}, toggle() {} }, closest: () => btn };
  l.forEach(fn => fn({ target: btn }));
}
function clickSpellRow(spellId, ready) {
  const l = listeners.recipeList && listeners.recipeList.click;
  if (!l || !l.length) throw new Error('#recipeList 에 click 핸들러가 없다');
  const row = { dataset: { spell: spellId }, classList: { contains: c => c === 'is-ready' && !!ready, add() {}, remove() {} }, offsetWidth: 0 };
  const target = { closest: sel => (sel === '.rrow' ? row : null) };
  l.forEach(fn => fn({ target }));
}

check('조각 상점 탭에서 실제로 살 수 있다', () => {
  RPD.GameManager.setWave(20);
  RPD.ShardManager.reset();
  RPD.ShardManager.add(400, 'test');
  RPD.RecipeManager.refresh();
  clickTab('shards');
  const list = panelHtml('recipeList');
  if (list.indexOf('shoprow') < 0) throw new Error('상점 목록이 비어 있다');
  if (list.indexOf('data-buy=') < 0) throw new Error('구매 대상이 없다');

  const before = RPD.StorageManager.allUnits().length;
  const shards = RPD.ShardManager.shards;
  const r = RPD.ShardManager.buy('charmander');
  if (!r.ok) throw new Error(`구매 실패 ${r.reason}`);
  if (RPD.ShardManager.shards >= shards) throw new Error('조각이 안 줄었다');
  if (RPD.StorageManager.allUnits().length !== before + 1) throw new Error('개체가 안 늘었다');
  clickTab('all');
});

check('선택한 칸을 창고로 보낼 수 있다', () => {
  clickTab('all');
  RPD.StorageManager.reset();
  RPD.FieldManager.init();
  RPD.FieldManager.place(0, RPD.UnitManager.create('charmander'));
  RPD.UnitManager.recomputeAll();
  RPD.FieldManager.select(0);
  if (nodes.btnStore.disabled) throw new Error('창고로 버튼이 잠겨 있다');
  click('btnStore');
  if (RPD.FieldManager.get(0).unit) throw new Error('필드에 남아 있다');
  if (RPD.StorageManager.units.length !== 1) throw new Error('창고에 안 들어갔다');
});

check('창고 개체를 방출하면 골드가 들어온다', () => {
  const gold = RPD.GameManager.gold;
  const before = RPD.StorageManager.units.length;
  const refund = RPD.EconomyManager.sellStored(0);
  if (refund <= 0) throw new Error('환급이 0이다');
  if (RPD.StorageManager.units.length !== before - 1) throw new Error('창고에서 안 빠졌다');
  if (RPD.GameManager.gold !== gold + refund) throw new Error('골드가 안 들어왔다');
});

check('조합식이 등급 순으로 정렬되고 등급으로 좁힐 수 있다', () => {
  clickTab('all');
  const tiers = [...panelHtml('recipeList').matchAll(/rres__tier">([^<]+)</g)].map(m => m[1]);
  // 불멸·초월 주문 줄도 함께 늘어서므로 특수 등급까지 포함한 순서로 본다
  const rank = tiers.map(label => RPD.ALL_TIERS.findIndex(id => RPD.Tiers[id].label === label));
  for (let i = 1; i < rank.length; i++) {
    if (rank[i] > rank[i - 1]) throw new Error(`정렬이 뒤섞였다: ${tiers.join(',')}`);
  }
  const chips = panelHtml('tierFilter');
  for (const id of RPD.TIER_ORDER.slice(1)) {
    if (chips.indexOf('data-tier="' + id + '"') < 0) throw new Error(`${id} 칩이 없다`);
  }
});

/* 세션 33 ② — 필드 조합식의 히든 줄은 "발견한 것만" 뜬다.
 * 사전(조합 사전)은 반대로 미발견도 재료·문구를 보여 준다 — 그 검사는 아래 따로 있다. */
check('필드 조합식 — 발견 전에는 히든 줄이 아예 없다', () => {
  RPD.SaveManager.data.spells = {};
  clickTab('all');
  const sp = RPD.SpellData.forResult('pikachu');
  if (panelHtml('recipeList').indexOf('data-spell="' + sp.id + '"') >= 0) throw new Error('발견 전인데 줄이 있다');
  const chips = panelHtml('tierFilter');
  const m = chips.match(/data-tier="HIDDEN"[^>]*>[^<]*<b>(\d+)\/(\d+)</);
  if (!m) throw new Error('[히든] 칩이 없다(또는 "발견/전체" 꼴이 아니다)');
  const total = RPD.SpellData.list.filter(s => s.kind === 'hidden').length;
  if (Number(m[1]) !== 0 || Number(m[2]) !== total) throw new Error('아직 하나도 안 밝혔는데 히든 칩이 ' + m[1] + '/' + m[2]);
});

/* 세션 58 — [히든] 칩에서는 미발견 히든도 뜬다(결과만 그림자 + ???). [전체] · 등급 칩은 그대로 발견한 것만. */
const hiddenRows = html => [...html.matchAll(/<button type="button" class="rrow rrow--spell[^"]*"[\s\S]*?<\/button>/g)].map(m => m[0]);
check('필드 조합식 [히든] 칩 — 미발견 히든이 전부 그림자 + ??? 로 뜬다 · 칩 숫자는 발견/전체', () => {
  RPD.SaveManager.data.spells = {};
  const found = RPD.SpellData.forResult('pikachu');
  RPD.SaveManager.recordSpell(found.id);                    // 하나만 발견
  RPD.FieldManager.init(); RPD.StorageManager.reset();
  RPD.bus.emit('field:changed', {});
  clickTab('all'); clickChip('HIDDEN');
  const hidden = RPD.SpellData.list.filter(s => s.kind === 'hidden');
  const rows = hiddenRows(panelHtml('recipeList'));
  if (rows.length !== hidden.length) throw new Error('[히든] 칩 줄 ' + rows.length + '개 — 히든은 ' + hidden.length + '개');
  const secret = rows.filter(r => r.indexOf('rrow--secret') >= 0);
  if (secret.length !== hidden.length - 1) throw new Error('미발견 줄 ' + secret.length + '개(기대 ' + (hidden.length - 1) + ')');
  for (const r of secret) {
    if (r.indexOf('is-shadow') < 0 || r.indexOf('???') < 0) throw new Error('미발견 결과가 그림자 + ??? 가 아니다');
    if (r.indexOf('「') < 0) throw new Error('미발견 줄에 주문 문구가 없다');
  }
  const m = panelHtml('tierFilter').match(/data-tier="HIDDEN"[^>]*>[^<]*<b>(\d+)\/(\d+)</);
  if (!m || +m[1] !== 1 || +m[2] !== hidden.length) throw new Error('칩 숫자 ' + (m ? m[1] + '/' + m[2] : '없음'));
  // 정렬: 발견한 것(피카츄) → 미발견
  if (rows[0].indexOf('rrow--secret') >= 0) throw new Error('발견한 히든이 미발견보다 아래에 있다');
  clickChip('ALL');
  RPD.SaveManager.data.spells = {};
});

check('필드 조합식 [전체] · 등급 칩 — 미발견 히든은 안 뜬다', () => {
  RPD.SaveManager.data.spells = {};
  RPD.bus.emit('field:changed', {});
  clickTab('all'); clickChip('ALL');
  if (panelHtml('recipeList').indexOf('rrow--secret') >= 0) throw new Error('[전체] 칩에 미발견 히든이 떴다');
  clickChip('T2');
  if (panelHtml('recipeList').indexOf('rrow--secret') >= 0) throw new Error('등급 칩에 미발견 히든이 떴다');
  clickChip('ALL');
});

check('필드 조합식 [히든] 칩 — 미발견 결과의 이름 · id 가 HTML 에 안 샌다(눌러도 조합식 창이 안 열린다)', () => {
  RPD.SaveManager.data.spells = {};
  RPD.bus.emit('field:changed', {});
  clickTab('all'); clickChip('HIDDEN');
  const html = panelHtml('recipeList');
  const bad = [];
  for (const sp of RPD.SpellData.list.filter(s => s.kind === 'hidden')) {
    const name = RPD.PokemonData.get(sp.result).name;
    const rows = hiddenRows(html);
    const row = rows.find(r => r.indexOf('data-spell-n="' + RPD.SpellData.list.indexOf(sp) + '"') >= 0);
    if (!row) { bad.push(sp.id + ': 줄 없음'); continue; }
    // 결과 칸(rres) 만 떼어 본다 — 재료 칸에는 다른 포켓몬 이름이 정상적으로 보인다
    const res = row.slice(row.indexOf('<span class="rres'), row.indexOf('<span class="rrow__state">'));
    if (res.indexOf(name) >= 0) bad.push(sp.id + ': 결과 칸에 이름');
    if (/data-def=|data-result=/.test(res)) bad.push(sp.id + ': 결과 칸이 눌린다(data-def)');
    // 그림자 그림도 파일 경로(assets/pokemon/<id>.png) · id 를 안 남긴다(세션 59) — 빈 캔버스 + 무작위 번호표
    if (res.indexOf('<img') >= 0 || res.indexOf(sp.result) >= 0 || res.indexOf('<canvas') < 0) bad.push(sp.id + ': 그림자에 그림 경로 · id');
    if (row.indexOf('data-spell="') >= 0) bad.push(sp.id + ': data-spell 에 id');
    // 이 결과가 다른 히든의 재료로 쓰이지 않는 한, 줄 전체 어디에도 이름이 없어야 한다
    const asMat = sp.materials.indexOf(sp.result) >= 0;
    if (!asMat && row.indexOf(name) >= 0) bad.push(sp.id + ': 줄 어딘가에 이름');
  }
  // 줄 밖(빈 칸 문구 · 개수)에도
  const outside = html.replace(/<button[\s\S]*?<\/button>/g, '');
  RPD.SpellData.list.filter(s => s.kind === 'hidden').forEach(sp => { if (outside.indexOf(RPD.PokemonData.get(sp.result).name) >= 0) bad.push(sp.id + ': 줄 밖에 이름'); });
  if (bad.length) throw new Error(bad.slice(0, 5).join(' · '));
  clickChip('ALL');
});

check('조합 사전 — 미발견 주문 결과의 그림자도 파일 경로 · id 를 안 남긴다', () => {
  RPD.SaveManager.data.spells = {};
  RPD.RecipeBook.open(); const book = panelHtml('bookList'); RPD.RecipeBook.close();
  const bad = [];
  const rows = [...book.matchAll(/<article class="bk__row bk__row--spell bk__row--secret"[\s\S]*?<\/article>/g)].map(m => m[0]);
  if (!rows.length) throw new Error('사전에 미발견 주문 줄이 없다');
  for (const r of rows) {
    const res = r.slice(r.indexOf('<div class="bk__res">'), r.indexOf('<div class="bk__mats">'));
    const sp = RPD.SpellData.byPhrase((r.match(/bk__phrase">「([^」]+)」/) || [])[1] || '');
    if (!sp) { bad.push('주문 못 찾음'); continue; }
    if (res.indexOf('<img') >= 0 || res.indexOf('assets/pokemon/') >= 0 || res.indexOf('"' + sp.result + '"') >= 0 || res.indexOf(RPD.PokemonData.get(sp.result).name) >= 0) bad.push(sp.id);
  }
  if (bad.length) throw new Error('결과 칸에 경로 · id · 이름: ' + bad.slice(0, 5).join(', '));
});

check('그림자 HTML 에 정답(id · 이름 · 경로)이 없고, 번호표는 매번 다르다(대응표는 JS 안에만)', () => {
  const html = RPD.UI.shadow(RPD.PokemonData.get('mewtwo'), 'spr--res');
  if (/mewtwo|뮤츠|assets\//.test(html)) throw new Error('그림자 HTML 에 정답이 있다: ' + html);
  const m = html.match(/data-sh="([^"]+)"/);
  if (!m) throw new Error('번호표가 없다');
  const again = RPD.UI.shadow(RPD.PokemonData.get('mewtwo'), 'spr--res').match(/data-sh="([^"]+)"/)[1];
  if (again === m[1]) throw new Error('같은 포켓몬에 같은 번호표 — 번호표로 정답을 맞힐 수 있다');
});

check('필드 조합식 [히든] 칩 — 재료가 모인 미발견 줄을 누르면 바로 조합되고 첫 발견이 된다 · 화면도 바로 바뀐다', () => {
  RPD.SaveManager.data.spells = {};
  const sp = RPD.SpellData.forResult('pikachu');
  RPD.FieldManager.init(); RPD.StorageManager.reset();
  sp.materials.forEach(id => RPD.StorageManager.add(RPD.UnitManager.create(id)));
  RPD.bus.emit('field:changed', {});
  clickTab('all'); clickChip('HIDDEN');
  const n = RPD.SpellData.list.indexOf(sp);
  let row = hiddenRows(panelHtml('recipeList')).find(r => r.indexOf('data-spell-n="' + n + '"') >= 0);
  if (!row || row.indexOf('is-ready') < 0) throw new Error('재료가 다 있는데 완성 가능으로 안 뜬다');
  if (hiddenRows(panelHtml('recipeList'))[0] !== row) throw new Error('완성 가능한 줄이 맨 위가 아니다');
  let first = null;
  const onCast = p => { if (p) first = p.firstTime; };
  RPD.bus.on('spell:cast', onCast);
  // 순번(data-spell-n)으로 누른다
  const l = listeners.recipeList.click;
  const fake = { dataset: { spellN: String(n) }, classList: { contains: c => c === 'is-ready', add() {}, remove() {} }, offsetWidth: 0 };
  l.forEach(fn => fn({ target: { closest: sel => (sel === '.rrow' ? fake : null) } }));
  const got = RPD.StorageManager.allUnits().concat(RPD.FieldManager.getUnits()).filter(u => u.defId === 'pikachu');
  if (!got.length) throw new Error('눌렀는데 조합되지 않았다');
  if (first !== true) throw new Error('첫 발견(firstTime)으로 알리지 않았다');
  if (!RPD.SaveManager.knowsSpell(sp.id)) throw new Error('발견으로 기록되지 않았다');
  // 캐시(recipeSig) 때문에 화면이 그대로면 안 된다 — 발견 즉시 이름이 드러난 줄로
  RPD.bus.emit('field:changed', {});
  row = hiddenRows(panelHtml('recipeList')).find(r => r.indexOf('data-spell="' + sp.id + '"') >= 0);
  if (!row || row.indexOf('rrow--secret') >= 0 || row.indexOf(RPD.PokemonData.get('pikachu').name) < 0) throw new Error('발견했는데 화면이 안 바뀌었다(캐시)');
  RPD.bus.off('spell:cast', onCast);
  // 재료 수는 그대로 두고 발견만 기록돼도(채팅으로 외친 경우 등) 캐시 서명이 달라져야 한다
  const other = RPD.SpellData.forResult('eevee');
  RPD.bus.emit('field:changed', {});
  RPD.SaveManager.recordSpell(other.id);
  RPD.bus.emit('field:changed', {});
  if (!hiddenRows(panelHtml('recipeList')).some(r => r.indexOf('data-spell="' + other.id + '"') >= 0)) throw new Error('재료 수가 그대로일 때 발견해도 화면이 안 바뀐다(캐시 서명에 발견 여부가 없다)');
  clickChip('ALL');
  RPD.SaveManager.data.spells = {};
});

check('필드 조합식 — 발견하면 그 자리에 줄이 뜨고, 클릭 한 번으로 바로 조합된다(채팅 없이)', () => {
  RPD.SaveManager.data.spells = {};
  const sp = RPD.SpellData.forResult('pikachu');
  RPD.SaveManager.recordSpell(sp.id);
  RPD.FieldManager.init(); RPD.StorageManager.reset();
  sp.materials.forEach(id => RPD.StorageManager.add(RPD.UnitManager.create(id)));
  RPD.bus.emit('field:changed', {});
  clickTab('all');
  const html = panelHtml('recipeList');
  const at = html.indexOf('data-spell="' + sp.id + '"');
  if (at < 0) throw new Error('발견했는데 줄이 없다');
  const row = html.slice(html.lastIndexOf('<button', at), html.indexOf('</button>', at));
  if (row.indexOf('is-shadow') >= 0 || row.indexOf('피카츄') < 0) throw new Error('발견했는데 여전히 가려져 있다');
  if (row.indexOf('is-ready') < 0) throw new Error('재료가 다 있는데 완성 가능으로 안 뜬다');
  sp.materials.forEach(m => { if (row.indexOf('data-def="' + m + '"') < 0) throw new Error('재료 ' + m + ' 가 안 보인다'); });

  clickSpellRow(sp.id, true);
  const got = RPD.StorageManager.allUnits().concat(RPD.FieldManager.getUnits()).filter(u => u.defId === 'pikachu');
  if (!got.length) throw new Error('클릭만으로 조합되지 않았다(채팅을 거쳐야 했다)');
  RPD.SaveManager.data.spells = {};
});

check('필드 조합식 — 등급 칩엔 히든이 안 섞이고, [히든] 칩엔 등급 안 가리고 다 모인다', () => {
  RPD.SaveManager.data.spells = {};
  const sp = RPD.SpellData.forResult('pikachu');            // 안흔함
  RPD.SaveManager.recordSpell(sp.id);
  RPD.bus.emit('field:changed', {});
  clickTab('all');
  clickChip('T2');
  if (panelHtml('recipeList').indexOf('data-spell="' + sp.id + '"') >= 0) throw new Error('안흔함 칩에 히든이 섞였다');
  clickChip('HIDDEN');
  if (panelHtml('recipeList').indexOf('data-spell="' + sp.id + '"') < 0) throw new Error('[히든] 칩에 안 뜬다');
  clickChip('ALL');
  RPD.SaveManager.data.spells = {};
});

check('필드 조합식 — 불멸·초월은 발견해도 안 뜬다(사전에만 있다)', () => {
  RPD.SaveManager.data.spells = {};
  const sp = RPD.SpellData.list.find(s => s.kind === 'immortal');
  RPD.SaveManager.recordSpell(sp.id);
  RPD.bus.emit('field:changed', {});
  clickTab('all');
  if (panelHtml('recipeList').indexOf('data-spell="' + sp.id + '"') >= 0) throw new Error('불멸이 필드 조합식에 떴다');
  clickChip('HIDDEN');
  if (panelHtml('recipeList').indexOf('data-spell="' + sp.id + '"') >= 0) throw new Error('[히든] 칩에도 불멸이 떴다');
  clickChip('ALL');
  RPD.SaveManager.data.spells = {};
});

check('필드 조합식 — 재료로 쓰인 미발견 히든은 그림자로만 뜬다(정상 조합식 안에서도)', () => {
  RPD.SaveManager.data.spells = {};                         // 이브이 미발견 상태
  clickTab('all');
  const target = RPD.RecipeData.usedIn('eevee')[0];          // 이브이🔒 를 재료로 쓰는 정상 조합식
  const find = html => {
    const at1 = html.indexOf('data-key="' + target.key + '"');
    const at = at1 >= 0 ? at1 : html.indexOf('data-result="' + target.id + '"');
    return html.slice(html.lastIndexOf('<button', at), html.indexOf('</button>', at));
  };
  const matOpenTag = row => {
    const m = row.match(/<span class="rmat[^"]*"[^>]*>/);   // 재료 칸 여는 태그만(안의 <img> 제외)
    if (!m) throw new Error('재료 칸을 못 찾았다');
    return m[0];
  };
  let row = find(panelHtml('recipeList'));
  let tag = matOpenTag(row);
  if (tag.indexOf('data-def=') >= 0) throw new Error('미발견 재료인데 눌러서 들어갈 수 있다: ' + tag);
  if (row.indexOf('이브이') >= 0) throw new Error('미발견 재료의 이름이 샜다');
  if (row.indexOf('is-shadow') < 0) throw new Error('미발견 재료가 그림자가 아니다');

  const espeon = RPD.SpellData.forResult('eevee');
  RPD.SaveManager.recordSpell(espeon.id);
  RPD.bus.emit('field:changed', {});
  row = find(panelHtml('recipeList'));
  tag = matOpenTag(row);
  if (tag.indexOf('data-def="eevee"') < 0) throw new Error('발견했는데도 여전히 가려져 있다: ' + tag);
  RPD.SaveManager.data.spells = {};
});

check('골드 상점 창이 열리고, 카드를 누르면 사진다', () => {
  RPD.GameManager.setState(RPD.GameState.RUNNING);
  RPD.GoldShopManager.reset();
  RPD.GameManager.gold = 100000;
  RPD.GoldShopUI.show();
  const tiers = panelHtml('goldShopTiers'), types = panelHtml('goldShopTypes');
  if (tiers.indexOf('data-key="HIDDEN"') < 0) throw new Error('[히든] 칸이 없다');
  if (tiers.indexOf('data-key="T6"') >= 0) throw new Error('불멸이 따로 칸을 차지한다');
  if (types.indexOf('data-key="FIRE"') < 0) throw new Error('불꽃 타입 칸이 없다');
  const l = listeners.goldShopOverlay && listeners.goldShopOverlay.click;
  if (!l || !l.length) throw new Error('상점 창에 클릭 핸들러가 없다');
  const card = { dataset: { kind: 'type', key: 'FIRE' }, classList: { add() {}, remove() {} }, offsetWidth: 0 };
  l.forEach(fn => fn({ target: { closest: sel => (sel === '.gcard' ? card : null) } }));
  if (RPD.GoldShopManager.typeLevel('FIRE') !== 1) throw new Error('눌렀는데 안 샀다');
  if (panelHtml('goldShopTypes').indexOf('Lv 1') < 0) throw new Error('산 뒤 창이 갱신되지 않았다');
  RPD.GoldShopUI.hide();
  RPD.GoldShopManager.reset();
});

/* 속성이 class 따옴표 안에 잘못 들어가면 "data-def=..." 글자는 HTML 에 있지만 브라우저는
 * 속성으로 안 읽는다 — 클릭이 통째로 죽는다(세션 33 에 실제로 났던 버그). 글자 검색이 아니라
 * class 값을 걷어 낸 뒤 진짜 속성으로 남는지를 본다. */
function realAttr(tag, name) {
  const noClass = tag.replace(/class="[^"]*"/g, '');
  const m = noClass.match(new RegExp('\\s' + name + '="([^"]*)"'));
  return m ? m[1] : null;
}
function brokenClass(html) {
  return [...html.matchAll(/class="([^"]*)"/g)].map(m => m[1]).filter(v => v.indexOf('=') >= 0);
}
function matTags(html, cls) {
  return [...html.matchAll(new RegExp('<(?:span|button)[^>]*class="' + cls + '[^"]*"[^>]*>', 'g'))].map(m => m[0]);
}

check('필드 조합식 — 재료 칸 HTML 속성이 깨지지 않았다(class 안에 속성이 섞이지 않음)', () => {
  RPD.SaveManager.data.spells = {};
  clickTab('all'); clickChip('ALL');
  const bad = brokenClass(panelHtml('recipeList'));
  if (bad.length) throw new Error('class 값 안에 속성이 들어갔다: ' + bad[0]);
});

check('필드 조합식 — 일반 재료(이상해풀)는 눌리고, 안 밝혀진 히든(피카츄)은 안 눌린다', () => {
  RPD.SaveManager.data.spells = {};
  clickTab('all'); clickChip('ALL');
  const tags = matTags(panelHtml('recipeList'), 'rmat');
  const ivy = tags.filter(t => realAttr(t, 'data-def') === 'ivysaur');
  if (!ivy.length) throw new Error('이상해풀 재료 칸이 진짜 data-def 속성을 갖지 않는다(클릭 불가)');
  const pikaUser = RPD.RecipeData.usedIn('pikachu')[0];
  if (!pikaUser) throw new Error('피카츄를 재료로 쓰는 조합식이 없다');
  const html = panelHtml('recipeList');
  const at = html.indexOf('data-key="' + pikaUser.key + '"');
  const row = html.slice(html.lastIndexOf('<button', at), html.indexOf('</button>', at));
  const secretTags = matTags(row, 'rmat').filter(t => t.indexOf('is-hidden') >= 0);
  if (!secretTags.length) throw new Error('피카츄 재료 칸을 못 찾았다');
  if (secretTags.some(t => realAttr(t, 'data-def'))) throw new Error('안 밝혀진 피카츄가 눌린다');

  // 재료를 누르면 그 재료의 조합식 창이 열리고, 창 안의 일반 재료도 다시 눌린다(하위로 계속 내려가기)
  const l = listeners.recipeList.click;
  const ivyNode = { dataset: { def: 'ivysaur' }, closest: () => null };
  const target = { closest: sel => (sel.indexOf('.rmat') >= 0 ? ivyNode : null) };
  l.forEach(fn => fn({ target }));
  const pop = panelHtml('recipePop');
  if (nodes.recipePop.hidden) throw new Error('이상해풀을 눌렀는데 조합식 창이 안 열렸다');
  if (brokenClass(pop).length) throw new Error('조합식 창 class 안에 속성이 들어갔다: ' + brokenClass(pop)[0]);
  const popMats = matTags(pop, 'rp__mat');
  if (!popMats.some(t => realAttr(t, 'data-go') === 'bulbasaur')) throw new Error('창 안의 이상해씨가 안 눌린다');
  nodes.recipePop.hidden = true;
});

check('필드 조합식 — 피카츄를 밝히면 그때부터 눌린다', () => {
  RPD.SaveManager.data.spells = {};
  RPD.SaveManager.recordSpell(RPD.SpellData.forResult('pikachu').id);
  RPD.bus.emit('field:changed', {});
  clickTab('all'); clickChip('ALL');
  const pikaUser = RPD.RecipeData.usedIn('pikachu')[0];
  const html = panelHtml('recipeList');
  const at = html.indexOf('data-key="' + pikaUser.key + '"');
  const row = html.slice(html.lastIndexOf('<button', at), html.indexOf('</button>', at));
  if (!matTags(row, 'rmat').some(t => realAttr(t, 'data-def') === 'pikachu')) throw new Error('밝혔는데도 안 눌린다');
  RPD.SaveManager.data.spells = {};
});

check('모든 패널 HTML — class 값 안에 속성이 섞인 곳이 없다', () => {
  RPD.SaveManager.data.spells = {};
  RPD.RecipeBook.open(); const book = panelHtml('bookList'); RPD.RecipeBook.close();
  RPD.GameManager.setState(RPD.GameState.RUNNING);
  RPD.GoldShopUI.show(); const shop = panelHtml('goldShopTiers') + panelHtml('goldShopTypes'); RPD.GoldShopUI.hide();
  const all = { 조합사전: book, 골드상점: shop, 보유: panelHtml('storageList'), 조합식: panelHtml('recipeList') };
  for (const k in all) {
    const bad = brokenClass(all[k]);
    if (bad.length) throw new Error(k + ': ' + bad[0]);
  }
});

check('정예 소환 창이 열리고, 카드를 누르면 정예가 나오며 창이 닫힌다', () => {
  RPD.GameManager.setState(RPD.GameState.RUNNING);
  RPD.EliteManager.reset(); RPD.EnemyManager.reset();
  RPD.GameManager.gold = 100000;
  RPD.EliteUI.show();
  const html = panelHtml('eliteList');
  if ([1, 2, 3].some(i => html.indexOf('data-elite="' + i + '"') < 0)) throw new Error('하급·중급·상급 카드가 다 없다');
  if (brokenClass(html).length) throw new Error('class 안에 속성: ' + brokenClass(html)[0]);
  const l = listeners.eliteOverlay.click;
  const card = { dataset: { elite: '1' }, classList: { add() {}, remove() {} }, offsetWidth: 0 };
  l.forEach(fn => fn({ target: { closest: sel => (sel === '.ecard' ? card : null) } }));
  if (!RPD.EliteManager.active) throw new Error('눌렀는데 정예가 안 나왔다');
  if (!nodes.eliteOverlay.hidden) throw new Error('부른 뒤 창이 안 닫혔다');
  RPD.EliteUI.show();
  if (panelHtml('eliteStatus').indexOf('진행 중') < 0) throw new Error('진행 중 표시가 없다');
  RPD.EliteUI.hide(); RPD.EliteManager.reset(); RPD.EnemyManager.reset();
});

check('소환 금지 중에는 소환 버튼이 잠기고 남은 라운드가 보인다', () => {
  RPD.GameManager.setState(RPD.GameState.RUNNING);
  RPD.GameManager.gold = 100000;
  RPD.EliteManager.banUntil = (RPD.GameManager.wave || 1) + 3;
  RPD.bus.emit('economy:gold', {});
  if (!nodes.btnSummon.disabled) throw new Error('금지인데 소환 버튼이 눌린다');
  if (String(nodes.summonCost.textContent).indexOf('금지 3R') < 0) throw new Error('표시: ' + nodes.summonCost.textContent);
  RPD.EliteManager.reset();
});

check('보유 목록에서 창고 전용 개체가 필드 개체 뒤에 온다', () => {
  RPD.FieldManager.init();
  RPD.StorageManager.reset();
  RPD.FieldManager.place(0, RPD.UnitManager.create('charmander'));
  RPD.StorageManager.add(RPD.UnitManager.create('squirtle'));
  RPD.UnitManager.recomputeAll();
  RPD.bus.emit('field:changed', {});
  const html = panelHtml('storageList');
  const field = html.indexOf('data-def="charmander"');
  const stored = html.indexOf('data-def="squirtle"');
  if (field < 0 || stored < 0) throw new Error('보유 목록이 비었다');
  if (stored < field) throw new Error('창고 개체가 앞에 왔다');
  if (html.indexOf('is-storedOnly') < 0) throw new Error('창고 전용 표시가 없다');
});

check('칸을 고르면 정보 카드가 열리고 비우면 닫힌다', () => {
  const card = sandbox.document.getElementById('slotCard');
  const u = RPD.FieldManager.getUnits()[0];
  RPD.FieldManager.select(u.slotIndex);
  if (card.hidden) throw new Error('카드가 안 열렸다');
  if (panelHtml('slotBody').indexOf(u.name) < 0) throw new Error('카드에 이름이 없다');
  RPD.FieldManager.select(-1);
  if (!card.hidden) throw new Error('카드가 안 닫혔다');
});

check('창고에 자리가 있으면 필드가 차도 소환 버튼이 열려 있다', () => {
  const F = RPD.FieldManager;
  F.slots.forEach(s => { if (s.unlocked && !s.unit) F.place(s.index, RPD.UnitManager.create('charmander')); });
  RPD.GameManager.gold = 9000;
  RPD.bus.emit('economy:gold', { gold: 9000, delta: 0, reason: 'test' });
  if (F.firstEmpty()) throw new Error('필드가 안 찼다 — 검사 전제가 깨졌다');
  if (RPD.StorageManager.isFull()) throw new Error('창고가 이미 찼다 — 검사 전제가 깨졌다');
  if (nodes.btnSummon.disabled) throw new Error('창고가 비었는데 소환이 잠겼다');
});

/* ---------- 도감 세부 카드 (세션 61) ---------- */
console.log('\n도감 세부 카드');
function dexNo(id) { return RPD.PokemonData.list.findIndex(d => d.id === id); }
function dexCardHtml() { return panelHtml('dexCardPanel'); }
function dexClick(sel, value) {
  // 카드 안 클릭 — 가짜 DOM 이라 closest 를 흉내 낸다
  const target = { closest: (q) => (q === sel ? { dataset: sel === '[data-dc-go]' ? { dcGo: String(value) } : {} } : null) };
  (listeners.dexCard.click || []).forEach(fn => fn({ target }));
}

check('도감 칸을 누르면 카드가 열린다 — 칸은 id 가 아니라 도감 번호(data-dex-n)로 가리킨다', () => {
  RPD.SaveManager.data.pokedex = { raichu: 1, clefable: 1, bulbasaur: 1 };
  (listeners.btnDex.click || []).forEach(fn => fn({}));
  const grid = panelHtml('dexGrid');
  const n = dexNo('raichu');
  if (grid.indexOf('data-dex-n="' + n + '"') < 0) throw new Error('라이츄 칸에 도감 번호가 없다');
  const target = { closest: (q) => (q === '[data-dex-n]' ? { dataset: { dexN: String(n) } } : null) };
  (listeners.dexGrid.click || []).forEach(fn => fn({ target }));
  if (!RPD.DexCard.isOpen() || RPD.DexCard.n !== n) throw new Error('카드가 안 열렸다');
  if (dexCardHtml().indexOf('라이츄') < 0) throw new Error('카드에 이름이 없다');
});

check('등록된 전설 카드 — 스킬 이름 · 쿨다운 · 패시브 · 특성 · 공격력 · 얻는 법 · 보정이 나온다', () => {
  RPD.DexCard.openId('raichu');
  const html = dexCardHtml(), def = RPD.PokemonData.get('raichu');
  const u = RPD.UnitManager.baseStats('raichu');
  const need = [u.skill.name, '쿨다운 ' + u.skill.cooldown + '초', RPD.SkillData.passiveForUnit(def).name,
    RPD.TraitData.get('raichu').name, RPD.Utils.formatNumber(Math.round(u.attack)), RPD.Utils.formatNumber(Math.round(u.dps)),
    '연쇄 딜러', '조합', RPD.CraftPower.labelOf(def), '역할 보정 피해 ×0.8', '장거리', '판 안 강화'];
  const miss = need.filter(t => html.indexOf(t) < 0);
  if (miss.length) throw new Error('빠진 것: ' + miss.join(', '));
});

check('등록된 버퍼 카드 — 주변 버프(auras.js) · 오라 역할 보정이 나온다', () => {
  RPD.DexCard.openId('clefable');
  const html = dexCardHtml(), a = RPD.AuraData.get('clefable');
  const need = [a.icon, a.name, a.desc, '역할 보정 오라 ×1.4', '버퍼', '옆 칸 공격력'];
  const miss = need.filter(t => html.indexOf(t) < 0);
  if (miss.length) throw new Error('빠진 것: ' + miss.join(', '));
});

check('미등록 카드 — 이름 · id · 그림 경로 · 수치 · 스킬이 HTML 어디에도 없다("아직 만나지 못한 포켓몬"만)', () => {
  const leaks = [];
  ['mewtwo', 'pikachu', 'charizard', 'gengar', 'snorlax', 'mewtwo_transcend'].forEach(id => {
    delete RPD.SaveManager.data.pokedex[id];
    RPD.DexCard.openId(id);
    const html = dexCardHtml(), def = RPD.PokemonData.get(id);
    const u = RPD.UnitManager.baseStats(id);
    const bad = [def.name, def.id, def.roleLabel, 'assets/pokemon', '공격력', 'DPS', RPD.Utils.formatNumber(Math.round(u.attack))]
      .concat(u.skill ? [u.skill.name] : []).filter(t => html.indexOf(t) >= 0);
    if (bad.length) leaks.push(id + ': ' + bad.join(' · '));
    if (html.indexOf('아직 만나지 못한 포켓몬') < 0) leaks.push(id + ': 안내 문구 없음');
  });
  if (leaks.length) throw new Error(leaks.join(' / '));
});

check('도감 칸 — 미등록 칸 HTML 에도 이름 · id · 그림 경로가 없다(그림자)', () => {
  RPD.SaveManager.data.pokedex = { bulbasaur: 1 };
  (listeners.btnDex.click || []).forEach(fn => fn({}));
  const grid = panelHtml('dexGrid');
  const cells = [...grid.matchAll(/<button[^>]*class="dexcell is-locked"[\s\S]*?<\/button>/g)].map(m => m[0]);
  if (cells.length !== RPD.PokemonData.list.length - 1) throw new Error('잠긴 칸 수가 다르다: ' + cells.length);
  const leak = cells.find(c => /assets\/pokemon|data-def|<img/.test(c)) ||
    cells.find(c => RPD.PokemonData.list.some(d => d.id !== 'bulbasaur' && (c.indexOf('"' + d.id + '"') >= 0 || c.indexOf('>' + d.name + '<') >= 0)));
  if (leak) throw new Error('잠긴 칸에서 샌다: ' + leak.slice(0, 160));
});

check('카드 수치 = 필드에 혼자 올린 실제 개체의 recompute 값(강화 · 버프 없음) — 154종 전부', () => {
  const F = RPD.FieldManager, bad = [];
  RPD.GoldShopManager.reset(); RPD.SkillManager.reset(); RPD.GameManager.targetAll = null;
  RPD.SaveManager.data.pokedex = { bulbasaur: 1 };            // 도감 보너스 0(10종 미만) — 전제
  const t0 = RPD.DexBonus.totals();
  if (t0.damage || t0.attackSpeed || t0.critRate) throw new Error('전제가 깨졌다 — 도감 보너스가 붙어 있다');
  RPD.PokemonData.list.forEach(def => {
    F.init(); RPD.StorageManager.reset();
    const slot = F.slots.find(s => s.unlocked);
    F.place(slot.index, RPD.UnitManager.create(def.id));
    RPD.bus.emit('field:changed', {});                          // 실제 경로: 시너지 · 전설 패시브 · recomputeAll
    const real = slot.unit, card = RPD.UnitManager.baseStats(def.id);
    ['dps', 'attack', 'attackSpeed', 'range', 'critRate', 'critDamage', 'splash', 'chain', 'pierce'].forEach(k => {
      if (Math.abs((real[k] || 0) - (card[k] || 0)) > 1e-6 * Math.max(1, Math.abs(real[k] || 0))) bad.push(def.id + '.' + k + ' ' + real[k] + ' ≠ ' + card[k]);
    });
  });
  if (bad.length) throw new Error(bad.length + '건 — ' + bad.slice(0, 4).join(' / '));
});

check('카드 수치는 판 안 버프(시너지 · 골드 상점 · 스킬 버프)에 안 흔들리고, 그 버프 상태를 되돌려 놓는다', () => {
  const before = RPD.UnitManager.baseStats('raichu').dps;
  const SM = RPD.SynergyManager, SK = RPD.SkillManager, GS = RPD.GoldShopManager;
  const bonus = SM.bonus; const fakeBonus = Object.assign(SM.baseBonus(), { attackSpeedMul: 2, critRateAdd: 0.5 });
  SM.bonus = fakeBonus; SK.buff = { attackMul: 3, speedMul: 2, until: SK.clock + 99 };
  const atk = GS.attackMul; GS.attackMul = () => 5;
  const during = RPD.UnitManager.baseStats('raichu').dps;
  const restored = SM.bonus === fakeBonus && SK.buff && SK.buff.attackMul === 3 && GS.attackMul() === 5;
  SM.bonus = bonus; SK.buff = null; GS.attackMul = atk;
  if (Math.abs(before - during) > 1e-6) throw new Error('버프에 흔들렸다: ' + before + ' → ' + during);
  if (!restored) throw new Error('판 상태를 되돌려 놓지 않았다');
});

check('쓰이는 곳을 누르면 그 포켓몬 카드로 바뀐다 · 이전/다음은 도감 번호 순', () => {
  RPD.SaveManager.data.pokedex = { bulbasaur: 1, ivysaur: 1 };
  RPD.DexCard.openId('bulbasaur');
  const html = dexCardHtml(), ivy = dexNo('ivysaur');
  if (html.indexOf('data-dc-go="' + ivy + '"') < 0) throw new Error('쓰이는 곳에 이상해풀이 없다');
  dexClick('[data-dc-go]', ivy);
  if (RPD.DexCard.n !== ivy || dexCardHtml().indexOf('이상해풀') < 0) throw new Error('이상해풀 카드로 안 바뀌었다');
  RPD.DexCard.step(1);
  if (RPD.DexCard.n !== ivy + 1) throw new Error('다음이 도감 번호 순이 아니다');
  RPD.DexCard.step(-2);
  if (RPD.DexCard.n !== ivy - 1) throw new Error('이전이 도감 번호 순이 아니다');
  RPD.DexCard.open(0); RPD.DexCard.step(-1);
  if (RPD.DexCard.n !== RPD.PokemonData.list.length - 1) throw new Error('처음에서 이전 → 마지막으로 안 넘어간다');
  dexClick('[data-dc-close]');
  if (RPD.DexCard.isOpen()) throw new Error('× 로 안 닫힌다');
});

check('안 밝혀진 히든 — 재료 · 쓰이는 곳에서 그림자 + ❔, 이름 · id 가 안 새고 눌러도 이동 안 함', () => {
  RPD.SaveManager.data.spells = {};
  RPD.SaveManager.data.pokedex = { bulbasaur: 1, raichu: 1 };
  const pika = RPD.PokemonData.get('pikachu'), pn = dexNo('pikachu');
  const cases = [['bulbasaur', '쓰이는 곳'], ['raichu', '재료']];
  cases.forEach(([id, where]) => {
    RPD.DexCard.openId(id);
    const html = dexCardHtml();
    if (html.indexOf(pika.name) >= 0 || html.indexOf('pikachu') >= 0) throw new Error(where + '(' + id + ')에 피카츄 이름 · id 가 샜다');
    if (html.indexOf('data-dc-go="' + pn + '"') >= 0) throw new Error(where + '(' + id + ')의 피카츄가 눌린다');
    if (html.indexOf('❔') < 0 || html.indexOf('is-secret') < 0) throw new Error(where + '(' + id + ')에 그림자 + ❔ 가 없다');
  });
  // 밝히면 그때부터 이름이 보이고 눌린다
  RPD.SaveManager.recordSpell(RPD.SpellData.forResult('pikachu').id);
  RPD.DexCard.openId('raichu');
  if (dexCardHtml().indexOf('data-dc-go="' + pn + '"') < 0) throw new Error('밝힌 뒤에도 피카츄가 안 눌린다');
  RPD.SaveManager.data.spells = {};
});

check('도감 카드 HTML — class 값 안에 속성이 섞인 곳이 없다', () => {
  RPD.SaveManager.data.pokedex = { raichu: 1, clefable: 1, bulbasaur: 1 };
  ['raichu', 'clefable', 'bulbasaur', 'mewtwo'].forEach(id => {
    RPD.DexCard.openId(id);
    const bad = brokenClass(dexCardHtml());
    if (bad.length) throw new Error(id + ': ' + bad[0]);
  });
  (listeners.btnDexClose.click || []).forEach(fn => fn({}));
  if (RPD.DexCard.isOpen()) throw new Error('도감을 닫아도 카드가 남는다');
});

/* ---------- 화상 확률 burnChance (세션 62) ---------- */
console.log('\n화상 확률');
/* 한 번 때려 보고 적에게 걸린 화상(초당 피해)과 이번 타격 피해를 돌려준다.
 * proc: 화상 확률 주사위를 강제로(true 터짐 · false 안 터짐). 치명타 등 다른 주사위는 안 터지게. 특성 추가 타격은 잠깐 끈다. */
function burnAfterHit(id, proc) {
  const U = RPD.Utils, TM = RPD.TraitManager;
  const def = RPD.PokemonData.get(id);
  const chance = U.chance, after = TM.afterAttack;
  RPD.EnemyManager.enemies.length = 0;
  const e = RPD.EnemyManager.spawn('grunt', 10);
  e.hp = e.maxHp = 1e12; e.armor = 0; e.shield = 0; e.isBoss = false;
  const unit = RPD.UnitManager.baseStats(id);
  unit.x = e.x; unit.y = e.y;
  U.chance = (p) => (def.burnChance && p === def.burnChance ? proc : false);
  TM.afterAttack = () => {};
  try {
    const before = unit.totalDamage;
    RPD.CombatManager.fireOnce(unit, e);
    const dealt = unit.totalDamage - before;
    const burns = e.effects.dots.filter(d => d.kind === 'burn');
    return { dealt, burn: burns.length ? burns[0].perSecond : 0, n: burns.length };
  } finally { U.chance = chance; TM.afterAttack = after; RPD.EnemyManager.enemies.length = 0; }
}
const near = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));

check('burnChance 는 18종 · 전부 지속 피해 역할 · 값이 지워지지 않았다', () => {
  const list = RPD.PokemonData.list.filter(d => d.burnChance);
  if (list.length !== 18) throw new Error('burnChance 가 있는 종 ' + list.length + '개');
  const bad = list.filter(d => d.role !== 'DOT' || !(d.burnChance > 0 && d.burnChance < 1));
  if (bad.length) throw new Error('이상한 값: ' + bad.map(d => d.id).join(', '));
});

check('불꽃 아닌 종(뿔충이) — 화상 확률이 터지면 강한 화상(피해의 60%를 3초), 안 터지면 화상 없음', () => {
  const P = RPD.TypeParams, mul = RPD.SynergyManager.bonus.burnMul;
  const on = burnAfterHit('weedle', true), off = burnAfterHit('weedle', false);
  if (!(on.dealt > 0)) throw new Error('타격이 안 들어갔다');
  if (!near(on.burn, on.dealt * P.burnProcRatio * mul / P.burnDuration)) throw new Error('강한 화상 세기 다름: ' + on.burn + ' (타격 ' + on.dealt + ')');
  if (off.n !== 0) throw new Error('안 터졌는데 화상이 걸렸다');
});

check('불꽃 종(파이리) — 평소엔 기본 화상(30%), 터지면 강한 화상(60%)으로 덮인다 · 화상은 하나만', () => {
  const P = RPD.TypeParams, mul = RPD.SynergyManager.bonus.burnMul;
  const off = burnAfterHit('charmander', false), on = burnAfterHit('charmander', true);
  if (!near(off.burn, off.dealt * P.burnRatio * mul / P.burnDuration)) throw new Error('기본 화상 세기 다름');
  if (!near(on.burn, on.dealt * P.burnProcRatio * mul / P.burnDuration)) throw new Error('강한 화상으로 안 덮였다');
  if (on.n !== 1) throw new Error('화상이 ' + on.n + '개 — 하나여야 한다');
});

check('18종 전부 — 터지면 강한 화상이 실제로 걸린다 · burnChance 없는 종(구구)은 주사위가 터져도 화상 없음', () => {
  const P = RPD.TypeParams, mul = RPD.SynergyManager.bonus.burnMul;
  const bad = RPD.PokemonData.list.filter(d => d.burnChance).filter(d => {
    const r = burnAfterHit(d.id, true);
    return !(r.dealt > 0 && near(r.burn, r.dealt * P.burnProcRatio * mul / P.burnDuration));
  }).map(d => d.id);
  if (bad.length) throw new Error('안 걸린 종: ' + bad.join(', '));
  if (burnAfterHit('pidgey', true).n !== 0) throw new Error('구구에게 화상이 붙었다');
});

check('도감 카드 — 화상 확률과 강한 화상 세기가 보인다', () => {
  RPD.SaveManager.data.pokedex = { weedle: 1 };
  RPD.DexCard.openId('weedle');
  const html = panelHtml('dexCardPanel');
  if (html.indexOf('화상 확률 18%') < 0 || html.indexOf('60%') < 0) throw new Error('카드에 화상 확률이 없다');
  RPD.DexCard.close();
});

/* ---------- 누적 피해에 지속 피해 (세션 63) ---------- */
console.log('\n누적 피해');
function dotRun(kind, perSecond, secs, hp) {
  const EM = RPD.EnemyManager;
  EM.enemies.length = 0;
  const e = EM.spawn('grunt', 10);
  e.hp = e.maxHp = hp; e.armor = 0; e.shield = 0;
  const u = RPD.UnitManager.create('weedle');
  EM.applyDot(e, perSecond, secs, u, kind, kind === 'poison' ? 5 : 0);
  const hp0 = e.hp;
  for (let t = 0; t < secs + 0.5; t += 0.1) EM.update(0.1);
  const taken = hp0 - Math.max(0, e.hp);
  EM.enemies.length = 0;
  return { u, taken, alive: e.alive };
}

check('화상 · 독 — 지속 피해가 건 개체의 누적 피해(totalDamage)에 들어간다(적이 실제로 잃은 체력과 같다)', () => {
  ['burn', 'poison'].forEach(kind => {
    const r = dotRun(kind, 100, 3, 1e9);
    if (!(r.taken > 0)) throw new Error(kind + ' 피해가 안 들어갔다');
    if (Math.abs(r.u.totalDamage - r.taken) > 1e-6) throw new Error(kind + ': 누적 ' + r.u.totalDamage + ' ≠ 적이 잃은 체력 ' + r.taken);
  });
});

check('지속 피해로 적이 죽을 때 — 남은 체력만큼만 센다(넘친 피해는 안 셈)', () => {
  const r = dotRun('burn', 1000, 3, 250);
  if (r.alive) throw new Error('적이 안 죽었다 — 전제가 깨졌다');
  if (Math.abs(r.u.totalDamage - 250) > 1e-6) throw new Error('누적 ' + r.u.totalDamage + ' — 250 이어야 한다');
});

check('칸 정보 카드의 "누적" · 결과 화면 최고 피해가 지속 피해를 포함한다', () => {
  const F = RPD.FieldManager, EM = RPD.EnemyManager;
  F.init(); RPD.StorageManager.reset();
  const slots = F.slots.filter(s => s.unlocked);
  const dot = RPD.UnitManager.create('weedle'), hitter = RPD.UnitManager.create('pidgey');
  F.place(slots[0].index, dot); F.place(slots[1].index, hitter);
  hitter.totalDamage = 500;                         // 직접 타격만 한 개체
  EM.enemies.length = 0;
  const e = EM.spawn('grunt', 10); e.hp = e.maxHp = 1e9; e.armor = 0;
  EM.applyDot(e, 300, 3, dot, 'poison', 5);          // 지속 피해만 한 개체 — 3초에 900
  for (let t = 0; t < 3.5; t += 0.1) EM.update(0.1);
  EM.enemies.length = 0;
  if (!(dot.totalDamage > 850)) throw new Error('지속 피해 개체 누적 ' + dot.totalDamage);
  if (RPD.UnitManager.topDamage() !== dot) throw new Error('최고 피해가 지속 피해 개체가 아니다');
  F.select(slots[0].index);
  const html = panelHtml('slotBody');
  if (html.indexOf('누적 ' + RPD.Utils.formatNumber(dot.totalDamage)) < 0) throw new Error('칸 카드 누적에 지속 피해가 없다');
  F.select(-1);
});

check('처형(고스트 시너지 — 지금 로스터엔 악 타입이 없다) — 마지막 한 방(남은 체력)도 누적 피해에 들어간다', () => {
  const EM = RPD.EnemyManager, U = RPD.Utils, TM = RPD.TraitManager, SM = RPD.SynergyManager;
  const unit = RPD.UnitManager.baseStats('gastly');
  EM.enemies.length = 0;
  const e = EM.spawn('grunt', 10);
  e.maxHp = 1e6; e.armor = 0; e.shield = 0; e.isBoss = false;
  const T = 0.14;                                            // 고스트 3마리 시너지
  e.hp = unit.attack + e.maxHp * T * 0.5;                    // 치명타 없음 · 방어 0 → 맞고 나면 처형 문턱 아래
  const before = e.hp;
  const chance = U.chance, after = TM.afterAttack, bonus = SM.bonus;
  U.chance = () => false; TM.afterAttack = () => {};
  SM.bonus = Object.assign(SM.baseBonus(), { executeAdd: T });
  const got = [];
  const fn = () => got.push(1);
  RPD.bus.on('combat:execute', fn);
  try { RPD.CombatManager.fireOnce(unit, e); }
  finally { U.chance = chance; TM.afterAttack = after; SM.bonus = bonus; RPD.bus.off('combat:execute', fn); EM.enemies.length = 0; }
  if (!got.length || e.alive) throw new Error('처형이 안 일어났다 — 전제가 깨졌다');
  if (Math.abs(unit.totalDamage - before) > 1e-6) throw new Error('누적 ' + unit.totalDamage + ' ≠ 적의 처음 체력 ' + before + '(타격 + 처형)');
});

console.log(`\n────────────────────────────`);
console.log(failures === 0 ? '부팅 경로 이상 없음' : `부팅 문제 ${failures}건`);
process.exit(failures === 0 ? 0 : 1);
