/* musicplay.js — 배경음악 파일을 실제 크로미움에서 틀어 본다 (세션 55).
 *
 *   node tools/musicplay.js      (npm run screenshot 끝에서도 돈다) → 결과 표 + dist/music_report.json
 *
 * 저장소에는 곡 파일이 없다. 그래서 짧은 소리(WAV, 이름만 .mp3)를 만들어
 *   A. 더블클릭(file://)  — 임시 폴더에 게임을 링크하고 assets/music/ 에 calm · battle 만 둔다
 *   B. 인터넷 주소(http) — 작은 웹 서버가 calm 만 준다
 *   C. 파일 없음          — 저장소 그대로(file://)
 *   D. 한 파일짜리 테스트판(dist)
 * 을 연다. 브라우저는 "누르기 전 재생 금지"(--autoplay-policy=user-gesture-required) — 휴대폰과 같은 조건.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
let playwright;
try { playwright = require('playwright'); }
catch (e) { playwright = require('/home/claude/.npm-global/lib/node_modules/playwright'); }
const SANDBOX_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync(SANDBOX_CHROME) ? SANDBOX_CHROME : undefined);
const ROOT = path.join(__dirname, '..');

function wav(freq, secs = 4, rate = 8000) {
  const n = secs * rate, buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin(2 * Math.PI * freq * i / rate) * 8000), 44 + i * 2);
  return buf;
}

/* 페이지 안에서 쓰는 관찰 도구 */
const peek = () => {
  const R = window.RPD, A = R.AudioManager, F = R.MusicFiles;
  const els = {};
  Object.keys(F.entries).forEach(k => { const e = F.entries[k]; els[k] = { status: e.status, paused: e.el.paused, t: +e.el.currentTime.toFixed(2), vol: +e.el.volume.toFixed(3), graph: !!e.gain, gain: e.gain ? +e.gain.gain.value.toFixed(3) : null }; });
  return { ready: A.ready, source: A.source, track: A.track, synth: A.debug().timer, els };
};

async function scenario(browser, name, url) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url);
  await page.waitForTimeout(800);
  const out = { name, before: await page.evaluate(peek) };
  await page.mouse.click(4, 4);                        // 첫 누르기(빈 곳)
  await page.waitForTimeout(700);
  out.afterTap = await page.evaluate(peek);
  await page.evaluate(() => window.RPD.AudioManager.setTrack('battle'));
  await page.waitForTimeout(400);
  out.crossMid = await page.evaluate(peek);
  await page.waitForTimeout(1100);
  out.crossEnd = await page.evaluate(peek);
  await page.evaluate(() => window.RPD.AudioManager.setMusicVolume(0.2));
  out.vol02 = await page.evaluate(peek);
  await page.evaluate(() => window.RPD.AudioManager.setMuted(true));
  out.muted = await page.evaluate(peek);
  await page.evaluate(() => { window.RPD.AudioManager.setMuted(false); window.RPD.AudioManager.setMusicVolume(0.35); window.RPD.AudioManager.setTrack('boss'); });
  await page.waitForTimeout(1300);
  out.boss = await page.evaluate(peek);
  out.errors = errors.slice(0, 3);
  await page.close();
  return out;
}

(async () => {
  // A. file:// — 임시 폴더에 게임을 링크하고 곡 두 개만
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'porandi-music-'));
  fs.copyFileSync(path.join(ROOT, 'index.html'), path.join(tmp, 'index.html'));
  for (const d of ['js', 'css']) fs.symlinkSync(path.join(ROOT, d), path.join(tmp, d));
  fs.mkdirSync(path.join(tmp, 'assets'));
  for (const d of fs.readdirSync(path.join(ROOT, 'assets'))) if (d !== 'music') fs.symlinkSync(path.join(ROOT, 'assets', d), path.join(tmp, 'assets', d));   // music 은 아래에서 따로(저장소 쪽엔 README 만)
  fs.mkdirSync(path.join(tmp, 'assets', 'music'));
  fs.writeFileSync(path.join(tmp, 'assets/music/calm.mp3'), wav(440));
  fs.writeFileSync(path.join(tmp, 'assets/music/battle.mp3'), wav(660));

  // B. http — calm 만
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
    if (rel === 'assets/music/calm.mp3') { res.writeHead(200, { 'Content-Type': 'audio/wav' }); res.end(wav(440)); return; }
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200); fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));

  const browser = await playwright.chromium.launch({ executablePath, args: ['--no-sandbox', '--autoplay-policy=user-gesture-required'] });
  const rows = [];
  rows.push(await scenario(browser, 'A. 더블클릭(file://) · calm · battle 파일 있음', 'file://' + path.join(tmp, 'index.html')));
  rows.push(await scenario(browser, 'B. 인터넷 주소(http) · calm 만 있음', `http://127.0.0.1:${server.address().port}/index.html`));
  rows.push(await scenario(browser, 'C. 파일 없음(저장소 그대로 · file://)', 'file://' + path.join(ROOT, 'index.html')));
  const dist = path.join(ROOT, 'dist', '포켓몬랜덤디펜스_테스트.html');
  if (fs.existsSync(dist)) rows.push(await scenario(browser, 'D. 한 파일짜리 테스트판', 'file://' + dist));
  await browser.close();
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });

  // 판정
  const ok = (c, why) => ({ ok: !!c, why });
  const judge = r => {
    const E = s => r[s].els;
    if (r.name.startsWith('A')) return [
      ok(!r.before.ready && Object.values(E('before')).every(e => e.paused), '누르기 전: 소리 없음'),
      ok(E('before').calm.status === 'ok' && E('before').boss.status === 'failed', '있는 파일 ok · 없는 파일 failed'),
      ok(r.afterTap.source === 'file' && !E('afterTap').calm.paused && E('afterTap').calm.t > 0 && !r.afterTap.synth, '누른 뒤: calm 파일이 실제로 재생(시간이 흐름) · 합성 꺼짐'),
      ok(Math.abs(E('afterTap').calm.vol - 0.35) < 0.01, 'file:// 음량 = 배경음 음량 0.35'),
      ok(!E('crossMid').calm.paused && !E('crossMid').battle.paused && E('crossMid').calm.vol < 0.35 && E('crossMid').battle.vol > 0, '겹쳐 넘어가는 중: 둘 다 재생'),
      ok(E('crossEnd').calm.paused && !E('crossEnd').battle.paused, '1초 뒤: battle 만'),
      ok(Math.abs(E('vol02').battle.vol - 0.2) < 0.01, '음량 0.2 → 파일도 0.2'),
      ok(E('muted').battle.paused, '음소거 → 멈춤'),
      ok(r.boss.source === 'synth' && r.boss.synth && E('boss').battle.paused, '파일 없는 boss → 합성')
    ];
    if (r.name.startsWith('B')) return [
      ok(!r.before.ready && Object.values(E('before')).every(e => e.paused), '누르기 전: 소리 없음'),
      ok(r.afterTap.source === 'file' && !E('afterTap').calm.paused && E('afterTap').calm.graph && E('afterTap').calm.t > 0, '누른 뒤: calm 파일 재생 · WebAudio 연결'),
      ok(r.crossEnd.source === 'synth' && r.crossEnd.synth && E('crossEnd').calm.paused, 'battle 파일 없음 → 합성으로 넘어감')
    ];
    if (r.name.startsWith('C')) return [
      ok(Object.values(E('before')).every(e => e.status === 'failed'), '파일 여섯 개 전부 failed'),
      ok(r.afterTap.source === 'synth' && r.afterTap.synth, '누른 뒤: 합성 음악(예전과 같음)'),
      ok(r.errors.length === 0, '오류 없음')
    ];
    return [
      ok(Object.keys(E('before')).length === 0, '파일을 찾지 않음'),
      ok(r.afterTap.source === 'synth' && r.afterTap.synth, '합성 음악')
    ];
  };
  const report = rows.map(r => ({ ...r, checks: judge(r) }));
  fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'dist', 'music_report.json'), JSON.stringify(report, null, 2));
  let bad = 0;
  for (const r of report) {
    console.log('\n' + r.name + (r.errors.length ? '  errors: ' + r.errors.join(' | ') : ''));
    for (const c of r.checks) { console.log('  ' + (c.ok ? 'PASS' : 'FAIL') + '  ' + c.why); if (!c.ok) bad += 1; }
  }
  console.log(bad ? `\n배경음악 실제 재생 문제 ${bad}건` : '\n배경음악 실제 재생 이상 없음');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
