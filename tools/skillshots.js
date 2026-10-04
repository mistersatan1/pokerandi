/* skillshots.js — 스킬별 고유 연출(세션 94) 캡처. 테스트판(dist)을 실제 크로미움으로 띄워 스킬 58개를 하나씩 실제로 발동시키고
 * 시전자 둘레를 잘라 한 장의 모아보기로 만든다(PC). 같은 장면을 휴대폰 세로로도 몇 개.
 *   dist/37_skill_sheet_{1|2}.png  — 스킬마다 칸 하나(이름 · 모티프)
 *   dist/37_skill_portrait_{id}.png — 세로 화면(필드 90° 돌림)에서 위에서 떨어지는 · 컷인 · 지대 스킬
 * OUT_TAG=before 면 이름 끝에 _before(예전 평타 확대 연출과 비교). 단독 실행 · screenshot.js 에서 run(browser). 먼저 npm run build. */
const fs = require('fs'), path = require('path');
let playwright;
try { playwright = require('playwright'); } catch (e) { playwright = require('/home/claude/.npm-global/lib/node_modules/playwright'); }
const { chromium, devices } = playwright;
const SANDBOX_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync(SANDBOX_CHROME) ? SANDBOX_CHROME : undefined);
const URL = 'file://' + path.join(__dirname, '..', 'dist') + '/' + encodeURIComponent('포켓몬랜덤디펜스_테스트.html');
const TAG = process.env.OUT_TAG ? '_' + process.env.OUT_TAG : '';
const OUT = n => path.join(__dirname, '..', 'dist', n + TAG + '.png');
const AT_MS = 300;   // 발동 후 몇 ms 에 찍나 — 대부분의 모티프가 한창일 때

function boot() {
  const R = window.RPD;
  if (R.TutorialManager && R.TutorialManager.skip) R.TutorialManager.skip();
  if (R.SaveManager && R.SaveManager.data) R.SaveManager.data.settings.cheerTipShown = true;
  document.querySelectorAll('.modepick, .result, .help, .book').forEach(n => n.hidden = true);
  R.Game.resetAll('NORMAL', 'NORMAL'); R.Game.startRun('NORMAL', 'NORMAL');
  R.GameManager.setWave(40); R.GameManager.life = 999;
  R.Loop.setPaused(true);
  // 스킬 → 주인 포켓몬
  const owner = {};
  R.PokemonData.list.forEach(d => { if (d.skill && !owner[d.skill]) owner[d.skill] = d.id; });
  return Object.keys(R.SkillData ? R.SkillData.all ? R.SkillData.all() : {} : {}).length ? owner : owner;
}

/* 칸 하나에 시전자, 둘레에 적 7마리를 세우고 스킬을 쏜다 */
function castOne(o) {
  const R = window.RPD, F = R.FieldManager, EM = R.EnemyManager;
  F.slots.forEach(x => { if (x.unit) F.remove(x.index); });
  EM.enemies.length = 0;
  if (R.SkillFx) R.SkillFx.reset();
  if (R.AttackFx && R.AttackFx.reset) R.AttackFx.reset();
  if (R.FxRenderer) R.FxRenderer.reset();
  const slot = F.slots.find(s => s.index === o.slot) || F.slots.find(s => s.unlocked && s.zone !== 'cheer');
  // 버프 스킬이 보이게 이웃 칸에도 몇 마리
  const near = F.slots.filter(s => s.unlocked && s.zone !== 'cheer' && s !== slot).sort((a, b) => Math.hypot(a.x - slot.x, a.y - slot.y) - Math.hypot(b.x - slot.x, b.y - slot.y)).slice(0, 3);
  near.forEach(s => F.place(s.index, R.UnitManager.create('rattata')));
  const u = R.UnitManager.create(o.owner);
  F.place(slot.index, u);
  R.UnitManager.recomputeAll();
  const rr = Math.min(u.range || 120, 150);
  for (let i = 0; i < 7; i++) {
    const e = EM.spawn('armored', 40, { distance: 200 + i * 10 });
    const ang = i / 7 * Math.PI * 2 + 0.3;
    e.x = u.x + Math.cos(ang) * rr * (0.45 + (i % 3) * 0.2); e.y = u.y + Math.sin(ang) * rr * (0.45 + (i % 3) * 0.2);
    e.hp = e.maxHp = 1e12;
  }
  u.skillCooldown = 0;
  const ok = R.SkillManager.cast(u);
  const c = R.Renderer.toCanvasCss(u.x, u.y), rect = R.Renderer.canvas.getBoundingClientRect();
  return { ok, x: rect.left + c.x, y: rect.top + c.y, name: u.skill && u.skill.name, m: R.SkillFxData && R.SkillFxData[o.id] ? R.SkillFxData[o.id].m : '-' };
}

async function run(browser) {
  const problems = [], report = { pc: {}, portrait: {} };
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL); await p.waitForTimeout(1000);
  const owner = await p.evaluate(boot);
  const ids = Object.keys(owner).filter(id => true);
  const slotIdx = await p.evaluate(() => { const F = window.RPD.FieldManager; const s = F.slots.filter(x => x.unlocked && x.zone !== 'cheer'); return s[Math.floor(s.length / 2)].index; });
  const cells = [];
  for (const id of ids) {
    const r = await p.evaluate(castOne, { id, owner: owner[id], slot: slotIdx });
    await p.waitForTimeout(AT_MS);
    const W = 300, H = 220;
    const buf = await p.screenshot({ clip: { x: Math.max(0, r.x - W / 2), y: Math.max(0, r.y - H / 2), width: W, height: H } });
    cells.push({ id, name: r.name, m: r.m, ok: r.ok, img: buf.toString('base64') });
    report.pc[id] = { ok: r.ok, m: r.m };
    if (!r.ok) problems.push('pc: ' + id + ' 발동 안 됨');
    await p.waitForTimeout(1300);   // 남은 연출이 다음 칸에 안 섞이게(지대는 reset 으로 지운다)
  }
  if (errs.length) problems.push('pc: 페이지 오류 ' + errs[0]);
  // 모아보기 — 브라우저로 격자를 만들어 찍는다(파이썬 이미지 도구 없이)
  const half = Math.ceil(cells.length / 2);
  for (const [part, list] of [[1, cells.slice(0, half)], [2, cells.slice(half)]]) {
    const sp = await ctx.newPage();
    await sp.setViewportSize({ width: 6 * 304 + 8, height: 900 });
    await sp.setContent('<body style="margin:0;background:#07122b;font:700 13px sans-serif;color:#eef4ff"><div style="display:grid;grid-template-columns:repeat(6,300px);gap:4px;padding:4px">' +
      list.map(c => '<div style="position:relative"><img src="data:image/png;base64,' + c.img + '" style="display:block;width:300px;height:220px">' +
        '<div style="position:absolute;left:0;top:0;padding:2px 6px;background:rgba(0,0,0,.65)">' + (c.name || c.id) + ' <span style="color:#97abd2">' + c.m + '</span></div></div>').join('') + '</div></body>');
    await sp.screenshot({ path: OUT('37_skill_sheet_' + part), fullPage: true });
    await sp.close();
  }
  await ctx.close();

  // 세로 화면 — 화면 기준 "위에서" 떨어지는지 · 컷인 · 지대
  const pctx = await browser.newContext({ ...devices['Galaxy S24'], defaultBrowserType: undefined });
  const pp = await pctx.newPage();
  await pp.goto(URL); await pp.waitForTimeout(1000);
  const pOwner = await pp.evaluate(boot);
  const pSlot = await pp.evaluate(() => { const F = window.RPD.FieldManager; const s = F.slots.filter(x => x.unlocked && x.zone !== 'cheer'); return s[Math.floor(s.length / 2)].index; });
  for (const id of ['rockSlide', 'thunderStorm', 'blastBurnX', 'toxicGarden']) {
    if (!pOwner[id]) continue;
    const r = await pp.evaluate(castOne, { id, owner: pOwner[id], slot: pSlot });
    await pp.waitForTimeout(id === 'toxicGarden' ? 700 : AT_MS);
    await pp.screenshot({ path: OUT('37_skill_portrait_' + id) });
    report.portrait[id] = { ok: r.ok };
    if (!r.ok) problems.push('portrait: ' + id + ' 발동 안 됨');
    await pp.waitForTimeout(1200);
  }
  await pctx.close();
  return { report, problems };
}

module.exports = { run };

if (require.main === module) {
  (async () => {
    const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
    const r = await run(browser);
    console.log('skill', Object.keys(r.report.pc).length, 'skills ·', JSON.stringify(r.report.portrait));
    console.log('skill problems', JSON.stringify(r.problems));
    await browser.close();
    if (r.problems.length) process.exitCode = 1;
  })();
}
