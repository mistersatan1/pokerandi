/* specialshots.js — 특수 런(세션 99) 캡처. 테스트판(dist)을 실제 크로미움으로 띄워 찍는다.
 *   (a) 모드 선택 — 규칙 칩(불꽃만 · 조합식 랜덤을 실제로 눌러 켬) · 켠 규칙 설명 · 난이도 버튼의 특수 런 기록
 *   (b) "불꽃만" 판 — 필드 왼쪽 위 규칙 띠 · 보유 창의 전투 불가(🚫) 칸 · 물 타입을 전투 칸에 놓으려다 거절된 말풍선
 *   (c) "조합식 랜덤" 판 — 조합식 줄(이상해씨 계열이 다른 재료로) · 규칙 띠를 눌러 펼친 설명
 * 캡처: dist/41_special_{a_pick|b_fire|c_shuffle}_{pc|portrait}.png. 단독 실행 · screenshot.js 에서 run(browser). 먼저 npm run build. */
const fs = require('fs'), path = require('path');
let playwright;
try { playwright = require('playwright'); } catch (e) { playwright = require('/home/claude/.npm-global/lib/node_modules/playwright'); }
const { chromium, devices } = playwright;
const SANDBOX_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync(SANDBOX_CHROME) ? SANDBOX_CHROME : undefined);
const URL = 'file://' + path.join(__dirname, '..', 'dist') + '/' + encodeURIComponent('포켓몬랜덤디펜스_테스트.html');
const OUT = n => path.join(__dirname, '..', 'dist', n + '.png');

function prep() {
  const R = window.RPD;
  if (R.TutorialManager && R.TutorialManager.skip) R.TutorialManager.skip();
  if (R.SaveManager && R.SaveManager.data) R.SaveManager.data.settings.cheerTipShown = true;
  R.SaveManager.setSetting('specialRules', []);
  document.querySelectorAll('.modepick, .result, .help, .book').forEach(o => o.hidden = true);
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
    await p.evaluate(prep);

    // (a) 모드 선택에서 규칙 칩을 실제로 누른다
    await p.evaluate(() => window.RPD.UIManager.showModePick());
    await p.waitForTimeout(200);
    await p.click('#modeList [data-rule="fireOnly"]'); await p.waitForTimeout(120);
    await p.click('#modeList [data-rule="shuffle"]'); await p.waitForTimeout(120);
    const a = await p.evaluate(() => ({ on: [...document.querySelectorAll('#modeList .rulechip.is-on')].map(n => n.dataset.rule),
      desc: document.querySelectorAll('#modeList .rulepick__desc li').length, saved: window.RPD.SaveManager.getSetting('specialRules', []) }));
    await p.evaluate(() => { const c = document.querySelector('#modeList .rulepick'); if (c && c.scrollIntoView) c.scrollIntoView({ block: 'center' }); });
    await p.screenshot({ path: OUT('41_special_a_pick_' + mode) });
    if (a.on.join() !== 'fireOnly,shuffle' || a.desc !== 2 || a.saved.join() !== 'fireOnly,shuffle') bad('규칙 고르기 ' + JSON.stringify(a));
    // "불꽃만"만 남기고 보통 난이도로 실제 시작
    await p.click('#modeList [data-rule="shuffle"]'); await p.waitForTimeout(120);
    await p.click('#modeList .diffbtn[data-diff="NORMAL"]');
    await p.waitForTimeout(500);

    // (b) 불꽃만 판
    const b = await p.evaluate(() => {
      const R = window.RPD, F = R.FieldManager, UM = R.UnitManager;
      R.Loop.setPaused(true);
      R.GameManager.setWave(20); R.GameManager.gold = 3000;
      ['charmander', 'charmander', 'vulpix', 'ponyta', 'growlithe'].forEach(id => R.SummonManager.autoPlace(UM.create(id)) || R.StorageManager.add(UM.create(id)));
      ['squirtle', 'pidgey', 'caterpie', 'abra'].forEach(id => R.StorageManager.add(UM.create(id)));
      UM.recomputeAll(); R.bus.emit('field:changed', {}); R.bus.emit('storage:changed', R.StorageManager.units);
      // 물 타입(꼬부기)을 빈 전투 칸에 직접 놓아 본다 — 거절되고 말풍선
      const empty = F.slots.find(s => s.unlocked && !s.unit && s.zone !== 'cheer');
      const si = R.StorageManager.units.findIndex(u => u.defId === 'squirtle');
      const dep = R.StorageManager.deploy(si, empty.index);
      if (window.innerWidth < 1100) R.HudPanels.setDrawer('owned');
      return { rules: R.GameManager.mode.rules, label: R.GameManager.mode.label, dep: dep.reason, strip: !document.getElementById('ruleStrip').hidden,
        field: F.getBattleUnits().map(u => u.defId), cost: R.EconomyManager.summonCost() };
    });
    await p.waitForTimeout(400);
    b.bench = await p.evaluate(() => document.querySelectorAll('.scell.is-bench').length);
    await p.screenshot({ path: OUT('41_special_b_fire_' + mode) });
    if (b.rules.join() !== 'fireOnly' || b.dep !== 'TYPE_RULE' || !b.strip || b.field.some(id => ['squirtle', 'pidgey', 'caterpie', 'abra'].includes(id)) || !b.bench) bad('불꽃만 판 ' + JSON.stringify(b));

    // (c) 조합식 랜덤 판 — 규칙을 바꿔 새로 시작
    const c = await p.evaluate(() => {
      const R = window.RPD;
      R.Game.resetAll('NORMAL', 'NORMAL', { rules: ['shuffle'] });
      R.Game.startRun('NORMAL', 'NORMAL', ['shuffle']);
      R.Loop.setPaused(true);
      R.GameManager.setWave(12);
      R.RecipeManager.refresh();
      const ivy = R.RecipeData.get('ivysaur');
      if (window.innerWidth < 1100) R.HudPanels.setDrawer('recipes');
      return { seed: R.SpecialRunManager.seed, ivy: ivy.materials.slice(), base: ivy.base.slice(), changed: R.RecipeData.list.filter(r => r.materials.join() !== r.base.join()).length };
    });
    await p.click('#ruleStrip'); await p.waitForTimeout(250);
    c.open = await p.evaluate(() => document.querySelectorAll('#ruleStrip .rulestrip__desc li').length);
    await p.screenshot({ path: OUT('41_special_c_shuffle_' + mode) });
    if (!c.seed || c.changed < 40 || c.open !== 1) bad('조합식 랜덤 판 ' + JSON.stringify(c));
    report[mode] = { a, b, c };
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
    console.log('special', JSON.stringify(r.report));
    console.log('special problems', JSON.stringify(r.problems));
    await browser.close();
    if (r.problems.length) process.exitCode = 1;
  })();
}
