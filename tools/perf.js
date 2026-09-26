/* perf.js — 휴대폰 성능 재기 (모바일 ④ · 세션 54).
 *
 *   node tools/perf.js [CPU배율=4] [초=12]      → 표 + dist/perf_report.json
 *
 * 실제 크로미움으로 갤럭시 S24 세로를 흉내 내고, CPU 를 느리게(CDP Emulation.setCPUThrottlingRate) 해서 저사양 휴대폰을 흉내 낸다.
 * 장면: 후반 전투(26칸 가득 · 3배속 / 1배속) · 일시정지 · 대기 화면(판 시작 전).
 * 재는 것
 *   fps · 프레임 시간(중앙 · 95%) · 느린 프레임(> 33ms) 비율      — 부드러움
 *   메인 스레드 바쁨 %(CDP TaskDuration / 벽시계)                 — 발열 · 배터리의 대리 지표(낮을수록 좋다)
 *   한 프레임 안의 나눔: 게임 규칙(update) · 그리기 레이어별 · 화면(DOM) 이벤트별
 * 헤드리스 크로미움은 GPU 가 없어 캔버스 그리기도 CPU 로 한다 — 실제 폰보다 그리기가 비싸게 나오니 "전후 비교"로만 읽는다.
 */
'use strict';
const fs = require('fs');
const path = require('path');
let playwright;
try { playwright = require('playwright'); }
catch (e) { playwright = require('/home/claude/.npm-global/lib/node_modules/playwright'); }
const SANDBOX_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync(SANDBOX_CHROME) ? SANDBOX_CHROME : undefined);
const ROOT = path.join(__dirname, '..');
const URL = 'file://' + path.join(ROOT, 'index.html');
const RATE = +(process.argv[2] || 4);
const SECS = +(process.argv[3] || 12);

/* 페이지 안: 시간 재는 장치를 단다(게임 코드는 건드리지 않고 함수만 감싼다) */
function instrument() {
  const R = window.RPD, now = () => performance.now();
  const P = window.__perf = { frames: [], upd: 0, ren: 0, layers: {}, bus: {}, steps: 0 };
  let last = 0;
  (function raf(t) { if (last) P.frames.push(t - last); last = t; requestAnimationFrame(raf); })();
  R.Loop._updateFns = R.Loop._updateFns.map(f => function (dt) { const t = now(); f(dt); P.upd += now() - t; P.steps += 1; });
  P.draws = 0;
  const render = R.Renderer.render.bind(R.Renderer);
  R.Renderer.render = function (dt) { const t = now(); render(dt); P.ren += now() - t; P.draws += 1; };
  R.Renderer.layers.forEach((l, i) => { const f = l.fn, name = 'L' + l.order + '#' + i; l.fn = function (ctx, dt) { const t = now(); f(ctx, dt); P.layers[name] = (P.layers[name] || 0) + now() - t; }; });
  const emit = R.bus.emit.bind(R.bus);
  R.bus.emit = function (ev, p) { const t = now(); const r = emit(ev, p); P.bus[ev] = (P.bus[ev] || 0) + now() - t; return r; };
  const clock = R.UIManager.refreshClock;
  R.UIManager.refreshClock = function () { const t = now(); clock.apply(this, arguments); P.bus['(refreshClock)'] = (P.bus['(refreshClock)'] || 0) + now() - t; };
}

function reset() { const P = window.__perf; P.frames = []; P.upd = 0; P.ren = 0; P.layers = {}; P.bus = {}; P.steps = 0; P.draws = 0; }

function heavyBattle({ wave, speed }) {
  const R = window.RPD;
  if (R.TutorialManager && R.TutorialManager.skip) R.TutorialManager.skip();
  document.querySelectorAll('.modepick, .result, .help, .book').forEach(o => o.hidden = true);
  R.Game.resetAll('NORMAL', 'NORMAL'); R.Game.startRun('NORMAL', 'NORMAL');
  R.GameManager.setWave(wave); R.WaveManager.startRound(wave);
  const F = R.FieldManager;
  // 26칸 전부 · 광역 · 연쇄 · 단일이 섞인 후반 덱(전설 · 희귀함 위주)
  const pool = R.PokemonData.all().map(id => R.PokemonData.get(id)).filter(d => ['T3', 'T4', 'T5'].includes(d.tier));
  pool.sort((a, b) => (a.id < b.id ? -1 : 1));
  F.slots.forEach((s, i) => { s.unlocked = true; if (!s.unit) F.place(s.index, R.UnitManager.create(pool[(i * 7) % pool.length].id)); });
  R.UnitManager.recomputeAll(); R.bus.emit('field:changed', {});
  R.GameManager.life = 9999;
  R.Loop.setSpeed(speed); R.Loop.setPaused(false);
  return { units: F.getUnits().length };
}

(async () => {
  const browser = await playwright.chromium.launch({ executablePath, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ ...playwright.devices['Galaxy S24'], defaultBrowserType: undefined });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForTimeout(1200);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: RATE });
  await page.evaluate(instrument);
  // 실험(도구 전용): PERF_EXP=norender(그리기 안 함) · dpr1(해상도 1배) · half(두 프레임에 한 번 그리기)
  const EXP = process.env.PERF_EXP || '';
  if (EXP) await page.evaluate(exp => {
    const R = window.RPD.Renderer;
    if (exp === 'norender') R.render = function () {};
    if (exp === 'nopacer') window.RPD.FramePacer.tick = dt => dt;   // 적용 전과 같게(매 프레임 · 화질 고정)
    if (exp === 'dpr1') { Object.defineProperty(window, 'devicePixelRatio', { get: () => 1 }); R.resize(); }
    if (exp === 'half') { const r = R.render.bind(R); let k = 0; R.render = function (dt) { if ((k++ & 1) === 0) r(dt); }; }
  }, EXP);

  const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  const measure = async (name, setup, arg, warm) => {
    const info = setup ? await page.evaluate(setup, arg) : null;
    await page.waitForTimeout(warm || 2500);   // 라운드 배너 · 적이 쏟아지고 화질이 자리 잡을 때까지           // 라운드 배너 · 적이 쏟아질 때까지
    await page.evaluate(reset);
    const m0 = await metrics(); const t0 = Date.now();
    await page.waitForTimeout(SECS * 1000);
    const m1 = await metrics(); const wall = (Date.now() - t0) / 1000;
    const p = await page.evaluate(() => {
      const P = window.__perf, R = window.RPD, f = P.frames.slice().sort((a, b) => a - b);
      const q = x => f.length ? f[Math.min(f.length - 1, Math.floor(f.length * x))] : 0;
      return { n: P.frames.length, p50: q(0.5), p95: q(0.95), slow: P.frames.filter(x => x > 34).length / Math.max(1, P.frames.length),
        upd: P.upd, ren: P.ren, steps: P.steps, draws: P.draws,
        pacer: R.FramePacer ? { level: R.FramePacer.level, mode: R.FramePacer.mode } : null, layers: P.layers, bus: P.bus,
        enemies: R.EnemyManager.enemies.length,
        canvas: [R.Renderer.canvas.width, R.Renderer.canvas.height], dpr: R.Renderer.dpr };
    });
    const busy = (m1.TaskDuration - m0.TaskDuration) / wall;
    const row = {
      scene: name, info, drawFps: +(p.draws / wall).toFixed(1), rafFps: +(p.n / wall).toFixed(1), pacer: p.pacer, p50: +p.p50.toFixed(1), p95: +p.p95.toFixed(1), slowPct: Math.round(p.slow * 100),
      busyPct: Math.round(busy * 100), scriptPct: Math.round((m1.ScriptDuration - m0.ScriptDuration) / wall * 100),
      layoutStylePct: Math.round(((m1.LayoutDuration - m0.LayoutDuration) + (m1.RecalcStyleDuration - m0.RecalcStyleDuration)) / wall * 100),
      layoutCount: Math.round((m1.LayoutCount - m0.LayoutCount) / wall), styleCount: Math.round((m1.RecalcStyleCount - m0.RecalcStyleCount) / wall),
      updMsPerSec: Math.round(p.upd / wall), renMsPerSec: Math.round(p.ren / wall), simSpeed: +(p.steps / 60 / wall).toFixed(2),
      layers: Object.fromEntries(Object.entries(p.layers).map(([k, v]) => [k, Math.round(v / wall)]).sort((a, b) => b[1] - a[1])),
      bus: Object.fromEntries(Object.entries(p.bus).map(([k, v]) => [k, Math.round(v / wall)]).filter(e => e[1] >= 1).sort((a, b) => b[1] - a[1]).slice(0, 8)),
      canvas: p.canvas, dpr: p.dpr, enemies: p.enemies
    };
    console.log(JSON.stringify(row));
    return row;
  };

  const rows = [];
  // 대기 화면 — 첫 화면(판 시작 전) 그대로
  rows.push(await measure('대기 화면', null));
  rows.push(await measure('후반 전투 3배속', heavyBattle, { wave: 55, speed: 3 }, 20000));
  rows.push(await measure('후반 전투 1배속', heavyBattle, { wave: 55, speed: 1 }, 6000));
  rows.push(await measure('일시정지', () => { window.RPD.Loop.setPaused(true); return null; }));
  const out = { exp: process.env.PERF_EXP || '', rate: RATE, secs: SECS, device: 'Galaxy S24 세로 흉내', rows, errors: errors.slice(0, 3) };
  fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'dist', `perf_report_x${RATE}${process.env.PERF_EXP ? '_' + process.env.PERF_EXP : ''}.json`), JSON.stringify(out, null, 2));
  console.log(`\n[CPU x${RATE}${process.env.PERF_EXP ? ' · ' + process.env.PERF_EXP : ''}] 장면 | 그린 fps | 화면 새로고침 fps · 중앙/95% ms | 바쁨% (스크립트 · 레이아웃+스타일) | 게임 속도 | 화질(해상도)`);
  for (const r of rows) console.log(`${r.scene} | ${r.drawFps} | ${r.rafFps} · ${r.p50}/${r.p95} | ${r.busyPct}% (${r.scriptPct} · ${r.layoutStylePct}) | ${r.simSpeed}x | ${r.pacer ? r.pacer.level + ' · ' + r.pacer.mode : '-'} (${r.dpr})`);
  if (errors.length) console.log('errors', errors);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
