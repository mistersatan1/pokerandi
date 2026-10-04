/* shopshots.js — 조각 상점(세션 93) 캡처. 테스트판(dist)을 실제 크로미움으로 띄워 PC · 갤럭시 S24 세로(시트 절반)로 찍는다.
 *   (a) 조각 상점 탭 — 등급 순 · 등급 머리 줄 · 검색칸
 *   (b) 검색 "ㄹㅈ"(초성 — 리자드 · 리자몽) 친 상태
 *   (c) 조합식 창(슬리프) — 모자란 재료를 조각으로 사는 줄(세션 95) · (d) 하나 산 뒤 그 자리에서 다시 그린 창
 * 캡처: dist/36_shop_{a_list|b_search|c_pop|d_bought}_{pc|portrait}.png. OUT_TAG=before 면 이름 끝에 _before.
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
  document.querySelectorAll('.modepick, .result, .help, .book').forEach(n => n.hidden = true);
  R.Game.resetAll('NORMAL', 'NORMAL'); R.Game.startRun('NORMAL', 'NORMAL');
  R.GameManager.setWave(40);
  R.ShardManager.reset(); R.ShardManager.add(60, 'shot');
  const F = R.FieldManager, open = F.slots.filter(s => s.unlocked && s.zone !== 'cheer');
  ['charmander', 'squirtle', 'pidgey', 'charmeleon'].forEach((id, i) => F.place(open[i].index, R.UnitManager.create(id)));
  R.UnitManager.recomputeAll(); R.bus.emit('field:changed', {}); R.RecipeManager.refresh();
  if (window.innerWidth < 1100) R.HudPanels.setDrawer('recipes');
  const tab = document.querySelector('#recipeFilter .rf[data-filter="shards"]');
  if (tab) tab.click();
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
    await p.evaluate(prep); await p.waitForTimeout(2600);   // 라운드 배너가 지나가게
    await p.evaluate(() => window.RPD.Loop.setPaused(true));
    const probe = () => p.evaluate(() => {
      const box = document.getElementById('shardSearch');
      const vis = box ? box.getBoundingClientRect() : null;
      return { search: !!box && vis.height > 0, groups: [...document.querySelectorAll('#recipeList .shopgroup b')].map(n => n.textContent),
        rows: document.querySelectorAll('#recipeList .shoprow').length };
    });
    const a = await probe();
    await p.screenshot({ path: OUT('36_shop_a_list_' + mode) });
    let b = null;
    if (a.search) {
      await p.click('#shardSearch'); await p.keyboard.type('ㄹㅈ'); await p.waitForTimeout(250);
      b = await probe();
      b.focused = await p.evaluate(() => document.activeElement && document.activeElement.id);
      await p.screenshot({ path: OUT('36_shop_b_search_' + mode) });
    }
    // (c) 조합식 창 — 모자란 재료를 그 자리에서 조각으로(세션 95). 리자드(파이리 ×2 — 하나 있음) · 슬리프(캐이시 + 고오스 — 둘 다 없음)
    await p.evaluate(() => {
      const R = window.RPD;
      R.Loop.setPaused(true);
      R.ShardManager.add(40, 'shot');
      // setDrawer 는 같은 탭이면 닫는다(토글) — 이미 열려 있으면 그대로 둔다
      if (window.innerWidth < 1100 && document.body.getAttribute('data-mtab') !== 'recipes') R.HudPanels.setDrawer('recipes');
      document.querySelector('#recipeFilter .rf[data-filter="all"]').click();
      R.UIManager.openRecipePop('drowzee');
    });
    await p.waitForTimeout(300);
    const c = await p.evaluate(() => ({ chips: document.querySelectorAll('#recipePop .rp__buy').length, all: !!document.querySelector('#recipePop .rp__buyAll') }));
    await p.screenshot({ path: OUT('36_shop_c_pop_' + mode) });
    let d = null;
    if (c.chips) {
      await p.click('#recipePop .rp__buy.is-ok'); await p.waitForTimeout(300);
      d = await p.evaluate(() => ({ chips: document.querySelectorAll('#recipePop .rp__buy').length, open: !document.getElementById('recipePop').hidden }));
      await p.screenshot({ path: OUT('36_shop_d_bought_' + mode) });
    }
    report[mode] = { a, b, c, d };
    if (!TAG && (!c.chips || !d || d.chips >= c.chips || !d.open)) bad('조합식 창 조각 사기 ' + JSON.stringify({ c, d }));
    if (!TAG) {
      if (!a.search) bad('검색칸이 안 보인다');
      if (b && (b.rows >= a.rows || b.focused !== 'shardSearch')) bad('검색이 안 줄였거나 초점이 빠졌다 ' + JSON.stringify(b));
    }
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
    console.log('shop', JSON.stringify(r.report));
    console.log('shop problems', JSON.stringify(r.problems));
    await browser.close();
    if (r.problems.length) process.exitCode = 1;
  })();
}
