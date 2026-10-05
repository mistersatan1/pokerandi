/* discoveryshots.js — 히든 · 불멸 · 초월 첫 발견 연출(세션 96) 캡처. 테스트판(dist)을 실제 크로미움으로 띄워 주문을 처음 외친다.
 *   (a) 대사 중 — 검은 실루엣 "?"   (b) 정체가 드러나는 순간(섬광 · 빛살 · 불꽃)   (c) NEW! · 이름 · 발견 수
 *   (r) 같은 주문 두 번째 — 예전처럼 짧은 연출(첫 발견 장식 없음)
 * 캡처: dist/38_discover_{hidden|immortal|transcend}_{a_silhouette|b_reveal|c_new}_{pc|portrait}.png · 38_discover_hidden_r_repeat_pc.png
 * OUT_TAG=before 면 이름 끝에 _before. 단독 실행 · screenshot.js 에서 run(browser). 먼저 npm run build. */
const fs = require('fs'), path = require('path');
let playwright;
try { playwright = require('playwright'); } catch (e) { playwright = require('/home/claude/.npm-global/lib/node_modules/playwright'); }
const { chromium, devices } = playwright;
const SANDBOX_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync(SANDBOX_CHROME) ? SANDBOX_CHROME : undefined);
const URL = 'file://' + path.join(__dirname, '..', 'dist') + '/' + encodeURIComponent('포켓몬랜덤디펜스_테스트.html');
const TAG = process.env.OUT_TAG ? '_' + process.env.OUT_TAG : '';
const OUT = n => path.join(__dirname, '..', 'dist', n + TAG + '.png');

/* 그 종류 첫 주문을 고르고 재료를 창고에 넣은 뒤 외친다(모르는 주문으로 되돌려 첫 발견이 되게) */
function cast(o) {
  const R = window.RPD;
  if (R.TutorialManager && R.TutorialManager.skip) R.TutorialManager.skip();
  if (R.SaveManager && R.SaveManager.data) R.SaveManager.data.settings.cheerTipShown = true;
  document.querySelectorAll('.modepick, .result, .help, .book').forEach(n => n.hidden = true);
  if (!R.GameManager.isPlayable()) { R.Game.resetAll('NORMAL', 'NORMAL'); R.Game.startRun('NORMAL', 'NORMAL'); }
  R.GameManager.setWave(45);
  const sp = R.SpellData.list.find(s => s.kind === o.kind);
  if (!o.repeat && R.SaveManager.data.spells) delete R.SaveManager.data.spells[sp.id];
  R.StorageManager.reset();
  sp.materials.forEach(id => R.StorageManager.add(R.UnitManager.create(id)));
  if (sp.kind === 'transcend') { R.SpellManager.transcendShards = 1; R.SpellManager.transcendUsed = false; }
  const r = R.SpellManager.cast(sp.phrase);
  return { ok: r.ok, first: r.firstTime, reason: r.reason, name: R.PokemonData.get(sp.result).name };
}

async function run(browser) {
  const problems = [], report = {};
  for (const mode of ['pc', 'portrait']) {
    const ctx = await browser.newContext(mode === 'pc' ? { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } : { ...devices['Galaxy S24'], defaultBrowserType: undefined });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.goto(URL); await p.waitForTimeout(1000);
    const kinds = mode === 'pc' ? ['hidden', 'immortal', 'transcend'] : ['immortal'];
    for (const kind of kinds) {
      const shot = n => p.screenshot({ path: OUT('38_discover_' + kind + '_' + n + '_' + mode) });
      const r = await p.evaluate(cast, { kind });
      report[mode + ':' + kind] = r;
      if (!r.ok || !r.first) { problems.push(mode + ': ' + kind + ' 첫 발견이 아님 ' + JSON.stringify(r)); continue; }
      await p.waitForTimeout(1300);
      const a = await p.evaluate(() => ({ sil: !!document.querySelector('.spellscene__art.is-silhouette'), q: !!document.querySelector('.spellscene__q') }));
      await shot('a_silhouette');
      // 대사를 넘겨 끝으로
      for (let i = 0; i < 12; i++) {
        const done = await p.evaluate(() => document.getElementById('spellScene').classList.contains('is-reveal'));
        if (done) break;
        await p.click('#spellScene'); await p.waitForTimeout(80);
      }
      await p.waitForTimeout(160);
      await shot('b_reveal');
      await p.waitForTimeout(900);
      const c = await p.evaluate(() => ({ stamp: !!document.querySelector('.spellscene__stamp'), count: (document.querySelector('.spellscene__count') || {}).textContent || '',
        sil: !!document.querySelector('.spellscene__art.is-silhouette') }));
      await shot('c_new');
      report[mode + ':' + kind].a = a; report[mode + ':' + kind].c = c;
      if (!TAG && (!a.sil || !c.stamp || c.sil || !/발견/.test(c.count))) problems.push(mode + ': ' + kind + ' 첫 발견 연출 ' + JSON.stringify({ a, c }));
      await p.waitForTimeout(3800);   // 저절로 닫힌다
    }
    if (mode === 'pc') {
      // 두 번째 — 짧은 연출(첫 발견 장식 없음)
      const r = await p.evaluate(cast, { kind: 'hidden', repeat: true });
      for (let i = 0; i < 12; i++) {
        const done = await p.evaluate(() => document.getElementById('spellScene').classList.contains('is-reveal'));
        if (done) break;
        await p.click('#spellScene'); await p.waitForTimeout(80);
      }
      await p.waitForTimeout(500);
      const rep = await p.evaluate(() => ({ first: document.getElementById('spellScene').classList.contains('is-first'), stamp: !!document.querySelector('.spellscene__stamp') }));
      await p.screenshot({ path: OUT('38_discover_hidden_r_repeat_pc') });
      report.repeat = { r, rep };
      if (!TAG && (r.first || rep.first || rep.stamp)) problems.push('두 번째인데 첫 발견 연출 ' + JSON.stringify(rep));
    }
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
    console.log('discover', JSON.stringify(r.report));
    console.log('discover problems', JSON.stringify(r.problems));
    await browser.close();
    if (r.problems.length) process.exitCode = 1;
  })();
}
