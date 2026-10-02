/* cheerlayout.js — 응원 칸 배치안(0단계 · 세션 82) 미리보기.
 * 테스트판(dist)을 실제 크로미움으로 띄워, 후보 칸을 필드 위에 그리고(게임 칸 그리기에 덧그림) PC · 갤럭시 S24 세로로 찍는다.
 * 후보마다 잰다: 경로와의 거리(칸 가장자리가 길 폭에 안 닿는가: 중심 ≥ 길 반폭 21 + 칸 반 28 = 49) · 기존 칸(확장 포함)과 중심 거리 ≥ 60 ·
 * 필드 안 · 필드 위에 떠 있는 HUD(진행 칩 · 보스 보상 칩 · 웨이브 배너)와 화면에서 겹치는가 · 손가락 크기(화면 px).
 * 캡처: dist/27_cheer_layout_{A|B}_{pc|portrait}.png · 응원 칸이 생긴 뒤(세션 82)엔 기존 칸 거리에서 응원 칸을 뺀다 */
const fs = require('fs'), path = require('path');
let playwright;
try { playwright = require('playwright'); } catch (e) { playwright = require('/home/claude/.npm-global/lib/node_modules/playwright'); }
const { chromium, devices } = playwright;
const SANDBOX_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync(SANDBOX_CHROME) ? SANDBOX_CHROME : undefined);
const URL = 'file://' + path.join(__dirname, '..', 'dist') + '/' + encodeURIComponent('포켓몬랜덤디펜스_테스트.html');

/* 후보 — base(처음부터 열림) 2칸 + paid(골드로 여는) 2칸 */
const PLANS = {
  A: { name: 'A 출구 옆 모서리', cells: [
    { x: 900, y: 120, paid: false }, { x: 900, y: 480, paid: false },
    { x: 968, y: 120, paid: true, cost: 400 }, { x: 968, y: 480, paid: true, cost: 900 } ] },
  B: { name: 'B 가운데 위 · 아래 트인 주머니', cells: [
    { x: 300, y: 185, paid: false }, { x: 300, y: 415, paid: false },
    { x: 650, y: 185, paid: true, cost: 400 }, { x: 650, y: 415, paid: true, cost: 900 } ] }
};

(async () => {
  const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
  const report = {};
  let fail = 0;
  for (const key of Object.keys(PLANS)) {
    for (const mode of ['pc', 'portrait']) {
      const ctx = await browser.newContext(mode === 'pc' ? { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } : { ...devices['Galaxy S24'], defaultBrowserType: undefined });
      const p = await ctx.newPage();
      await p.goto(URL); await p.waitForTimeout(1000);
      const r = await p.evaluate((plan) => {
        const R = window.RPD;
        if (R.TutorialManager && R.TutorialManager.skip) R.TutorialManager.skip();
        document.querySelectorAll('.modepick, .result, .help, .book').forEach(o => o.hidden = true);
        R.Game.resetAll('NORMAL', 'NORMAL'); R.Game.startRun('NORMAL', 'NORMAL');
        R.GameManager.setWave(12); R.WaveManager.startRound(12);
        const F = R.FieldManager;
        ['clefairy', 'pikachu', 'charmander', 'squirtle', 'bulbasaur'].forEach((id, i) => { const s = F.slots.filter(x => x.unlocked && !x.blocked && !x.unit)[0]; if (s) F.place(s.index, R.UnitManager.create(id)); });
        R.UnitManager.recomputeAll(); R.bus.emit('field:changed', {});
        R.GameManager.gold = 500;
        // 덧그림 — 응원 칸 모양(보라 깃발 판 · 금테 · "응원" · 잠긴 칸은 가격)
        const orig = R.MapRenderer.drawSlots;
        R.MapRenderer.drawSlots = function (c) {
          orig.call(this, c);
          plan.cells.forEach(cell => {
            const s = 56, x = cell.x - s / 2, y = cell.y - s / 2;
            c.save();
            c.beginPath(); c.roundRect(x, y, s, s, 12);
            c.fillStyle = cell.paid ? 'rgba(60,30,90,0.55)' : 'rgba(120,60,170,0.55)'; c.fill();
            c.setLineDash(cell.paid ? [3, 4] : []); c.lineWidth = 2.2; c.strokeStyle = '#ffd23f'; c.stroke(); c.setLineDash([]);
            const at = (dx, dy) => R.Renderer.at(cell.x, cell.y, dx, dy);
            const f = at(-14, -14);
            c.font = '700 16px ' + R.FONT_STACK; c.textAlign = 'center'; c.textBaseline = 'middle';
            c.fillStyle = '#ffd23f'; c.fillText('⚑', f.x, f.y);
            const t = at(0, cell.paid ? -4 : 2);
            c.font = '900 13px ' + R.FONT_STACK; c.fillStyle = '#fff3b8'; c.fillText('응원', t.x, t.y);
            if (cell.paid) { const g = at(0, 14); c.font = '700 10px ' + R.FONT_STACK; c.fillStyle = '#ffd23f'; c.fillText(cell.cost + 'G', g.x, g.y); }
            c.restore();
          });
          const lab = R.Renderer.at(plan.cells[0].x, plan.cells[0].y, 0, -44);
          c.save(); c.font = '900 14px ' + R.FONT_STACK; c.textAlign = 'center'; c.fillStyle = '#ffffff'; c.strokeStyle = 'rgba(0,0,0,.7)'; c.lineWidth = 3;
          c.strokeText(plan.name, lab.x, lab.y); c.fillText(plan.name, lab.x, lab.y); c.restore();
        };
        R.Loop.setPaused(true);
        // 잰다
        const segDist = (px, py, a, b) => { const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy; let t = L ? ((px - a.x) * dx + (py - a.y) * dy) / L : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy)); };
        const pathDist = (x, y) => { let m = 1e9; R.MapData.routes.forEach(rt => { for (let i = 1; i < rt.length; i++) m = Math.min(m, segDist(x, y, rt[i - 1], rt[i])); }); return m; };
        const cv = document.getElementById('gameCanvas'), cr = cv.getBoundingClientRect();
        const fit = R.Renderer._fit.fitOf(cr.width, cr.height, R.Renderer.rotated);
        const huds = ['waveStatus', 'nextReward', 'waveBanner'].map(id => document.getElementById(id)).filter(n => n && !n.hidden && getComputedStyle(n).display !== 'none' && getComputedStyle(n).visibility !== 'hidden')
          .map(n => { const b = n.getBoundingClientRect(); return { id: n.id, l: b.left, t: b.top, r: b.right, b: b.bottom }; }).filter(b => b.r > b.l && b.b > b.t);
        const cells = plan.cells.map(cell => {
          const pd = pathDist(cell.x, cell.y);
          const nearSlot = Math.min(...R.MapData.slots.filter(s => s.zone !== 'cheer').map(s => Math.hypot(s.x - cell.x, s.y - cell.y)));
          const nearCheer = Math.min(...plan.cells.filter(o => o !== cell).map(o => Math.hypot(o.x - cell.x, o.y - cell.y)));
          const a = R.Renderer._fit.forward(fit, cell.x - 28, cell.y - 28), b = R.Renderer._fit.forward(fit, cell.x + 28, cell.y + 28);
          const rect = { l: cr.left + Math.min(a.x, b.x), t: cr.top + Math.min(a.y, b.y), r: cr.left + Math.max(a.x, b.x), b: cr.top + Math.max(a.y, b.y) };
          const hit = huds.filter(h => !(h.r <= rect.l || h.l >= rect.r || h.b <= rect.t || h.t >= rect.b)).map(h => h.id);
          const inView = cell.x - 28 >= 0 && cell.x + 28 <= R.VIEW.width && cell.y - 28 >= 0 && cell.y + 28 <= R.VIEW.height;
          return { x: cell.x, y: cell.y, pathDist: Math.round(pathDist(cell.x, cell.y)), nearSlot: Math.round(nearSlot), nearCheer: Math.round(nearCheer),
            inView, hud: hit, screenPx: Math.round(rect.r - rect.l), ok: pd >= 49 && nearSlot >= 60 && nearCheer >= 60 && inView && !hit.length };
        });
        return { cells, huds: huds.map(h => h.id) };
      }, PLANS[key]);
      await p.waitForTimeout(250);
      await p.evaluate(() => { const R = window.RPD; if (R.Renderer.draw) R.Renderer.draw(); else if (R.Loop && R.Loop.renderOnce) R.Loop.renderOnce(); });
      await p.waitForTimeout(250);
      await p.screenshot({ path: path.join(__dirname, '..', 'dist', '27_cheer_layout_' + key + '_' + mode + '.png') });
      report[key + '_' + mode] = r;
      if (r.cells.some(c => !c.ok)) fail++;
      await ctx.close();
    }
  }
  await browser.close();
  console.log(JSON.stringify(report, null, 1));
  if (fail) { console.log('조건을 못 맞춘 배치 ' + fail + '개'); process.exitCode = 1; }
})();
