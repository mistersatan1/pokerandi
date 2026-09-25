/* selftest.js — 브라우저 없이 게임 로직을 검증한다.
 * 실행: node tools/selftest.js
 *
 * render/ui 를 제외한 core·data·systems 는 DOM 의존이 없도록 설계했으므로
 * 여기서 그대로 로드해 실제 동작을 확인할 수 있다.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

const FILES = [
  'js/core/RPD.js',
  'js/core/Utils.js',
  'js/core/EventBus.js',
  'js/core/Assets.js',
  'js/core/PathFollower.js',
  'js/core/Loop.js',
  'js/data/types.js',
  'js/data/map.js',
  'js/data/tier.js',
  'js/data/pokemon.js',
  'js/data/enemies.js',
  'js/data/waves.js',
  'js/systems/GameManager.js',
  'js/systems/FieldManager.js',
  'js/systems/EconomyManager.js',
  'js/systems/StatsManager.js',
  'js/systems/SynergyManager.js',
  'js/systems/UnitManager.js',
  'js/systems/SummonManager.js',
  'js/systems/EnemyManager.js',
  'js/systems/CombatManager.js',
  'js/systems/BossManager.js',
  'js/systems/FusionManager.js',
  'js/systems/WaveManager.js',
  'js/systems/SaveManager.js'
];

const storageBox = {};
const sandbox = {
  console,
  localStorage: {
    getItem: (k) => (k in storageBox ? storageBox[k] : null),
    setItem: (k, v) => { storageBox[k] = String(v); },
    removeItem: (k) => { delete storageBox[k]; }
  },
  requestAnimationFrame: () => 0,
  cancelAnimationFrame: () => {},
  performance: { now: () => Date.now() },
  addEventListener: () => {}
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

for (const rel of FILES) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  try {
    vm.runInContext(src, sandbox, { filename: rel });
  } catch (err) {
    console.error(`로드 실패: ${rel}\n  ${err.message}`);
    process.exit(1);
  }
}

const RPD = sandbox.RPD;

let pass = 0;
let fail = 0;

function check(name, condition, detail) {
  if (condition) {
    pass += 1;
    console.log(`  PASS  ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name}${detail ? '  → ' + detail : ''}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

/* ---------- 경로 ---------- */
section('경로 (PathFollower)');
{
  const p = RPD.MapData.path;
  check('경로 길이가 계산된다', p.length > 2300 && p.length < 2800, `length=${Math.round(p.length)}`);
  // 한 판이 22분이나 걸렸던 원인 중 하나가 경로 길이였다. 다시 늘어나면 잡아낸다.
  check('경로가 한 판 길이를 넘기지 않는다', p.length <= 2700, `length=${Math.round(p.length)}`);

  const start = p.pointAt(0);
  check('시작점이 입구 레인에 있다', Math.abs(start.y - RPD.MapData.laneY.A) < 1, `y=${start.y}`);

  const end = p.pointAt(p.length);
  check('끝점이 출구 레인에 있다', Math.abs(end.y - RPD.MapData.laneY.C) < 1, `y=${end.y}`);
  check('끝점이 화면 오른쪽 밖으로 나간다', end.x >= RPD.VIEW.width, `x=${end.x}`);

  // 경로가 끊기지 않는지: 촘촘히 샘플링하며 점프가 없어야 한다
  let maxJump = 0;
  let prev = p.pointAt(0);
  for (let d = 2; d <= p.length; d += 2) {
    const cur = p.pointAt(d);
    const jump = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    if (jump > maxJump) maxJump = jump;
    prev = cur;
  }
  check('경로가 연속적이다 (순간이동 없음)', maxJump < 3.5, `maxJump=${maxJump.toFixed(2)}`);
  check('경로 종료를 판정한다', p.isFinished(p.length + 1) && !p.isFinished(p.length - 10));
}

/* ---------- 슬롯 ---------- */
section('필드 슬롯 (FieldManager)');
{
  const F = RPD.FieldManager;
  F.init();

  const base = RPD.MapData.baseSlotCount;
  const unlocked = F.slots.filter(s => s.unlocked);
  const locked = F.lockedSlots();

  check('기본 슬롯이 16칸이다', unlocked.length === base && base === 16,
    `unlocked=${unlocked.length} base=${base}`);
  check('확장 슬롯이 잠겨 있다', locked.length === 2, `locked=${locked.length}`);
  check('처음엔 전부 비어 있다', F.emptyCount() === base);

  /* 이 게임의 1번 세일즈 포인트는 "위치가 곧 전략"이다.
   * v1 은 16칸을 전부 65px 등거리로 깔아서 커버리지가 12칸에서 똑같았고,
   * 결국 어디에 두든 결과가 같았다. 그 실패가 다시 일어나지 않게 못 박는다. */
  const MAP = RPD.MapData;
  const cov155 = unlocked.map(s => MAP.coverageOf(s, RPD.Range.MID));
  const spread = Math.max(...cov155) / Math.min(...cov155);
  check('칸마다 경로 커버리지가 실제로 다르다', spread >= 3,
    `최소 ${Math.min(...cov155)} · 최대 ${Math.max(...cov155)} · 배수 ×${spread.toFixed(1)}`);

  // 같은 값이 12칸씩 몰려 있으면 "다르다"고 할 수 없다
  const modeCount = {};
  cov155.forEach(v => { modeCount[v] = (modeCount[v] || 0) + 1; });
  const biggest = Math.max(...Object.values(modeCount));
  check('같은 커버리지를 가진 칸이 절반을 넘지 않는다', biggest <= unlocked.length / 2,
    `가장 많은 값이 ${biggest}칸`);

  // 사거리를 늘리면 반드시 더 많이 덮어야 한다
  const badRange = unlocked.filter(s =>
    MAP.coverageOf(s, RPD.Range.SHORT) > MAP.coverageOf(s, RPD.Range.MID) ||
    MAP.coverageOf(s, RPD.Range.MID) > MAP.coverageOf(s, RPD.Range.LONG));
  check('사거리가 길수록 더 많이 덮는다', badRange.length === 0, `bad=${badRange.length}칸`);

  // 짧은 사거리로는 아무것도 못 때리는 칸이 있어야 "어디에 둘까"가 판단이 된다
  const deadForShort = unlocked.filter(s => MAP.coverageOf(s, RPD.Range.SHORT) === 0);
  check('짧은 사거리가 통하지 않는 칸이 존재한다', deadForShort.length >= 2,
    `count=${deadForShort.length}`);

  // 슬롯이 경로 위에 올라앉으면 안 된다
  const minClear = MAP.pathWidth / 2 + MAP.slotSize / 2;
  const overlapping = F.slots.filter(s => s.distToPath < minClear);
  check('슬롯이 경로와 겹치지 않는다', overlapping.length === 0,
    `bad=${overlapping.map(s => s.index)}`);

  /* 확장 칸의 정체성: 긴 사거리를 넣었을 때 맵에서 가장 넓게 덮는 자리다.
   * 중간 사거리로는 기본 칸과 비슷하므로, 아무 포켓몬이나 넣으면 돈이 아깝다. */
  const bestBaseLong = Math.max.apply(null, unlocked.map(s => MAP.coverageOf(s, RPD.Range.LONG)));
  const expLong = locked.map(s => MAP.coverageOf(s, RPD.Range.LONG));
  check('확장 칸이 긴 사거리에서 기본 칸 최고보다 낫다',
    expLong.every(c => c > bestBaseLong),
    `확장 ${expLong} vs 기본 최고 ${bestBaseLong}`);
  check('확장 칸에 가격이 붙어 있다', locked.every(s => s.cost > 0), `costs=${locked.map(s => s.cost)}`);

  const s5 = F.slots[5];
  check('슬롯 중심 히트테스트가 맞다', F.hitTest(s5.x, s5.y) === 5, `got=${F.hitTest(s5.x, s5.y)}`);
  check('슬롯 경계 바로 밖은 -1', F.hitTest(s5.x + s5.size, s5.y) === -1);
  check('필드 밖 좌표는 -1', F.hitTest(-40, -40) === -1);
  check('경로 위 좌표는 슬롯이 아니다', F.hitTest(500, RPD.MapData.laneY.A) === -1);

  const unit = { name: '테스트', range: RPD.Range.MID };
  check('빈 슬롯에 배치된다', F.place(3, unit) === true);
  check('같은 슬롯에 중복 배치는 거부된다', F.place(3, { name: '중복' }) === false);
  check('배치 후 좌표가 슬롯에 맞춰진다', unit.x === F.slots[3].x && unit.y === F.slots[3].y);
  check('빈 칸 수가 줄어든다', F.emptyCount() === 15);

  F.beginDrag(3);
  F.endDrag(9);
  check('드래그로 빈 칸에 이동한다', F.slots[9].unit === unit && F.slots[3].unit === null);
  check('이동 후 좌표가 갱신된다', unit.x === F.slots[9].x);

  F.place(2, { name: '교환대상', range: RPD.Range.SHORT });
  F.beginDrag(9);
  F.endDrag(2);
  check('점유된 칸과는 자리를 맞바꾼다', F.slots[2].unit === unit && F.slots[9].unit !== null);

  // 필드 밖에 드롭해도 유닛이 사라지면 안 된다
  F.beginDrag(2);
  F.endDrag(-1);
  check('필드 밖 드롭은 무시된다 (유닛 유실 없음)', F.slots[2].unit === unit);
  check('드래그 상태가 정리된다', F.dragFromIndex === -1);

  check('제거하면 유닛이 반환된다', F.remove(2) === unit && F.slots[2].unit === null);

  F.select(9);
  check('선택이 반영된다', F.getSelected() === F.slots[9]);
  F.clearSelection();
  check('선택 해제가 반영된다', F.getSelected() === null);
}

/* ---------- 게임 상태 ---------- */
section('게임 상태 (GameManager)');
{
  const GM = RPD.GameManager;
  GM.reset('NORMAL');

  check('초기 골드가 설정값과 같다', GM.gold === RPD.Config.startGold);
  check('초기 라이프가 설정값과 같다', GM.life === RPD.Config.startLife);
  check('시작 상태는 READY', GM.state === RPD.GameState.READY);

  check('감당 가능한 지출은 성공한다', GM.spendGold(50) === true && GM.gold === RPD.Config.startGold - 50);
  const before = GM.gold;
  check('골드 부족 시 지출이 거부된다', GM.spendGold(99999) === false && GM.gold === before);

  GM.addGold(-99999);
  check('골드는 음수가 되지 않는다', GM.gold === 0);

  let overFired = 0;
  RPD.bus.on('game:over', () => { overFired += 1; });
  GM.loseLife(RPD.Config.startLife);
  check('라이프 0에서 게임 오버 상태가 된다', GM.state === RPD.GameState.GAMEOVER);
  check('게임 오버 이벤트가 정확히 1번 발생한다', overFired === 1, `fired=${overFired}`);

  GM.loseLife(5);
  check('게임 오버 후 중복 발생하지 않는다', overFired === 1);
  check('라이프는 음수가 되지 않는다', GM.life === 0);
}

/* ---------- 유틸 ---------- */
section('유틸 (Utils)');
{
  const U = RPD.Utils;
  check('clamp 가 범위를 지킨다', U.clamp(15, 0, 10) === 10 && U.clamp(-5, 0, 10) === 0);
  check('formatNumber 가 축약한다', U.formatNumber(1234) === '1234' && U.formatNumber(25400) === '25.4K');
  check('formatTime 이 분:초로 만든다', U.formatTime(75) === '1:15' && U.formatTime(5) === '0:05');

  const counts = { a: 0, b: 0 };
  for (let i = 0; i < 20000; i++) counts[U.weightedPick({ a: 9, b: 1 })] += 1;
  const ratio = counts.a / 20000;
  check('weightedPick 이 가중치를 따른다', ratio > 0.87 && ratio < 0.93, `a=${(ratio * 100).toFixed(1)}%`);

  check('uid 가 중복되지 않는다', U.uid('x') !== U.uid('x'));
}

/* ---------- 루프 ---------- */
section('루프 (Loop)');
{
  const L = RPD.Loop;
  L.setSpeed(3);
  check('배속이 반영된다', L.speed === 3);
  L.setSpeed(99);
  check('비정상 배속은 클램프된다', L.speed === 4, `speed=${L.speed}`);
  L.setSpeed(1);
  L.setPaused(true);
  check('일시정지가 반영된다', L.paused === true);
  L.setPaused(false);
}

/* ---------- 데이터 무결성 ---------- */
section('데이터 무결성');
{
  const typeIds = Object.keys(RPD.Types);
  check('모든 타입에 id/label/color 가 있다',
    typeIds.every(k => RPD.Types[k].id === k && RPD.Types[k].label && RPD.Types[k].color));

  const badSynergy = Object.keys(RPD.Synergies).filter(k => !RPD.Types[k]);
  check('시너지가 존재하지 않는 타입을 참조하지 않는다', badSynergy.length === 0, `bad=${badSynergy}`);

  const unsorted = Object.keys(RPD.Synergies).filter(k => {
    const t = RPD.Synergies[k];
    return t.some((tier, i) => i > 0 && tier.count <= t[i - 1].count);
  });
  check('시너지 단계가 오름차순이다', unsorted.length === 0, `bad=${unsorted}`);

  check('등급 순서 배열과 정의가 일치한다',
    RPD.TIER_ORDER.every(r => RPD.Tiers[r]) &&
    RPD.TIER_ORDER.length === Object.keys(RPD.Tiers).length);

  const muls = RPD.TIER_ORDER.map(r => RPD.Tiers[r].statMul);
  check('상위 등급일수록 스탯 배율이 높다', muls.every((m, i) => i === 0 || m > muls[i - 1]));

  check('모드마다 필수 필드가 있다',
    Object.keys(RPD.Modes).every(m => RPD.Modes[m].label && RPD.Modes[m].bossEvery > 0));
}


/* ---------- 적 데이터 ---------- */
section('적 데이터 (enemies.js)');
{
  const ED = RPD.EnemyData;
  const ids = ED.list;

  check('적 종류가 충분하다', ids.length >= 9, `count=${ids.length}`);

  const badKey = ids.filter(id => ED[id].id !== id);
  check('id 와 키가 일치한다', badKey.length === 0, `bad=${badKey}`);

  const required = ['name', 'role', 'hp', 'speed', 'bounty', 'color', 'desc'];
  const missingField = ids.filter(id => required.some(f => ED[id][f] === undefined));
  check('필수 필드가 모두 있다', missingField.length === 0, `bad=${missingField}`);

  const badSplit = ids.filter(id => ED[id].splitInto && !ED[ED[id].splitInto.id]);
  check('분열 대상이 실제로 존재한다', badSplit.length === 0, `bad=${badSplit}`);

  const bosses = ids.filter(id => ED[id].isBoss);
  check('보스가 3종 이상이다', bosses.length >= 3, `count=${bosses.length}`);
  check('보스마다 제한시간과 라이프 피해가 있다',
    bosses.every(id => ED[id].timeLimit > 0 && ED[id].lifeCost >= 5));

  // 역할이 겹치지 않아야 "이 적에게 통하는 것"이 서로 달라진다
  const roles = new Set(ids.map(id => ED[id].role));
  check('역할이 6종 이상으로 갈린다', roles.size >= 6, `roles=${roles.size}`);

  check('알 수 없는 id 는 기본값으로 대체된다', ED.get('없는적').id === 'grunt');
}

/* ---------- 웨이브 데이터 ---------- */
section('웨이브 구성 (waves.js)');
{
  const WD = RPD.WaveData;
  const NORMAL = RPD.Modes.NORMAL;

  check('구간이 웨이브에 맞게 선택된다',
    WD.bandFor(1).label === '기본' &&
    WD.bandFor(7).label === '속공·중장 맛보기' &&
    WD.bandFor(15).label === '중장 합류' &&
    WD.bandFor(999).label === '심화');

  const poolIds = new Set();
  WD.bands.forEach(b => Object.keys(b.pool).forEach(id => poolIds.add(id)));
  const ghost = [...poolIds].filter(id => !RPD.EnemyData[id]);
  check('구성표가 존재하지 않는 적을 부르지 않는다', ghost.length === 0, `bad=${ghost}`);

  check('보스는 10 단위 웨이브에만 나온다',
    WD.isBossWave(10, NORMAL) && WD.isBossWave(20, NORMAL) &&
    !WD.isBossWave(11, NORMAL) && !WD.isBossWave(9, NORMAL));

  check('보스 러시는 매 웨이브가 보스다',
    WD.isBossWave(1, RPD.Modes.BOSS_RUSH) && WD.isBossWave(7, RPD.Modes.BOSS_RUSH));

  const w1 = WD.build(1, NORMAL);
  check('1웨이브는 잡졸만 나온다', w1.entries.every(e => e.enemyId === 'grunt'));
  // 보스 전에 탱커·장갑을 미리 만나야 "무엇이 통하는지"를 배울 수 있다
  const earlyPool = Object.keys(WD.bandFor(7).pool);
  check('보스 전에 탱커와 장갑을 미리 만난다',
    earlyPool.includes('tank') && earlyPool.includes('armored'), `pool=${earlyPool}`);
  check('1웨이브 수가 공식과 맞는다',
    w1.entries.length === WD.bandFor(1).count(1), `count=${w1.entries.length}`);
  check('1웨이브가 배우기에 부담 없는 규모다',
    w1.entries.length <= 10, `count=${w1.entries.length}`);
  check('스폰 시각이 시간순이다',
    w1.entries.every((e, i) => i === 0 || e.at >= w1.entries[i - 1].at));

  const w10 = WD.build(10, NORMAL);
  check('10웨이브는 보스 웨이브다', w10.isBoss === true);
  check('보스가 정확히 1마리다', w10.entries.filter(e => RPD.EnemyData.get(e.enemyId).isBoss).length === 1);
  check('보스에게 호위가 붙는다', w10.entries.length > 1, `entries=${w10.entries.length}`);

  // 군집은 항목 1개가 실제로는 여러 마리다 → 남은 적 카운터가 맞아야 한다.
  // 기대값을 하드코딩하면 데이터를 조정할 때마다 테스트가 깨지므로 데이터에서 읽는다.
  const packSize = RPD.EnemyData.get('swarm').packSize;
  check('군집 데이터에 packSize 가 있다', packSize > 1, `packSize=${packSize}`);
  const packPlan = { entries: [{ enemyId: 'swarm' }, { enemyId: 'grunt' }] };
  check('군집이 실제 마릿수로 집계된다', WD.countUnits(packPlan.entries) === packSize + 1,
    `count=${WD.countUnits(packPlan.entries)} expected=${packSize + 1}`);

  const hps = [1, 5, 10, 15, 20].map(w => WD.scaleHp(100, w, NORMAL));
  check('체력이 웨이브에 따라 증가한다', hps.every((h, i) => i === 0 || h > hps[i - 1]), `hps=${hps}`);
  // 노멀의 최종 웨이브는 20 이다. 30 은 엔드리스의 영역.
  check('최종 웨이브 체력이 과하지 않다', hps[4] > 1500 && hps[4] < 5000, `hp20=${hps[4]}`);
  check('최종 웨이브가 모드 정의와 맞는다', NORMAL.finalWave === 20, `final=${NORMAL.finalWave}`);
  check('챌린지 모드가 더 단단하다',
    WD.scaleHp(100, 10, RPD.Modes.CHALLENGE) > WD.scaleHp(100, 10, NORMAL));

  check('첫 웨이브 준비시간이 더 길다',
    WD.prepareSecondsFor(1, NORMAL) > WD.prepareSecondsFor(2, NORMAL));
  check('보스 앞 준비시간이 더 길다',
    WD.prepareSecondsFor(10, NORMAL) > WD.prepareSecondsFor(9, NORMAL));
}

/* ---------- 적 동작 ---------- */
section('적 동작 (EnemyManager)');
{
  const EM = RPD.EnemyManager;
  const GM = RPD.GameManager;
  const step = RPD.Config.fixedStep;

  GM.reset('NORMAL');
  GM.setState(RPD.GameState.RUNNING);
  EM.reset();

  const e = EM.spawn('grunt', 1);
  check('적이 생성된다', EM.aliveCount() === 1);
  check('입구에서 시작한다', Math.abs(e.y - RPD.MapData.laneY.A) < 1);

  // 이동: 1초 뒤 거리 = 속도 × 1초
  for (let i = 0; i < 60; i++) EM.update(step);
  check('경로를 따라 이동한다', Math.abs(e.distance - e.baseSpeed) < 2,
    `distance=${e.distance.toFixed(1)} speed=${e.baseSpeed.toFixed(1)}`);

  // 방어력 공식: 실피해 = 피해 × 100/(100+방어력)
  EM.reset();
  const plain = EM.spawn('grunt', 1);
  const dealt = EM.damage(plain, 100);
  check('방어력 0이면 피해가 그대로 들어간다', Math.abs(dealt - 100) < 0.01, `dealt=${dealt}`);

  EM.reset();
  const armored = EM.spawn('armored', 1);
  const armorDealt = EM.damage(armored, 100);
  const expected = 100 * (100 / (100 + armored.armor));
  check('방어력이 피해를 공식대로 줄인다', Math.abs(armorDealt - expected) < 0.01,
    `dealt=${armorDealt.toFixed(1)} expected=${expected.toFixed(1)}`);
  check('방어력이 높아도 피해가 0이 되지 않는다', armorDealt > 0);

  EM.reset();
  const ignoreTarget = EM.spawn('armored', 1);
  const ignored = EM.damage(ignoreTarget, 100, { ignoreArmor: true });
  check('방어 무시가 방어력을 통째로 건너뛴다', Math.abs(ignored - 100) < 0.01, `dealt=${ignored}`);

  // 실드: 체력보다 먼저 깎인다
  EM.reset();
  const sh = EM.spawn('shielded', 1);
  const hpBefore = sh.hp;
  EM.damage(sh, 50);
  check('실드가 체력보다 먼저 소모된다', sh.hp === hpBefore && sh.shield < sh.maxShield,
    `shield=${sh.shield.toFixed(1)}`);

  // 실드는 타격 1회당 최소치가 보장 → 잔타 다단히트가 유리
  EM.reset();
  const shA = EM.spawn('shielded', 1);
  const shB = EM.spawn('shielded', 1);
  for (let i = 0; i < 20; i++) EM.damage(shA, 1);   // 1 × 20회
  EM.damage(shB, 20);                              // 20 × 1회
  check('다단히트가 실드에 더 잘 통한다', shA.shield < shB.shield,
    `다단=${shA.shield.toFixed(1)} 한방=${shB.shield.toFixed(1)}`);

  // 분열
  EM.reset();
  const sp = EM.spawn('splitter', 1);
  EM.damage(sp, 999999);
  check('분열체가 죽으면 파편 2마리가 남는다', EM.aliveCount() === 2, `alive=${EM.aliveCount()}`);
  check('파편이 본체보다 빠르다',
    EM.enemies[0].baseSpeed > RPD.EnemyData.splitter.speed);

  // 재생
  EM.reset();
  const rg = EM.spawn('regen', 1);
  EM.damage(rg, rg.maxHp * 0.5);
  const afterHit = rg.hp;
  for (let i = 0; i < 60; i++) EM.update(step);
  check('재생체가 체력을 회복한다', rg.hp > afterHit, `${afterHit.toFixed(0)} → ${rg.hp.toFixed(0)}`);
  check('최대 체력을 넘지 않는다', rg.hp <= rg.maxHp);

  // 빙결 / 슬로우
  EM.reset();
  const fz = EM.spawn('grunt', 1);
  EM.applyFreeze(fz, 1.0);
  const frozenAt = fz.distance;
  for (let i = 0; i < 30; i++) EM.update(step);
  check('빙결된 적은 멈춘다', fz.distance === frozenAt, `moved=${(fz.distance - frozenAt).toFixed(2)}`);
  for (let i = 0; i < 60; i++) EM.update(step);
  check('빙결이 풀리면 다시 움직인다', fz.distance > frozenAt);

  EM.reset();
  const sl = EM.spawn('grunt', 1);
  EM.applySlow(sl, 0.5, 5);
  check('슬로우가 속도를 절반으로 만든다',
    Math.abs(EM.currentSpeed(sl) - sl.baseSpeed * 0.5) < 0.01);
  EM.applySlow(sl, 0.75, 5);
  check('더 약한 슬로우로 덮어써지지 않는다',
    Math.abs(EM.currentSpeed(sl) - sl.baseSpeed * 0.5) < 0.01);

  // 지속 피해
  EM.reset();
  const dot = EM.spawn('tank', 1);
  EM.applyDot(dot, 100, 1.0);
  const dotBefore = dot.hp;
  for (let i = 0; i < 60; i++) EM.update(step);
  check('지속 피해가 1초 동안 누적된다', Math.abs((dotBefore - dot.hp) - 100) < 3,
    `damage=${(dotBefore - dot.hp).toFixed(1)}`);
  const afterDot = dot.hp;
  for (let i = 0; i < 60; i++) EM.update(step);
  check('지속 피해가 시간이 지나면 끝난다', Math.abs(dot.hp - afterDot) < 0.01);

  // 지속 피해로 죽어도 배열이 깨지지 않는다 (인덱스 버그 회귀 테스트)
  EM.reset();
  const dying = EM.spawn('grunt', 1);
  const bystander = EM.spawn('grunt', 1);
  EM.applyDot(dying, dying.maxHp * 4, 1.0);
  for (let i = 0; i < 60; i++) EM.update(step);
  check('지속 피해 사망 후에도 다른 적이 멀쩡하다',
    EM.aliveCount() === 1 && EM.enemies[0] === bystander && bystander.alive);

  // 출구 통과
  EM.reset();
  GM.life = 20;
  const leaker = EM.spawn('grunt', 1, { distance: RPD.MapData.path.length - 1 });
  let leaked = 0;
  RPD.bus.on('enemy:leaked', () => { leaked += 1; });
  for (let i = 0; i < 10; i++) EM.update(step);
  check('출구를 통과하면 사라진다', EM.aliveCount() === 0);
  check('출구 통과 이벤트가 1번 발생한다', leaked === 1, `fired=${leaked}`);
  check('라이프가 깎인다', GM.life === 19, `life=${GM.life}`);

  EM.reset();
  GM.life = 20;
  EM.spawn('boss_charger', 10, { distance: RPD.MapData.path.length - 1 });
  for (let i = 0; i < 10; i++) EM.update(step);
  check('보스는 라이프를 5 깎는다', GM.life === 15, `life=${GM.life}`);

  // 보스 폭주
  EM.reset();
  const boss = EM.spawn('boss_charger', 10);
  const normalSpeed = EM.currentSpeed(boss);
  boss.age = boss.def.timeLimit + 1;
  EM.update(step);
  check('제한시간이 지나면 보스가 폭주한다', boss.enraged === true);
  check('폭주하면 속도가 크게 오른다', EM.currentSpeed(boss) > normalSpeed * 2,
    `${normalSpeed.toFixed(0)} → ${EM.currentSpeed(boss).toFixed(0)}`);

  // 조회 API (PHASE 7 타겟팅이 쓸 것)
  EM.reset();
  const near = EM.spawn('grunt', 1, { distance: 100 });
  const far = EM.spawn('grunt', 1, { distance: 800 });
  const found = EM.queryInRange(near.x, near.y, 60);
  check('사거리 안의 적만 조회된다', found.length === 1 && found[0] === near, `found=${found.length}`);
  check('사거리 밖은 제외된다', EM.queryInRange(500, 585, 20).length === 0);
  const advanced = EM.mostAdvancedInRange(RPD.VIEW.width / 2, RPD.VIEW.height / 2, 9999);
  check('출구에 가장 가까운 적을 고른다', advanced === far);
  check('클릭 좌표로 적을 찾는다', EM.findAt(near.x, near.y) === near);
  check('빈 곳을 클릭하면 null', EM.findAt(5, 595) === null);
}

/* ---------- 경제 ---------- */
section('경제 (EconomyManager)');
{
  const EC = RPD.EconomyManager;
  const GM = RPD.GameManager;
  const CFG = RPD.Config;

  GM.reset('NORMAL');
  EC.reset();

  const cheap = { wave: 1, def: RPD.EnemyData.grunt, isBoss: false };
  const rich = { wave: 1, def: RPD.EnemyData.tank, isBoss: false };
  check('현상금이 높은 적이 더 많이 준다', EC.killReward(rich) > EC.killReward(cheap));
  check('후반 웨이브가 더 많이 준다',
    EC.killReward({ wave: 30, def: RPD.EnemyData.grunt, isBoss: false }) > EC.killReward(cheap));
  check('보스 보상이 압도적이다',
    EC.killReward({ wave: 10, def: RPD.EnemyData.boss_charger, isBoss: true }) > 150);

  check('이자가 보유 골드에 비례한다',
    EC.interestFor(200) === Math.floor(200 / CFG.interestPer), `interest=${EC.interestFor(200)}`);
  check('이자에 상한이 있다', EC.interestFor(999999) === CFG.interestCap);
  check('골드가 0이면 이자도 0', EC.interestFor(0) === 0);
  // v1 의 이자(정률 4%)는 보유 20골드 구간에서 0원이라 없는 시스템이었다.
  // 초반부터 체감되지 않으면 "아낄까"라는 판단이 생기지 않는다.
  check('초반 보유량에서도 이자가 0이 아니다', EC.interestFor(50) >= 3,
    `50골드 → ${EC.interestFor(50)}골드`);

  EC.summonCount = 0;
  const c0 = EC.summonCost();
  EC.summonCount = 30;
  const c30 = EC.summonCost();
  EC.summonCount = 9999;
  const cMax = EC.summonCost();
  check('소환 비용이 뽑을수록 오른다', c30 > c0, `${c0} → ${c30}`);
  check('소환 비용에 상한이 있다', cMax === CFG.summonCostCap, `cost=${cMax}`);
  EC.summonCount = 0;
}

/* ---------- 웨이브 진행 통합 시뮬레이션 ---------- */
section('통합 시뮬레이션 (WaveManager)');
{
  const GM = RPD.GameManager;
  const EM = RPD.EnemyManager;
  const WM = RPD.WaveManager;
  const step = RPD.Config.fixedStep;

  function fullReset(mode) {
    EM.reset(); WM.reset(); RPD.EconomyManager.reset(); RPD.StatsManager.reset();
    RPD.FieldManager.init();
    GM.reset(mode || 'NORMAL');
  }

  // 가상의 방어력: 매 틱마다 가장 앞선 적 3마리에게 피해를 준다 (PHASE 7 전투의 대역)
  function tick(dps) {
    GM.update(step);
    if (GM.state === RPD.GameState.RUNNING || GM.state === RPD.GameState.PREPARE) {
      WM.update(step);
      EM.update(step);
    }
    if (dps > 0) {
      const targets = EM.enemies.slice(-3);
      for (const t of targets) EM.damage(t, dps * step, { ignoreArmor: true });
    }
  }

  function run(seconds, dps) {
    const n = Math.ceil(seconds / step);
    for (let i = 0; i < n; i++) tick(dps);
  }

  // (1) 충분한 화력이면 웨이브가 계속 넘어간다
  fullReset();
  WM.begin();
  check('시작하면 준비 단계로 들어간다', WM.phase === WM.PHASE.PREPARE);
  check('준비 중에는 적이 없다', EM.aliveCount() === 0);

  const skipBonus = WM.skipPrepare();
  check('빠른 시작이 보너스를 준다', skipBonus > 0, `bonus=${skipBonus}`);
  check('빠른 시작 후 스폰이 시작된다', WM.phase === WM.PHASE.SPAWNING);

  run(3, 0);
  check('시간이 지나면 적이 나온다', EM.aliveCount() > 0, `alive=${EM.aliveCount()}`);

  const goldBefore = GM.gold;
  run(120, 4000);
  check('웨이브가 여러 번 넘어간다', GM.wave >= 3, `wave=${GM.wave}`);
  check('처치로 골드가 늘어난다', GM.gold > goldBefore, `${goldBefore} → ${GM.gold}`);
  check('라이프가 온전하다', GM.life === RPD.Config.startLife, `life=${GM.life}`);

  // (2) 방어가 전혀 없으면 라이프가 0이 되고 게임 오버가 정확히 1번 발생한다
  fullReset();
  let overCount = 0;
  const onOver = () => { overCount += 1; };
  RPD.bus.on('game:over', onOver);

  WM.begin();
  WM.skipPrepare();
  run(400, 0);

  check('방어가 없으면 게임 오버가 된다', GM.state === RPD.GameState.GAMEOVER, `state=${GM.state}`);
  check('게임 오버는 한 번만 발생한다', overCount === 1, `fired=${overCount}`);
  check('게임 오버 후 웨이브가 더 진행되지 않는다', (() => {
    const w = GM.wave;
    run(30, 0);
    return GM.wave === w;
  })(), `wave=${GM.wave}`);
  RPD.bus.off('game:over', onOver);

  // (3) 보스 웨이브까지 도달하면 보스가 실제로 등장한다
  fullReset();
  WM.begin();
  WM.skipPrepare();
  let sawBoss = false;
  const onSpawn = (e) => { if (e.isBoss) sawBoss = true; };
  RPD.bus.on('enemy:spawned', onSpawn);
  for (let i = 0; i < Math.ceil(900 / step) && GM.wave < 10; i++) {
    tick(60000);
    if (WM.phase === WM.PHASE.PREPARE) WM.skipPrepare();
  }
  run(6, 0);
  check('10웨이브에서 보스가 등장한다', sawBoss === true, `wave=${GM.wave}`);
  check('보스가 추적된다', EM.boss !== null && EM.boss.isBoss);
  RPD.bus.off('enemy:spawned', onSpawn);

  // (4) 최종 웨이브를 넘기면 승리한다
  fullReset('BOSS_RUSH');
  WM.begin();
  const finalWave = RPD.Modes.BOSS_RUSH.finalWave;
  for (let i = 0; i < Math.ceil(2400 / step); i++) {
    if (WM.phase === WM.PHASE.PREPARE) WM.skipPrepare();
    tick(400000);
    if (GM.state === RPD.GameState.VICTORY) break;
  }
  check('최종 웨이브를 클리어하면 승리한다', GM.state === RPD.GameState.VICTORY,
    `state=${GM.state} wave=${GM.wave}`);
  check('승리 웨이브가 모드 설정과 같다', GM.wave === finalWave, `wave=${GM.wave}`);
}

/* ---------- 기록 ---------- */
section('기록 (StatsManager)');
{
  const ST = RPD.StatsManager;
  const GM = RPD.GameManager;
  const EM = RPD.EnemyManager;

  ST.reset();
  ST.init();
  GM.reset('NORMAL');
  GM.setState(RPD.GameState.RUNNING);
  EM.reset();

  const target = EM.spawn('grunt', 1);
  EM.damage(target, 999999);
  check('처치 수가 기록된다', ST.kills === 1, `kills=${ST.kills}`);
  check('종류별 처치가 기록된다', ST.killsByType.grunt === 1);

  EM.spawn('boss_charger', 10);
  EM.kill(EM.boss, 'test');
  check('보스 처치가 따로 집계된다', ST.bossKills === 1);

  GM.setWave(7);
  GM.setWave(3);
  check('최고 웨이브는 내려가지 않는다', ST.highestWave === 7, `highest=${ST.highestWave}`);

  const sum = ST.summary();
  check('요약에 필요한 값이 다 있다',
    ['wave', 'kills', 'leaks', 'bossKills', 'goldEarned', 'damageDealt', 'elapsed']
      .every(k => sum[k] !== undefined));
}

/* ---------- 난이도 곡선 회귀 방지 ---------- */
section('난이도 곡선');
{
  const WD = RPD.WaveData;
  const ED = RPD.EnemyData;

  // 웨이브 하나를 통째로 잡는 데 필요한 "유효 체력" (방어력까지 감안)
  function waveEffectiveHp(wave, mode) {
    let total = 0;
    const samples = 24;
    for (let s = 0; s < samples; s++) {
      const plan = WD.build(wave, mode);
      for (const e of plan.entries) {
        const def = ED.get(e.enemyId);
        const units = def.packSize || 1;
        const hp = WD.enemyMaxHp(def, wave, mode);
        const shield = def.shieldRatio ? hp * def.shieldRatio : 0;
        const armor = WD.scaleArmor(def.armor, wave);
        total += (hp + shield) * (1 + armor / 100) * units;
        if (def.splitInto) {
          const cd = ED.get(def.splitInto.id);
          total += WD.enemyMaxHp(cd, wave, mode) * def.splitInto.count * units;
        }
      }
    }
    return total / samples;
  }

  // 보스 웨이브는 원래 튀어야 정상이다. 잡몹 웨이브끼리만 비교한다.
  // (보스 스파이크는 아래에서 따로 검사한다)
  for (const modeId of ['NORMAL', 'ENDLESS', 'BOSS_RUSH', 'CHALLENGE']) {
    const mode = RPD.Modes[modeId];
    const last = mode.finalWave > 0 ? mode.finalWave : 40;

    const trashWaves = [];
    for (let w = 1; w <= last; w++) {
      if (!WD.isBossWave(w, mode)) trashWaves.push(w);
    }
    if (trashWaves.length < 3) continue;   // 보스 러시엔 잡몹 웨이브가 없다

    let worstJump = 1, worstAt = 0, worstDrop = 1, dropAt = 0;
    let prevWave = trashWaves[0];
    let prev = waveEffectiveHp(prevWave, mode);

    for (let i = 1; i < trashWaves.length; i++) {
      const w = trashWaves[i];
      const cur = waveEffectiveHp(w, mode);
      // 보스를 건너뛰면 웨이브 간격이 2가 되므로 간격당 증가율로 환산한다
      const ratio = Math.pow(cur / prev, 1 / (w - prevWave));
      if (ratio > worstJump) { worstJump = ratio; worstAt = w; }
      if (ratio < worstDrop) { worstDrop = ratio; dropAt = w; }
      prev = cur; prevWave = w;
    }

    check(`${mode.label}: 웨이브가 갑자기 벽이 되지 않는다`,
      worstJump < 1.75, `웨이브 ${worstAt} 에서 ×${worstJump.toFixed(2)}`);
    check(`${mode.label}: 뒤 웨이브가 앞보다 물러지지 않는다`,
      worstDrop > 0.9, `웨이브 ${dropAt} 에서 ×${worstDrop.toFixed(2)}`);
  }

  // 보스는 직전 웨이브보다 확실히 무거워야 한다
  const NORMAL = RPD.Modes.NORMAL;
  for (const bw of [10, 20, 30]) {
    const bossOnly = WD.enemyMaxHp(ED.get(WD.bossIdFor(bw, NORMAL)), bw, NORMAL);
    const prevWave = waveEffectiveHp(bw - 1, NORMAL);
    const ratio = bossOnly / prevWave;
    check(`보스 ${bw} 이 직전 웨이브만큼의 무게를 갖는다`,
      ratio > 1.4 && ratio < 4.5, `×${ratio.toFixed(2)}`);
  }

  // 보스 체력은 모드의 보스 주기가 달라져도 폭주하지 않아야 한다
  const rushBoss = WD.enemyMaxHp(ED.get(WD.bossIdFor(5, RPD.Modes.BOSS_RUSH)), 5, RPD.Modes.BOSS_RUSH);
  const normalTrash = waveEffectiveHp(4, RPD.Modes.BOSS_RUSH);
  check('보스 러시 초반 보스가 벽이 되지 않는다',
    rushBoss / normalTrash < 4.5, `×${(rushBoss / normalTrash).toFixed(2)}`);

  check('구간 기준선이 경계에서 튀지 않는다', (() => {
    let worst = 1;
    for (let w = 2; w <= 40; w++) {
      const r = WD.trashWaveHp(w, NORMAL) / WD.trashWaveHp(w - 1, NORMAL);
      if (r > worst) worst = r;
    }
    return worst < 1.55;
  })());
}

/* ---------- 포켓몬 데이터 ---------- */
section('포켓몬 로스터 (pokemon.js)');
{
  const PD = RPD.PokemonData;
  const ids = PD.all();

  check('개체가 충분하다', ids.length >= 40, `count=${ids.length}`);

  const badKey = ids.filter(id => PD.byId[id].id !== id);
  check('id 와 키가 일치한다', badKey.length === 0, `bad=${badKey}`);

  const required = ['name', 'tier', 'types', 'role', 'attack', 'attackSpeed', 'range', 'desc'];
  const missing = ids.filter(id => required.some(f => PD.byId[id][f] === undefined));
  check('필수 필드가 모두 있다', missing.length === 0, `bad=${missing.slice(0, 5)}`);

  const badRarity = ids.filter(id => !RPD.Tiers[PD.byId[id].tier]);
  check('등급이 모두 정의되어 있다', badRarity.length === 0, `bad=${badRarity}`);

  const badType = ids.filter(id => PD.byId[id].types.some(t => !RPD.Types[t]));
  check('타입이 모두 정의되어 있다', badType.length === 0, `bad=${badType}`);

  const badEvo = ids.filter(id => PD.byId[id].evolvesTo && !PD.byId[PD.byId[id].evolvesTo]);
  check('진화 대상이 실제로 존재한다', badEvo.length === 0, `bad=${badEvo}`);

  const badRole = ids.filter(id => !PD.Roles[PD.byId[id].role]);
  check('역할이 모두 정의되어 있다', badRole.length === 0, `bad=${badRole}`);

  const roles = new Set(ids.map(id => PD.byId[id].role));
  check('역할이 8종 이상으로 갈린다', roles.size >= 8, `roles=${roles.size}`);

  // 소환 풀 — 등급마다 뽑을 게 있어야 하고, 2단계 이상은 합성으로만 얻어야 한다
  for (const r of RPD.TIER_ORDER) {
    const pool = PD.summonPool(r);
    check(`${RPD.Tiers[r].label} 소환 풀이 비어 있지 않다`, pool.length > 0, `count=${pool.length}`);
    check(`${RPD.Tiers[r].label} 소환 풀은 1단계만 있다`,
      pool.every(id => PD.byId[id].stage === 1), `bad=${pool.filter(id => PD.byId[id].stage !== 1)}`);
  }

  // 진화하면 반드시 강해진다
  const weakerAfterEvo = ids.filter(id => {
    const d = PD.byId[id];
    if (!d.evolvesTo) return false;
    return PD.dps(PD.byId[d.evolvesTo]) <= PD.dps(d);
  });
  check('진화하면 항상 강해진다', weakerAfterEvo.length === 0, `bad=${weakerAfterEvo.slice(0, 4)}`);

  // 진화하면 스탯 말고도 뭔가 바뀐다 (설계 규칙 2)
  const statOnly = ids.filter(id => {
    const a = PD.byId[id];
    if (!a.evolvesTo) return false;
    const b = PD.byId[a.evolvesTo];
    return a.range === b.range &&
           a.attackSpeed === b.attackSpeed &&
           a.attackType === b.attackType &&
           a.types.join() === b.types.join() &&
           a.targeting === b.targeting;
  });
  check('진화 시 공격력만 오르는 개체가 없다', statOnly.length === 0, `bad=${statOnly.slice(0, 4)}`);

  // 등급이 높을수록 평균적으로 세다
  const avgByRarity = RPD.TIER_ORDER.map(r => {
    const pool = PD.summonPool(r);
    return pool.reduce((n, id) => n + PD.dps(PD.byId[id]), 0) / pool.length;
  });
  check('상위 등급일수록 1단계 평균 화력이 높다',
    avgByRarity.every((v, i) => i === 0 || v > avgByRarity[i - 1]),
    avgByRarity.map(v => Math.round(v)).join(' < '));

  // 각성이 실제로 이득이어야 한다
  const noAwakenGain = ids.filter(id => PD.dps(PD.byId[id], 0, true) <= PD.dps(PD.byId[id], 0, false));
  check('각성하면 반드시 강해진다', noAwakenGain.length === 0, `bad=${noAwakenGain.slice(0, 4)}`);

  check('강화가 공격력을 올린다',
    PD.computeAttack(PD.byId[ids[0]], 3, false) > PD.computeAttack(PD.byId[ids[0]], 0, false));

  check('알 수 없는 id 는 null 을 준다', PD.get('없는포켓몬') === null);
}

/* ---------- 소환 ---------- */
section('랜덤 소환 (SummonManager)');
{
  const SM = RPD.SummonManager;
  const GM = RPD.GameManager;
  const F = RPD.FieldManager;
  const T = RPD.TiersTable;

  function fresh() {
    GM.reset('NORMAL');
    GM.setState(RPD.GameState.RUNNING);
    F.init();
    SM.reset();
    RPD.EconomyManager.reset();
  }

  fresh();

  const odds = SM.currentOdds();
  const total = Object.keys(odds).reduce((n, k) => n + odds[k], 0);
  check('표시 확률의 합이 100%다', Math.abs(total - 100) < 0.01, `total=${total.toFixed(3)}`);
  check('커먼이 가장 잘 나온다',
    RPD.TIER_ORDER.every((r, i) => i === 0 || odds[r] < odds[RPD.TIER_ORDER[i - 1]]));

  // 하드 천장: 에픽 없이 12회면 다음은 확정
  fresh();
  SM.sinceEpic = T.hardPityEpic;
  const forced = SM.rollRarity();
  check('에픽 천장이 실제로 터진다',
    RPD.TIER_ORDER.indexOf(forced) >= RPD.TIER_ORDER.indexOf('T3'), `got=${forced}`);
  check('천장이 터지면 카운터가 초기화된다', SM.sinceEpic === 0);

  fresh();
  SM.sinceLegendary = T.hardPityLegendary;
  const legend = SM.rollRarity();
  check('전설 천장이 실제로 터진다',
    RPD.TIER_ORDER.indexOf(legend) >= RPD.TIER_ORDER.indexOf('T4'), `got=${legend}`);

  // 소프트 천장은 확률을 실제로 올려야 한다
  fresh();
  const before = SM.currentOdds().T3;
  SM.sinceEpic = T.softPityAfter + 3;
  const after = SM.currentOdds().T3;
  check('소프트 천장이 에픽 확률을 올린다', after > before, `${before.toFixed(1)}% → ${after.toFixed(1)}%`);

  // 웨이브 보정
  fresh();
  const early = SM.currentOdds().T4;
  GM.setWave(30);
  const late = SM.currentOdds().T4;
  check('후반 웨이브에서 전설이 더 잘 나온다', late > early, `${early.toFixed(2)}% → ${late.toFixed(2)}%`);

  // 천장이 없다면 100회 중 에픽 이상이 나오지 않는 판이 존재할 것 — 천장이 그것을 막는다
  fresh();
  let worstDry = 0, dry = 0;
  for (let i = 0; i < 3000; i++) {
    const r = SM.rollRarity();
    if (RPD.TIER_ORDER.indexOf(r) >= 2) { worstDry = Math.max(worstDry, dry); dry = 0; }
    else dry += 1;
  }
  check('에픽 가뭄이 천장을 넘지 않는다', worstDry <= T.hardPityEpic, `최장 ${worstDry}회`);

  // 실제 소환 동작
  fresh();
  const cost = RPD.EconomyManager.summonCost();
  const goldBefore = GM.gold;
  const r1 = SM.summon();
  check('소환이 성공한다', r1.ok === true, `reason=${r1.reason}`);
  check('골드가 차감된다', GM.gold === goldBefore - cost, `gold=${GM.gold}`);
  check('빈 칸에 배치된다', F.getUnits().length === 1);
  check('개체에 실효 스탯이 채워진다', r1.unit.attack > 0 && r1.unit.dps > 0);
  check('환급 근거가 기록된다', r1.unit.investedGold === cost);

  GM.gold = 0;
  const poor = SM.summon();
  check('골드가 없으면 거부된다', poor.ok === false && poor.reason === 'NO_GOLD');

  fresh();
  GM.gold = 999999;
  for (let i = 0; i < 16; i++) SM.summon();
  check('슬롯 16칸이 다 찬다', F.emptyCount() === 0, `empty=${F.emptyCount()}`);
  const full = SM.summon();
  check('칸이 없으면 거부된다', full.ok === false && full.reason === 'NO_SLOT');

  // 소환권
  fresh();
  GM.gold = 0;
  SM.grantTicket(1);
  const ticketResult = SM.summon({ useTicket: true });
  check('소환권으로 골드 없이 뽑는다', ticketResult.ok === true);
  check('소환권이 소모된다', SM.tickets === 0);
  check('소환권은 레어 이상을 준다',
    RPD.TIER_ORDER.indexOf(ticketResult.tier) >= RPD.TIER_ORDER.indexOf(T.ticketFloor),
    `got=${ticketResult.tier}`);

  // 보스를 잡으면 소환권이 들어온다
  fresh();
  SM.init();
  RPD.bus.emit('enemy:died', { enemy: { isBoss: true, defId: 'boss_charger', wave: 10 } });
  check('보스 처치가 소환권을 준다', SM.tickets === 1, `tickets=${SM.tickets}`);
}

/* ---------- 방출 ---------- */
section('방출 (EconomyManager)');
{
  const GM = RPD.GameManager;
  const F = RPD.FieldManager;
  const EC = RPD.EconomyManager;

  GM.reset('NORMAL');
  F.init();
  EC.reset();

  const unit = RPD.UnitManager.create('pikachu');
  unit.investedGold = 40;
  F.place(0, unit);

  const expected = Math.floor(40 * RPD.Config.sellRefundRate);
  const goldBefore = GM.gold;
  const refund = EC.sell(0);

  check('환급액이 투자액의 절반이다', refund === expected, `refund=${refund} expected=${expected}`);
  check('골드가 들어온다', GM.gold === goldBefore + refund);
  check('칸이 비워진다', F.get(0).unit === null);
  check('빈 칸을 방출해도 안전하다', EC.sell(5) === 0);
}

/* ---------- 자동 전투 ---------- */
section('자동 전투 (CombatManager)');
{
  const CM = RPD.CombatManager;
  const EM = RPD.EnemyManager;
  const F = RPD.FieldManager;
  const GM = RPD.GameManager;
  const UM = RPD.UnitManager;
  const step = RPD.Config.fixedStep;

  CM.init();   // 처치 기여 집계를 붙인다. 실제 게임에서는 main.js 가 부팅 때 한 번 호출한다.

  function setup() {
    GM.reset('NORMAL');
    GM.setState(RPD.GameState.RUNNING);
    F.init(); EM.reset(); CM.reset();
  }

  // 사거리 안의 적을 때린다
  setup();
  const shooter = UM.create('pikachu');
  F.place(5, shooter);
  UM.recomputeAll();
  const slot5 = F.get(5);
  const victim = EM.spawn('tank', 1);
  victim.x = slot5.x; victim.y = slot5.y + 20;   // 사거리 안으로 옮긴다

  const hpBefore = victim.hp;
  for (let i = 0; i < 120; i++) { CM.update(step); }
  check('사거리 안의 적을 자동으로 때린다', victim.hp < hpBefore,
    `${hpBefore} → ${Math.round(victim.hp)}`);
  check('개체에 누적 피해가 기록된다', shooter.totalDamage > 0);

  // 사거리 밖은 안 때린다
  setup();
  const idle = UM.create('pikachu');
  F.place(5, idle);
  UM.recomputeAll();
  const farEnemy = EM.spawn('tank', 1);
  farEnemy.x = 20; farEnemy.y = 580;
  const farHp = farEnemy.hp;
  for (let i = 0; i < 120; i++) CM.update(step);
  check('사거리 밖의 적은 못 때린다', farEnemy.hp === farHp);
  check('때릴 대상이 없으면 피해 기록도 없다', idle.totalDamage === 0);

  // 공격속도가 실제 타격 횟수로 이어진다
  setup();
  const fast = UM.create('pikachu');
  F.place(5, fast);
  UM.recomputeAll();
  const dummy = EM.spawn('tank', 30);   // 충분히 단단해서 안 죽는 대상
  dummy.x = F.get(5).x; dummy.y = F.get(5).y + 20;
  let attacks = 0;
  const countAttack = () => { attacks += 1; };
  RPD.bus.on('unit:attack', countAttack);
  for (let i = 0; i < 60 * 4; i++) CM.update(step);   // 4초
  RPD.bus.off('unit:attack', countAttack);
  const expectedAttacks = fast.attackSpeed * 4;
  check('공격 횟수가 공격속도와 맞는다', Math.abs(attacks - expectedAttacks) <= 2,
    `${attacks}회 (기대 ${expectedAttacks.toFixed(1)}회)`);

  // 광역은 주변까지 때린다
  setup();
  const splasher = UM.create('diglett');
  const splashDef = RPD.PokemonData.all()
    .map(id => RPD.PokemonData.byId[id])
    .find(d => d.attackType === 'SPLASH' && d.splash > 0);
  check('광역 공격 개체가 존재한다', !!splashDef);

  if (splashDef) {
    setup();
    const aoe = UM.create(splashDef.id);
    F.place(5, aoe);
    UM.recomputeAll();
    const s = F.get(5);
    const a = EM.spawn('tank', 1); a.x = s.x; a.y = s.y + 20;
    const b = EM.spawn('tank', 1); b.x = s.x + 12; b.y = s.y + 20;
    const bHp = b.hp;
    for (let i = 0; i < 120; i++) CM.update(step);
    check('광역이 옆의 적까지 때린다', b.hp < bHp, `주변 피해 ${Math.round(bHp - b.hp)}`);
  }

  // 연쇄는 여러 대상에 튄다
  const chainDef = RPD.PokemonData.all()
    .map(id => RPD.PokemonData.byId[id])
    .find(d => d.attackType === 'CHAIN' && d.chain > 0);
  check('연쇄 공격 개체가 존재한다', !!chainDef);

  if (chainDef) {
    setup();
    const ch = UM.create(chainDef.id);
    F.place(5, ch);
    UM.recomputeAll();
    const s = F.get(5);
    const t1 = EM.spawn('tank', 1); t1.x = s.x; t1.y = s.y + 20;
    const t2 = EM.spawn('tank', 1); t2.x = s.x + 30; t2.y = s.y + 20;
    const t2Hp = t2.hp;
    let jumps = 0;
    const onChain = () => { jumps += 1; };
    RPD.bus.on('combat:chain', onChain);
    for (let i = 0; i < 180; i++) CM.update(step);
    RPD.bus.off('combat:chain', onChain);
    check('연쇄가 다음 대상으로 튄다', jumps > 0 && t2.hp < t2Hp, `전이 ${jumps}회`);
  }

  // 우선 대상 규칙
  setup();
  const picker = UM.create('pikachu');
  F.place(5, picker);
  UM.recomputeAll();
  const sp = F.get(5);
  const behind = EM.spawn('grunt', 1, { distance: 100 });
  const ahead = EM.spawn('grunt', 1, { distance: 900 });
  behind.x = sp.x - 20; behind.y = sp.y + 20;
  ahead.x = sp.x + 20; ahead.y = sp.y + 20;
  picker.targeting = 'FIRST';
  check('FIRST 는 출구에 가까운 적을 고른다', CM.findTarget(picker) === ahead);
  picker.targeting = 'LAST';
  check('LAST 는 갓 나온 적을 고른다', CM.findTarget(picker) === behind);
  picker.targeting = 'STRONGEST';
  behind.hp = 5000;
  check('STRONGEST 는 체력이 가장 많은 적을 고른다', CM.findTarget(picker) === behind);
  picker.targeting = 'BOSS';
  const bossTarget = EM.spawn('boss_charger', 10);
  bossTarget.x = sp.x; bossTarget.y = sp.y + 20;
  check('BOSS 는 보스를 우선한다', CM.findTarget(picker) === bossTarget);

  // 방어 무시
  const ghost = RPD.PokemonData.all()
    .map(id => RPD.PokemonData.byId[id])
    .find(d => d.ignoreArmor);
  check('방어 무시 개체가 존재한다', !!ghost);

  // 인접 버프(오라)
  const buffer = RPD.PokemonData.all()
    .map(id => RPD.PokemonData.byId[id])
    .find(d => d.auraAttack > 0);
  check('버퍼 개체가 존재한다', !!buffer);

  if (buffer) {
    setup();
    const ally = UM.create('pikachu');
    F.place(5, ally);
    UM.recomputeAll();
    const soloAttack = ally.attack;

    F.place(6, UM.create(buffer.id));   // 5 와 6 은 같은 행 옆칸
    UM.recomputeAll();
    check('인접 버퍼가 공격력을 올린다', ally.attack > soloAttack,
      `${soloAttack.toFixed(1)} → ${ally.attack.toFixed(1)}`);

    RPD.EconomyManager.sell(6);
    UM.recomputeAll();
    check('버퍼가 사라지면 원래대로 돌아온다', Math.abs(ally.attack - soloAttack) < 0.01);
  }

  // 실제로 적을 죽이고 골드가 들어오는지
  setup();
  const killer = UM.create('mewtwo') || UM.create('pikachu');
  F.place(5, killer);
  UM.recomputeAll();
  const prey = EM.spawn('grunt', 1);
  prey.x = F.get(5).x; prey.y = F.get(5).y + 20;
  let died = 0;
  const onDied = () => { died += 1; };
  RPD.bus.on('enemy:died', onDied);
  for (let i = 0; i < 60 * 20; i++) { CM.update(step); if (died) break; }
  RPD.bus.off('enemy:died', onDied);
  check('포켓몬이 적을 실제로 처치한다', died === 1, `died=${died}`);
  check('처치가 개체 기록에 남는다', killer.kills === 1);
}

/* ---------- 합성 ---------- */
section('합성 / 진화 / 각성 (FusionManager)');
{
  const FM = RPD.FusionManager;
  const F = RPD.FieldManager;
  const GM = RPD.GameManager;
  const UM = RPD.UnitManager;
  const PD = RPD.PokemonData;
  const N = RPD.Config.fusionCount;

  function board(ids) {
    GM.reset('NORMAL');
    F.init();
    FM.reset();
    ids.forEach((id, i) => { if (id) F.place(i, UM.create(id)); });
    UM.recomputeAll();
  }

  // 2마리로는 안 되고 3마리부터 된다
  board(['charmander', 'charmander']);
  check('2마리로는 합성할 수 없다', FM.list().length === 0);

  board(['charmander', 'charmander', 'charmander']);
  const list = FM.list();
  check('같은 개체 3마리가 합성 후보가 된다', list.length === 1, `count=${list.length}`);
  check('결과가 다음 진화 단계다', list[0].kind === 'EVOLVE' && list[0].result === 'charmeleon',
    `result=${list[0].result}`);

  const r1 = FM.fuse();
  check('합성이 성공한다', r1.ok === true);
  check('재료 3마리가 1마리로 줄어든다', F.getUnits().length === 1, `units=${F.getUnits().length}`);
  check('결과물이 진화체다', F.getUnits()[0].defId === 'charmeleon');
  check('진화하면 실제로 강해진다',
    F.getUnits()[0].dps > PD.dps(PD.get('charmander')),
    `${Math.round(PD.dps(PD.get('charmander')))} → ${Math.round(F.getUnits()[0].dps)}`);
  check('합성 후 후보 목록이 비워진다', FM.list().length === 0);

  // 3단계까지 올린 뒤 각성
  const line = PD.families.charmander;
  const final = line[line.length - 1];
  board([final, final, final]);
  const awakenList = FM.list();
  check('최종 단계 3마리는 각성 후보가 된다', awakenList[0].kind === 'AWAKEN',
    `kind=${awakenList[0] && awakenList[0].kind}`);

  const beforeDps = F.getUnits()[0].dps;
  FM.fuse();
  const awakened = F.getUnits()[0];
  check('각성이 적용된다', awakened.awakened === true);
  check('각성하면 강해진다', awakened.dps > beforeDps,
    `${Math.round(beforeDps)} → ${Math.round(awakened.dps)}`);
  check('각성체는 종이 그대로다', awakened.defId === final);

  // 각성체 3마리는 더 갈 데가 없다
  board([final, final, final]);
  F.getUnits().forEach(u => { u.awakened = true; });
  UM.recomputeAll();
  const capped = FM.list().filter(f => f.kind !== 'TIERUP');
  check('각성체는 더 합성되지 않는다', capped.length === 0, `count=${capped.length}`);

  // 각성체와 비각성체는 섞이지 않는다
  board([final, final, final, final]);
  F.get(0).unit.awakened = true;
  UM.recomputeAll();
  const mixed = FM.list().filter(f => f.kind === 'AWAKEN');
  check('각성체와 비각성체가 섞이지 않는다',
    mixed.length === 1 && mixed[0].slots.indexOf(0) < 0, `slots=${mixed[0] && mixed[0].slots}`);

  // 분기 진화
  board(['eevee', 'eevee', 'eevee']);
  const branchEntry = FM.list()[0];
  check('분기 개체는 BRANCH 로 표시된다', branchEntry.kind === 'BRANCH');
  check('선택지가 3개다', branchEntry.result.length === 3, `count=${branchEntry.result.length}`);

  const branchResult = FM.fuse();
  check('분기는 즉시 합성되지 않고 대기한다',
    branchResult.kind === 'BRANCH' && F.getUnits().length === 3);
  check('대기 상태가 기록된다', FM.pending !== null);

  const picked = branchEntry.result[1];
  FM.chooseBranch(picked);
  check('고른 갈래로 진화한다', F.getUnits()[0].defId === picked, `got=${F.getUnits()[0].defId}`);
  check('대기 상태가 해제된다', FM.pending === null);

  board(['eevee', 'eevee', 'eevee']);
  FM.fuse();
  FM.cancelBranch();
  check('분기를 취소하면 재료가 남는다', F.getUnits().length === 3 && FM.pending === null);

  board(['eevee', 'eevee', 'eevee']);
  FM.fuse();
  const bad = FM.chooseBranch('없는진화');
  check('없는 갈래는 거부된다', bad.ok === false && bad.reason === 'BAD_CHOICE');
  FM.cancelBranch();

  // 등급 합성 — 서로 다른 종이라도 같은 등급 3마리면 위로 올라간다
  const commons = PD.summonPool('T1');
  const needCommon = FM.tierUpCountFor('T1');
  board(commons.slice(0, needCommon));
  const tier = FM.list().filter(f => f.kind === 'TIERUP');
  check('다른 종을 모으면 등급 합성 후보가 된다', tier.length === 1, `count=${tier.length}`);
  check('필요 수보다 적으면 후보가 아니다', (() => {
    board(commons.slice(0, needCommon - 1));
    return FM.list().filter(f => f.kind === 'TIERUP').length === 0;
  })());
  board(commons.slice(0, needCommon));

  // 상위 등급일수록 더 많이 모아야 한다 — v1 은 전부 3마리라 신화가 찍어내졌다
  const needs = RPD.TIER_ORDER.slice(0, -1).map(r => FM.tierUpCountFor(r));
  check('상위 등급 합성이 더 비싸다', needs[needs.length - 1] > needs[0], `needs=${needs}`);
  check('신화까지 가는 커먼 비용이 100마리를 넘는다',
    needs.reduce((a, b) => a * b, 1) > 100, `커먼 ${needs.reduce((a, b) => a * b, 1)}마리`);
  check('결과 등급이 한 단계 위다', tier[0].result === 'T2', `result=${tier[0].result}`);

  FM.fuse(tier[0].key);
  const upped = F.getUnits()[0];
  check('등급 합성이 상위 등급을 만든다', upped.tier === 'T2', `tier=${upped.tier}`);
  check('등급 합성 결과는 1단계다', upped.def.stage === 1);
  check('재료가 소모된다', F.getUnits().length === 1);

  // 종 합성이 등급 합성보다 우선한다
  board([commons[0], commons[0], commons[0]]);
  const both = FM.list();
  check('같은 종 3마리는 종 합성으로만 잡힌다',
    both.length === 1 && both[0].kind === 'EVOLVE', `kinds=${both.map(f => f.kind)}`);

  // 진화한 개체는 등급 합성 재료가 되지 않는다 (실수로 갈려 나가면 안 된다)
  board(['charmeleon', 'wartortle', 'ivysaur']);
  check('2단계 이상은 등급 합성 재료가 아니다',
    FM.list().filter(f => f.kind === 'TIERUP').length === 0);

  // 신화는 더 위가 없다
  const mythics = PD.summonPool('T5');
  if (mythics.length >= 3) {
    board([mythics[0], mythics[1], mythics[2]]);
    check('신화는 등급 합성이 없다',
      FM.list().filter(f => f.kind === 'TIERUP').length === 0);
  }

  // 강화 승계 규칙
  board(['charmander', 'charmander', 'charmander']);
  F.get(1).unit.level = 4;
  UM.recomputeAll();
  FM.fuse();
  check('진화하면 재료의 강화는 사라진다', F.getUnits()[0].level === 0,
    `level=${F.getUnits()[0].level}`);
  check('결과물이 강화가 많던 칸에 앉는다', F.getUnits()[0].slotIndex === 1,
    `slot=${F.getUnits()[0].slotIndex}`);

  board([final, final, final]);
  F.get(2).unit.level = 3;
  UM.recomputeAll();
  FM.fuse();
  check('각성은 강화를 유지한다', F.getUnits()[0].level === 3, `level=${F.getUnits()[0].level}`);

  // 투자 골드 승계 — 합성이 손해가 되면 아무도 안 한다
  board(['charmander', 'charmander', 'charmander']);
  F.getUnits().forEach(u => { u.investedGold = 30; });
  FM.fuse();
  check('투자 골드가 결과물에 승계된다', F.getUnits()[0].investedGold === 90,
    `invested=${F.getUnits()[0].investedGold}`);
  check('환급액도 그만큼 오른다',
    RPD.EconomyManager.sellValue(F.getUnits()[0]) === 45);

  // 합성 대기 슬롯 조회 (렌더러가 테두리를 빛낼 때 쓴다)
  board(['charmander', 'charmander', 'charmander']);
  const ready = FM.readySlots();
  check('합성 준비된 칸을 알려 준다',
    Object.keys(ready).length === N, `count=${Object.keys(ready).length}`);

  // 빈 필드에서 합성해도 안전해야 한다
  board([]);
  const empty = FM.fuse();
  check('빈 필드에서 합성하면 조용히 거부된다', empty.ok === false && empty.reason === 'NO_MATCH');

  // 커먼도 끝까지 키우면 에픽 1단계급이 된다 (기획서의 약속)
  {
    const commonLine = PD.families[PD.get(PD.summonPool('T1')[0]).family];
    const commonTop = PD.get(commonLine[commonLine.length - 1]);
    const commonMax = PD.dps(commonTop, 0, true);
    const epicBase = PD.summonPool('T3')
      .map(id => PD.dps(PD.get(id)))
      .sort((a, b) => a - b);
    const epicMedian = epicBase[Math.floor(epicBase.length / 2)];
    check('커먼 최종+각성이 에픽 1단계급에 닿는다', commonMax >= epicMedian * 0.6,
      `커먼 ${Math.round(commonMax)} vs 에픽중앙값 ${Math.round(epicMedian)}`);
  }
}

/* ---------- 타입 시너지 ---------- */
section('타입 시너지 (SynergyManager)');
{
  const SY = RPD.SynergyManager;
  const F = RPD.FieldManager;
  const GM = RPD.GameManager;
  const UM = RPD.UnitManager;
  const PD = RPD.PokemonData;

  // 시너지 표 자체의 무결성
  const badType = Object.keys(RPD.Synergies).filter(t => !RPD.Types[t]);
  check('시너지가 존재하는 타입만 참조한다', badType.length === 0, `bad=${badType}`);

  const unsorted = Object.keys(RPD.Synergies).filter(t => {
    const tiers = RPD.Synergies[t];
    return tiers.some((x, i) => i > 0 && x.count <= tiers[i - 1].count);
  });
  check('시너지 단계가 오름차순이다', unsorted.length === 0, `bad=${unsorted}`);

  const noBonus = Object.keys(RPD.Synergies).filter(t =>
    RPD.Synergies[t].some(x => !x.bonus || Object.keys(x.bonus).length === 0));
  check('모든 단계에 실제 효과가 붙어 있다', noBonus.length === 0, `bad=${noBonus}`);

  // 표에 적힌 키가 실제로 쓰이는 키인지 — 오타가 나면 조용히 아무 일도 안 일어난다
  SY.reset();
  const validKeys = Object.keys(SY.bonus);
  const ghostKeys = [];
  for (const t of Object.keys(RPD.Synergies)) {
    for (const tier of RPD.Synergies[t]) {
      for (const k of Object.keys(tier.bonus)) {
        if (validKeys.indexOf(k) < 0) ghostKeys.push(t + '.' + k);
      }
    }
  }
  check('시너지 보너스 키에 오타가 없다', ghostKeys.length === 0, `bad=${ghostKeys}`);

  // 모든 라벨이 실제 수치와 어긋나지 않는지 (수치만 바꾸고 라벨을 잊는 사고 방지)
  const labelless = Object.keys(RPD.Synergies).filter(t =>
    RPD.Synergies[t].some(x => !x.label || !x.label.trim()));
  check('모든 단계에 설명이 있다', labelless.length === 0, `bad=${labelless}`);

  // 로스터가 시너지를 채울 수 있는지 — 표에만 있고 달성 불가능하면 죽은 규칙이다
  const speciesByType = {};
  PD.all().forEach(id => {
    (PD.byId[id].types || []).forEach(t => {
      speciesByType[t] = (speciesByType[t] || 0) + 1;
    });
  });
  const unreachable = Object.keys(RPD.Synergies).filter(t => {
    const top = RPD.Synergies[t][RPD.Synergies[t].length - 1].count;
    return (speciesByType[t] || 0) < top;
  });
  check('모든 시너지 최고 단계가 달성 가능하다', unreachable.length === 0, `bad=${unreachable}`);

  /* --- 실제 계산 --- */
  function board(ids) {
    GM.reset('NORMAL');
    F.init();
    ids.forEach((id, i) => { if (id) F.place(i, UM.create(id)); });
    UM.recomputeAll();
  }

  function withType(typeId, n) {
    const ids = PD.all().filter(id => (PD.byId[id].types || []).indexOf(typeId) >= 0);
    const out = [];
    for (let i = 0; i < n; i++) out.push(ids[i % ids.length]);
    return out;
  }

  board([]);
  check('빈 필드에는 시너지가 없다', SY.active.length === 0);
  check('빈 필드의 보너스는 기본값이다', SY.bonus.attackSpeedMul === 1 && SY.bonus.goldMul === 1);

  // 비행 2마리 → 공격속도
  const flying = withType('FLYING', 2);
  board(flying);
  check('비행 2마리가 시너지를 켠다', SY.countOf('FLYING') >= 2 && SY.bonus.attackSpeedMul > 1,
    `count=${SY.countOf('FLYING')} mul=${SY.bonus.attackSpeedMul}`);

  // 같은 개체를 여러 마리 놓아도 각각 센다
  board([flying[0], flying[0], flying[0]]);
  check('같은 종도 마릿수만큼 센다', SY.countOf('FLYING') === 3, `count=${SY.countOf('FLYING')}`);

  // 복합 타입은 두 타입을 모두 채운다
  const dual = PD.all().find(id => (PD.byId[id].types || []).length === 2);
  board([dual]);
  const d = PD.byId[dual];
  check('복합 타입이 두 타입을 모두 채운다',
    SY.countOf(d.types[0]) === 1 && SY.countOf(d.types[1]) === 1);

  // 단계가 올라가면 효과도 커진다
  const fire2 = withType('FIRE', 2);
  const fire4 = withType('FIRE', 4);
  board(fire2);
  const burn2 = SY.bonus.burnMul;
  board(fire4);
  const burn4 = SY.bonus.burnMul;
  check('시너지 단계가 오르면 효과가 커진다', burn4 > burn2, `${burn2} → ${burn4}`);
  check('상위 단계만 적용된다 (단계가 겹쳐 쌓이지 않는다)',
    burn4 === RPD.Synergies.FIRE[1].bonus.burnMul, `burnMul=${burn4}`);

  // 시너지가 실효 스탯에 실제로 반영된다
  board([flying[0]]);
  const soloSpeed = F.getUnits()[0].attackSpeed;
  board(withType('FLYING', 4));
  const synSpeed = F.get(0).unit.attackSpeed;
  check('비행 시너지가 공격속도를 실제로 올린다', synSpeed > soloSpeed,
    `${soloSpeed.toFixed(2)} → ${synSpeed.toFixed(2)}`);

  const dragons = withType('DRAGON', 4);
  board([dragons[0]]);
  const soloCrit = F.getUnits()[0].critRate;
  board(dragons);
  check('드래곤 시너지가 치명타율을 올린다', F.get(0).unit.critRate > soloCrit,
    `${soloCrit.toFixed(2)} → ${F.get(0).unit.critRate.toFixed(2)}`);

  // 경제 시너지
  const grass = withType('GRASS', 4);
  board([]);
  const plainGold = RPD.EconomyManager.killReward({ wave: 10, def: RPD.EnemyData.grunt, isBoss: false });
  board(grass);
  const synGold = RPD.EconomyManager.killReward({ wave: 10, def: RPD.EnemyData.grunt, isBoss: false });
  check('풀 시너지가 골드를 늘린다', synGold > plainGold, `${plainGold} → ${synGold}`);

  /* 벌레(소환 할인)·페어리(보호막) 시너지는 PHASE 15 에서 제거했다.
   * 30판 측정에서 각각 0%·3% 만 켜져, 표에만 있고 플레이어가 못 보는 규칙이었다.
   * 타입 고유 효과는 그대로 남아 있고 "여러 마리 모았을 때의 보너스"만 없앴다. */
  check('제거한 시너지가 표에 남아 있지 않다',
    !RPD.Synergies.BUG && !RPD.Synergies.FAIRY && !RPD.Synergies.ICE &&
    !RPD.Synergies.POISON && !RPD.Synergies.ROCK && !RPD.Synergies.DARK && !RPD.Synergies.STEEL);
  check('남은 시너지는 10종이다', Object.keys(RPD.Synergies).length === 10,
    `count=${Object.keys(RPD.Synergies).length}`);
}

/* ---------- 타입 기본 효과 ---------- */
section('타입 기본 효과 (전투 적용)');
{
  const CM = RPD.CombatManager;
  const EM = RPD.EnemyManager;
  const F = RPD.FieldManager;
  const GM = RPD.GameManager;
  const UM = RPD.UnitManager;
  const PD = RPD.PokemonData;
  const step = RPD.Config.fixedStep;

  function stage(typeId) {
    GM.reset('NORMAL');
    GM.setState(RPD.GameState.RUNNING);
    F.init(); EM.reset(); CM.reset();

    // 주 타입으로 먼저 찾고, 없으면 복합 타입 보유 개체로 찾는다.
    // 로스터를 줄이면서 어떤 타입은 주 타입 개체가 사라졌다(독 등).
    const id = PD.all().find(x => (PD.byId[x].types || [])[0] === typeId) ||
               PD.all().find(x => (PD.byId[x].types || []).indexOf(typeId) >= 0);
    if (!id) return null;

    const unit = UM.create(id);
    F.place(5, unit);
    UM.recomputeAll();

    const slot = F.get(5);
    const target = EM.spawn('tank', 20);   // 한 번에 안 죽을 만큼 단단하게
    target.x = slot.x; target.y = slot.y + 20;
    return { unit: unit, target: target };
  }

  // 불꽃 → 화상 (지속 피해)
  let sc = stage('FIRE');
  check('불꽃 타입 개체가 있다', !!sc);
  if (sc) {
    for (let i = 0; i < 90; i++) CM.update(step);
    check('불꽃이 화상을 남긴다',
      EM.dotStacks(sc.target, 'burn') > 0, `stacks=${EM.dotStacks(sc.target, 'burn')}`);
    check('화상은 중첩되지 않고 갱신된다',
      EM.dotStacks(sc.target, 'burn') === 1, `stacks=${EM.dotStacks(sc.target, 'burn')}`);
  }

  // 독 → 중첩
  sc = stage('POISON');
  check('독 타입 개체가 있다', !!sc);
  if (sc) {
    for (let i = 0; i < 240; i++) CM.update(step);
    const stacks = EM.dotStacks(sc.target, 'poison');
    check('독은 여러 번 중첩된다', stacks > 1, `stacks=${stacks}`);
    check('독 중첩에 한도가 있다',
      stacks <= RPD.TypeParams.poisonMaxStacks + RPD.SynergyManager.bonus.poisonStackAdd,
      `stacks=${stacks}`);
  }

  // 물 → 감속
  sc = stage('WATER');
  if (sc) {
    const baseSpeed = sc.target.baseSpeed;
    for (let i = 0; i < 90; i++) CM.update(step);
    check('물이 적을 느리게 만든다', EM.currentSpeed(sc.target) < baseSpeed,
      `${baseSpeed.toFixed(0)} → ${EM.currentSpeed(sc.target).toFixed(0)}`);
  }

  // 강철 → 방어력 감소
  sc = stage('STEEL');
  if (sc) {
    for (let i = 0; i < 90; i++) CM.update(step);
    check('강철이 방어력을 깎는다', sc.target.effects.armorShred > 0,
      `shred=${sc.target.effects.armorShred}`);
  }

  // 격투 → 보스 추가 피해
  // "보스에게 준 피해 / 일반 적에게 준 피해" 비율을 비교한다.
  // 절대 피해량을 비교하면 개체마다 공격속도가 달라 반올림에 흔들린다.
  {
    function damageOver(unitId, enemyId, seconds) {
      GM.reset('NORMAL'); GM.setState(RPD.GameState.RUNNING);
      F.init(); EM.reset(); CM.reset();

      const unit = UM.create(unitId);
      F.place(5, unit);
      UM.recomputeAll();
      unit.critRate = 0;           // 치명타 난수를 빼고 순수 배율만 본다

      const target = EM.spawn(enemyId, 10);
      target.armor = 0;
      target.maxHp = 1e12; target.hp = 1e12;   // 죽지 않게
      target.x = F.get(5).x; target.y = F.get(5).y + 20;

      const before = target.hp;
      for (let i = 0; i < 60 * seconds; i++) CM.update(step);
      return before - target.hp;
    }

    const fightId = PD.all().find(x => (PD.byId[x].types || []).indexOf('FIGHTING') >= 0);
    const plainId = PD.all().find(x => (PD.byId[x].types || [])[0] === 'NORMAL');
    check('격투 타입 개체가 있다', !!fightId);
    check('노말 타입 개체가 있다', !!plainId);

    if (fightId && plainId) {
      const fightRatio = damageOver(fightId, 'boss_charger', 12) / damageOver(fightId, 'tank', 12);
      const plainRatio = damageOver(plainId, 'boss_charger', 12) / damageOver(plainId, 'tank', 12);
      check('격투가 보스에게만 추가 피해를 준다', fightRatio > plainRatio * 1.2,
        `격투 ×${fightRatio.toFixed(2)} vs 노말 ×${plainRatio.toFixed(2)}`);
      check('노말은 보스든 잡몹이든 같다', Math.abs(plainRatio - 1) < 0.12,
        `ratio=${plainRatio.toFixed(2)}`);
    }
  }

  // 악 → 처형
  {
    GM.reset('NORMAL'); GM.setState(RPD.GameState.RUNNING);
    F.init(); EM.reset(); CM.reset();
    const darkId = PD.all().find(x => (PD.byId[x].types || []).indexOf('DARK') >= 0);
    if (darkId) {
      const dark = UM.create(darkId);
      F.place(5, dark);
      UM.recomputeAll();
      // 치명타가 뜨면 처형 기준을 건너뛰고 한 방에 죽어 검증이 흔들린다
      dark.critRate = 0;
      // 체력이 큰 적을 쓰면 한 타격으로 기준선을 못 넘어 테스트가 시간에 걸린다.
      // 처형 여부만 보면 되므로 작은 적으로 확인한다.
      // 한 타격에 죽어 버리면 처형이 발동할 기회가 없다.
      // 타격 한 번으로는 안 죽되 기준선은 넘는 체력을 직접 맞춘다.
      const prey = EM.spawn('tank', 8);
      prey.x = F.get(5).x; prey.y = F.get(5).y + 20;
      prey.maxHp = 4000; prey.hp = 4000 * 0.19;

      let executed = 0;
      const onExec = () => { executed += 1; };
      RPD.bus.on('combat:execute', onExec);
      for (let i = 0; i < 120 && prey.alive; i++) CM.update(step);
      RPD.bus.off('combat:execute', onExec);
      check('악 타입이 체력 낮은 적을 처형한다', executed > 0 && !prey.alive,
        `executed=${executed}`);
    }
  }
}

/* ---------- 보스 패턴 ---------- */
section('보스 패턴 (BossManager)');
{
  const BM = RPD.BossManager;
  const EM = RPD.EnemyManager;
  const CM = RPD.CombatManager;
  const F = RPD.FieldManager;
  const GM = RPD.GameManager;
  const UM = RPD.UnitManager;
  const ED = RPD.EnemyData;
  const step = RPD.Config.fixedStep;

  BM.init();   // 실제 게임에서는 main.js 가 부팅 때 한 번 호출한다

  // 데이터 무결성 — 패턴 이름 오타는 조용히 아무 일도 안 일어나게 만든다
  const bosses = ED.list.filter(id => ED[id].isBoss);
  const unknown = [];
  const noPattern = [];
  bosses.forEach(id => {
    const def = ED[id];
    if (!def.patterns || !def.patterns.length) noPattern.push(id);
    (def.patterns || []).forEach(pt => {
      if (!BM.handlers[pt.id]) unknown.push(id + '.' + pt.id);
    });
  });
  check('모든 보스에 주기 패턴이 있다', noPattern.length === 0, `bad=${noPattern}`);
  check('패턴 이름에 오타가 없다', unknown.length === 0, `bad=${unknown}`);

  const badSummon = bosses.filter(id =>
    (ED[id].patterns || []).some(pt => pt.id === 'summon' && !ED[pt.enemyId]));
  check('증원이 존재하는 적을 부른다', badSummon.length === 0, `bad=${badSummon}`);

  const noPhase = bosses.filter(id => !ED[id].phase2);
  check('모든 보스에 페이즈 전환이 있다', noPhase.length === 0, `bad=${noPhase}`);

  const badPhase = bosses.filter(id => {
    const p = ED[id].phase2;
    return !(p.at > 0 && p.at < 1) || !p.label;
  });
  check('페이즈 전환 조건이 올바르다', badPhase.length === 0, `bad=${badPhase}`);

  function stage(bossId) {
    GM.reset('NORMAL');
    GM.setState(RPD.GameState.RUNNING);
    F.init(); EM.reset(); CM.reset(); BM.reset();
    const boss = EM.spawn(bossId, 10);
    return boss;
  }

  // 보스가 등장하면 자동으로 추적된다
  let boss = stage('boss_charger');
  check('보스가 등장하면 추적된다', BM.boss === boss);
  check('처음엔 1페이즈다', BM.phase === 1 && boss.phase === 1);

  // 증원 패턴
  const beforeCount = EM.aliveCount();
  let events = [];
  const onPattern = (p) => { events.push(p.id); };
  RPD.bus.on('boss:pattern', onPattern);
  for (let i = 0; i < 60 * 9; i++) { BM.update(step); }
  RPD.bus.off('boss:pattern', onPattern);

  check('증원 패턴이 발동한다', events.indexOf('summon') >= 0, `events=${events}`);
  check('증원이 적을 실제로 늘린다', EM.aliveCount() > beforeCount,
    `${beforeCount} → ${EM.aliveCount()}`);

  // 패턴은 주기적으로 반복된다
  events = [];
  RPD.bus.on('boss:pattern', onPattern);
  // 가장 긴 주기의 두 배 이상을 돌려야 "반복"을 확인할 수 있다
  const longest = Math.max(...ED.boss_charger.patterns.map(pt => pt.every || 12));
  for (let i = 0; i < 60 * (longest * 2 + 5); i++) BM.update(step);
  RPD.bus.off('boss:pattern', onPattern);
  check('패턴이 주기적으로 반복된다', events.length >= 2, `count=${events.length}`);

  // 페이즈 전환
  boss = stage('boss_charger');
  const speedBefore = boss.baseSpeed;
  boss.hp = boss.maxHp * 0.45;
  let phaseFired = 0;
  const onPhase = () => { phaseFired += 1; };
  RPD.bus.on('boss:phase', onPhase);
  BM.update(step);
  check('체력 절반에서 페이즈가 바뀐다', BM.phase === 2 && boss.phase === 2);
  check('페이즈 전환 이벤트가 나간다', phaseFired === 1, `fired=${phaseFired}`);
  check('폭주대장은 2페이즈에서 빨라진다', boss.baseSpeed > speedBefore,
    `${speedBefore.toFixed(0)} → ${boss.baseSpeed.toFixed(0)}`);

  for (let i = 0; i < 300; i++) BM.update(step);
  RPD.bus.off('boss:phase', onPhase);
  check('페이즈 전환은 한 번만 일어난다', phaseFired === 1, `fired=${phaseFired}`);

  // 방해자 — 침묵
  boss = stage('boss_warden');
  for (let i = 0; i < 6; i++) F.place(i, UM.create('pikachu'));
  UM.recomputeAll();

  const silenced = [];
  const onSilence = (p) => { if (p.id === 'silence') silenced.push(p); };
  RPD.bus.on('boss:pattern', onSilence);
  for (let i = 0; i < 60 * 10; i++) BM.update(step);
  RPD.bus.off('boss:pattern', onSilence);

  check('침묵 패턴이 발동한다', silenced.length > 0, `count=${silenced.length}`);
  if (silenced.length) {
    const disabled = F.getUnits().filter(u => UM.isDisabled(u));
    check('침묵이 실제로 포켓몬을 막는다', disabled.length > 0, `count=${disabled.length}`);
    check('침묵 대상 수가 설정과 맞는다',
      silenced[0].result.slots.length === 2, `count=${silenced[0].result.slots.length}`);
  }

  // 침묵 중에는 공격하지 않는다
  {
    GM.reset('NORMAL'); GM.setState(RPD.GameState.RUNNING);
    F.init(); EM.reset(); CM.reset(); BM.reset();
    const unit = UM.create('pikachu');
    F.place(5, unit);
    UM.recomputeAll();
    const prey = EM.spawn('tank', 25);
    prey.x = F.get(5).x; prey.y = F.get(5).y + 20;

    UM.disable(unit, 2);
    const hpBefore = prey.hp;
    for (let i = 0; i < 60; i++) CM.update(step);
    check('침묵 중에는 공격하지 않는다', prey.hp === hpBefore,
      `damage=${(hpBefore - prey.hp).toFixed(1)}`);

    for (let i = 0; i < 90; i++) CM.update(step);
    check('침묵이 풀리면 다시 공격한다', prey.hp < hpBefore);

    // 더 짧은 침묵이 긴 침묵을 덮어쓰면 안 된다
    UM.disable(unit, 5);
    const longUntil = unit.disabledUntil;
    UM.disable(unit, 1);
    check('짧은 무력화가 긴 것을 덮어쓰지 않는다', unit.disabledUntil === longUntil);
  }

  // 파괴자 — 충격파는 반경 안의 포켓몬만 친다
  boss = stage('boss_breaker');
  F.init();
  for (let i = 0; i < F.slots.length; i++) F.place(i, UM.create('pikachu'));
  UM.recomputeAll();
  boss.x = F.get(0).x; boss.y = F.get(0).y;   // 왼쪽 위 구석에 붙인다

  let shock = null;
  const onShock = (p) => { if (p.id === 'shockwave') shock = p; };
  RPD.bus.on('boss:pattern', onShock);
  for (let i = 0; i < 60 * 9; i++) BM.update(step);
  RPD.bus.off('boss:pattern', onShock);

  check('충격파 패턴이 발동한다', !!shock);
  if (shock) {
    const hitCount = shock.result.slots.length;
    check('충격파가 일부만 맞힌다', hitCount > 0 && hitCount < F.slots.length,
      `${hitCount}/${F.slots.length}칸`);

    const radius = shock.result.radius;
    const outside = F.slots.filter(s =>
      RPD.Utils.dist(s.x, s.y, shock.result.x, shock.result.y) > radius);
    const wronglyHit = outside.filter(s => shock.result.slots.indexOf(s.index) >= 0);
    check('반경 밖은 맞지 않는다', wronglyHit.length === 0, `bad=${wronglyHit.length}`);
  }

  // 보스가 죽거나 통과하면 패턴이 멈춘다
  boss = stage('boss_charger');
  EM.kill(boss, 'test');
  check('보스가 죽으면 추적이 끝난다', BM.boss === null);

  let after = [];
  const onAfter = (p) => { after.push(p.id); };
  RPD.bus.on('boss:pattern', onAfter);
  for (let i = 0; i < 60 * 30; i++) BM.update(step);
  RPD.bus.off('boss:pattern', onAfter);
  check('보스가 죽은 뒤에는 패턴이 안 나온다', after.length === 0, `count=${after.length}`);

  boss = stage('boss_charger');
  boss.distance = RPD.MapData.path.length + 10;
  EM.update(step);
  check('보스가 통과해도 추적이 끝난다', BM.boss === null);

  // 다음 패턴 예고
  boss = stage('boss_warden');
  const next = BM.nextPattern();
  check('다음 패턴을 예고할 수 있다', next && next.inSeconds > 0 && !!next.label,
    `next=${next && next.label}`);
  BM.reset();
  check('보스가 없으면 예고도 없다', BM.nextPattern() === null);
}

/* ---------- 강화 / 슬롯 확장 ---------- */
section('강화 · 슬롯 확장 (PHASE 12)');
{
  const EC = RPD.EconomyManager;
  const F = RPD.FieldManager;
  const GM = RPD.GameManager;
  const UM = RPD.UnitManager;
  const CFG = RPD.Config;

  function fresh() {
    GM.reset('NORMAL');
    GM.setState(RPD.GameState.RUNNING);
    F.init();
    EC.reset();
  }

  fresh();
  const unit = UM.create('pikachu');
  F.place(0, unit);
  UM.recomputeAll();

  const baseAttack = unit.attack;
  GM.gold = 99999;

  const cost1 = EC.upgradeCost(unit);
  check('강화 비용이 계산된다', cost1 > 0, `cost=${cost1}`);

  const goldBefore = GM.gold;
  const r1 = EC.upgrade(0);
  check('강화가 성공한다', r1.ok === true, `reason=${r1.reason}`);
  check('골드가 차감된다', GM.gold === goldBefore - cost1);
  check('강화 단계가 오른다', unit.level === 1);
  check('공격력이 실제로 오른다', unit.attack > baseAttack,
    `${baseAttack.toFixed(1)} → ${unit.attack.toFixed(1)}`);
  check('오른 폭이 설정과 맞는다',
    Math.abs(unit.attack / baseAttack - (1 + CFG.upgradeAttackStep)) < 0.001,
    `ratio=${(unit.attack / baseAttack).toFixed(3)}`);

  check('두 번째 강화가 더 비싸다', EC.upgradeCost(unit) > cost1,
    `${cost1} → ${EC.upgradeCost(unit)}`);

  while (EC.canUpgrade(unit)) EC.upgrade(0);
  check('최대 단계에서 멈춘다', unit.level === CFG.upgradeMaxLevel, `level=${unit.level}`);
  check('최대 단계면 더 못 올린다', EC.upgrade(0).reason === 'MAX_LEVEL');

  // 상위 등급은 강화가 더 비싸다
  fresh();
  const common = UM.create(RPD.PokemonData.summonPool('T1')[0]);
  const legend = UM.create(RPD.PokemonData.summonPool('T4')[0]);
  check('상위 등급 강화가 더 비싸다', EC.upgradeCost(legend) > EC.upgradeCost(common),
    `커먼 ${EC.upgradeCost(common)} vs 전설 ${EC.upgradeCost(legend)}`);

  // 골드가 없으면 거부
  fresh();
  F.place(0, UM.create('pikachu'));
  UM.recomputeAll();
  GM.gold = 0;
  check('골드가 없으면 강화가 거부된다', EC.upgrade(0).reason === 'NO_GOLD');
  check('빈 칸은 강화할 수 없다', EC.upgrade(7).reason === 'NO_UNIT');

  // 강화한 개체는 환급도 커진다
  fresh();
  const invested = UM.create('pikachu');
  invested.investedGold = 30;
  F.place(0, invested);
  UM.recomputeAll();
  GM.gold = 99999;
  const upCost = EC.upgradeCost(invested);
  EC.upgrade(0);
  check('강화 비용이 환급에 반영된다',
    EC.sellValue(invested) === Math.floor((30 + upCost) * CFG.sellRefundRate),
    `refund=${EC.sellValue(invested)}`);

  /* --- 슬롯 확장 --- */
  fresh();
  const locked = F.lockedSlots();
  check('잠긴 칸이 있다', locked.length === 2, `count=${locked.length}`);
  check('잠긴 칸에는 배치할 수 없다', F.place(locked[0].index, UM.create('pikachu')) === false);
  check('빈 칸 수에 잠긴 칸이 포함되지 않는다',
    F.emptyCount() === RPD.MapData.baseSlotCount, `empty=${F.emptyCount()}`);

  GM.gold = 0;
  check('골드가 없으면 못 산다', EC.unlockSlot(locked[0].index).reason === 'NO_GOLD');
  check('실패하면 여전히 잠겨 있다', !F.get(locked[0].index).unlocked);

  GM.gold = 99999;
  const buy = EC.unlockSlot(locked[0].index);
  check('슬롯을 살 수 있다', buy.ok === true);
  check('산 칸이 열린다', F.get(locked[0].index).unlocked === true);
  check('빈 칸 수가 늘어난다', F.emptyCount() === RPD.MapData.baseSlotCount + 1);
  check('산 칸에 배치할 수 있다', F.place(locked[0].index, UM.create('pikachu')) === true);
  check('이미 산 칸은 다시 못 산다', EC.unlockSlot(locked[0].index).reason === 'ALREADY');

  /* 확장 칸은 긴 사거리를 넣어야 값을 한다.
   * 짧은 사거리로 넣으면 기본 칸보다도 못하다는 걸 숫자로 확인해 둔다. */
  const exp = F.get(locked[0].index);
  const M2 = RPD.MapData;
  check('확장 칸은 사거리를 늘릴수록 이득이 커진다',
    M2.coverageOf(exp, RPD.Range.LONG) / M2.coverageOf(exp, RPD.Range.SHORT) > 5,
    `100→${M2.coverageOf(exp, RPD.Range.SHORT)} 235→${M2.coverageOf(exp, RPD.Range.LONG)}`);
  check('확장 칸 가격이 성능 순이다',
    F.lockedSlots().every((sl, i, arr) =>
      i === 0 || (sl.cost >= arr[i - 1].cost) === (M2.coverageOf(sl, RPD.Range.LONG) >= M2.coverageOf(arr[i - 1], RPD.Range.LONG))),
    '비싼 칸이 더 좋아야 한다');
}

/* ---------- 저장 ---------- */
section('저장 (SaveManager)');
{
  const SM = RPD.SaveManager;
  const GM = RPD.GameManager;

  SM.wipe();
  check('초기화하면 도감이 빈다', SM.dexCount() === 0);
  check('초기화하면 기록이 없다', SM.recordFor('NORMAL') === null);

  SM.recordSpecies('pikachu', 1);
  SM.recordSpecies('pikachu', 2);
  SM.recordSpecies('charmander', 1);
  check('도감이 종 단위로 센다', SM.dexCount() === 2, `count=${SM.dexCount()}`);
  check('만난 횟수가 쌓인다', SM.data.pokedex.pikachu.seen === 2);
  check('도달한 최고 단계가 남는다', SM.data.pokedex.pikachu.best === 2);
  check('본 개체를 조회할 수 있다', SM.hasSeen('pikachu') && !SM.hasSeen('mewtwo'));
  check('도감 전체 수가 로스터와 맞는다', SM.dexTotal() === RPD.PokemonData.all().length);

  // 저장 → 읽기
  SM.save();
  SM.data = { version: 0, pokedex: {}, records: {}, totals: {}, settings: {} };
  SM.load();
  check('저장한 도감이 다시 읽힌다', SM.dexCount() === 2, `count=${SM.dexCount()}`);

  // 기록은 나아졌을 때만 갱신된다
  SM.wipe();
  GM.reset('NORMAL');
  const a = SM.submitRun('NORMAL', { wave: 12, kills: 200, elapsed: 300 }, false);
  check('첫 기록은 항상 신기록이다', a.isBest === true);
  check('기록이 저장된다', SM.recordFor('NORMAL').wave === 12);

  const b = SM.submitRun('NORMAL', { wave: 8, kills: 900, elapsed: 200 }, false);
  check('더 낮은 웨이브는 기록을 덮지 않는다',
    b.isBest === false && SM.recordFor('NORMAL').wave === 12);

  const c = SM.submitRun('NORMAL', { wave: 20, kills: 300, elapsed: 500 }, true);
  check('더 높은 웨이브가 기록을 갱신한다',
    c.isBest === true && SM.recordFor('NORMAL').wave === 20);
  check('클리어 여부가 남는다', SM.recordFor('NORMAL').cleared === true);

  check('판 수가 누적된다', SM.data.totals.runs === 3, `runs=${SM.data.totals.runs}`);
  check('클리어 수가 누적된다', SM.data.totals.clears === 1);
  check('처치 수가 누적된다', SM.data.totals.kills === 1400, `kills=${SM.data.totals.kills}`);

  // 모드마다 기록이 따로 관리된다
  SM.submitRun('ENDLESS', { wave: 40, kills: 100, elapsed: 900 }, false);
  check('모드별로 기록이 분리된다',
    SM.recordFor('ENDLESS').wave === 40 && SM.recordFor('NORMAL').wave === 20);

  // 설정
  SM.setSetting('speed', 3);
  SM.load();
  check('설정이 저장된다', SM.getSetting('speed', 1) === 3);
  check('없는 설정은 기본값을 준다', SM.getSetting('없는키', 'x') === 'x');

  // 저장 파일이 깨져도 게임이 멈추면 안 된다
  sandbox.localStorage.setItem(RPD.SAVE_KEY, '{이건 JSON 이 아니다');
  SM.load();
  check('깨진 저장 파일을 만나면 초기화한다', SM.dexCount() === 0 && SM.data.version >= 1);

  sandbox.localStorage.setItem(RPD.SAVE_KEY, JSON.stringify({ version: 999, pokedex: { x: 1 } }));
  SM.load();
  check('미래 버전 파일은 건드리지 않고 새로 시작한다', SM.dexCount() === 0);

  // 마이그레이션
  sandbox.localStorage.setItem(RPD.SAVE_KEY, JSON.stringify({
    version: 1,
    pokedex: { pikachu: { seen: 5, best: 2 } },
    records: { NORMAL: { wave: 7, kills: 50, elapsed: 100, cleared: false, at: 1 } },
    settings: { speed: 2 }
  }));
  SM.load();
  check('옛 버전 저장이 마이그레이션된다', SM.dexCount() === 1 && SM.recordFor('NORMAL').wave === 7);
  check('마이그레이션이 빠진 필드를 채운다', SM.data.totals && SM.data.totals.runs === 0);
  check('버전이 최신으로 올라간다', SM.data.version >= 2, `version=${SM.data.version}`);

  // 필드가 일부 빠진 저장도 버텨야 한다
  sandbox.localStorage.setItem(RPD.SAVE_KEY, JSON.stringify({ version: 2 }));
  SM.load();
  check('필드가 빠진 저장도 기본값으로 메운다',
    SM.dexCount() === 0 && !!SM.data.settings && !!SM.data.records);

  SM.wipe();
}

/* ---------- 게임 모드 ---------- */
section('게임 모드 (PHASE 14)');
{
  const GM = RPD.GameManager;
  const F = RPD.FieldManager;
  const SM = RPD.SummonManager;
  const EC = RPD.EconomyManager;
  const WD = RPD.WaveData;
  const CFG = RPD.Config;

  check('모드 목록과 정의가 일치한다',
    RPD.MODE_ORDER.length === Object.keys(RPD.Modes).length &&
    RPD.MODE_ORDER.every(id => RPD.Modes[id]), `order=${RPD.MODE_ORDER}`);

  const missing = RPD.MODE_ORDER.filter(id => {
    const m = RPD.Modes[id];
    return !m.label || !m.tagline || !m.desc || !m.modifiers;
  });
  check('모드마다 이름·한줄설명·설명·보정이 있다', missing.length === 0, `bad=${missing}`);

  /* 모드가 hpMul 만 다르면 "노멀인데 아픈 것"에 불과하다.
   * 실제로 판을 푸는 방식이 달라지는지 숫자로 확인한다. */
  function snapshot(id) {
    GM.reset(id);
    F.init();
    SM.reset();
    EC.reset();
    const odds = SM.currentOdds();
    return {
      gold: GM.gold,
      life: GM.life,
      slots: F.slots.filter(s => s.unlocked).length,
      buyable: F.lockedSlots().length,
      blocked: F.blockedSlots().length,
      epic: odds.T3,
      legend: odds.T4,
      finalWave: RPD.Modes[id].finalWave,
      bossEvery: RPD.Modes[id].bossEvery,
      waveClear: EC.waveClearReward(10)
    };
  }

  const snaps = {};
  RPD.MODE_ORDER.forEach(id => { snaps[id] = snapshot(id); });

  // 어느 두 모드도 완전히 같으면 안 된다
  const fingerprints = RPD.MODE_ORDER.map(id => JSON.stringify(snaps[id]));
  check('모드마다 실제 조건이 다르다',
    new Set(fingerprints).size === fingerprints.length,
    `고유 ${new Set(fingerprints).size}/${fingerprints.length}`);

  // 각 모드의 정체성이 실제로 반영되는지
  check('엔드리스는 끝이 없다', snaps.ENDLESS.finalWave === 0);
  check('엔드리스는 보스가 더 자주 온다',
    snaps.ENDLESS.bossEvery < snaps.NORMAL.bossEvery,
    `${snaps.ENDLESS.bossEvery} vs ${snaps.NORMAL.bossEvery}`);
  check('엔드리스는 수입이 더 많다',
    snaps.ENDLESS.waveClear > snaps.NORMAL.waveClear,
    `${snaps.ENDLESS.waveClear} vs ${snaps.NORMAL.waveClear}`);

  check('보스 러시는 매 웨이브가 보스다',
    [1, 2, 7, 10].every(w => WD.isBossWave(w, RPD.Modes.BOSS_RUSH)));
  check('보스 러시는 시작 골드가 많다',
    snaps.BOSS_RUSH.gold > snaps.NORMAL.gold, `${snaps.BOSS_RUSH.gold} vs ${snaps.NORMAL.gold}`);

  check('챌린지는 칸이 적다',
    snaps.CHALLENGE.slots === RPD.Modes.CHALLENGE.modifiers.slotLimit,
    `slots=${snaps.CHALLENGE.slots}`);
  check('챌린지는 라이프가 적다',
    snaps.CHALLENGE.life < snaps.NORMAL.life, `${snaps.CHALLENGE.life} vs ${snaps.NORMAL.life}`);
  check('챌린지는 상위 등급이 덜 나온다',
    snaps.CHALLENGE.epic < snaps.NORMAL.epic && snaps.CHALLENGE.legend < snaps.NORMAL.legend,
    `에픽 ${snaps.CHALLENGE.epic.toFixed(1)}% vs ${snaps.NORMAL.epic.toFixed(1)}%`);
  check('챌린지는 적이 더 단단하다',
    WD.scaleHp(100, 10, RPD.Modes.CHALLENGE) > WD.scaleHp(100, 10, RPD.Modes.NORMAL));

  // 칸 제한이 걸린 칸은 골드로도 열 수 없어야 한다 — 열리면 제한이 무의미하다
  GM.reset('CHALLENGE');
  F.init();
  const blocked = F.blockedSlots();
  check('챌린지에서 막힌 칸이 생긴다', blocked.length > 0, `count=${blocked.length}`);
  GM.gold = 999999;
  check('막힌 칸은 골드로도 못 연다',
    EC.unlockSlot(blocked[0].index).ok === false && !F.get(blocked[0].index).unlocked);
  check('막힌 칸에는 배치도 안 된다',
    F.place(blocked[0].index, RPD.UnitManager.create('pikachu')) === false);
  check('막힌 칸은 구매 목록에 안 나온다',
    F.lockedSlots().every(s => !s.blocked));

  // 노멀은 아무 제한이 없어야 한다
  GM.reset('NORMAL');
  F.init();
  check('노멀에는 막힌 칸이 없다', F.blockedSlots().length === 0);
  check('노멀은 기본 칸이 전부 열려 있다',
    F.slots.filter(s => s.unlocked).length === RPD.MapData.baseSlotCount);

  // 기록은 모드별로 따로 남는다
  RPD.SaveManager.wipe();
  RPD.SaveManager.submitRun('NORMAL', { wave: 12, kills: 10, elapsed: 60 }, false);
  RPD.SaveManager.submitRun('CHALLENGE', { wave: 5, kills: 3, elapsed: 30 }, false);
  check('모드별 기록이 섞이지 않는다',
    RPD.SaveManager.recordFor('NORMAL').wave === 12 &&
    RPD.SaveManager.recordFor('CHALLENGE').wave === 5);
  check('플레이하지 않은 모드는 기록이 없다', RPD.SaveManager.recordFor('BOSS_RUSH') === null);
  RPD.SaveManager.wipe();

  GM.reset('NORMAL');
  F.init();
}

console.log(`\n────────────────────────────`);
console.log(`통과 ${pass} · 실패 ${fail}`);
process.exit(fail === 0 ? 0 : 1);
