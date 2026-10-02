/* tiershots.js — 리디자인 ①(세션 85) 등급 프레임 · 잠긴 칸 캡처. 테스트판(dist)을 실제 크로미움으로 띄워 PC · 갤럭시 S24 세로로 찍는다.
 *   (a) 등급 줄 — T1~T5 + 불멸 · 초월을 한 줄에(골드 300: 잠긴 칸은 조용히)
 *   (b) 같은 보드 · 골드 1300 — 살 수 있는 잠긴 칸만 금색 가격 · 하나는 마우스를 올린 상태
 *   (c) 전설을 막 놓은 순간(반짝 쓸림 중간)
 *   (d) 효과 "최소" — 소환진이 멈춘 정지 프레임
 * 캡처: dist/29_tier_{a_row|b_afford|c_sheen|d_minimal}_{pc|portrait}.png · (a) PC 는 등급 줄 확대 29_tier_a_zoom_pc.png 도.
 * OUT_TAG=before 면 파일 이름 끝에 _before 를 붙인다(바꾸기 전 비교용). 단독 실행 · screenshot.js 에서 run(browser). 먼저 npm run build. */
const fs = require('fs'), path = require('path');
let playwright;
try { playwright = require('playwright'); } catch (e) { playwright = require('/home/claude/.npm-global/lib/node_modules/playwright'); }
const { chromium, devices } = playwright;
const SANDBOX_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync(SANDBOX_CHROME) ? SANDBOX_CHROME : undefined);
const URL = 'file://' + path.join(__dirname, '..', 'dist') + '/' + encodeURIComponent('포켓몬랜덤디펜스_테스트.html');
const TAG = process.env.OUT_TAG ? '_' + process.env.OUT_TAG : '';
const OUT = n => path.join(__dirname, '..', 'dist', n + TAG + '.png');

/* 등급마다 대표 하나 — 히든이 아닌 첫 종 · 불멸 뮤츠 · 초월 리자몽. 가운데 가로줄(명당) 칸에 왼쪽부터 */
function prep(opt) {
  const R = window.RPD;
  if (R.TutorialManager && R.TutorialManager.skip) R.TutorialManager.skip();
  document.querySelectorAll('.modepick, .result, .help, .book').forEach(o => o.hidden = true);
  if (R.SaveManager && R.SaveManager.data) R.SaveManager.data.settings.cheerTipShown = true;   // 첫 획득 알림이 등급 줄을 가리지 않게
  R.Game.resetAll('NORMAL', 'NORMAL'); R.Game.startRun('NORMAL', 'NORMAL');
  R.GameManager.setWave(34); R.WaveManager.startRound(34);
  const F = R.FieldManager, PD = R.PokemonData;
  F.slots.forEach(x => { if (x.unit) F.remove(x.index); });
  R.StorageManager.reset();
  const pick = t => (PD.list.find(d => d.tier === t && !d.hidden && !d.form) || {}).id;
  const ids = ['T1', 'T2', 'T3', 'T4', 'T5'].map(pick).concat(['mewtwo', 'charizard_transcend']);
  const open = F.slots.filter(s => s.unlocked && s.zone !== 'cheer').sort((a, b) => Math.abs(a.y - 300) - Math.abs(b.y - 300) || a.x - b.x);
  const row = open.filter(s => Math.abs(s.y - open[0].y) < 1).sort((a, b) => a.x - b.x);
  const rest = open.filter(s => row.indexOf(s) < 0);
  const slots = row.concat(rest);
  ids.forEach((id, i) => { if (id && slots[i]) F.place(slots[i].index, R.UnitManager.create(id)); });
  R.UnitManager.recomputeAll();
  R.GameManager.life = 60; R.GameManager.gold = opt.gold;
  R.bus.emit('field:changed', {}); R.bus.emit('economy:gold', { gold: opt.gold, delta: 0 });
  if (R.GameManager.emitStats) R.GameManager.emitStats();   // HUD 골드 칩도 맞춘다
  if (R.Effects) R.Effects.force(opt.fx || null);
  if (R.FxRenderer) R.FxRenderer.reset();   // 판 시작 소환 이름 글자 지우기
  R.Loop.setPaused(true);
  return { ids, row: row.slice(0, ids.length).map(s => ({ x: s.x, y: s.y })) };
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

    // (a) 등급 줄 · 골드 300
    const a = await p.evaluate(prep, { gold: 300 });
    await p.waitForTimeout(1800);
    await p.screenshot({ path: OUT('29_tier_a_row_' + mode) });
    if (mode === 'pc') {
      const box = await p.evaluate(row => {
        const R = window.RPD, c = document.getElementById('gameCanvas').getBoundingClientRect();
        const pts = row.map(q => R.Renderer.toCanvasCss(q.x, q.y));
        const s = pts[0].scale, xs = pts.map(q => q.x), ys = pts.map(q => q.y);
        return { x: c.left + Math.min(...xs) - 50 * s, y: c.top + Math.min(...ys) - 55 * s, w: (Math.max(...xs) - Math.min(...xs)) + 100 * s, h: (Math.max(...ys) - Math.min(...ys)) + 110 * s };
      }, a.row);
      await p.screenshot({ path: OUT('29_tier_a_zoom_pc'), clip: { x: Math.max(0, box.x), y: Math.max(0, box.y), width: box.w, height: box.h } });
    }

    // (b) 골드 1300 — 살 수 있는 잠긴 칸 · 하나는 마우스 올림
    await p.evaluate(prep, { gold: 1300 });
    await p.evaluate(() => {
      const F = window.RPD.FieldManager;
      const exp = F.slots.filter(s => !s.unlocked && !s.blocked && s.zone !== 'cheer').sort((x, y) => y.cost - x.cost);
      if (exp[0]) F.setHover(exp[0].index);   // 가장 비싼 칸(못 사는 칸)에 마우스 — 가격이 보여야 한다
    });
    await p.waitForTimeout(1800);   // 라운드 배너가 사라진 뒤
    await p.screenshot({ path: OUT('29_tier_b_afford_' + mode) });

    // (c) 전설을 막 놓은 순간 — 반짝 쓸림
    await p.evaluate(prep, { gold: 300 });
    await p.waitForTimeout(1800);   // 라운드 배너가 사라진 뒤
    await p.evaluate(() => {
      const R = window.RPD, F = R.FieldManager;
      const t5 = F.slots.find(s => s.unit && s.unit.tier === 'T5');
      const u = F.remove(t5.index);
      R.Loop.setPaused(false);
      F.place(t5.index, u); R.UnitManager.recomputeAll(); R.bus.emit('field:changed', {});
    });
    await p.waitForTimeout(300);
    await p.screenshot({ path: OUT('29_tier_c_sheen_' + mode) });
    await p.evaluate(() => window.RPD.Loop.setPaused(true));

    // (d) 효과 최소
    await p.evaluate(prep, { gold: 300, fx: 'minimal' });
    await p.waitForTimeout(600);
    await p.screenshot({ path: OUT('29_tier_d_minimal_' + mode) });
    await p.evaluate(() => window.RPD.Effects && window.RPD.Effects.force(null));

    report[mode] = { ids: a.ids };
    if (a.ids.some(x => !x)) bad('등급 대표가 빠졌다 ' + JSON.stringify(a.ids));
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
    console.log('tier', JSON.stringify(r.report));
    console.log('tier problems', JSON.stringify(r.problems));
    await browser.close();
    if (r.problems.length) process.exitCode = 1;
  })();
}
