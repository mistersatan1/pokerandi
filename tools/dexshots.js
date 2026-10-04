/* dexshots.js — 도감 보상 세분화 · 창고 확장(세션 97) 캡처. 테스트판(dist)을 실제 크로미움으로 띄워 도감 등록 수를 바꿔 가며 찍는다.
 *   도감 창(보상 합계 · 단계 수 · 다음 보상) · 오른쪽 도감 미니 패널 · 보유 창 "창고 0/N"
 *   도감 0종 · 42종 · 151종(전부) — PC, 그리고 42종을 휴대폰 세로로
 * 캡처: dist/39_dex_{0|42|151}_pc.png · 39_dex_42_portrait.png. OUT_TAG=before 면 이름 끝에 _before.
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

function prep(n) {
  const R = window.RPD;
  if (R.TutorialManager && R.TutorialManager.skip) R.TutorialManager.skip();
  if (R.SaveManager && R.SaveManager.data) R.SaveManager.data.settings.cheerTipShown = true;
  document.querySelectorAll('.modepick, .result, .help, .book').forEach(o => o.hidden = true);
  const dex = {};
  R.PokemonData.list.slice(0, n).forEach(d => { dex[d.id] = { seen: 1 }; });
  R.SaveManager.data.pokedex = dex;
  R.Game.resetAll('NORMAL', 'NORMAL'); R.Game.startRun('NORMAL', 'NORMAL');
  R.Loop.setPaused(true);
  R.bus.emit('dex:changed', {}); R.bus.emit('storage:changed', R.StorageManager.units);
  return { cap: R.StorageManager.capacity, dex: R.SaveManager.dexCount(), shards: R.ShardManager.shards, gold: R.GameManager.gold };
}

async function run(browser) {
  const problems = [], report = {};
  const jobs = [['pc', 0], ['pc', 42], ['pc', 151], ['portrait', 42]];
  for (const [mode, n] of jobs) {
    const ctx = await browser.newContext(mode === 'pc' ? { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } : { ...devices['Galaxy S24'], defaultBrowserType: undefined });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.goto(URL); await p.waitForTimeout(1000);
    const r = await p.evaluate(prep, n);
    // 도감 창 열기(PC 는 [전체 도감 보기] · 휴대폰은 더보기 메뉴의 도감 대신 같은 버튼을 직접 누른다)
    await p.evaluate(() => { const b = document.getElementById('btnDex') || document.getElementById('btnDexOpen'); if (b) b.click(); });
    await p.waitForTimeout(500);
    r.bonus = await p.evaluate(() => [...document.querySelectorAll('#dexBonus .dex__bonusRow')].map(x => x.textContent.replace(/\s+/g, ' ').trim()));
    await p.screenshot({ path: OUT('39_dex_' + n + '_' + mode) });
    report[mode + ':' + n] = r;
    const want = { 0: 48, 42: 56, 151: 72 }[n];
    if (!TAG && r.cap !== want) problems.push(mode + ' ' + n + '종 창고 ' + r.cap + ' (기대 ' + want + ')');
    if (errs.length) problems.push(mode + ': 페이지 오류 ' + errs[0]);
    await ctx.close();
  }
  return { report, problems };
}

module.exports = { run };

if (require.main === module) {
  (async () => {
    const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
    const r = await run(browser);
    console.log('dex', JSON.stringify(r.report));
    console.log('dex problems', JSON.stringify(r.problems));
    await browser.close();
    if (r.problems.length) process.exitCode = 1;
  })();
}
