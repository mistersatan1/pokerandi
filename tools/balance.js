/* balance.js — 웨이브 난이도 곡선을 숫자로 본다.
 * 실행: node tools/balance.js [최대웨이브] [모드]
 *
 * "체감상 어렵다" 대신 "12웨이브에서 필요 DPS 가 2.4배 뛴다" 처럼 말할 수 있게 하는 도구.
 * PHASE 15 밸런스 작업의 기준선이 된다.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const MAX_WAVE = parseInt(process.argv[2], 10) || 30;
const MODE = process.argv[3] || 'NORMAL';

const sandbox = {
  console,
  requestAnimationFrame: () => 0,
  cancelAnimationFrame: () => {},
  performance: { now: () => Date.now() },
  addEventListener: () => {}
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

[
  'js/core/RPD.js', 'js/core/Utils.js', 'js/core/EventBus.js', 'js/core/Assets.js',
  'js/core/PathFollower.js', 'js/core/Loop.js',
  'js/data/types.js', 'js/data/map.js', 'js/data/enemies.js', 'js/data/waves.js',
  'js/systems/GameManager.js', 'js/systems/FieldManager.js',
  'js/systems/EconomyManager.js', 'js/systems/StatsManager.js', 'js/systems/SynergyManager.js',
  'js/systems/EnemyManager.js', 'js/systems/WaveManager.js'
].forEach(rel => {
  vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), sandbox, { filename: rel });
});

const RPD = sandbox.RPD;
const WD = RPD.WaveData;
const ED = RPD.EnemyData;
const EC = RPD.EconomyManager;
const mode = RPD.Modes[MODE];

// 표본 편차를 줄이려고 웨이브마다 여러 번 뽑아 평균을 낸다 (구성이 가중치 랜덤이므로)
const SAMPLES = 40;

console.log(`\n모드: ${mode.label}  ·  웨이브 1~${MAX_WAVE}\n`);
console.log('웨이브  적수   총체력    유효체력   길이   필요DPS  누적골드   비고');
console.log('─'.repeat(76));

let cumulativeGold = RPD.Config.startGold;
let prevDps = 0;
const rows = [];

for (let w = 1; w <= MAX_WAVE; w++) {
  let count = 0, rawHp = 0, effHp = 0, duration = 0, gold = 0;

  for (let s = 0; s < SAMPLES; s++) {
    const plan = WD.build(w, mode);
    let c = 0, rh = 0, eh = 0, g = 0;

    for (const entry of plan.entries) {
      const def = ED.get(entry.enemyId);
      const n = def.packSize || 1;
      const hp = WD.enemyMaxHp(def, w, mode);
      const shield = def.shieldRatio ? hp * def.shieldRatio : 0;
      const armor = WD.scaleArmor(def.armor, w);
      // 방어력을 감안한 "실제로 넣어야 하는 피해량"
      const effective = (hp + shield) * (1 + armor / 100);

      c += n;
      rh += (hp + shield) * n;
      eh += effective * n;
      g += EC.killReward({ wave: w, def: def, isBoss: !!def.isBoss }) * n;

      // 분열체는 파편까지 잡아야 웨이브가 끝난다
      if (def.splitInto) {
        const cd = ED.get(def.splitInto.id);
        const chp = WD.enemyMaxHp(cd, w, mode);
        c += def.splitInto.count * n;
        rh += chp * def.splitInto.count * n;
        eh += chp * def.splitInto.count * n;
        g += EC.killReward({ wave: w, def: cd, isBoss: false }) * def.splitInto.count * n;
      }
    }

    const last = plan.entries[plan.entries.length - 1];
    // 웨이브의 실질 제한시간 = 마지막 적이 나오는 시각 + 그 적이 출구까지 가는 시간.
    // 보스는 자기 제한시간(초과 시 돌진)이 실제 상한이므로 그쪽을 쓴다.
    const boss = plan.entries.map(e => ED.get(e.enemyId)).find(d => d.isBoss);
    const travel = boss
      ? boss.timeLimit + 4
      : RPD.MapData.path.length / WD.scaleSpeed(ED.grunt.speed, w);
    count += c; rawHp += rh; effHp += eh; gold += g;
    duration += (boss ? 0 : last.at) + travel;
  }

  count /= SAMPLES; rawHp /= SAMPLES; effHp /= SAMPLES; gold /= SAMPLES; duration /= SAMPLES;

  const dps = effHp / duration;
  cumulativeGold += gold + RPD.Config.waveClearBase + w * RPD.Config.waveClearPerWave;

  const jump = prevDps > 0 ? dps / prevDps : 1;
  let note = '';
  if (WD.isBossWave(w, mode)) note = '보스';
  else if (jump > 1.45) note = `급상승 ×${jump.toFixed(2)}`;
  prevDps = dps;

  rows.push({ w, count, effHp, dps, cumulativeGold });

  console.log(
    String(w).padStart(5) +
    String(Math.round(count)).padStart(7) +
    fmt(rawHp).padStart(10) +
    fmt(effHp).padStart(11) +
    (duration.toFixed(0) + 's').padStart(7) +
    fmt(dps).padStart(9) +
    fmt(cumulativeGold).padStart(10) +
    '   ' + note
  );
}

function fmt(n) {
  if (n < 1000) return String(Math.round(n));
  if (n < 1000000) return (n / 1000).toFixed(1) + 'K';
  return (n / 1000000).toFixed(2) + 'M';
}

/* ---------- 곡선 점검 ---------- */
console.log('\n곡선 점검');

const warnings = [];

// 보스 웨이브는 의도적인 스파이크다. 잡몹 웨이브끼리만 비교해야 경고가 의미를 갖는다.
const normalRows = rows.filter(r => !RPD.WaveData.isBossWave(r.w, mode));

/* 보스를 건너뛰면 웨이브 간격이 2가 되므로, 배율을 그대로 비교하면
 * 보스 다음 웨이브가 항상 과장돼 보인다. 간격으로 정규화해 "웨이브당 증가율"로 본다. */
// 보스 러시처럼 잡몹 웨이브가 아예 없는 모드에서는 전체 웨이브로 증가율을 잰다.
const growthRows = normalRows.length >= 2 ? normalRows : rows;

const perWave = [];
for (let i = 1; i < growthRows.length; i++) {
  const gap = growthRows[i].w - growthRows[i - 1].w;
  perWave.push({
    w: growthRows[i].w,
    rate: Math.pow(growthRows[i].dps / growthRows[i - 1].dps, 1 / gap)
  });
}

const sorted = perWave.map(x => x.rate).sort((a, b) => a - b);
const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 1;
console.log(`  웨이브당 난이도 증가율: 중앙값 ×${median.toFixed(3)}` +
  (normalRows.length >= 2 ? '' : ' (전 웨이브가 보스인 모드)'));

for (const x of perWave) {
  if (x.rate > median * 1.28) {
    warnings.push(`웨이브 ${x.w}: 웨이브당 증가율 ×${x.rate.toFixed(2)} (평소 ×${median.toFixed(2)}) — 여기가 벽이 된다`);
  }
  if (x.rate < median * 0.8) {
    warnings.push(`웨이브 ${x.w}: 웨이브당 증가율 ×${x.rate.toFixed(2)} — 앞 웨이브보다 헐거워진다`);
  }
}

// 골드 대비 요구 화력. 이 비율이 계속 커지면 아무리 잘해도 따라잡을 수 없는 구조가 된다.
const first = rows[0], last = rows[rows.length - 1];
const dpsGrowth = last.dps / first.dps;
const goldGrowth = last.cumulativeGold / first.cumulativeGold;
console.log(`  필요 DPS 증가: ×${dpsGrowth.toFixed(1)}`);
console.log(`  누적 골드 증가: ×${goldGrowth.toFixed(1)}`);
console.log(`  화력/골드 비율: ×${(dpsGrowth / goldGrowth).toFixed(2)}` +
  ' (1에 가까울수록 골드만으로 따라갈 수 있고, 클수록 합성·시너지가 필수)');

// 보스는 직전 잡몹 웨이브 대비 몇 배인지를 따로 본다. 2~3배가 목표.
const bossRows = rows.filter(r => RPD.WaveData.isBossWave(r.w, mode));
for (const b of bossRows) {
  const prev = rows.filter(r => r.w < b.w && !RPD.WaveData.isBossWave(r.w, mode)).pop();
  if (!prev) continue;
  const spike = b.dps / prev.dps;
  if (spike < 1.8) warnings.push(`보스 ${b.w}: 직전 웨이브의 ${spike.toFixed(1)}배뿐이라 보스처럼 안 느껴진다`);
  if (spike > 4.0) warnings.push(`보스 ${b.w}: 직전 웨이브의 ${spike.toFixed(1)}배라 벽이 된다`);
}

// PHASE 6~7 에서 포켓몬 스탯을 설계할 때 맞춰야 할 목표치.
console.log('\n포켓몬 설계 목표 (슬롯 16칸 기준, 슬롯당 필요 DPS)');
for (const w of [1, 10, 20, 30]) {
  const row = rows.find(r => r.w === w);
  if (!row) continue;
  const perSlot = row.dps / 16;
  console.log(`  웨이브 ${String(w).padStart(2)}  슬롯당 ${fmt(perSlot)} DPS` +
    (RPD.WaveData.isBossWave(w, mode) ? '  (보스)' : ''));
}
console.log('  → 커먼 3단 각성이 이 값을 혼자 못 내야 정상이다. 시너지·버퍼가 나머지를 메운다.');

if (warnings.length) {
  warnings.forEach(w => console.log('  주의  ' + w));
} else {
  console.log('  급격한 난이도 점프 없음');
}
console.log('');
