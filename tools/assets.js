/* assets.js — 이미지 에셋 점검.
 * 실행: node tools/assets.js          현황 표
 *       node tools/assets.js --write  assets/MANIFEST.md 생성
 *
 * 게임은 이미지가 하나도 없어도 끝까지 돌아간다(placeholder 로 대체).
 * 이 도구는 "넣으면 자동으로 반영되는 파일 목록"을 알려 주는 용도다.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const WRITE = process.argv.includes('--write');

const sandbox = { console, addEventListener: () => {} };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

[
  'js/core/RPD.js', 'js/core/Utils.js', 'js/core/EventBus.js', 'js/core/PathFollower.js',
  'js/data/types.js', 'js/data/map.js', 'js/data/tiers.js', 'js/data/pokemon.js',
  'js/data/enemies.js'
].forEach(rel => {
  vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), sandbox, { filename: rel });
});

const RPD = sandbox.RPD;
const PD = RPD.PokemonData;
const ED = RPD.EnemyData;

/* 필요한 파일을 모은다 */
const wanted = [];

for (const tier of RPD.TIER_ORDER) {
  const ids = PD.all().filter(id => PD.byId[id].tier === tier);
  for (const id of ids) {
    const d = PD.byId[id];
    wanted.push({
      group: RPD.Tiers[tier].label,
      sort: RPD.TIER_ORDER.indexOf(tier),
      file: d.sprite,
      name: d.name,
      note: `${d.stage}단계 · ${(d.types || []).map(t => RPD.Types[t].label).join('/')} · ${d.roleLabel}`
    });
  }
}

for (const id of ED.list) {
  const d = ED[id];
  wanted.push({
    group: d.isBoss ? '보스' : '적',
    sort: d.isBoss ? 98 : 97,
    file: d.sprite,
    name: d.name,
    note: d.role
  });
}

wanted.sort((a, b) => a.sort - b.sort || a.file.localeCompare(b.file));

/* 중복 경로가 있으면 한쪽이 다른 쪽 그림으로 덮인다 */
const seen = {};
const dupes = [];
for (const w of wanted) {
  if (seen[w.file]) dupes.push(`${w.file} (${seen[w.file]} / ${w.name})`);
  seen[w.file] = w.name;
}

const present = wanted.filter(w => fs.existsSync(path.join(ROOT, w.file)));
const missing = wanted.filter(w => !fs.existsSync(path.join(ROOT, w.file)));

/* 폴더에 있지만 아무도 안 쓰는 파일 */
const stray = [];
for (const dir of ['assets/pokemon', 'assets/enemies']) {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) continue;
  for (const f of fs.readdirSync(full)) {
    if (!/\.(png|jpg|jpeg|webp|gif)$/i.test(f)) continue;
    const rel = `${dir}/${f}`;
    if (!seen[rel]) stray.push(rel);
  }
}

/* ---------- 출력 ---------- */

console.log(`\n필요한 이미지 ${wanted.length}개 · 있음 ${present.length} · 없음 ${missing.length}`);

const byGroup = {};
wanted.forEach(w => {
  byGroup[w.group] = byGroup[w.group] || { total: 0, have: 0 };
  byGroup[w.group].total += 1;
  if (fs.existsSync(path.join(ROOT, w.file))) byGroup[w.group].have += 1;
});

console.log('\n분류      보유 / 필요');
console.log('─'.repeat(34));
for (const g of Object.keys(byGroup)) {
  const { have, total } = byGroup[g];
  const pct = total ? Math.round(have / total * 20) : 0;
  console.log(`${g.padEnd(8)} ${String(have).padStart(4)} / ${String(total).padStart(4)}  ` +
    '█'.repeat(pct) + '░'.repeat(20 - pct));
}

if (dupes.length) {
  console.log('\n주의  같은 파일을 두 개체가 함께 쓴다 (한쪽 그림으로 덮인다):');
  dupes.forEach(d => console.log('  ' + d));
}

if (stray.length) {
  console.log('\n주의  폴더에 있지만 어떤 개체도 참조하지 않는 파일:');
  stray.forEach(f => console.log('  ' + f));
  console.log('  → 파일명이 개체 id 와 다를 수 있다. MANIFEST.md 의 이름과 맞춰라.');
}

if (missing.length && missing.length <= 12) {
  console.log('\n아직 없는 파일:');
  missing.forEach(m => console.log(`  ${m.file}  (${m.name})`));
} else if (missing.length) {
  console.log(`\n아직 없는 파일 ${missing.length}개 — 전체 목록은 assets/MANIFEST.md`);
}

console.log('\n이미지가 없어도 게임은 정상 동작한다. 타입 색상 원형 placeholder 로 그려진다.\n');

/* ---------- 매니페스트 ---------- */

if (WRITE) {
  const lines = [
    '# 이미지 에셋 목록',
    '',
    '`node tools/assets.js` 로 현황을 다시 확인할 수 있다.',
    '',
    '## 규격',
    '',
    '| 항목 | 값 |',
    '|---|---|',
    '| 포맷 | PNG (투명 배경) |',
    '| 포켓몬 | 96×96 권장 |',
    '| 적 | 64×64 권장 |',
    '| 보스 | 128×128 권장 |',
    '',
    '렌더러가 `imageSmoothingEnabled = false` 로 그리므로 픽셀 아트가 뭉개지지 않는다.',
    '정사각형이 아니어도 동작하지만, 중심을 기준으로 정사각형에 맞춰 늘어난다.',
    '',
    '파일이 없으면 타입 색상 원 + 이름 첫 글자로 대체된다. **없어도 게임은 끝까지 돌아간다.**',
    '',
    `## 필요한 파일 (${wanted.length}개)`,
    ''
  ];

  let current = null;
  for (const w of wanted) {
    if (w.group !== current) {
      current = w.group;
      lines.push('', `### ${current}`, '', '| 파일 | 이름 | 비고 |', '|---|---|---|');
    }
    lines.push(`| \`${w.file}\` | ${w.name} | ${w.note} |`);
  }

  fs.writeFileSync(path.join(ROOT, 'assets/MANIFEST.md'), lines.join('\n') + '\n');
  console.log('assets/MANIFEST.md 생성 완료');
}
