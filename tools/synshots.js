/* synshots.js — 리디자인 ④(세션 88) 시너지 패널 캡처. 테스트판(dist)을 실제 크로미움으로 띄워 PC · 갤럭시 S24 세로로 찍는다.
 *   (a) 중반 보드 — 켜진 시너지 몇 개 · "1종 더" 몇 개 · 나머지 0종(패널 전체가 한 화면에 들어오는지)
 *   (b) 한 시너지가 켜지는 순간 — 패널 메달 맥동 · 필드의 기여 포켓몬 칸에 타입 색 링
 *   (c) 메달(0종)을 눌러 펼친 상태 — 단계표
 * 캡처: dist/32_syn_{a_panel|b_activate|c_open}_{pc|portrait}.png. OUT_TAG=before 면 이름 끝에 _before.
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

/* 불꽃 2(켜짐) · 물 2(켜짐) · 비행 1(1종 더) · 독 1 · 벌레 1 · 노말 1 */
const BOARD = ['charmander', 'vulpix', 'squirtle', 'psyduck', 'pidgey', 'ekans', 'caterpie', 'rattata'];
function prep(ids) {
  const R = window.RPD;
  if (R.TutorialManager && R.TutorialManager.skip) R.TutorialManager.skip();
  if (R.SaveManager && R.SaveManager.data) R.SaveManager.data.settings.cheerTipShown = true;
  document.querySelectorAll('.modepick, .result, .help, .book').forEach(o => o.hidden = true);
  R.Game.resetAll('NORMAL', 'NORMAL'); R.Game.startRun('NORMAL', 'NORMAL');
  R.GameManager.setWave(18);
  const F = R.FieldManager;
  F.slots.forEach(x => { if (x.unit) F.remove(x.index); });
  R.StorageManager.reset();
  const open = F.slots.filter(s => s.unlocked && s.zone !== 'cheer');
  ids.forEach((id, i) => F.place(open[i].index, R.UnitManager.create(id)));
  R.UnitManager.recomputeAll(); R.bus.emit('field:changed', {});
  if (R.FxRenderer) R.FxRenderer.reset();
  R.Loop.setPaused(false);
  if (window.innerWidth < 1100) R.HudPanels.setDrawer('synergy');
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
    const shot = n => p.screenshot({ path: OUT('32_syn_' + n + '_' + mode) });
    const probe = () => p.evaluate(() => {
      const body = document.getElementById('synergyBody'), r = body.getBoundingClientRect();
      const rows = [...body.querySelectorAll('.synrow')];
      const fly = body.querySelector('.synrow[data-type="FLYING"]');
      return { rows: rows.length, overflow: body.scrollHeight > body.clientHeight + 2, h: Math.round(r.height), scrollH: body.scrollHeight,
        fly: fly ? fly.textContent.replace(/\s+/g, ' ').trim() : '', groups: [...body.querySelectorAll('.syngroup__hd')].map(n => n.textContent.trim()) };
    });

    await p.evaluate(prep, BOARD);
    await p.waitForTimeout(1800);
    await p.evaluate(() => window.RPD.Loop.setPaused(true));
    const a = await probe();
    await shot('a_panel');

    // (b) 비행을 켠다 — 피죤 추가
    await p.evaluate(() => {
      const R = window.RPD, F = R.FieldManager;
      R.Loop.setPaused(false);
      const s = F.slots.find(x => x.unlocked && x.zone !== 'cheer' && !x.unit);
      F.place(s.index, R.UnitManager.create('pidgeotto')); R.UnitManager.recomputeAll(); R.bus.emit('field:changed', {});
    });
    await p.waitForTimeout(250);
    await p.evaluate(() => window.RPD.Loop.setPaused(true));
    const b = await probe();
    await shot('b_activate');

    // (c) 0종 메달 하나(얼음)를 눌러 펼친다
    await p.evaluate(() => { const n = document.querySelector('#synergyBody .synrow[data-type="ICE"]'); if (n) n.click(); });
    await p.waitForTimeout(250);
    const c = await p.evaluate(() => !!document.querySelector('#synergyBody .synrow[data-type="ICE"] .syndetail'));
    await shot('c_open');

    report[mode] = { a, b, c };
    if (!c) bad('(c) 얼음을 눌러도 단계표가 안 펼쳐진다');
    if (!/비행/.test(b.fly)) bad('(b) 비행 줄 ' + b.fly);
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
    console.log('syn', JSON.stringify(r.report));
    console.log('syn problems', JSON.stringify(r.problems));
    await browser.close();
    if (r.problems.length) process.exitCode = 1;
  })();
}
