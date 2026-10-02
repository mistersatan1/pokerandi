/* cheershots.js — 응원 칸(세션 82) 실제 플레이 캡처. 테스트판(dist)을 실제 크로미움으로 띄워 PC · 갤럭시 S24 세로로 찍는다.
 *   (b) 빈 응원 칸  (c) 응원 가능 2마리 + 요약 줄  (d) 응원 칸 정보 카드 / 정보 바  (e) 전투 칸 카드 "받는 버프"(응원 · 이웃)
 *   (f) 응원 불가 포켓몬을 응원 칸으로 → 거절 알림  (g) 2라운드 — 흔한 응원(이상해씨)을 두고 실제로 진행
 *   (a) 배치안 A/B 는 tools/cheerlayout.js(0단계).
 * 캡처: dist/28_cheer_{b..g}_{pc|portrait}.png. 어긋나면 실패로 끝난다(단독 실행 · screenshot.js 에서 run(browser)).
 * 먼저 npm run build. */
const fs = require('fs'), path = require('path');
let playwright;
try { playwright = require('playwright'); } catch (e) { playwright = require('/home/claude/.npm-global/lib/node_modules/playwright'); }
const { chromium, devices } = playwright;
const SANDBOX_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync(SANDBOX_CHROME) ? SANDBOX_CHROME : undefined);
const URL = 'file://' + path.join(__dirname, '..', 'dist') + '/' + encodeURIComponent('포켓몬랜덤디펜스_테스트.html');
const OUT = n => path.join(__dirname, '..', 'dist', n);

function prep(opt) {
  const R = window.RPD;
  if (R.TutorialManager && R.TutorialManager.skip) R.TutorialManager.skip();
  document.querySelectorAll('.modepick, .result, .help, .book').forEach(o => o.hidden = true);
  R.Game.resetAll('NORMAL', 'NORMAL'); R.Game.startRun('NORMAL', 'NORMAL');
  R.GameManager.setWave(opt.wave); R.WaveManager.startRound(opt.wave);
  const F = R.FieldManager;
  F.slots.forEach(x => { if (x.unit) F.remove(x.index); });
  R.StorageManager.reset();
  const open = F.slots.filter(x => x.unlocked && !x.blocked && x.zone !== 'cheer');
  (opt.units || []).forEach((id, i) => F.place(open[i].index, R.UnitManager.create(id)));
  (opt.store || []).forEach(id => R.StorageManager.add(R.UnitManager.create(id)));
  const cs = F.cheerSlots().filter(s => s.unlocked);
  (opt.cheer || []).forEach((id, i) => F.place(cs[i].index, R.UnitManager.create(id)));
  R.GameManager.life = 999; R.GameManager.gold = opt.gold || 500;
  R.UnitManager.recomputeAll();
  R.bus.emit('field:changed', {}); R.bus.emit('storage:changed', R.StorageManager.units);
  R.bus.emit('economy:gold', { gold: R.GameManager.gold, delta: 0 });
  window.__said = [];
  if (R.Convenience && !R.Convenience.__wrapped) {
    const say = R.Convenience.say; R.Convenience.say = function (t) { window.__said.push(t); return say.apply(this, arguments); }; R.Convenience.__wrapped = true;
  }
  if (opt.pause !== false) R.Loop.setPaused(true);
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
    const shot = n => p.screenshot({ path: OUT('28_cheer_' + n + '_' + mode + '.png') });
    const tapSlot = idx => p.evaluate(i => { const R = window.RPD; R.FieldManager.select(i); }, idx);
    const BOARD = ['charizard', 'blastoise', 'venusaur', 'pikachu', 'clefairy'];

    // (b) 빈 응원 칸 — 무료 2칸 열림 · 400G · 900G 잠김
    await p.evaluate(prep, { wave: 7, units: BOARD });
    await p.waitForTimeout(400);
    const b = await p.evaluate(() => {
      const F = window.RPD.FieldManager;
      return { open: F.cheerSlots().filter(s => s.unlocked).length, locked: F.lockedCheerSlots().map(s => s.cost), sumHidden: document.getElementById('cheerSummary').hidden };
    });
    if (b.open !== 2 || b.locked.join(',') !== '400,900' || !b.sumHidden) bad('(b) ' + JSON.stringify(b));
    await shot('b_empty');

    // (c) 응원 가능 2마리 + 요약 줄(PC 오른쪽 시너지 패널 · 휴대폰은 시너지 시트)
    await p.evaluate(prep, { wave: 7, units: BOARD, cheer: ['exeggcute', 'shellder'] });
    if (mode === 'portrait') await p.evaluate(() => window.RPD.HudPanels.setDrawer('synergy'));
    await p.waitForTimeout(450);
    const c = await p.evaluate(() => { const s = document.getElementById('cheerSummary'); return { hidden: s.hidden, text: s.textContent.replace(/\s+/g, ' ').trim() }; });
    // 시너지 — 응원 칸 셀러(물)도 센다(세션 83): 필드 거북왕 + 응원 셀러 = 물 2종
    c.water = await p.evaluate(() => ({ n: window.RPD.SynergyManager.countOf('WATER'),
      row: ((document.querySelector('#synergyBody .synrow[data-type="WATER"]') || {}).textContent || '').replace(/\s+/g, ' ').trim() }));
    if (c.water.n !== 2 || !/물\s*2/.test(c.water.row)) bad('(c) 응원 칸이 시너지에 안 셌다 ' + JSON.stringify(c.water));
    if (c.hidden || !/공격력 \+5%/.test(c.text) || !/공속 \+4%/.test(c.text) || !/방어 무시 \+5%/.test(c.text)) bad('(c) 요약 줄 ' + JSON.stringify(c));
    await p.click('#cheerSummary').catch(() => {});
    await p.waitForTimeout(200);
    const c2 = await p.evaluate(() => document.getElementById('cheerSummary').classList.contains('is-open'));
    if (!c2) bad('(c) 요약 줄을 눌러도 종별 내역이 안 열린다');
    await shot('c_two');
    if (mode === 'portrait') await p.evaluate(() => window.RPD.HudPanels.setDrawer(null));

    // (d) 응원 칸 정보 — PC 카드 · 휴대폰 정보 바(+ 자세한 정보 시트)
    await p.evaluate(prep, { wave: 7, units: BOARD, cheer: ['exeggcute', 'shellder'] });
    const cIdx = await p.evaluate(() => window.RPD.FieldManager.cheerSlots()[1].index);
    await tapSlot(cIdx); await p.waitForTimeout(350);
    const d = await p.evaluate(() => ({
      card: (document.getElementById('slotBody').innerText || '').replace(/\s+/g, ' '),
      bar: (document.getElementById('infoBar') ? document.getElementById('infoBar').innerText : '').replace(/\s+/g, ' '),
      up: document.getElementById('upgradeCost').textContent
    }));
    const dText = mode === 'pc' ? d.card : d.bar;
    if (!/응원: 공격력 \+5% · 방어 무시 \+5%/.test(dText) || !/필드 전체/.test(dText)) bad('(d) ' + dText.slice(0, 160));
    if (d.up !== '응원 칸은 강화 불가') bad('(d) 강화 버튼 ' + d.up);
    if (mode === 'portrait' && /강화/.test(d.bar)) bad('(d) 정보 바에 [강화] 가 있다');
    await shot('d_card');
    if (mode === 'portrait') {
      await p.evaluate(() => window.RPD.MobileSheet.openDetail()); await p.waitForTimeout(450);
      await p.screenshot({ path: OUT('28_cheer_d2_detail_portrait.png') });
      await p.evaluate(() => window.RPD.MobileSheet.closeDetail());
    }

    // (e) 전투 칸 카드 "받는 버프" — 응원 · 이웃(삐삐 옆 칸)
    await p.evaluate(() => {
      const R = window.RPD, F = R.FieldManager;
      const cf = F.slots.find(s => s.unit && s.unit.defId === 'clefairy');
      const nb = F.slots.filter(s => s.unlocked && s.zone !== 'cheer' && s !== cf && Math.hypot(s.x - cf.x, s.y - cf.y) < 150)[0];
      if (nb.unit) F.remove(nb.index);
      F.place(nb.index, R.UnitManager.create('charmeleon'));
      R.UnitManager.recomputeAll(); R.bus.emit('field:changed', {});
      F.select(nb.index);
    });
    await p.waitForTimeout(300);
    if (mode === 'portrait') { await p.evaluate(() => window.RPD.MobileSheet.openDetail()); await p.waitForTimeout(450); }
    const e = await p.evaluate(() => (document.querySelector('.sc__recv') || { innerText: '' }).innerText.replace(/\s+/g, ' '));
    if (!/받는 버프/.test(e) || !/응원 · 공격 \+\d+%/.test(e) || !/이웃 · /.test(e)) bad('(e) ' + e);
    await shot('e_received');
    if (mode === 'portrait') await p.evaluate(() => window.RPD.MobileSheet.closeDetail());

    // (f) 응원 불가(꼬렛)를 응원 칸으로 — 거절 알림
    await p.evaluate(prep, { wave: 7, units: ['rattata', ...BOARD.slice(0, 4)] });
    await p.evaluate(() => {
      const R = window.RPD, F = R.FieldManager;
      const from = F.slots.find(s => s.unit && s.unit.defId === 'rattata'), to = F.cheerSlots()[0];
      R.Loop.setPaused(false);
      F.swap(from.index, to.index);
      F.select(from.index);
    });
    await p.waitForTimeout(350);
    const f = await p.evaluate(() => ({ said: window.__said.slice(), stays: !window.RPD.FieldManager.cheerSlots()[0].unit,
      bar: document.getElementById('infoBar') ? document.getElementById('infoBar').innerText : '' }));
    if (f.said.indexOf('응원 칸에는 응원 가능한 포켓몬만 둘 수 있어요') < 0 || !f.stays) bad('(f) ' + JSON.stringify(f));
    await shot('f_reject');
    await p.evaluate(() => window.RPD.Loop.setPaused(true));

    // (g) 2라운드 실제 진행 — 흔한 응원(이상해씨) + 소환 몇 번
    await p.evaluate(prep, { wave: 2, units: ['charmander', 'squirtle', 'pidgey', 'rattata'], cheer: ['bulbasaur'], pause: false, gold: 300 });
    await p.waitForTimeout(6000);
    const g = await p.evaluate(() => {
      const R = window.RPD, U = R.FieldManager.getBattleUnits();
      return { wave: R.GameManager.wave, enemies: R.EnemyManager.aliveCount(), cheerAtk: R.UnitManager.cheer.attack, buffed: U.filter(u => u.auraParts && u.auraParts.cheer > 0).length, battle: U.length,
        cheerDmg: R.FieldManager.cheerSlots()[0].unit.totalDamage };
    });
    if (!(g.cheerAtk > 0) || g.buffed !== g.battle || g.cheerDmg > 0) bad('(g) ' + JSON.stringify(g));
    await shot('g_round2');
    await p.evaluate(() => window.RPD.Loop.setPaused(true));

    // (h) 불멸 이상(뮤) — 응원 칸엔 못 두고, 전투 칸에 두면 필드 전체(세션 83). 먼 칸 포켓몬 카드에 "📣 응원" 이 붙는다
    await p.evaluate(prep, { wave: 52, units: ['charizard', 'blastoise', 'venusaur', 'pikachu', 'mew'], cheer: ['shellder'] });
    const h = await p.evaluate(() => {
      const R = window.RPD, F = R.FieldManager;
      const mew = F.slots.find(s => s.unit && s.unit.defId === 'mew');
      const far = F.slots.filter(s => s.unit && s.zone !== 'cheer' && s.unit.defId !== 'mew').sort((a, b) => Math.hypot(b.x - mew.x, b.y - mew.y) - Math.hypot(a.x - mew.x, a.y - mew.y))[0];
      const rejected = !F.place(F.cheerSlots()[1].index, R.UnitManager.create('mew'));
      F.select(far.index);
      return { rejected, field: R.UnitManager.cheer.field, farDist: Math.round(Math.hypot(far.x - mew.x, far.y - mew.y)), farCheer: far.unit.auraParts.cheer };
    });
    if (mode === 'portrait') { await p.evaluate(() => window.RPD.MobileSheet.openDetail()); await p.waitForTimeout(450); }
    else await p.waitForTimeout(300);
    h.recv = await p.evaluate(() => (document.querySelector('.sc__recv') || { innerText: '' }).innerText.replace(/\s+/g, ' '));
    h.sum = await p.evaluate(() => document.getElementById('cheerSummary').textContent.replace(/\s+/g, ' '));
    if (!h.rejected || h.field.join() !== 'mew' || !(h.farCheer > 0) || !/응원/.test(h.recv) || !/뮤 \(필드 · 불멸\)/.test(h.sum)) bad('(h) ' + JSON.stringify(h));
    await shot('h_mew_field');
    if (mode === 'portrait') await p.evaluate(() => window.RPD.MobileSheet.closeDetail());

    report[mode] = { h, b, c, d: { text: dText.slice(0, 120), up: d.up }, e, f: f.said, g };
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
    console.log('cheer', JSON.stringify(r.report));
    console.log('cheer problems', JSON.stringify(r.problems));
    await browser.close();
    if (r.problems.length) process.exitCode = 1;
  })();
}
