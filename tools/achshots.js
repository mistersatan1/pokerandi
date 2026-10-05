/* achshots.js — 업적 · 칭호(세션 98) 캡처. 테스트판(dist)을 실제 크로미움으로 띄워 찍는다.
 *   (a) 판 도중 전설을 실제로 조합 → "업적 달성" 알림(첫 조합 · 전설의 시작 — 차례로)
 *   (b) 업적 창 — 이룬 것 · 진행 막대 · 숨은 업적 ??? · 단 칭호
 *   (c) 모드 선택 — 트레이너 카드의 칭호 · [🏆 업적 n / N]
 *   (d) 70R 클리어 결과 화면 — "이번 판 업적"
 * 캡처: dist/40_ach_{a_toast|b_list|c_modepick|d_result}_{pc|portrait}.png. 단독 실행 · screenshot.js 에서 run(browser). 먼저 npm run build. */
const fs = require('fs'), path = require('path');
let playwright;
try { playwright = require('playwright'); } catch (e) { playwright = require('/home/claude/.npm-global/lib/node_modules/playwright'); }
const { chromium, devices } = playwright;
const SANDBOX_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync(SANDBOX_CHROME) ? SANDBOX_CHROME : undefined);
const URL = 'file://' + path.join(__dirname, '..', 'dist') + '/' + encodeURIComponent('포켓몬랜덤디펜스_테스트.html');
const OUT = n => path.join(__dirname, '..', 'dist', n + '.png');

/* 새 기록 + 판 시작 → 전설 하나를 재료로 실제 조합 */
function craftLegend() {
  const R = window.RPD;
  if (R.TutorialManager && R.TutorialManager.skip) R.TutorialManager.skip();
  if (R.SaveManager && R.SaveManager.data) R.SaveManager.data.settings.cheerTipShown = true;
  document.querySelectorAll('.modepick, .result, .help, .book').forEach(o => o.hidden = true);
  const D = R.SaveManager.data; D.achievements = {}; D.achProgress = {}; D.title = null;
  R.Game.resetAll('NORMAL', 'NORMAL'); R.Game.startRun('NORMAL', 'NORMAL');
  R.GameManager.setWave(40);
  const PD = R.PokemonData;
  const rec = R.RecipeData.list.find(r => PD.get(r.id).tier === 'T5' && r.materials.every(m => m !== 'ditto'));
  R.StorageManager.reset();
  rec.materials.forEach(id => R.StorageManager.add(R.UnitManager.create(id)));
  const res = R.RecipeManager.craft(rec.id);
  return { ok: res.ok, reason: res.reason, name: PD.get(rec.id).name, got: Object.keys(D.achievements) };
}

/* 업적 창에 보일 기록 — 몇 개 이룸 · 진행 중 · 하나 단다 */
function fillRecord() {
  const R = window.RPD, AM = R.AchievementManager, D = R.SaveManager.data;
  ['craft_first', 'legend_first', 'hidden_first', 'syn_any_max', 'syn_water_max', 'boss_first', 'wall_noimm', 'dex_50'].forEach(id => AM.unlock(id));
  D.achProgress.crafts = 64; D.achProgress.bosses = 37; D.achProgress.elites = 6;
  AM.equip('wall_noimm');
  return { count: AM.count(), total: AM.total() };
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

    // (a) 실제 조합 → 알림
    const a = await p.evaluate(craftLegend);
    await p.waitForTimeout(500);
    a.toast = await p.evaluate(() => { const t = document.getElementById('achieveToast'); return t.classList.contains('is-on') ? t.textContent.replace(/\s+/g, ' ').trim() : ''; });
    await p.screenshot({ path: OUT('40_ach_a_toast_' + mode) });
    await p.evaluate(() => window.RPD.Loop.setPaused(true));
    if (!a.ok || a.got.indexOf('legend_first') < 0 || !/업적 달성/.test(a.toast)) bad('전설 조합 업적 ' + JSON.stringify(a));

    // (b) 업적 창
    const b = await p.evaluate(fillRecord);
    await p.waitForTimeout(3600);   // 알림이 지나가게
    await p.evaluate(() => { document.getElementById('achieveToast').classList.remove('is-on'); window.RPD.AchieveUI.queue.length = 0; window.RPD.AchieveUI.open(); });
    await p.waitForTimeout(300);
    b.ui = await p.evaluate(() => ({ count: document.getElementById('achieveCount').textContent, cards: document.querySelectorAll('#achieveBody .ach').length,
      done: document.querySelectorAll('#achieveBody .ach.is-done').length, bars: document.querySelectorAll('#achieveBody .ach__bar').length,
      secret: /숨은 업적/.test(document.getElementById('achieveBody').textContent), eq: document.getElementById('achieveEquipped').textContent }));
    await p.screenshot({ path: OUT('40_ach_b_list_' + mode) });
    if (b.ui.cards !== b.total || b.ui.done !== b.count || !b.ui.bars || !b.ui.secret || !/벽을 넘은 자/.test(b.ui.eq)) bad('업적 창 ' + JSON.stringify(b));
    // 칭호 바꾸기 — 카드의 [칭호 달기] 를 실제로 누른다
    await p.click('#achieveBody [data-equip="syn_water_max"]');
    await p.waitForTimeout(150);
    b.after = await p.evaluate(() => window.RPD.SaveManager.data.title);
    if (b.after !== 'syn_water_max') bad('칭호 달기 버튼 ' + b.after);
    await p.click('#btnAchieveClose');

    // (c) 모드 선택
    await p.evaluate(() => { window.RPD.UIManager.showModePick ? window.RPD.UIManager.showModePick() : document.getElementById('btnStart').click(); });
    await p.waitForTimeout(300);
    const c = await p.evaluate(() => { const t = document.querySelector('#modeList .trainer'); return t ? t.textContent.replace(/\s+/g, ' ').trim() : ''; });
    await p.screenshot({ path: OUT('40_ach_c_modepick_' + mode) });
    if (!/바다의 지배자/.test(c) || !/업적 \d+ \/ \d+/.test(c)) bad('모드 선택 칭호 ' + c);
    await p.evaluate(() => { document.getElementById('modeOverlay').hidden = true; });

    // (d) 70R 클리어 — 결과 화면
    const d = await p.evaluate(() => {
      const R = window.RPD, D = R.SaveManager.data;
      delete D.achievements.clear_noimm; delete D.achievements.clear_noleak;
      R.Game.resetAll('NORMAL', 'NORMAL'); R.Game.startRun('NORMAL', 'NORMAL');
      R.AchievementManager.unlockedThisRun = [];
      R.StatsManager.leaks = 0;
      R.GameManager.setWave(70); R.WaveManager.wave = 70;
      R.EnemyManager.reset && R.EnemyManager.reset();
      R.WaveManager.complete();
      const el = document.getElementById('resultAch');
      return { hidden: el.hidden, text: el.textContent.replace(/\s+/g, ' ').trim(), state: R.GameManager.state };
    });
    await p.waitForTimeout(600);
    await p.screenshot({ path: OUT('40_ach_d_result_' + mode) });
    if (d.hidden || !/순수한 승리/.test(d.text) || !/완벽한 방어/.test(d.text)) bad('결과 화면 ' + JSON.stringify(d));
    report[mode] = { a, b, c, d };
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
    console.log('ach', JSON.stringify(r.report));
    console.log('ach problems', JSON.stringify(r.problems));
    await browser.close();
    if (r.problems.length) process.exitCode = 1;
  })();
}
