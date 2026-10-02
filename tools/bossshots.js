/* bossshots.js — 리디자인 ②(세션 86) 보스 등장 연출 캡처. 테스트판(dist)을 실제 크로미움으로 띄워 PC · 갤럭시 S24 세로로 찍는다.
 *   (a) 10R 보스가 나온 지 0.5초 — 가장자리 붉은 맥동 · 입구 경고 · 이름표
 *   (b) 70R 최종 보스가 나온 지 0.7초 — 더 강한 단계("최종 보스")
 *   (c) 연출이 끝난 뒤(2.6초) — 넓어진 체력 줄 · 2페이즈 눈금
 *   (d) 효과 "최소" 0.5초 — 맥동 없이 한 번 옅게
 *   (e) 보스 처치 순간
 * 캡처: dist/30_boss_{a_intro|b_final|c_bar|d_minimal|e_down}_{pc|portrait}.png. OUT_TAG=before 면 이름 끝에 _before.
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

/* 보스 라운드를 열고 보드를 채운 뒤, 보스가 나올 때까지 기다린다(돌려준 값: 보스 이름 · 최종 여부) */
function prep(opt) {
  const R = window.RPD;
  if (R.TutorialManager && R.TutorialManager.skip) R.TutorialManager.skip();
  if (R.SaveManager && R.SaveManager.data) R.SaveManager.data.settings.cheerTipShown = true;
  document.querySelectorAll('.modepick, .result, .help, .book').forEach(o => o.hidden = true);
  R.Game.resetAll('NORMAL', 'NORMAL'); R.Game.startRun('NORMAL', 'NORMAL');
  const F = R.FieldManager;
  F.slots.forEach(x => { if (x.unit) F.remove(x.index); });
  const open = F.slots.filter(s => s.unlocked && s.zone !== 'cheer');
  ['pidgey', 'rattata', 'caterpie', 'weedle'].forEach((id, i) => F.place(open[i].index, R.UnitManager.create(id)));
  R.UnitManager.recomputeAll();
  R.GameManager.life = 60; R.GameManager.gold = 500;
  if (R.Effects) R.Effects.force(opt.fx || null);
  if (R.FxRenderer) R.FxRenderer.reset();
  R.GameManager.setWave(opt.wave - 1);
  R.WaveManager.startRound(opt.wave);
  R.Loop.setPaused(false);
  return new Promise(res => {
    const t0 = performance.now();
    (function wait() {
      const b = R.EnemyManager.boss;
      if (b && b.alive) return res({ name: b.name, wave: R.GameManager.wave, final: !!(R.GameManager.isFinalWave && R.GameManager.isFinalWave(b.wave)) });
      if (performance.now() - t0 > 20000) return res({ name: null });
      setTimeout(wait, 30);
    })();
  });
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
    const shot = n => p.screenshot({ path: OUT('30_boss_' + n + '_' + mode) });
    const probe = () => p.evaluate(() => {
      const n = document.getElementById('bossIntro');
      return n ? { on: n.classList.contains('is-on'), text: n.textContent.replace(/\s+/g, ' ').trim(), banner: document.getElementById('waveBanner').classList.contains('is-on') } : null;
    });

    const a = await p.evaluate(prep, { wave: 10 });
    if (!a.name) bad('(a) 10R 보스가 안 나왔다');
    await p.waitForTimeout(500);
    await p.evaluate(() => window.RPD.Loop.setPaused(true));
    a.dom = await probe();
    await shot('a_intro');

    const b = await p.evaluate(prep, { wave: 70 });
    if (!b.name || !b.final) bad('(b) 70R 최종 보스 ' + JSON.stringify(b));
    await p.waitForTimeout(700);
    await p.evaluate(() => window.RPD.Loop.setPaused(true));
    b.dom = await probe();
    await shot('b_final');

    await p.evaluate(prep, { wave: 10 });
    await p.waitForTimeout(2600);
    await p.evaluate(() => window.RPD.Loop.setPaused(true));
    await shot('c_bar');

    const d = await p.evaluate(prep, { wave: 10, fx: 'minimal' });
    await p.waitForTimeout(500);
    await p.evaluate(() => window.RPD.Loop.setPaused(true));
    await shot('d_minimal');
    await p.evaluate(() => window.RPD.Effects && window.RPD.Effects.force(null));

    await p.evaluate(prep, { wave: 10 });
    await p.waitForTimeout(400);
    await p.evaluate(() => { const R = window.RPD, b = R.EnemyManager.boss; if (b) R.EnemyManager.damage(b, b.hp * 10 + 1e9, {}); });
    await p.waitForTimeout(250);
    await p.evaluate(() => window.RPD.Loop.setPaused(true));
    await shot('e_down');

    report[mode] = { a, b, d: d.name };
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
    console.log('boss', JSON.stringify(r.report));
    console.log('boss problems', JSON.stringify(r.problems));
    await browser.close();
    if (r.problems.length) process.exitCode = 1;
  })();
}
