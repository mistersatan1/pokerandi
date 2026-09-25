/* tierpower.js — 등급별 전투력 · 조합 비용 점검 (세션 33).
 *   node tools/tierpower.js           요약
 *   node tools/tierpower.js --all     종별 전부
 * 전투력 = 빈 필드에 혼자 놓았을 때의 표시 DPS(시너지·버프 없음). 조합 비용 = 흔함 환산(가장 싼 경로, 주문 포함). */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const sb = { console, addEventListener() {}, requestAnimationFrame: () => 0, performance: { now: () => 0 },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
sb.window = sb; sb.globalThis = sb; vm.createContext(sb);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
[...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1])
  .filter(f => f.indexOf('js/ui/') < 0 && f.indexOf('js/render/') < 0 && f !== 'js/main.js')
  .forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sb, { filename: f }));
const R = sb.RPD, PD = R.PokemonData, RD = R.RecipeData, SD = R.SpellData;
['FieldManager', 'EconomyManager', 'UnitManager', 'SkillManager', 'TraitManager'].forEach(k => R[k] && R[k].init && R[k].init());
R.GameManager.reset('NORMAL');

const byResult = {}; SD.list.forEach(s => { byResult[s.result] = s; });
const memo = {};
function cost(id) {
  if (memo[id] != null) return memo[id];
  const d = PD.get(id);
  if (d.tier === 'T1') return (memo[id] = 1);
  const routes = RD.routesOf(id).map(r => r.materials);
  if (byResult[id]) routes.push(byResult[id].materials);
  memo[id] = Infinity;
  return (memo[id] = Math.min(...routes.map(ms => ms.reduce((a, m) => a + cost(m), 0))));
}
function dpsOf(id) {
  R.FieldManager.init();
  const u = R.UnitManager.create(id);
  R.FieldManager.place(0, u); R.UnitManager.recomputeAll();
  return u.dps;
}
const rows = PD.list.filter(d => !d.form).map(d => ({
  id: d.id, name: d.name, tier: d.tier, hidden: !!d.hidden, summon: !!d.summon,
  how: d.hidden ? '히든' : d.summon ? '소환' : (d.tier === 'T6' ? '주문' : '조합'), cost: cost(d.id), dps: dpsOf(d.id),
  mul: (R.CraftPower ? R.CraftPower.mulOf(d) : 1)
}));
const L = { T1: '흔함', T2: '안흔함', T3: '특별함', T4: '희귀함', T5: '전설', T6: '불멸' };
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
console.log('\n등급 · 얻는 법별 평균 (DPS 는 혼자 있을 때 표시값)\n');
console.log('등급    얻는법  종수  평균 흔함환산  평균 DPS    히든÷일반조합');
for (const t of ['T1', 'T2', 'T3', 'T4', 'T5', 'T6']) {
  const craft = rows.filter(r => r.tier === t && r.how === '조합');
  for (const how of ['소환', '조합', '히든', '주문']) {
    const g = rows.filter(r => r.tier === t && r.how === how);
    if (!g.length) continue;
    const ratio = how === '히든' && craft.length ? (avg(g.map(r => r.dps)) / avg(craft.map(r => r.dps))).toFixed(2) + '배' : '';
    console.log(`${(L[t] + '      ').slice(0, 6)}  ${how}    ${String(g.length).padStart(3)}   ${avg(g.map(r => r.cost)).toFixed(1).padStart(8)}     ${Math.round(avg(g.map(r => r.dps))).toString().padStart(8)}    ${ratio}`);
  }
}
// 같은 등급 · 같은 역할끼리 — 비싸게 만든 쪽이 더 센가(역할이 섞이면 감속·제어형이 비교를 흐린다)
console.log('\n같은 등급 · 같은 역할(조합 전용)에서 가장 비싼 것 vs 가장 싼 것');
let ok = 0, bad = 0;
for (const t of ['T2', 'T3', 'T4', 'T5']) {
  const byRole = {};
  rows.filter(r => r.tier === t && r.how === '조합').forEach(r => {
    const role = PD.get(r.id).role; (byRole[role] = byRole[role] || []).push(r);
  });
  for (const role in byRole) {
    const g = byRole[role].sort((a, b) => a.cost - b.cost);
    if (g.length < 2 || g[0].cost === g[g.length - 1].cost) continue;
    const lo = g[0], hi = g[g.length - 1], win = hi.dps > lo.dps;
    win ? ok++ : bad++;
    console.log(`  ${win ? '✓' : '✗'} ${L[t]} ${role.padEnd(12)} ${hi.name}(환산 ${hi.cost} · ×${hi.mul.toFixed(2)}) DPS ${Math.round(hi.dps)}  vs  ${lo.name}(환산 ${lo.cost}) DPS ${Math.round(lo.dps)}`);
  }
}
console.log(`  → 비싼 쪽이 더 센 역할 ${ok} / 반대 ${bad}`);
if (process.argv.includes('--all')) {
  console.log('\n종별');
  rows.sort((a, b) => a.tier.localeCompare(b.tier) || b.dps - a.dps)
    .forEach(r => console.log(`  ${L[r.tier]} ${r.how} ${r.name.padEnd(6)} 환산 ${String(r.cost).padStart(3)}  DPS ${Math.round(r.dps)}  배율 ×${r.mul.toFixed(2)}`));
}
