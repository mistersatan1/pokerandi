/* craftshots.js — 리디자인 ③(세션 87) 조합 성공 · 소환 템포 캡처. 테스트판(dist)을 실제 크로미움으로 띄워 PC · 갤럭시 S24 세로로 찍는다.
 *   (a) 특별함 조합 0.15초 — 재료 칸에서 결과 칸으로 빛이 모이는 중
 *   (b) 같은 조합 0.5초 — 결과 칸에서 터짐 · 처음 만든 조합이면 결과 칸 옆 카드
 *   (c) 전설 조합 0.5초 — 등급에 비례한 더 큰 터짐
 *   (d) 특별함 소환 0.3초 — 화면 가운데 카드 없이 칸 위에서 짧게
 *   (e) 결과가 창고로 간 조합 0.5초
 * 캡처: dist/31_craft_{a_converge|b_pop|c_legend|d_summon|e_storage}_{pc|portrait}.png. OUT_TAG=before 면 이름 끝에 _before.
 * 단독 실행 · screenshot.js 에서 run(browser). 먼저 npm run build. */
const fs = require('fs'), path = require('path');
let playwright;
try { playwright = require('playwright'); } catch (e) { playwright = require('/home/claude/.npm-global/lib/node_modules/playwright'); }
const { chromium, devices } = playwright;
const SANDBOX_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync(SANDBOX_CHROME) ? SANDBOX_CHROME : undefined);
const URL = 'file://' + path.join(__dirname, '..', 'dist') + '/' + encodeURIComponent('포켓몬랜덤디펜스_테스트.html');
const TAG = process.env.OUT_TAG ? '_' + process.env.OUT_TAG : '';
const OUT = n => path.join(__dirname, '..', 'dist', n + TAG + '.png');

function prep() {
  const R = window.RPD;
  if (R.TutorialManager && R.TutorialManager.skip) R.TutorialManager.skip();
  if (R.SaveManager && R.SaveManager.data) R.SaveManager.data.settings.cheerTipShown = true;
  document.querySelectorAll('.modepick, .result, .help, .book').forEach(o => o.hidden = true);
  R.Game.resetAll('NORMAL', 'NORMAL'); R.Game.startRun('NORMAL', 'NORMAL');
  R.GameManager.setWave(40);
  const F = R.FieldManager;
  F.slots.forEach(x => { if (x.unit) F.remove(x.index); });
  R.StorageManager.reset();
  R.RecipeManager.discovered = {};
  R.GameManager.life = 60; R.GameManager.gold = 500;
  if (R.FxRenderer) R.FxRenderer.reset();
  R.UnitManager.recomputeAll(); R.bus.emit('field:changed', {});
  R.Loop.setPaused(false);
}

/* 결과 등급 t 인 조합식 하나를 골라 재료를 필드에 흩어 두고(storeN 개는 창고에) 조합한다 */
function craftOf(opt) {
  const R = window.RPD, F = R.FieldManager, PD = R.PokemonData;
  const r = R.RecipeData.list.find(x => PD.get(x.id).tier === opt.tier && !PD.get(x.id).hidden && x.materials.every(m => !PD.get(m).hidden && m !== 'ditto'));
  const open = F.slots.filter(s => s.unlocked && s.zone !== 'cheer');
  const spread = [0, 6, 12, 18, 3, 9].map(i => open[i % open.length]);
  r.materials.forEach((m, i) => {
    const u = R.UnitManager.create(m);
    if (i < (opt.storeN || 0)) R.StorageManager.add(u); else F.place(spread[i].index, u);
  });
  if (opt.fillField) open.forEach(s => { if (!s.unit) F.place(s.index, R.UnitManager.create('rattata')); });
  R.UnitManager.recomputeAll();
  const res = R.RecipeManager.craft(r.id);
  return { id: r.id, ok: res.ok, reason: res.reason, slot: res.unit ? res.unit.slotIndex : null };
}

async function run(browser) {
  const problems = [], report = {};
  for (const mode of ['pc', 'portrait']) {
    const bad = w => problems.push(mode + ': ' + w);
    const ctx = await browser.newContext(mode === 'pc' ? { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } : { ...devices['Galaxy S24'], defaultBrowserType: undefined });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.goto(URL); await p.waitForTimeout(1000);
    const shot = n => p.screenshot({ path: OUT('31_craft_' + n + '_' + mode) });
    const pause = () => p.evaluate(() => window.RPD.Loop.setPaused(true));
    const reveal = () => p.evaluate(() => { const n = document.getElementById('summonReveal'); return n ? n.classList.contains('is-on') : null; });
    const r = {};

    await p.evaluate(prep); await p.waitForTimeout(1800);
    r.a = await p.evaluate(craftOf, { tier: 'T3' });
    await p.waitForTimeout(150); await pause(); await shot('a_converge');

    await p.evaluate(prep); await p.waitForTimeout(1800);
    r.b = await p.evaluate(craftOf, { tier: 'T3' });
    await p.waitForTimeout(500); await pause(); r.bReveal = await reveal(); await shot('b_pop');

    await p.evaluate(prep); await p.waitForTimeout(1800);
    r.c = await p.evaluate(craftOf, { tier: 'T5' });
    await p.waitForTimeout(500); await pause(); r.cReveal = await reveal(); await shot('c_legend');

    await p.evaluate(prep); await p.waitForTimeout(1800);
    r.d = await p.evaluate(() => {
      const R = window.RPD, PD = R.PokemonData;
      const def = PD.list.find(d => d.tier === 'T3' && d.summon && !d.hidden);
      const u = R.UnitManager.create(def.id);
      R.SummonManager.autoPlace(u); R.UnitManager.recomputeAll();
      R.bus.emit('summon:result', { ok: true, unit: u, tier: 'T3', cost: 0, ticket: false, toStorage: false });
      return def.id;
    });
    await p.waitForTimeout(300); await pause(); r.dReveal = await reveal(); await shot('d_summon');

    await p.evaluate(prep); await p.waitForTimeout(1800);
    r.e = await p.evaluate(craftOf, { tier: 'T3', storeN: 9, fillField: true });
    await p.waitForTimeout(500); await pause(); await shot('e_storage');

    report[mode] = r;
    ['a', 'b', 'c', 'e'].forEach(k => { if (!r[k] || !r[k].ok) bad('(' + k + ') 조합 실패 ' + JSON.stringify(r[k])); });
    if (errs.length) bad('페이지 오류 ' + errs[0]);
    await ctx.close();
  }
  return { report, problems };
}

module.exports = { run };

if (require.main === module) {
  (async () => {
    const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
    const r = await run(browser);
    console.log('craft', JSON.stringify(r.report));
    console.log('craft problems', JSON.stringify(r.problems));
    await browser.close();
    if (r.problems.length) process.exitCode = 1;
  })();
}
