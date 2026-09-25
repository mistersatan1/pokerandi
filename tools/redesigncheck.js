/* redesigncheck.js — v2 리디자인 필수 검증.
 * 실행: node tools/redesigncheck.js
 *
 * 리디자인 기획서 §37 이 "반드시 테스트"로 지정한 항목을 그대로 옮겼다.
 * 기존 selftest.js 는 자유 합성·계열 구조를 전제로 쓰여 있어 상당수가 폐기 대상이다.
 * 그 정리가 끝날 때까지 v2 의 안전망은 이 파일이 담당한다.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');

const FILES = [
  'js/core/RPD.js','js/core/Utils.js','js/core/EventBus.js','js/core/Assets.js',
  'js/core/PathFollower.js','js/core/Loop.js',
  'js/data/types.js','js/data/map.js','js/data/tiers.js','js/data/pokemon.js',
  'js/data/recipes.js','js/data/spells.js','js/data/roletuning.js','js/data/craftpower.js','js/data/auras.js','js/data/skills.js','js/data/dexbonus.js','js/data/enemies.js','js/data/waves.js',
  'js/systems/GameManager.js','js/systems/FieldManager.js','js/systems/EconomyManager.js',
  'js/systems/StatsManager.js','js/systems/SynergyManager.js','js/systems/UnitManager.js',
  'js/systems/RecipeManager.js','js/systems/StorageManager.js',
  'js/systems/ShardManager.js','js/systems/SummonManager.js',
  'js/systems/EnemyManager.js','js/systems/CombatManager.js','js/systems/BossManager.js',
  'js/systems/WaveManager.js','js/systems/SaveManager.js','js/systems/GoldShopManager.js','js/systems/EliteManager.js'
];

const storage = {};
const sandbox = {
  console,
  addEventListener: () => {},
  requestAnimationFrame: () => 0,
  cancelAnimationFrame: () => {},
  performance: { now: () => Date.now() },
  localStorage: {
    getItem: (k) => (k in storage ? storage[k] : null),
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: (k) => { delete storage[k]; }
  }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of FILES) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
}

const RPD = sandbox.RPD;
const { GameManager: GM, FieldManager: F, SummonManager: SM, RecipeManager: RM,
        ShardManager: SH, UnitManager: UM, PokemonData: PD, RecipeData: RD,
        SaveManager: SV, SynergyManager: SY } = RPD;

RPD.EconomyManager.init(); RPD.StatsManager.init(); UM.init();
SM.init(); RPD.CombatManager.init(); RM.init(); SH.init(); RPD.StorageManager.reset(); RPD.BossManager.init();

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  → ' + detail : '')); }
};
const section = (t) => console.log('\n' + t);

function fresh(round) {
  GM.reset('NORMAL'); F.init(); SM.reset(); RM.reset(); SH.reset();
  RPD.StorageManager.reset();
  GM.setState(RPD.GameState.RUNNING); GM.setWave(round || 1); GM.gold = 9999999;
}

/* ---------- 데이터 무결성 (조합식 개편 v2) ---------- */
section('데이터 무결성');
{
  const SD = RPD.SpellData;
  const base = PD.list.filter(d => !d.form);          // 초월 폼(v2 범위 밖)은 따로 센다
  check('1세대 151종 + 왕구리 = 152종이다', base.length === 152, `count=${base.length}`);

  /* v2 표의 등급 구성. 숫자를 바꿀 일이 생기면 설계서(조합식_개편안_v2.md)와 같이 고친다 */
  const want = { T1: 15, T2: 48, T3: 33, T4: 27, T5: 24, T6: 5 };
  const got = {}; base.forEach(d => { got[d.tier] = (got[d.tier] || 0) + 1; });
  check('등급 구성이 v2 표와 같다(15/48/33/27/24/5)',
    Object.keys(want).every(t => got[t] === want[t]), JSON.stringify(got));

  /* 소환으로 나오는 종 — 흔함 전부 · 안흔함 21 · 특별함 7, 희귀함 이상은 없다 */
  const sum = {}; base.filter(d => d.summon).forEach(d => { sum[d.tier] = (sum[d.tier] || 0) + 1; });
  check('소환 풀이 흔함 15 · 안흔함 21 · 특별함 7 이다',
    sum.T1 === 15 && sum.T2 === 21 && sum.T3 === 7 && !sum.T4 && !sum.T5 && !sum.T6, JSON.stringify(sum));
  check('히든이면서 소환되는 종은 없다', !base.some(d => d.hidden && d.summon));

  const all = RD.list.concat(SD.list.map(sp => ({ id: sp.result, materials: sp.materials, key: 'spell:' + sp.id, spell: sp })));
  check('레시피 결과가 전부 실재한다', RD.list.every(r => PD.get(r.id)), RD.list.filter(r => !PD.get(r.id)).map(r => r.id));
  const badMat = all.filter(r => r.materials.some(m => !PD.get(m)));
  check('조합식·주문 재료가 전부 실재한다', badMat.length === 0, `bad=${badMat.map(r => r.key)}`);
  check('"아무거나" 재료가 없다(전부 특정 포켓몬)',
    !all.some(r => r.materials.some(m => String(m).indexOf('any:') === 0)));

  const rank = t => RPD.ALL_TIERS.indexOf(t);
  const badTier = all.filter(r => r.materials.some(m => rank(PD.get(m).tier) >= rank(PD.get(r.id).tier)));
  check('결과가 재료보다 상위 등급이다(조합식·주문 모두)', badTier.length === 0, `bad=${badTier.map(r => r.key)}`);

  // 같은 재료 묶음(순서 무관)으로 결과가 둘 이상 나오면 안 된다 — 경로·주문까지 합쳐서
  const byKey = {};
  all.forEach(r => { const k = r.materials.slice().sort().join('+'); (byKey[k] = byKey[k] || []).push(r.key); });
  const clash = Object.entries(byKey).filter(([, ids]) => ids.length > 1);
  check('같은 재료로 서로 다른 결과가 나오지 않는다', clash.length === 0,
    clash.map(([k, ids]) => `${k}→${ids}`).join(' / '));

  const badCount = RD.list.filter(r => r.materials.length < 2 || r.materials.length > 4);
  check('조합식 재료는 2~4마리다', badCount.length === 0, `bad=${badCount.map(r => r.key)}`);

  /* 얻는 법은 하나다: 흔함(소환) · 조합식 · 주문 중 정확히 하나 */
  const bySpell = {}; SD.list.forEach(sp => { bySpell[sp.result] = sp; });
  const how = base.map(d => ({ d, rec: !!RD.get(d.id), sp: !!bySpell[d.id] }));
  check('흔함은 조합식·주문이 없다', how.filter(x => x.d.tier === 'T1').every(x => !x.rec && !x.sp));
  const noWay = how.filter(x => x.d.tier !== 'T1' && x.rec === x.sp);
  check('흔함이 아닌 종은 조합식 또는 주문 중 정확히 하나로 만든다', noWay.length === 0,
    `bad=${noWay.map(x => x.d.id + (x.rec ? '(둘다)' : '(없음)'))}`);
  check('히든 종 = 히든 주문의 결과', base.filter(d => d.hidden).every(d => bySpell[d.id] && bySpell[d.id].kind === 'hidden') &&
    SD.list.filter(sp => sp.kind === 'hidden').every(sp => PD.get(sp.result).hidden));
  check('조합식 결과는 히든이 아니다', RD.list.every(r => !PD.get(r.id).hidden));

  /* OR-조합식 — 한 결과에 경로 최대 둘, 두 경로의 흔함 환산이 같다 */
  const costMemo = {};
  const cost = id => {
    if (costMemo[id] != null) return costMemo[id];
    const d = PD.get(id);
    if (d.tier === 'T1') return (costMemo[id] = 1);
    const routes = RD.routesOf(id).map(r => r.materials);
    if (bySpell[id]) routes.push(bySpell[id].materials);
    costMemo[id] = Infinity;                               // 순환이면 무한대로 남는다
    return (costMemo[id] = Math.min(...routes.map(ms => ms.reduce((a, m) => a + cost(m), 0))));
  };
  const multi = Object.keys(RD.byResult).filter(id => RD.routesOf(id).length > 1);
  check('경로가 셋 이상인 결과가 없다', multi.every(id => RD.routesOf(id).length <= 2));
  const unequal = multi.filter(id => {
    const cs = RD.routesOf(id).map(r => r.materials.reduce((a, m) => a + cost(m), 0));
    return cs.some(c => c !== cs[0]);
  });
  check('OR-조합식의 두 경로는 흔함 환산이 같다', unequal.length === 0, `bad=${unequal}`);
  check('OR-조합식이 실제로 있다(근육몬·성원숭)', RD.routesOf('machoke').length === 2 && RD.routesOf('primeape').length === 2);

  const unreachable = base.filter(d => !isFinite(cost(d.id)));
  check('모든 종이 흔함에서 출발해 만들어진다(순환 없음)', unreachable.length === 0, `bad=${unreachable.map(d => d.id)}`);

  /* 누적 비용이 등급마다 오른다(v2 설계: 안흔함 2.5 · 특별함 4.5 · 희귀함 ~9 · 전설 ~21) */
  const avg = t => { const ids = base.filter(d => d.tier === t); return ids.reduce((a, d) => a + cost(d.id), 0) / ids.length; };
  const costs = ['T2', 'T3', 'T4', 'T5', 'T6'].map(avg);
  check('누적 재료 비용이 등급마다 오른다', costs.every((c, i) => i === 0 || c > costs[i - 1]),
    `흔함 환산 ${costs.map(c => c.toFixed(1))}`);

  /* 주문 */
  const phr = {}; SD.list.forEach(sp => { const n = SD.normalize(sp.phrase); (phr[n] = phr[n] || []).push(sp.id); });
  const dupPh = Object.values(phr).filter(v => v.length > 1);
  check('주문 문구가 서로 겹치지 않는다', dupPh.length === 0, JSON.stringify(dupPh));
  const imm = SD.list.filter(sp => sp.kind === 'immortal');
  check('불멸은 5종(파이어·썬더·프리져·뮤츠·뮤)이고 원본 종이다',
    imm.length === 5 && ['moltres', 'zapdos', 'articuno', 'mewtwo', 'mew'].every(id => PD.get(id).tier === 'T6' && bySpell[id]));
  check('불멸 주문 재료는 전설 3마리다',
    imm.every(sp => sp.materials.length === 3 && sp.materials.every(m => PD.get(m).tier === 'T5')));
  check('옛 불멸 폼(_immortal)이 없다', !PD.list.some(d => /_immortal$/.test(d.id)));
  check('주문 종류가 hidden/immortal/transcend 뿐이다',
    SD.list.every(sp => ['hidden', 'immortal', 'transcend'].indexOf(sp.kind) >= 0));

  /* 조합식은 1라운드부터 전부 열려 있다 — 1~10라운드에 할 일이 소환밖에 없던 문제 */
  check('조합식이 1라운드부터 전부 열려 있다',
    RD.list.every(r => r.unlockRound <= 1), `잠긴 것=${RD.list.filter(r => r.unlockRound > 1).length}`);

  /* 흔함 재료만으로 시작할 수 있는 레시피가 있어야 첫 목표가 생긴다 */
  const starters = RD.list.filter(r => r.materials.every(m => RD.tierOf(m) === 'T1'));
  check('흔함만으로 만들 수 있는 조합식이 있다', starters.length >= 4, `count=${starters.length}`);

  const noSkill = PD.all().filter(id => { const d = PD.byId[id]; return RPD.Tiers[d.tier].skillLevel >= 3 && !d.skill; });
  check('희귀함 이상은 전부 고유 스킬을 가진다', noSkill.length === 0, `bad=${noSkill}`);
  const earlySkill = PD.all().filter(id => { const d = PD.byId[id]; return RPD.Tiers[d.tier].skillLevel < 3 && d.skill; });
  check('특별함 이하는 고유 스킬이 없다', earlySkill.length === 0, `bad=${earlySkill}`);
  const legendNoPassive = PD.ofTier('T5').filter(id => !PD.byId[id].passive || !RPD.SkillData.passive(PD.byId[id].passive));
  check('전설은 전설 패시브를 가진다', legendNoPassive.length === 0, `bad=${legendNoPassive}`);
  const badSkillRef = PD.list.filter(d => d.skill && !RPD.SkillData.get(d.skill));
  check('스킬 이름이 전부 실재한다', badSkillRef.length === 0, `bad=${badSkillRef.map(d => d.id)}`);
}

/* ---------- 필드 배치 ---------- */
section('필드 배치');
{
  /* 칸끼리 겹치면 클릭 판정이 앞 칸에 먹혀 드래그가 엉뚱한 곳으로 간다.
   * 실제로 세로 28px 씩 겹쳐 있었고, 경로 이격만 검사하느라 못 잡았다. */
  const S = RPD.MapData.slotSize;
  const overlaps = [];
  for (let i = 0; i < RPD.MapData.slots.length; i++) {
    for (let j = i + 1; j < RPD.MapData.slots.length; j++) {
      const a = RPD.MapData.slots[i], b = RPD.MapData.slots[j];
      if (Math.abs(a.x - b.x) < S && Math.abs(a.y - b.y) < S) overlaps.push(i + '↔' + j);
    }
  }
  check('칸끼리 겹치지 않는다', overlaps.length === 0, `bad=${overlaps.slice(0, 5)}`);

  const onPath = RPD.MapData.slots.filter(sl =>
    RPD.MapData.path.closestDistanceTo(sl.x, sl.y) < RPD.MapData.pathWidth / 2 + S / 2);
  check('칸이 경로 위에 올라앉지 않는다', onPath.length === 0, `bad=${onPath.length}`);

  // 클릭 판정이 실제로 정확한지
  F.init();
  const misHit = F.slots.filter(sl => F.hitTest(sl.x, sl.y) !== sl.index);
  check('모든 칸이 자기 중심을 클릭하면 잡힌다', misHit.length === 0,
    `bad=${misHit.map(sl => sl.index)}`);
}

/* ---------- 라운드별 등급 해금 ---------- */
section('라운드별 등급 해금');
{
  const T = RPD.SummonTable;

  // 기획서가 "반드시 검증"으로 지정한 항목
  /* 해금 전 라운드에 상위 등급이 새면 안 된다.
   * 해금 라운드는 조정될 수 있으므로 표에서 직접 읽는다 (숫자를 두 곳에 적지 않는다). */
  let leaked = [];
  RPD.TIER_ORDER.forEach(t => {
    for (let r = 1; r < RPD.Tiers[t].unlockRound; r++) {
      if (T.oddsFor(r)[t] > 0) leaked.push(`R${r}:${t}`);
    }
  });
  check('해금 전에는 그 등급이 절대 안 나온다', leaked.length === 0, `leak=${leaked.slice(0, 5)}`);

  const firstUnlock = RPD.Tiers[RPD.TIER_ORDER[1]].unlockRound;
  check('초반 몇 라운드는 흔함만 나온다', firstUnlock >= 6, `T2 해금 R${firstUnlock}`);

  /* 소환으로 나오는 등급은 흔함~특별함뿐이다.
   * 희귀함·전설은 조합식과 조각 상점으로만 얻는다 — 해금 라운드는 조각 상점이 열리는 시점이다. */
  RPD.TIER_ORDER.forEach((t, i) => {
    const round = RPD.Tiers[t].unlockRound;
    if (round <= 1) return;
    if (RPD.Tiers[t].summonable === false) {
      check(`${RPD.Tiers[t].label}는 소환으로 나오지 않는다`,
        T.oddsFor(round)[t] === 0 && T.oddsFor(50)[t] === 0,
        `R50=${T.oddsFor(50)[t]}%`);
      return;
    }
    check(`${RPD.Tiers[t].label}는 ${round}라운드부터 등장한다`,
      T.oddsFor(round - 1)[t] === 0 && T.oddsFor(round)[t] > 0,
      `${round - 1}R=${T.oddsFor(round - 1)[t]}% / ${round}R=${T.oddsFor(round)[t].toFixed(1)}%`);
  });

  check('해금 직후 보정이 걸린다',
    T.oddsFor(11).T2 > T.oddsFor(20).T2,
    `11R=${T.oddsFor(11).T2.toFixed(1)}% vs 20R=${T.oddsFor(20).T2.toFixed(1)}%`);

  check('확률 합이 항상 100%다',
    [1, 10, 11, 25, 35, 50].every(r => {
      const o = T.oddsFor(r);
      const sum = RPD.TIER_ORDER.reduce((a, t) => a + o[t], 0);
      return Math.abs(sum - 100) < 0.01;
    }));

  // 실제 소환으로도 새지 않아야 한다
  fresh(RPD.Tiers[RPD.TIER_ORDER[1]].unlockRound - 1);
  let bad = 0;
  for (let i = 0; i < 200; i++) {
    F.init();
    const r = SM.summon();
    if (r.ok && r.tier !== 'T1') bad++;
  }
  check('해금 직전 라운드 소환 200회에도 흔함만 나온다', bad === 0, `누출 ${bad}회`);

  const beforeUnlock = RPD.Tiers[RPD.TIER_ORDER[1]].unlockRound - 1;
  check('해금 직전 라운드에 예고가 나온다',
    !!T.previewNext(beforeUnlock) && T.previewNext(beforeUnlock).kind === 'unlock',
    `R${beforeUnlock}`);
}

/* ---------- 조합식 ---------- */
section('조합식 (RecipeManager)');
{
  fresh(21);
  let testRecipe = RPD.RecipeData.list[0];
  F.place(0, UM.create(testRecipe.materials[0]));
  F.place(1, UM.create(testRecipe.materials[1]));
  UM.recomputeAll(); RM.refresh();

  check('완성 가능한 레시피가 목록 맨 위에 온다',
    RM.view[0].ready && RM.view[0].resultId === testRecipe.id, `top=${RM.view[0].resultId}`);

  const before = PD.dps(PD.get(testRecipe.materials[0])) + PD.dps(PD.get(testRecipe.materials[1]));
  const r = RM.craft(testRecipe.id);
  check('조합이 성공한다', r.ok === true, `reason=${r.reason}`);
  check('재료가 소모되고 결과물만 남는다',
    F.getUnits().length === 1 && F.getUnits()[0].defId === testRecipe.id);
  check('결과물이 재료 합보다 강하다', F.getUnits()[0].dps > before,
    `${Math.round(before)} → ${Math.round(F.getUnits()[0].dps)}`);
  check('첫 조합은 발견으로 표시된다', r.firstTime === true);
  check('두 번째부터는 발견이 아니다', RM.discovered[testRecipe.id] === true);

  fresh(21);
  F.place(0, UM.create('charmander'));
  UM.recomputeAll(); RM.refresh();
  check('재료가 부족하면 거부된다', RM.craft(testRecipe.id).reason === 'NO_MATERIAL');

  // 1라운드에도 재료만 있으면 만들 수 있다
  fresh(1);
  testRecipe = RPD.RecipeData.list[0];
  F.place(0, UM.create(testRecipe.materials[0]));
  F.place(1, UM.create(testRecipe.materials[1]));
  UM.recomputeAll(); RM.refresh();
  check('1라운드에도 조합이 된다', RM.craft(testRecipe.id).ok === true);

  /* 창고에 있는 재료로도 조합이 되어야 한다.
   * 안 되면 "일단 모아 두고 나중에 조합한다"가 성립하지 않는다. */
  fresh(1);
  RPD.StorageManager.add(UM.create(testRecipe.materials[0]));
  RPD.StorageManager.add(UM.create(testRecipe.materials[1]));
  RM.refresh();
  check('창고 재료만으로도 조합된다', RM.craft(testRecipe.id).ok === true);
  check('창고 재료가 소모된다', RPD.StorageManager.units.length === 0,
    `남은 ${RPD.StorageManager.units.length}`);

  fresh(1);
  F.place(0, UM.create(testRecipe.materials[0]));
  RPD.StorageManager.add(UM.create(testRecipe.materials[1]));
  RM.refresh();
  check('필드와 창고를 섞어서도 조합된다', RM.craft(testRecipe.id).ok === true);

  fresh(1);
  check('1라운드에 모든 레시피가 보인다', RD.availableAt(1).length === RD.list.length,
    `${RD.availableAt(1).length}/${RD.list.length}`);
}

/* ---------- OR-조합식 · 히든 (조합식 개편 v2) ---------- */
section('OR-조합식 · 히든');
{
  // 근육몬 — 대체 경로(모다피 + 이상해씨)만 있어도 만들어진다
  fresh(1);
  F.place(0, UM.create('bellsprout')); F.place(1, UM.create('bulbasaur'));
  UM.recomputeAll(); RM.refresh();
  check('대체 경로 재료만 있어도 완성 가능으로 뜬다', RM.canCraft('machoke'));
  check('두 경로가 목록에 따로 보인다', RM.view.filter(v => v.resultId === 'machoke').length === 2);
  const r1 = RM.craft('machoke');
  check('결과 id 로 부르면 되는 경로를 찾아 조합한다', r1.ok && r1.route === 1, `route=${r1.route} reason=${r1.reason}`);
  check('대체 경로 재료가 소모된다', F.getUnits().length === 1 && F.getUnits()[0].defId === 'machoke');

  // 두 경로가 다 될 때, 경로 이름으로 고른 쪽을 쓴다
  fresh(1);
  ['machop', 'machop', 'bellsprout', 'bulbasaur'].forEach((id, i) => F.place(i, UM.create(id)));
  UM.recomputeAll(); RM.refresh();
  const r2 = RM.craft('machoke#2');
  const left = F.getUnits().map(u => u.defId).sort().join(',');
  check('경로 이름(machoke#2)으로 고르면 그 재료를 쓴다', r2.ok && left === 'machoke,machop,machop', left);
  const r3 = RM.craft('machoke');
  check('결과 id 로 부르면 첫 경로부터 쓴다', r3.ok && r3.route === 0);

  // 성원숭 — 근육몬 없이 망키 + 니드리노
  fresh(1);
  F.place(0, UM.create('mankey')); F.place(1, UM.create('nidorino'));
  UM.recomputeAll(); RM.refresh();
  check('성원숭은 근육몬 없이도 만들어진다', RM.craft('primeape').ok);

  // 히든은 소환·상점·보상에서 나오지 않는다
  fresh(40);
  let leak = 0, offPool = 0;
  for (let i = 0; i < 400; i++) {
    F.init(); RPD.StorageManager.reset();
    const r = SM.summon();
    if (!r.ok) continue;
    if (r.unit.def.hidden) leak++;
    if (!r.unit.def.summon) offPool++;
  }
  check('소환 400회에 히든이 한 번도 안 나온다', leak === 0, `${leak}회`);
  check('소환은 summon 표시 종만 뽑는다', offPool === 0, `${offPool}회`);
  const hiddenIds = PD.list.filter(d => d.hidden).map(d => d.id);
  check('보스 보상 후보에 히든이 없다', ['T2', 'T3', 'T4', 'T5'].every(t => PD.rewardPool(t).every(id => !PD.get(id).hidden)));
  SH.shards = 99999;
  check('히든은 조각으로 못 산다', hiddenIds.every(id => SH.checkBuy(id).reason === 'LOCKED' && !SH.buy(id).ok));
  check('희귀함 조합 전용 종은 조각으로 산다(구제책 유지)', SH.checkBuy('magneton').ok, SH.checkBuy('magneton').reason);
}

/* ---------- 조합 보정 ---------- */
section('조합 보정');
{
  // 재료 이름을 적어 두지 않는다 — 로스터가 바뀌면 검사가 조용히 무의미해진다
  const biasRecipe = RPD.RecipeData.list.find(r =>
    r.materials.length === 2 &&
    r.materials.every(m => RPD.PokemonData.get(m).tier === 'T1'));

  function avgSummons(mul) {
    const orig = RPD.SummonTable.recipeBoostMul;
    RPD.SummonTable.recipeBoostMul = mul;
    let total = 0;
    const N = 200;
    for (let t = 0; t < N; t++) {
      fresh(11);
      F.place(0, UM.create(biasRecipe.materials[0]));
      UM.recomputeAll(); RM.refresh();
      let n = 0;
      while (n < 300) { n++; if (SM.pickSpecies(SM.rollTier()) === biasRecipe.materials[1]) break; }
      total += n;
    }
    RPD.SummonTable.recipeBoostMul = orig;
    return total / N;
  }
  const off = avgSummons(1.0), on = avgSummons(RPD.SummonTable.recipeBoostMul);
  check('조합 보정이 필요한 재료를 더 잘 나오게 한다', on < off * 0.92,
    `보정없음 ${off.toFixed(1)}회 → 보정 ${on.toFixed(1)}회`);
  check('보정이 너무 강하지 않다 (운을 없애지 않는다)', on > off * 0.45,
    `단축률 ${((1 - on / off) * 100).toFixed(0)}%`);
}

/* ---------- 자동 배치 ---------- */
section('자동 배치');
{
  fresh(1);
  const shortR = UM.create('mankey');
  SM.autoPlace(shortR);
  const slot = F.get(shortR.slotIndex);
  const chosen = RPD.MapData.coverageAt(slot.x, slot.y, shortR.range);
  const all = F.slots.filter(s => s.unlocked)
    .map(s => RPD.MapData.coverageAt(s.x, s.y, shortR.range));
  check('자동 배치가 가장 좋은 빈 칸을 고른다', chosen === Math.max(...all),
    `선택 ${chosen} / 최대 ${Math.max(...all)}`);
  check('최악의 칸을 피한다', chosen > Math.min(...all), `최악 ${Math.min(...all)}`);

  fresh(1);
  GM.gold = 9999999;
  for (let i = 0; i < 5; i++) SM.summon();
  check('연속 소환이 서로 다른 칸에 앉는다',
    new Set(F.getUnits().map(u => u.slotIndex)).size === F.getUnits().length);
  check('플레이어가 수동으로 옮길 수 있다', (() => {
    const u = F.getUnits()[0];
    const from = u.slotIndex;
    const empty = F.firstEmpty();
    F.swap(from, empty.index);
    return u.slotIndex === empty.index;
  })());
}

/* ---------- 조각 ---------- */
section('조각 (ShardManager)');
{
  fresh(21);
  F.place(0, UM.create('charmander'));
  RPD.EconomyManager.sell(0);
  check('방출하면 조각이 들어온다', SH.shards > 0, `shards=${SH.shards}`);

  // 재료 이름을 적지 않는다 — 조합식을 바꿔도 검사가 따라온다
  const shRecipe = RD.list.find(r => r.materials.length === 2 && PD.get(r.materials[0]).tier === 'T1');
  const [shHave, shNeed] = shRecipe.materials;
  SH.reset(); SH.add(200);
  F.init();
  F.place(0, UM.create(shHave));
  UM.recomputeAll(); RM.refresh();
  const sug = SH.suggestions();
  check('조합에 필요한 재료를 추천한다', sug.length > 0 && sug.some(s => s.id === shNeed),
    `sug=${sug.map(s => s.id)}`);

  const buy = SH.buy(shNeed);
  check('조각으로 재료를 살 수 있다', buy.ok === true, `reason=${buy.reason}`);
  check('조각이 차감된다', SH.shards === 200 - SH.priceFor('T1'));
  RM.refresh();
  check('구매 후 조합이 가능해진다', RM.readyList().some(v => v.resultId === shRecipe.id));

  SH.reset();
  check('조각이 부족하면 거부된다', SH.buy(shNeed).reason === 'NO_SHARD');

  SH.add(9999);
  GM.setWave(5);
  check('해금 전 등급은 조각으로도 못 산다', SH.buy('charizard').reason === 'LOCKED');
  check('상위 등급일수록 조각이 비싸다',
    SH.priceFor('T5') > SH.priceFor('T3') && SH.priceFor('T3') > SH.priceFor('T1'));
}

/* ---------- 시너지 ---------- */
section('시너지');
{
  fresh(21);
  check('빈 필드에는 시너지가 없다', SY.recompute() !== undefined && SY.active.length === 0);

  const fireIds = PD.all().filter(id => (PD.byId[id].types || []).indexOf('FIRE') >= 0);
  F.init();
  for (let i = 0; i < 4 && i < fireIds.length; i++) F.place(i, UM.create(fireIds[i]));
  UM.recomputeAll();
  check('같은 타입을 모으면 시너지가 켜진다', SY.countOf('FIRE') >= 2 && SY.bonus.burnMul > 1,
    `count=${SY.countOf('FIRE')}`);

  /* 도달 가능 = "그 타입 개체를 필드에 최고 단계 수만큼 올릴 수 있는가".
   * 같은 종을 여러 마리 올릴 수 있으므로 종 수가 아니라 ① 그 타입 개체가 존재하는가
   * ② 최고 단계가 필드 칸 수 안에 들어오는가로 본다. 종이 하나도 없는 타입은
   * 영원히 0으로 남으므로 시너지 목록에 두지 않는다. */
  const slotCount = RPD.MapData.slots.length;
  const unreachable = Object.keys(RPD.Synergies).filter(t => {
    const top = RPD.Synergies[t][RPD.Synergies[t].length - 1].count;
    const n = PD.all().filter(id => (PD.byId[id].types || []).indexOf(t) >= 0).length;
    return n === 0 || top > slotCount;
  });
  check('모든 시너지가 도달 가능하다', unreachable.length === 0, `bad=${unreachable}`);

  // 조합식과 시너지가 같은 방향을 봐야 한다 (기획 §18)
  const fireRecipes = RD.list.filter(r => (PD.get(r.id).types || []).indexOf('FIRE') >= 0);
  const feedsFire = fireRecipes.filter(r =>
    r.materials.some(m => (PD.get(m).types || []).indexOf('FIRE') >= 0));
  check('조합 완성이 시너지 상승으로 이어진다', feedsFire.length === fireRecipes.length,
    `${feedsFire.length}/${fireRecipes.length}`);
}

/* ---------- 도감 ---------- */
section('도감');
{
  SV.wipe();
  check('처음엔 비어 있다', SV.dexCount() === 0);

  fresh(1); GM.gold = 9999999;
  SV.init();
  for (let i = 0; i < 12; i++) { F.init(); SM.summon(); }
  check('소환하면 도감에 등록된다', SV.dexCount() > 0, `count=${SV.dexCount()}`);
  check('도감 전체 수가 로스터와 맞는다', SV.dexTotal() === PD.all().length);

  SV.save();
  const had = SV.dexCount();
  SV.data = { version: 0, pokedex: {}, records: {}, totals: {}, settings: {} };
  SV.load();
  check('저장 후 다시 읽힌다', SV.dexCount() === had, `${had} → ${SV.dexCount()}`);
  SV.wipe();
}

/* ---------- 라운드 진행 / 보스 / 게임오버 ---------- */
section('진행 · 보스 · 게임오버');
{
  const WM = RPD.WaveManager, EM = RPD.EnemyManager, CM = RPD.CombatManager;
  const step = RPD.Config.fixedStep;

  GM.reset('NORMAL'); F.init(); EM.reset(); WM.reset(); CM.reset(); RPD.BossManager.reset();
  WM.begin();
  check('게임을 시작하면 라운드가 돈다', WM.phase !== WM.PHASE.IDLE);

  let guard = 0;
  while (EM.aliveCount() === 0 && guard < 60 / step) {
    guard++; GM.update(step); WM.update(step); EM.update(step);
  }
  check('적이 등장한다', EM.aliveCount() > 0, `alive=${EM.aliveCount()}`);

  let overFired = 0;
  RPD.bus.on('game:over', () => { overFired++; });
  for (let i = 0; i < Math.ceil(900 / step); i++) {
    GM.update(step);
    if (GM.state === RPD.GameState.RUNNING || GM.state === RPD.GameState.PREPARE) {
      WM.update(step); EM.update(step); CM.update(step); RPD.BossManager.update(step);
    }
    if (GM.state === RPD.GameState.GAMEOVER) break;
  }
  check('방어가 없으면 게임 오버가 된다', GM.state === RPD.GameState.GAMEOVER, `state=${GM.state}`);
  check('게임 오버가 한 번만 발생한다', overFired === 1, `fired=${overFired}`);

  GM.reset('NORMAL'); F.init(); EM.reset(); WM.reset();
  check('재시작하면 상태가 돌아온다',
    GM.state === RPD.GameState.READY && F.getUnits().length === 0 && EM.aliveCount() === 0);
}


/* ---------- 골드 상점 (세션 33 ③) ---------- */
section('골드 상점');
{
  const G = RPD.GoldShopManager;
  G.init();
  fresh(1); G.reset();
  const u = UM.create('charmander');            // 불꽃 · 흔함
  F.place(0, u); UM.recomputeAll();
  const base = u.attack, baseSpd = u.attackSpeed;

  GM.gold = 0;
  check('골드가 없으면 못 산다', G.buy('type', 'FIRE').reason === 'NO_GOLD');
  GM.gold = 999999;
  const price0 = G.cost('type', 'FIRE');
  const r = G.buy('type', 'FIRE');
  check('사면 레벨이 오르고 골드가 빠진다', r.ok && G.typeLevel('FIRE') === 1 && GM.gold === 999999 - price0);
  check('레벨이 오를수록 비싸진다', G.cost('type', 'FIRE') > price0);
  check('타입 업그레이드가 필드 개체 공격력에 곧바로 붙는다',
    Math.abs(u.attack / base - (1 + G.CFG.typeStep)) < 1e-6, `${(u.attack / base).toFixed(3)}`);

  check('타입 업그레이드는 공격속도도 같이 올린다',
    Math.abs(u.attackSpeed / baseSpd - (1 + G.CFG.typeSpeedStep)) < 1e-6 && G.CFG.typeSpeedStep > 0, `${(u.attackSpeed / baseSpd).toFixed(3)}`);

  G.buy('tier', 'T1');
  check('등급 업그레이드도 공격속도를 같이 올리고 타입과 곱으로 쌓인다',
    Math.abs(u.attackSpeed / baseSpd - (1 + G.CFG.typeSpeedStep) * (1 + G.CFG.tierSpeedStep)) < 1e-6 && G.CFG.tierSpeedStep > 0,
    `${(u.attackSpeed / baseSpd).toFixed(3)}`);
  const full = (a, b) => (1 + 10 * a) * (1 + 10 * b);
  check('끝까지 올린 공격력 × 공격속도는 예전 "공격력만"(타입 1.5 · 등급 1.6)과 거의 같다',
    Math.abs(full(G.CFG.typeStep, G.CFG.typeSpeedStep) / 1.5 - 1) < 0.03 && Math.abs(full(G.CFG.tierStep, G.CFG.tierSpeedStep) / 1.6 - 1) < 0.03,
    `타입 ${full(G.CFG.typeStep, G.CFG.typeSpeedStep).toFixed(3)} · 등급 ${full(G.CFG.tierStep, G.CFG.tierSpeedStep).toFixed(3)}`);
  check('등급 업그레이드는 타입과 곱으로 쌓인다',
    Math.abs(u.attack / base - (1 + G.CFG.typeStep) * (1 + G.CFG.tierStep)) < 1e-6, `${(u.attack / base).toFixed(3)}`);

  // 새로 뽑은 개체에도 붙는다(개체 강화와 다른 점)
  const later = UM.create('vulpix'); F.place(1, later); UM.recomputeAll();
  check('나중에 들어온 같은 타입 개체도 혜택을 받는다', G.attackMul(later.def) > 1);

  // 이중 타입은 높은 쪽 하나만
  G.reset();
  for (let i = 0; i < 3; i++) G.buy('type', 'GRASS');
  G.buy('type', 'POISON');
  const bulba = PD.get('bulbasaur');           // 풀 · 독
  check('두 타입이면 높은 레벨 하나만 받는다(합치지 않는다)',
    Math.abs(G.typeBonus(bulba) - 3 * G.CFG.typeStep) < 1e-9, `${G.typeBonus(bulba)}`);

  // 히든은 자기 강함 등급 칸이 아니라 [히든] 칸
  G.reset();
  G.buy('tier', 'T2');
  const pika = PD.get('pikachu');              // 히든 · 안흔함
  check('히든은 강함 등급(안흔함) 업그레이드를 안 받는다', G.tierBonus(pika) === 0);
  G.buy('tier', 'HIDDEN');
  check('히든은 [히든] 칸 업그레이드를 받는다', G.tierBonus(pika) > 0);
  check('불멸·초월은 한 칸을 같이 쓴다',
    G.tierSlotOf(PD.get('mewtwo')) === 'SPECIAL' && G.tierSlotOf(PD.get('mewtwo_transcend')) === 'SPECIAL');

  // 최대 레벨
  G.reset();
  for (let i = 0; i < G.CFG.maxLevel; i++) G.buy('tier', 'T3');
  check('최대 레벨에서 멈춘다', G.buy('tier', 'T3').reason === 'MAX_LEVEL' && G.tierLevel('T3') === G.CFG.maxLevel);

  // 조합으로 갈아 넣어도 사라지지 않는다
  G.reset(); fresh(1);
  for (let i = 0; i < 2; i++) G.buy('tier', 'T2');
  F.place(0, UM.create('caterpie')); F.place(1, UM.create('caterpie'));
  UM.recomputeAll(); RM.refresh(); RM.craft('metapod');
  const meta = F.getUnits().find(x => x.defId === 'metapod');
  check('조합으로 만든 결과물도 등급 업그레이드를 그대로 받는다',
    !!meta && Math.abs(meta.attack / (meta.def.attack) - (1 + 2 * G.CFG.tierStep)) < 0.02,
    meta ? (meta.attack / meta.def.attack).toFixed(3) : '없음');

  GM.reset('NORMAL');
  check('새 판이 시작되면 상점 레벨이 초기화된다', G.tierLevel('T2') === 0 && G.typeLevel('GRASS') === 0);
  check('1세대에 없는 타입은 팔지 않는다', G.types().every(t => PD.list.some(d => (d.types || []).indexOf(t) >= 0)));
}

/* ---------- 조합 난이도 보정 (세션 33) ---------- */
section('조합 난이도 보정');
{
  const CP = RPD.CraftPower;
  check('조합 보정 모듈이 로드됐다', !!CP && Object.keys(CP.mul).length > 50);
  const bp = d => { const c = (d.critRate || 0) * ((d.critDamage || 1.5) - 1);
    let e = d.attack * (1 + c) * (d.attackSpeed || 1);
    if (d.attackType === 'SPLASH') e *= 1.6; else if (d.attackType === 'PIERCE') e *= Math.min(d.pierce || 1, 2.2);
    else if (d.attackType === 'CHAIN') e *= 1 + (d.chain || 0) * 0.45; return e; };
  const grp = (t, f) => PD.list.filter(d => d.tier === t && !d.form && f(d));
  const avgP = ds => ds.reduce((a, d) => a + bp(d) * CP.mulOf(d), 0) / ds.length;
  ['T2', 'T3', 'T4', 'T5'].forEach(t => {
    const craft = grp(t, d => !d.summon && !d.hidden), hid = grp(t, d => d.hidden);
    if (!craft.length || !hid.length) return;
    const r = avgP(hid) / avgP(craft);
    check(`${RPD.Tiers[t].label} 히든은 일반 조합 평균의 1.5배`, Math.abs(r - 1.5) < 0.02, r.toFixed(3));
  });
  check('소환으로도 나오는 종은 보너스가 없다', PD.list.filter(d => d.summon).every(d => CP.bonusOf(d) === 0));
  check('흔함은 보정 대상이 아니다(불멸·초월은 아래 "재료 합의 몇 배" 규칙)',
    PD.list.filter(d => d.tier === 'T1').every(d => CP.mulOf(d) === 1));
  check('보너스 상한(+35%)을 넘지 않는다', PD.list.every(d => CP.bonusOf(d) <= CP.CFG.CAP + 1e-9));
  // 같은 등급 · 같은 역할(조합 전용): 가장 비싼 것이 가장 싼 것보다 기본 강함 × 보정이 크다 — 대부분에서
  let right = 0, wrong = 0;
  ['T3', 'T4', 'T5'].forEach(t => {
    const byRole = {};
    grp(t, d => !d.summon && !d.hidden).forEach(d => (byRole[d.role] = byRole[d.role] || []).push(d));
    Object.values(byRole).forEach(ds => {
      if (ds.length < 2) return;
      ds.sort((a, b) => CP.cost[a.id] - CP.cost[b.id]);
      const lo = ds[0], hi = ds[ds.length - 1];
      if (CP.cost[hi.id] === CP.cost[lo.id]) return;
      if (bp(hi) * CP.mulOf(hi) > bp(lo) * CP.mulOf(lo)) right++; else wrong++;
    });
  });
  check('같은 역할이면 비싸게 만든 쪽이 더 세다(역전 20% 미만)', wrong / (right + wrong) < 0.2, `${right} / 역전 ${wrong}`);
  // 실제 전투 수치에 반영된다
  fresh(1);
  const hard = PD.list.filter(d => d.tier === 'T4' && !d.hidden && !d.summon).sort((a, b) => CP.bonusOf(b) - CP.bonusOf(a))[0];
  const u = UM.create(hard.id); F.place(0, u); UM.recomputeAll();
  check('보정이 유닛 실효 공격력에 곱해진다', Math.abs(u.attack / (hard.attack * CP.mulOf(hard)) - 1) < 1e-6, hard.name);
}

/* ---------- 70라운드 후반 곡선 · 불멸·초월 (세션 33) ---------- */
section('70라운드 후반 곡선');
{
  const W = RPD.WaveData, CP = RPD.CraftPower;
  const g = w => W.growthTo(w);
  check('50라운드까지는 예전 곡선 그대로', Math.abs(g(50) / Math.pow(W.hpGrowth, 49) - 1) < 1e-9);
  check('51~60 은 예전보다 완만하다', g(60) / g(50) < Math.pow(W.hpGrowth, 10), (g(60) / g(50)).toFixed(2));
  check('61라운드에 한 번에 오르는 벽이 있다(×2 이상)', g(61) / g(60) >= 2, (g(61) / g(60)).toFixed(2));
  check('벽 뒤는 거의 평평하다(라운드당 5% 미만)', g(70) / g(61) < Math.pow(1.05, 9), (g(70) / g(61)).toFixed(2));
  const src = ['js/data/waves.js', 'js/data/craftpower.js'].map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('');
  check('게임 코드는 환경변수(process.env)를 읽지 않는다(실험 값은 봇 쪽에서만)', src.indexOf('process.env') < 0);
  const bp = d => { const c = (d.critRate || 0) * ((d.critDamage || 1.5) - 1);
    let e = d.attack * (1 + c) * (d.attackSpeed || 1);
    if (d.attackType === 'SPLASH') e *= 1.6; else if (d.attackType === 'PIERCE') e *= Math.min(d.pierce || 1, 2.2);
    else if (d.attackType === 'CHAIN') e *= 1 + (d.chain || 0) * 0.45;
    return e * CP.mulOf(d) * RPD.RoleTuning.attack(d.role) * RPD.RoleTuning.speedOf(d); };
  RPD.SpellData.list.filter(sp => sp.kind !== 'hidden').forEach(sp => {
    const want = sp.kind === 'immortal' ? CP.CFG.IMMORTAL : CP.CFG.TRANSCEND;
    const mat = sp.materials.reduce((a, m) => a + bp(PD.get(m)), 0);
    const r = bp(PD.get(sp.result)) / mat;
    check(`${PD.get(sp.result).name} = 재료 합의 ${want}배(역할 보정 포함 · 만들면 확실히 세진다)`, Math.abs(r - want) < 0.01, r.toFixed(3));
  });
}

/* ---------- 클리어 = 마지막 보스 처치 (세션 42) ---------- */
section('마지막 보스');
{
  const EM = RPD.EnemyManager, WD = RPD.WaveData;
  const walkOut = (wave) => {
    fresh(wave); EM.reset && EM.reset();
    const e = EM.spawn(WD.bossIdFor(wave, GM.mode), wave);
    for (let i = 0; i < 20000 && e.alive !== false && EM.enemies.indexOf(e) >= 0; i++) EM.update(0.05);
    return e;
  };
  let reason = null;
  const onOver = RPD.bus.on('game:over', p => { reason = p && p.reason; });
  const last = walkOut(RPD.Modes.NORMAL.finalWave);
  check('마지막 라운드 보스를 놓치면 라이프가 남아도 진다',
    last.leaked === true && GM.state === RPD.GameState.GAMEOVER && GM.life > 0 && reason === 'finalBoss',
    `leaked=${last.leaked} state=${GM.state} life=${GM.life} reason=${reason}`);
  reason = null;
  walkOut(60);
  check('마지막이 아닌 보스를 놓치면 라이프만 깎인다', GM.state === RPD.GameState.RUNNING && reason === null, `state=${GM.state}`);
  RPD.bus.off('game:over', onOver);
}

/* ---------- 역할 보정 · 버퍼 (세션 33) ---------- */
section('역할 보정 · 버퍼');
{
  const RT = RPD.RoleTuning;
  const firstOf = role => PD.list.find(d => d.role === role && !d.form);
  fresh(1);
  const mk = id => { F.init(); const u = UM.create(id); F.place(0, u); UM.recomputeAll(); return u; };
  const aoe = firstOf('AOE_DPS'), ch = firstOf('CHAIN_DPS'), sg = firstOf('SINGLE_DPS'), bk = firstOf('BOSS_KILLER');
  const rawAtk = d => d.attack * RPD.CraftPower.mulOf(d);
  check('광역은 피해가 조금 줄었다', Math.abs(mk(aoe.id).attack / rawAtk(aoe) - RT.attack('AOE_DPS')) < 1e-6 && RT.attack('AOE_DPS') < 1);
  check('연쇄는 피해가 조금 줄었다', Math.abs(mk(ch.id).attack / rawAtk(ch) - RT.attack('CHAIN_DPS')) < 1e-6 && RT.attack('CHAIN_DPS') < 1);
  const us = mk(sg.id);
  check('단일은 피해·공격속도가 둘 다 올랐다', us.attack > rawAtk(sg) && RT.attackSpeed('SINGLE_DPS') > 1);
  const ub = mk(bk.id);
  check('보스킬러는 피해·공격속도가 둘 다 올랐다', ub.attack > rawAtk(bk) && RT.attackSpeed('BOSS_KILLER') > 1);

  // 공격 방식별 공격속도 (세션 36) — 한 번에 때리는 적이 적을수록 빠르다
  const S = RT.byAttackType;
  check('공격속도: 단일 > 관통 > 광역 > 연쇄', S.SINGLE > S.PIERCE && S.PIERCE > S.SPLASH && S.SPLASH > S.CHAIN,
    `${S.SINGLE} · ${S.PIERCE} · ${S.SPLASH} · ${S.CHAIN}`);
  const plain = d => d.attackSpeed * RT.attackSpeed(d.role) * (d.types.indexOf('FLYING') >= 0 ? RPD.TypeParams.attackSpeedMul : 1);
  [sg, ch, PD.list.find(d => d.attackType === 'SPLASH' && !d.form)].forEach(d => {
    fresh(1); const u = mk(d.id);
    const want = plain(d) * RT.attackTypeSpeed(d.attackType) * RPD.SynergyManager.bonus.attackSpeedMul;
    check(`${d.name}(${d.attackType || 'SINGLE'}) 실효 공격속도에 공격 방식 보정이 실린다`, Math.abs(u.attackSpeed / want - 1) < 1e-6,
      `${u.attackSpeed.toFixed(3)} / ${want.toFixed(3)}`);
  });

  // 버퍼 — 이웃에게 새 축이 붙는다
  const nbr = () => { const a = F.slots[0]; return F.slots.find(s => s !== a && s.unlocked && UM.isNeighbor(a, s)); };
  const withBuffer = (bufId, targetId) => {
    fresh(1); const t = UM.create(targetId); F.place(0, t);
    const n = nbr(); F.place(n.index, UM.create(bufId)); UM.recomputeAll(); return t;
  };
  const base = mk('charmeleon');
  const r0 = base.range;
  check('삐삐 옆은 사거리가 늘어난다', withBuffer('clefairy', 'charmeleon').range > r0);
  const tCd = withBuffer('jigglypuff', 'charmeleon');
  check('푸린 옆은 스킬 쿨다운이 줄어든다', tCd.cooldownMul < 1, tCd.cooldownMul);
  const tBoss = withBuffer('clefable', 'charmeleon');
  check('픽시 옆은 보스 피해가 붙는다', tBoss.auraExtras && tBoss.auraExtras.bossDamage > 0);
  const tAp = withBuffer('golduck', 'charmeleon');
  check('골덕 옆은 방어 무시가 붙는다', tAp.auraExtras && tAp.auraExtras.armorPierce > 0);
  // 방어 무시 · 보스 피해가 실제 피해에 실린다
  RPD.EnemyManager.reset();
  const e1 = RPD.EnemyManager.spawn('armored', 30), e2 = RPD.EnemyManager.spawn('armored', 30);
  const d1 = RPD.EnemyManager.damage(e1, 1000, { source: base }), d2 = RPD.EnemyManager.damage(e2, 1000, { source: tAp });
  check('방어 무시 버프가 실제 피해를 늘린다', d2 > d1, `${Math.round(d1)} → ${Math.round(d2)}`);
  const b1 = RPD.EnemyManager.spawn('boss_charger', 30), b2 = RPD.EnemyManager.spawn('boss_charger', 30);
  const bd1 = RPD.EnemyManager.damage(b1, 1000, { source: base }), bd2 = RPD.EnemyManager.damage(b2, 1000, { source: tBoss });
  check('보스 피해 버프가 보스에게만 실린다', bd2 > bd1 * 1.2, `${Math.round(bd1)} → ${Math.round(bd2)}`);
  RPD.EnemyManager.reset();
  // 버퍼 9종 전부 서로 다른 조합 · 두 축 이상인 버퍼가 과반
  const A = RPD.AuraData.list, keys = ['attackSpeed', 'critRate', 'critDamage', 'range', 'cooldown', 'armorPierce', 'bossDamage'];
  const sig = Object.keys(A).map(id => keys.filter(k => A[id][k]).join('+'));
  check('버퍼 버프 조합이 전부 다르다', new Set(sig).size === sig.length, sig.join(' / '));
  check('버퍼 버프 축이 7가지 다 쓰인다', keys.every(k => Object.values(A).some(a => a[k])));
  check('모든 버퍼(역할 BUFFER)가 버프를 하나 이상 갖는다', PD.list.filter(d => d.role === 'BUFFER').every(d => A[d.id]),
    PD.list.filter(d => d.role === 'BUFFER' && !A[d.id]).map(d => d.id));
}

/* ---------- 사거리 강화 (세션 33) ---------- */
section('사거리 강화');
{
  const EC = RPD.EconomyManager, step = RPD.Config.upgradeRangeStep;
  fresh(1);
  // 구석/근접 칸을 골라 사거리 효과가 드러나게 — 커버리지가 가장 작은 열린 칸
  const slots = F.slots.filter(sl => sl.unlocked);
  const corner = slots.slice().sort((a, b) => a.coverage[155] - b.coverage[155])[0];
  const u = UM.create('charmander');
  F.place(corner.index, u); UM.recomputeAll();
  const atk0 = u.attack, range0 = u.range, cov0 = EC.upgradeCoverage(u);
  const r = EC.upgrade(corner.index);
  check('강화하면 사거리가 +8% 오른다', r.ok && u.range === Math.round(u.def.range * (1 + step)), `${range0}→${u.range}`);
  check('강화해도 공격력은 그대로다(공격력은 골드 상점 몫)', Math.abs(u.attack - atk0) < 1e-9);
  const cov1 = EC.upgradeCoverage(u);
  check('강화하면 이 칸이 덮는 경로가 늘거나 같다', cov1.now >= cov0.now, `${cov0.now}→${cov1.now}px`);
  check('미리보기가 실제 결과와 같다(다음 레벨 커버리지)', cov0.next === cov1.now);
  for (let i = 0; i < 10; i++) EC.upgrade(corner.index);
  check('최대 5레벨 = 사거리 +40%', u.level === 5 && u.range === Math.round(u.def.range * 1.4), `lv${u.level} ${u.range}`);

  const glob = PD.list.find(d => d.range >= RPD.Range.GLOBAL);
  if (glob) {
    fresh(1);
    const g = UM.create(glob.id); F.place(0, g); UM.recomputeAll();
    check('전체 사거리 포켓몬은 강화할 게 없어 막힌다(골드 낭비 방지)', !EC.canUpgrade(g) && !EC.upgrade(0).ok);
  }

  // 조합하면 재료 강화 레벨의 절반이 결과물로 — 이제 사거리로 이어진다
  fresh(1);
  const a = UM.create('caterpie'), b = UM.create('caterpie');
  a.level = 4; b.level = 4;
  F.place(0, a); F.place(1, b); UM.recomputeAll(); RM.refresh();
  RM.craft('metapod');
  const m = F.getUnits().find(x => x.defId === 'metapod');
  check('조합 결과물이 재료 강화의 절반을 사거리로 이어받는다',
    !!m && m.level > 0 && m.range > m.def.range, m ? `lv${m.level} ${m.def.range}→${m.range}` : '없음');
}

/* ---------- 정예 소환 (세션 33 ④) ---------- */
section('정예 소환');
{
  const EL = RPD.EliteManager, EM = RPD.EnemyManager, WM = RPD.WaveManager, WD = RPD.WaveData;
  const step = RPD.Config.fixedStep;
  EL.init();
  const start = (round) => {
    GM.reset('NORMAL'); F.init(); EM.reset(); WM.reset(); RPD.StorageManager.reset(); RPD.BossManager.reset();
    WM.startRound(round); GM.gold = 100000;
  };

  start(12);
  const t2 = EL.tier(2);
  const fee = EL.fee(t2), goldBefore = GM.gold;
  const r = EL.summon(2);
  const e = r.enemy;
  check('정예를 부르면 참가비를 내고 한 마리가 나온다', r.ok && GM.gold === goldBefore - fee && e.isElite);
  check('정예 체력은 이번 라운드 잡몹 전체 체력의 eliteShare 배다',
    e.maxHp === Math.round(WD.trashWaveHp(12, GM.mode) * RPD.EnemyData.get('elite_2').eliteShare), `${e.maxHp}`);
  check('정예가 나와 있으면 또 못 부른다', EL.summon(1).reason === 'ACTIVE');

  // 라운드 진행을 막지 않는다
  EM.enemies.filter(x => !x.isElite).forEach(x => EM.kill(x));
  for (let i = 0; i < Math.ceil(40 / step); i++) {
    WM.update(step); EM.update(step);
    EM.enemies.filter(x => !x.isElite).forEach(x => EM.kill(x));
    if (WM.wave > 12) break;
  }
  check('정예가 살아 있어도 라운드는 넘어간다', WM.wave > 12 && e.alive, `wave=${WM.wave} alive=${e.alive}`);

  // 처치 — 골드 + 포켓몬
  const g0 = GM.gold, units0 = F.getUnits().length + RPD.StorageManager.units.length;
  let got = null; RPD.bus.on('elite:result', p => { got = p; });
  EM.kill(e);
  const units1 = F.getUnits().concat(RPD.StorageManager.units);
  check('처치하면 참가비 × rewardMul 골드를 받는다', GM.gold - g0 === Math.round(fee * t2.rewardMul), `+${GM.gold - g0}`);
  check('처치하면 정해진 등급의 포켓몬이 한 마리 들어온다',
    units1.length === units0 + 1 && got && got.unit && got.unit.def.tier === t2.unitTier && !got.unit.def.hidden);
  start(15);
  EM.kill(EL.summon(1).enemy);
  check('처치해도 같은 라운드엔 또 못 부른다', EL.check(1).reason === 'THIS_ROUND');
  GM.setWave(16);
  check('다음 라운드엔 다시 부를 수 있다', EL.check(1).ok);

  // 놓침 — 라이프 대폭 + 5라운드 소환 금지
  start(20);
  const lifeStart = GM.life;
  const e3 = EL.summon(3).enemy;
  e3.distance = RPD.MapData.path.length - 0.01;
  EM.update(step);
  const pen = Math.round(EL.baseLife * EL.tier(3).lifePct);
  check('놓치면 라이프가 크게 깎인다(시작 라이프의 비율)', lifeStart - GM.life === pen, `-${lifeStart - GM.life} (기대 -${pen})`);
  check('놓치면 일반 소환이 막힌다', SM.summon().reason === 'BANNED');
  check('놓치면 정예도 못 부른다', EL.summon(1).reason === 'BANNED');
  check('금지는 5라운드', EL.banRoundsLeft() === 5, `${EL.banRoundsLeft()}`);
  GM.setWave(24);
  check('4라운드 뒤에도 아직 금지', EL.isBanned() && SM.summon().reason === 'BANNED');
  GM.setWave(25);
  check('5라운드가 지나면 풀린다', !EL.isBanned() && SM.summon().ok);

  // 보스 라운드는 보스만 기다린다(정예는 안 기다린다)
  start(10);
  EL.summon(1);
  const boss = EM.enemies.find(x => x.isBoss);
  for (let i = 0; i < Math.ceil(2 / step); i++) { WM.update(step); EM.update(step); }
  EM.kill(EM.enemies.find(x => x.isBoss) || boss);
  for (let i = 0; i < Math.ceil(3 / step); i++) { WM.update(step); EM.update(step); }
  check('보스 라운드는 보스가 사라지면 넘어간다(정예가 남아 있어도)', WM.wave === 11 && !!EL.active, `wave=${WM.wave}`);

  GM.reset('NORMAL');
  check('새 판이면 정예·금지가 초기화된다', !EL.active && !EL.isBanned());
  GM.gold = 0; GM.setState(RPD.GameState.RUNNING);
  check('골드가 모자라면 못 부른다', EL.summon(1).reason === 'NO_GOLD');
}

/* ---------- 보스 라운드 (세션 33 ②) ---------- */
section('보스 라운드');
{
  const WM = RPD.WaveManager, EM = RPD.EnemyManager, CM = RPD.CombatManager;
  const step = RPD.Config.fixedStep;

  GM.reset('NORMAL'); F.init(); EM.reset(); WM.reset(); CM.reset(); RPD.BossManager.reset();
  WM.startRound(10);   // NORMAL 은 10라운드마다 보스
  for (let i = 0; i < Math.ceil(3 / step); i++) { WM.update(step); EM.update(step); }

  check('보스 라운드엔 보스만 나온다(호위 없음)',
    WM.plan.isBoss && WM.plan.entries.length === 1, `entries=${WM.plan.entries.length}`);
  check('필드에도 정확히 한 마리(보스)뿐이다', EM.aliveCount() === 1, `alive=${EM.aliveCount()}`);
  const boss = EM.enemies[0];
  check('그 한 마리가 진짜 보스다', !!boss && boss.isBoss);

  // carryOverLimit(5.5초)을 훌쩍 넘겨도 — 보스가 살아 있으면 다음 라운드로 안 넘어간다
  for (let i = 0; i < Math.ceil(20 / step); i++) { WM.update(step); EM.update(step); }
  check('보스를 안 잡으면 아무리 기다려도 다음 라운드로 안 넘어간다',
    WM.wave === 10 && WM.phase === WM.PHASE.CLEARING, `wave=${WM.wave} phase=${WM.phase}`);

  // 보스를 잡으면 — 바로(인터루드 뒤) 다음 라운드로 넘어간다
  EM.kill(boss);
  for (let i = 0; i < Math.ceil(5 / step); i++) { WM.update(step); EM.update(step); }
  check('보스를 잡으면 다음 라운드로 넘어간다', WM.wave === 11, `wave=${WM.wave}`);

  // 보스가 안 죽고 끝까지 걸어 나가도(라이프만 깎이고) 사라진 걸로 친다
  GM.reset('NORMAL'); F.init(); EM.reset(); WM.reset(); CM.reset(); RPD.BossManager.reset();
  WM.startRound(10);
  for (let i = 0; i < Math.ceil(3 / step); i++) { WM.update(step); EM.update(step); }
  const boss2 = EM.enemies[0];
  const lifeBefore = GM.life;
  boss2.distance = RPD.MapData.path.length - 0.01;
  for (let i = 0; i < Math.ceil(3 / step); i++) { WM.update(step); EM.update(step); }
  check('보스가 끝까지 걸어 나가면 라이프가 깎인다(놓친 것으로 친다)',
    GM.life < lifeBefore, `life=${lifeBefore}→${GM.life}`);
  check('…그리고 그것도 "사라짐"이라 다음 라운드로 넘어간다', WM.wave === 11, `wave=${WM.wave}`);
}

/* ---------- 도감 버프 ---------- */
section('도감 영구 버프');
{
  const DB = RPD.DexBonus;
  check('등록 수에 따라 보너스가 열린다',
    DB.activeFor(0).length === 0 && DB.activeFor(30).length === 3, `30종=${DB.activeFor(30).length}`);
  check('다음 보상을 알려 준다', DB.nextFor(25).at === 30, `next=${DB.nextFor(25).at}`);
  check('전부 채우면 다음이 없다', DB.nextFor(PD.all().length) === null);

  /* 도감은 장기 성장이고 실력은 한 판의 승패다.
   * 100%의 이득이 배치 실력 차이(커버리지 최대 5배)보다 작아야 한다. */
  const full = DB.powerGain(PD.all().length);
  check('도감 100% 이득이 8% 이내다', full <= 0.08, `+${(full*100).toFixed(1)}%`);
  check('도감 0%도 보너스 없이 성립한다', DB.powerGain(0) === 0);
}

/* ---------- 연속 진행 (STEP 10) ---------- */
section('연속 진행');
{
  const WM = RPD.WaveManager, EM = RPD.EnemyManager;
  const step = RPD.Config.fixedStep;

  check('준비 단계가 사라졌다', !WM.PHASE.PREPARE && !RPD.GameState.PREPARE);
  check('라운드 사이 정지가 1초 이내다', RPD.WaveData.interludeSeconds <= 1,
    `${RPD.WaveData.interludeSeconds}초`);

  GM.reset('NORMAL'); F.init(); EM.reset(); WM.reset(); RPD.CombatManager.reset();
  WM.begin();
  check('시작하자마자 스폰 단계다', WM.phase === WM.PHASE.SPAWNING, `phase=${WM.phase}`);
  check('시작 상태가 바로 RUNNING 이다', GM.state === RPD.GameState.RUNNING);

  let sawEnemy = false;
  for (let i = 0; i < Math.ceil(3 / step); i++) {
    GM.update(step); WM.update(step); EM.update(step);
    if (EM.aliveCount() > 0) { sawEnemy = true; break; }
  }
  check('3초 안에 적이 나온다', sawEnemy);

  // 다 잡으면 바로 다음 라운드로 넘어간다
  GM.reset('NORMAL'); F.init(); EM.reset(); WM.reset();
  WM.begin();
  let guard = 0;
  while (WM.phase !== WM.PHASE.CLEARING && guard < 60 / step) {
    guard++; GM.update(step); WM.update(step); EM.update(step);
    EM.enemies.slice().forEach(e => EM.kill(e, 'test'));
  }
  const atClear = GM.elapsed;
  guard = 0;
  while (GM.wave === 1 && guard < 10 / step) {
    guard++; GM.update(step); WM.update(step); EM.update(step);
    EM.enemies.slice().forEach(e => EM.kill(e, 'test'));
  }
  check('적을 다 잡으면 곧바로 다음 라운드가 온다',
    GM.wave === 2 && (GM.elapsed - atClear) < 1.5,
    `${(GM.elapsed - atClear).toFixed(2)}초`);

  // 못 잡고 있어도 언젠가는 다음 라운드가 겹쳐 들어온다
  GM.reset('NORMAL'); F.init(); EM.reset(); WM.reset();
  WM.begin();
  guard = 0;
  while (GM.wave < 2 && guard < 60 / step) { guard++; GM.update(step); WM.update(step); EM.update(step); }
  check('못 잡아도 다음 라운드가 겹쳐 들어온다', GM.wave >= 2, `wave=${GM.wave}`);
  check('밀릴 때 적이 누적된다', EM.aliveCount() > 0, `alive=${EM.aliveCount()}`);

  // 50라운드 목표 시간
  GM.reset('NORMAL'); F.init(); EM.reset(); WM.reset(); RPD.BossManager.reset();
  WM.begin();
  for (let i = 0; i < Math.ceil(2400 / step); i++) {
    GM.update(step);
    if (GM.state === RPD.GameState.RUNNING) { WM.update(step); EM.update(step); }
    EM.enemies.slice().forEach(e => EM.kill(e, 'test'));
    if (GM.state === RPD.GameState.VICTORY) break;
  }
  const mins = GM.elapsed / 60;
  check('노멀이 70라운드다', RPD.Modes.NORMAL.finalWave === 70);
  check('50라운드가 10~12분 목표 안이다', mins >= 8 && mins <= 13, `${mins.toFixed(1)}분`);
  check('끝까지 가면 승리한다', GM.state === RPD.GameState.VICTORY, `state=${GM.state}`);
}

/* ---------- 경제 ---------- */
section('경제');
{
  const C = RPD.Config, EC = RPD.EconomyManager, WD = RPD.WaveData;

  /* 실측으로 잡은 목표: 라운드당 소환 2~3회.
   * 슬롯이 18칸인데 5.9회씩 살 수 있으면 "골드를 어디 쓸까"가 사라진다. */
  GM.reset('NORMAL');
  function roundIncome(w) {
    const n = WD.bandFor(w).count(w);
    return (C.killGoldBase + Math.floor(w / C.killGoldPerWaves)) * n +
           C.waveClearBase + w * C.waveClearPerWave;
  }
  function buyable(w) {
    EC.summonCount = Math.round(w * 2);
    // 앞 검사에서 남은 필드(벌레 시너지 할인)가 섞이지 않게 할인 없이 잰다
    const mul = RPD.SynergyManager.bonus.summonCostMul;
    RPD.SynergyManager.bonus.summonCostMul = 1;
    const n = roundIncome(w) / EC.summonCost();
    RPD.SynergyManager.bonus.summonCostMul = mul;
    return n;
  }
  const early = buyable(5), late = buyable(45);
  check('초반에 라운드당 1~2회 살 수 있다', early >= 0.8 && early <= 2.2, `${early.toFixed(1)}회`);
  check('후반에도 라운드당 4회를 넘지 않는다', late <= 4, `${late.toFixed(1)}회`);
  check('후반이 초반보다 여유롭다', late > early, `${early.toFixed(1)} → ${late.toFixed(1)}`);

  // 총 유입이 슬롯 수에 비해 과하지 않아야 한다
  EC.summonCount = 0;
  let gold = C.startGold, n = 0;
  for (let w = 1; w <= 50; w++) gold += roundIncome(w);
  while (gold >= EC.summonCost() && n < 500) { gold -= EC.summonCost(); EC.summonCount++; n++; }
  /* 소환으로 나오는 것이 특별함까지로 바뀌면서 수입을 25% 줄였다(봇 클리어율 83% → 60%).
   * 벌레 시너지의 소환 비용 할인도 여기에 얹힌다. 하한을 그만큼 내렸다. */
  /* 안흔함이 같은 흔함 2마리가 되면서 중복 소환이 전부 재료가 됐다(버려지던 중복이 사라짐).
   * 같은 소환 수로 조합이 훨씬 잘 돼 클리어율이 40% → 73% 로 뛰었고, 후반 처치 골드를 줄여
   * 50% 로 되돌렸다. 소환 횟수의 하한도 그만큼 내렸다. */
  /* 조각 상점이 싸지면서(흔함 5 · 안흔함 10) 재료 일부를 조각으로 산다(판당 7회 안팎).
   * 그만큼 소환이 덜 필요해 하한을 65 로 내렸다. */
  check('한 판 소환 횟수가 65~180회다', n >= 65 && n <= 180, `${n}회`);

  /* 라운드 무료 지급 — 소환을 대체하지 않고 바닥을 깐다 */
  GM.reset('NORMAL'); F.init(); SM.reset();
  const before = F.getUnits().length;
  const given = SM.grantRound();
  check('라운드마다 무료로 받는다', given.length === C.roundGrant, `${given.length}마리`);
  check('받은 것도 필드에 자동 배치된다', F.getUnits().length === before + given.length);
  check('무료 지급은 흔함만 준다', given.every(u => u.tier === 'T1'),
    `tiers=${given.map(u => u.tier)}`);
  check('무료 지급은 환급되지 않는다', given.every(u => u.investedGold === 0));
  check('골드를 쓰지 않는다', GM.gold === Math.round(C.startGold));

  // 칸이 없으면 조용히 넘어간다
  F.init();
  GM.gold = 9999999;
  while (F.firstEmpty()) SM.summon();
  check('빈 칸이 없으면 지급을 건너뛴다', SM.grantRound().length === 0);

  /* 소환은 그대로 남아 있어야 한다 — 이 장르의 핵심이다 */
  check('소환 시스템이 살아 있다', typeof SM.summon === 'function' && C.summonBaseCost > 0);
}

/* ---------- 밸런스 곡선 회귀 방지 ---------- */
section('밸런스 곡선');
{
  const WD = RPD.WaveData, C = RPD.Config;

  /* 실측으로 잡은 값들이다. 누가 나중에 만지면 여기서 걸린다.
   * 각 수치의 근거는 VERSION.md 의 밸런스 패스 표에 있다. */
  /* 고유 스킬이 붙고(클리어율 38% → 95%) 해금이 8라운드 간격으로 당겨지면서
   * 플레이어 전력이 두 번 올랐다. 체력 곡선도 그만큼 가팔라졌다. 실측:
   * 1.124 → 85% · 1.133 → 65% · 1.138 → 58% · **1.140 → 42%** · 1.143 → 33%. */
  check('체력 배율이 50라운드용 범위다', WD.hpGrowth >= 1.10 && WD.hpGrowth <= 1.16,
    `${WD.hpGrowth}`);
  const total = Math.pow(WD.hpGrowth, 49);
  check('50라운드 총 체력 증가가 100~1200배다', total >= 100 && total <= 1200,
    `×${total.toFixed(0)}`);

  /* 라운드당 스폰 시간이 예산(13초)을 넘으면 한 판이 길어진다 */
  let worst = 0, worstAt = 0;
  for (let w = 1; w <= 50; w++) {
    const b = WD.bandFor(w);
    const t = b.count(w) * b.interval;
    if (t > worst) { worst = t; worstAt = w; }
  }
  check('라운드당 스폰이 13초를 넘지 않는다', worst <= 13,
    `R${worstAt} 에서 ${worst.toFixed(1)}초`);

  /* 물량이 아니라 체력으로 난이도를 올린다 (기획 §23) */
  const c1 = WD.bandFor(1).count(1), c50 = WD.bandFor(50).count(50);
  check('물량 증가가 체력 증가보다 완만하다', (c50 / c1) < total / 5,
    `물량 ×${(c50 / c1).toFixed(1)} vs 체력 ×${total.toFixed(0)}`);

  /* 라운드 사이 정지 */
  check('라운드 사이 정지가 1초 이내다', WD.interludeSeconds <= 1, `${WD.interludeSeconds}초`);
  check('밀려도 다음 라운드가 온다', WD.carryOverLimit > 0 && WD.carryOverLimit <= 8,
    `${WD.carryOverLimit}초`);

  /* 등급 해금이 고르게 퍼져 있어야 각 등급을 쓸 시간이 생긴다.
   * 전설이 41라운드 해금이던 시절 도달 중앙값이 42라 한 번도 못 썼다. */
  const unlocks = RPD.TIER_ORDER.map(t => RPD.Tiers[t].unlockRound);
  const last = unlocks[unlocks.length - 1];
  check('최상위 등급이 마지막 30% 안에 열린다', last <= RPD.Modes.NORMAL.finalWave * 0.75,
    `R${last} / ${RPD.Modes.NORMAL.finalWave}`);
  const gaps = unlocks.slice(1).map((u, i) => u - unlocks[i]);
  check('해금 간격이 고르다', Math.max(...gaps) - Math.min(...gaps) <= 2, `gaps=${gaps}`);

  /* 소환 확률이 해금과 어긋나지 않아야 한다 */
  const summonable = RPD.TIER_ORDER.filter(t => RPD.Tiers[t].summonable !== false);
  const mismatch = summonable.filter(t =>
    RPD.SummonTable.oddsFor(RPD.Tiers[t].unlockRound)[t] <= 0);
  check('해금 라운드에 그 등급이 실제로 나온다', mismatch.length === 0, `bad=${mismatch}`);
  check('소환으로 얻을 수 없는 등급도 조합식으로 만들 수 있다',
    RPD.TIER_ORDER.filter(t => RPD.Tiers[t].summonable === false)
      .every(t => RPD.RecipeData.list.some(r => RPD.PokemonData.get(r.id).tier === t)),
    '조합식 없음');
}

console.log('\n────────────────────────────');
console.log(`통과 ${pass} · 실패 ${fail}`);
process.exit(fail === 0 ? 0 : 1);
