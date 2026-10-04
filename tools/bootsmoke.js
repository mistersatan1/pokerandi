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
    hidden: false,
    visibilityState: 'visible',
    addEventListener: (type, fn) => {   // 검사에서 직접 불러 보려고 모아 둔다(keydown · visibilitychange …)
      listeners.__document = listeners.__document || {};
      (listeners.__document[type] = listeners.__document[type] || []).push(fn);
    },
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
  const before = RPD.FieldManager.getAllUnits().length;
  click('btnSummon');
  const after = RPD.FieldManager.getAllUnits().length;
  if (after !== before + 1) throw new Error(`${before} → ${after}`);
});

check('소환한 포켓몬에 실효 스탯이 들어간다', () => {
  const u = RPD.FieldManager.getAllUnits()[0];
  if (!u) throw new Error('필드에 개체가 없다');
  if (!(u.attack > 0) || !(u.dps > 0)) throw new Error(`attack=${u.attack} dps=${u.dps}`);
});


check('슬롯을 선택하면 정보 카드가 나온다', () => {
  const u = RPD.FieldManager.getAllUnits()[0];
  RPD.FieldManager.select(u.slotIndex);
  const html = sandbox.document.getElementById('slotBody').innerHTML;
  if (html.indexOf(u.name) < 0) throw new Error('카드에 이름이 없다');
});

check('방출 버튼이 칸을 비우고 골드를 준다', () => {
  const u = RPD.FieldManager.getAllUnits()[0];
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

  const units = RPD.FieldManager.getAllUnits();
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
  if (RPD.FieldManager.getAllUnits().length !== 1) throw new Error('필드에 안 올라갔다');
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

check('조각 상점(세션 93) — 등급 순(흔함 → 전설) 머리 줄 · 검색(이름 · 초성 · 영어 · 등급) · 검색칸은 한 번만 만든다', () => {
  RPD.GameManager.setWave(40);
  RPD.ShardManager.reset(); RPD.ShardManager.add(400, 'test');
  RPD.RecipeManager.refresh();
  clickTab('shards');
  const tierOf = id => RPD.PokemonData.get(id).tier;
  const ids = h => [...h.matchAll(/data-buy="([a-z_0-9]+)"/g)].map(m => m[1]);
  const list = panelHtml('recipeList');
  const order = ids(list).map(id => RPD.TIER_ORDER.indexOf(tierOf(id)));
  for (let i = 1; i < order.length; i++) if (order[i] < order[i - 1]) throw new Error('등급 순이 아니다 ' + ids(list)[i]);
  const heads = [...list.matchAll(/<div class="shopgroup"[^>]*><b>([^<]+)<\/b>/g)].map(m => m[1]);
  const tiersShown = [...new Set(ids(list).map(tierOf))].map(t => RPD.Tiers[t].label);
  if (JSON.stringify(heads) !== JSON.stringify(tiersShown)) throw new Error('등급 머리 줄 ' + heads + ' / ' + tiersShown);
  const tf = panelHtml('tierFilter');
  if ((tf.match(/id="shardSearch"/g) || []).length !== 1) throw new Error('검색칸이 없다');
  const search = q => {
    (listeners.tierFilter.input || []).forEach(fn => fn({ target: { id: 'shardSearch', value: q } }));
    return ids(panelHtml('recipeList'));
  };
  let r = search('파이리'); if (r.indexOf('charmander') < 0 || r.length > 3) throw new Error('이름 검색 ' + r);
  r = search('ㅍㅇㄹ'); if (r.indexOf('charmander') < 0) throw new Error('초성 검색 ' + r);
  r = search('squirtle'); if (JSON.stringify(r) !== '["squirtle"]') throw new Error('영어 검색 ' + JSON.stringify(r));
  r = search('전설'); if (!r.length || r.some(id => tierOf(id) !== 'T5')) throw new Error('등급 검색 ' + r);
  r = search('없는포켓몬'); if (r.length || panelHtml('recipeList').indexOf('맞는 포켓몬이 없습니다') < 0) throw new Error('빈 결과 안내');
  // 사도 검색칸은 그대로(다시 만들면 치던 글자 · 초점이 날아간다)
  search('파이리');
  const before = panelHtml('tierFilter');
  (listeners.recipeList.click || []).forEach(fn => fn({ target: { closest: sel => (sel === '.shoprow' ? { dataset: { buy: 'charmander' } } : null) } }));
  if (panelHtml('tierFilter') !== before) throw new Error('구매 뒤 검색칸을 다시 만들었다');
  search('');
  clickTab('all');
  if (panelHtml('tierFilter').indexOf('shardSearch') >= 0) throw new Error('조합식 탭에 검색칸이 남았다');
});

check('조합식 창에서 바로 조각 구매(세션 95) — 모자란 재료 칩 · 사면 그 자리에서 다시 그림 · 한 번에 사기 · 조각 부족은 막힘 · 히든 재료는 없음', () => {
  RPD.GameManager.setWave(40);
  RPD.FieldManager.init(); RPD.StorageManager.reset();
  RPD.ShardManager.reset();
  RPD.RecipeManager.refresh();
  const pop = () => String(nodes.recipePop.innerHTML);
  const clickPop = (sel, data) => (listeners.recipePop.click || []).forEach(fn => fn({ target: { closest: s2 => (s2.indexOf(sel) >= 0 ? { dataset: data } : null) } }));
  // 재료 둘 다 없는 비숨김 조합식 하나(슬리프 = 캐이시 + 고오스)
  RPD.UIManager.openRecipePop('drowzee');
  let h = pop();
  if (h.indexOf('조각으로 사기') < 0) throw new Error('조각 사기 줄이 없다');
  if (!/data-buy="abra"[^>]*disabled/.test(h) || h.indexOf('조각 부족') < 0) throw new Error('조각이 없으면 막혀야 한다');
  if (h.indexOf('data-buy-all') >= 0) throw new Error('조각이 없는데 한 번에 사기가 보인다');
  RPD.ShardManager.add(200, 'test');
  RPD.UIManager.openRecipePop('drowzee');
  h = pop();
  if (/data-buy="abra"[^>]*disabled/.test(h)) throw new Error('조각이 있는데 막혀 있다');
  if (h.indexOf('data-buy-all="abra:1,gastly:1"') < 0) throw new Error('한 번에 사기가 없다 ' + (h.match(/data-buy-all="[^"]*"/) || ''));
  const s0 = RPD.ShardManager.shards, n0 = RPD.FieldManager.getAllUnits().length + RPD.StorageManager.units.length;
  clickPop('[data-buy]', { buy: 'abra' });
  if (RPD.ShardManager.shards >= s0) throw new Error('조각이 안 줄었다');
  if (RPD.FieldManager.getAllUnits().length + RPD.StorageManager.units.length !== n0 + 1) throw new Error('캐이시가 안 늘었다');
  h = pop();
  if (/data-buy="abra"/.test(h)) throw new Error('다 모인 재료 칩이 남았다');
  if (!/data-buy="gastly"/.test(h)) throw new Error('남은 재료 칩이 사라졌다');
  clickPop('[data-buy-all]', { buyAll: 'gastly:1' });
  h = pop();
  if (h.indexOf('조각으로 사기') >= 0 || h.indexOf('지금 조합하기') < 0) throw new Error('다 사면 조합하기 버튼이 떠야 한다');
  // 히든 재료는 칩이 없다(조각 상점과 같은 규칙)
  const hid = RPD.RecipeData.list.find(r => r.materials.some(m => RPD.PokemonData.get(m).hidden));
  if (hid) {
    RPD.UIManager.openRecipePop(hid.id);
    const hh = pop(), hm = hid.materials.filter(m => RPD.PokemonData.get(m).hidden);
    if (hm.some(m => hh.indexOf('data-buy="' + m + '"') >= 0)) throw new Error('히든 재료를 조각으로 팔고 있다');
  }
  nodes.recipePop.hidden = true;
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
  const got = RPD.StorageManager.allUnits().concat(RPD.FieldManager.getAllUnits()).filter(u => u.defId === 'pikachu');
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
  const got = RPD.StorageManager.allUnits().concat(RPD.FieldManager.getAllUnits()).filter(u => u.defId === 'pikachu');
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
  const u = RPD.FieldManager.getAllUnits()[0];
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

/* ---------- 휴대폰 ① 필드 고정 · 시트 · 정보 바 · 이동 모드 (세션 65) ---------- */
console.log('\n휴대폰 정보 바 · 이동 모드');
const MS = RPD.MobileSheet;
function msSetup() {
  MS.forceMobile = true;
  const F = RPD.FieldManager;
  F.init(); RPD.StorageManager.reset();
  const open = F.slots.filter(s => s.unlocked && !s.blocked);
  F.place(open[0].index, RPD.UnitManager.create('charizard'));
  F.place(open[1].index, RPD.UnitManager.create('pikachu'));
  RPD.bus.emit('field:changed', {});
  return { F, a: open[0].index, b: open[1].index, empty: open[2].index, locked: F.slots.find(s => !s.unlocked) };
}

check('정보 바 — 칸을 고르면 이름 · 등급 · DPS + [이동][창고로][강화][방출], 아무것도 안 고르면 안내 한 줄', () => {
  const { F, a } = msSetup();
  F.select(-1);
  if (panelHtml('infoBar').indexOf('칸을 누르면') < 0) throw new Error('안내 문구가 없다');
  F.select(a);
  const html = panelHtml('infoBar'), u = F.get(a).unit;
  const need = [u.name, RPD.Tiers[u.tier].label, 'DPS ' + RPD.Utils.formatNumber(Math.round(u.dps)), 'data-ib="move"', 'data-ib="store"', 'data-ib="upgrade"', 'data-ib="sell"'];
  const miss = need.filter(t => html.indexOf(t) < 0);
  if (miss.length) throw new Error('빠진 것: ' + miss.join(', '));
  if (brokenClass(html).length) throw new Error('class 안에 속성이 섞였다');
  F.select(-1);
});

check('이동 모드 — 빈 칸을 누르면 옮겨지고 그 칸이 선택된 채 정보 바로 돌아온다', () => {
  const { F, a, empty } = msSetup();
  const u = F.get(a).unit;
  F.select(a);
  if (!MS.startMove() || MS.moving !== a) throw new Error('이동 모드가 안 켜졌다');
  if (panelHtml('infoBar').indexOf('옮길 칸을 누르세요') < 0) throw new Error('정보 바가 이동 안내로 안 바뀌었다');
  if (!MS.moveTo(empty)) throw new Error('옮기기 실패');
  if (F.get(empty).unit !== u || F.get(a).unit) throw new Error('개체가 안 옮겨졌다');
  if (MS.moving !== -1 || F.selectedIndex !== empty) throw new Error('이동 모드가 안 끝났거나 선택이 옮긴 칸이 아니다');
  if (panelHtml('infoBar').indexOf(u.name) < 0) throw new Error('정보 바로 안 돌아왔다');
});

check('이동 모드 — 누가 있는 칸이면 맞바꾸고, 같은 칸은 취소, 잠긴 칸은 이동 모드 유지', () => {
  const { F, a, b, locked } = msSetup();
  const ua = F.get(a).unit, ub = F.get(b).unit;
  F.select(a); MS.startMove(); MS.moveTo(b);
  if (F.get(a).unit !== ub || F.get(b).unit !== ua) throw new Error('안 맞바뀌었다');
  F.select(b); MS.startMove(); MS.moveTo(b);
  if (MS.moving !== -1 || F.get(b).unit !== ua) throw new Error('같은 칸을 눌렀는데 취소가 아니다');
  if (locked) {
    F.select(b); MS.startMove();
    if (MS.moveTo(locked.index) || MS.moving !== b) throw new Error('잠긴 칸으로 옮겼거나 이동 모드가 풀렸다');
    MS.cancelMove();
  }
});

check('이동 모드 — 빈 칸 · 누가 있는 칸마다 칸 태그(근접용 · 중거리용 · 장거리 · 구석)가 붙고, 다른 칸을 고르면 풀린다', () => {
  const { F, a, b } = msSetup();
  F.select(a); MS.startMove();
  const tags = Object.values(MS.kinds || {});
  const allowed = ['근접용', '중거리용', '장거리', '구석', '응원'];   // 응원 칸은 "응원"(세션 82)
  if (!tags.length || tags.some(t => allowed.indexOf(t) < 0)) throw new Error('칸 태그 이상: ' + tags.slice(0, 5).join(','));
  if (Object.keys(MS.kinds).length !== F.slots.filter(s => s.unlocked && !s.blocked).length) throw new Error('태그 수가 열린 칸 수와 다르다');
  F.select(b);
  if (MS.moving !== -1) throw new Error('다른 칸을 골랐는데 이동 모드가 남았다');
});

check('칸 근처 빈 곳 — 손가락 크기(지름 44px) 안이면 가장 가까운 칸이 골라진다 · 멀면 안 골라진다', () => {
  const { F } = msSetup();
  const R = RPD.Renderer, sc = R.toCanvasCss(0, 0).scale;
  const pad = (MS.FINGER / 2) / sc;
  // 기대값을 따로 계산 — 칸 가장자리까지 거리가 손가락 반지름 안인 칸 중 가장 가까운 것
  const expect = (x, y) => { let best = -1, bd = pad; F.slots.forEach(s => { const h = s.size / 2;
    const dx = Math.max(0, Math.abs(x - s.x) - h), dy = Math.max(0, Math.abs(y - s.y) - h), d = Math.hypot(dx, dy); if (d <= bd) { bd = d; best = s.index; } }); return best; };
  const client = (lx, ly) => { const c = R.toCanvasCss(lx, ly); return c; };
  let checked = 0, hitSelf = 0;
  F.slots.slice(0, 12).forEach(s => {
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
      const lx = s.x + dx * (s.size / 2 + 16 / sc), ly = s.y + dy * (s.size / 2 + 16 / sc);
      const c = client(lx, ly), got = MS.slotAt(c.x, c.y), want = expect(lx, ly);
      if (got !== want) throw new Error('칸 ' + s.index + ' 옆 16px: ' + got + ' ≠ ' + want);
      if (want === s.index) hitSelf += 1;
      checked += 1;
    });
  });
  if (hitSelf < checked / 2) throw new Error('칸 옆 16px 을 눌러 그 칸이 골라진 경우가 너무 적다 ' + hitSelf + '/' + checked);
  // 어느 칸에서도 먼 곳(22px 넘게)은 안 고른다
  const far = F.slots[0], c = client(far.x, far.y);
  const lonely = [[0, 0], [30, 30], [990, 580], [500, 5]].map(([x, y]) => [x, y]).find(([x, y]) => expect(x, y) < 0);
  if (lonely) { const cc = client(lonely[0], lonely[1]); if (MS.slotAt(cc.x, cc.y) !== -1) throw new Error('칸에서 먼 곳인데 칸을 골랐다'); }
  if (RPD.UIManager.TOUCH.PAD < MS.FINGER / 2) throw new Error('보통 누르기 범위(' + RPD.UIManager.TOUCH.PAD + ')가 손가락 반지름보다 작다');
});

check('자세한 정보 시트 — 칸을 골랐을 때만 열리고, 선택을 풀면 닫힌다 · 이동 모드를 켜면 닫힌다', () => {
  const { F, a } = msSetup();
  F.select(-1);
  if (MS.openDetail()) throw new Error('선택 없이 열렸다');
  F.select(a);
  if (!MS.openDetail() || !MS.detail) throw new Error('안 열렸다');
  MS.startMove();
  if (MS.detail) throw new Error('이동 모드에서도 열려 있다');
  MS.cancelMove(); MS.openDetail(); F.select(-1);
  if (MS.detail) throw new Error('선택을 풀어도 남았다');
  MS.forceMobile = false;
});

/* ---------- 휴대폰 ② 하단 툴바 · 조합 가능 줄 · 보스 보상 (세션 66) ---------- */
console.log('\n휴대폰 툴바 · 보스 보상');
const MT = RPD.MobileToolbar;
function readyRecipe() {
  // 소환으로 나오는 재료만 쓰는 조합식 하나 — 재료를 창고에 넣어 완성 가능하게
  RPD.FieldManager.init(); RPD.StorageManager.reset();
  const r = RPD.RecipeData.list.find(x => x.materials.every(m => RPD.PokemonData.get(m).summon));
  r.materials.forEach(m => RPD.StorageManager.add(RPD.UnitManager.create(m)));
  RPD.bus.emit('field:changed', {});
  return r;
}

check('[조합] 배지 = RecipeManager 완성 가능 개수 · 0 이면 배지 없고 흐리다', () => {
  RPD.FieldManager.init(); RPD.StorageManager.reset(); RPD.bus.emit('field:changed', {});
  if (RPD.RecipeManager.readyList().length !== 0) throw new Error('전제가 깨졌다 — 이미 완성 가능');
  if (!nodes.mtabCraft.hidden) throw new Error('0 인데 배지가 보인다');
  if (!nodes.tbCraft.classList.contains('is-dim')) throw new Error('0 인데 안 흐리다');
  readyRecipe();
  const n = RPD.RecipeManager.readyList().length;
  if (n < 1 || nodes.mtabCraft.hidden || String(nodes.mtabCraft.textContent) !== String(n)) throw new Error('배지 ' + nodes.mtabCraft.textContent + ' ≠ ' + n);
  if (nodes.tbCraft.classList.contains('is-dim')) throw new Error('완성 가능한데 흐리다');
});

check('정보 바 "★ 조합 가능"(세션 67 합침) — 아무 칸도 안 골랐을 때 [조합] 과 같은 조합식 이름 · 누르면 실제로 조합 · 칸을 고르면 칸 정보', () => {
  readyRecipe();
  RPD.FieldManager.select(-1);
  const best = RPD.RecipeManager.readyList()[0];
  const html = panelHtml('infoBar');
  if (html.indexOf('★ 조합 가능') < 0 || html.indexOf(best.resultName) < 0 || html.indexOf('data-ib="craft"') < 0) throw new Error('정보 바 내용: ' + html.slice(0, 120));
  if (brokenClass(html).length) throw new Error('class 안에 속성이 섞였다');
  // 가짜 DOM 의 버튼에는 click() 이 없다 — 실제 브라우저처럼 등록된 click 을 부르게
  nodes.btnCraft.click = () => (listeners.btnCraft.click || []).forEach(fn => fn({}));
  let crafted = null;
  const fn = (p) => { crafted = p; };
  RPD.bus.on('recipe:crafted', fn);
  const target = { closest: (q) => (q === '[data-ib]' ? { disabled: false, getAttribute: () => 'craft' } : null) };
  (listeners.infoBar.click || []).forEach(f => f({ target }));
  RPD.bus.off('recipe:crafted', fn);
  if (!crafted) throw new Error('눌렀는데 조합이 안 됐다');
  const got = crafted.resultId || (crafted.unit && crafted.unit.defId) || (crafted.recipe && crafted.recipe.id);
  if (got && got !== best.resultId) throw new Error('다른 조합식이 조합됐다: ' + got + ' ≠ ' + best.resultId);
  // 칸을 고르면 조합 줄 대신 칸 정보
  readyRecipe();
  const F = RPD.FieldManager, s = F.slots.find(x => x.unlocked && !x.blocked);
  F.place(s.index, RPD.UnitManager.create('charizard')); F.select(s.index);
  const sel = panelHtml('infoBar');
  if (sel.indexOf('data-ib="craft"') >= 0 || sel.indexOf('data-ib="move"') < 0) throw new Error('칸을 골랐는데 칸 정보가 아니다');
  F.select(-1);
});

check('[더보기] 점 — 정예 진행 중 · 소환 금지 중에만 보인다', () => {
  const E = RPD.EliteManager;
  E.active = null; E.banUntil = 0; RPD.bus.emit('elite:changed', {});
  if (!nodes.tbMoreDot.hidden) throw new Error('평소에도 점이 보인다');
  E.banUntil = (RPD.GameManager.wave || 1) + 3; RPD.bus.emit('elite:changed', {});
  if (nodes.tbMoreDot.hidden) throw new Error('소환 금지 중인데 점이 없다');
  E.banUntil = 0; E.active = { id: 'x' }; RPD.bus.emit('elite:changed', {});
  if (nodes.tbMoreDot.hidden) throw new Error('정예 진행 중인데 점이 없다');
  E.active = null; RPD.bus.emit('elite:changed', {});
});

check('소환 금지 중 [소환] 이 "금지 NR" 로 잠긴다(골드가 안 바뀌어도 바로)', () => {
  const E = RPD.EliteManager, GM = RPD.GameManager;
  GM.gold = 9999; RPD.bus.emit('economy:gold', { gold: 9999, delta: 0 });
  E.banUntil = (GM.wave || 1) + 3; RPD.bus.emit('elite:changed', {});
  const left = E.banRoundsLeft();
  if (!nodes.btnSummon.disabled) throw new Error('금지 중인데 소환 버튼이 열려 있다');
  if (nodes.summonCost.textContent !== '금지 ' + left + 'R') throw new Error('문구: ' + nodes.summonCost.textContent);
  E.banUntil = 0; RPD.bus.emit('elite:changed', {});
  if (String(nodes.summonCost.textContent).indexOf('금지') >= 0) throw new Error('금지가 풀렸는데 문구가 남았다');
});

check('설명서 "보스 보상" — RewardManager.table 모든 항목 · 이후 되풀이 · 처치 골드(bossGoldPreview) · 다음 보스', () => {
  const RM = RPD.RewardManager, EM = RPD.EconomyManager;
  const html = RPD.HudPanels.renderBossHelp();
  const keys = Object.keys(RM.table);
  const miss = [];
  keys.forEach(k => {
    const every = (RPD.GameManager.mode.bossEvery || 10) < 5 ? 10 : RPD.GameManager.mode.bossEvery;
    if (html.indexOf('data-boss-n="' + k + '"') < 0) miss.push(k + '번째 줄');
    if (html.indexOf(RM.describe(RM.table[k])) < 0) miss.push(k + '번째 보상');
    if (html.indexOf(RPD.Utils.formatNumber(EM.bossGoldPreview(k * every)) + 'G') < 0) miss.push(k + '번째 골드');
  });
  if (html.indexOf('data-boss-n="beyond"') < 0 || html.indexOf(RM.describe(RM.beyond)) < 0) miss.push('이후 되풀이');
  if (html.indexOf('다음 보스') < 0) miss.push('다음 보스');
  if (miss.length) throw new Error('빠진 것: ' + miss.join(', '));
});

check('보스 보상 지급 — 휴대폰은 필드 위 카드 대신 정보 바 알림(누르면 닫힘) · PC 는 예전 카드', () => {
  MS.forceMobile = true;
  nodes.rewardPop.hidden = true;
  const entry = { wave: 20, items: [{ kind: 'gold', amount: 800, paid: true }, { kind: 'ticket', count: 3 }] };
  RPD.bus.emit('reward:granted', entry);
  if (!nodes.rewardPop.hidden) throw new Error('휴대폰인데 필드 위 보상 카드가 떴다');
  const strip = panelHtml('infoBar');
  if (strip.indexOf('20R 보스 처치') < 0 || strip.indexOf('소환권 3') < 0 || strip.indexOf('data-ib="toast"') < 0) throw new Error('정보 바 알림: ' + strip.slice(0, 120));
  MT.dismissToast();
  if (panelHtml('infoBar').indexOf('보스 처치') >= 0) throw new Error('알림을 눌러 닫아도 남았다');
  MS.forceMobile = false;
  RPD.bus.emit('reward:granted', entry);
  if (nodes.rewardPop.hidden) throw new Error('PC 인데 보상 카드가 안 떴다');
  nodes.rewardPop.hidden = true;
});

/* ---------- 편의 기능(모바일 ③ · 세션 68) ---------- */
console.log('\n편의 기능 — 되돌리기 · 진동 · 효과 · 자리 비움');
const UN = RPD.UndoManager, CV = RPD.Convenience;
function docFire(type, ev) { ((listeners.__document || {})[type] || []).forEach(fn => fn(ev)); }
function undoSetup() {
  MS.forceMobile = true;
  const F = RPD.FieldManager;
  F.init(); RPD.StorageManager.reset(); UN.reset();
  const open = F.slots.filter(s => s.unlocked && !s.blocked);
  F.place(open[0].index, RPD.UnitManager.create('charizard'));
  F.place(open[1].index, RPD.UnitManager.create('pikachu'));
  RPD.bus.emit('field:changed', {});
  UN.reset();
  return { F, S: RPD.StorageManager, a: open[0].index, b: open[1].index, empty: open[2].index };
}

check('되돌리기 — 빈 칸으로 옮긴 것 · 맞바꾼 것 · 창고로 · 필드로를 차례로 되돌린다(최대 3개)', () => {
  const { F, S, a, b, empty } = undoSetup();
  const ua = F.get(a).unit, ub = F.get(b).unit;
  F.swap(a, empty);                                   // 옮기기
  if (F.get(empty).unit !== ua || UN.count() !== 1) throw new Error('옮기기 기록 ' + UN.count());
  if (!UN.undo().ok || F.get(a).unit !== ua || F.get(empty).unit) throw new Error('옮기기를 못 되돌렸다');
  F.swap(a, b);                                       // 맞바꾸기
  if (!UN.undo().ok || F.get(a).unit !== ua || F.get(b).unit !== ub) throw new Error('맞바꾸기를 못 되돌렸다');
  S.store(a);                                         // 창고로
  if (!UN.undo().ok || F.get(a).unit !== ua || S.units.length) throw new Error('창고로를 못 되돌렸다');
  S.store(a); UN.reset();
  S.deploy(0, empty);                                 // 필드로(빈 칸)
  if (!UN.undo().ok || F.get(empty).unit || S.units[0] !== ua) throw new Error('필드로를 못 되돌렸다');
  S.deploy(0, b);                                     // 필드로(누가 있는 칸 — 맞바꿈)
  if (F.get(b).unit !== ua || S.units[0] !== ub) throw new Error('전제: 맞바꿈 배치 실패');
  if (!UN.undo().ok || F.get(b).unit !== ub || S.units[0] !== ua) throw new Error('맞바꿈 배치를 못 되돌렸다');
  if (UN.undo().reason !== 'EMPTY') throw new Error('기록이 남았다');
  for (let i = 0; i < 5; i++) F.swap(i % 2 ? empty : b, i % 2 ? b : empty);
  if (UN.count() !== 3) throw new Error('최대 3개가 아니다: ' + UN.count());
});

check('되돌리기 — 조합 재료로 쓰인 · 방출된 개체가 낀 기록은 지워진다', () => {
  const { F, S, empty } = undoSetup();
  const r = RPD.RecipeData.list.find(x => x.materials.every(m => RPD.PokemonData.get(m).summon));
  F.init(); S.reset(); UN.reset();
  const open = F.slots.filter(s => s.unlocked && !s.blocked);
  const mats = r.materials.map((m, i) => { const u = RPD.UnitManager.create(m); F.place(open[i].index, u); return u; });
  RPD.bus.emit('field:changed', {}); UN.reset();
  const spare = open[r.materials.length].index;
  F.swap(open[0].index, spare);                       // 재료 하나를 옮겨 둔다
  if (UN.count() !== 1) throw new Error('전제: 기록 1개가 아니다');
  const res = RPD.RecipeManager.craft(r.key || r.result);
  if (!res.ok) throw new Error('조합 실패: ' + res.reason);
  if (UN.count() !== 0 || UN.stack.length !== 0) throw new Error('재료로 쓰였는데 기록이 남았다');
  // 방출
  F.init(); S.reset(); UN.reset();
  const u = RPD.UnitManager.create('pikachu'); F.place(open[0].index, u); RPD.bus.emit('field:changed', {}); UN.reset();
  F.swap(open[0].index, open[1].index);
  RPD.EconomyManager.sell(open[1].index);
  if (UN.count() !== 0 || UN.stack.length !== 0) throw new Error('방출했는데 기록이 남았다');
  void mats; void empty;
});

check('되돌리기 — 새 판(처음부터) · 게임 오버에 비워진다', () => {
  const { F, a, empty } = undoSetup();
  F.swap(a, empty);
  RPD.Game.restart();
  if (UN.count() !== 0) throw new Error('처음부터 뒤에 기록이 남았다');
  const s2 = undoSetup();
  s2.F.swap(s2.a, s2.empty);
  RPD.bus.emit('game:over', { wave: 1 });
  if (UN.count() !== 0) throw new Error('게임 오버 뒤에 기록이 남았다');
});

check('되돌리기 — 위치가 바뀌었으면 거절 · 그 기록은 버리고 "되돌릴 수 없어요"', () => {
  const { F, a, empty } = undoSetup();
  F.swap(a, empty);                                   // a → empty
  F.place(a, RPD.UnitManager.create('squirtle'));     // 기록 밖 변화: 원래 자리가 찼다
  const r = CV.undo();
  if (r.ok || r.reason !== 'STALE') throw new Error('거절하지 않았다: ' + JSON.stringify(r));
  if (UN.stack.length !== 0) throw new Error('실패한 기록을 안 버렸다');
  if (panelHtml('infoBar').indexOf('되돌릴 수 없어요') < 0) throw new Error('알림이 없다');
  RPD.MobileToolbar.dismissToast();
});

check('정보 바 [되돌리기] — 기록이 없으면 흐리게(disabled) · 있으면 횟수 · 누르면 되돌린다', () => {
  const { F, a, empty } = undoSetup();
  F.select(-1);
  const off = panelHtml('infoBar').match(/<button[^>]*data-ib="undo"[^>]*>/);
  if (!off || !/\sdisabled/.test(off[0])) throw new Error('기록이 없는데 흐리지 않다: ' + (off && off[0]));
  F.swap(a, empty); F.select(empty);
  const html = panelHtml('infoBar');
  const on = html.match(/<button[^>]*data-ib="undo"[^>]*>/);
  if (!on || /\sdisabled/.test(on[0])) throw new Error('기록이 있는데 흐리다');
  if (html.indexOf('data-ib="undo"') > html.indexOf('data-ib="move"')) throw new Error('[되돌리기] 가 버튼 넷 뒤에 있다(누구 줄 옆이어야)');
  if (brokenClass(html).length) throw new Error('class 안에 속성이 섞였다');
  const btn = { disabled: false, getAttribute: k => (k === 'data-ib' ? 'undo' : null) };
  listeners.infoBar.click.forEach(fn => fn({ target: { closest: () => btn } }));
  if (F.get(a).unit == null || F.get(empty).unit) throw new Error('정보 바 버튼으로 안 되돌아갔다');
  F.select(-1);
});

check('Ctrl+Z · ⌘Z 로 되돌린다 — 입력칸(주문 · 검색)에서는 글자 되돌리기로 둔다', () => {
  const { F, a, empty } = undoSetup();
  F.swap(a, empty);
  let prevented = false;
  docFire('keydown', { key: 'z', code: 'KeyZ', ctrlKey: true, target: { tagName: 'INPUT' }, preventDefault() { prevented = true; } });
  if (F.get(a).unit || prevented) throw new Error('입력칸에서 되돌렸다');
  docFire('keydown', { key: 'z', code: 'KeyZ', ctrlKey: true, target: { tagName: 'BODY' }, preventDefault() { prevented = true; } });
  if (!F.get(a).unit || F.get(empty).unit || !prevented) throw new Error('Ctrl+Z 가 안 먹었다');
  F.swap(a, empty);
  docFire('keydown', { key: 'z', code: 'KeyZ', metaKey: true, target: { tagName: 'CANVAS' }, preventDefault() {} });
  if (!F.get(a).unit) throw new Error('⌘Z 가 안 먹었다');
});

function catchErrors(fn) {
  const errs = [], real = console.error;
  console.error = (...a) => errs.push(a.map(String).join(' '));
  try { fn(); } finally { console.error = real; }
  return errs;
}
function placeAndCraft() {
  const { F, empty } = undoSetup();
  F.select(F.slots.find(s => s.unit).index);
  F.swap(F.selectedIndex, empty);
  const r = RPD.RecipeData.list.find(x => x.materials.every(m => RPD.PokemonData.get(m).summon));
  F.init(); RPD.StorageManager.reset();
  r.materials.forEach(m => RPD.StorageManager.add(RPD.UnitManager.create(m)));
  RPD.bus.emit('field:changed', {});
  RPD.Haptics._last = -1e9;
  const res = RPD.RecipeManager.craft(r.key || r.result);
  if (!res.ok) throw new Error('조합 실패');
}

check('진동 — navigator.vibrate 가 없어도(아이폰 · PC) 배치 · 조합에 오류가 없다', () => {
  delete sandbox.navigator;
  const errs = catchErrors(placeAndCraft);
  if (errs.length) throw new Error(errs[0].slice(0, 160));
  sandbox.navigator = {};
  const errs2 = catchErrors(placeAndCraft);
  if (errs2.length) throw new Error(errs2[0].slice(0, 160));
  delete sandbox.navigator;
});

check('진동 — 무늬(조합 [20,40,20] · 고르기 8ms · 배치 15ms) · 0.1초 안 되풀이 무시 · 끄면 안 부른다', () => {
  const H = RPD.Haptics, calls = [];
  sandbox.navigator = { vibrate: p => { calls.push(p); return true; } };
  H.setEnabled(true);
  placeAndCraft();
  if (!calls.some(p => JSON.stringify(p) === '[20,40,20]')) throw new Error('조합 무늬가 없다: ' + JSON.stringify(calls));
  calls.length = 0; H._last = -1e9;
  H.buzz('place'); H.buzz('select');
  if (calls.length !== 1 || calls[0] !== 15) throw new Error('0.1초 되풀이: ' + JSON.stringify(calls));
  H.setEnabled(false);
  calls.length = 0; H._last = -1e9;
  placeAndCraft();
  RPD.bus.emit('boss:appeared', {}); RPD.bus.emit('game:life', { life: 1, delta: -1 });
  if (calls.length) throw new Error('끄기인데 떨었다: ' + JSON.stringify(calls));
  if (RPD.SaveManager.getSetting('haptics', true) !== false) throw new Error('설정이 저장 안 됐다');
  H.setEnabled(true);
  delete sandbox.navigator;
});

check('[더보기] 진동 · 효과 버튼이 설정을 바꾸고 이름표가 따라간다', () => {
  const E = RPD.Effects;
  (listeners.btnHaptics.click || []).forEach(fn => fn({}));
  if (RPD.Haptics.enabled()) throw new Error('진동 버튼이 안 껐다');
  (listeners.btnHaptics.click || []).forEach(fn => fn({}));
  if (!RPD.Haptics.enabled()) throw new Error('진동 버튼이 안 켰다');
  E.set('normal');
  (listeners.btnFx.click || []).forEach(fn => fn({}));
  if (E.levelId() !== 'reduced' || RPD.SaveManager.getSetting('fx') !== 'reduced') throw new Error('효과 버튼: ' + E.levelId());
  (listeners.btnFx.click || []).forEach(fn => fn({}));
  if (E.levelId() !== 'minimal') throw new Error('효과 버튼 두 번: ' + E.levelId());
  (listeners.btnFx.click || []).forEach(fn => fn({}));
  if (E.levelId() !== 'normal') throw new Error('효과 버튼 세 번: ' + E.levelId());
});

check('효과 3단계 — 해상도 상한(2 · 1.5 · 1) · 그리기 fps(60 · 60 · 30) · 파티클 상한(1600 · 800 · 400)이 바뀐다', () => {
  const E = RPD.Effects, FP = RPD.FramePacer, R = RPD.Renderer;
  const got = {};
  ['normal', 'reduced', 'minimal'].forEach(id => {
    E.force(id);
    got[id] = [FP.maxDpr(), R.dpr, FP.targetFps(), RPD.AttackFx.stats().particleCap].join('/');
  });
  E.force(null);
  const want = { normal: '2/2/60/1600', reduced: '1.5/1.5/60/800', minimal: '1/1/30/400' };
  const bad = Object.keys(want).filter(k => got[k] !== want[k]);
  if (bad.length) throw new Error(bad.map(k => k + ' ' + got[k] + ' (기대 ' + want[k] + ')').join(' · '));
});

check('효과 기본값 — 코어 4개 이하 · 메모리 4GB 이하 · 동작 줄이기면 줄임, 아니면 보통 · 고른 값은 저장해서 그걸 쓴다', () => {
  const E = RPD.Effects, SM = RPD.SaveManager;
  delete SM.data.settings.fx;
  const cases = [[{ hardwareConcurrency: 8, deviceMemory: 8 }, false, 'normal'], [{ hardwareConcurrency: 4 }, false, 'reduced'],
                 [{ hardwareConcurrency: 8, deviceMemory: 4 }, false, 'reduced'], [{ hardwareConcurrency: 8 }, true, 'reduced']];
  const realMM = sandbox.matchMedia;
  const bad = cases.filter(([nav, rm, want]) => {
    sandbox.navigator = nav;
    sandbox.matchMedia = q => ({ matches: rm && /reduced-motion/.test(q) });
    return E.levelId() !== want;
  });
  sandbox.matchMedia = realMM; delete sandbox.navigator;
  if (bad.length) throw new Error('틀림: ' + JSON.stringify(bad));
  E.set('minimal');
  sandbox.navigator = { hardwareConcurrency: 16 };
  if (E.levelId() !== 'minimal') throw new Error('고른 값보다 기기 기본값을 썼다');
  delete sandbox.navigator;
  E.set('normal');
});

check('효과 단계는 전투 결과를 안 바꾼다 — 같은 난수로 30초 전투: 보통 = 최소(골드 · 처치 · 적 체력 · 라이프)', () => {
  const E = RPD.Effects;
  function run(level) {
    E.force(level);
    RPD.Game.restart();
    const F = RPD.FieldManager, open = F.slots.filter(s => s.unlocked && !s.blocked);
    ['charizard', 'pikachu', 'blastoise', 'venusaur', 'alakazam'].forEach((id, i) => F.place(open[i].index, RPD.UnitManager.create(id)));
    RPD.bus.emit('field:changed', {});
    vm.runInContext('(function(){ var s = 12345; Math.random = function () { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x80000000; }; })()', sandbox);
    RPD.WaveManager.begin();
    for (let t = 0; t < 30; t++) { tick(1); RPD.Renderer.render(1 / 60); }
    const GM = RPD.GameManager, EM = RPD.EnemyManager;
    return JSON.stringify({ gold: GM.gold, life: GM.life, wave: GM.wave, kills: RPD.StatsManager.kills || (RPD.StatsManager.data && RPD.StatsManager.data.kills),
      hp: Math.round(EM.enemies.reduce((a, e) => a + (e.alive ? e.hp : 0), 0)), n: EM.enemies.length,
      dmg: Math.round(F.getAllUnits().reduce((a, u) => a + (u.totalDamage || 0), 0)) });
  }
  const realRandom = vm.runInContext('Math.random', sandbox);
  let a, b, c;
  try { a = run('normal'); b = run('minimal'); c = run('reduced'); }
  finally { sandbox.__realRandom = realRandom; vm.runInContext('Math.random = __realRandom', sandbox); }
  E.force(null);
  if (a !== b || a !== c) throw new Error('\n    보통 ' + a + '\n    최소 ' + b + '\n    줄임 ' + c);
  if (JSON.parse(a).dmg <= 0) throw new Error('전투가 안 일어났다: ' + a);
});

check('js/systems/ 는 효과 설정을 읽지 않는다(그리기만 바꾼다)', () => {
  const dir = path.join(ROOT, 'js/systems');
  const bad = fs.readdirSync(dir).filter(f => f.endsWith('.js'))
    .filter(f => /RPD\.Effects|getSetting\(\s*['"]fx['"]|Effects\.(get|levelId|LEVELS)/.test(fs.readFileSync(path.join(dir, f), 'utf8')));
  if (bad.length) throw new Error(bad.join(', '));
});

check('앱을 벗어나면(visibilitychange hidden · pagehide) 일시정지 + 덮개 · 돌아와도 안 풀리고 · 누르면 계속', () => {
  const GM = RPD.GameManager, S = RPD.GameState, L = RPD.Loop;
  RPD.Game.restart(); RPD.WaveManager.begin();
  if (GM.state !== S.RUNNING || L.paused) throw new Error('전제: 진행 중이 아니다');
  sandbox.document.hidden = true; sandbox.document.visibilityState = 'hidden';
  docFire('visibilitychange', {});
  if (!L.paused || GM.state !== S.PAUSED || nodes.awayOverlay.hidden) throw new Error('가려졌는데 안 멈췄다');
  sandbox.document.hidden = false; sandbox.document.visibilityState = 'visible';
  docFire('visibilitychange', {});
  if (!L.paused || nodes.awayOverlay.hidden) throw new Error('돌아오자마자 저절로 풀렸다');
  (listeners.awayOverlay.click || []).forEach(fn => fn({}));
  if (L.paused || GM.state !== S.RUNNING || !nodes.awayOverlay.hidden) throw new Error('눌렀는데 안 이어졌다');
  (listeners.__window.pagehide || []).forEach(fn => fn({}));
  if (!L.paused || nodes.awayOverlay.hidden) throw new Error('pagehide 에 안 멈췄다');
  CV.resume();
  // 이미 멈춘 판(⏸)은 덮개를 안 띄우고, 풀 때도 건드리지 않는다
  L.setPaused(true); GM.setState(S.PAUSED);
  sandbox.document.hidden = true; docFire('visibilitychange', {}); sandbox.document.hidden = false;
  if (!nodes.awayOverlay.hidden) throw new Error('이미 멈춘 판에 덮개를 띄웠다');
  L.setPaused(false); GM.setState(S.RUNNING);
  MS.forceMobile = false;
});

/* ---------- 다음 해금 표시 — 라운드가 바뀌면 바로 갱신(세션 72) ---------- */
check('상단 "N R 뒤 등급" — 소환 없이 라운드만 바뀌어도 맞게 갱신된다(23R "2R 뒤 희귀함" → 61R 는 숨김)', () => {
  const GM = RPD.GameManager, el = nodes.statNextUnlock;
  RPD.Game.restart();
  GM.setWave(23);
  if (el.hidden || el.textContent !== '2R 뒤 희귀함') throw new Error('23R: ' + el.hidden + ' ' + el.textContent);
  GM.setWave(24);
  if (el.textContent !== '1R 뒤 희귀함') throw new Error('24R(소환 없이): ' + el.textContent);
  GM.setWave(61);
  if (!el.hidden) throw new Error('61R 인데 남아 있다: ' + el.textContent);
  GM.setWave(33);
  if (!el.hidden) throw new Error('33R(전설까지 열림): ' + el.textContent);
  GM.setWave(1);
  if (el.hidden || el.textContent !== '8R 뒤 안흔함') throw new Error('1R: ' + el.hidden + ' ' + el.textContent);
  RPD.Game.restart();
});

check('PC 보스 보상 칩 · 카드 — 40R 보상(초월의 조각)도 오류 없이 그려진다(31~40R 칩 · 40R 처치 카드)', () => {
  const RM = RPD.RewardManager, GM = RPD.GameManager, H = RPD.HudPanels;
  const errs = [], real = console.error; console.error = (...a) => errs.push(a.join(' '));
  try {
    RPD.Game.restart(); MS.forceMobile = false;
    GM.setWave(33);                                       // 다음 보스 = 40R
    const chip = String(nodes.nextReward.innerHTML);
    if (chip.indexOf('40R 보스 보상') < 0 || chip.indexOf('초월의 조각') < 0) throw new Error('다음 보상 칩: ' + chip.slice(0, 160));
    const entry = { wave: 40, items: RM.rewardsFor(40, GM.mode).slice() };
    if (!entry.items.some(i => i.kind === 'item')) throw new Error('전제: 40R 보상에 item 이 없다');
    nodes.rewardPop.hidden = true;
    RPD.bus.emit('reward:granted', entry);
    if (nodes.rewardPop.hidden || String(nodes.rewardPop.innerHTML).indexOf('초월의 조각') < 0) throw new Error('40R 처치 카드가 안 떴다');
    nodes.rewardPop.hidden = true;
  } finally { console.error = real; RPD.Game.restart(); }
  if (errs.length) throw new Error('오류: ' + errs[0].slice(0, 140));
});

/* ---------- 판 이어하기(세션 70) ---------- */
console.log('\n판 이어하기 — 자동 저장 · 복원');
const RS = RPD.RunSave, RUI = RPD.ResumeUI;
const LS = sandbox.localStorage;
function strip(d) { const c = JSON.parse(JSON.stringify(d)); delete c.savedAt; return JSON.stringify(c); }
/* 부자 판 하나 — 몇 라운드 돌리고 창고 · 상점 · 금지 · 소환권 · 조각 · 발견 · 공격 대상까지 채운 뒤, 라운드 시작 순간에 저장된 것 */
function richRun(opts) {
  opts = opts || {};
  MS.forceMobile = false;
  RPD.Config.autosave = true; RS.blocked = false;
  RPD.Game.restart();
  RPD.Game.startRun('NORMAL', 'HARD');
  const F = RPD.FieldManager, GM = RPD.GameManager;
  const open = F.slots.filter(s => s.unlocked && !s.blocked);
  ['charizard', 'pikachu', 'blastoise'].forEach((id, i) => { if (!F.get(open[i].index).unit) F.place(open[i].index, RPD.UnitManager.create(id)); });
  RPD.bus.emit('field:changed', {});
  GM.life = 999;
  tick(40);                                   // 몇 라운드
  const lockedSlot = F.slots.find(s => !s.unlocked && !s.blocked);
  if (lockedSlot) F.unlock(lockedSlot.index);
  const u = F.slots.find(s => s.unit).unit; u.level = 3; u.targetChoice = 'BOSS'; u.kills = 17; u.totalDamage = 12345;
  RPD.StorageManager.capacity += 4;
  RPD.StorageManager.add(RPD.UnitManager.create('bulbasaur'));
  RPD.StorageManager.add(RPD.UnitManager.create('gengar'));
  RPD.SummonManager.tickets = 4; RPD.ShardManager.shards = 23;
  RPD.GoldShopManager.typeLv = { FIRE: 2 }; RPD.GoldShopManager.tierLv = { T1: 1 };
  RPD.EliteManager.banUntil = GM.wave + 3; RPD.EliteManager.lastRound = GM.wave;
  RPD.RecipeManager.discovered = { ivysaur: true };
  RPD.SpellManager.transcendShards = 1;
  GM.gold = 1420; GM.targetAll = 'STRONG';
  if (opts.elite) {
    RPD.EliteManager.banUntil = 0; RPD.EliteManager.lastRound = 0; GM.gold = 5000;
    const r = RPD.EliteManager.summon(1);
    if (!r.ok) throw new Error('정예 소환 실패: ' + r.reason);
  }
  RPD.UnitManager.recomputeAll();
  RPD.bus.emit('wave:started', RPD.WaveManager.plan);   // 라운드 시작 순간 = 저장 시점
  const r = RS.read();
  if (!r.ok) throw new Error('저장이 안 됐다: ' + r.reason);
  return r.data;
}
function fingerprint() {
  const F = RPD.FieldManager, S = RPD.StorageManager, GM = RPD.GameManager;
  const u = x => x.defId + '/' + (x.level || 0);
  return JSON.stringify({
    field: F.slots.filter(s => s.unit).map(s => s.index + ':' + u(s.unit)), unlocked: F.slots.filter(s => s.unlocked).length,
    storage: S.units.map(u), cap: S.capacity, gold: GM.gold, life: GM.life, wave: GM.wave, mode: GM.mode.id + ':' + GM.mode.difficulty,
    tickets: RPD.SummonManager.tickets, shards: RPD.ShardManager.shards, shop: [RPD.GoldShopManager.typeLv, RPD.GoldShopManager.tierLv],
    ban: RPD.EliteManager.banUntil
  });
}

check('저장 → 새 판 → 복원 → 다시 저장한 JSON 이 처음과 같다(직렬화 왕복)', () => {
  const d = richRun();
  RPD.Game.resetAll('NORMAL', 'EASY');          // 전혀 다른 새 판
  RS.restore(d);
  const again = RS.snapshot();
  if (strip(again) !== strip(d)) {
    const a = JSON.parse(strip(d)).state, b = JSON.parse(strip(again)).state;
    const diff = Object.keys(a).filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
    throw new Error('달라진 매니저: ' + diff.join(', ') + ' — ' + diff.map(k => JSON.stringify(a[k]).slice(0, 120) + ' ≠ ' + JSON.stringify(b[k]).slice(0, 120)).join(' | '));
  }
});

check('복원 뒤 필드 · 창고 종류 · 강화 레벨 · 골드 · 라이프 · 소환권 · 조각 · 골드 상점 · 정예 금지 라운드 · 모드가 같다', () => {
  const d = richRun();
  const before = fingerprint();
  RPD.Game.resetAll('BOSS_RUSH');
  RS.restore(d);
  const after = fingerprint();
  if (after !== before) throw new Error('\n    전 ' + before + '\n    후 ' + after);
  const u = RPD.FieldManager.slots.find(s => s.unit && s.unit.level === 3).unit;
  if (u.targetChoice !== 'BOSS' || u.kills !== 17 || u.totalDamage !== 12345 || !(u.dps > 0)) throw new Error('개체 필드: ' + JSON.stringify(RPD.UnitManager.serialize(u)) + ' dps ' + u.dps);
  if (RPD.GameManager.targetAll !== 'STRONG' || !RPD.RecipeManager.discovered.ivysaur) throw new Error('전체 공격 대상 · 발견');
});

check('복원 → "눌러서 계속" 전에는 멈춰 있고, 누르면 그 라운드가 시작 효과 없이 열린다(무료 지급 · 특성 골드 · 보호막 한 번만)', () => {
  const d = richRun();
  RPD.Game.resetAll('NORMAL', 'NORMAL');
  RS.restore(d);
  const GM = RPD.GameManager, count = () => RPD.FieldManager.getAllUnits().length + RPD.StorageManager.units.length;
  const n0 = count(), g0 = GM.gold, sh0 = GM.shield, t0 = RPD.SummonManager.tickets;
  if (!RPD.Loop.paused || GM.state !== RPD.GameState.PAUSED) throw new Error('복원 직후 멈춰 있지 않다');
  if (RPD.WaveManager.phase !== 'IDLE') throw new Error('누르기 전에 라운드가 시작됐다: ' + RPD.WaveManager.phase);
  let traitGold = 0; const off = p => { if (p && p.delta > 0) traitGold += p.delta; };
  RPD.bus.on('economy:gold', off);
  RS.begin();
  RPD.bus.off('economy:gold', off);
  if (RPD.WaveManager.phase !== 'SPAWNING' || RPD.WaveManager.wave !== d.summary.wave) throw new Error('라운드가 안 열렸다 ' + RPD.WaveManager.phase + ' ' + RPD.WaveManager.wave);
  if (GM.state !== RPD.GameState.RUNNING || RPD.Loop.paused) throw new Error('진행 중이 아니다');
  if (count() !== n0) throw new Error('라운드 무료 지급이 또 나갔다 ' + n0 + ' → ' + count());
  if (GM.gold !== g0 || traitGold) throw new Error('골드가 또 들어왔다 ' + g0 + ' → ' + GM.gold);
  if (GM.shield !== sh0 || RPD.SummonManager.tickets !== t0) throw new Error('보호막 · 소환권');
  if (GM.wave !== d.summary.wave) throw new Error('라운드 ' + GM.wave);
});

check('⏸ 로 풀어도 저장된 라운드가 열린다', () => {
  const d = richRun();
  RPD.Game.resetAll('NORMAL', 'NORMAL');
  RS.restore(d);
  RPD.Loop.setPaused(false);
  if (RPD.WaveManager.phase !== 'SPAWNING' || RS.pending) throw new Error('⏸ 로는 안 열렸다');
});

check('진행 중인 정예가 있는 저장 — 이어하면 입구에서 다시 나오고 참가비가 다시 안 빠진다', () => {
  const d = richRun({ elite: true });
  if (!d.state.EliteManager.active) throw new Error('저장에 정예가 없다');
  RPD.Game.resetAll('NORMAL', 'NORMAL');
  RS.restore(d);
  const g0 = RPD.GameManager.gold;
  if (RPD.EliteManager.active) throw new Error('누르기 전에 정예가 나왔다');
  RS.begin();
  const e = RPD.EliteManager.active;
  if (!e || e.eliteTier !== d.state.EliteManager.active.tier || e.eliteFee !== d.state.EliteManager.active.fee) throw new Error('정예가 안 나왔다');
  if (RPD.EnemyManager.enemies.indexOf(e) < 0 || e.distance !== 0) throw new Error('입구가 아니다(distance ' + e.distance + ')');
  if (RPD.GameManager.gold !== g0) throw new Error('참가비가 또 빠졌다 ' + g0 + ' → ' + RPD.GameManager.gold);
  if (RPD.EliteManager.lastRound !== d.state.EliteManager.lastRound) throw new Error('한 라운드 한 번 기록이 바뀌었다');
});

check('게임 오버 · 클리어 · [처음부터] 뒤에는 저장이 없다', () => {
  richRun(); RPD.bus.emit('game:over', { wave: 5 });
  if (LS.getItem(RS.KEY) != null) throw new Error('게임 오버 뒤에 남았다');
  richRun(); RPD.bus.emit('game:victory', { wave: 70 });
  if (LS.getItem(RS.KEY) != null) throw new Error('클리어 뒤에 남았다');
  richRun(); (listeners.btnRestart.click || []).forEach(fn => fn({}));
  if (LS.getItem(RS.KEY) != null) throw new Error('[처음부터] 뒤에 남았다');
});

check('맞지 않는 저장(없는 포켓몬 · 없는 모드) · 깨진 JSON · 저장소 사용 불가 — 오류 없이 새 판, 버전 불일치는 한 번 안내', () => {
  const d = richRun();
  RPD.Game.restart();
  const errs = [], real = console.error; console.error = (...a) => errs.push(a.join(' '));
  try {
    const bad = JSON.parse(JSON.stringify(d)); bad.state.StorageManager.units.push({ defId: 'agumon_x', level: 0 });
    LS.setItem(RS.KEY, JSON.stringify(bad));
    nodes.runNotice.hidden = true;
    RUI.render();
    if (nodes.runNotice.hidden || String(nodes.runNoticeText.textContent).indexOf('현재 게임 버전과 맞지 않아') < 0) throw new Error('버전 불일치 안내가 없다');
    if (LS.getItem(RS.KEY) != null || !nodes.resumeCard.hidden) throw new Error('맞지 않는 저장이 남았거나 카드가 보인다');
    nodes.runNotice.hidden = true; RUI.render();
    if (!nodes.runNotice.hidden) throw new Error('안내가 또 떴다(한 번만)');
    const bm = JSON.parse(JSON.stringify(d)); bm.state.GameManager.mode = 'NO_SUCH_MODE'; LS.setItem(RS.KEY, JSON.stringify(bm));
    if (RS.read().reason !== 'VERSION') throw new Error('없는 모드를 못 걸렀다');
    LS.setItem(RS.KEY, '{"schema":1,"state":');
    if (RS.read().reason !== 'BROKEN' || RUI.resume()) throw new Error('깨진 JSON');
    const realLS = sandbox.localStorage;
    Object.defineProperty(sandbox, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
    try {
      if (RS.read().reason !== 'STORAGE' || RS.save() !== false || RUI.resume()) throw new Error('저장소 사용 불가');
      RUI.render(); RS.clear();
      RPD.Game.startRun('NORMAL', 'NORMAL'); tick(3);
    } finally { Object.defineProperty(sandbox, 'localStorage', { configurable: true, writable: true, value: realLS }); }
    if (RPD.GameManager.state !== RPD.GameState.RUNNING) throw new Error('새 판이 안 돈다');
  } finally { console.error = real; }
  if (errs.length) throw new Error('오류: ' + errs[0].slice(0, 160));
});

check('판 저장을 지우거나 망가뜨려도 진행 기록(도감 · 칭호 · 발견한 주문)은 그대로 — 키가 다르다', () => {
  const SM = RPD.SaveManager;
  SM.data.pokedex.charizard = { seen: true, best: 1 };
  SM.data.spells.articuno_spell = 12345; SM.data.clearsBy['NORMAL:NORMAL'] = 2;
  SM.save();
  const progress = LS.getItem(RPD.SAVE_KEY);
  if (RS.KEY === RPD.SAVE_KEY) throw new Error('같은 키');
  richRun();
  LS.setItem(RS.KEY, 'garbage{{'); RS.read(); RS.clear(); RUI.render();
  if (LS.getItem(RPD.SAVE_KEY) !== progress) throw new Error('진행 기록 문자열이 바뀌었다');
  SM.load();
  if (!SM.data.pokedex.charizard || SM.data.spells.articuno_spell !== 12345 || SM.data.clearsBy['NORMAL:NORMAL'] !== 2) throw new Error('진행 기록을 다시 읽으니 달라졌다');
});

check('이어하기 카드 — 시작 화면에 저장된 모드 · 라운드 · 라이프 · 골드 · 몇 분 전, [이어하기] 가 되살린다', () => {
  const d = richRun();
  RPD.Game.resetAll('NORMAL', 'NORMAL');   // 시작 화면(READY) — 저장은 남아 있다(새로고침 흉내)
  LS.setItem(RS.KEY, JSON.stringify(d));
  RUI.render();
  const t = String(nodes.resumeInfo.textContent);
  const want = [d.summary.label, d.summary.wave + '라운드', '라이프 ' + d.summary.life, '골드 1,420', '방금'];
  const miss = want.filter(w => t.indexOf(w) < 0);
  if (nodes.resumeCard.hidden || miss.length) throw new Error('카드: ' + t + ' / 빠짐 ' + miss.join(','));
  if (RUI.ago(Date.now() - 3 * 60000) !== '3분 전' || RUI.ago(Date.now() - 2 * 3600000) !== '2시간 전') throw new Error('몇 분 전');
  (listeners.btnResume.click || []).forEach(fn => fn({}));
  if (RPD.GameManager.wave !== d.summary.wave || !RS.pending || nodes.awayOverlay.hidden) throw new Error('[이어하기] 가 안 되살렸거나 "눌러서 계속"이 없다');
  if (!nodes.resumeCard.hidden) throw new Error('이어한 뒤에도 카드가 보인다');
  (listeners.awayOverlay.click || []).forEach(fn => fn({}));
  if (RPD.WaveManager.phase !== 'SPAWNING') throw new Error('"눌러서 계속"으로 라운드가 안 열렸다');
});

check('저장이 있는데 [게임 시작] · [새 판] — "저장된 판이 사라집니다" 확인 · 취소하면 그대로 · 새 판 시작이면 지운다', () => {
  const d = richRun();
  RPD.Game.resetAll('NORMAL', 'NORMAL'); LS.setItem(RS.KEY, JSON.stringify(d)); RUI.render();
  nodes.runConfirm.hidden = true;
  const cap = listeners.btnStart.click[listeners.btnStart.click.length - 1];   // ResumeUI 가 먼저 받는 것
  let stopped = false;
  cap({ stopImmediatePropagation() { stopped = true; }, preventDefault() {} });
  if (nodes.runConfirm.hidden || !stopped) throw new Error('[게임 시작] 에 확인창이 없다');
  (listeners.btnConfirmCancel.click || []).forEach(fn => fn({}));
  if (!nodes.runConfirm.hidden || LS.getItem(RS.KEY) == null) throw new Error('취소했는데 저장이 사라졌다');
  (listeners.btnNewRun.click || []).forEach(fn => fn({}));
  if (nodes.runConfirm.hidden) throw new Error('[새 판] 에 확인창이 없다');
  (listeners.btnConfirmNew.click || []).forEach(fn => fn({}));
  if (LS.getItem(RS.KEY) != null || !nodes.resumeCard.hidden) throw new Error('새 판 시작인데 저장이 남았다');
});

check('다른 탭이 같은 저장에 쓰면(storage 이벤트) 이 탭은 저장을 멈추고 알린다', () => {
  richRun();
  nodes.runNotice.hidden = true;
  (listeners.__window.storage || []).forEach(fn => fn({ key: RS.KEY, newValue: '{}' }));
  if (!RS.blocked || nodes.runNotice.hidden || String(nodes.runNoticeText.textContent).indexOf('다른 탭') < 0) throw new Error('못 알아챘다');
  RS.clear();
  RPD.bus.emit('wave:started', RPD.WaveManager.plan);
  if (LS.getItem(RS.KEY) != null) throw new Error('멈췄는데 또 저장했다');
  RS.blocked = false; nodes.runNotice.hidden = true;
});

check('자동 저장을 끄면(RPD.Config.autosave = false — 자동 플레이 · 검사) 저장이 안 생긴다', () => {
  RS.clear(); RPD.Config.autosave = false;
  try {
    RPD.Game.restart(); RPD.Game.startRun('NORMAL', 'NORMAL'); tick(20);
    RPD.bus.emit('wave:started', RPD.WaveManager.plan);
    if (LS.getItem(RS.KEY) != null) throw new Error('꺼졌는데 저장했다');
  } finally { RPD.Config.autosave = true; }
  const ap = fs.readFileSync(path.join(ROOT, 'tools/autoplay.js'), 'utf8');
  if (!/Config\.autosave\s*=\s*false/.test(ap)) throw new Error('tools/autoplay.js 가 자동 저장을 끄지 않는다');
});

check('판 상태를 가진 매니저(RPD 의 *Manager 중 reset/init 있는 것)는 saveState · loadState 가 있거나 NOT_SAVED 에 이유가 있다', () => {
  const miss = Object.keys(RPD).filter(k => /Manager$/.test(k) && RPD[k] && (typeof RPD[k].reset === 'function' || typeof RPD[k].init === 'function'))
    .filter(k => !(typeof RPD[k].saveState === 'function' && typeof RPD[k].loadState === 'function') && !(RS.NOT_SAVED[k] && RS.NOT_SAVED[k].length > 5));
  if (miss.length) throw new Error('저장도 이유도 없다: ' + miss.join(', '));
  const notListed = Object.keys(RPD).filter(k => /Manager$/.test(k) && typeof (RPD[k] || {}).saveState === 'function' && RS.ORDER.indexOf(k) < 0);
  if (notListed.length) throw new Error('saveState 가 있는데 RunSave.ORDER 에 없다: ' + notListed.join(', '));
});

/* ---------- 홈 화면 앱(모바일 ④ · 세션 71) ---------- */
console.log('\n홈 화면 앱 — 설치 · 새 버전 · 화면 켜짐 · 기록 옮기기');
const AUI = RPD.AppUI, PW = RPD.Pwa;
function withEnv(env, fn) {
  const was = { nav: sandbox.navigator, loc: sandbox.location, caches: sandbox.caches, mm: sandbox.matchMedia };
  Object.assign(sandbox, env);
  try { return fn(); } finally { Object.assign(sandbox, { navigator: was.nav, location: was.loc, caches: was.caches, matchMedia: was.mm }); }
}
const HTTPS = { location: { protocol: 'https:', hostname: 'x.github.io' }, caches: {}, matchMedia: () => ({ matches: false }) };

check('[앱으로 설치] — 크롬은 들고 있던 설치 창(prompt) · 아이폰은 "공유(□↑) → 홈 화면에 추가" 안내 시트 · 앱으로 실행 중이면 버튼 숨김', () => {
  let prompted = 0;
  const r1 = withEnv(Object.assign({ navigator: { serviceWorker: {}, userAgent: 'Android Chrome' } }, HTTPS), () => {
    PW.installEvent = { prompt() { prompted += 1; } };
    return AUI.install();
  });
  if (r1 !== 'prompt' || prompted !== 1 || PW.installEvent) throw new Error('크롬 설치 창: ' + r1);
  nodes.installSheet.hidden = true;
  const r2 = withEnv(Object.assign({ navigator: { serviceWorker: {}, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari' } }, HTTPS), () => AUI.install());
  const steps = String(nodes.installSteps.innerHTML);
  if (r2 !== 'sheet' || nodes.installSheet.hidden || steps.indexOf('공유') < 0 || steps.indexOf('□↑') < 0 || steps.indexOf('홈 화면에 추가') < 0) throw new Error('아이폰 안내 시트: ' + steps.slice(0, 120));
  (listeners.btnInstallClose.click || []).forEach(fn => fn({}));
  if (!nodes.installSheet.hidden) throw new Error('닫기');
  withEnv(Object.assign({ navigator: { serviceWorker: {} }, matchMedia: q => ({ matches: /standalone/.test(q) }) }, { location: HTTPS.location, caches: {} }), () => {
    RPD.bus.emit('pwa:status', PW);
    if (!nodes.btnInstall.hidden) throw new Error('앱으로 실행 중인데 [앱으로 설치] 가 보인다');
  });
  RPD.bus.emit('pwa:status', PW);
});

check('설치 안내는 스스로 안 띄운다 — 첫 게임 오버 뒤 한 번만 작은 배너(두 번째 게임 오버엔 없음 · 앱 실행 중 · file:// 이면 없음)', () => {
  const SM = RPD.SaveManager;
  delete SM.data.settings.installNudged;
  nodes.installBanner.hidden = true;
  withEnv(Object.assign({ navigator: { serviceWorker: {} } }, HTTPS), () => {
    if (!nodes.installBanner.hidden) throw new Error('게임 오버 전에 배너');
    const over = w => { RPD.GameManager.setState(RPD.GameState.GAMEOVER); RPD.bus.emit('game:over', { wave: w }); };   // 실제 게임처럼 상태부터
    over(3);
    if (nodes.installBanner.hidden) throw new Error('첫 게임 오버에 배너가 없다');
    (listeners.btnBannerClose.click || []).forEach(fn => fn({}));
    over(4);
    if (!nodes.installBanner.hidden) throw new Error('두 번째에도 떴다');
  });
  delete SM.data.settings.installNudged;
  withEnv({ navigator: { serviceWorker: {} }, location: { protocol: 'file:', hostname: '' }, caches: {}, matchMedia: () => ({ matches: false }) }, () => {
    RPD.GameManager.setState(RPD.GameState.GAMEOVER); RPD.bus.emit('game:over', { wave: 3 });
    if (!nodes.installBanner.hidden) throw new Error('file:// 인데 배너');
  });
  SM.data.settings.installNudged = true;
});

check('새 버전 — "새 버전이 있어요 [새로고침]" · 판 도중이면 판이 끝날 때까지 미룬다 · 누르면 기다리던 서비스 워커에 SKIP_WAITING(자동 새로고침 없음)', () => {
  const GM = RPD.GameManager, S = RPD.GameState;
  nodes.updateToast.hidden = true; nodes.btnUpdate.hidden = true;
  RPD.Game.restart(); RPD.Game.startRun('NORMAL', 'NORMAL');
  if (GM.state !== S.RUNNING) throw new Error('전제');
  RPD.bus.emit('pwa:update', PW);
  if (!nodes.updateToast.hidden) throw new Error('판 도중에 토스트가 떴다');
  if (nodes.btnUpdate.hidden) throw new Error('[더보기] 에 새 버전 버튼이 없다');
  GM.setState(S.GAMEOVER); RPD.bus.emit('game:over', { wave: 5 });
  if (nodes.updateToast.hidden) throw new Error('판이 끝났는데 토스트가 없다');
  const posted = [];
  PW.waiting = { postMessage: m => posted.push(m) };
  (listeners.btnUpdateNow.click || []).forEach(fn => fn({}));
  if (!posted.length || posted[0].type !== 'SKIP_WAITING' || !PW._reloading) throw new Error('SKIP_WAITING: ' + JSON.stringify(posted));
  PW._reloading = false; PW.waiting = null;
  const src = fs.readFileSync(path.join(ROOT, 'js/core/Pwa.js'), 'utf8');
  if (!/controllerchange[\s\S]{0,120}_reloading/.test(src)) throw new Error('새로고침은 사람이 누른 뒤에만이어야');
  nodes.updateToast.hidden = true;
});

{
  // 비동기(요청이 Promise) — 결과를 모아 다음 검사에서 본다
  const GM = RPD.GameManager, S = RPD.GameState;
  const log = [];
  const sentinel = () => { const s = { released: false, fns: [], addEventListener(t, f) { s.fns.push(f); }, release() { s.released = true; log.push('release'); s.fns.forEach(f => f()); return Promise.resolve(); } }; return s; };
  const nav = { serviceWorker: {}, wakeLock: { request: t => { log.push('request:' + t); return Promise.resolve(sentinel()); } } };
  const was = sandbox.navigator;
  sandbox.navigator = nav;
  RPD.SaveManager.setSetting('wakeLock', true);
  RPD.Game.restart(); RPD.Loop.setPaused(false); RPD.Game.startRun('NORMAL', 'NORMAL');
  PW.syncWake();
  setImmediate(() => {
    const held1 = PW.wakeHeld();
    RPD.Loop.setPaused(true); GM.setState(S.PAUSED);
    const afterPause = PW.wakeHeld();
    RPD.Loop.setPaused(false); GM.setState(S.RUNNING);
    setImmediate(() => {
      const held2 = PW.wakeHeld();
      sandbox.document.hidden = true; ((listeners.__document || {}).visibilitychange || []).forEach(fn => fn({}));
      const afterHide = PW.wakeHeld();
      sandbox.document.hidden = false;
      PW.syncWake();
      setImmediate(() => {
        (listeners.btnWake.click || []).forEach(fn => fn({}));   // 끄기
        const afterOff = PW.wakeHeld(), savedOff = RPD.SaveManager.getSetting('wakeLock', true);
        (listeners.btnWake.click || []).forEach(fn => fn({}));   // 다시 켬
        sandbox.navigator = { serviceWorker: {} };                // 못 쓰는 기기
        let quiet = true; try { PW.syncWake(); } catch (e) { quiet = false; }
        sandbox.navigator = was;
        RPD.Loop.setPaused(true); GM.setState(S.PAUSED);
        check('화면 켜짐(Wake Lock) — 진행 중 청함 · 일시정지에 놓음 · 다시 진행에 청함 · 앱 이탈에 놓음 · [화면 켜짐] 끄면 놓고 저장 · 못 쓰는 기기는 조용히', () => {
          const bad = [];
          if (!held1) bad.push('진행 중인데 안 청함');
          if (afterPause) bad.push('일시정지인데 들고 있다');
          if (!held2) bad.push('다시 진행인데 안 청함');
          if (afterHide) bad.push('앱 이탈인데 들고 있다');
          if (afterOff || savedOff !== false) bad.push('끄기');
          if (!quiet) bad.push('못 쓰는 기기에서 오류');
          if (bad.length) throw new Error(bad.join(', ') + ' — ' + log.join(' '));
        });
        wakeDone();
      });
    });
  });
}
let wakeDone;
const wakePromise = new Promise(r => { wakeDone = r; });

check('기록 내보내기 → 다른 곳에서 가져오기 — 도감 · 칭호(클리어) · 발견한 주문이 옮겨진다 · 덮어쓰기 전에 확인', () => {
  const SM = RPD.SaveManager;
  SM.data.pokedex = { mew: { seen: true, best: 1 }, pikachu: { seen: true, best: 2 } };
  SM.data.clearsBy = { 'NORMAL:HARD': 3 }; SM.data.spells = { mewtwo_spell: 111 };
  (listeners.btnRecords.click || []).forEach(fn => fn({}));
  if (nodes.recordSheet.hidden) throw new Error('창이 안 열렸다');
  const text = nodes.recordExport.value;
  if (String(nodes.recordSummary.textContent).indexOf('도감 2종') < 0) throw new Error('요약: ' + nodes.recordSummary.textContent);
  // 다른 기기(빈 기록)에서 가져온다고 치자
  SM.data = JSON.parse(JSON.stringify(SM.data)); SM.data.pokedex = {}; SM.data.clearsBy = {}; SM.data.spells = {};
  nodes.recordImport.value = text;
  (listeners.btnRecordImport.click || []).forEach(fn => fn({}));
  if (nodes.recordConfirm.hidden || String(nodes.recordConfirmText.textContent).indexOf('덮어씁니다') < 0) throw new Error('확인이 없다');
  if (Object.keys(SM.data.pokedex).length) throw new Error('확인 전에 덮어썼다');
  (listeners.btnRecordCancel.click || []).forEach(fn => fn({}));
  if (Object.keys(SM.data.pokedex).length) throw new Error('취소했는데 바뀌었다');
  (listeners.btnRecordImport.click || []).forEach(fn => fn({}));
  (listeners.btnRecordOverwrite.click || []).forEach(fn => fn({}));
  if (!SM.data.pokedex.mew || SM.data.clearsBy['NORMAL:HARD'] !== 3 || SM.data.spells.mewtwo_spell !== 111) throw new Error('옮겨지지 않았다');
  if (JSON.parse(sandbox.localStorage.getItem(RPD.SAVE_KEY)).clearsBy['NORMAL:HARD'] !== 3) throw new Error('저장소에 안 남았다');
  (listeners.btnRecordClose.click || []).forEach(fn => fn({}));
});

check('기록 가져오기 검증 — 빈 글자 · 깨진 JSON · 다른 앱 · 더 새 버전 · 잘못된 형식은 거절하고 기록은 그대로', () => {
  const SM = RPD.SaveManager, before = JSON.stringify(SM.data);
  const cases = { EMPTY: '', JSON: '{"app":"porandi",', FORMAT: JSON.stringify({ app: 'other', kind: 'progress', version: 2, data: { version: 2 } }),
    VERSION: JSON.stringify({ app: 'porandi', kind: 'progress', version: 99, data: { version: 99 } }),
    FORMAT2: JSON.stringify({ app: 'porandi', kind: 'progress', version: 2, data: { version: 2, pokedex: [1, 2] } }) };
  const bad = Object.keys(cases).filter(k => { const r = SM.parseImport(cases[k]); return r.ok || r.reason !== k.replace(/\d$/, ''); });
  if (bad.length) throw new Error('못 거른 것: ' + bad.join(', '));
  nodes.recordImport.value = cases.VERSION; nodes.recordConfirm.hidden = true;
  (listeners.btnRecordImport.click || []).forEach(fn => fn({}));
  if (!nodes.recordConfirm.hidden || String(nodes.recordMsg.textContent).indexOf('더 새 게임') < 0) throw new Error('안내: ' + nodes.recordMsg.textContent);
  if (JSON.stringify(SM.data) !== before) throw new Error('거절했는데 기록이 바뀌었다');
  const old = SM.parseImport(JSON.stringify({ app: 'porandi', kind: 'progress', version: 1, data: { version: 1, pokedex: { mew: { seen: true } } } }));
  if (!old.ok || !old.data.totals || old.data.version !== 2) throw new Error('옛 버전(v1) 기록을 지금 형식으로 못 바꿨다');
});

/* ---------- 포켓몬 잠금 ---------- */
console.log('\n포켓몬 잠금 — 재료 · 주문 · 방출에서 빠진다');
function lockFresh() {
  MS.forceMobile = false;
  RPD.Config.autosave = false;
  RPD.Game.restart();
  RPD.Game.startRun('NORMAL', 'NORMAL');
  RPD.GameManager.gold = 99999; RPD.GameManager.life = 999;
  RPD.GameManager.setWave(30);
  RPD.FieldManager.init(); RPD.StorageManager.reset();
}
const LK_RECIPE = RPD.RecipeData.list.find(r => r.materials.length === 2 && r.materials.every(m => m !== 'ditto' && RPD.PokemonData.get(m).tier === 'T1' && RPD.PokemonData.get(m).summon) && r.materials[0] !== r.materials[1]);
function lkReady() { RPD.RecipeManager.refresh(); return RPD.RecipeManager.view.some(v => v.resultId === LK_RECIPE.id && v.ready); }
function lkView() { RPD.RecipeManager.refresh(); return RPD.RecipeManager.view.find(v => v.resultId === LK_RECIPE.id); }

check('잠근 포켓몬은 조합 재료로 안 쓰인다 — 재료가 있어도 조합이 안 된다 · 잠금을 풀면 다시 쓰인다', () => {
  lockFresh();
  const a = RPD.UnitManager.create(LK_RECIPE.materials[0]), b = RPD.UnitManager.create(LK_RECIPE.materials[1]);
  RPD.FieldManager.place(0, a); RPD.StorageManager.add(b);
  RPD.UnitManager.setLocked(b, true);
  if (lkReady()) throw new Error('잠근 재료로 완성 가능으로 뜬다');
  const r = RPD.RecipeManager.craft(LK_RECIPE.id);
  if (r.ok) throw new Error('잠근 재료로 조합이 됐다');
  if (RPD.StorageManager.units.indexOf(b) < 0 || !RPD.FieldManager.getAllUnits().includes(a)) throw new Error('실패했는데 재료가 사라졌다');
  if (RPD.RecipeManager.craftBest().ok) throw new Error('[조합](craftBest)이 잠근 재료를 골랐다');
  RPD.UnitManager.setLocked(b, false);
  if (!lkReady()) throw new Error('잠금을 풀었는데 다시 안 쓰인다');
  const ok = RPD.RecipeManager.craft(LK_RECIPE.id);
  if (!ok.ok) throw new Error('잠금 해제 뒤 조합 실패: ' + ok.reason);
});

check('조합 결과는 잠기지 않는다 — 재료의 잠금을 물려받지 않는다(잠그지 않은 재료만 쓰이므로 결과도 새 개체)', () => {
  lockFresh();
  const a = RPD.UnitManager.create(LK_RECIPE.materials[0]), b = RPD.UnitManager.create(LK_RECIPE.materials[1]);
  const spare = RPD.UnitManager.create(LK_RECIPE.materials[0]);
  RPD.FieldManager.place(0, a); RPD.FieldManager.place(1, b); RPD.StorageManager.add(spare);
  RPD.UnitManager.setLocked(spare, true);     // 같은 종을 하나 더 잠가 둔다 — 이건 안 쓰여야 한다
  RPD.RecipeManager.refresh();
  const r = RPD.RecipeManager.craft(LK_RECIPE.id);
  if (!r.ok) throw new Error('조합 실패 ' + r.reason);
  const res = RPD.FieldManager.getAllUnits().concat(RPD.StorageManager.units).filter(u => u.defId === LK_RECIPE.id);
  if (res.length !== 1 || res[0].locked) throw new Error('결과가 잠겨 있다/없다: ' + res.map(u => u.locked));
  if (!RPD.StorageManager.units.includes(spare) || !spare.locked) throw new Error('잠근 여분이 소모되거나 잠금이 풀렸다');
});

check('재료 집계는 잠근 개체를 뺀다 — "0/1 🔒1" 로 잠금 때문에 모자란 것을 알린다', () => {
  lockFresh();
  const a = RPD.UnitManager.create(LK_RECIPE.materials[0]), b = RPD.UnitManager.create(LK_RECIPE.materials[1]);
  RPD.FieldManager.place(0, a); RPD.StorageManager.add(b);
  RPD.UnitManager.setLocked(b, true);
  const cs = RPD.RecipeManager.countsOf();
  if ((cs.usable[b.defId] || 0) !== 0 || cs.locked[b.defId] !== 1) throw new Error('집계: ' + JSON.stringify(cs));
  const v = lkView();
  const m = v.materials.find(x => x.id === b.defId);
  if (m.owned || m.lockedShort !== 1 || v.lockedShortCount !== 1) throw new Error('view: ' + JSON.stringify(m));
  RPD.bus.emit('field:changed', {});
  clickTab('all');
  const html = panelHtml('recipeList');
  if (html.indexOf('rmat__lk') < 0 || html.indexOf('🔒1') < 0) throw new Error('조합식 줄에 "🔒1" 이 없다');
  RPD.UnitManager.setLocked(b, false);
  RPD.bus.emit('field:changed', {});
  if (panelHtml('recipeList').indexOf('🔒1</span>') >= 0 && lkView().lockedShortCount) throw new Error('잠금을 풀었는데 표시가 남았다');
});

check('잠근 메타몽은 대신하지 않는다 — 풀면 대신한다', () => {
  lockFresh();
  const a = RPD.UnitManager.create(LK_RECIPE.materials[0]), d = RPD.UnitManager.create('ditto');
  RPD.FieldManager.place(0, a); RPD.StorageManager.add(d);
  RPD.UnitManager.setLocked(d, true);
  if (lkReady()) throw new Error('잠근 메타몽이 재료를 대신했다');
  if (RPD.RecipeManager.craft(LK_RECIPE.id).ok) throw new Error('잠근 메타몽으로 조합됐다');
  RPD.UnitManager.setLocked(d, false);
  if (!lkReady()) throw new Error('풀었는데 메타몽이 대신하지 않는다');
});

check('잠근 포켓몬은 주문 재료로도 안 쓰인다(check · cast) — 풀면 외칠 수 있다', () => {
  lockFresh();
  RPD.SaveManager.data.spells = {};
  const sp = RPD.SpellData.forResult('pikachu');
  const us = sp.materials.map(id => RPD.UnitManager.create(id));
  us.forEach(u => RPD.StorageManager.add(u));
  RPD.UnitManager.setLocked(us[0], true);
  const c = RPD.SpellManager.check(sp);
  if (c.ok) throw new Error('잠근 재료로 주문이 가능하다고 나온다');
  const r = RPD.SpellManager.cast(sp.phrase);
  if (r.ok) throw new Error('잠근 재료로 주문이 걸렸다');
  if (RPD.StorageManager.units.length !== us.length) throw new Error('실패했는데 재료가 사라졌다');
  RPD.UnitManager.setLocked(us[0], false);
  if (!RPD.SpellManager.cast(sp.phrase).ok) throw new Error('풀었는데 주문이 안 걸린다');
  const res = RPD.FieldManager.getAllUnits().concat(RPD.StorageManager.units).filter(u => u.defId === 'pikachu');
  if (res.length !== 1 || res[0].locked) throw new Error('주문 결과가 잠겨 있다');
});

check('잠근 포켓몬은 방출할 수 없다 — 필드 · 창고 · 버튼(잠금 해제 후 방출)', () => {
  lockFresh();
  const f = RPD.UnitManager.create('pidgey'), s = RPD.UnitManager.create('rattata');
  RPD.FieldManager.place(0, f); RPD.StorageManager.add(s);
  RPD.UnitManager.setLocked(f, true); RPD.UnitManager.setLocked(s, true);
  const gold = RPD.GameManager.gold;
  if (RPD.EconomyManager.sell(0) !== 0 || !RPD.FieldManager.getAllUnits().includes(f)) throw new Error('잠근 필드 개체가 팔렸다');
  if (RPD.EconomyManager.sellStored(0) !== 0 || !RPD.StorageManager.units.includes(s)) throw new Error('잠근 창고 개체가 팔렸다');
  if (RPD.GameManager.gold !== gold) throw new Error('골드가 바뀌었다');
  RPD.FieldManager.select(0);
  RPD.UIManager.refreshActionButtons && RPD.UIManager.refreshActionButtons();
  RPD.bus.emit('field:changed', {});
  if (!nodes.btnSell.disabled) throw new Error('[방출] 버튼이 안 잠겼다');
  if (String(nodes.sellValue.textContent).indexOf('잠금 해제 후 방출') < 0) throw new Error('안내 글: ' + nodes.sellValue.textContent);
  RPD.UnitManager.setLocked(f, false);
  if (RPD.EconomyManager.sell(0) <= 0) throw new Error('잠금을 풀었는데 못 판다');
});

check('잠금은 이동 · 창고 · 배치 · 강화 · 다시 계산을 거쳐도 남는다 — 이동 · 교체 · 강화는 그대로 된다', () => {
  lockFresh();
  const u = RPD.UnitManager.create('pidgey');
  RPD.FieldManager.place(0, u);
  RPD.UnitManager.setLocked(u, true);
  RPD.UnitManager.recomputeAll();
  if (!u.locked) throw new Error('recompute 뒤 잠금이 풀렸다');
  if (!RPD.StorageManager.store(0).ok || !u.locked) throw new Error('창고로 보낸 뒤 잠금이 풀렸다');
  const d = RPD.StorageManager.deploy(RPD.StorageManager.units.indexOf(u), 1);
  if (!d.ok || !u.locked || RPD.FieldManager.get(1).unit !== u) throw new Error('배치가 안 되거나 잠금이 풀렸다');
  const other = RPD.UnitManager.create('rattata'); RPD.FieldManager.place(2, other);
  const mv = RPD.FieldManager.move ? RPD.FieldManager.move(1, 3) : null;   // 빈 칸으로 옮기기
  if (mv && mv.ok === false) throw new Error('잠근 개체가 안 옮겨진다');
  const lv = u.level;
  const up = RPD.EconomyManager.upgrade(RPD.FieldManager.slots.find(s => s.unit === u).index);
  if (!up.ok || u.level !== lv + 1 || !u.locked) throw new Error('잠근 개체 강화: ' + JSON.stringify(up));
  const back = RPD.UnitManager.revive(RPD.UnitManager.serialize(u));
  if (!back.locked) throw new Error('저장 · 복원(serialize/revive) 뒤 잠금이 풀렸다');
  const plain = RPD.UnitManager.serialize(RPD.UnitManager.create('pidgey'));
  if ('locked' in plain) throw new Error('안 잠근 개체의 저장본에 locked 가 남는다(옛 저장과 같은 모양이어야 한다)');
  if (RPD.UnitManager.revive(plain).locked) throw new Error('옛 저장본이 잠겨 불러와진다');
});

check('판 이어하기 — 잠금이 저장 · 복원된다(필드 · 창고)', () => {
  lockFresh();
  RPD.Config.autosave = true; RS.blocked = false;
  RPD.Game.restart(); RPD.Game.startRun('NORMAL', 'NORMAL');
  RPD.GameManager.life = 999;
  const f = RPD.UnitManager.create('pidgey'), s = RPD.UnitManager.create('rattata');
  // 0번 칸이 아니라 빈 칸에 — 판 시작 때 받은 흔함(구구일 수 있다)이 0번에 앉으면 place 가 실패해 가끔 떨어졌다(세션 82)
  if (!RPD.FieldManager.place(RPD.FieldManager.firstEmpty().index, f)) throw new Error('빈 칸에 못 두었다');
  RPD.StorageManager.add(s);
  RPD.UnitManager.setLocked(f, true); RPD.UnitManager.setLocked(s, true);
  RPD.bus.emit('wave:started', RPD.WaveManager.plan);
  const r = RS.read();
  RPD.Config.autosave = false;
  if (!r.ok) throw new Error('저장이 안 됐다: ' + r.reason);
  RS.restore(r.data);
  RS.pending = null;
  // 판 시작 때 무작위로 받는 흔함이 같은 종(구구 · 꼬렛)일 수 있다 — "그 종 중 잠긴 개체가 하나 있는가"로 본다(세션 78: find 가 받은 개체를 집어 가끔 떨어졌다)
  const fl = RPD.FieldManager.getAllUnits().filter(u => u.defId === 'pidgey'), sl = RPD.StorageManager.units.filter(u => u.defId === 'rattata');
  if (fl.filter(u => u.locked).length !== 1) throw new Error('필드 개체의 잠금이 안 돌아왔다 — ' + JSON.stringify(RPD.FieldManager.slots.filter(x => x.unit).map(x => x.index + ':' + x.unit.defId + (x.unit.locked ? 'L' : ''))) + ' saved ' + JSON.stringify(r.data.state.FieldManager.units.map(e => e.slot + ':' + e.unit.defId + (e.unit.locked ? 'L' : ''))));
  if (sl.filter(u => u.locked).length !== 1) throw new Error('창고 개체의 잠금이 안 돌아왔다');
  RS.clear();
});

check('잠금 버튼 · L 단축키 — 고른 칸의 잠금을 뒤집고 버튼 글이 [잠금]/[잠금 해제] 로 바뀐다', () => {
  lockFresh();
  const u = RPD.UnitManager.create('pidgey');
  RPD.FieldManager.place(0, u);
  RPD.FieldManager.select(0);
  RPD.bus.emit('field:changed', {});
  if (nodes.btnLock.disabled) throw new Error('칸을 골랐는데 [잠금] 이 꺼져 있다');
  if (nodes.lockName.textContent !== '잠금') throw new Error('처음 글: ' + nodes.lockName.textContent);
  click('btnLock');
  if (!u.locked || nodes.lockName.textContent !== '잠금 해제') throw new Error('눌렀는데 안 잠긴다/글 안 바뀐다');
  click('btnLock');
  if (u.locked || nodes.lockName.textContent !== '잠금') throw new Error('다시 눌렀는데 안 풀린다');
  RPD.FieldManager.select(-1);
  RPD.bus.emit('field:changed', {});
  if (!nodes.btnLock.disabled) throw new Error('칸을 안 골랐는데 [잠금] 이 켜져 있다');
});

check('L 단축키가 다른 단축키와 겹치지 않는다(HOTKEYS · 방출 X · 배치 F 와 별개)', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'ui', 'HudPanels.js'), 'utf8');
  const hk = src.match(/var HOTKEYS = \{([\s\S]*?)\};/);
  if (!hk) throw new Error('HOTKEYS 를 못 찾았다');
  if (/['"]l['"]\s*:/.test(hk[1])) throw new Error('HOTKEYS 에 이미 l 이 있다');
  if ((src.match(/key === 'l'/g) || []).length !== 1) throw new Error("key === 'l' 분기가 한 곳이 아니다");
});

check('필드의 잠근 포켓몬과 보유 칸에 🔒 가 뜬다 · 정보 바 [잠금] 버튼(휴대폰)', () => {
  lockFresh();
  const u = RPD.UnitManager.create('pidgey'), s = RPD.UnitManager.create('rattata');
  RPD.FieldManager.place(0, u); RPD.StorageManager.add(s);
  RPD.UnitManager.setLocked(s, true);
  RPD.bus.emit('storage:changed', RPD.StorageManager.units);
  RPD.bus.emit('field:changed', {});
  if (panelHtml('storageList').indexOf('scell__lock') < 0) throw new Error('보유 칸에 🔒 가 없다');
  RPD.UnitManager.setLocked(s, false);
  RPD.bus.emit('field:changed', {});
  if (panelHtml('storageList').indexOf('scell__lock') >= 0) throw new Error('풀었는데 🔒 가 남았다(캐시)');
  MS.forceMobile = true;
  RPD.FieldManager.select(0);
  RPD.bus.emit('field:changed', {});
  MS.renderBar();
  const bar = panelHtml('infoBar');
  MS.forceMobile = false;
  if (bar.indexOf('data-ib="lock"') < 0) throw new Error('정보 바에 [잠금] 이 없다');
});

/* ---------- 일괄 창고로 ---------- */
console.log('\n일괄 창고로 — 등급별로 필드 → 창고');
const BK = { sm: RPD.StorageManager, F: RPD.FieldManager, PD: RPD.PokemonData };
function bkFresh(cap) {
  MS.forceMobile = false;
  RPD.Config.autosave = false;
  RPD.Game.restart(); RPD.Game.startRun('NORMAL', 'NORMAL');
  RPD.GameManager.life = 999; RPD.GameManager.setWave(30);
  BK.F.init(); BK.sm.reset();
  BK.F.slots.forEach(sl => { if (!sl.blocked) sl.unlocked = true; });
  if (cap != null) BK.sm.capacity = cap;
}
function bkPut(defId, n, opt) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const sl = BK.F.slots.find(x => x.unlocked && !x.blocked && !x.unit);
    if (!sl) throw new Error('필드 칸이 모자란다(검사 준비)');
    const u = RPD.UnitManager.create(defId);
    if (opt && opt.dps != null) u.dps = opt.dps + i;
    BK.F.place(sl.index, u); out.push(u);
  }
  RPD.UnitManager.recomputeAll();
  return out;
}
const bkOf = t => BK.PD.list.find(d => d.tier === t && !d.hidden && d.id !== 'ditto').id;
const BK_HIDDEN = BK.PD.list.find(d => d.hidden && ['T3', 'T4', 'T5'].includes(d.tier)) || BK.PD.list.find(d => d.hidden);
function bkTotal() { return BK.F.getAllUnits().length + BK.sm.units.length; }
function bkGroup(id) { return BK.sm.bulkGroups().find(g => g.id === id); }

check('선택한 등급만 창고로 간다 — 다른 등급은 필드에 그대로', () => {
  bkFresh(30);
  bkPut(bkOf('T1'), 3); bkPut(bkOf('T2'), 2); bkPut(bkOf('T3'), 1);
  const before = bkTotal();
  const r = BK.sm.bulkStore(['T1']);
  if (r.moved !== 3 || r.noRoom !== 0) throw new Error('결과 ' + JSON.stringify(r));
  if (BK.sm.units.some(u => u.def.tier !== 'T1') || BK.sm.units.length !== 3) throw new Error('T1 만 가야 한다');
  if (BK.F.getAllUnits().filter(u => u.def.tier === 'T1').length) throw new Error('T1 이 필드에 남았다');
  if (BK.F.getAllUnits().length !== 3 || bkTotal() !== before) throw new Error('다른 등급이 움직였거나 총수가 바뀌었다');
  const two = BK.sm.bulkStore(['T2', 'T3']);
  if (two.moved !== 3 || BK.F.getAllUnits().length) throw new Error('여러 칸 선택 ' + JSON.stringify(two));
});

check('히든은 [히든] 칸에만 — 자기 강함 등급 칸에는 안 들어간다(골드 상점과 같은 규칙) · 불멸 · 초월은 [불멸 · 초월] 칸', () => {
  bkFresh(30);
  const h = bkPut(BK_HIDDEN.id, 1)[0];
  const tierId = BK_HIDDEN.tier;
  bkPut(bkOf(tierId === 'T5' ? 'T5' : tierId), 1);
  if (bkGroup('HIDDEN').count !== 1 || bkGroup(tierId).count !== 1) throw new Error('칸 개수: 히든 ' + bkGroup('HIDDEN').count + ' · ' + tierId + ' ' + bkGroup(tierId).count);
  const r = BK.sm.bulkStore([tierId]);
  if (r.moved !== 1 || BK.sm.units.some(u => u === h)) throw new Error('히든이 강함 등급 칸으로 갔다');
  const r2 = BK.sm.bulkStore(['HIDDEN']);
  if (r2.moved !== 1 || !BK.sm.units.includes(h)) throw new Error('[히든] 칸으로 안 갔다');
  bkPut('mew', 1); bkPut('mewtwo_transcend', 1);
  if (bkGroup('SPECIAL').count !== 2 || bkGroup('T5').count !== 0) throw new Error('불멸 · 초월 칸 ' + bkGroup('SPECIAL').count);
  if (BK.sm.bulkStore(['T5']).moved !== 0) throw new Error('[전설] 칸이 불멸을 보냈다');
  if (BK.sm.bulkStore(['SPECIAL']).moved !== 2) throw new Error('[불멸 · 초월] 칸');
});

check('잠근 유닛은 건너뛴다 — "잠금 N마리 제외"로 센다', () => {
  bkFresh(30);
  const us = bkPut(bkOf('T1'), 4);
  RPD.UnitManager.setLocked(us[0], true); RPD.UnitManager.setLocked(us[1], true);
  const g = bkGroup('T1');
  if (g.count !== 2 || g.locked !== 2) throw new Error('칸: ' + g.count + '/' + g.locked);
  const r = BK.sm.bulkStore(['T1']);
  if (r.moved !== 2 || r.locked !== 2) throw new Error(JSON.stringify(r));
  if (!BK.F.getAllUnits().includes(us[0]) || !BK.F.getAllUnits().includes(us[1])) throw new Error('잠근 유닛이 움직였다');
});

check('창고 자리가 모자라면 들어가는 만큼만(약한 것부터) 보내고 유닛 총수는 그대로', () => {
  bkFresh(2);
  const us = bkPut(bkOf('T1'), 5, { dps: 100 });
  us.forEach((u, i) => { u.dps = 100 + (4 - i) * 10; });   // 먼저 놓인 것이 가장 강하다 — 놓은 순서가 아니라 DPS 순이어야 한다
  const total = bkTotal();
  const r = BK.sm.bulkStore(['T1']);
  if (r.moved !== 2 || r.noRoom !== 3) throw new Error(JSON.stringify(r));
  if (bkTotal() !== total || BK.F.getAllUnits().length !== 3 || BK.sm.units.length !== 2) throw new Error('총수 ' + bkTotal() + ' / ' + total);
  if (!BK.sm.units.includes(us[4]) || !BK.sm.units.includes(us[3])) throw new Error('약한 것부터 가야 한다: ' + BK.sm.units.map(u => u.dps));
  const again = BK.sm.bulkStore(['T1']);
  if (again.moved !== 0 || again.noRoom !== 3 || bkTotal() !== total) throw new Error('가득 찬 창고에 또 보냈다 ' + JSON.stringify(again));
});

check('일괄 창고로는 되돌리기 한 건 — 한 번에 원복', () => {
  bkFresh(30);
  RPD.UndoManager.reset();
  const us = bkPut(bkOf('T1'), 4);
  const slots = us.map(u => u.slotIndex);
  BK.sm.bulkStore(['T1']);
  if (RPD.UndoManager.count() !== 1) throw new Error('기록 ' + RPD.UndoManager.count() + '건 — 1건이어야 한다');
  const r = RPD.UndoManager.undo();
  if (!r.ok) throw new Error('되돌리기 실패 ' + r.reason);
  if (BK.sm.units.length !== 0 || BK.F.getAllUnits().length !== 4) throw new Error('한 번에 원복이 안 됐다');
  if (!us.every(u => BK.F.getAllUnits().includes(u))) throw new Error('같은 개체가 아니다');
  if (RPD.UndoManager.count() !== 0) throw new Error('원복 뒤 기록이 남았다');
});

check('선택 창 — 등급마다 "필드 N마리" · 잠금 제외 표시 · 전설 · 히든 · 불멸 · 초월은 한 번 확인 · 일반은 바로', () => {
  bkFresh(30);
  const us = bkPut(bkOf('T1'), 3); RPD.UnitManager.setLocked(us[0], true);
  bkPut(bkOf('T5'), 1);
  const UIB = RPD.BulkStoreUI, ov = nodes.bulkOverlay;
  click('btnBulkStore');
  if (ov.hidden) throw new Error('[일괄 창고로] 를 눌렀는데 창이 안 열린다');
  const html = panelHtml('bulkList');
  ['흔함', '안흔함', '특별함', '희귀함', '전설', '히든', '불멸'].forEach(w => { if (html.indexOf(w) < 0) throw new Error('칸 없음: ' + w); });
  if (html.indexOf('필드 3마리') < 0 || html.indexOf('잠금 1마리 제외') < 0) throw new Error('개수 · 잠금 표시 없음');
  UIB.picked = { T1: true }; UIB.render();
  click('btnBulkSend');
  if (!ov.hidden === false && BK.sm.units.length !== 2) throw new Error('흔함만 골랐는데 바로 안 보냈다');
  if (BK.sm.units.length !== 2) throw new Error('흔함 2마리가 안 갔다: ' + BK.sm.units.length);
  if (String(UIB.lastMessage).indexOf('흔함 2마리를 창고로 보냈어요') < 0 || UIB.lastMessage.indexOf('잠금 1마리 제외') < 0) throw new Error('토스트: ' + UIB.lastMessage);
  click('btnBulkStore');
  UIB.picked = { T5: true }; UIB.render();
  click('btnBulkSend');
  if (BK.sm.units.length !== 2 || nodes.bulkConfirm.hidden) throw new Error('전설은 확인 없이 갔다');
  click('btnBulkNo');
  if (BK.sm.units.length !== 2 || !nodes.bulkConfirm.hidden) throw new Error('"아니요" 가 안 먹는다');
  click('btnBulkSend'); click('btnBulkYes');
  if (BK.sm.units.length !== 3) throw new Error('확인 뒤에도 안 갔다');
});

check('단일 [창고로] 버튼과 S 단축키는 그대로 · 일괄 창고로에 단축키를 새로 안 만들었다', () => {
  bkFresh(30);
  const u = bkPut(bkOf('T1'), 1)[0];
  BK.F.select(u.slotIndex);
  RPD.bus.emit('field:changed', {});
  click('btnStore');
  if (BK.sm.units.length !== 1 || BK.F.getAllUnits().length !== 0) throw new Error('단일 [창고로] 가 달라졌다');
  if (RPD.UndoManager.count() < 1) throw new Error('단일 이동 기록이 안 남는다');
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'ui', 'HudPanels.js'), 'utf8');
  if (/BulkStore/.test(src)) throw new Error('HudPanels 에 일괄 창고로 단축키가 생겼다');
});

/* ---------- 창고 고정 칸(세션 76 — 골드 확장 삭제) ---------- */
console.log('\n창고 고정 칸 — 골드 확장 없음');
check('창고 용량은 새 판에서 Config.storageBase(36) — 확장 함수 · 설정값 · 버튼이 없다', () => {
  MS.forceMobile = false; RPD.Config.autosave = false;
  RPD.Game.restart(); RPD.Game.startRun('NORMAL', 'NORMAL');
  const SG = RPD.StorageManager, C = RPD.Config;
  if (C.storageBase !== 36 || SG.capacity !== C.storageBase) throw new Error('용량 ' + SG.capacity + ' / storageBase ' + C.storageBase);
  ['expand', 'canExpand', 'expandCost'].forEach(f => { if (typeof SG[f] === 'function') throw new Error('StorageManager.' + f + ' 가 남아 있다'); });
  ['storageStep', 'storageMax', 'storageExpandCost', 'storageExpandGrowth'].forEach(k => { if (k in C) throw new Error('Config.' + k + ' 가 남아 있다'); });
  const html = require('fs').readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
  if (/btnExpandStorage/.test(html)) throw new Error('index.html 에 [창고 확장] 버튼이 남아 있다');
  if (nodes.btnExpandStorage) throw new Error('화면에 [창고 확장] 버튼이 있다');
  RPD.GameManager.gold = 99999;
  const gold = RPD.GameManager.gold;
  RPD.bus.emit('storage:changed', SG.units);
  if (SG.capacity !== C.storageBase || RPD.GameManager.gold !== gold) throw new Error('골드로 용량이 바뀌었다');
});

check('창고가 가득 차야 소환이 막힌다 — 필드가 가득 차도 창고에 한 칸이라도 있으면 소환된다', () => {
  MS.forceMobile = false; RPD.Config.autosave = false;
  RPD.Game.restart(); RPD.Game.startRun('NORMAL', 'NORMAL');
  const F = RPD.FieldManager, SG = RPD.StorageManager, GM = RPD.GameManager;
  GM.gold = 99999; GM.life = 999;
  F.slots.forEach(sl => { if (!sl.blocked) sl.unlocked = true; });
  F.slots.forEach(sl => { if (sl.unlocked && !sl.blocked && !sl.unit) F.place(sl.index, RPD.UnitManager.create('pidgey')); });
  if (F.firstEmpty()) throw new Error('필드가 안 찼다(검사 준비)');
  while (SG.units.length < SG.capacity - 1) SG.add(RPD.UnitManager.create('rattata'));
  const r = RPD.SummonManager.summon();
  if (!r.ok || SG.units.length !== SG.capacity) throw new Error('창고에 한 칸 남았는데 소환이 안 된다: ' + JSON.stringify(r));
  const gold = GM.gold;
  const r2 = RPD.SummonManager.summon();
  if (r2.ok || r2.reason !== 'NO_ROOM') throw new Error('창고가 가득 찼는데 소환됐다/이유: ' + JSON.stringify(r2));
  if (GM.gold !== gold) throw new Error('막힌 소환에 골드가 나갔다');
  SG.removeAt(0);
  if (!RPD.SummonManager.summon().ok) throw new Error('한 칸 비웠는데도 소환이 안 된다');
});

check('이어하기 — 옛 저장(용량 14)은 새 기본값으로 올려 불러온다 · 더 큰 저장 값은 그대로(max)', () => {
  const SG = RPD.StorageManager, base = RPD.Config.storageBase;
  SG.loadState({ capacity: 14, units: [] });
  if (SG.capacity !== base) throw new Error('옛 저장 14 → ' + SG.capacity + ' (기대 ' + base + ')');
  SG.loadState({ capacity: 40, units: [] });
  if (SG.capacity !== 40) throw new Error('더 큰 값이 줄었다: ' + SG.capacity);
  SG.loadState({ units: [] });
  if (SG.capacity !== base) throw new Error('용량이 없는 저장 → ' + SG.capacity);
  SG.reset();
});

/* ---------- 시너지 — 서로 다른 종 기준(세션 77) ---------- */
console.log('\n시너지 — 서로 다른 종 기준');
function synFresh() {
  MS.forceMobile = false; RPD.Config.autosave = false;
  RPD.Game.restart(); RPD.Game.startRun('NORMAL', 'NORMAL');
  RPD.GameManager.life = 999;
  RPD.FieldManager.init(); RPD.StorageManager.reset();
  RPD.FieldManager.slots.forEach(sl => { if (!sl.blocked) sl.unlocked = true; });
}
function synPut(id, n) {
  const out = [];
  for (let i = 0; i < (n || 1); i++) {
    const sl = RPD.FieldManager.slots.find(x => x.unlocked && !x.blocked && !x.unit);
    const u = RPD.UnitManager.create(id); RPD.FieldManager.place(sl.index, u); out.push(u);
  }
  RPD.UnitManager.recomputeAll();
  return out;
}
const SY = RPD.SynergyManager;
const syn = typeId => SY.active.find(a => a.typeId === typeId);

check('구구 2마리 = 비행 1 · 구구 + 피죤 = 비행 2 — 종 기준', () => {
  synFresh();
  synPut('pidgey', 2);
  if (SY.countOf('FLYING') !== 1) throw new Error('구구 2마리 비행 = ' + SY.countOf('FLYING') + ' (기대 1)');
  if (SY.unitCountOf('FLYING') !== 2) throw new Error('마리 수 ' + SY.unitCountOf('FLYING'));
  if (SY.bonus.attackSpeedMul !== 1) throw new Error('비행 1종인데 시너지가 켜졌다(공속 ' + SY.bonus.attackSpeedMul + ')');
  synPut('pidgeotto', 1);
  if (SY.countOf('FLYING') !== 2) throw new Error('구구 + 피죤 비행 = ' + SY.countOf('FLYING') + ' (기대 2)');
  if (!(SY.bonus.attackSpeedMul > 1) || !syn('FLYING') || syn('FLYING').tierIndex < 0) throw new Error('비행 2종이면 켜져야 한다');
});

check('이중 타입은 두 타입 모두 +1 — 노말·비행 구구 → 노말 1 · 비행 1', () => {
  synFresh();
  synPut('pidgey', 1);
  if (SY.countOf('NORMAL') !== 1 || SY.countOf('FLYING') !== 1) throw new Error('노말 ' + SY.countOf('NORMAL') + ' / 비행 ' + SY.countOf('FLYING'));
  synPut('pidgey', 1);
  if (SY.countOf('NORMAL') !== 1 || SY.countOf('FLYING') !== 1) throw new Error('같은 종을 더 올렸는데 늘었다');
});

check('같은 종은 강화 레벨 · 잠금 · 위치가 달라도 1종 — 다른 종(초월 폼 포함)은 따로 센다', () => {
  synFresh();
  const [a, b, c] = synPut('pidgey', 3);
  a.level = 3; RPD.UnitManager.setLocked(b, true);
  RPD.UnitManager.recomputeAll();
  if (SY.countOf('FLYING') !== 1) throw new Error('레벨 · 잠금이 달라 다른 종으로 셌다: ' + SY.countOf('FLYING'));
  synFresh();
  synPut('charizard', 1); synPut('charizard_transcend', 1);
  if (SY.countOf('FIRE') !== 2) throw new Error('초월 폼은 다른 종: 불꽃 ' + SY.countOf('FIRE') + ' (기대 2)');
  const t = RPD.PokemonData.get('charizard_transcend');
  if (!t || t.types.indexOf('FIRE') < 0) throw new Error('초월 리자몽 타입');
});

check('임계값은 조정안 B — 상위 단계 −1 · 독 · 노말 첫 단계 2(세션 77)', () => {
  const want = { FIRE: [2, 3], WATER: [2, 3], ELECTRIC: [2, 3], GROUND: [2, 3], FLYING: [2, 3, 5], FIGHTING: [2, 3], GRASS: [2, 3], POISON: [2, 5, 8],
    BUG: [2, 3, 5], NORMAL: [2, 5, 8], PSYCHIC: [2, 3, 5], ROCK: [2, 3], ICE: [2, 3], GHOST: [2, 3], DRAGON: [2, 3], STEEL: [2], FAIRY: [2, 3] };
  const bad = Object.keys(want).filter(t => RPD.Synergies[t].map(x => x.count).join() !== want[t].join());
  if (bad.length || Object.keys(RPD.Synergies).length !== Object.keys(want).length) throw new Error('다른 임계값: ' + bad.join(', '));
  synFresh();
  synPut('pidgey', 1); synPut('pidgeotto', 1);
  if (SY.countOf('FLYING') !== 2 || SY.bonus.attackSpeedMul <= 1) throw new Error('비행 2종이면 켜져야 한다');
  synPut('pidgeot', 1);
  if (syn('FLYING').tierIndex !== 1) throw new Error('비행 3종은 2단계: ' + syn('FLYING').tierIndex);
});

check('보유 창 [타입별] 머리도 종 기준 — "필드 1종 · 1/2종" · "구구 ×2는 1종으로" (패널 · 실제 시너지와 같은 셈)', () => {
  synFresh();
  synPut('pidgey', 2);
  const l = listeners.ownedSort && listeners.ownedSort.click;
  if (!l || !l.length) throw new Error('#ownedSort 에 click 핸들러가 없다');
  const btn = { dataset: { sort: 'type' }, classList: { add() {}, remove() {}, toggle() {} }, closest: () => btn, parentNode: nodes.ownedSort };
  l.forEach(fn => fn({ target: btn }));
  RPD.bus.emit('storage:changed', RPD.StorageManager.units);
  RPD.bus.emit('field:changed', {});
  const html = panelHtml('storageList');
  const m = html.match(/typegroup__head[^>]*>(?:(?!typegroup__cells)[\s\S])*?<b>비행<\/b>([\s\S]*?)<\/div>/);
  if (!m) throw new Error('비행 묶음 머리가 없다');
  const head = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  if (head.indexOf('필드 1종') < 0 || head.indexOf('1/2종') < 0) throw new Error('머리: ' + head);
  if (head.indexOf('구구 ×2는 1종으로') < 0) throw new Error('중복 안내가 없다: ' + head);
  if (head.indexOf('필드 2') >= 0) throw new Error('아직 마리로 센다: ' + head);
  // 실제 시너지와 같은 값 — 패널 · 머리 · SynergyManager 가 어긋나지 않는다
  if (SY.countOf('FLYING') !== 1) throw new Error('시너지 수 ' + SY.countOf('FLYING'));
  synPut('pidgeotto', 1);
  RPD.bus.emit('field:changed', {});
  const m2 = panelHtml('storageList').match(/<b>비행<\/b>([\s\S]*?)<\/div>/);
  const head2 = m2[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  if (head2.indexOf('필드 2종') < 0) throw new Error('구구 + 피죤: ' + head2);
  l.forEach(fn => fn({ target: Object.assign(btn, { dataset: { sort: 'field' } }) }));
});

check('시너지 패널 — "비행 1/2" 와 "구구 ×2는 1종으로" 로 왜 안 켜졌는지 보인다', () => {
  synFresh();
  synPut('pidgey', 2);
  RPD.bus.emit('field:changed', {});
  const html = panelHtml('synergyBody');
  if (html.indexOf('1/2') < 0) throw new Error('"1/2" 가 없다');
  if (html.indexOf('구구 ×2는 1종으로') < 0) throw new Error('중복 안내가 없다');
  if (html.indexOf('1종 더') < 0) throw new Error('"1종 더 → …" 가 없다');
  synPut('pidgeotto', 1);
  RPD.bus.emit('field:changed', {});
  const on = panelHtml('synergyBody');
  if (on.indexOf('구구 ×2는 1종으로') < 0) throw new Error('켜진 뒤에도 중복 안내는 남아야 한다');
});

check('시너지 패널(세션 88) — 켜짐 · 곧 켜짐 · 아직 없음 묶음 · "1종 더"는 금색 · 0종은 메달 · 메달을 누르면 그 자리에서 펼침 · 켜질 때 기여 칸에 링', () => {
  synFresh();
  synPut('charmander', 1); synPut('vulpix', 1);   // 불꽃 2종 — 켜짐
  synPut('pidgey', 1);                             // 비행 1/2 — 곧(1종 더)
  RPD.bus.emit('field:changed', {});
  const h = panelHtml('synergyBody');
  const pos = s => h.indexOf(s);
  if (!(pos('켜짐 ') >= 0 && pos('곧 켜짐') > pos('켜짐 ') && pos('아직 없음') > pos('곧 켜짐'))) throw new Error('묶음 순서 ' + [pos('켜짐 '), pos('곧 켜짐'), pos('아직 없음')]);
  const rowOf = t => { const m = h.match(new RegExp('<div class="synrow([^"]*)" data-type="' + t + '"')); return m ? m[1] : null; };
  if (!/is-active/.test(rowOf('FIRE') || '')) throw new Error('불꽃이 켜짐 줄이 아니다 ' + rowOf('FIRE'));
  if (!/is-near/.test(rowOf('FLYING') || '')) throw new Error('비행(1종 더)이 금색 줄이 아니다 ' + rowOf('FLYING'));
  if (!/is-medal/.test(rowOf('ICE') || '')) throw new Error('얼음(0종)이 메달이 아니다 ' + rowOf('ICE'));
  const missing = Object.keys(RPD.Synergies).filter(t => !rowOf(t));
  if (missing.length) throw new Error('빠진 타입 ' + missing);
  // 메달 누르기 → 그 타입이 줄로 펼쳐지고 단계표
  const body = nodes.synergyBody;
  (listeners.synergyBody.click || []).forEach(fn => fn({ target: { closest: () => ({ dataset: { type: 'ICE' } }) } }));
  const h2 = panelHtml('synergyBody');
  if (!/data-type="ICE"[^>]*>[\s\S]*?syndetail/.test(h2) || /class="synrow is-medal" data-type="ICE"/.test(h2)) throw new Error('메달을 눌러도 안 펼쳐진다');
  (listeners.synergyBody.click || []).forEach(fn => fn({ target: { closest: () => ({ dataset: { type: 'ICE' } }) } }));
  // 켜지는 순간 — 비행을 가진 칸에만 링
  const rings = []; const orig = RPD.FxRenderer.ring;
  RPD.FxRenderer.ring = (x, y, c) => rings.push({ x, y, c });
  try { synPut('pidgeotto', 1); RPD.bus.emit('field:changed', {}); } finally { RPD.FxRenderer.ring = orig; }
  const flyColor = RPD.Types.FLYING.color, fly = rings.filter(r => r.c === flyColor);
  if (fly.length !== 2) throw new Error('비행 기여 칸 링 ' + fly.length + ' / 2 (전체 ' + rings.length + ')');
});

check('조합식 줄(세션 89) — 재료 진행 칸 · 완성 가능 줄은 한 번만 반짝 · 줄 ↔ 필드 재료 칸(조합과 같은 순서 · 모르는 히든 제외) · 다음 목표 줄', () => {
  MS.forceMobile = false; RPD.Config.autosave = false;
  RPD.Game.restart(); RPD.Game.startRun('NORMAL', 'NORMAL');
  RPD.GameManager.life = 999; RPD.GameManager.setWave(20);
  RPD.FieldManager.init(); RPD.StorageManager.reset();
  const F = RPD.FieldManager, open = F.slots.filter(x => x.unlocked && x.zone !== 'cheer');
  F.place(open[0].index, RPD.UnitManager.create('abra'));                // 슬리프 = 캐이시 + 고오스 → 1/2
  RPD.UnitManager.recomputeAll(); RPD.bus.emit('field:changed', {}); RPD.RecipeManager.refresh();
  clickTab('all'); clickChip('ALL');
  const h = panelHtml('recipeList');
  const row = (h.match(/<button type="button" class="rrow[^"]*" data-result="drowzee"[\s\S]*?<\/button>/) || [''])[0];
  if (!row) throw new Error('슬리프 줄이 없다');
  if (!/<span class="rprog"[^>]*aria-label="재료 1\/2"[^>]*><i class="is-on"><\/i><i><\/i><\/span>/.test(row)) throw new Error('진행 칸이 아니다: ' + (row.match(/<span class="rprog[\s\S]*?<\/span>/) || [''])[0]);
  // 완성 가능 줄은 늘 숨 쉬지 않는다 — 막 완성 가능해진 줄(is-fresh)만 두 번
  const css = fs.readFileSync(path.join(ROOT, 'css/ui.css'), 'utf8');
  const blk = css.slice(css.indexOf('.rrow.is-ready {'), css.indexOf('}', css.indexOf('.rrow.is-ready {')));
  if (/infinite/.test(blk)) throw new Error('완성 가능 줄이 계속 반짝인다');
  if (!/\.rrow\.is-ready\.is-fresh \{ animation: readyGlow [^;]* 2; \}/.test(css)) throw new Error('막 완성 가능해진 줄 반짝임이 없다');
  // 줄 ↔ 필드: 필드의 캐이시 칸이 반짝인다
  const MH = RPD.MatHint;
  MH.show(['abra', 'gastly'], true);
  if (JSON.stringify(MH.slots()) !== JSON.stringify([open[0].index])) throw new Error('필드 재료 칸 ' + JSON.stringify(MH.slots()));
  // 창고에 캐이시가 있으면 조합은 창고 것을 쓴다 — 필드 칸은 안 반짝인다
  RPD.StorageManager.add(RPD.UnitManager.create('abra')); RPD.bus.emit('storage:changed', {});
  if (MH.slots().length || MH.list.length) throw new Error('창고 재료가 먼저인데 필드 칸이 반짝인다');
  RPD.StorageManager.reset();
  // 잠근 개체는 재료가 아니다
  F.get(open[0].index).unit.locked = true;
  if (MH.slots().length) throw new Error('잠근 칸이 반짝인다');
  F.get(open[0].index).unit.locked = false;
  // 아직 모르는 히든 재료는 찾지 않는다(어느 칸이 정답인지 새지 않게)
  RPD.SaveManager.data.spells = {};
  const hid = RPD.PokemonData.list.find(d => d.hidden && RPD.UI.isSecret(d.id));
  F.place(open[1].index, RPD.UnitManager.create(hid.id));
  MH.show([hid.id], true);
  if (MH.slots().length) throw new Error('모르는 히든 재료 칸이 반짝인다');
  MH.clear();
  // 모자란 줄을 누르면(손가락) 1.6초 힌트 · 완성 가능 줄은 조합
  const l = listeners.recipeList.click;
  const fake = { dataset: { result: 'drowzee', key: 'drowzee' }, classList: { contains: () => false, add() {}, remove() {} }, offsetWidth: 0 };
  l.forEach(fn => fn({ target: { closest: sel => (sel === '.rrow' ? fake : null) } }));
  if (!MH.isBusy() || MH.hold || JSON.stringify(MH.list) !== JSON.stringify([open[0].index])) throw new Error('모자란 줄을 눌러도 힌트가 없다 ' + JSON.stringify({ busy: MH.isBusy(), hold: MH.hold, list: MH.list }));
  if (!listeners.recipeList.pointerover || !listeners.recipeList.pointerleave) throw new Error('가리키기 힌트가 없다');
  MH.clear();
  // 다음 목표 — 추천 1위 전설 · 재료가 다 있으면 "조합 가능!"
  RPD.SpellData.list.forEach(sp => { RPD.SaveManager.data.spells[sp.id] = 1; });
  ['vulpix', 'rapidash', 'magmar'].forEach(id => RPD.StorageManager.add(RPD.UnitManager.create(id)));
  RPD.RecipeManager.refresh();
  RPD.LegendAdvisor.invalidate(); RPD.LegendAdvisor.compute();
  RPD.LegendAdvisorUI.renderGoal();
  const g = String(nodes.btnLegend.innerHTML);
  if (g.indexOf('다음 목표') < 0 || g.indexOf(RPD.PokemonData.get('ninetales').name) < 0 || g.indexOf('조합 가능') < 0) throw new Error('다음 목표 줄: ' + g.replace(/<[^>]+>/g, ' '));
  // 1위를 고르는 계산은 라운드 끝 · 조합 · 주문 뒤에만(소환마다 안 한다)
  const src = fs.readFileSync(path.join(ROOT, 'js/ui/LegendAdvisorUI.js'), 'utf8');
  if (!/\['wave:cleared', 'recipe:crafted', 'spell:cast'\]\.forEach\(function \(ev\) \{ RPD\.bus\.on\(ev, goalLater\); \}\)/.test(src)) throw new Error('다음 목표 계산 시점이 바뀌었다');
  RPD.LegendAdvisor.invalidate(); RPD.LegendAdvisorUI.renderGoal();
  if (String(nodes.btnLegend.innerHTML).indexOf('전설 추천') < 0) throw new Error('추천 전에는 [★ 전설 추천] 버튼이어야 한다');
});

/* ---------- 전설 추천(세션 78) ---------- */
console.log('\n전설 추천 — LegendAdvisor');
const LA = RPD.LegendAdvisor;
function laFresh(knowAll) {
  MS.forceMobile = false; RPD.Config.autosave = false;
  RPD.Game.restart(); RPD.Game.startRun('NORMAL', 'NORMAL');
  RPD.GameManager.life = 999; RPD.GameManager.setWave(20);
  RPD.FieldManager.init(); RPD.StorageManager.reset();
  RPD.ShardManager.shards = 0;
  RPD.SaveManager.data.spells = {};
  if (knowAll) RPD.SpellData.list.forEach(sp => { RPD.SaveManager.data.spells[sp.id] = 1; });
  LA.invalidate();
}
function laGive(ids) { ids.forEach(id => RPD.StorageManager.add(RPD.UnitManager.create(id))); RPD.RecipeManager.refresh(); }

check('재료를 다 가진 전설이 "지금 바로 조합 가능"으로 1위', () => {
  laFresh(true);
  laGive(['vulpix', 'rapidash', 'magmar']);       // 나인테일
  const r = LA.compute();
  if (!r.top.length || r.top[0].id !== 'ninetales' || !r.top[0].ready || r.top[0].expected !== 0) throw new Error('1위 ' + JSON.stringify(r.top[0] && { id: r.top[0].id, ready: r.top[0].ready }));
  if (r.list.filter(x => x.ready).length !== 1) throw new Error('지금 바로가 하나여야 한다');
});

check('재료 하나 모자란 전설이 둘 모자란 것보다 위 — 리자몽(두두 −1) > 윈디(독침붕 · 마그마 −2)', () => {
  laFresh(true);
  laGive(['charmeleon', 'rapidash', 'growlithe']);
  const r = LA.compute();
  const a = r.list.findIndex(x => x.id === 'charizard'), b = r.list.findIndex(x => x.id === 'arcanine');
  const ca = r.list[a].chips.reduce((n, c) => n + c.missing, 0), cb = r.list[b].chips.reduce((n, c) => n + c.missing, 0);
  if (ca !== 1 || cb !== 2) throw new Error('모자란 수 ' + ca + ' / ' + cb);
  if (!(a >= 0 && b >= 0 && a < b)) throw new Error('순서 리자몽 ' + a + ' · 윈디 ' + b);
  if (!(r.list[a].expected < r.list[b].expected)) throw new Error('기대 소환 ' + r.list[a].expected + ' / ' + r.list[b].expected);
});

check('잠긴 유닛은 보유로 안 친다 — 잠그면 "지금 바로"가 아니고, 풀면 다시', () => {
  laFresh(true);
  laGive(['vulpix', 'rapidash', 'magmar']);
  const u = RPD.StorageManager.units.find(x => x.defId === 'magmar');
  RPD.UnitManager.setLocked(u, true);
  let r = LA.compute(), n = r.list.find(x => x.id === 'ninetales');
  if (!n || n.ready || n.chips.find(c => c.id === 'magmar').missing !== 1) throw new Error('잠긴 마그마를 보유로 셌다');
  RPD.UnitManager.setLocked(u, false);
  r = LA.compute(); n = r.list.find(x => x.id === 'ninetales');
  if (!n.ready) throw new Error('잠금을 풀었는데 지금 바로가 아니다');
});

check('미발견 히든이 든 전설은 후보에서 빠지고 HTML 어디에도 이름이 안 나온다 · "N종은 제외" 한 줄', () => {
  laFresh(false);
  laGive(['vulpix', 'rapidash', 'magmar', 'charmeleon']);
  const r = LA.compute();
  const shown = new Set(r.list.map(x => x.id));
  const excluded = LA.candidates().filter(id => !shown.has(id));
  if (!r.hiddenExcluded || excluded.length !== r.hiddenExcluded) throw new Error('제외 수 ' + r.hiddenExcluded + ' / ' + excluded.length);
  click('btnLegend');
  if (nodes.legendOverlay.hidden) throw new Error('[전설 추천] 창이 안 열린다');
  RPD.LegendAdvisorUI.render();
  const html = panelHtml('legendList') + ' ' + String(nodes.legendNote.textContent) + ' ' + JSON.stringify(r);
  const secretNames = RPD.PokemonData.list.filter(d => d.hidden).map(d => d.name).concat(excluded.map(id => RPD.PokemonData.get(id).name));
  const leak = secretNames.filter(nm => html.indexOf(nm) >= 0);
  if (leak.length) throw new Error('이름이 새었다: ' + leak.join(', '));
  const leakId = excluded.concat(RPD.PokemonData.list.filter(d => d.hidden).map(d => d.id)).filter(id => html.indexOf('"' + id + '"') >= 0);
  if (leakId.length) throw new Error('id 가 새었다: ' + leakId.join(', '));
  if (String(nodes.legendNote.textContent).indexOf('숨은 재료가 필요한 전설 ' + r.hiddenExcluded + '종은 제외') < 0) throw new Error('안내: ' + nodes.legendNote.textContent);
  click('btnLegendClose');
});

check('기대 소환 수 — 같은 보유에서 실제 pickSpecies 로 재료가 모일 때까지 200번 돌린 평균과 ±15% 안 · 계산 5초 안', () => {
  laFresh(true);
  laGive(['charmeleon', 'rapidash', 'growlithe']);
  const t0 = Date.now();
  const r = LA.compute({ force: true });
  const ms = Date.now() - t0;
  if (ms > 5000) throw new Error('계산 ' + ms + 'ms');
  const SM = RPD.SummonManager;
  const pick = r.list.filter(x => !x.ready && isFinite(x.expected) && x.expected > 0).slice(0, 3);
  if (pick.length < 3) throw new Error('비교할 후보가 모자란다');
  pick.forEach(x => {
    let tot = 0;
    for (let i = 0; i < 200; i++) {
      const left = Object.assign({}, x.leaves);
      let rem = Object.values(left).reduce((a, b) => a + b, 0), d = 0;
      while (rem > 0 && d < 20000) {
        d++;
        const sp = SM.pickSpecies(RPD.Utils.weightedPick(SM.currentOdds()));
        if (left[sp] > 0) { left[sp]--; rem--; }
      }
      tot += d;
    }
    const sim = tot / 200, diff = Math.abs(x.expected / sim - 1);
    if (diff > 0.15) throw new Error(x.id + ' 계산 ' + x.expected.toFixed(1) + ' · 실제 ' + sim.toFixed(1) + ' (' + (diff * 100).toFixed(1) + '%)');
  });
});

check('같은 보유면 다시 계산하지 않는다(캐시) · 화면이 안 흔들린다(고정 시드) · 추천은 골드 · 조각 · 보유를 바꾸지 않는다', () => {
  laFresh(true);
  laGive(['charmeleon', 'rapidash']);
  RPD.ShardManager.shards = 60; RPD.GameManager.gold = 777;
  const a = LA.compute(), b = LA.compute();
  if (a !== b) throw new Error('캐시를 안 썼다');
  const c = LA.compute({ force: true });
  if (JSON.stringify(c.top.map(x => [x.id, x.expected])) !== JSON.stringify(a.top.map(x => [x.id, x.expected]))) throw new Error('다시 계산하니 숫자가 바뀐다');
  if (RPD.ShardManager.shards !== 60 || RPD.GameManager.gold !== 777 || RPD.StorageManager.units.length !== 2) throw new Error('추천이 무언가를 썼다');
  if (!c.list.some(x => x.shardsUsed > 0)) throw new Error('조각 60 이 있는데 조각을 쓰는 안이 없다');
});

/* ---------- 응원 칸 (세션 82) — 버프 전용 칸 · 필드 전체에 ---------- */

const CH = { F: RPD.FieldManager, UM: RPD.UnitManager, SM: RPD.StorageManager, CD: RPD.CheerData };
function chFresh() {
  lockFresh();
  RPD.CheerData.reset();
  RPD.EnemyManager.reset();
  return CH.F.cheerSlots();
}
const chOpen = () => CH.F.cheerSlots().filter(s => s.unlocked);
const chBattle = () => CH.F.slots.filter(s => s.unlocked && s.zone !== 'cheer');
function chRejects(fn) {
  const got = []; const h = p => got.push(p);
  RPD.bus.on('field:rejected', h);
  try { fn(); } finally { RPD.bus.off('field:rejected', h); }
  return got;
}

check('응원 칸 — 응원 가능한 포켓몬만 들어간다(놓기 · 맞바꾸기 · 창고에서 · 거절 알림)', () => {
  chFresh();
  const [c0] = chOpen(), b0 = chBattle()[0];
  const ok = CH.UM.create('exeggcute'), no = CH.UM.create('rattata');
  if (CH.CD.isCheerable('rattata') || !CH.CD.isCheerable('exeggcute')) throw new Error('표가 이상하다');
  let rej = chRejects(() => { if (CH.F.place(c0.index, no)) throw new Error('꼬렛이 응원 칸에 들어갔다'); });
  if (!rej.length || rej[0].reason !== 'NOT_CHEERABLE') throw new Error('거절 알림(field:rejected NOT_CHEERABLE)이 없다');
  if (!CH.F.place(c0.index, ok)) throw new Error('아라리가 못 들어갔다');
  CH.F.place(b0.index, no);
  rej = chRejects(() => { if (CH.F.swap(c0.index, b0.index)) throw new Error('맞바꿔 꼬렛이 응원 칸으로 갔다'); });
  if (c0.unit !== ok || b0.unit !== no || !rej.length) throw new Error('맞바꾸기 거절 뒤 자리가 바뀌었다');
  CH.F.remove(c0.index);
  CH.SM.add(no2 = CH.UM.create('pidgey'));
  const r = CH.SM.deploy(CH.SM.units.indexOf(no2), c0.index);
  if (r.ok || CH.SM.units.indexOf(no2) < 0) throw new Error('창고 → 응원 칸 거절 때 개체가 사라졌다: ' + JSON.stringify(r));
  if (RPD.CheerUI.REJECT_TEXT !== '응원 칸에는 응원 가능한 포켓몬만 둘 수 있어요') throw new Error('알림 문구');
});
var no2;

check('응원 칸 — 처음 2칸 무료 · 400G · 900G 를 사기 전엔 못 둔다', () => {
  chFresh();
  const locked = CH.F.lockedCheerSlots();
  if (chOpen().length !== 2 || locked.map(s => s.cost).join(',') !== '400,900') throw new Error(chOpen().length + ' / ' + locked.map(s => s.cost));
  const u = CH.UM.create('gastly');
  if (CH.F.place(locked[0].index, u) || CH.F.canPlace(locked[0].index, u).reason !== 'LOCKED') throw new Error('잠긴 응원 칸에 놓였다');
  RPD.GameManager.gold = 1000;
  const r = RPD.EconomyManager.unlockSlot(locked[0].index);
  if (!r.ok || RPD.GameManager.gold !== 600) throw new Error('400G 구매: ' + JSON.stringify(r) + ' gold ' + RPD.GameManager.gold);
  if (!CH.F.place(locked[0].index, u)) throw new Error('산 뒤에도 못 둔다');
  if (CH.F.lockedSlots().some(s => s.zone === 'cheer')) throw new Error('확장 칸 목록(lockedSlots)에 응원 칸이 섞였다');
});

check('응원 칸 — getBattleUnits 엔 없고 getAllUnits 엔 있다 · 싸우지 않는다(공격 · 강화) · 시너지에는 센다', () => {
  chFresh();
  const [c0] = chOpen();
  const m = CH.UM.create('clefable');           // 버퍼 · 장거리 — 빼먹으면 지나가는 적을 때린다
  CH.F.place(c0.index, m); CH.UM.recomputeAll();
  if (CH.F.getBattleUnits().indexOf(m) >= 0 || CH.F.getAllUnits().indexOf(m) < 0) throw new Error('분류가 틀렸다');
  // 시너지 — 응원 칸도 종 수에 센다(세션 83). 필드의 같은 종과는 합쳐 1종
  if (RPD.SynergyManager.countOf('FAIRY') !== 1) throw new Error('응원 칸 픽시가 시너지에 안 셌다 ' + RPD.SynergyManager.countOf('FAIRY'));
  CH.F.place(chBattle()[0].index, CH.UM.create('clefable')); CH.UM.recomputeAll();
  if (RPD.SynergyManager.countOf('FAIRY') !== 1) throw new Error('필드 픽시 + 응원 칸 픽시가 2종으로 셌다');
  CH.F.remove(chBattle()[0].index); CH.F.place(chBattle()[0].index, CH.UM.create('clefairy')); CH.UM.recomputeAll();
  if (RPD.SynergyManager.countOf('FAIRY') !== 2) throw new Error('필드 삐삐 + 응원 칸 픽시가 2종이 아니다');
  CH.F.remove(chBattle()[0].index); CH.UM.recomputeAll();
  if (RPD.EconomyManager.canUpgrade(m) || RPD.EconomyManager.upgrade(c0.index).ok) throw new Error('응원 칸이 강화된다');
  RPD.GameManager.setState('RUNNING');
  for (let i = 0; i < 6; i++) RPD.EnemyManager.spawn('armored', 30);
  // 판 시작 때 받은 흔함 · 라운드 보상이 전투 칸에 앉을 수 있다 — 응원 칸 개체의 피해만 본다. 적이 사거리 안에 들어왔는지도 확인(헛검사 막기)
  let minD = Infinity;
  for (let t = 0; t < 40; t++) {
    tick(0.5);
    RPD.EnemyManager.enemies.forEach(e => { if (e.alive !== false) minD = Math.min(minD, Math.hypot(e.x - c0.x, e.y - c0.y)); });
  }
  RPD.EnemyManager.reset();
  if (!(minD < m.range)) throw new Error('적이 응원 칸 사거리에 안 들어왔다(헛검사) ' + Math.round(minD) + ' / ' + m.range);
  if (m.totalDamage > 0) throw new Error('응원 칸이 공격했다: ' + m.totalDamage);
});

function chAspd(cheerIds, tweak) {
  chFresh();
  if (tweak) tweak(CH.CD.table());
  const bs = chBattle(), units = [bs[0], bs[5], bs[bs.length - 1]].map(s => { const u = CH.UM.create('charmander'); CH.F.place(s.index, u); return u; });
  CH.UM.recomputeAll();
  const base = units.map(u => u.attackSpeed);
  const slots = chOpen();
  RPD.GameManager.gold = 5000;
  CH.F.lockedCheerSlots().forEach(s => RPD.EconomyManager.unlockSlot(s.index));
  cheerIds.forEach((id, i) => CH.F.place(CH.F.cheerSlots()[i].index, CH.UM.create(id)));
  CH.UM.recomputeAll();
  return { units, base, ratio: units.map((u, i) => u.attackSpeed / base[i]) };
}
check('응원 칸 — 효과가 필드의 모든 전투 포켓몬에 닿고, 비우면 사라진다', () => {
  const t = chAspd(['exeggcute']);
  const want = 1 + CH.CD.get('exeggcute').attackSpeed;
  if (t.ratio.some(r => Math.abs(r - want) > 0.005)) throw new Error('공속 배율 ' + t.ratio.map(r => r.toFixed(3)) + ' (기대 ' + want + ')');
  CH.F.remove(CH.F.cheerSlots()[0].index); CH.UM.recomputeAll();
  if (t.units.some((u, i) => Math.abs(u.attackSpeed - t.base[i]) > 1e-9)) throw new Error('비웠는데 버프가 남았다');
  const parts = chAspd(['shellder']).units[0].auraParts;
  if (!parts || !(parts.cheer > 0) || parts.neighbor !== 0) throw new Error('auraParts 가 응원 · 이웃을 못 가른다: ' + JSON.stringify(parts));
});

check('응원 칸 — 같은 종은 한 번만 · 다른 종은 더해진다 · 축마다 상한', () => {
  const one = chAspd(['exeggcute']).ratio[0], two = chAspd(['exeggcute', 'exeggcute']).ratio[0];
  if (Math.abs(one - two) > 1e-9) throw new Error('같은 종 두 마리가 두 번 셌다 ' + one + ' / ' + two);
  chAspd(['exeggcute', 'exeggcute']);
  if (CH.UM.cheer.dups.join() !== 'exeggcute') throw new Error('중복 기록 ' + CH.UM.cheer.dups);
  chAspd(['bulbasaur', 'shellder']);
  const atk = CH.UM.cheer.attack, wantA = CH.CD.get('bulbasaur').attack + CH.CD.get('shellder').attack;
  if (Math.abs(atk - wantA) > 1e-9) throw new Error('다른 종이 안 더해진다 ' + atk + ' / ' + wantA);
  // 상한 — 표를 잠깐 바꿔 넘치게 만든다
  chAspd(['gastly'], T => { T.gastly.critRate = 5; });
  const c = CH.UM.cheer;
  if (c.critRate !== CH.CD.capOf('critRate') || !(c.raw.critRate > c.critRate)) throw new Error('상한이 안 걸렸다 ' + c.critRate);
  CH.CD.reset();
  // 응원 칸끼리는 서로 안 준다
  const t = chAspd(['exeggcute', 'oddish']);
  const cu = CH.F.cheerSlots()[1].unit;
  if (cu.auraExtras || cu.auraBonus) throw new Error('응원 칸이 응원을 받았다');
});

check('응원 칸 — 재료 순서는 창고 → 필드 → 응원 칸 · 잠근 개체는 안 쓴다', () => {
  chFresh();
  const [c0] = chOpen(), b0 = chBattle()[0];
  const inCheer = CH.UM.create('bulbasaur'), inField = CH.UM.create('bulbasaur'), inStore = CH.UM.create('bulbasaur');
  CH.F.place(c0.index, inCheer); CH.F.place(b0.index, inField); CH.SM.add(inStore);
  let r = RPD.RecipeManager.craft('ivysaur');
  if (!r.ok) throw new Error('조합 실패 ' + r.reason);
  if (c0.unit !== inCheer) throw new Error('창고 · 필드가 있는데 응원 칸 재료를 썼다');
  // 이제 응원 칸 + 창고 하나 — 응원 칸을 마지막에 쓴다
  CH.F.remove(b0.index); CH.SM.reset();
  CH.SM.add(CH.UM.create('bulbasaur'));
  r = RPD.RecipeManager.craft('ivysaur');
  if (!r.ok || c0.unit) throw new Error('응원 칸도 재료로 쓰여야 한다(보유 개체) ' + JSON.stringify(r.reason));
  if (r.unit && r.unit.slotIndex === c0.index) throw new Error('결과가 응원 칸에 앉았다');
  // 잠금
  chFresh();
  const lk = CH.UM.create('bulbasaur'); CH.F.place(chOpen()[0].index, lk); CH.UM.setLocked(lk, true);
  CH.SM.add(CH.UM.create('bulbasaur'));
  if (RPD.RecipeManager.craft('ivysaur').ok) throw new Error('잠근 응원 칸 개체를 재료로 썼다');
});

check('응원 칸 — 자동 배치 · firstEmpty · 소환 · 일괄 창고로는 응원 칸을 건드리지 않는다', () => {
  chFresh();
  chBattle().forEach(s => CH.F.place(s.index, CH.UM.create('rattata')));
  if (CH.F.firstEmpty() || CH.F.emptyCount() !== 0) throw new Error('전투 칸이 다 찼는데 빈 칸이 있다고 한다');
  if (RPD.SummonManager.autoPlace(CH.UM.create('exeggcute'))) throw new Error('자동 배치가 응원 칸에 넣었다');
  RPD.GameManager.gold = 99999;
  const n = CH.SM.units.length;
  const r = RPD.SummonManager.summon();
  if (!r.ok || CH.SM.units.length !== n + 1 || chOpen().some(s => s.unit)) throw new Error('필드가 차면 소환은 창고로 가야 한다');
  CH.F.place(chOpen()[0].index, CH.UM.create('oddish'));
  if (RPD.StorageManager.bulkStore) {
    RPD.StorageManager.bulkStore(RPD.StorageManager.bulkGroups().map(g => g.id));
    if (!chOpen()[0].unit) throw new Error('일괄 창고로가 응원 칸을 비웠다');
  }
});

check('응원 칸 — 이웃 버프는 그대로(피카츄 옆 삐삐 사거리 · 응원과 합쳐 상한)', () => {
  chFresh();
  const bs = chBattle();
  const near = (s, o) => o !== s && Math.hypot(s.x - o.x, s.y - o.y) <= 150;   // 이웃 판정(200px) 안쪽으로 넉넉히
  const a = bs.find(s => bs.some(o => near(s, o)));
  const b = a && bs.find(o => near(a, o));
  if (!a || !b) throw new Error('이웃 칸 쌍이 없다');
  const u = CH.UM.create('pikachu'); CH.F.place(a.index, u); CH.UM.recomputeAll();
  const r0 = u.range;
  CH.F.place(b.index, CH.UM.create('clefairy')); CH.UM.recomputeAll();
  if (!(u.range > r0)) throw new Error('삐삐 이웃 사거리가 사라졌다');
  const r1 = u.range;
  CH.F.place(chOpen()[0].index, CH.UM.create('oddish')); CH.UM.recomputeAll();
  if (!(u.range >= r1) || !u.auraExtras.neighbor || !u.auraExtras.cheer) throw new Error('이웃 + 응원이 합쳐지지 않는다');
});

check('응원 칸 — 표의 16종(+ 필드 전체 불멸 1)이 다 실제 포켓몬 · 설명서 표 · 응원 칸 카드가 같은 표로 그린다', () => {
  chFresh();
  const ids = CH.CD.ids();
  if (ids.length !== 16 || CH.CD.fieldIds().join() !== 'mew') throw new Error('응원 가능 ' + ids.length + '종 · 필드 전체 ' + CH.CD.fieldIds());
  const bad = ids.filter(id => !RPD.PokemonData.get(id));
  if (bad.length) throw new Error('없는 포켓몬: ' + bad);
  if (ids.some(id => !CH.CD.describe(CH.CD.get(id)))) throw new Error('효과가 빈 종이 있다');
  const help = RPD.CheerUI.renderHelp();
  const rows = (help.match(/<tr><td>/g) || []).length;
  if (rows !== ids.length + CH.CD.fieldIds().length) throw new Error('설명서 표 ' + rows + '줄');
  if (!/불멸 이상/.test(help)) throw new Error('설명서에 불멸 이상 안내가 없다');
  if (ids.some(id => help.indexOf(CH.CD.describe(CH.CD.get(id))) < 0)) throw new Error('설명서 수치가 표와 다르다');
  if (!/필드 전체/.test(help)) throw new Error('설명서에 "필드 전체" 가 없다');
  // 버퍼 9종은 이웃 버프 × SCALE
  const g = CH.CD.get('golduck'), a = RPD.AuraData.get('golduck');
  if (Math.abs(g.armorPierce - Math.round(a.armorPierce * CH.CD.SCALE * 1000) / 1000) > 1e-9) throw new Error('골덕 = 이웃 × SCALE 이 아니다');
});

check('불멸 이상(뮤) — 응원 칸엔 못 두고, 전투 칸에 두면 옆 칸은 원래 이웃 값 · 필드 전체는 응원 값(세션 83)', () => {
  chFresh();
  const bs = chBattle();
  if (CH.CD.isCheerable('mew') || CH.F.place(chOpen()[0].index, CH.UM.create('mew'))) throw new Error('뮤가 응원 칸에 들어갔다');
  const far = bs[bs.length - 1], hub = bs.find(s => Math.hypot(s.x - far.x, s.y - far.y) > 400);
  const nb = bs.find(s => s !== hub && Math.hypot(s.x - hub.x, s.y - hub.y) <= 150);
  const uf = CH.UM.create('charmander'), un = CH.UM.create('charmander');
  CH.F.place(far.index, uf); CH.F.place(nb.index, un); CH.UM.recomputeAll();
  const f0 = uf.attackSpeed, n0 = un.attackSpeed;
  CH.F.place(hub.index, CH.UM.create('mew')); CH.UM.recomputeAll();
  const e = CH.CD.get('mew'), a = RPD.AuraData.get('mew');
  if (Math.abs(uf.attackSpeed / f0 - (1 + e.attackSpeed)) > 0.005) throw new Error('먼 칸이 응원 값을 못 받았다 ' + (uf.attackSpeed / f0).toFixed(3));
  if (Math.abs(un.attackSpeed / n0 - (1 + a.attackSpeed + e.attackSpeed)) > 0.005) throw new Error('옆 칸이 원래 이웃 값 + 응원 값이 아니다 ' + (un.attackSpeed / n0).toFixed(3));
  if (CH.UM.cheer.field.join() !== 'mew' || !(uf.auraParts.cheer > 0)) throw new Error('필드 전체 기록 ' + JSON.stringify(CH.UM.cheer.field));
  // 두 마리여도 한 번
  CH.F.place(bs.find(s => !s.unit).index, CH.UM.create('mew')); CH.UM.recomputeAll();
  if (Math.abs(uf.attackSpeed / f0 - (1 + e.attackSpeed)) > 0.005) throw new Error('뮤 두 마리가 두 번 셌다');
  // 창고로 보내면 사라진다
  CH.F.slots.filter(s => s.unit && s.unit.defId === 'mew').forEach(s => CH.F.remove(s.index)); CH.UM.recomputeAll();
  if (Math.abs(uf.attackSpeed - f0) > 1e-9) throw new Error('뮤를 빼도 남았다');
  // 옛 저장(뮤가 응원 칸에) — 잃지 않고 전투 칸으로
  chFresh();
  CH.F.loadState({ unlocked: [], units: [{ slot: chOpen()[0].index, unit: CH.UM.serialize(CH.UM.create('mew')) }] });
  if (chOpen()[0].unit || !CH.F.getBattleUnits().some(u => u.defId === 'mew')) throw new Error('옛 저장의 응원 칸 뮤가 사라졌거나 응원 칸에 남았다');
});

check('응원 칸 — 판 이어하기가 응원 칸(산 칸 · 개체)을 저장 · 복원한다', () => {
  lockFresh();
  RPD.Config.autosave = true; RS.blocked = false;
  RPD.Game.restart(); RPD.Game.startRun('NORMAL', 'NORMAL');
  RPD.GameManager.life = 999; RPD.GameManager.gold = 5000;
  const lockedC = CH.F.lockedCheerSlots()[0];
  RPD.EconomyManager.unlockSlot(lockedC.index);
  CH.F.place(lockedC.index, CH.UM.create('vulpix'));
  CH.F.place(chOpen()[0].index, CH.UM.create('koffing'));
  RPD.bus.emit('wave:started', RPD.WaveManager.plan);
  const r = RS.read();
  RPD.Config.autosave = false;
  if (!r.ok) throw new Error('저장 실패 ' + r.reason);
  RS.restore(r.data); RS.pending = null;
  const got = CH.F.cheerSlots().filter(s => s.unit).map(s => s.unit.defId).sort().join(',');
  if (got !== 'koffing,vulpix' || !CH.F.get(lockedC.index).unlocked) throw new Error('복원 ' + got);
  if (!(CH.UM.cheer.critDamage > 0) || !(CH.UM.cheer.bossDamage > 0)) throw new Error('복원 뒤 응원 효과가 없다');
});

check('응원 칸 — 정보 카드 · 강화 버튼 · 보유 칸 ✨ · [응원 가능] 거름망 · 요약 줄', () => {
  chFresh();
  const c0 = chOpen()[0];
  CH.F.place(c0.index, CH.UM.create('shellder'));
  const b0 = chBattle()[0]; CH.F.place(b0.index, CH.UM.create('charmander'));
  CH.UM.recomputeAll();
  CH.F.select(c0.index);
  const body = nodes.slotBody.innerHTML;
  if (!/응원: 공격력 \+2\.5% · 방어 무시 \+2\.5%/.test(body) || !/필드 전체/.test(body) || /공격 대상/.test(body)) throw new Error('응원 칸 카드: ' + body.slice(0, 200));
  if (nodes.upgradeCost.textContent !== '응원 칸은 강화 불가') throw new Error('강화 버튼 글: ' + nodes.upgradeCost.textContent);
  CH.F.select(b0.index);
  const bb = nodes.slotBody.innerHTML;
  if (!/받는 버프/.test(bb) || !/📣 응원 · 공격 \+\d+%/.test(bb)) throw new Error('전투 칸 받는 버프: ' + (bb.match(/sc__recv[\s\S]{0,200}/) || [''])[0]);
  RPD.UIManager.refreshAll && RPD.UIManager.refreshAll();
  if (!/✨|📣/.test(nodes.storageList.innerHTML)) throw new Error('보유 칸에 응원 표시가 없다');
  RPD.CheerUI.render();
  if (nodes.cheerSummary.hidden || !/공격력 \+2\.5%/.test(nodes.cheerSummary.innerHTML)) throw new Error('요약 줄: ' + nodes.cheerSummary.innerHTML);
  CH.F.clearSelection();
});

/* ---------- 보스 등장 연출(세션 86 · 리디자인 ②) ---------- */
check('보스 이름표 — 등장하면 이름 · 위협 한 줄이 뜨고 라운드 배너를 내린다 · 최종 보스는 "최종 보스" · 쓰러지면 바로 내린다', () => {
  const BI = RPD.BossIntroUI, def = RPD.EnemyData ? null : null;
  const boss = { name: '시험보스', wave: 10, isBoss: true, def: { name: '폭주대장', patterns: [{ label: '증원', every: 15 }, { label: '충격파', every: 10 }, { label: '침묵', every: 13 }], phase2: { at: 0.5, label: '가속' }, timeLimit: 60 } };
  if (BI.threatOf(boss) !== '증원 15초마다 · 충격파 10초마다 · 체력 50% 가속') throw new Error('위협 줄 ' + BI.threatOf(boss));
  if (BI.threatOf({ def: { patterns: [{ label: '증원', every: 15 }], timeLimit: 60 } }) !== '증원 15초마다 · 60초 뒤 돌진') throw new Error('짧은 위협 줄');
  nodes.waveBanner.classList.add('is-on');
  RPD.bus.emit('boss:appeared', boss);
  const n = nodes.bossIntro;
  if (!n.classList.contains('is-on') || !/시험보스/.test(n.innerHTML) || !/BOSS/.test(n.innerHTML)) throw new Error('이름표가 안 떴다 ' + n.innerHTML);
  if (nodes.waveBanner.classList.contains('is-on')) throw new Error('라운드 배너가 남았다');
  if (!RPD.BossIntro.isBusy()) throw new Error('캔버스 연출이 안 시작했다');
  RPD.bus.emit('enemy:died', { enemy: boss });
  if (n.classList.contains('is-on')) throw new Error('보스가 쓰러졌는데 이름표가 남았다');
  const fw = RPD.GameManager.mode && RPD.GameManager.mode.finalWave;
  if (fw) {
    RPD.bus.emit('boss:appeared', Object.assign({}, boss, { wave: fw }));
    if (!/최종 보스/.test(n.innerHTML) || !n.classList.contains('is-final')) throw new Error('최종 보스 표시 ' + n.innerHTML);
    BI.hide();
  }
  RPD.BossIntro.reset();
});

/* ---------- 조합 성공 · 소환 연출(세션 87 · 리디자인 ③) ---------- */
check('조합 연출 — 재료 자리가 실려 오고 결과 칸으로 모이는 연출 · 처음 만든 조합은 결과 칸 옆 카드 · 화면 가운데 카드는 안 뜬다', () => {
  lockFresh();
  const F = RPD.FieldManager, PD = RPD.PokemonData;
  RPD.RecipeManager.discovered = {};
  const r = RPD.RecipeData.list.find(x => PD.get(x.id).tier === 'T3' && !PD.get(x.id).hidden && x.materials.length >= 2 && x.materials.every(m => !PD.get(m).hidden && m !== 'ditto'));
  const open = F.slots.filter(s => s.unlocked && s.zone !== 'cheer');
  RPD.StorageManager.add(RPD.UnitManager.create(r.materials[0]));
  r.materials.slice(1).forEach((m, i) => F.place(open[i * 5].index, RPD.UnitManager.create(m)));
  let got = null; const h = p => { got = p; };
  RPD.bus.on('recipe:crafted', h);
  RPD.CraftFx.reset(); nodes.summonReveal.classList.remove('is-on'); nodes.craftCard.classList.remove('is-on');
  const res = RPD.RecipeManager.craft(r.id);
  RPD.bus.off('recipe:crafted', h);
  if (!res.ok || !got) throw new Error('조합 실패 ' + res.reason);
  if (got.from.length !== r.materials.length - 1 || got.fromStore !== 1) throw new Error('재료 자리 ' + JSON.stringify({ from: got.from, store: got.fromStore }));
  if (!RPD.CraftFx.isBusy() || RPD.CraftFx.jobs[0].from.length !== r.materials.length) throw new Error('모이는 연출이 안 시작했다');
  if (!nodes.craftCard.classList.contains('is-on') || !/새 조합 발견/.test(nodes.craftCard.innerHTML)) throw new Error('결과 칸 카드 ' + nodes.craftCard.innerHTML);
  if (nodes.summonReveal.classList.contains('is-on')) throw new Error('화면 가운데 카드가 떴다');
  RPD.CraftFx.reset();
});

check('소환 템포 — 특별함 소환도 화면 가운데 카드 없이 칸 위에서만(흔함은 칸 위 연출도 없음)', () => {
  lockFresh();
  const PD = RPD.PokemonData;
  RPD.CraftFx.reset(); nodes.summonReveal.classList.remove('is-on');
  const t3 = RPD.UnitManager.create(PD.list.find(d => d.tier === 'T3' && d.summon && !d.hidden).id);
  RPD.SummonManager.autoPlace(t3);
  RPD.bus.emit('summon:result', { ok: true, unit: t3, tier: 'T3', cost: 0, toStorage: false });
  if (nodes.summonReveal.classList.contains('is-on')) throw new Error('특별함 소환에 가운데 카드가 떴다');
  if (RPD.CraftFx.jobs.length !== 1) throw new Error('칸 위 연출 ' + RPD.CraftFx.jobs.length);
  const t1 = RPD.UnitManager.create(PD.list.find(d => d.tier === 'T1' && d.summon).id);
  RPD.SummonManager.autoPlace(t1);
  RPD.bus.emit('summon:result', { ok: true, unit: t1, tier: 'T1', cost: 0, toStorage: false });
  if (RPD.CraftFx.jobs.length !== 1) throw new Error('흔함 소환에도 터짐이 붙었다');
  RPD.CraftFx.reset();
});

wakePromise.then(() => {
  console.log(`\n────────────────────────────`);
  console.log(failures === 0 ? '부팅 경로 이상 없음' : `부팅 문제 ${failures}건`);
  process.exit(failures === 0 ? 0 : 1);
});
