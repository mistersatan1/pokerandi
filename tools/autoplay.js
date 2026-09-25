/* autoplay.js — v2 자동 플레이.
 * 실행: node tools/autoplay.js [판수] [모드]
 *
 * 전략은 단순하게 둔다. 초보자도 이 정도는 하니까, 여기서 도달하는 라운드가 바닥선이다.
 *   1. 조합할 수 있으면 무조건 조합한다 (성장의 주 경로)
 *   2. 골드가 되면 뽑는다
 *   3. 칸이 차면 가장 약한 개체를 방출한다 (조각도 나온다)
 *   4. 조합 완성에 딱 하나 남았고 조각이 충분하면 사 온다
 *   5. 여유가 크면 최강 개체를 강화한다
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');

const RUNS = parseInt(process.argv[2], 10) || 10;
const MODE = process.argv[3] || 'NORMAL';
const VERBOSE = process.argv.includes('--each');

function boot() {
  const store = {};
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    addEventListener: () => {},
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    performance: { now: () => Date.now() },
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }
    }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const files = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1])
    .filter(f => !f.includes('render/') && !f.includes('ui/') && !f.includes('main.js'));
  for (const f of files) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
  }
  const R = sandbox.RPD;
  R.EconomyManager.init(); R.GoldShopManager.init(); R.EliteManager.init(); R.StatsManager.init(); R.UnitManager.init();
  R.SummonManager.init(); R.CombatManager.init(); R.RecipeManager.init();
  R.ShardManager.init(); R.BossManager.init(); R.SaveManager.init();
  R.SkillManager.init();
  R.SpellManager.init();
  R.RewardManager.init();
  R.TraitManager.init();
  // 조합 난이도 보정(까다로운 조합 보너스 · 히든 1.5배)을 끄고 재 보려면 NO_CRAFTPOWER=1
  // 곡선 실험용 덮어쓰기: LATE=1.07 WALL_STEP=3
  if (process.env.LATE) R.WaveData.lateGrowth = Number(process.env.LATE);
  if (process.env.WALL_STEP) R.WaveData.wallStep = Number(process.env.WALL_STEP);
  // 보스 러시 보스 체력 실험: BR_BOSS_SHARE=1.3 (BOSS_RUSH.modifiers.bossShareMul 을 덮어쓴다)
  if (process.env.BR_BOSS_SHARE) R.Modes.BOSS_RUSH.modifiers.bossShareMul = Number(process.env.BR_BOSS_SHARE);
  // 마지막 보스 체력 실험: FINAL_BOSS_HP=0.3 (그 모드의 modifiers.finalBossHpMul 을 덮어쓴다)
  if (process.env.FINAL_BOSS_HP) {
    Object.keys(R.Modes).forEach(k => { R.Modes[k].modifiers = R.Modes[k].modifiers || {}; R.Modes[k].modifiers.finalBossHpMul = Number(process.env.FINAL_BOSS_HP); });
  }
  // 광역 불멸 보스 피해 실험: AOE_BOSS_DMG=1.5 (파이어 · 썬더의 pokemon.js bossDamage 를 덮어쓴다)
  if (process.env.AOE_BOSS_DMG) ['moltres', 'zapdos'].forEach(id => { R.PokemonData.get(id).bossDamage = Number(process.env.AOE_BOSS_DMG); });
  // 불멸·초월 배율 실험: IMMORTAL_MUL=2.5 TRANSCEND_MUL=2.8 (재료 합의 몇 배 — craftpower.js 3번 규칙)
  if (process.env.IMMORTAL_MUL || process.env.TRANSCEND_MUL) {
    if (process.env.IMMORTAL_MUL) R.CraftPower.CFG.IMMORTAL = Number(process.env.IMMORTAL_MUL);
    if (process.env.TRANSCEND_MUL) R.CraftPower.CFG.TRANSCEND = Number(process.env.TRANSCEND_MUL);
    R.CraftPower.build();
  }
  if (process.env.NO_CRAFTPOWER) { R.CraftPower.mul = {}; R.CraftPower.mulOf = () => 1; }
  return R;
}

const R = boot();
const { StorageManager: SG, GameManager: GM, FieldManager: F, EnemyManager: EM, WaveManager: WM,
        SummonManager: SM, EconomyManager: EC, StatsManager: ST, CombatManager: CM,
        RecipeManager: RM, ShardManager: SH, UnitManager: UM, BossManager: BM, SkillManager: SK,
        PokemonData: PD } = R;
const STEP = R.Config.fixedStep;

function newGame(modeId) {
  const diffId = process.argv[4] || 'NORMAL';
  EM.reset(); WM.reset(); EC.reset(); ST.reset(); SM.reset();
  CM.reset(); RM.reset(); SH.reset(); BM.reset(); SG.reset(); SK.reset(); R.RewardManager.reset(); R.TraitManager.reset();
  F.init(); GM.reset(modeId, diffId);
  R.SpellManager.reset();
}

function weakest() {
  let worst = null;
  for (const s of F.slots) {
    if (!s.unit) continue;
    if (!worst || s.unit.dps < worst.unit.dps) worst = s;
  }
  return worst;
}

/* 조합 재료로 쓰이는 개체는 함부로 버리지 않는다 */
/* 불멸 추구 봇(IMMORTAL=1) — 불멸 재료 전설은 지키고, 하나 모자라면 조각으로 사고, 모이면 바로 외친다.
 * 기본 봇은 불멸을 노리지 않는다(재료 전설 3마리가 우연히 모일 때만). */
const IMMORTAL = !!process.env.IMMORTAL;
const SPECIES_LOG = process.env.SPECIES_LOG || '';
const SPECIES = {};
let gameNo = 0;
process.on('exit', () => {
  if (!SPECIES_LOG) return;
  const out = {};
  for (const id in SPECIES) out[id] = { dmg: SPECIES[id].dmg, time: SPECIES[id].time, games: SPECIES[id].games.size };
  require('fs').writeFileSync(SPECIES_LOG, JSON.stringify(out));
});
const IMM_MATS = new Set();
function immortalMats() {
  if (!IMM_MATS.size) R.SpellData.list.filter(sp => sp.kind === 'immortal').forEach(sp => sp.materials.forEach(m => IMM_MATS.add(m)));
  return IMM_MATS;
}
function chaseImmortal(stats) {
  if (!IMMORTAL || GM.wave < 33) return;
  const owned = {};
  R.StorageManager.allUnits().forEach(u => { owned[u.defId] = (owned[u.defId] || 0) + 1; });
  for (const sp of R.SpellData.list.filter(x => x.kind === 'immortal')) {
    const need = {};
    sp.materials.forEach(m => { need[m] = (need[m] || 0) + 1; });
    const missing = Object.keys(need).reduce((a, m) => a + Math.max(0, need[m] - (owned[m] || 0)), 0);
    if (missing === 1) {
      const m = Object.keys(need).find(k => (owned[k] || 0) < need[k]);
      if (SH.buy(m).ok) { stats.shardBuys++; return; }
    }
  }
}

function neededAsMaterial() {
  const need = {};
  if (IMMORTAL) immortalMats().forEach(m => { need[m] = true; });
  for (const v of RM.view) {
    if (v.missingCount > 1) continue;
    for (const m of v.materials) if (m.owned) need[m.id] = true;
  }
  return need;
}

function craftAll() {
  let n = 0;
  for (let g = 0; g < 30; g++) {
    const ready = RM.readyList();
    if (!ready.length) break;
    if (!RM.craft(ready[0].key).ok) break;
    n++;
  }
  return n;
}

/* 주문 — 봇은 모든 주문을 안다고 친다(발견 기록과 무관).
 * v2 에서 히든 31종이 전설 계보의 재료라, 주문을 안 쓰는 봇은 측정 자체가 틀어진다.
 * 재료가 다 있으면 바로 외친다. 불멸은 전설 3마리를 쓰므로 필드가 거의 찼을 때만. */
function castAll() {
  let n = 0;
  for (const sp of R.SpellData.list) {
    if (sp.kind === 'transcend') continue;
    if (sp.kind === 'immortal' && !IMMORTAL && F.getUnits().length < F.slots.filter(s => s.unlocked).length - 1) continue;
    if (!R.SpellManager.check(sp).ok) continue;
    if (R.SpellManager.cast(sp.phrase).ok) n++;
  }
  return n;
}

function act(stats) {
  chaseImmortal(stats);
  stats.spells += castAll();
  stats.crafts += craftAll();

  // 조각으로 마지막 재료 사 오기
  for (const s of SH.suggestions()) {
    if (!s.affordable) continue;
    if (SH.buy(s.id).ok) { stats.shardBuys++; stats.crafts += craftAll(); }
  }

  // 창고에서 더 센 개체를 필드로 올린다
  for (let g = 0; g < 10; g++) {
    const empty = F.firstEmpty();
    if (!empty || !SG.units.length) break;
    let best = 0;
    for (let i = 1; i < SG.units.length; i++) {
      if (SG.units[i].dps > SG.units[best].dps) best = i;
    }
    if (!SG.deploy(best, empty.index).ok) break;
    stats.deploys++;
  }

  // 필드의 약한 개체를 창고의 센 개체로 교체
  for (let g = 0; g < 5; g++) {
    if (!SG.units.length) break;
    const worstSlot = weakest();
    if (!worstSlot) break;
    let best = 0;
    for (let i = 1; i < SG.units.length; i++) {
      if (SG.units[i].dps > SG.units[best].dps) best = i;
    }
    if (SG.units[best].dps <= worstSlot.unit.dps * 1.3) break;
    if (!SG.deploy(best, worstSlot.index).ok) break;
    stats.deploys++;
  }

  // 창고가 차면 재료가 아닌 것부터 방출
  while (SG.isFull()) {
    const need = neededAsMaterial();
    let idx = -1;
    for (let i = 0; i < SG.units.length; i++) {
      if (need[SG.units[i].defId]) continue;
      if (idx < 0 || SG.units[i].dps < SG.units[idx].dps) idx = i;
    }
    if (idx < 0) idx = 0;
    const u = SG.removeAt(idx);
    SH.add(SH.gainFor(u.tier), 'sell');
    stats.sells++;
  }

  // 창고 확장
  if (SG.canExpand() && GM.gold > SG.expandCost() * 2.5) {
    if (SG.expand().ok) stats.expands++;
  }

  // 정예 — 조심스러운 플레이어: 정예가 경로를 다 걷는 동안 보드가 넣을 피해를 어림하고,
  // 그게 정예 체력의 ELITE_SAFETY 배를 넘는 가장 높은 등급만 부른다. 참가비를 내도 소환할 돈이 남을 때만.
  const EL = R.EliteManager;
  if (!process.env.NO_ELITE && !EL.active && !EL.isBanned()) {
    const boardDps = F.getUnits().reduce((a, u) => a + u.dps, 0);
    const SAFETY = Number(process.env.ELITE_SAFETY || 3);
    const COVER = 0.3;   // 보드 DPS 중 한 적에게 실제로 들어가는 몫(사거리·분산) 어림
    for (const t of EL.TIERS.slice().reverse()) {
      const def = R.EnemyData.get(t.enemy);
      const walk = R.MapData.path.length / R.WaveData.scaleSpeed(def.speed, GM.wave);
      if (boardDps * COVER * walk < EL.previewHp(t) * SAFETY) continue;
      if (GM.gold < EL.fee(t) + EC.summonCost()) continue;
      if (EL.summon(t.id).ok) { stats.elites++; stats['elite' + t.id] = (stats['elite' + t.id] || 0) + 1; }
      break;
    }
  }

  // 소환
  for (let g = 0; g < 30; g++) {
    if (!GM.canAfford(EC.summonCost())) break;
    const r = SM.summon();
    if (!r.ok) break;
    stats.summons++;
    stats.byTier[r.tier] = (stats.byTier[r.tier] || 0) + 1;
    stats.crafts += craftAll();
  }

  // 확장 칸 · 강화는 여유가 클 때만
  for (const s of F.lockedSlots()) {
    if (GM.gold > s.cost + EC.summonCost() * 3) { if (EC.unlockSlot(s.index).ok) stats.slots++; }
  }
  // 골드 상점 — 지금 필드 DPS 를 골드당 가장 많이 올리는 칸 하나(개체 강화와 같은 "애매한 돈의 출구")
  const G = R.GoldShopManager;
  let pick = null;
  const opts = G.TIER_SLOTS.map(t => ['tier', t.id]).concat(G.types().map(t => ['type', t]));
  for (const [kind, key] of opts) {
    const c = G.check(kind, key);
    if (!c.ok) continue;
    let gain = 0;
    for (const u of F.getUnits()) {
      const hit = kind === 'type' ? (u.def.types || []).indexOf(key) >= 0 : G.tierSlotOf(u.def) === key;
      if (hit) gain += u.dps;
    }
    const value = gain / c.price;
    if (value > 0 && (!pick || value > pick.value)) pick = { kind, key, value, price: c.price };
  }
  /* 사거리 강화 — 이 칸에서 덮는 경로가 늘어난 비율만큼 그 개체의 DPS 가 더 들어간다고 친다.
   * 경로를 거의 못 덮는 칸(구석)일수록 한 번의 강화가 크게 먹힌다 — 그게 이 강화의 존재 이유다. */
  let best = null, bestVal = 0;
  for (const s of F.slots) {
    if (!s.unit || !EC.canUpgrade(s.unit)) continue;
    const cv = EC.upgradeCoverage(s.unit);
    if (!cv) continue;
    const gain = s.unit.dps * (cv.next - cv.now) / Math.max(cv.now, 40);
    const val = gain / EC.upgradeCost(s.unit);
    if (val > bestVal) { bestVal = val; best = s; }
  }
  const upValue = bestVal;
  // 한 레벨이 공격력 · 공격속도를 같이 올린다 — DPS 로는 둘의 합만큼 늘어난다고 친다
  const shopValue = pick ? pick.value * (pick.kind === 'type' ? G.CFG.typeStep + G.CFG.typeSpeedStep
                                                              : G.CFG.tierStep + G.CFG.tierSpeedStep) : 0;
  if (!process.env.NO_SHOP && pick && shopValue >= upValue && GM.gold >= pick.price) {
    if (G.buy(pick.kind, pick.key).ok) stats.shopBuys++;
  } else if (best && GM.gold > EC.upgradeCost(best.unit) * 1.5) {
    if (EC.upgrade(best.index).ok) stats.upgrades++;
  }
}

let curStats = null, eliteHooked = false;
function playOne(modeId) {
  gameNo++;
  newGame(modeId);
  if (!eliteHooked) {
    eliteHooked = true;
    /* 60라운드 시점에 불멸·초월을 몇 마리 갖고 있었나 — "갖춰야 60을 넘는다"를 재는 기준 */
    R.bus.on('game:wave', p => {
      if (!curStats) return;
      const all = F.getUnits().concat(R.StorageManager.units);
      const special = all.filter(u => u.def.tier === 'T6' || u.def.tier === 'T7').length;
      if (p.wave === 60) curStats.special60 = special;
      /* 켜진 시너지(타입:단계) — 30 · 50 · 60 라운드. WALL_LOG 에 같이 남긴다 */
      if (p.wave === 30 || p.wave === 50 || p.wave === 60) {
        (curStats.syn = curStats.syn || {})[p.wave] = R.SynergyManager.active.filter(a => a.tierIndex >= 0).map(a => a.typeId + ':' + (a.tierIndex + 1));
      }
      /* 공격 대상 선택(세션 42)을 쓰는 플레이어 — 보스 라운드엔 [모두 이렇게 → 보스], 끝나면 종 기본값으로.
       * BOT_TARGET=0 이면 안 쓴다(기능 전과 비교). */
      if (process.env.BOT_TARGET !== '0') {
        const bossRound = R.WaveData.isBossWave(p.wave, GM.mode);
        if (bossRound && GM.targetAll !== 'BOSS') R.UnitManager.setTargetingAll('BOSS');
        else if (!bossRound && GM.targetAll) R.UnitManager.setTargetingAll(null);
      }
      /* 벽 넘김 = 61R 시작 ~ 66R 시작 사이 라이프를 지켰나. 라운드가 겹쳐 들어와 61R 적이 새는 건 62~64 에 드러나고,
       * 라이프 60 이 닳는 데 몇 라운드가 걸려 "65 도달"은 벽을 못 넘은 판도 셌다(세션 38). */
      if (p.wave === 61) curStats.life61 = GM.life;
      if (p.wave === 66) curStats.life66 = GM.life;
      /* WALL_LOG=파일 — 58라운드부터 라운드 시작 시점의 라이프 · 필드 DPS 를 판마다 남긴다(벽을 어떻게 넘는지 보기) */
      if (process.env.WALL_LOG && p.wave >= 49) {
        const fu = F.getUnits(), imm = fu.filter(u => u.def.tier === 'T6' || u.def.tier === 'T7');
        (curStats.trace = curStats.trace || []).push({ w: p.wave, life: GM.life,
          dps: Math.round(fu.reduce((a, u) => a + u.dps, 0)), sp: special, n: fu.length,
          immField: imm.length, immDps: Math.round(imm.reduce((a, u) => a + u.dps, 0)),
          immCov: imm.map(u => { const c = R.EconomyManager.upgradeCoverage && R.EconomyManager.upgradeCoverage(u); return c ? Math.round(c.now) : null; }),
          medCov: (() => { const cs = fu.map(u => { const c = R.EconomyManager.upgradeCoverage && R.EconomyManager.upgradeCoverage(u); return c ? c.now : null; }).filter(x => x != null).sort((a, b) => a - b); return cs.length ? Math.round(cs[cs.length >> 1]) : null; })(),
          immDmg: imm.map(u => Math.round(u.totalDamage)), topDmg: Math.round(Math.max(0, ...fu.map(u => u.totalDamage))) });
      }
      /* GIVE_IMMORTAL=n — 50라운드에 불멸 n마리를 쥐여 준다(가장 약한 필드 개체와 바꾼다).
       * 봇은 불멸(전설 3마리)을 거의 못 만들어서, "갖춘 플레이어"를 따로 흉내 낸다. */
      const give = Number(process.env.GIVE_IMMORTAL || 0);
      if (p.wave === 50 && give > 0) {
        /* 실제 주문처럼 전설 3마리를 치르고 바꾼다(가장 약한 전설부터 · 모자라면 가장 약한 개체).
         * 공짜로 주면 "불멸 = 순수한 덤"이 돼 벽의 의미를 부풀린다. */
        // GIVE_IDS=mewtwo,moltres — 어떤 불멸을 줄지(기본 파이어·썬더 — 둘 다 광역·연쇄라 단일 보스엔 약하다)
        const ids = (process.env.GIVE_IDS ? process.env.GIVE_IDS.split(',') : ['moltres', 'zapdos', 'articuno', 'mewtwo', 'mew']).slice(0, give);
        for (const id of ids) {
          let freed = -1;
          for (let k = 0; k < 3; k++) {
            const pool = F.slots.filter(sl => sl.unit && sl.unit.def.tier !== 'T6');
            if (!pool.length) break;
            const legends = pool.filter(sl => sl.unit.def.tier === 'T5');
            const pick = (legends.length ? legends : pool).sort((a, b) => a.unit.dps - b.unit.dps)[0];
            if (freed < 0) freed = pick.index;
            F.remove(pick.index);
          }
          if (freed >= 0) F.place(freed, R.UnitManager.create(id));
        }
        R.UnitManager.recomputeAll();
      }
    });
    /* 마지막 라운드 보스를 잡았나 · 놓쳤나 — 지금 규칙은 보스가 걸어 나가도 라이프가 남으면 클리어다 */
    const finalBoss = (e, how) => {
      if (!curStats || !e || !e.isBoss) return;
      const fw = GM.mode.finalWave;
      if (fw > 0 && GM.wave >= fw) {
        curStats.finalBoss = how;
        // 넣은 피해 / 최대 체력 — 보스 체력을 낮췄다면 잡았을지 어림하는 데 쓴다(넣은 피해 ≥ 새 체력이면 잡음)
        curStats.finalBossFrac = how === 'killed' ? 1 : Math.max(0, (e.maxHp - Math.max(0, e.hp)) / e.maxHp);
      }
    };
    R.bus.on('enemy:died', p => finalBoss(p.enemy, 'killed'));
    R.bus.on('enemy:leaked', e => finalBoss(e, 'leaked'));
    R.bus.on('elite:result', p => {
      if (!curStats) return;
      if (p.ok) { curStats.eliteWin++; curStats.eliteGold += p.gold; } else curStats.eliteLose++;
    });
  }
  const stats = { special60: null, life61: null, life66: null, finalBoss: null, finalBossFrac: null, syn: null, crafts: 0, spells: 0, summons: 0, shopBuys: 0, elites: 0, eliteWin: 0, eliteLose: 0, eliteGold: 0, sells: 0, slots: 0, upgrades: 0, deploys: 0,
                  expands: 0, shardBuys: 0, byTier: {}, goldSum: 0, goldN: 0 };
  curStats = stats;
  WM.begin();

  let lastAct = 0;
  const MAX = Math.ceil(2400 / STEP);
  for (let i = 0; i < MAX; i++) {
    GM.update(STEP);
    if (GM.state === R.GameState.RUNNING) {
      WM.update(STEP); EM.update(STEP); CM.update(STEP); R.SkillManager.update(STEP); BM.update(STEP);
    }
    if (i % 60 === 0) { stats.goldSum += GM.gold; stats.goldN++; }
    if (GM.elapsed - lastAct >= 0.5) {
      /* SPECIES_LOG=파일 — 종별 "필드에 있던 1초당 실제 피해". 누적 피해는 조합 재료로 쓰이면 사라지고
       * 필드에 있던 시간도 제각각이라, 0.5초마다 차이만 모은다. */
      if (SPECIES_LOG) {
        const dt = GM.elapsed - lastAct;
        for (const u of F.getUnits()) {
          const d = u.totalDamage - (u._logged || 0); u._logged = u.totalDamage;
          const rec = SPECIES[u.defId] || (SPECIES[u.defId] = { dmg: 0, time: 0, games: new Set() });
          rec.dmg += d; rec.time += dt; rec.games.add(gameNo);
        }
      }
      lastAct = GM.elapsed; act(stats);
    }
    if (GM.state === R.GameState.GAMEOVER || GM.state === R.GameState.VICTORY) break;
  }

  const units = F.getUnits();
  const board = {};
  units.forEach(u => { board[u.tier] = (board[u.tier] || 0) + 1; });

  return {
    round: ST.highestWave,
    win: GM.state === R.GameState.VICTORY,
    minutes: GM.elapsed / 60,
    boardDps: Math.round(units.reduce((a, u) => a + u.dps, 0)),
    board,
    topUnit: units.sort((a, b) => b.totalDamage - a.totalDamage)[0],
    avgGold: Math.round(stats.goldSum / Math.max(1, stats.goldN)),
    ...stats
  };
}

/* ---------- 실행 ---------- */

console.log(`\n자동 플레이 ${RUNS}판 · ${R.Modes[MODE].label} (최종 ${R.Modes[MODE].finalWave || '무한'}라운드)\n`);
if (VERBOSE) console.log('판  결과   도달  분    보드DPS  소환  조합  방출  조각  강화  최고 피해');

const results = [];
for (let i = 0; i < RUNS; i++) {
  const r = playOne(MODE);
  results.push(r);
  if (process.env.WALL_LOG) require('fs').appendFileSync(process.env.WALL_LOG,
    JSON.stringify({ round: r.round, win: r.win, special60: r.special60, finalBoss: r.finalBoss, finalBossFrac: r.finalBossFrac, syn: r.syn || {}, trace: r.trace || [] }) + '\n');
  if (VERBOSE) {
    console.log(
      String(i + 1).padStart(2) +
      (r.win ? '  클리어' : '  패배  ') +
      String(r.round).padStart(6) + r.minutes.toFixed(1).padStart(6) +
      String(r.boardDps).padStart(9) + String(r.summons).padStart(6) +
      String(r.crafts).padStart(6) + String(r.sells).padStart(6) +
      String(r.shardBuys).padStart(6) + String(r.upgrades).padStart(6) +
      '  ' + (r.topUnit ? r.topUnit.name : '—'));
  }
}

const rounds = results.map(r => r.round).sort((a, b) => a - b);
const wins = results.filter(r => r.win).length;
const med = (a) => a[Math.floor(a.length / 2)];

console.log('\n요약');
console.log(`  클리어 ${wins}/${RUNS} (${Math.round(wins / RUNS * 100)}%)`);
console.log(`  도달 라운드: 최소 ${rounds[0]} · 중앙 ${med(rounds)} · 최대 ${rounds[rounds.length - 1]}`);
console.log(`  판 시간 중앙 ${med(results.map(r => r.minutes).sort((a, b) => a - b)).toFixed(1)}분`);
console.log(`  판당 소환 ${(results.reduce((a, r) => a + r.summons, 0) / RUNS).toFixed(0)}회 · ` +
            `조합 ${(results.reduce((a, r) => a + r.crafts, 0) / RUNS).toFixed(0)}회 · ` +
            `방출 ${(results.reduce((a, r) => a + r.sells, 0) / RUNS).toFixed(0)}회 · ` +
            `조각구매 ${(results.reduce((a, r) => a + r.shardBuys, 0) / RUNS).toFixed(1)}회 · ` +
            `주문 ${(results.reduce((a, r) => a + r.spells, 0) / RUNS).toFixed(1)}회 · ` +
            `강화 ${(results.reduce((a, r) => a + r.upgrades, 0) / RUNS).toFixed(1)}회 · ` +
            `골드상점 ${(results.reduce((a, r) => a + r.shopBuys, 0) / RUNS).toFixed(1)}회`);
{
  // 60라운드 시점 불멸·초월 보유 여부로 나눠 본다 — "갖춰야 60을 넘는다"의 측정
  const at60 = results.filter(r => r.special60 != null);
  const has = at60.filter(r => r.special60 > 0), none = at60.filter(r => r.special60 === 0);
  // 벽 넘김 = 61~65 동안 라이프를 지킨 판(61R 시작 → 66R 시작 손실 WALL_HOLD 이하). 80판에서 허용 0 · 5 · 10 모두 같은 판을 골랐다.
  const WALL_HOLD = 5;
  const past = xs => xs.filter(r => r.life66 != null && r.life61 - r.life66 <= WALL_HOLD).length;
  const clr = xs => xs.length ? Math.round(xs.filter(r => r.win).length / xs.length * 100) + '%' : '-';
  const wins = results.filter(r => r.win);
  if (wins.length) console.log(`  클리어 ${wins.length}판 중 마지막 보스: 잡음 ${wins.filter(r => r.finalBoss === 'killed').length}` +
    ` · 놓침 ${wins.filter(r => r.finalBoss === 'leaked').length}`);
  console.log(`  60R 도달 ${at60.length}판 → 벽 넘김(61~65 라이프 지킴): 불멸·초월 있음 ${past(has)}/${has.length}(클리어 ${clr(has)})` +
    ` · 없음 ${past(none)}/${none.length}(클리어 ${clr(none)})`);
}
{
  const sum = k => results.reduce((a, r) => a + (r[k] || 0), 0);
  const n = sum('elites');
console.log(`  정예 판당 ${(n / RUNS).toFixed(1)}회 (하급 ${(sum('elite1') / RUNS).toFixed(1)} · 중급 ${(sum('elite2') / RUNS).toFixed(1)} · 상급 ${(sum('elite3') / RUNS).toFixed(1)})` +
    ` · 성공 ${sum('eliteWin')} / 실패 ${sum('eliteLose')}` + (n ? ` (${Math.round(sum('eliteWin') / n * 100)}%)` : '') +
    ` · 정예로 번 골드 판당 ${Math.round(sum('eliteGold') / RUNS)}G`);
}
console.log(`  평균 보유 골드 ${Math.round(results.reduce((a, r) => a + r.avgGold, 0) / RUNS)}`);

console.log('\n라운드별 사망 분포');
const deaths = {};
results.filter(r => !r.win).forEach(r => { const b = Math.floor(r.round / 5) * 5; deaths[b] = (deaths[b] || 0) + 1; });
Object.keys(deaths).map(Number).sort((a, b) => a - b).forEach(b =>
  console.log(`  ${String(b).padStart(2)}~${b + 4}: ${'█'.repeat(deaths[b])} ${deaths[b]}`));

console.log('\n최종 보드 등급 구성 (평균)');
R.TIER_ORDER.concat(R.SPECIAL_TIERS).forEach(t => {
  const n = results.reduce((a, r) => a + (r.board[t] || 0), 0) / RUNS;
  if (n > 0.05) console.log(`  ${R.Tiers[t].label.padEnd(7)} ${n.toFixed(1)}마리`);
});

console.log('\n소환 등급 분포 (판당)');
R.TIER_ORDER.forEach(t => {
  const n = results.reduce((a, r) => a + (r.byTier[t] || 0), 0) / RUNS;
  if (n > 0.05) console.log(`  ${R.Tiers[t].label.padEnd(7)} ${n.toFixed(1)}회`);
});
console.log('');
