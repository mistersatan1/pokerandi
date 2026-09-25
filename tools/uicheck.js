/* uicheck.js — UI 리디자인이 만든 것들의 회귀 테스트.
 * 실행: node tools/uicheck.js
 *
 * 검사하는 것
 *   ① 55종 전부에 공격 연출 설정이 있고, 서로 다른 연출을 쓴다
 *   ② 연출 풀이 넘쳐도 터지지 않고, 시간이 지나면 스스로 비워진다
 *   ③ 등급이 오를수록 연출이 커지되 상한을 넘지 않는다
 *   ④ 스킬 연출 API 가 살아 있다(발동 로직이 붙으면 그대로 쓰인다)
 *   ⑤ HTML 이 새 패널 요소를 전부 갖고 있고, CSS 가 그 클래스를 실제로 쓴다
 *
 * 그림이 예쁜지는 검사하지 않는다. 조용히 죽는 연결만 잡는다.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

const CTX_METHODS = [
  'save', 'restore', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo',
  'rect', 'ellipse', 'roundRect', 'fill', 'stroke', 'fillRect', 'clearRect', 'strokeRect', 'fillText',
  'strokeText', 'measureText', 'drawImage', 'setTransform', 'transform', 'translate',
  'scale', 'rotate', 'setLineDash', 'getLineDash', 'createLinearGradient',
  'createRadialGradient', 'createPattern', 'clip', 'quadraticCurveTo', 'bezierCurveTo',
  'globalCompositeOperation'
];

const calls = {};

function makeCtx() {
  const ctx = {
    canvas: { width: 1000, height: 600 },
    globalAlpha: 1,
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    lineCap: 'butt',
    lineJoin: 'miter',
    imageSmoothingEnabled: true
  };
  for (const m of CTX_METHODS) {
    ctx[m] = function () {
      calls[m] = (calls[m] || 0) + 1;
      if (m === 'measureText') return { width: 10 };
      if (m.startsWith('create')) return { addColorStop() {} };
      if (m === 'getLineDash') return [];
      return undefined;
    };
  }
  // 정의하지 않은 메서드를 부르면 조용히 넘어가지 않고 즉시 실패시킨다.
  return new Proxy(ctx, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop === 'symbol') return undefined;
      throw new Error(`캔버스 컨텍스트에 없는 멤버를 사용했습니다: ctx.${String(prop)}`);
    },
    set(target, prop, value) { target[prop] = value; return true; }
  });
}

function makeCanvas() {
  return {
    width: 1000,
    height: 600,
    style: {},
    getContext: () => makeCtx(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 600 }),
    addEventListener: () => {},
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    querySelectorAll: () => [],
    closest: () => null
  };
}

const nodes = {};
const sandbox = {
  console,
  requestAnimationFrame: () => 0,
  cancelAnimationFrame: () => {},
  performance: { now: () => Date.now() },
  addEventListener: () => {},
  devicePixelRatio: 2,
  Image: function () { this.onload = null; this.onerror = null; },
  setTimeout,
  clearTimeout,
  document: {
    readyState: 'complete',
    createElement: (tag) => (tag === 'canvas' ? makeCanvas() : makeCanvas()),
    getElementById: (id) => (nodes[id] = nodes[id] || makeCanvas()),
    addEventListener: () => {}
  }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

/* index.html 의 로드 순서를 그대로 쓴다 — 목록을 따로 들고 있으면 파일이 바뀔 때 조용히 죽는다. */
const FILES = [...fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').matchAll(/<script src="([^"]+)"/g)]
  .map(m => m[1]).filter(f => !/ui\/|main\.js/.test(f));

for (const rel of FILES) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), sandbox, { filename: rel });
}

const RPD = sandbox.RPD;
let failures = 0;

function run(label, fn) {
  try { fn(); console.log('  PASS  ' + label); }
  catch (err) { failures += 1; console.log('  FAIL  ' + label + '  → ' + err.message); }
}
function check(label, cond, detail) {
  run(label, () => { if (!cond) throw new Error(detail || '조건 불만족'); });
}

const ctx = makeCtx();

RPD.FieldManager.init();
RPD.UnitManager.init();
RPD.CombatManager.init();
RPD.FxRenderer.init();
RPD.UnitRenderer.init();
RPD.AttackFx.init();
RPD.Renderer.init(makeCanvas());

/* ---------- ① 개체별 설정 ---------- */
console.log('\n공격 연출 데이터');

const ALL = RPD.PokemonData.all();
const D = RPD.AttackFxData;

run(`${ALL.length}종 전부 설정이 나온다`, () => {
  const missing = ALL.filter(id => !D.resolve(RPD.PokemonData.get(id)));
  if (missing.length) throw new Error(missing.join(', '));
});

run('55종 전부 개체별 설정을 직접 갖는다 (타입 기본값에 기대지 않는다)', () => {
  const bare = ALL.filter(id => !D.list[id]);
  if (bare.length) throw new Error(`설정 없음: ${bare.join(', ')}`);
});

run('공격 방식이 정의된 8종 안에 있다', () => {
  const bad = ALL.filter(id => D.TYPES.indexOf(D.resolve(RPD.PokemonData.get(id)).type) < 0);
  if (bad.length) throw new Error(bad.join(', '));
});

run('같은 연출을 쓰는 개체가 없다', () => {
  const seen = {};
  const dup = [];
  for (const id of ALL) {
    const c = D.resolve(RPD.PokemonData.get(id));
    const key = [c.type, c.shape, c.color, c.impact, c.count, Math.round(c.size), Math.round(c.speed)].join('|');
    if (seen[key]) dup.push(`${seen[key]}↔${id}`);
    else seen[key] = id;
  }
  if (dup.length) throw new Error(dup.join(', '));
});

run('공격 방식이 한 종류에 쏠리지 않는다', () => {
  const counts = {};
  ALL.forEach(id => {
    const t = D.resolve(RPD.PokemonData.get(id)).type;
    counts[t] = (counts[t] || 0) + 1;
  });
  const used = Object.keys(counts).length;
  const top = Math.max(...Object.values(counts));
  if (used < 6) throw new Error(`쓰이는 방식이 ${used}종뿐`);
  if (top > ALL.length * 0.45) throw new Error(`한 방식이 ${top}종`);
});

run('희귀함·전설은 스킬 연출을 갖는다', () => {
  const bad = ALL.filter(id => {
    const def = RPD.PokemonData.get(id);
    if (def.tier !== 'T4' && def.tier !== 'T5') return false;
    return !D.resolve(def).skill;
  });
  if (bad.length) throw new Error(bad.join(', '));
});

run('화면 흔들림은 전설 이상(전설·불멸·초월)에서만 쓴다', () => {
  const bad = ALL.filter(id => {
    const def = RPD.PokemonData.get(id);
    return (D.resolve(def).shake || 0) > 0 && RPD.tierPower(def.tier) < 4;
  });
  if (bad.length) throw new Error(bad.join(', '));
});

/* ---------- ② 풀과 정리 ---------- */
console.log('\n연출 풀');

function fakeUnit(id, x, y) {
  const u = RPD.UnitManager.create(id);
  u.x = x; u.y = y;
  return u;
}
const target = { x: 600, y: 300, maxHp: 1000, hp: 1000 };

run('전 개체가 한 번씩 공격해도 터지지 않는다', () => {
  for (const id of ALL) {
    RPD.AttackFx.attack(fakeUnit(id, 200, 300), target, false);
    RPD.AttackFx.update(1 / 60);
  }
  RPD.AttackFx.draw(ctx);
});

run('풀이 넘치도록 몰아쳐도 터지지 않는다', () => {
  const u = fakeUnit('charizard', 300, 300);
  for (let i = 0; i < 4000; i++) RPD.AttackFx.attack(u, target, i % 5 === 0);
  RPD.AttackFx.update(1 / 60);
  RPD.AttackFx.draw(ctx);
});

run('풀 상한을 넘지 않는다', () => {
  const s = RPD.AttackFx.stats();
  if (s.particles > s.particleCap) throw new Error(`${s.particles} / ${s.particleCap}`);
});

run('몰아칠수록 파티클을 줄인다 (LOD)', () => {
  const s = RPD.AttackFx.stats();
  if (s.lod >= 1) throw new Error(`lod=${s.lod} — 줄지 않았다`);
});

run('시간이 지나면 스스로 비워진다', () => {
  for (let i = 0; i < 240; i++) RPD.AttackFx.update(1 / 30);
  const s = RPD.AttackFx.stats();
  if (s.particles || s.projectiles || s.beams || s.bolts || s.rings) {
    throw new Error(JSON.stringify(s));
  }
});

run('흔들림이 남아 있지 않다', () => {
  if (RPD.Renderer.shakeX || RPD.Renderer.shakeY) throw new Error('흔들림이 0 으로 안 돌아왔다');
});

/* ---------- ③ 등급별 크기 ---------- */
console.log('\n등급 연출');

run('등급이 오르면 연출이 커진다', () => {
  const size = (id) => {
    const c = D.resolve(RPD.PokemonData.get(id));
    return (c.size || 5) * (1 + c.tierIndex);
  };
  if (!(size('charmander') < size('charmeleon') && size('charmeleon') < size('charizard'))) {
    throw new Error('파이리 < 리자드 < 리자몽 이 아니다');
  }
});

run('전설 연출도 칸 하나를 덮을 만큼 커지지는 않는다', () => {
  const big = ALL.map(id => D.resolve(RPD.PokemonData.get(id)))
    .filter(c => (c.size || 0) > 30);
  if (big.length) throw new Error(`${big.length}종이 지나치게 크다`);
});

/* ---------- ④ 스킬 연출 ---------- */
console.log('\n스킬 연출');

run('스킬 연출이 평타와 다른 결과를 낸다', () => {
  RPD.AttackFx.reset();
  const u = fakeUnit('charizard', 300, 300);
  RPD.AttackFx.attack(u, target, false);
  RPD.AttackFx.update(1 / 60);
  const normal = RPD.AttackFx.stats().particles;
  RPD.AttackFx.reset();
  RPD.AttackFx.skill(u, target);
  RPD.AttackFx.update(1 / 60);
  const skill = RPD.AttackFx.stats();
  if (skill.particles <= normal) throw new Error(`평타 ${normal} · 스킬 ${skill.particles}`);
  if (!skill.rings) throw new Error('스킬 발동 링이 없다');
  RPD.AttackFx.draw(ctx);
});

run("'unit:skill' 이벤트로도 발동한다", () => {
  RPD.AttackFx.reset();
  RPD.bus.emit('unit:skill', { unit: fakeUnit('blastoise', 300, 300), target: target });
  RPD.AttackFx.update(1 / 60);
  if (!RPD.AttackFx.stats().rings) throw new Error('아무 연출도 안 났다');
});

run('대상이 없어도 스킬이 터지지 않는다(예외)', () => {
  RPD.AttackFx.skill(fakeUnit('venusaur', 300, 300), null);
  RPD.AttackFx.update(1 / 60);
  RPD.AttackFx.draw(ctx);
});

/* ---------- ⑥ 고유 스킬 ---------- */
console.log('\n고유 스킬');

const SK = RPD.SkillManager;
const SD = RPD.SkillData;
SK.init();
RPD.GameManager.reset('NORMAL');
RPD.GameManager.setWave(40);

function freshField() {
  RPD.FieldManager.init();
  RPD.EnemyManager.reset();
  SK.reset();
  SK.recomputePassives();
}

function place(id, slotIndex) {
  const u = RPD.UnitManager.create(id);
  RPD.FieldManager.place(slotIndex === undefined ? RPD.FieldManager.firstEmpty().index : slotIndex, u);
  RPD.UnitManager.recomputeAll();
  return u;
}

function spawnNear(unit, n) {
  const out = [];
  for (let i = 0; i < (n || 1); i++) {
    const e = RPD.EnemyManager.spawn('grunt', 40);
    e.x = unit.x + 10 + i * 4; e.y = unit.y + 10;
    e.hp = e.maxHp = 1e9;
    out.push(e);
  }
  return out;
}

run('희귀함·전설 전부 스킬을 갖는다', () => {
  const bad = ALL.filter(id => {
    const def = RPD.PokemonData.get(id);
    if (def.tier !== 'T4' && def.tier !== 'T5') return false;
    return !SD.forUnit(def);
  });
  if (bad.length) throw new Error(bad.join(', '));
});

run('흔함~특별함은 스킬을 쓰지 않는다', () => {
  const bad = ALL.filter(id => {
    const def = RPD.PokemonData.get(id);
    return ['T1', 'T2', 'T3'].indexOf(def.tier) >= 0 && SD.forUnit(def);
  });
  if (bad.length) throw new Error(bad.join(', '));
});

run('전설 5종 전부 패시브를 갖고, 서로 다른 축을 건드린다', () => {
  const legends = ALL.map(id => RPD.PokemonData.get(id)).filter(d => d.tier === 'T5');
  const ps = legends.map(d => SD.passiveForUnit(d));
  if (ps.some(p => !p)) throw new Error('패시브 없는 전설이 있다');
  const keys = ps.map(p => Object.keys(p).filter(k => ['id', 'name', 'desc'].indexOf(k) < 0).join(','));
  if (new Set(keys).size !== keys.length) throw new Error('효과가 겹친다: ' + keys.join(' / '));
});

run('쿨다운이 등급별 예산 안에 있다 (희귀함·히든 12~17 · 전설·불멸·초월 19~23)', () => {
  for (const id of ALL) {
    const def = RPD.PokemonData.get(id);
    const sk = SD.forUnit(def);
    if (!sk) continue;
    const top = RPD.tierPower(def.tier) >= 4;
    const lo = top ? 19 : 12;
    const hi = top ? 23 : 17;
    if (sk.cooldown < lo || sk.cooldown > hi) throw new Error(`${id} ${sk.cooldown}초`);
  }
});

run('뽑자마자 터지지 않는다 (첫 발동은 쿨다운 절반 뒤)', () => {
  const u = RPD.UnitManager.create('charizard');
  if (u.skillCooldown < u.skillMax * 0.4) throw new Error(`${u.skillCooldown}초`);
});

run('허공에 쓰지 않는다 (적이 없으면 쿨다운을 소모하지 않는다)', () => {
  freshField();
  const u = place('charizard');
  u.skillCooldown = 0;
  SK.update(0.1);
  if (u.skillCooldown > 0) throw new Error('적이 없는데 터졌다');
});

run('사거리 안에 적이 있으면 터진다', () => {
  freshField();
  const u = place('charizard');
  spawnNear(u, 3);
  u.skillCooldown = 0;
  let fired = null;
  const on = (p) => { fired = p; };
  RPD.bus.on('unit:skill', on);
  SK.update(0.1);
  RPD.bus.off('unit:skill', on);
  if (!fired) throw new Error("'unit:skill' 이벤트가 없다");
  if (u.skillCooldown <= 0) throw new Error('쿨다운이 안 돌아갔다');
  if (u.totalDamage <= 0) throw new Error('피해가 0이다');
});

run('범위 스킬이 범위 안 전체를 때린다', () => {
  freshField();
  const u = place('sandslash');
  const es = spawnNear(u, 4);
  const before = es.map(e => e.hp);
  u.skillCooldown = 0;
  SK.update(0.1);
  if (es.some((e, i) => e.hp >= before[i])) throw new Error('안 맞은 적이 있다');
});

run('단일 스킬이 한 대상에 집중된다', () => {
  freshField();
  const u = place('nidoking');
  const es = spawnNear(u, 4);
  const before = es.map(e => e.hp);
  u.skillCooldown = 0;
  SK.update(0.1);
  const hurt = es.filter((e, i) => e.hp < before[i]);
  if (hurt.length !== 1) throw new Error(`${hurt.length}체가 맞았다`);
});

/* 공격력을 올리는 수단이 개체 강화에서 골드 상점으로 옮겨 갔다(세션 33 — 강화는 이제 사거리).
 * 검사하려는 것은 같다: 스킬 피해가 실효 공격력을 따르는가. */
run('배율이 실효 공격력을 따른다 (골드 상점으로 공격력을 올리면 스킬도 세진다)', () => {
  function damageOf(level) {
    freshField();
    const u = place('nidoking');
    const G = RPD.GoldShopManager;
    G.reset(); G.tierLv[G.tierSlotOf(u.def)] = level;
    RPD.UnitManager.recomputeAll();
    spawnNear(u, 1);
    u.skillCooldown = 0;
    SK.update(0.1);
    return u.totalDamage;
  }
  const plain = damageOf(0);
  const upgraded = damageOf(5);
  RPD.GoldShopManager.reset();
  if (!(upgraded > plain * 1.05)) throw new Error(`${Math.round(plain)} → ${Math.round(upgraded)}`);
});

run('침묵 중에는 쿨다운이 멈춘다', () => {
  freshField();
  const u = place('charizard');
  spawnNear(u, 2);
  u.skillCooldown = 5;
  RPD.UnitManager.disable(u, 3);
  SK.update(1);
  if (u.skillCooldown !== 5) throw new Error(`${u.skillCooldown}초`);
});

run('팀 버프가 공격력을 올리고 시간이 지나면 되돌아온다', () => {
  freshField();
  const buffer = place('clefable');
  const other = place('charmander');
  spawnNear(buffer, 2);
  const before = other.attack;
  buffer.skillCooldown = 0;
  SK.update(0.1);
  if (!(other.attack > before)) throw new Error('버프가 안 걸렸다');
  for (let i = 0; i < 80; i++) SK.update(0.1);
  if (Math.abs(other.attack - before) > 0.01) throw new Error('버프가 안 풀렸다');
});

run('장판이 시간에 걸쳐 피해를 준다', () => {
  freshField();
  const u = place('vileplume');
  const es = spawnNear(u, 2);
  u.skillCooldown = 0;
  SK.update(0.1);
  const mid = u.totalDamage;
  for (let i = 0; i < 26; i++) SK.update(0.25);
  if (!(u.totalDamage > mid)) throw new Error('장판이 아무 일도 안 했다');
  if (SK.zones.length) throw new Error('장판이 안 끝났다');
});

run('전설 패시브가 팀 전체에 걸린다', () => {
  freshField();
  const plain = place('charmander').attack;
  freshField();
  place('venusaur');
  const buffed = place('charmander').attack;
  if (!(buffed > plain)) throw new Error(`${Math.round(plain)} → ${Math.round(buffed)}`);
});

run('같은 전설을 두 마리 올려도 패시브는 한 번만 걸린다', () => {
  freshField();
  place('venusaur');
  const one = SK.passive.teamAttackMul;
  place('venusaur');
  if (Math.abs(SK.passive.teamAttackMul - one) > 1e-6) throw new Error('중복으로 쌓였다');
});

run('판을 다시 시작하면 스킬 상태가 남지 않는다', () => {
  freshField();
  const u = place('clefable');
  spawnNear(u, 2);
  u.skillCooldown = 0;
  SK.update(0.1);
  SK.reset();
  if (SK.buff || SK.zones.length) throw new Error('버프·장판이 남았다');
  if (SK.passive.teamAttackMul !== 1) throw new Error('패시브가 남았다');
});


/* ---------- ⑧ 조각 상점 ---------- */
console.log('\n조각 상점');

const SH = RPD.ShardManager;

run('상점 탭이 화면에 있다', () => {
  const page = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const style = fs.readFileSync(path.join(ROOT, 'css/ui.css'), 'utf8');
  if (page.indexOf('data-filter="shards"') < 0) throw new Error('탭이 없다');
  if (style.indexOf('.shoprow') < 0) throw new Error('상점 줄 스타일이 없다');
  const ui = fs.readFileSync(path.join(ROOT, 'js/ui/UIManager.js'), 'utf8');
  if (ui.indexOf('ShardManager.buy') < 0) throw new Error('사람이 buy() 를 부를 길이 없다');
});

run('조합에 하나만 모자란 재료를 추천한다', () => {
  RPD.FieldManager.init();
  RPD.StorageManager.reset();
  RPD.GameManager.setWave(20);
  const recipe = RPD.RecipeData.list[0];
  RPD.FieldManager.place(0, RPD.UnitManager.create(recipe.materials[0]));
  RPD.UnitManager.recomputeAll();
  RPD.RecipeManager.refresh();
  const ids = RPD.ShardManager.suggestions().map(s => s.id);
  if (ids.indexOf(recipe.materials[1]) < 0) throw new Error(`추천 ${ids.join(',')}`);
});

run('조각이 모자라면 못 산다', () => {
  SH.reset();
  const r = SH.buy('charmander');
  if (r.ok) throw new Error('조각 0 인데 샀다');
  if (r.reason !== 'NO_SHARD') throw new Error(r.reason);
});

run('아직 열리지 않은 등급은 조각으로도 못 산다', () => {
  SH.reset();
  SH.add(9999, 'test');
  RPD.GameManager.setWave(1);
  const r = SH.buy('charizard');
  if (r.ok) throw new Error('1라운드에 전설을 샀다');
  if (r.reason !== 'LOCKED') throw new Error(r.reason);
});

run('사면 조각이 줄고 개체가 늘어난다', () => {
  SH.reset();
  SH.add(500, 'test');
  RPD.GameManager.setWave(20);
  RPD.FieldManager.init();
  RPD.StorageManager.reset();
  const before = RPD.StorageManager.allUnits().length;
  const r = SH.buy('charmander');
  if (!r.ok) throw new Error(r.reason);
  if (SH.shards !== 500 - r.price) throw new Error(`조각 ${SH.shards}`);
  if (RPD.StorageManager.allUnits().length !== before + 1) throw new Error('개체가 안 늘었다');
});

run('필드가 차 있으면 창고로 간다', () => {
  SH.reset();
  SH.add(500, 'test');
  RPD.FieldManager.init();
  RPD.StorageManager.reset();
  RPD.FieldManager.slots.forEach(s => {
    if (s.unlocked && !s.unit) RPD.FieldManager.place(s.index, RPD.UnitManager.create('charmander'));
  });
  const r = SH.buy('squirtle');
  if (!r.ok) throw new Error(r.reason);
  if (!r.toStorage) throw new Error('필드가 찼는데 필드로 갔다');
});

run('필드와 창고가 모두 차면 거부한다', () => {
  SH.reset();
  SH.add(500, 'test');
  while (!RPD.StorageManager.isFull()) RPD.StorageManager.add(RPD.UnitManager.create('rattata'));
  const before = SH.shards;
  const r = SH.buy('squirtle');
  if (r.ok) throw new Error('자리가 없는데 샀다');
  if (SH.shards !== before) throw new Error('거부했는데 조각이 줄었다');
});


run('창고 개체도 방출할 수 있다 (API)', () => {
  if (typeof RPD.EconomyManager.sellStored !== 'function') throw new Error('sellStored 가 없다');
  RPD.StorageManager.reset();
  RPD.StorageManager.add(RPD.UnitManager.create('charmander'));
  const refund = RPD.EconomyManager.sellStored(0);
  if (refund <= 0 || RPD.StorageManager.units.length !== 0) throw new Error(`환급 ${refund}`);
});

run('필드 개체를 창고로 보내는 버튼이 있다', () => {
  const page = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const ui = fs.readFileSync(path.join(ROOT, 'js/ui/UIManager.js'), 'utf8');
  if (page.indexOf('id="btnStore"') < 0) throw new Error('버튼이 없다');
  if (ui.indexOf('StorageManager.store') < 0) throw new Error('버튼이 창고로 보내지 않는다');
});

run('등급이 테두리 색으로 구분된다', () => {
  const unit = fs.readFileSync(path.join(ROOT, 'js/render/UnitRenderer.js'), 'utf8');
  if (unit.indexOf('ctx.strokeStyle = tier.color') < 0) throw new Error('필드 칸에 등급 테두리가 없다');
  const style = fs.readFileSync(path.join(ROOT, 'css/ui.css'), 'utf8');
  for (const sel of ['.scell', '.rmat .spr', '.rres .spr', '.shoprow .spr']) {
    const at = style.indexOf(sel + ' {');
    if (at < 0) throw new Error(sel + ' 가 없다');
    const block = style.slice(at, style.indexOf('}', at));
    if (block.indexOf('border') < 0) throw new Error(sel + ' 에 테두리가 없다');
  }
});

run('테두리는 등급에만 쓴다 (빨강·초록 테두리가 섞이지 않는다)', () => {
  const style = fs.readFileSync(path.join(ROOT, 'css/ui.css'), 'utf8');
  const blocks = ['.rmat.is-missing .spr', '.opmat.is-missing .spr', '.scell.is-material'];
  for (const sel of blocks) {
    const at = style.indexOf(sel);
    if (at < 0) throw new Error(sel + ' 가 없다');
    const block = style.slice(at, style.indexOf('}', at));
    if (/border(-color)?:\s*[^;]*(255,\s*90|rgba\(94)/.test(block) ||
        /box-shadow:[^;]*(255,\s*90|94,\s*224)/.test(block)) {
      throw new Error(sel + ' 에 등급 외의 테두리가 남아 있다');
    }
  }
});

run('보유 포켓몬을 네 가지 기준으로 정렬할 수 있다', () => {
  const page = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  for (const mode of ['field', 'tier', 'count', 'name']) {
    if (page.indexOf('data-sort="' + mode + '"') < 0) throw new Error(mode + ' 정렬이 없다');
  }
  if ((page.match(/id="ownedSort"/g) || []).length !== 1) throw new Error('정렬 줄이 중복이다');
  const ui = fs.readFileSync(path.join(ROOT, 'js/ui/UIManager.js'), 'utf8');
  if (ui.indexOf('OWNED_SORTS') < 0) throw new Error('정렬 규칙이 없다');
  if ((ui.match(/var ownedSort =/g) || []).length !== 1) throw new Error('정렬 상태가 중복 선언됐다');
  if ((ui.match(/el\.ownedSort\.addEventListener/g) || []).length !== 1) throw new Error('정렬 처리가 중복이다');
});

run('보유 개체를 누르면 그 개체가 들어가는 조합식만 남는다', () => {
  const ui = fs.readFileSync(path.join(ROOT, 'js/ui/UIManager.js'), 'utf8');
  if (ui.indexOf('setSpeciesFilter') < 0) throw new Error('조합식 연동이 없다');
  if (ui.indexOf('recipesUsing') < 0) throw new Error('재료로 쓰이는 조합식을 못 찾는다');
  if (ui.indexOf('opmat') < 0) throw new Error('상세창에 재료 그림이 없다');
});


/* ---------- ⑩ 소리 ---------- */
console.log('\n소리');

const AUDIO = fs.readFileSync(path.join(ROOT, 'js/core/AudioManager.js'), 'utf8');

run('음원 파일 없이 합성으로 소리를 만든다', () => {
  if (!RPD.AudioManager) throw new Error('AudioManager 가 없다');
  if (/[\w/]+\.(mp3|ogg|wav|m4a)\b/.test(AUDIO)) throw new Error('없는 음원 파일을 참조한다');
  if (AUDIO.indexOf('createOscillator') < 0) throw new Error('합성 코드가 없다');
});

run('오디오가 없는 환경에서도 터지지 않는다', () => {
  // 노드에는 AudioContext 가 없다. init·play·setTrack 이 조용히 넘어가야 한다.
  RPD.AudioManager.init();
  if (RPD.AudioManager.start() !== false) throw new Error('AudioContext 없이 시작됐다고 한다');
  RPD.AudioManager.play('click');
  RPD.AudioManager.setTrack('battle');
  RPD.bus.emit('enemy:died', { enemy: { x: 10, y: 10, def: { name: '적' } } });
  RPD.bus.emit('recipe:crafted', { tier: 'T5' });
});

run('첫 입력 전에는 소리를 내지 않는다 (브라우저 정책)', () => {
  if (AUDIO.indexOf("'pointerdown'") < 0 || AUDIO.indexOf('{ once: true }') < 0) {
    throw new Error('첫 입력에서 깨우는 코드가 없다');
  }
});

run('효과음이 몰려도 폭주하지 않는다', () => {
  if (AUDIO.indexOf('MAX_VOICES') < 0) throw new Error('동시 발음 상한이 없다');
  const sfx = AUDIO.slice(AUDIO.indexOf('var SFX = {'), AUDIO.indexOf('var TRACKS'));
  const entries = sfx.split('\n').filter(l => /kind:/.test(l));
  const noCool = entries.filter(l => !/cool:/.test(l));
  if (noCool.length) throw new Error(`쿨다운 없는 효과음 ${noCool.length}종`);
});

run('탭이 가려지거나 일시정지면 배경음을 멈춘다', () => {
  for (const hook of ['visibilitychange', "'loop:paused'"]) {
    if (AUDIO.indexOf(hook) < 0) throw new Error(hook + ' 처리가 없다');
  }
  if (AUDIO.indexOf('stopSequencer') < 0) throw new Error('멈추는 코드가 없다');
});

run('상황에 따라 곡이 바뀐다 (평시·전투·보스)', () => {
  for (const t of ['calm', 'battle', 'boss']) {
    if (AUDIO.indexOf(t + ':') < 0) throw new Error(t + ' 곡이 없다');
  }
  if (AUDIO.indexOf("'boss:appeared'") < 0) throw new Error('보스 곡으로 갈아타지 않는다');
});

run('음량과 음소거가 저장된다', () => {
  for (const key of ['audioMuted', 'musicVolume', 'sfxVolume']) {
    if (AUDIO.indexOf(key) < 0) throw new Error(key + ' 를 저장하지 않는다');
  }
  const page = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  for (const id of ['btnAudio', 'musicVol', 'sfxVol', 'btnMute']) {
    if (page.indexOf('id="' + id + '"') < 0) throw new Error(id + ' 가 화면에 없다');
  }
});

run('주요 사건에 소리가 붙어 있다', () => {
  const events = ['summon:result', 'recipe:crafted', 'unit:upgraded', 'unit:sold',
    'enemy:died', 'game:life', 'game:wave', 'boss:appeared', 'game:over'];
  const missing = events.filter(e => AUDIO.indexOf("'" + e + "'") < 0);
  if (missing.length) throw new Error(missing.join(', '));
});


/* ---------- ⑪ 적 스킨 ---------- */
console.log('\n적 스킨');

const SK2 = RPD.EnemySkins;
const MECH = ['grunt', 'swift', 'tank', 'armored', 'swarm', 'regen', 'splitter', 'splitling', 'shielded'];

run('스킨 그림 파일이 전부 있다', () => {
  const missing = SK2.allFiles().filter(f => !fs.existsSync(path.join(ROOT, f)));
  if (missing.length) throw new Error(missing.join(', '));
});

run('모든 구간에서 모든 적 성질에 그림이 붙는다', () => {
  const bad = [];
  for (const w of [1, 9, 11, 19, 21, 29, 31, 39, 41, 49, 60]) {
    for (const id of MECH) {
      if (!SK2.resolve(RPD.EnemyData.get(id), w)) bad.push(`R${w}:${id}`);
    }
  }
  if (bad.length) throw new Error(bad.slice(0, 8).join(', '));
});

run('보스는 10라운드마다 다른 몬스터다', () => {
  const names = [10, 20, 30, 40, 50].map(w => SK2.resolve(RPD.EnemyData.get('boss_charger'), w).name);
  if (new Set(names).size !== names.length) throw new Error(names.join(' / '));
});

run('노멀·챌린지가 70라운드가 되면서 최종형도 70으로 옮겨갔다', () => {
  const name = w => SK2.resolve(RPD.EnemyData.get('boss_charger'), w).name;
  if (name(50) !== '오메가몬(최종형)') throw new Error('50R: ' + name(50));
  if (name(70) !== '오메가몬(최종형)') throw new Error('70R(진짜 마지막): ' + name(70));
  if (name(71) === '오메가몬(최종형)') throw new Error('71R(엔드리스 연장분)까지 최종형이다: ' + name(71));
});

run('10라운드 단위로 일반 몬스터 계열이 바뀐다', () => {
  const grunts = [5, 15, 25, 35, 45].map(w => SK2.resolve(RPD.EnemyData.get('grunt'), w).name);
  if (new Set(grunts).size !== 5) throw new Error(grunts.join(' / '));
});

run('스킨은 그림과 이름만 바꾼다 (체력·속도·방어는 그대로)', () => {
  RPD.GameManager.reset('NORMAL');
  const saved = RPD.EnemySkins;
  const withSkin = RPD.EnemyManager.spawn('tank', 25);
  RPD.EnemySkins = null;
  const without = RPD.EnemyManager.spawn('tank', 25);
  RPD.EnemySkins = saved;
  for (const k of ['maxHp', 'baseSpeed', 'armor', 'size']) {
    if (withSkin[k] !== without[k]) throw new Error(`${k}: ${withSkin[k]} ≠ ${without[k]}`);
  }
  if (withSkin.name === without.name) throw new Error('이름이 안 바뀌었다');
  RPD.EnemyManager.reset();
});


/* ---------- ⑫ 소환 상한 · 소환권 · 보스 보상 ---------- */
console.log('\n소환 상한 · 보스 보상');

function freshSummon(wave) {
  RPD.GameManager.reset('NORMAL');
  RPD.GameManager.setWave(wave);
  RPD.FieldManager.init();
  RPD.StorageManager.reset();
  RPD.SummonManager.reset && RPD.SummonManager.reset();
}

run('소환에서는 희귀함·전설이 절대 나오지 않는다 (천장 포함)', () => {
  freshSummon(50);
  const leaked = {};
  for (let i = 0; i < 6000; i++) {
    const t = RPD.SummonManager.rollTier();
    if (t === 'T4' || t === 'T5') leaked[t] = (leaked[t] || 0) + 1;
  }
  if (Object.keys(leaked).length) throw new Error(JSON.stringify(leaked));
});

run('소환권으로도 희귀함·전설이 나오지 않는다', () => {
  freshSummon(50);
  RPD.GameManager.gold = 0;
  RPD.SummonManager.tickets = 300;
  const bad = [];
  for (let i = 0; i < 300; i++) {
    RPD.FieldManager.init(); RPD.StorageManager.reset();
    const r = RPD.SummonManager.summon();
    if (r.ok && (r.tier === 'T4' || r.tier === 'T5')) bad.push(r.tier);
  }
  if (bad.length) throw new Error(`${bad.length}회 새어 나왔다`);
});

run('소환권이 있으면 골드 없이 뽑힌다', () => {
  freshSummon(12);
  RPD.GameManager.gold = 0;
  RPD.SummonManager.tickets = 2;
  const r = RPD.SummonManager.summon();
  if (!r.ok) throw new Error(r.reason);
  if (RPD.SummonManager.tickets !== 1) throw new Error('소환권이 줄지 않았다');
});

const RW = RPD.RewardManager;
RW.init();   // 이 검사 환경은 main.js 를 거치지 않으므로 직접 연결한다

/* 세션 33 ⑤ 상향 — 보스를 "무조건 잡을" 만큼. 몇 번째 보스인가로 찾는다. */
run('보스 보상이 상향안대로다 (1번째 특별함2+소환권2 · 2번째 희귀함+특별함+소환권3 · 3번째 희귀함2+소환권3 · 4번째 전설+소환권3+초월의 조각)', () => {
  const d = w => JSON.stringify(RW.rewardsFor(w, RPD.Modes.NORMAL).map(r => [r.kind, r.tier || r.item || null, r.count]));
  const want = {
    10: [['unit', 'T3', 2], ['ticket', null, 2]],
    20: [['unit', 'T4', 1], ['unit', 'T3', 1], ['ticket', null, 3]],
    30: [['unit', 'T4', 2], ['ticket', null, 3]],
    40: [['unit', 'T5', 1], ['ticket', null, 3], ['item', 'transcendShard', 1]]
  };
  for (const w in want) if (d(Number(w)) !== JSON.stringify(want[w])) throw new Error(w + 'R ' + d(Number(w)));
});

run('엔드리스(7라운드마다 보스)도 보스마다 보상을 받는다', () => {
  const E = RPD.Modes.ENDLESS;
  if (!RW.rewardsFor(7, E) || RW.bossIndex(7, E) !== 1) throw new Error('7R 첫 보스에 보상이 없다');
  if (RW.bossIndex(28, E) !== 4) throw new Error('28R 이 4번째 보스가 아니다');
  if (RW.rewardsFor(10, E)) throw new Error('엔드리스 10R(보스 아님)에 보상이 있다');
});

run('보스 러시는 10·20라운드에만 보상(매 라운드 주면 무너진다)', () => {
  const B = RPD.Modes.BOSS_RUSH;
  if (RW.rewardsFor(3, B) || RW.rewardsFor(15, B)) throw new Error('10의 배수가 아닌데 보상이 있다');
  if (!RW.rewardsFor(10, B) || !RW.rewardsFor(20, B)) throw new Error('10·20R 보상이 없다');
});

run('보스 처치 골드가 상향됐다(300+25R) · 미리보기에 골드가 맨 앞에 보인다', () => {
  freshSummon(10);
  const EC = RPD.EconomyManager;
  if (EC.bossGoldBase(10) !== 550 || EC.bossGoldBase(40) !== 1300) throw new Error(EC.bossGoldBase(10) + ' / ' + EC.bossGoldBase(40));
  const n = RW.next(5);
  if (n.wave !== 10 || !n.rewards || n.rewards[0].kind !== 'gold' || n.rewards[0].amount < 550) {
    throw new Error(JSON.stringify(n.rewards && n.rewards[0]));
  }
});

run('보상은 10의 배수 라운드에만 · 같은 라운드는 한 번만', () => {
  if (RW.rewardsFor(15) || RW.rewardsFor(7)) throw new Error('10의 배수가 아닌데 보상이 있다');
  freshSummon(10);
  RW.reset();
  const a = RW.grant(10), b = RW.grant(10);
  if (!a || b) throw new Error('두 번 받았다');
});

run("6·7번째 보스(60·70R) 보상이 있다 — 70R 이 진짜 마지막이라 5번째보다 크다", () => {
  const r6 = RW.rewardsFor(60, RPD.Modes.NORMAL), r7 = RW.rewardsFor(70, RPD.Modes.NORMAL);
  if (!r6 || !r7) throw new Error('60R 또는 70R에 보상이 없다');
  const legends = r7.filter(r => r.kind === 'unit' && r.tier === 'T5').reduce((a, r) => a + r.count, 0);
  if (legends < 2) throw new Error('70R(진짜 마지막)이 5번째(전설 1)보다 안 크다: 전설 ' + legends);
});

run('보스를 잡으면 실제로 보상이 들어온다', () => {
  freshSummon(30);
  RW.reset();
  const before = RPD.StorageManager.allUnits().length;
  const boss = RPD.EnemyManager.spawn('boss_charger', 30);
  RPD.bus.emit('enemy:died', { enemy: boss });
  const got = RPD.StorageManager.allUnits().filter(u => u.tier === 'T4').length;
  if (RPD.StorageManager.allUnits().length !== before + 2 || got !== 2) throw new Error('희귀함 2마리가 안 들어왔다: ' + got);
  RPD.EnemyManager.reset();
});

run('자리가 없으면 보상이 조각으로 바뀐다 (사라지지 않는다)', () => {
  freshSummon(10);
  RW.reset();
  RPD.FieldManager.slots.forEach(s => {
    if (s.unlocked && !s.unit) RPD.FieldManager.place(s.index, RPD.UnitManager.create('rattata'));
  });
  while (!RPD.StorageManager.isFull()) RPD.StorageManager.add(RPD.UnitManager.create('rattata'));
  const shards = RPD.ShardManager.shards;
  const e = RW.grant(10);
  const sh = e ? e.items.filter(i => i.kind === 'shard').length : 0;
  if (sh !== 2) throw new Error('특별함 2마리가 조각으로 안 바뀌었다(' + sh + ')');
  if (RPD.ShardManager.shards <= shards) throw new Error('조각이 안 늘었다');
});

run('조합식의 그림을 누르면 그 포켓몬의 조합식 창이 열린다', () => {
  const ui = fs.readFileSync(path.join(ROOT, 'js/ui/UIManager.js'), 'utf8');
  if (ui.indexOf('openRecipePop') < 0) throw new Error('창이 없다');
  if (ui.indexOf("closest('.rmat, .rres .spr, .rres__name')") < 0) throw new Error('그림 클릭을 받지 않는다');
  if (ui.indexOf('data-go=') < 0 || ui.indexOf('data-back') < 0) throw new Error('창 안에서 내려가기·뒤로가기가 없다');
});


/* ---------- ⑬ 특성 ---------- */
console.log('\n특성');

const TD = RPD.TraitData, TM = RPD.TraitManager;
TM.init();

function withChance(id, fn) {
  const t = TD.get(id); const old = t.chance;
  t.chance = 1;
  try { fn(t); } finally { t.chance = old; }
}
function traitField(id) {
  RPD.GameManager.reset('NORMAL');
  RPD.GameManager.setWave(20);
  RPD.FieldManager.init(); RPD.StorageManager.reset(); RPD.EnemyManager.reset();
  const u = RPD.UnitManager.create(id);
  RPD.FieldManager.place(0, u);
  RPD.UnitManager.recomputeAll();
  return u;
}
function foes(u, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const e = RPD.EnemyManager.spawn('grunt', 20);
    e.x = u.x + 20 + i * 15; e.y = u.y + 10; e.hp = e.maxHp = 1e9;
    out.push(e);
  }
  return out;
}

run('특성 데이터가 올바르다 (있는 포켓몬 · 아는 종류 · 설명)', () => {
  const NO_ROLL = ['statBonus', 'goldOnWave'];
  const bad = Object.entries(TD.list).filter(([id, t]) =>
    !RPD.PokemonData.get(id) || TD.kinds.indexOf(t.kind) < 0 || !t.name || !t.desc || !t.icon ||
    (NO_ROLL.indexOf(t.kind) < 0 && !(t.chance > 0 && t.chance <= 1)));
  if (bad.length) throw new Error(bad.map(b => b[0]).join(', '));
});

run('요청한 넷이 들어 있다 (피카츄 감전 · 고라파덕 멍함 · 나옹 금전운 · 파라스 포자)', () => {
  const want = { pikachu: '감전', psyduck: '멍함', meowth: '금전운', paras: '포자' };
  for (const id in want) if (!TD.get(id) || TD.get(id).name !== want[id]) throw new Error(id);
});

run('감전 — 주변 적에게 연쇄된다', () => withChance('pikachu', t => {
  const u = traitField('pikachu');
  const [a, b, c] = foes(u, 3);
  const hp = [b.hp, c.hp];
  TM.afterAttack(u, a, u.attack);
  if (!(b.hp < hp[0] && c.hp < hp[1])) throw new Error('주변 적이 안 맞았다');
}));

run('감전 — 확률은 공격 한 번에 한 번만 굴린다 (연쇄 타격마다가 아니다)', () => withChance('pikachu', () => {
  const u = traitField('pikachu');
  foes(u, 5);
  let procs = 0;
  const on = () => { procs++; };
  RPD.bus.on('trait:proc', on);
  RPD.CombatManager.clock = 0;
  for (let i = 0; i < 10; i++) { u.cooldown = 0; RPD.CombatManager.update(0.01); }
  RPD.bus.off('trait:proc', on);
  if (procs !== 10) throw new Error(`공격 10번에 ${procs}번 발동`);
}));

run('멍함 — 공격 대신 주변 적을 느리게 한다', () => withChance('psyduck', t => {
  const u = traitField('psyduck');
  const es = foes(u, 3);
  const skipped = TM.beforeAttack(u, es[0]);
  if (!skipped) throw new Error('공격을 쉬지 않았다');
  if (es.some(e => !(e.effects.slowUntil > RPD.EnemyManager.clock))) throw new Error('느려지지 않은 적이 있다');
  if (es[0].hp !== es[0].maxHp) throw new Error('공격도 같이 했다');
}));

run('금전운 — 처치하면 골드가 더 들어온다', () => withChance('meowth', () => {
  const u = traitField('meowth');
  const [e] = foes(u, 1);
  const gold = RPD.GameManager.gold;
  RPD.bus.emit('enemy:died', { enemy: e, source: u });
  if (!(RPD.GameManager.gold > gold)) throw new Error('골드가 안 늘었다');
}));

run('포자 — 독을 남긴다', () => withChance('paras', () => {
  const u = traitField('paras');
  const [e] = foes(u, 1);
  TM.afterAttack(u, e, u.attack);
  if (!e.effects.dots.some(d => d.kind === 'poison' || d.type === 'poison')) throw new Error('독이 없다');
}));


run('특별함은 전부 특성이 있고, 안흔함·흔함은 일부만 있다', () => {
  const by = { T1: [0, 0], T2: [0, 0], T3: [0, 0] };
  ALL.forEach(id => {
    const t = RPD.PokemonData.get(id).tier;
    if (!by[t]) return;
    by[t][1] += 1;
    if (TD.get(id)) by[t][0] += 1;
  });
  if (by.T3[0] !== by.T3[1]) throw new Error(`특별함 ${by.T3[0]}/${by.T3[1]}`);
  if (!(by.T2[0] > 0 && by.T2[0] < by.T2[1])) throw new Error(`안흔함 ${by.T2[0]}/${by.T2[1]}`);
  if (!(by.T1[0] > 0 && by.T1[0] < by.T1[1])) throw new Error(`흔함 ${by.T1[0]}/${by.T1[1]}`);
});

run('희귀함은 몇 마리만 특성이 있다 (스킬과 겹치지 않게)', () => {
  const t4 = ALL.filter(id => RPD.PokemonData.get(id).tier === 'T4');
  const has = t4.filter(id => TD.get(id));
  if (!(has.length > 0 && has.length < t4.length)) throw new Error(`${has.length}/${t4.length}`);
});

run('가시발톱 — 방어력을 깎는다', () => withChance('sandslash', () => {
  const u = traitField('sandslash');
  const [e] = foes(u, 1);
  e.effects.armorShred = 0;
  TM.afterAttack(u, e, u.attack);
  if (!(e.effects.armorShred >= TD.get('sandslash').armor)) throw new Error(`${e.effects.armorShred}`);
}));

run('행운 — 치명타율이 오른다', () => {
  const saved = TD.list.clefable; delete TD.list.clefable;
  const a = traitField('clefable'); TD.list.clefable = saved;
  const b = traitField('clefable');
  if (!(b.critRate > a.critRate)) throw new Error(`${a.critRate} → ${b.critRate}`);
});

run('특성 이름이 겹치지 않는다', () => {
  const names = Object.values(TD.list).map(t => t.name);
  const dup = names.filter((n, i) => names.indexOf(n) !== i);
  if (dup.length) throw new Error(dup.join(', '));
});

run('기절 계열(땅파기·버섯포자·초음파·노래하기)이 대상을 멈춘다', () => {
  for (const id of ['diglett', 'parasect', 'golbat', 'jigglypuff']) withChance(id, () => {
    const u = traitField(id);
    const [e] = foes(u, 1);
    TM.afterAttack(u, e, u.attack);
    if (!(e.effects.frozenUntil > RPD.EnemyManager.clock)) throw new Error(id);
    const boss = RPD.EnemyManager.spawn('boss_charger', 20);
    TM.afterAttack(u, boss, u.attack);
    if (boss.effects.frozenUntil > RPD.EnemyManager.clock) throw new Error(id + ' 가 보스를 멈췄다');
  });
});

run('감속 계열(모래바람·실뿜기)이 대상을 느리게 한다', () => {
  for (const id of ['sandshrew', 'caterpie']) withChance(id, () => {
    const u = traitField(id);
    const [e] = foes(u, 1);
    TM.afterAttack(u, e, u.attack);
    if (!(e.effects.slowUntil > RPD.EnemyManager.clock)) throw new Error(id);
  });
});

run('인분 — 대상 주변 적 모두에게 독', () => withChance('venomoth', () => {
  const u = traitField('venomoth');
  const es = foes(u, 3);
  es.forEach(e => { e.effects.dots.length = 0; });
  TM.afterAttack(u, es[0], u.attack);
  if (es.some(e => !e.effects.dots.length)) throw new Error('독이 안 걸린 적이 있다');
}));

run('도깨비불 — 화상을 남긴다', () => withChance('ninetales', () => {
  const u = traitField('ninetales');
  const [e] = foes(u, 1);
  e.effects.dots.length = 0;
  TM.afterAttack(u, e, u.attack);
  if (!e.effects.dots.length) throw new Error('화상이 없다');
}));

run('물대포 — 뒤로 밀어내되 보스는 안 밀린다', () => withChance('wartortle', () => {
  const u = traitField('wartortle');
  const [e] = foes(u, 1);
  e.distance = 400;
  TM.afterAttack(u, e, u.attack);
  if (!(e.distance < 400)) throw new Error('안 밀렸다');
  const boss = RPD.EnemyManager.spawn('boss_charger', 20);
  boss.distance = 400;
  TM.afterAttack(u, boss, u.attack);
  if (boss.distance !== 400) throw new Error('보스가 밀렸다');
}));

run('삼연타 — 한 번 더 공격하고, 추가 공격이 또 추가 공격을 부르지 않는다', () => withChance('dugtrio', () => {
  const u = traitField('dugtrio');
  foes(u, 1);
  let attacks = 0;
  const on = () => { attacks++; };
  RPD.bus.on('unit:attack', on);
  u.cooldown = 0; RPD.CombatManager.update(0.01);
  RPD.bus.off('unit:attack', on);
  if (attacks !== 2) throw new Error(`공격 ${attacks}번`);
}));

run('분노·뿔드릴 — 보스에게만 피해가 늘어난다', () => {
  withChance('mankey', () => {
    const u = traitField('mankey');
    const [e] = foes(u, 1);
    const hp = e.hp;
    TM.afterAttack(u, e, 100);
    if (e.hp !== hp) throw new Error('일반 적에게도 터졌다');
    const boss = RPD.EnemyManager.spawn('boss_charger', 20);
    boss.hp = boss.maxHp = 1e9; boss.shield = 0; boss.maxShield = 0;
    TM.afterAttack(u, boss, 100);
    if (!(boss.hp < 1e9)) throw new Error('보스에게 안 터졌다');
  });
});

run('맹화 — 체력이 낮은 적에게만 피해가 늘어난다', () => {
  const u = traitField('charmeleon');
  const [e] = foes(u, 1);
  TM.afterAttack(u, e, 100);
  if (e.hp !== e.maxHp) throw new Error('체력 가득한 적에게 터졌다');
  e.hp = e.maxHp * 0.2;
  const before = e.hp;
  TM.afterAttack(u, e, 100);
  if (!(e.hp < before)) throw new Error('체력 낮은 적에게 안 터졌다');
});

run('항상 붙는 능력치 — 앞니(공속)·복안(사거리)·급소찌르기(치명타 피해)', () => {
  const plain = id => { const saved = TD.list[id]; delete TD.list[id]; const u = traitField(id); TD.list[id] = saved; return u; };
  const r0 = plain('rattata'), r1 = traitField('rattata');
  if (!(r1.attackSpeed > r0.attackSpeed)) throw new Error('앞니');
  const v0 = plain('venonat'), v1 = traitField('venonat');
  if (!(v1.range > v0.range)) throw new Error('복안');
  const p0 = plain('persian'), p1 = traitField('persian');
  if (!(p1.critDamage > p0.critDamage)) throw new Error('급소찌르기');
});

run('광합성 — 라운드가 시작될 때 골드가 들어온다', () => {
  traitField('ivysaur');
  const gold = RPD.GameManager.gold;
  RPD.bus.emit('game:wave', { wave: 21 });
  if (RPD.GameManager.gold !== gold + TD.get('ivysaur').gold) throw new Error(`${gold} → ${RPD.GameManager.gold}`);
});

run('손가락흔들기 — 셋 중 하나가 터진다', () => withChance('clefairy', () => {
  const labels = new Set();
  const on = p => { if (p.info && p.info.label) labels.add(p.info.label); };
  RPD.bus.on('trait:proc', on);
  for (let i = 0; i < 60; i++) {
    const u = traitField('clefairy');
    const es = foes(u, 3);
    TM.afterAttack(u, es[0], u.attack);
  }
  RPD.bus.off('trait:proc', on);
  if (labels.size < 3) throw new Error([...labels].join(','));
  RPD.EnemyManager.reset();
}));

run('특성이 없는 포켓몬은 아무 일도 없다', () => {
  const u = traitField('charmander');
  const [e] = foes(u, 1);
  if (TM.beforeAttack(u, e)) throw new Error('공격을 쉬었다');
  TM.afterAttack(u, e, u.attack);
  if (e.effects.dots.length) throw new Error('뭔가 걸렸다');
  RPD.EnemyManager.reset();
});


/* ---------- ⑭ 단축키 · 끌기 · 흔함 비중 · 조각 가격 · 버퍼 패시브 ---------- */
console.log('\n조작 · 소환 · 버퍼');

const HUD = fs.readFileSync(path.join(ROOT, 'js/ui/HudPanels.js'), 'utf8');
const UIM = fs.readFileSync(path.join(ROOT, 'js/ui/UIManager.js'), 'utf8');

run('단축키가 지정돼 있다 (소환·강화·창고로·필드로·방출·조합·배속·일시정지)', () => {
  for (const k of ["' ': 'btnSummon'", "'w': 'btnUpgrade'", "'s': 'btnStore'", "'c': 'btnCraft'", "'p': 'btnPause'", "'1': 'speed1'"]) {
    if (HUD.indexOf(k) < 0) throw new Error(k);
  }
  if (HUD.indexOf("key === 'f'") < 0 || HUD.indexOf("key === 'x'") < 0) throw new Error('F·X 가 없다');
  if (HUD.indexOf("tag === 'INPUT'") < 0) throw new Error('입력칸에서 가로챈다');
});

run('창고 ↔ 필드 끌어놓기가 있다', () => {
  if (UIM.indexOf('ownedDragEnd') < 0) throw new Error('창고 → 필드 끌기가 없다');
  if (UIM.indexOf('overOwnedPane') < 0) throw new Error('필드 → 창고 끌기가 없다');
  if (/mouseleave[^}]*cancelDrag/.test(UIM)) throw new Error('캔버스를 벗어나면 끌기가 끊긴다');
});

run('창고에서 끌어 놓으면 빈 칸엔 배치, 찬 칸과는 맞바꾼다', () => {
  RPD.FieldManager.init(); RPD.StorageManager.reset();
  RPD.StorageManager.add(RPD.UnitManager.create('pikachu'));
  // 끌어놓기는 StorageManager.deploy(창고 순번, 칸) 를 부른다 — 같은 규칙을 직접 확인한다
  const drag = (id, slot) => RPD.StorageManager.deploy(RPD.StorageManager.indexOfSpecies(id), slot);
  let r = drag('pikachu', 0);
  if (!r.ok || RPD.FieldManager.get(0).unit.defId !== 'pikachu') throw new Error('빈 칸 배치 실패');
  RPD.StorageManager.add(RPD.UnitManager.create('meowth'));
  r = drag('meowth', 0);
  if (!r.ok || RPD.FieldManager.get(0).unit.defId !== 'meowth') throw new Error('맞바꾸기 실패');
  if (RPD.StorageManager.indexOfSpecies('pikachu') < 0) throw new Error('밀려난 개체가 창고로 안 갔다');
});

run('흔함은 어느 라운드에도 50% 밑으로 내려가지 않는다', () => {
  for (const w of [17, 25, 33, 45, 60]) {
    freshSummon(w);
    let c = 0; const N = 5000;
    for (let i = 0; i < N; i++) if (RPD.SummonManager.rollTier() === 'T1') c++;
    // 확정 천장(25회마다 특별함)이 끼어드는 몫만큼 아주 조금 여유를 둔다
    if (c / N < 0.48) throw new Error(`R${w} 흔함 ${(c / N * 100).toFixed(1)}%`);
    const base = RPD.SummonTable.oddsFor(w);
    if (base.T1 < 49.99) throw new Error(`R${w} 표시 확률 ${base.T1}%`);
  }
});

run('조각 가격 — 흔함 5 · 안흔함 10 · 특별함 25', () => {
  const S = RPD.ShardManager;
  const got = [S.priceFor('T1'), S.priceFor('T2'), S.priceFor('T3')].join('/');
  if (got !== '5/10/25') throw new Error(got);
});

run('버퍼 패시브 — 특별함 이상 버퍼 전부에게 있다', () => {
  const buffers = ALL.map(id => RPD.PokemonData.get(id))
    .filter(d => d.role === 'BUFFER' && ['T3', 'T4', 'T5'].indexOf(d.tier) >= 0);
  const missing = buffers.filter(d => !RPD.AuraData.get(d.id)).map(d => d.id);
  if (!buffers.length) throw new Error('버퍼가 없다');
  if (missing.length) throw new Error(missing.join(', '));
});

run('버퍼 패시브 — 옆 칸 아군만 받는다', () => {
  RPD.FieldManager.init(); RPD.StorageManager.reset();
  const F = RPD.FieldManager;
  const buffer = F.slots[0], near = F.slots.find(s => s !== buffer && RPD.UnitManager.isNeighbor(buffer, s));
  const far = F.slots.find(s => s.unlocked && !RPD.UnitManager.isNeighbor(buffer, s) && s !== buffer);
  F.place(near.index, RPD.UnitManager.create('rattata'));
  F.place(far.index, RPD.UnitManager.create('rattata'));
  RPD.UnitManager.recomputeAll();
  const before = near.unit.attackSpeed;
  F.place(buffer.index, RPD.UnitManager.create('chansey'));   // 치유의파동 — 공격속도
  RPD.UnitManager.recomputeAll();
  if (!(near.unit.attackSpeed > before)) throw new Error('옆 칸이 안 받았다');
  if (far.unit.attackSpeed !== before) throw new Error('먼 칸도 받았다');
});

run('보유 포켓몬을 타입별로 묶어 볼 수 있다', () => {
  const page = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  if (page.indexOf('data-sort="type"') < 0) throw new Error('타입별 칩이 없다');
  if (UIM.indexOf('renderByType') < 0) throw new Error('묶어 그리는 코드가 없다');
});


run('설명서 — 단축키·조각 상점 두 쪽이 있고 H 로 열린다', () => {
  const page = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  for (const k of ['id="helpOverlay"', 'data-page="keys"', 'data-page="shard"', 'id="btnHelp"']) {
    if (page.indexOf(k) < 0) throw new Error(k + ' 가 없다');
  }
  if (HUD.indexOf("key === 'h'") < 0) throw new Error('H 단축키가 없다');
});

run('설명서의 숫자가 실제 게임과 같다 (가격·방출 조각·해금 라운드)', () => {
  // 설명서가 게임보다 늦게 고쳐지는 일을 막는다 — 가격을 바꾸면 여기서 걸린다
  const page = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const shard = page.slice(page.indexOf('data-page="shard"'), page.indexOf('</section>', page.indexOf('data-page="shard"')));
  const S = RPD.ShardManager;
  const want = [
    '<td>흔함</td><td>' + S.priceFor('T1') + '</td>',
    '<td>안흔함</td><td>' + S.priceFor('T2') + '</td>',
    '<td>특별함</td><td>' + S.priceFor('T3') + '</td>',
    '<td>희귀함</td><td>' + S.priceFor('T4') + ' — ' + RPD.Tiers.T4.unlockRound + '라운드부터',
    '<td>전설</td><td>' + S.priceFor('T5') + ' — ' + RPD.Tiers.T5.unlockRound + '라운드부터',
    '흔함 ' + S.gainFor('T1') + ' · 안흔함 ' + S.gainFor('T2') + ' · 특별함 ' + S.gainFor('T3') +
      ' · 희귀함 ' + S.gainFor('T4') + ' · 전설 ' + S.gainFor('T5')
  ];
  const stale = want.filter(w => shard.indexOf(w) < 0);
  if (stale.length) throw new Error('설명서가 다르다: ' + stale.join(' | '));
});


/* ---------- ⑮ 난이도 · 기록 · 칭호 ---------- */
console.log('\n난이도 · 칭호');

run('일반 모드 이름과 난이도 4단계', () => {
  if (RPD.Modes.NORMAL.label !== '일반') throw new Error(RPD.Modes.NORMAL.label);
  const labels = RPD.DIFFICULTY_ORDER.map(id => RPD.Difficulties[id].label).join(',');
  if (labels !== '쉬움,보통,어려움,지옥') throw new Error(labels);
});

run('보통은 지금까지와 똑같다 (모든 배율 1)', () => {
  const d = RPD.Difficulties.NORMAL;
  if (d.hpMul !== 1 || d.lifeAdd !== 0 || d.bossShareMul !== 1 || d.goldMul !== 1) throw new Error(JSON.stringify(d));
});

run('난이도가 오를수록 적 체력이 늘고 라이프가 준다', () => {
  const hp = [], life = [];
  for (const id of RPD.DIFFICULTY_ORDER) {
    RPD.GameManager.reset('NORMAL', id);
    hp.push(RPD.WaveData.scaleHp(100, 30, RPD.GameManager.mode));
    life.push(RPD.GameManager.life);
  }
  for (let i = 1; i < hp.length; i++) {
    if (!(hp[i] > hp[i - 1])) throw new Error('체력 ' + hp.join('<'));
    if (!(life[i] < life[i - 1])) throw new Error('라이프 ' + life.join('>'));
  }
  RPD.GameManager.reset('NORMAL', 'NORMAL');
});

run('다른 모드에는 난이도가 붙지 않는다', () => {
  RPD.GameManager.reset('BOSS_RUSH', 'HELL');
  if (RPD.GameManager.mode.difficulty !== 'NORMAL' || RPD.GameManager.mode.label !== RPD.Modes.BOSS_RUSH.label) {
    throw new Error(RPD.GameManager.mode.label);
  }
  RPD.GameManager.reset('NORMAL', 'NORMAL');
});

run('기록은 난이도별로 따로 남는다', () => {
  const S = RPD.SaveManager;
  S.data.records = {}; S.data.clearsBy = {}; S.data.totals.clears = 0;
  S.submitRun('NORMAL:EASY', { wave: 50, kills: 1, elapsed: 1 }, true);
  S.submitRun('NORMAL:HARD', { wave: 30, kills: 1, elapsed: 1 }, false);
  if (S.clearsFor('NORMAL:EASY') !== 1 || S.clearsFor('NORMAL:HARD') !== 0) throw new Error(JSON.stringify(S.data.clearsBy));
  if (!S.recordFor('NORMAL:HARD') || S.recordFor('NORMAL:HARD').wave !== 30) throw new Error('어려움 기록이 없다');
});

run('칭호 — 1회 새내기 트레이너, 보너스는 쌓인다', () => {
  const PM = RPD.ProgressManager;
  if (!PM.title(1) || PM.title(1).name !== '새내기 트레이너') throw new Error(PM.title(1) && PM.title(1).name);
  if (PM.title(0)) throw new Error('0회인데 칭호가 있다');
  const b1 = PM.bonus(1), b5 = PM.bonus(5);
  if (!(b1.gold > 0)) throw new Error('1회 보너스가 없다');
  if (!(b5.gold >= b1.gold && b5.tickets >= 1 && b5.shards > 0)) throw new Error('보너스가 쌓이지 않는다');
});

run('시작 보너스가 판을 세울 때 실제로 들어온다', () => {
  const S = RPD.SaveManager, PM = RPD.ProgressManager;
  S.data.totals.clears = 5;
  RPD.GameManager.reset('NORMAL', 'NORMAL');
  RPD.SummonManager.reset(); RPD.ShardManager.reset();
  RPD.FieldManager.init(); RPD.StorageManager.reset();
  const gold = RPD.GameManager.gold;
  PM.applyStartBonus();
  const b = PM.bonus(5);
  if (RPD.GameManager.gold !== gold + b.gold) throw new Error('골드');
  if (RPD.SummonManager.tickets !== b.tickets) throw new Error('소환권');
  if (RPD.ShardManager.shards !== b.shards) throw new Error('조각');
  S.data.totals.clears = 0;
});

run('난이도 첫 클리어 칭호(어려움·지옥)가 있다', () => {
  const sp = RPD.TitleData.special;
  if (!sp.HARD || !sp.HELL) throw new Error('없다');
});


/* ---------- ⑯ 1세대 확장 · 소환 풀 · 메타몽 ---------- */
console.log('\n1세대 확장');

run('1세대 151종 + 왕구리 = 152종 로스터 · 그림이 전부 있다', () => {
  const list = RPD.PokemonData.list;
  const base = list.filter(d => !d.form);          // 초월 폼은 원본 그림을 쓴다
  if (base.length !== 152) throw new Error(`${base.length}종`);
  const missing = list.filter(d => !fs.existsSync(path.join(ROOT, d.sprite))).map(d => d.id);
  if (missing.length) throw new Error(missing.join(', '));
});

run('진화하면 반드시 등급이 오른다', () => {
  const bad = RPD.PokemonData.list.filter(d => d.evolvesFrom &&
    RPD.TIER_ORDER.indexOf(RPD.PokemonData.get(d.evolvesFrom).tier) >= RPD.TIER_ORDER.indexOf(d.tier));
  if (bad.length) throw new Error(bad.map(d => d.id).join(', '));
});

/* 조합식 개편 v2 — 판마다 계열을 추첨하던 방식(PoolManager)을 없앴다.
 * 재료가 전부 이름으로 못박혀 있어, 추첨에서 빠진 계열이 있으면 조합이 그대로 막힌다. */
run('계열 추첨이 없고, 소환은 summon 표시 종 전부에서 나온다', () => {
  if (RPD.PoolManager) throw new Error('PoolManager 가 남아 있다');
  freshSummon(30);
  const seen = {};
  for (let i = 0; i < 3000; i++) {
    const t = ['T1', 'T2', 'T3'][i % 3];
    const id = RPD.SummonManager.pickSpecies(t);
    const d = RPD.PokemonData.get(id);
    if (!d.summon || d.hidden) throw new Error(id + ' 는 소환 대상이 아닌데 나왔다');
    seen[id] = 1;
  }
  const pool = ['T1', 'T2', 'T3'].reduce((a, t) => a.concat(RPD.PokemonData.summonPool(t)), []);
  const never = pool.filter(id => !seen[id]);
  if (never.length) throw new Error('3000회 동안 한 번도 안 나왔다: ' + never.join(', '));
});

run('소환으로 안 나오는 종도 조각으로는 살 수 있다(히든 제외)', () => {
  freshSummon(30);
  RPD.ShardManager.reset(); RPD.ShardManager.add(9999, 'test');
  const craftOnly = RPD.PokemonData.list.find(d => d.tier === 'T2' && !d.summon && !d.hidden);
  const r = RPD.ShardManager.buy(craftOnly.id);
  if (!r.ok) throw new Error(craftOnly.id + ' ' + r.reason);
  const hid = RPD.PokemonData.list.find(d => d.hidden);
  if (RPD.ShardManager.buy(hid.id).ok) throw new Error(hid.id + ' (히든)을 조각으로 샀다');
});

run('메타몽이 모자란 흔함 한 마리를 대신한다', () => {
  freshSummon(12);
  RPD.GameManager.gold = 0;
  const recipe = RPD.RecipeData.get('metapod');   // 캐터피 ×2
  RPD.StorageManager.add(RPD.UnitManager.create('caterpie'));
  RPD.StorageManager.add(RPD.UnitManager.create('ditto'));
  RPD.RecipeManager.refresh();
  const v = RPD.RecipeManager.view.find(x => x.resultId === 'metapod');
  if (!v.ready) throw new Error('캐터피 1 + 메타몽으로 완성되지 않는다');
  if (!v.materials.some(m => m.viaDitto)) throw new Error('대신한 표시가 없다');
  const r = RPD.RecipeManager.craft('metapod');
  if (!r || r.ok === false) throw new Error('조합 실패');
  if (RPD.StorageManager.allUnits().some(u => u.defId === 'ditto')) throw new Error('메타몽이 소모되지 않았다');
});

run('메타몽은 흔함만 대신하고 한 조합식에 한 마리만 쓴다', () => {
  freshSummon(20);
  RPD.StorageManager.add(RPD.UnitManager.create('ditto'));
  RPD.StorageManager.add(RPD.UnitManager.create('ditto'));
  RPD.RecipeManager.refresh();
  const v = RPD.RecipeManager.view.find(x => x.resultId === 'metapod');
  if (v.ready) throw new Error('메타몽 2마리로 캐터피 2마리를 대신했다');
  const hi = RPD.RecipeManager.view.find(x => x.resultId === 'butterfree');   // 단데기 ×2 + 특별함
  if (hi.materials.some(m => m.viaDitto)) throw new Error('흔함이 아닌 재료를 대신했다');
});


/* ---------- ⑰ 조합 사전 ---------- */
console.log('\n조합 사전');

// 사전은 ui 폴더라 이 검사 환경에서 따로 읽는다(DOM 없이 계산 부분만 쓴다)
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/ui/RecipeBook.js'), 'utf8'), sandbox);
const BK = RPD.RecipeBook;

run('조합 사전이 화면에 있고 R 로 열린다', () => {
  const page = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  for (const id of ['bookOverlay', 'bookSearch', 'bookList', 'btnBook']) {
    if (page.indexOf('id="' + id + '"') < 0) throw new Error(id);
  }
  if (HUD.indexOf("key === 'r'") < 0) throw new Error('R 단축키가 없다');
});

run('흔함 환산 — 조합식을 흔함까지 끝까지 푼다', () => {
  if (BK.commonCost('metapod') !== 2) throw new Error('단데기 ' + BK.commonCost('metapod'));
  // 이상해꽃(전설) — 히든 재료가 없는 계보라 끝까지 풀면 흔함만 남는다
  const e = BK.expand('venusaur');
  const left = Object.keys(e).filter(k => RPD.PokemonData.get(k).tier !== 'T1');
  if (left.length) throw new Error('흔함이 아닌 게 남았다: ' + left);
  const n = Object.keys(e).reduce((a, k) => a + e[k], 0);
  if (n !== BK.commonCost('venusaur')) throw new Error(`풀어 센 ${n} ≠ 환산 ${BK.commonCost('venusaur')}`);
  if (!(e.bulbasaur >= 4)) throw new Error('이상해풀 ×2 의 이상해씨 4마리가 없다: ' + JSON.stringify(e));
});

run('조합 사전 — 모르는 주문도 재료·문구는 보이고 결과만 그림자다', () => {
  RPD.SaveManager.data.spells = {};
  // 재료가 다 보이므로 흔함 환산도 주문까지 끝까지 푼다
  const e = BK.expand('vaporeon');           // 샤미드 = 이브이🔒 + 쥬쥬
  if (e.eevee) throw new Error('이브이를 풀지 않았다: ' + JSON.stringify(e));
  const src = fs.readFileSync(path.join(ROOT, 'js/ui/RecipeBook.js'), 'utf8');
  if (src.indexOf('RPD.UI.shadow(def') < 0) throw new Error('모르는 결과를 그림자로 그리지 않는다');
  if (/if \(!known\) \{\s*return '<article/.test(src)) throw new Error('모르는 주문을 따로 가리는 줄이 남아 있다');
})

run('흔함 환산이 등급 순서를 지킨다 (전설 > 희귀함 > 특별함 > 안흔함 평균)', () => {
  const avg = t => {
    const ids = RPD.RecipeData.list.filter(r => RPD.PokemonData.get(r.id).tier === t).map(r => r.id);
    return ids.reduce((a, id) => a + BK.commonCost(id), 0) / ids.length;
  };
  const a = ['T2', 'T3', 'T4', 'T5'].map(avg);
  for (let i = 1; i < a.length; i++) if (!(a[i] > a[i - 1])) throw new Error(a.map(x => x.toFixed(1)).join(' < '));
});


/* ---------- ⑱ 히든 · 불멸 · 초월 (주문) ---------- */
console.log('\n히든 · 불멸 · 초월');

const SPD = RPD.SpellData, SPM = RPD.SpellManager;
SPM.init();
function spellField() {
  freshSummon(41);
  SPM.reset();
  RPD.GameManager.setState && RPD.GameManager.setState('RUNNING');
}
function give(ids) { ids.forEach(id => RPD.StorageManager.add(RPD.UnitManager.create(id))); }

run('주문 데이터가 규칙을 지킨다', () => {
  const seen = {};
  SPD.list.forEach(sp => {
    const res = RPD.PokemonData.get(sp.result);
    if (!res) throw new Error(sp.id + ' 결과 없음');
    // 히든은 등급이 아니라 얻는 법 — 결과가 hidden 표시 종이면 된다. 불멸·초월은 특수 등급.
    if (sp.kind === 'hidden' && !res.hidden) throw new Error(sp.id + ' 히든 주문인데 결과가 히든이 아니다');
    if (sp.kind === 'immortal' && res.tier !== 'T6') throw new Error(sp.id + ' 불멸 주문인데 결과가 불멸이 아니다');
    if (sp.kind === 'transcend' && res.tier !== 'T7') throw new Error(sp.id + ' 초월 주문인데 결과가 초월이 아니다');
    sp.materials.forEach(m => { if (!RPD.PokemonData.get(m)) throw new Error(sp.id + ' 재료 ' + m); });
    const rank = t => RPD.ALL_TIERS.indexOf(t);
    sp.materials.forEach(m => {
      if (rank(RPD.PokemonData.get(m).tier) >= rank(res.tier)) throw new Error(sp.id + ' 재료 ' + m + ' 가 결과보다 높다');
    });
    const legends = sp.materials.filter(m => RPD.PokemonData.get(m).tier === 'T5').length;
    const legendUp = sp.materials.filter(m => rank(RPD.PokemonData.get(m).tier) >= rank('T5')).length;
    if (sp.kind === 'immortal' && legends < 3) throw new Error(sp.id + ' 불멸인데 전설 ' + legends);
    if (sp.kind === 'transcend' && legendUp < 1) throw new Error(sp.id + ' 초월인데 전설 이상이 없음');
    const key = SPD.normalize(sp.phrase);
    if (seen[key]) throw new Error('주문이 겹친다: ' + sp.phrase);
    seen[key] = 1;
    if (!sp.lines || !sp.lines.length) throw new Error(sp.id + ' 대사 없음');
  });
});

run('주문으로만 만드는 종(히든·불멸·초월)은 소환·조각 상점·보스 보상에 나오지 않는다', () => {
  const only = RPD.PokemonData.list.filter(d => d.hidden || RPD.Tiers[d.tier].special).map(d => d.id);
  if (only.length < 36) throw new Error('주문 전용 종이 ' + only.length + '종뿐이다');
  freshSummon(45);
  RPD.ShardManager.reset(); RPD.ShardManager.add(99999, 'test');
  only.forEach(id => { if (RPD.ShardManager.buy(id).ok) throw new Error(id + ' 을 조각으로 샀다'); });
  RPD.TIER_ORDER.forEach(t => {
    if (RPD.PokemonData.summonPool(t).some(id => only.indexOf(id) >= 0)) throw new Error(t + ' 소환 풀에 주문 전용이 있다');
    if (RPD.PokemonData.rewardPool(t).some(id => only.indexOf(id) >= 0)) throw new Error(t + ' 보상 풀에 주문 전용이 있다');
  });
});

run('주문은 띄어쓰기·문장부호를 무시한다', () => {
  if (!SPD.byPhrase('개구리의왕') || !SPD.byPhrase(' 개구리 의  왕! ')) throw new Error('못 알아듣는다');
  if (SPD.byPhrase('개구리')) throw new Error('일부만 맞아도 된다');
});

run('히든 — 재료가 모자라면 "아직 때가 아니다", 있으면 만들어진다', () => {
  spellField();
  let r = SPM.cast('개구리의 왕');
  if (r.ok || r.reason !== 'NOT_READY') throw new Error('재료 없이 ' + r.reason);
  give(['poliwag', 'poliwhirl', 'ditto']);
  r = SPM.cast('개구리의 왕');
  if (!r.ok) throw new Error(r.reason);
  const all = RPD.StorageManager.allUnits().map(u => u.defId);
  if (all.indexOf('politoed') < 0) throw new Error('왕구리가 없다');
  if (all.some(id => ['poliwag', 'poliwhirl', 'ditto'].indexOf(id) >= 0)) throw new Error('재료가 남았다');
});

run('틀린 주문은 아무 일도 없다', () => {
  spellField();
  const n = RPD.StorageManager.allUnits().length;
  const r = SPM.cast('안녕하세요');
  if (r.ok || r.reason !== 'UNKNOWN') throw new Error(r.reason);
  if (RPD.StorageManager.allUnits().length !== n) throw new Error('뭔가 바뀌었다');
});

run('불멸 — 전설 셋으로 여러 번 만들 수 있고, 원본 종 자체가 불멸이다', () => {
  spellField();
  const sp = SPD.forResult('moltres');       // 파이어 = 리자몽 + 윈디 + 피죤투
  give(sp.materials.concat(sp.materials));
  if (!SPM.cast(sp.phrase).ok) throw new Error('첫 번째 실패');
  if (!SPM.cast(sp.phrase).ok) throw new Error('두 번째 실패');
  const got = RPD.StorageManager.allUnits().filter(u => u.defId === 'moltres');
  if (got.length !== 2) throw new Error(`파이어 ${got.length}마리`);
  if (got[0].def.tier !== 'T6') throw new Error('파이어가 불멸 등급이 아니다');
});

run('초월 — 조각이 있어야 하고 판당 하나뿐이다', () => {
  spellField();
  give(['mewtwo', 'mew', 'mewtwo', 'mew']);
  // v2 에서 「나는 누구인가」는 불멸 뮤츠의 주문이 됐다 — 초월 뮤츠는 「나는 나다」
  let r = SPM.cast('나는 나다');
  if (r.ok || r.reason !== 'NO_SHARD') throw new Error('조각 없이 ' + r.reason);
  RPD.bus.emit('reward:granted', { wave: 40, items: [{ kind: 'item', item: 'transcendShard', count: 2 }] });
  r = SPM.cast('나는 나다');
  if (!r.ok) throw new Error(r.reason);
  r = SPM.cast('나는 나다');
  if (r.ok || r.reason !== 'ONCE') throw new Error('두 번째 초월이 ' + (r.ok ? '됐다' : r.reason));
});

run('40라운드 보스 보상에 초월의 조각이 있다', () => {
  const r40 = RPD.RewardManager.rewardsFor(40);
  if (!r40.some(r => r.kind === 'item' && r.item === 'transcendShard')) throw new Error(JSON.stringify(r40));
});

run('처음 성공한 주문은 기록된다(조합 사전에 공개)', () => {
  RPD.SaveManager.data.spells = {};
  spellField();
  give(['poliwag', 'poliwhirl', 'ditto']);
  const r = SPM.cast('개구리의 왕');
  if (!r.firstTime) throw new Error('첫 발견으로 기록되지 않았다');
  if (!RPD.SaveManager.knowsSpell('frog_king')) throw new Error('기록이 없다');
});

/* v2 — 히든은 등급이 아니다. 히든 종은 자기 등급의 일반 종과 같은 세기다. */
run('강함 순서 — 안흔함 < 특별함 < 희귀함 < 전설 < 불멸 < 초월', () => {
  const avg = t => {
    const a = RPD.PokemonData.list.filter(d => d.tier === t).map(d => d.attack);
    return a.reduce((x, y) => x + y, 0) / a.length;
  };
  const order = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map(avg);
  for (let i = 1; i < order.length; i++) if (!(order[i] > order[i - 1])) throw new Error(order.map(Math.round).join(' < '));
});


/* ---------- ⑨ 화면 구성 ---------- */
console.log('\n화면 구성');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const css = ['main', 'game', 'ui']
  .map(n => fs.readFileSync(path.join(ROOT, 'css', n + '.css'), 'utf8')).join('\n');

const NEEDED_IDS = ['oddsBar', 'rangeChips', 'synergyBody', 'synergyCount', 'recipeList', 'recipeFilter',
  'storageList', 'ownedPop', 'ownedCount', 'slotCard', 'slotBody', 'actionToast',
  'dexMiniList', 'dexMiniBar', 'btnSummon', 'btnUpgrade', 'btnSell', 'btnCraft', 'statLife', 'statGold'];
run('새 화면 요소가 전부 있다', () => {
  const missing = NEEDED_IDS.filter(id => html.indexOf('id="' + id + '"') < 0);
  if (missing.length) throw new Error(missing.join(', '));
});

const REGIONS = ['.hud', '.board', '.dock', '.side', '.pane--action', '.pane--recipes', '.pane--owned',
  '.pane--synergy', '.pane--dex'];
run('레이아웃 영역 9개가 CSS 에 정의돼 있다', () => {
  const missing = REGIONS.filter(sel => css.indexOf(sel) < 0);
  if (missing.length) throw new Error(missing.join(', '));
});

run('자주 쓰는 해상도 4종의 분기가 있다', () => {
  if (!/max-height:\s*820px/.test(css) || !/max-width:\s*1500px/.test(css) || !/max-width:\s*1099\.98px/.test(css)) {
    throw new Error('반응형 분기가 빠졌다');
  }
});

run('동작 줄이기 설정을 존중한다', () => {
  if (css.indexOf('prefers-reduced-motion') < 0) throw new Error('CSS 에 없다');
  const fx = fs.readFileSync(path.join(ROOT, 'js/render/AttackFxRenderer.js'), 'utf8');
  if (fx.indexOf('prefers-reduced-motion') < 0) throw new Error('흔들림이 설정을 안 본다');
});

run('타입 10종 전부 아이콘이 있다', () => {
  const icons = fs.readFileSync(path.join(ROOT, 'js/ui/Icons.js'), 'utf8');
  const missing = Object.keys(RPD.Synergies).filter(t => icons.indexOf(t + ':') < 0);
  if (missing.length) throw new Error(missing.join(', '));
});

run('포켓몬 이미지가 UI 에서도 쓰인다', () => {
  const ui = fs.readFileSync(path.join(ROOT, 'js/ui/UIManager.js'), 'utf8');
  for (const where of ['rrow', 'scell', 'dexcell']) {
    if (ui.indexOf(where) < 0) throw new Error(where + ' 가 없다');
  }
  if ((ui.match(/UI\.sprite\(/g) || []).length < 4) throw new Error('스프라이트를 거의 안 쓴다');
});

run('터치로도 고르고 끌 수 있다', () => {
  const ui = fs.readFileSync(path.join(ROOT, 'js/ui/UIManager.js'), 'utf8');
  for (const ev of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
    if (ui.indexOf("'" + ev + "'") < 0) throw new Error(ev + ' 처리가 없다');
  }
  if (ui.indexOf('pointerDown') < 0 || ui.indexOf('pointerUp') < 0) {
    throw new Error('마우스와 터치가 같은 경로를 쓰지 않는다');
  }
});

run('시너지 줄을 키보드로도 펼칠 수 있다', () => {
  const ui = fs.readFileSync(path.join(ROOT, 'js/ui/UIManager.js'), 'utf8');
  if (ui.indexOf("'keydown'") < 0) throw new Error('키보드 처리가 없다');
  if (html.indexOf('tabindex="0"') < 0 && ui.indexOf('tabindex="0"') < 0) {
    throw new Error('줄에 포커스가 가지 않는다');
  }
});

run('정보 카드가 필드 클릭을 막지 않는다', () => {
  const game = fs.readFileSync(path.join(ROOT, 'css/game.css'), 'utf8');
  const at = game.indexOf('.slotcard {');
  const block = game.slice(at, game.indexOf('}', at));
  if (block.indexOf('pointer-events: none') < 0) throw new Error('카드가 클릭을 가로챈다');
});

/* ---------- 모바일 ① — 필드를 돌렸을 때 칸 누르기 (세션 51) ---------- */
console.log('\n모바일 필드 회전');
{
  const R = RPD.Renderer, F = RPD.FieldManager;
  const saved = { canvas: R.canvas, gcs: sandbox.getComputedStyle };
  // 화면 위치를 흉내 내는 캔버스 — 휴대폰 세로(갤럭시 S24 크기) · 가로
  const fakeCanvas = (rect) => Object.assign(makeCanvas(), { getBoundingClientRect: () => rect });
  const setRotate = (v) => { sandbox.getComputedStyle = () => ({ getPropertyValue: (k) => (k === '--field-rotate' ? v : '') }); };

  /* 기대 화면 좌표는 Renderer 를 거치지 않고 따로 계산한다(같은 식을 두 번 믿으면 검사가 아니다).
   * 세로: 1000x600 을 시계 방향 90° — 논리 x(적 등장→출구)가 위→아래, 논리 y 가 오른쪽→왼쪽. */
  function expectScreen(rect, rotated, x, y) {
    if (!rotated) {
      const s = Math.min(rect.width / 1000, rect.height / 600);
      return { x: rect.left + (rect.width - 1000 * s) / 2 + x * s, y: rect.top + (rect.height - 600 * s) / 2 + y * s, s };
    }
    const s = Math.min(rect.width / 600, rect.height / 1000);
    const ox = (rect.width - 600 * s) / 2, oy = (rect.height - 1000 * s) / 2;
    return { x: rect.left + ox + (600 - y) * s, y: rect.top + oy + x * s, s };
  }

  const cases = [
    { name: '휴대폰 세로(돌림)', rect: { left: 4, top: 118, width: 352, height: 571 }, rot: '1', rotated: true },
    { name: '휴대폰 가로', rect: { left: 4, top: 44, width: 632, height: 308 }, rot: '0', rotated: false },
    { name: 'PC', rect: { left: 8, top: 76, width: 1300, height: 640 }, rot: '', rotated: false }
  ];
  F.init();
  for (const c of cases) {
    setRotate(c.rot);
    R.init(fakeCanvas(c.rect));
    check(`${c.name}: 필드 방향이 레이아웃대로다(${c.rotated ? '90° 돌림' : '그대로'})`, R.rotated === c.rotated, `rotated=${R.rotated}`);

    // 칸 한가운데 · 네 모서리 가까이(칸 크기의 40%) — 전부 그 칸이어야 한다
    const miss = [];
    F.slots.forEach((slot, i) => {
      const e = expectScreen(c.rect, c.rotated, slot.x, slot.y);
      const d = slot.size * 0.4 * e.s;
      for (const [dx, dy] of [[0, 0], [-d, -d], [d, -d], [-d, d], [d, d]]) {
        const p = R.toLogical(e.x + dx, e.y + dy);
        const hit = F.hitTest(p.x, p.y);
        if (hit !== i) miss.push(`칸${i}(${dx.toFixed(0)},${dy.toFixed(0)})→${hit}`);
      }
    });
    check(`${c.name}: 칸 ${F.slots.length}개를 눌러 정확히 그 칸을 고른다(가운데 + 네 모서리)`, miss.length === 0, miss.slice(0, 6).join(' · '));

    // 그리는 변환과 누르는 변환이 같은 자리를 가리키는가 — 그림은 A 칸인데 누르면 B 칸이 되는 일이 없게
    let T = null;
    const cap = makeCtx();
    cap.setTransform = function (a, b, cc, d, e2, f) { T = [a, b, cc, d, e2, f]; };
    R.ctx = cap; R.layers = []; R.shakeX = R.shakeY = 0;
    R.render(0);
    const dpr = R.dpr;
    const off = [];
    F.slots.forEach((slot, i) => {
      const e = expectScreen(c.rect, c.rotated, slot.x, slot.y);
      const px = (T[0] * slot.x + T[2] * slot.y + T[4]) / dpr + c.rect.left;
      const py = (T[1] * slot.x + T[3] * slot.y + T[5]) / dpr + c.rect.top;
      if (Math.abs(px - e.x) > 0.5 || Math.abs(py - e.y) > 0.5) off.push(`칸${i} 그림(${px.toFixed(1)},${py.toFixed(1)}) ≠ 누름(${e.x.toFixed(1)},${e.y.toFixed(1)})`);
      // 정보 카드 위치(DOM)도 같은 자리
      const cc = R.toCanvasCss(slot.x, slot.y);
      if (Math.abs(cc.x + c.rect.left - e.x) > 0.5 || Math.abs(cc.y + c.rect.top - e.y) > 0.5) off.push(`칸${i} 카드 위치 어긋남`);
    });
    check(`${c.name}: 그리는 자리 = 누르는 자리 = 정보 카드 자리`, off.length === 0, off.slice(0, 4).join(' · '));
  }
  sandbox.getComputedStyle = saved.gcs;
  R.init(makeCanvas());
}

/* ---------- 모바일 ② — 손가락 누름 영역 (세션 52) ---------- */
console.log('\n모바일 터치 누름 영역');
{
  const F = RPD.FieldManager;
  F.init();
  const pad = 18;   // 논리 단위 — 휴대폰 배율 약 0.55 에서 화면 10px
  const nearest = (x, y) => {   // 따로 계산: 칸 가장자리까지 거리가 가장 짧은 칸
    let best = -1, bd = Infinity;
    F.slots.forEach((s, i) => { const h = s.size / 2; const dx = Math.max(0, Math.abs(x - s.x) - h), dy = Math.max(0, Math.abs(y - s.y) - h); const d = Math.hypot(dx, dy); if (d < bd) { bd = d; best = i; } });
    return { i: best, d: bd };
  };
  const bad = [];
  F.slots.forEach((s, i) => {
    const h = s.size / 2;
    for (const [dx, dy] of [[h + pad * 0.7, 0], [-(h + pad * 0.7), 0], [0, h + pad * 0.7], [0, -(h + pad * 0.7)]]) {
      const x = s.x + dx, y = s.y + dy, want = nearest(x, y);
      const got = F.hitTestNear(x, y, pad);
      if (got !== (want.d <= pad ? want.i : -1)) bad.push(`칸${i}(${dx.toFixed(0)},${dy.toFixed(0)})→${got}/${want.i}`);
    }
  });
  check('칸을 조금 비껴 눌러도(가장자리 밖 pad 안) 가장 가까운 칸을 고른다', bad.length === 0, bad.slice(0, 5).join(' · '));
  const exactSame = F.slots.every((s, i) => F.hitTestNear(s.x, s.y, pad) === i && F.hitTest(s.x, s.y) === i);
  check('칸 안을 누르면 누름 영역과 상관없이 그 칸', exactSame);
  let farPoint = null;
  for (let x = 5; x < 1000 && !farPoint; x += 7) for (let y = 5; y < 600; y += 7) { if (nearest(x, y).d > pad * 2) { farPoint = { x, y }; break; } }
  check('칸에서 먼 곳을 누르면 아무 칸도 고르지 않는다', !!farPoint && F.hitTestNear(farPoint.x, farPoint.y, pad) === -1, JSON.stringify(farPoint));
  const outside = F.slots[0];
  check('마우스(hitTest)는 그대로 정확하다 — 칸 밖 1px 은 칸이 아니다', F.hitTest(outside.x + outside.size / 2 + 1, outside.y) !== 0);
}

/* ---------- 모바일 ③ — 홈 화면 앱 (세션 53) ---------- */
console.log('\n홈 화면 앱 — 매니페스트 · 아이콘 · 오프라인 목록');
const pngSize = f => { const b = fs.readFileSync(path.join(ROOT, f)); return b.slice(1, 4).toString() === 'PNG' ? `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}` : null; };
{
  const INDEX = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  let man = null;
  run('manifest.webmanifest 이 JSON 으로 읽힌다', () => { man = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8')); });
  man = man || {};
  check('매니페스트: 이름 · 짧은 이름 · 시작 주소 · 범위(폴더째 옮겨도 되게 상대 주소) · 전체 화면',
    man.name && man.short_name && man.start_url === './index.html' && man.scope === './' && man.display === 'fullscreen',
    JSON.stringify({ start: man.start_url, scope: man.scope, display: man.display }));
  const icons = man.icons || [];
  const iconBad = icons.filter(i => !fs.existsSync(path.join(ROOT, i.src)) || pngSize(i.src) !== i.sizes).map(i => i.src + ':' + (fs.existsSync(path.join(ROOT, i.src)) ? pngSize(i.src) : '없음'));
  check('매니페스트 아이콘 파일이 전부 있고 적힌 크기와 같다', icons.length >= 3 && iconBad.length === 0, iconBad.join(' · '));
  check('설치에 필요한 아이콘: 192 · 512 · 가려도 되는(maskable) 512',
    icons.some(i => i.sizes === '192x192') && icons.some(i => i.sizes === '512x512' && i.purpose === 'any') &&
    icons.some(i => i.sizes === '512x512' && i.purpose === 'maskable'));
  const headLinks = [...INDEX.matchAll(/<link rel="(manifest|icon|apple-touch-icon)"[^>]*href="([^"]+)"/g)].map(m => ({ rel: m[1], href: m[2] }));
  check('index.html 이 매니페스트 · 탭 아이콘 · 아이폰 아이콘을 걸고 파일이 있다',
    ['manifest', 'icon', 'apple-touch-icon'].every(r => headLinks.some(l => l.rel === r && fs.existsSync(path.join(ROOT, l.href)))) &&
    pngSize((headLinks.find(l => l.rel === 'apple-touch-icon') || {}).href || 'index.html') === '180x180',
    JSON.stringify(headLinks));
  check('화면 끝까지 쓰기(viewport-fit=cover) + 노치 자리 비우기(safe-area)',
    /viewport-fit=cover/.test(INDEX) && /safe-area-inset-left/.test(fs.readFileSync(path.join(ROOT, 'css/mobile.css'), 'utf8')));

  const P = RPD.Pwa;
  const SW = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  check('페이지(Pwa.js)와 서비스 워커(sw.js)가 같은 저장소 이름을 쓴다', (SW.match(/var CACHE = '([^']+)'/) || [])[1] === P.CACHE);
  check('더블클릭(file://) · 테스트판 한 파일에서는 서비스 워커를 쓰지 않는다', (() => {
    const was = { loc: sandbox.location, nav: sandbox.navigator, caches: sandbox.caches, inl: sandbox.RPD_INLINE };
    const nav = { serviceWorker: {} };
    sandbox.navigator = nav; sandbox.caches = {};
    sandbox.location = { protocol: 'file:' }; const file = P.supported();
    sandbox.location = { protocol: 'https:' }; const https = P.supported();
    sandbox.RPD_INLINE = {}; const inline = P.supported();
    Object.assign(sandbox, { location: was.loc, navigator: was.nav, caches: was.caches, RPD_INLINE: was.inl });
    return !file && https && !inline;
  })());

  // 저장 목록 — index.html 을 흉내 낸 문서로
  const fakeDoc = { querySelectorAll: () => [...INDEX.matchAll(/<(script) src="([^"]+)"|<link rel="([^"]+)"[^>]*href="([^"]+)"/g)].map(m => ({
    getAttribute: a => (a === 'src' ? (m[1] ? m[2] : null) : (m[1] ? null : m[4])) })) };
  const list = P.files(fakeDoc);
  const want = [
    ...[...INDEX.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]),
    ...[...INDEX.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(m => m[1]),
    'manifest.webmanifest', './', 'index.html', ...icons.map(i => i.src),
    ...RPD.PokemonData.all().map(d => d.sprite).filter(f => f && fs.existsSync(path.join(ROOT, f))),
    ...RPD.EnemySkins.allFiles()
  ];
  const lack = [...new Set(want)].filter(f => !list.includes(f));
  check(`오프라인 목록(${list.length}개)에 게임 파일 · 매니페스트 · 아이콘 · 포켓몬 그림 · 적 그림이 전부 있다`, lack.length === 0, lack.slice(0, 6).join(' · '));
  const onDisk = list.filter(f => f === './' || fs.existsSync(path.join(ROOT, f)));
  const gone = list.filter(f => !onDisk.includes(f));
  check('목록에서 파일이 없는 것은 원래 그림이 없는 기본 적 그림뿐(대체 그림으로 그린다)', gone.every(f => /^assets\/enemies\/[a-z_]+\.png$/.test(f)), gone.slice(0, 5).join(' · '));
}

/* sw.js 를 가짜 브라우저(저장소 · 인터넷)에서 돌려 "어디서 주는지"를 본다 */
async function swChecks() {
  console.log('\n홈 화면 앱 — 서비스 워커(오프라인)');
  const ORIGIN = 'https://game.example/porandi/';
  const stores = new Map();
  const key = (u, ignoreSearch) => { const x = new URL(typeof u === 'string' ? u : u.url, ORIGIN); if (ignoreSearch) x.search = ''; return x.href; };
  const openStore = name => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name);
    return {
      match: async (u, o) => { const k = key(u, o && o.ignoreSearch); for (const [kk, v] of m) if ((o && o.ignoreSearch ? key(kk, true) : kk) === k) return v.clone(); return undefined; },
      put: async (u, res) => { m.set(key(u), res); }
    };
  };
  const net = { online: true, hang: false, body: 'net', calls: 0 };
  const handlers = {};
  const sw = {
    self: null, URL, Response, Promise, setTimeout, clearTimeout, console,
    caches: {
      open: async n => openStore(n), keys: async () => [...stores.keys()],
      delete: async n => stores.delete(n)
    },
    fetch: req => { net.calls += 1; if (net.hang) return new Promise(() => {}); return net.online ? Promise.resolve(new Response(net.body + ':' + (req.url || req), { status: 200 })) : Promise.reject(new TypeError('offline')); }
  };
  sw.self = { location: new URL('sw.js', ORIGIN), addEventListener: (t, f) => { handlers[t] = f; }, skipWaiting: () => {}, clients: { claim: async () => {} } };
  vm.createContext(sw);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'), sw, { filename: 'sw.js' });
  sw.NETWORK_TIMEOUT_MS = 60;   // 검사는 4초를 기다리지 않는다

  const ask = async (url, opt) => {
    const req = Object.assign({ url: new URL(url, ORIGIN).href, method: 'GET', mode: 'cors', destination: '' }, opt);
    let p = null; const bg = [];
    handlers.fetch({ request: req, respondWith: x => { p = x; }, waitUntil: x => bg.push(x) });
    if (!p) return { handled: false };
    let res = null, err = null;
    try { res = await p; } catch (e) { err = e; }
    await Promise.all(bg).catch(() => {});
    return { handled: true, text: res ? await res.text() : null, err };
  };
  const cached = async url => { const r = await openStore('porandi-v1').match(new URL(url, ORIGIN).href); return r ? r.text() : null; };

  const r1 = await ask('js/main.js');
  check('인터넷이 되면 코드는 인터넷에서 받고 저장소도 새것으로', r1.text === 'net:' + ORIGIN + 'js/main.js' && await cached('js/main.js') === r1.text);
  net.body = 'net2';
  const r2 = await ask('js/main.js');
  check('코드가 바뀌면 다음 열 때 바로 새 판(저장소 것을 먼저 주지 않는다)', r2.text.startsWith('net2:'));
  net.online = false;
  const r3 = await ask('js/main.js');
  check('오프라인이면 저장해 둔 코드', r3.text === 'net2:' + ORIGIN + 'js/main.js');
  net.online = true; await ask('index.html', { mode: 'navigate' }); net.online = false;
  const r4 = await ask('?from=homescreen', { mode: 'navigate' });
  check('오프라인에서 주소를 조금 다르게 열어도(?…) 게임 화면', r4.text === 'net2:' + ORIGIN + 'index.html', r4.text || String(r4.err));
  const r5 = await ask('js/never.js');
  check('오프라인 + 저장 안 된 파일은 실패로(가짜 응답을 만들지 않는다)', !!r5.err);
  net.online = true; net.body = 'img1'; await ask('assets/pokemon/mew.png', { destination: 'image' });
  net.body = 'img2'; const calls = net.calls;
  const r6 = await ask('assets/pokemon/mew.png', { destination: 'image' });
  check('그림은 저장소 것을 먼저(빠르게) · 뒤에서 새것을 받아 저장소만 바꾼다', r6.text.startsWith('img1:') && net.calls === calls + 1 && (await cached('assets/pokemon/mew.png')).startsWith('img2:'));
  net.hang = true;
  const t0 = Date.now(); const r7 = await Promise.race([ask('js/main.js'), new Promise(r => setTimeout(() => r({ text: 'TIMEOUT' }), 1500))]);
  check('인터넷이 응답 없이 늘어지면(약한 신호) 기다리다 저장소 것으로', r7.text && r7.text.startsWith('net2:') && Date.now() - t0 < 1000, r7.text);
  net.hang = false;
  check('다른 주소(글꼴 등) · GET 이 아닌 요청은 손대지 않는다',
    !(await ask('https://fonts.example/a.css')).handled && !(await ask('js/main.js', { method: 'POST' })).handled);
  stores.set('porandi-v0', new Map()); stores.set('other-app', new Map());
  let act = null; handlers.activate({ waitUntil: p => { act = p; } }); await act;
  check('새 서비스 워커가 켜지면 예전 저장소(porandi-*)만 지운다', !stores.has('porandi-v0') && stores.has('other-app') && stores.has('porandi-v1'));
}

swChecks().catch(e => { failures += 1; console.log('  FAIL  서비스 워커 검사가 멈췄다  → ' + e.message); }).then(() => {
  console.log(`\n────────────────────────────`);
  console.log(failures === 0 ? 'UI·연출 이상 없음' : `UI·연출 문제 ${failures}건`);
  process.exit(failures === 0 ? 0 : 1);
});
