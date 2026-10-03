/* recipeshots.js — 리디자인 ⑤(세션 89) 조합식 줄 캡처. 테스트판(dist)을 실제 크로미움으로 띄워 PC · 갤럭시 S24 세로로 찍는다.
 *   (a) 중반 보드 — 조합식 목록(모자란 재료 · 진행 칸 · 완성 가능 줄 · 맨 위 다음 목표)
 *   (b) 완성 안 된 줄을 가리킨(PC) · 누른(세로) 순간 — 필드의 재료 칸이 반짝인다
 * 캡처: dist/33_recipe_{a_list|b_hint}_{pc|portrait}.png. OUT_TAG=before 면 이름 끝에 _before.
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

/* 필드 10 · 창고 4 — 특별함 · 희귀함 조합식 몇 줄이 1~2 재료 모자라고, 한 줄은 완성 가능 */
const FIELD = ['charmander', 'squirtle', 'bulbasaur', 'pidgey', 'rattata', 'pikachu', 'geodude', 'abra', 'gastly', 'machop'];
const STORE = ['caterpie', 'weedle', 'oddish', 'zubat'];
function prep(o) {
  const R = window.RPD;
  if (R.TutorialManager && R.TutorialManager.skip) R.TutorialManager.skip();
  if (R.SaveManager && R.SaveManager.data) R.SaveManager.data.settings.cheerTipShown = true;
  document.querySelectorAll('.modepick, .result, .help, .book').forEach(n => n.hidden = true);
  R.Game.resetAll('NORMAL', 'NORMAL'); R.Game.startRun('NORMAL', 'NORMAL');
  R.GameManager.setWave(30);
  const F = R.FieldManager;
  F.slots.forEach(x => { if (x.unit) F.remove(x.index); });
  R.StorageManager.reset();
  const open = F.slots.filter(s => s.unlocked && s.zone !== 'cheer');
  o.field.forEach((id, i) => F.place(open[i].index, R.UnitManager.create(id)));
  o.store.forEach(id => R.StorageManager.add(R.UnitManager.create(id)));
  R.UnitManager.recomputeAll(); R.bus.emit('field:changed', {});
  // 다음 목표 — 게임에선 라운드 끝 · 조합 뒤 쉴 때 고른다. 캡처는 바로
  if (R.LegendAdvisor) { R.LegendAdvisor.invalidate(); R.LegendAdvisor.compute(); }
  if (R.LegendAdvisorUI && R.LegendAdvisorUI.renderGoal) R.LegendAdvisorUI.renderGoal();
  if (R.FxRenderer) R.FxRenderer.reset();
  R.Loop.setPaused(false);
  if (window.innerWidth < 1100) R.HudPanels.setDrawer('recipes');
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
    const shot = n => p.screenshot({ path: OUT('33_recipe_' + n + '_' + mode) });

    await p.evaluate(prep, { field: FIELD, store: STORE });
    await p.waitForTimeout(1500);
    const a = await p.evaluate(() => {
      const rows = [...document.querySelectorAll('#recipeList .rrow')];
      return { rows: rows.length, ready: rows.filter(r => r.classList.contains('is-ready')).length,
        goal: document.getElementById('btnLegend').textContent.replace(/\s+/g, ' ').trim() };
    });
    await p.evaluate(() => window.RPD.Loop.setPaused(true));
    await shot('a_list');

    // (b) 재료가 필드에 있는 미완성 줄 — PC 는 가리키기, 세로는 누르기
    await p.evaluate(() => window.RPD.Loop.setPaused(false));
    const sel = await p.evaluate(() => {
      const rows = [...document.querySelectorAll('#recipeList .rrow:not(.is-ready):not(.rrow--spell)')];
      const R = window.RPD;
      const fieldHits = x => {   // 이 줄의 재료 중 조합 때 필드 칸에서 쓰일 수
        const rc = R.RecipeData.byRouteKey(x.dataset.key) || R.RecipeData.routesOf(x.dataset.key)[0];
        return rc ? R.RecipeManager.locate(rc.materials.filter(id => !R.UI.isSecret(id))).filter(m => m && m.where === 'field').length : 0;
      };
      const r = rows.find(x => x.querySelector('.rmat.is-missing') && fieldHits(x) >= 2) || rows.find(x => fieldHits(x) >= 1);
      if (!r) return null;
      r.scrollIntoView({ block: 'center' });
      r.setAttribute('data-shot', '1');
      return r.dataset.key;
    });
    if (!sel) bad('(b) 재료 일부만 있는 줄이 없다');
    else if (mode === 'pc') await p.hover('#recipeList .rrow[data-shot="1"] .rrow__arrow');
    else await p.click('#recipeList .rrow[data-shot="1"] .rrow__arrow');
    await p.waitForTimeout(350);
    await p.evaluate(() => window.RPD.Loop.setPaused(true));
    const b = await p.evaluate(() => window.RPD.MatHint ? window.RPD.MatHint.slots().length : -1);
    await shot('b_hint');

    report[mode] = { a, sel, b };
    if (sel && b < 1) bad('(b) 가리켜도 필드 재료 칸이 안 반짝인다');
    if (!/다음 목표/.test(a.goal)) bad('(a) 다음 목표 줄이 없다 ' + a.goal);
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
    console.log('recipe', JSON.stringify(r.report));
    console.log('recipe problems', JSON.stringify(r.problems));
    await browser.close();
    if (r.problems.length) process.exitCode = 1;
  })();
}
