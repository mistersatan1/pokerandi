/* rendersmoke.js — 브라우저 없이 렌더 코드를 실제로 실행한다.
 * 실행: node tools/rendersmoke.js
 *
 * 그림을 검사하는 게 아니라, 그리는 도중에 터지는 오류(오타·없는 API·null 접근)를 잡는 것이 목적이다.
 * 가짜 2D 컨텍스트가 모든 호출을 기록하고, 정의되지 않은 메서드를 부르면 즉시 실패한다.
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

/* index.html 의 로드 순서를 그대로 쓴다 — 목록을 따로 들고 있으면 파일 이름이 바뀔 때 조용히 죽는다(실제로 tier.js 로 죽어 있었다). */
const FILES = [...fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').matchAll(/<script src="([^"]+)"/g)]
  .map(m => m[1]).filter(f => !/ui\/|main\.js/.test(f));

for (const rel of FILES) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), sandbox, { filename: rel });
}

const RPD = sandbox.RPD;
let failures = 0;

function run(label, fn) {
  try {
    fn();
    console.log('  PASS  ' + label);
  } catch (err) {
    failures += 1;
    console.log('  FAIL  ' + label + '  → ' + err.message);
  }
}

console.log('\n렌더 스모크');

RPD.FieldManager.init();
RPD.Renderer.init(makeCanvas());
RPD.MapRenderer.init();

const ctx = makeCtx();

run('배경 + 경로를 그린다', () => RPD.MapRenderer.drawBackground(ctx));
run('빈 슬롯과 잠긴 확장 칸을 그린다', () => RPD.MapRenderer.drawSlots(ctx));

run('살 수 있을 때와 없을 때의 잠긴 칸을 그린다', () => {
  RPD.GameManager.gold = 0;
  RPD.FieldManager.setHover(RPD.FieldManager.lockedSlots()[0].index);
  RPD.MapRenderer.drawSlots(ctx);
  RPD.GameManager.gold = 99999;
  RPD.MapRenderer.drawSlots(ctx);
  RPD.FieldManager.setHover(-1);
});

RPD.FieldManager.place(5, { name: '테스트', range: RPD.Range.MID });
RPD.FieldManager.select(5);
run('배치된 슬롯을 그린다', () => RPD.MapRenderer.drawSlots(ctx));
run('선택 유닛의 사거리 원을 그린다', () => RPD.MapRenderer.drawRange(ctx));

RPD.FieldManager.setHover(9);
RPD.FieldManager.beginDrag(5);
run('hover/드래그 상태를 그린다', () => RPD.MapRenderer.drawSlots(ctx));
RPD.FieldManager.cancelDrag();

// 실제 적을 종류별로 하나씩 세워 두고 전부 그려 본다
RPD.GameManager.reset('NORMAL');
RPD.GameManager.setState(RPD.GameState.RUNNING);
RPD.EnemyManager.reset();
RPD.EnemyData.list.forEach((id, i) => {
  RPD.EnemyManager.spawn(id, 12, { distance: 120 + i * 90 });
});
run(`적 ${RPD.EnemyData.list.length}종을 모두 그린다`, () => RPD.EnemyRenderer.draw(ctx));

run('보스 체력바를 그린다', () => RPD.EnemyRenderer.drawBossBar(ctx));

run('보스 패턴 예고와 2페이즈 표시를 그린다', () => {
  RPD.EnemyManager.reset();
  RPD.BossManager.reset();
  const boss = RPD.EnemyManager.spawn('boss_breaker', 30);
  RPD.BossManager.attach(boss);
  RPD.BossManager.update(0.016);
  RPD.EnemyRenderer.drawBossBar(ctx);

  boss.hp = boss.maxHp * 0.4;
  RPD.BossManager.update(0.016);
  RPD.EnemyRenderer.draw(ctx);
  RPD.EnemyRenderer.drawBossBar(ctx);
});

run('충격파 연출을 그린다', () => {
  RPD.bus.emit('boss:pattern', {
    boss: RPD.EnemyManager.boss || { x: 400, y: 300 },
    id: 'shockwave', label: '충격파',
    result: { x: 400, y: 300, radius: 240, slots: [0, 1], duration: 2 }
  });
  RPD.UnitRenderer.update(0.05);
  RPD.UnitRenderer.drawAttacks(ctx);
});

run('침묵된 포켓몬을 그린다', () => {
  RPD.FieldManager.init();
  for (let i = 0; i < 4; i++) RPD.FieldManager.place(i, RPD.UnitManager.create('pikachu'));
  RPD.UnitManager.recomputeAll();
  RPD.UnitManager.disable(RPD.FieldManager.get(0).unit, 3);
  RPD.UnitRenderer.draw(ctx);
});

run('상태이상(빙결·슬로우·화상) 표시를 그린다', () => {
  const list = RPD.EnemyManager.enemies;
  RPD.EnemyManager.applyFreeze(list[0], 2);
  RPD.EnemyManager.applySlow(list[1], 0.6, 2);
  RPD.EnemyManager.applyDot(list[2], 10, 2);
  RPD.EnemyRenderer.draw(ctx);
});

run('실드가 깎인 적을 그린다', () => {
  const sh = RPD.EnemyManager.enemies.find(e => e.maxShield > 0);
  if (sh) RPD.EnemyManager.damage(sh, sh.maxShield * 0.5);
  RPD.EnemyRenderer.draw(ctx);
});

RPD.FxRenderer.init();
RPD.UnitRenderer.init();

run('등급별 포켓몬을 모두 그린다', () => {
  RPD.FieldManager.init();
  let i = 0;
  for (const r of RPD.TIER_ORDER) {
    for (const def of RPD.PokemonData.ofTier(r)) {
      if (i >= 16) break;
      RPD.FieldManager.place(i, RPD.UnitManager.create(def.id || def));
      i += 1;
    }
  }
  RPD.UnitManager.recomputeAll();
  RPD.UnitRenderer.draw(ctx);
});

run('조합 재료가 되는 칸이 강조된다', () => {
  // v1 의 자유 합성(fusion:changed) 자리를 v2 의 조합식이 대신한다
  RPD.FieldManager.init();
  const recipe = RPD.RecipeData.list[0];
  recipe.materials.forEach((m, i) => {
    RPD.FieldManager.place(i, RPD.UnitManager.create(m));
  });
  RPD.UnitManager.recomputeAll();
  RPD.RecipeManager.refresh();
  RPD.MapRenderer.drawSlots(ctx);
  RPD.UnitRenderer.draw(ctx);
});

run('각성·강화 표시를 그린다', () => {
  const u = RPD.FieldManager.get(0).unit;
  u.awakened = true;
  u.level = 3;
  RPD.UnitManager.recomputeAll();
  RPD.UnitRenderer.draw(ctx);
});

run('공격 연출(빔·연쇄·광역)을 그린다', () => {
  const unit = RPD.FieldManager.get(0).unit;
  const enemy = RPD.EnemyManager.enemies[0] || RPD.EnemyManager.spawn('grunt', 1);
  RPD.bus.emit('unit:attack', { unit: unit, target: enemy, crit: true });
  RPD.bus.emit('combat:chain', { from: enemy, to: { x: 400, y: 300 } });
  RPD.bus.emit('combat:splash', { x: 500, y: 300, radius: 50, unit: unit });
  RPD.UnitRenderer.update(0.05);
  RPD.UnitRenderer.drawAttacks(ctx);
});

run('연출 풀이 넘쳐도 터지지 않는다', () => {
  const unit = RPD.FieldManager.get(0).unit;
  const enemy = RPD.EnemyManager.enemies[0];
  for (let i = 0; i < 700; i++) {
    RPD.bus.emit('unit:attack', { unit: unit, target: enemy, crit: i % 7 === 0 });
  }
  RPD.UnitRenderer.update(0.016);
  RPD.UnitRenderer.drawAttacks(ctx);
});

run('데미지 숫자·치명타·사망 연출을 그린다', () => {
  RPD.FxRenderer.damage(300, 200, 1234, { crit: false });
  RPD.FxRenderer.damage(320, 210, 9999, { crit: true });
  RPD.FxRenderer.puff(400, 300, '#e0554f', 20);
  RPD.FxRenderer.ring(500, 300, '#f0b429', 60, 0.6);
  RPD.FxRenderer.flash('#e0554f', 0.4);
  RPD.FxRenderer.update(0.1);
  RPD.FxRenderer.draw(ctx);
});

run('이펙트 풀이 넘쳐도 터지지 않는다', () => {
  for (let i = 0; i < 900; i++) RPD.FxRenderer.damage(i % 900, 100, 50);
  for (let i = 0; i < 400; i++) RPD.FxRenderer.puff(i % 900, 200, '#fff', 10);
  RPD.FxRenderer.update(0.016);
  RPD.FxRenderer.draw(ctx);
});

run('이펙트가 시간이 지나면 정리된다', () => {
  for (let i = 0; i < 200; i++) RPD.FxRenderer.update(0.05);
  RPD.FxRenderer.draw(ctx);
});

run('94종 전부의 스프라이트를 생성한다', () => {
  RPD.SpriteFactory.clear();
  const defs = RPD.PokemonData.all().map(id => RPD.PokemonData.byId[id])
    .concat(RPD.EnemyData.list.map(id => RPD.EnemyData[id]));
  for (const d of defs) {
    const c = RPD.SpriteFactory.get(d);
    if (!c) throw new Error(d.id + ' 생성 실패');
  }
  if (RPD.SpriteFactory.cacheCount() !== defs.length) {
    throw new Error(`캐시 ${RPD.SpriteFactory.cacheCount()} / 기대 ${defs.length}`);
  }
});

run('같은 개체는 두 번째부터 캐시를 쓴다', () => {
  const d = RPD.PokemonData.byId[RPD.PokemonData.all()[0]];
  const a = RPD.SpriteFactory.get(d);
  const b = RPD.SpriteFactory.get(d);
  if (a !== b) throw new Error('캐시가 동작하지 않는다');
});

run('개체마다 다른 스프라이트를 쓴다', () => {
  // v1 의 각성체 검사 자리. v2 에는 각성이 없으므로 "개체가 서로 구분되는가"를 본다.
  const ids = RPD.PokemonData.all().slice(0, 12);
  const made = ids.map(id => RPD.SpriteFactory.get(RPD.PokemonData.byId[id]));
  if (new Set(made).size !== made.length) throw new Error('같은 그림을 쓰는 개체가 있다');
});

run('이미지가 없어도 placeholder 로 대체된다', () => {
  RPD.Assets.drawSprite(ctx, 'assets/pokemon/없는파일.png', 100, 100, 48,
    { label: '피', color: '#e8c341', ring: '#f0b429' });
});

run('src 가 비어도 터지지 않는다', () => {
  RPD.Assets.drawSprite(ctx, null, 100, 100, 48, { label: '?', color: '#888' });
});

run('전체 레이어를 한 프레임 렌더한다', () => {
  const L = RPD.Renderer.LAYER;
  RPD.Renderer.addLayer(L.BACKGROUND, (c) => RPD.MapRenderer.drawBackground(c));
  RPD.Renderer.addLayer(L.SLOTS, (c) => RPD.MapRenderer.drawSlots(c));
  RPD.Renderer.addLayer(L.RANGE, (c) => RPD.MapRenderer.drawRange(c));
  RPD.Renderer.addLayer(L.ENEMIES, (c) => RPD.EnemyRenderer.draw(c));
  RPD.Renderer.addLayer(L.UNITS, (c) => RPD.UnitRenderer.draw(c));
  RPD.Renderer.addLayer(L.PROJECTILES, (c) => RPD.UnitRenderer.drawAttacks(c));
  RPD.Renderer.addLayer(L.FX, (c) => RPD.FxRenderer.draw(c));
  RPD.Renderer.addLayer(L.OVERLAY, (c) => RPD.EnemyRenderer.drawBossBar(c));
  RPD.Renderer.ctx = ctx;
  RPD.Renderer.render(0.016);
});

run('논리 좌표 변환이 정확하다', () => {
  RPD.Renderer.scale = 1;
  const p = RPD.Renderer.toLogical(400, 300);
  if (Math.abs(p.x - 400) > 0.01 || Math.abs(p.y - 300) > 0.01) {
    throw new Error(`기대 (400,300), 실제 (${p.x},${p.y})`);
  }
});

run('레이어가 order 순으로 정렬된다', () => {
  const orders = RPD.Renderer.layers.map(l => l.order);
  for (let i = 1; i < orders.length; i++) {
    if (orders[i] < orders[i - 1]) throw new Error('레이어 순서가 뒤섞였습니다');
  }
});

console.log('\n캔버스 호출 통계: ' +
  Object.entries(calls).sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([k, v]) => `${k} ${v}`).join(' · '));

console.log(`\n────────────────────────────`);
console.log(failures === 0 ? '렌더 오류 없음' : `렌더 오류 ${failures}건`);
process.exit(failures === 0 ? 0 : 1);
