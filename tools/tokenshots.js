/* tokenshots.js — 리디자인 ⑥(세션 90) 토큰 정리 캡처. 테스트판(dist)을 실제 크로미움으로 띄워 화면 전체를 찍는다.
 *   같은 중반 보드(30R · 필드 10 · 창고 4 · 시너지 몇 개 · 조합 가능 몇 줄)를 네 화면에서:
 *   PC 1440×900 · PC 1920×1080 · 갤럭시 S24 세로(조합식 시트 절반) · 갤럭시 S24 가로
 * 캡처: dist/34_token_{pc|pcwide|portrait|landscape}.png. OUT_TAG=before 면 이름 끝에 _before.
 * 함께 잰다: PC 조합식 목록에 보이는 줄 수 · 필드 캔버스 화면 크기(독 높이를 바꿔도 필드가 너무 줄지 않는지).
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

const FIELD = ['charmander', 'vulpix', 'squirtle', 'bulbasaur', 'pidgey', 'rattata', 'pikachu', 'geodude', 'abra', 'gastly'];
const STORE = ['caterpie', 'weedle', 'oddish', 'zubat'];
function prep(o) {
  const R = window.RPD;
  if (R.TutorialManager && R.TutorialManager.skip) R.TutorialManager.skip();
  if (R.SaveManager && R.SaveManager.data) R.SaveManager.data.settings.cheerTipShown = true;
  document.querySelectorAll('.modepick, .result, .help, .book').forEach(n => n.hidden = true);
  R.Game.resetAll('NORMAL', 'NORMAL'); R.Game.startRun('NORMAL', 'NORMAL');
  R.GameManager.setWave(30); R.GameManager.gold = 1240; R.GameManager.life = 47;
  const F = R.FieldManager;
  F.slots.forEach(x => { if (x.unit) F.remove(x.index); });
  R.StorageManager.reset();
  const open = F.slots.filter(s => s.unlocked && s.zone !== 'cheer');
  o.field.forEach((id, i) => F.place(open[i].index, R.UnitManager.create(id)));
  o.store.forEach(id => R.StorageManager.add(R.UnitManager.create(id)));
  R.UnitManager.recomputeAll(); R.bus.emit('field:changed', {});
  if (R.LegendAdvisor) { R.LegendAdvisor.invalidate(); R.LegendAdvisor.compute(); }
  if (R.LegendAdvisorUI && R.LegendAdvisorUI.renderGoal) R.LegendAdvisorUI.renderGoal();
  if (R.FxRenderer) R.FxRenderer.reset();
  R.Loop.setPaused(false);
  if (window.innerWidth < 1100) R.HudPanels.setDrawer('recipes');
}

const SCREENS = {
  pc: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  pcwide: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
  portrait: () => ({ ...devices['Galaxy S24'], defaultBrowserType: undefined }),
  landscape: () => ({ ...devices['Galaxy S24 landscape'], defaultBrowserType: undefined }),
};

async function run(browser) {
  const problems = [], report = {};
  for (const mode of Object.keys(SCREENS)) {
    const bad = w => problems.push(mode + ': ' + w);
    const opt = typeof SCREENS[mode] === 'function' ? SCREENS[mode]() : SCREENS[mode];
    const ctx = await browser.newContext(opt);
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.goto(URL); await p.waitForTimeout(1000);
    await p.evaluate(prep, { field: FIELD, store: STORE });
    await p.waitForTimeout(1500);
    await p.evaluate(() => window.RPD.Loop.setPaused(true));
    const m = await p.evaluate(() => {
      // 보이는 범위 = 목록 · 조합식 패널 · 화면이 겹치는 곳(휴대폰은 패널 통째로 스크롤된다)
      const list = document.getElementById('recipeList'), a = list.getBoundingClientRect(), b = document.querySelector('.pane--recipes').getBoundingClientRect();
      const lr = { top: Math.max(a.top, b.top, 0), bottom: Math.min(a.bottom, b.bottom, window.innerHeight) };
      lr.height = Math.max(0, lr.bottom - lr.top);
      const rows = [...list.querySelectorAll('.rrow')].map(r => r.getBoundingClientRect());
      const full = rows.filter(r => r.top >= lr.top - 1 && r.bottom <= lr.bottom + 1).length;
      const cv = document.querySelector('canvas'), cr = cv.getBoundingClientRect();
      return { recipeRowsVisible: full, listH: Math.round(lr.height), field: Math.round(cr.width) + 'x' + Math.round(cr.height),
        hscroll: document.documentElement.scrollWidth > window.innerWidth + 1 };
    });
    await p.screenshot({ path: OUT('34_token_' + mode) });
    report[mode] = m;
    if (m.hscroll) bad('가로 스크롤');
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
    console.log('token', JSON.stringify(r.report));
    console.log('token problems', JSON.stringify(r.problems));
    await browser.close();
    if (r.problems.length) process.exitCode = 1;
  })();
}
