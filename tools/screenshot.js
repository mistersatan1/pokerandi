/* 테스트판(dist)을 실제 크로미움으로 띄워 장면을 찍는다 — 적용할 때마다 캡처를 남기는 용도.
 * 준비: npm install && npx playwright install chromium   (그 다음 npm run build)
 * 크로미움이 따로 있으면 CHROMIUM_PATH=/경로/chrome 로 지정할 수 있다. */
const fs = require('fs');
let playwright;
try { playwright = require('playwright'); }
catch (e) { playwright = require('/home/claude/.npm-global/lib/node_modules/playwright'); }   // 작업 샌드박스용
const { chromium } = playwright;
const SANDBOX_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync(SANDBOX_CHROME) ? SANDBOX_CHROME : undefined);
const URL = 'file://' + require('path').join(__dirname, '..', 'dist') + '/' + encodeURIComponent('포켓몬랜덤디펜스_테스트.html');
(async () => {
  const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForTimeout(1500);

  // 공통 준비 — 안내·오버레이 치우고 노멀 한 판 시작
  const setup = async (wave) => page.evaluate((wave) => {
    const R = window.RPD;
    if (R.TutorialManager && R.TutorialManager.skip) R.TutorialManager.skip();
    document.querySelectorAll('.modepick, .result, .help, .book').forEach(o => o.hidden = true);
    R.Game.resetAll('NORMAL', 'NORMAL');
    R.Game.startRun('NORMAL', 'NORMAL');
    R.GameManager.setWave(wave);
    R.WaveManager.startRound(wave);
    const F = R.FieldManager;
    const team = ['charizard', 'blastoise', 'venusaur', 'dragonite', 'gengar', 'alakazam', 'arcanine', 'lapras',
                  'gyarados', 'machamp', 'golem', 'starmie', 'raichu', 'nidoking'];
    let i = 0;
    F.slots.filter(s => s.unlocked).forEach(s => { if (i < team.length) F.place(s.index, R.UnitManager.create(team[i++])); });
    R.UnitManager.recomputeAll();
    R.GameManager.gold = 1420;
    R.bus.emit('field:changed', {});
    return F.getUnits().length;
  }, wave);

  // ① 골드 상점
  console.log('field', await setup(23));
  await page.evaluate(() => {
    const R = window.RPD, G = R.GoldShopManager;
    G.tierLv.T2 = 3; G.typeLv.FIRE = 2; R.UnitManager.recomputeAll();
    R.GoldShopUI.show();
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: require('path').join(__dirname, '..', 'dist', '01_goldshop.png') });
  console.log('goldshop fade (위)', await page.evaluate(() => document.querySelector('#goldShopOverlay .gshop__body').classList.contains('is-more')));
  // ①-2 골드 상점 끝까지 내림 — 아래 흐림이 사라져야 한다
  await page.evaluate(() => { const b = document.querySelector('#goldShopOverlay .gshop__body'); b.scrollTop = b.scrollHeight; });
  await page.waitForTimeout(300);
  console.log('goldshop fade (끝)', await page.evaluate(() => document.querySelector('#goldShopOverlay .gshop__body').classList.contains('is-more')));
  await page.screenshot({ path: require('path').join(__dirname, '..', 'dist', '01b_goldshop_bottom.png') });

  // ② 61라운드 벽 — 불멸 2마리를 갖춘 보드
  await page.evaluate(() => window.RPD.GoldShopUI.hide());
  await setup(61);
  const info = await page.evaluate(() => {
    const R = window.RPD, F = R.FieldManager;
    const weak = F.slots.filter(s => s.unit).slice(0, 2);
    ['moltres', 'zapdos'].forEach((id, k) => { F.remove(weak[k].index); F.place(weak[k].index, R.UnitManager.create(id)); });
    R.UnitManager.recomputeAll(); R.bus.emit('field:changed', {});
    const idx = weak[1].index;
    R.FieldManager.select(idx);   // slot 을 같이 실어 보내야 정보 카드가 뜬다 (index 만 보내면 카드가 닫힌다)
    return { wave: R.GameManager.wave, hp61: Math.round(R.WaveData.growthTo(61) / R.WaveData.growthTo(60) * 100) / 100 };
  });
  console.log(info);
  await page.waitForTimeout(4000);
  await page.screenshot({ path: require('path').join(__dirname, '..', 'dist', '02_wall61.png') });

  // ③ 포켓몬 정보 카드 확대 — 공격속도 줄
  const card = await page.$('#slotCard');
  if (card && await card.isVisible()) {
    const box = await card.boundingBox();
    await page.screenshot({ path: require('path').join(__dirname, '..', 'dist', '03_unitcard.png'),
      clip: { x: Math.max(0, box.x - 8), y: Math.max(0, box.y - 8), width: box.width + 16, height: box.height + 16 } });
    console.log('unitcard', await page.evaluate(() => document.querySelector('#slotCard .sc__stats').innerText.replace(/\n+/g, ' | ')));
  } else console.log('unitcard 안 보임');

  // ④ 공격 대상 고르기 — 카드의 [보스] 칩을 실제로 눌러 본다
  const bossChip = page.locator('#slotCard [data-tgt="BOSS"]');
  if (await bossChip.count()) {
    await bossChip.click();   // 실제 마우스 클릭 — 캔버스가 가로채거나 카드가 다시 그려져도 먹히는지 본다
    await page.waitForTimeout(300);
    console.log('targeting', await page.evaluate(() => { const s = window.RPD.FieldManager.getSelected(); return s && s.unit && s.unit.targeting; }));
    const box2 = await (await page.$('#slotCard')).boundingBox();
    await page.screenshot({ path: require('path').join(__dirname, '..', 'dist', '06_target_pick.png'),
      clip: { x: Math.max(0, box2.x - 8), y: Math.max(0, box2.y - 8), width: box2.width + 16, height: box2.height + 16 } });
  } else console.log('대상 칩 없음');
  // ⑤ 70라운드 마지막 보스 — 체력 ×0.35 · 모두 보스 우선
  await setup(70);
  const boss70 = await page.evaluate(() => {
    const R = window.RPD;
    R.FieldManager.select(-1);
    R.UnitManager.setTargetingAll('BOSS');
  });
  await page.waitForTimeout(3500);   // 보스는 라운드 시작 조금 뒤에 들어온다
  console.log('boss70', await page.evaluate(() => { const b = window.RPD.EnemyManager.boss;
    return b ? { name: b.name, maxHp: Math.round(b.maxHp), hp: Math.round(b.hp) } : null; }));
  await page.screenshot({ path: require('path').join(__dirname, '..', 'dist', '07_final_boss.png') });

  // ⑥ 마지막 보스를 놓치면 — 결과 화면
  await page.evaluate(() => window.RPD.GameManager.failFinalBoss());
  await page.waitForTimeout(800);
  console.log('result', await page.evaluate(() => { const t = document.querySelector('.result__card'); return t ? t.innerText.split('\n').slice(0, 3).join(' | ') : null; }));
  await page.screenshot({ path: require('path').join(__dirname, '..', 'dist', '08_final_boss_lost.png') });

  // ⑦ 보스 러시 20R 마지막 보스 (체력 ×10)
  const br = await page.evaluate(() => {
    const R = window.RPD;
    document.querySelectorAll('.modepick, .result, .help, .book').forEach(o => o.hidden = true);
    R.Game.resetAll('BOSS_RUSH'); R.Game.startRun('BOSS_RUSH');
    R.GameManager.setWave(20); R.WaveManager.startRound(20);
    const F = R.FieldManager;
    const team = ['machamp', 'nidoking', 'poliwrath', 'kingler', 'mewtwo', 'charizard', 'blastoise', 'dragonite', 'gengar', 'alakazam'];
    let i = 0;
    F.slots.filter(s => s.unlocked).forEach(s => { if (i < team.length) F.place(s.index, R.UnitManager.create(team[i++])); });
    R.UnitManager.setTargetingAll('BOSS'); R.UnitManager.recomputeAll(); R.bus.emit('field:changed', {});
    return true;
  });
  await page.waitForTimeout(3500);
  console.log('bossrush20', await page.evaluate(() => { const b = window.RPD.EnemyManager.boss; return b ? { name: b.name, maxHp: Math.round(b.maxHp) } : null; }));
  await page.screenshot({ path: require('path').join(__dirname, '..', 'dist', '09_bossrush_final.png') });

  // ⑩ 두 갈래 경로(세션 56) — 명당 · 갈림길 · 한쪽 · 출구 칸에 포켓몬, 두 길로 번갈아 걷는 적, 명당 칸 정보 카드
  await page.evaluate(() => {
    const R = window.RPD;
    document.querySelectorAll('.modepick, .result, .help, .book').forEach(o => o.hidden = true);
    R.Game.resetAll('NORMAL', 'NORMAL'); R.Game.startRun('NORMAL', 'NORMAL');
    R.GameManager.setWave(14); R.WaveManager.startRound(14);
    const F = R.FieldManager, put = (i, id) => F.place(i, R.UnitManager.create(id));
    F.slots.forEach(sl => { if (sl.unit) F.remove ? F.remove(sl.index) : (sl.unit = null); });   // 시작 포켓몬을 치우고 종류별로 놓는다
    // 약한 포켓몬으로 — 적이 두 길에 살아서 보이게
    const of = k => F.slots.filter(s => s.kind === k && s.unlocked).map(s => s.index);   // 칸 번호가 아니라 종류로(번호는 칸이 늘면 밀린다)
    const [c0, c1, c2] = of('center'), fork = of('fork')[0], up = of('upper'), lo = of('lower'), ex = of('exit');
    put(c0, 'charmander'); put(c1, 'pikachu'); put(c2, 'squirtle'); put(fork, 'bulbasaur');   // 명당 + 갈림길
    put(up[0], 'rattata'); put(lo[0], 'pidgey'); put(up[1], 'caterpie'); put(lo[1], 'weedle');   // 주머니(위 · 아래)
    put(ex[0], 'geodude'); put(ex[1], 'oddish');                                                 // 출구 방어
    R.UnitManager.recomputeAll(); R.bus.emit('field:changed', {});
    R.GameManager.life = 999;
  });
  await page.waitForTimeout(9000);
  console.log('routes', await page.evaluate(() => { const E = window.RPD.EnemyManager.enemies; return { top: E.filter(e => e.route === 0).length, bottom: E.filter(e => e.route === 1).length }; }));
  await page.screenshot({ path: require('path').join(__dirname, '..', 'dist', '10_twin_routes.png') });
  await page.evaluate(() => { window.RPD.Loop.setPaused(true); const F = window.RPD.FieldManager; F.select(F.slots.filter(s => s.kind === 'center')[1].index); window.RPD.bus.emit('field:changed', {}); });
  await page.waitForTimeout(400);
  console.log('centercard', await page.evaluate(() => { const c = document.querySelector('#slotCard'); return c ? c.innerText.split('\n').slice(0, 6).join(' | ') : null; }));
  await page.screenshot({ path: require('path').join(__dirname, '..', 'dist', '10b_center_slot.png') });
  await page.evaluate(() => { window.RPD.FieldManager.select(-1); window.RPD.Loop.setPaused(false); });

  console.log('errors', errors.slice(0, 5));

  /* ---------- 모바일 ① — 휴대폰 흉내(갤럭시 S24 · 아이폰 15, 세로 · 가로) ----------
   * 장면: 필드 · 서랍 열림. 재기: 칸의 화면 크기(px). 확인: 칸을 실제 터치로 눌러 그 칸이 골라지는가 ·
   * 단축키로 하는 일을 전부 화면 버튼으로도 할 수 있는가. 결과는 dist/mobile_report.json 에도 남긴다. */
  const { devices } = playwright;
  const report = [];
  for (const dev of ['Galaxy S24', 'Galaxy S24 landscape', 'iPhone 15', 'iPhone 15 landscape']) {
    const mctx = await browser.newContext({ ...devices[dev], defaultBrowserType: undefined });
    const mp = await mctx.newPage();
    const merr = [];
    mp.on('pageerror', e => merr.push(e.message));
    await mp.goto(URL);
    await mp.waitForTimeout(1200);
    await mp.evaluate(() => {
      const R = window.RPD;
      if (R.TutorialManager && R.TutorialManager.skip) R.TutorialManager.skip();
      document.querySelectorAll('.modepick, .result, .help, .book').forEach(o => o.hidden = true);
      R.Game.resetAll('NORMAL', 'NORMAL'); R.Game.startRun('NORMAL', 'NORMAL');
      R.GameManager.setWave(23); R.WaveManager.startRound(23);
      const F = R.FieldManager;
      const team = ['charizard', 'blastoise', 'venusaur', 'dragonite', 'gengar', 'alakazam', 'arcanine', 'lapras', 'gyarados', 'machamp'];
      let i = 0;
      F.slots.filter(s => s.unlocked).forEach(s => { if (i < team.length) F.place(s.index, R.UnitManager.create(team[i++])); });
      R.UnitManager.recomputeAll(); R.bus.emit('field:changed', {});
    });
    await mp.waitForTimeout(2600);   // 라운드 배너가 지나가게
    const tag = dev.replace(/ /g, '_');
    await mp.screenshot({ path: require('path').join(__dirname, '..', 'dist', 'm_' + tag + '_field.png') });

    // 칸 크기 · 필드 방향
    const geo = await mp.evaluate(() => {
      const R = window.RPD.Renderer, F = window.RPD.FieldManager;
      const c = document.getElementById('gameCanvas').getBoundingClientRect();
      return { vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio, canvas: [Math.round(c.width), Math.round(c.height)],
        rotated: R.rotated, slotCss: +(F.slots[0].size * R.scale).toFixed(1),
        pageScroll: document.documentElement.scrollHeight > innerHeight + 1 || document.documentElement.scrollWidth > innerWidth + 1 };
    });

    // 실제 터치로 칸 누르기 — 화면 위치는 Renderer 를 거치지 않고 따로 계산(시계 방향 90°)
    const targets = await mp.evaluate(() => {
      const R = window.RPD.Renderer, F = window.RPD.FieldManager;
      window.RPD.GameManager.gold = 0;   // 잠긴 칸을 눌러도 사지 않게
      const r = document.getElementById('gameCanvas').getBoundingClientRect();
      return F.slots.map(slot => {
        if (!R.rotated) {
          const s = Math.min(r.width / 1000, r.height / 600);
          return { i: slot.index, x: r.left + (r.width - 1000 * s) / 2 + slot.x * s, y: r.top + (r.height - 600 * s) / 2 + slot.y * s };
        }
        const s = Math.min(r.width / 600, r.height / 1000);
        return { i: slot.index, x: r.left + (r.width - 600 * s) / 2 + (600 - slot.y) * s, y: r.top + (r.height - 1000 * s) / 2 + slot.x * s };
      });
    });
    const wrong = [];
    for (const t of targets) {
      await mp.evaluate(() => window.RPD.FieldManager.select(-1));
      await mp.touchscreen.tap(t.x, t.y);
      const got = await mp.evaluate(() => window.RPD.FieldManager.selectedIndex);
      if (got !== t.i) wrong.push(t.i + '→' + got);
    }
    await mp.evaluate(() => window.RPD.FieldManager.select(-1));
    await mp.waitForTimeout(1300);   // 잠긴 칸을 눌러 뜬 "골드 필요" 글자가 사라지게

    // 단축키로 하는 일 → 화면 버튼으로 닿는가(필요하면 ☰ 메뉴 · 서랍 · 정보 카드를 연 뒤)
    const visible = sel => mp.evaluate(q => { const n = document.querySelector(q); if (!n) return false;
      const b = n.getBoundingClientRect(); const cs = getComputedStyle(n);
      return b.width > 4 && b.height > 4 && cs.visibility !== 'hidden' && cs.display !== 'none' && b.right > 0 && b.bottom > 0 && b.left < innerWidth && b.top < innerHeight; }, sel);
    const reach = {};
    for (const [k, sel] of [['Space 소환', '#btnSummon'], ['W 강화', '#btnUpgrade'], ['S 창고로', '#btnStore'], ['X 방출', '#btnSell'],
                            ['1·2·3 배속', '.speed__btn[data-speed="3"]'], ['P 일시정지', '#btnPause']]) reach[k] = await visible(sel);
    await mp.tap('#btnMore'); await mp.waitForTimeout(200);
    for (const [k, sel] of [['H 설명서', '#btnHelp'], ['Enter 주문', '#btnChat'], ['R 조합 사전', '#btnBook'], ['G 골드 상점', '#btnGoldShop'],
                            ['E 정예 소환', '#btnElite'], ['도감', '#btnDex'], ['소리', '#btnAudio'], ['처음부터', '#btnRestart']]) reach[k + ' (☰)'] = await visible(sel);
    if (/portrait|Galaxy S24$|iPhone 15$/.test(dev) && !/landscape/.test(dev)) await mp.screenshot({ path: require('path').join(__dirname, '..', 'dist', 'm_' + tag + '_menu.png') });
    await mp.tap('#btnMore'); await mp.waitForTimeout(200);
    await mp.tap('.mtab[data-mtab="recipes"]'); await mp.waitForTimeout(400);
    reach['C 조합 (조합식 탭)'] = await visible('#btnCraft');
    await mp.screenshot({ path: require('path').join(__dirname, '..', 'dist', 'm_' + tag + '_drawer.png') });
    await mp.tap('.mtab[data-mtab="owned"]'); await mp.waitForTimeout(300);
    reach['F 필드로 · 보유 (보유 탭)'] = await visible('#storageList');
    await mp.tap('.mtab[data-mtab="owned"]'); await mp.waitForTimeout(300);   // 서랍 닫기
    const t0 = targets.find(t => t.i === 0);
    await mp.touchscreen.tap(t0.x, t0.y); await mp.waitForTimeout(300);
    // 공격 대상 칩은 보이기만 하면 안 되고 실제로 눌려야 한다(카드 안을 스크롤해서라도)
    await mp.evaluate(() => { const c = document.querySelector('#slotCard [data-tgt="BOSS"]'); if (c) c.scrollIntoView({ block: 'nearest' }); });
    await mp.waitForTimeout(150);
    reach['T 공격 대상 (정보 카드)'] = await visible('#slotCard [data-tgt="BOSS"]');
    if (reach['T 공격 대상 (정보 카드)']) {
      await mp.tap('#slotCard [data-tgt="BOSS"]'); await mp.waitForTimeout(200);
      reach['T 공격 대상 — 칩을 눌러 바뀜'] = await mp.evaluate(() => { const s = window.RPD.FieldManager.getSelected(); return !!(s && s.unit && s.unit.targeting === 'BOSS'); });
      if (/landscape/.test(dev)) await mp.screenshot({ path: require('path').join(__dirname, '..', 'dist', 'm_' + tag + '_card.png') });
    }
    reach['Esc 닫기 (정보 카드 ×)'] = await visible('#btnSlotClose');
    const missing = Object.keys(reach).filter(k => !reach[k]);

    report.push({ device: dev, ...geo, slotPx: +(geo.slotCss * geo.dpr).toFixed(0), tapWrong: wrong, tapCount: targets.length, missing, errors: merr.slice(0, 3) });
    console.log('mobile', dev, JSON.stringify({ canvas: geo.canvas, rotated: geo.rotated, slotCss: geo.slotCss, tapOk: targets.length - wrong.length + '/' + targets.length, missing, scroll: geo.pageScroll, errors: merr.slice(0, 2) }));
    await mctx.close();
  }
  /* ---------- 모바일 ② 터치 — 실제 손가락 이벤트(CDP Input.dispatchTouchEvent)로 ----------
   * 칸 비껴 누르기 · 흔들린 누르기는 자리를 안 바꿈 · 진짜 끌기는 바꿈 · 필드→[보유] 탭에 놓기 · 보유 칸 길게 눌러 필드로 ·
   * 목록 쓸기는 집지 않음 · 길게 누르기 말풍선(버튼은 안 눌림) · 두 번 탭 확대 없음 · 누름 영역 40px 미만 0개. */
  const touchReport = [];
  for (const dev of ['Galaxy S24', 'Galaxy S24 landscape']) {
    const tctx = await browser.newContext({ ...devices[dev], defaultBrowserType: undefined });
    const tp = await tctx.newPage();
    const terr = [];
    tp.on('pageerror', e => terr.push(e.message));
    await tp.goto(URL); await tp.waitForTimeout(1200);
    const cdp = await tctx.newCDPSession(tp);
    const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y]) => ({ x, y })) });
    const hold = ms => tp.waitForTimeout(ms);
    const tapAt = async (x, y) => { await T('touchStart', [[x, y]]); await hold(40); await T('touchEnd', []); await hold(80); };
    const drag = async (x1, y1, x2, y2, steps = 8, holdMs = 0) => {
      await T('touchStart', [[x1, y1]]); if (holdMs) await hold(holdMs);
      for (let k = 1; k <= steps; k++) { await T('touchMove', [[x1 + (x2 - x1) * k / steps, y1 + (y2 - y1) * k / steps]]); await hold(16); }
      await T('touchEnd', []); await hold(120);
    };
    await tp.evaluate(() => {
      const R = window.RPD;
      if (R.TutorialManager && R.TutorialManager.skip) R.TutorialManager.skip();
      document.querySelectorAll('.modepick, .result, .help, .book').forEach(o => o.hidden = true);
      R.Game.resetAll('NORMAL', 'NORMAL'); R.Game.startRun('NORMAL', 'NORMAL');
      R.Loop && R.Loop.setPaused && R.Loop.setPaused(true);
      const F = R.FieldManager, open = F.slots.filter(s => s.unlocked);
      F.place(open[0].index, R.UnitManager.create('charmander'));
      F.place(open[1].index, R.UnitManager.create('squirtle'));
      R.StorageManager.add(R.UnitManager.create('pikachu'));
      R.UnitManager.recomputeAll(); R.bus.emit('field:changed', {}); R.GameManager.gold = 0;
    });
    await hold(300);
    // 칸의 화면 위치(가운데 · 크기) — Renderer 를 거치지 않고 따로 계산
    const S = await tp.evaluate(() => {
      const R = window.RPD.Renderer, F = window.RPD.FieldManager, r = document.getElementById('gameCanvas').getBoundingClientRect();
      const rot = R.rotated, s = rot ? Math.min(r.width / 600, r.height / 1000) : Math.min(r.width / 1000, r.height / 600);
      const ox = rot ? (r.width - 600 * s) / 2 : (r.width - 1000 * s) / 2, oy = rot ? (r.height - 1000 * s) / 2 : (r.height - 600 * s) / 2;
      return F.slots.map(sl => ({ i: sl.index, x: r.left + ox + (rot ? (600 - sl.y) : sl.x) * s, y: r.top + oy + (rot ? sl.x : sl.y) * s, half: sl.size / 2 * s, unit: sl.unit ? sl.unit.defId : null, unlocked: sl.unlocked }));
    });
    const state = () => tp.evaluate(() => ({ sel: window.RPD.FieldManager.selectedIndex, at: window.RPD.FieldManager.slots.map(s => s.unit ? s.unit.defId : null),
      stored: window.RPD.StorageManager.units.map(u => u.defId) }));
    const res = {};
    const A = S.find(s => s.unit === 'charmander'), B = S.find(s => s.unit === 'squirtle');
    // ① 칸 가장자리 밖 6px 을 눌러도 그 칸(가장 가까운 칸이 그 칸인 방향으로)
    const away = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: A.x + dx * (A.half + 6), y: A.y + dy * (A.half + 6) }));
    let edgeOk = 0;
    for (const pt of away) {
      await tp.evaluate(() => window.RPD.FieldManager.select(-1));
      await tapAt(pt.x, pt.y);
      const st = await state();
      const nearest = S.map(s => ({ i: s.i, d: Math.hypot(Math.max(0, Math.abs(pt.x - s.x) - s.half), Math.max(0, Math.abs(pt.y - s.y) - s.half)) })).sort((a, b) => a.d - b.d)[0];
      if (st.sel === nearest.i) edgeOk++;
    }
    res['칸 가장자리 밖 6px 누르기 → 가장 가까운 칸'] = edgeOk + '/4';
    // ② 흔들린 누르기: A 의 B 쪽 가장자리 안에서 눌러 B 쪽으로 8px(문턱 10px 미만) 밀고 떼기 → 자리 그대로
    const dir = { x: Math.sign(B.x - A.x), y: Math.sign(B.y - A.y) };
    const sx = A.x + dir.x * (A.half - 3), sy = A.y + dir.y * (A.half - 3);
    await tp.evaluate(() => window.RPD.FieldManager.select(-1));
    await drag(sx, sy, sx + dir.x * 8, sy + dir.y * 8, 4);
    let st = await state();
    res['흔들린 누르기(8px)는 자리를 안 바꾼다'] = st.at[A.i] === 'charmander' && st.at[B.i] === 'squirtle';
    // ③ 진짜 끌기 A → B 는 자리를 바꾼다
    await drag(A.x, A.y, B.x, B.y, 10);
    st = await state();
    res['A → B 끌기는 자리를 바꾼다'] = st.at[A.i] === 'squirtle' && st.at[B.i] === 'charmander';
    // ④ 필드 → [보유] 탭에 놓기(서랍 닫힌 채) → 창고로
    // (끌기 뒤 고른 칸의 정보 카드가 아래 절반을 덮는다 — 두 갈래 맵에서는 B 가 그 아래에 있어 카드부터 닫는다. 사람도 그렇게 한다)
    await tp.evaluate(() => { window.RPD.FieldManager.select(-1); window.RPD.bus.emit('field:changed', {}); });
    await hold(150);
    const tab = await tp.evaluate(() => { const b = document.querySelector('.mtab[data-mtab="owned"]').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
    await drag(B.x, B.y, tab.x, tab.y, 12);
    st = await state();
    res['필드 → [보유] 탭에 놓으면 창고로'] = st.at[B.i] === null && st.stored.includes('charmander');
    // ⑤ 보유 칸 길게 눌러(0.4초) 집어 빈 필드 칸에 놓기 → 배치 / ⑥ 누르자마자 쓸기 → 집지 않음
    await tp.evaluate(() => window.RPD.UIManager && document.querySelector('.mtab[data-mtab="owned"]').click());
    await hold(350);
    const empty = (await tp.evaluate(() => window.RPD.FieldManager.slots.filter(s => s.unlocked && !s.unit).map(s => s.index)))[0];
    const E = (await tp.evaluate(() => {
      const R = window.RPD.Renderer, F = window.RPD.FieldManager, r = document.getElementById('gameCanvas').getBoundingClientRect();
      const rot = R.rotated, s = rot ? Math.min(r.width / 600, r.height / 1000) : Math.min(r.width / 1000, r.height / 600);
      const ox = rot ? (r.width - 600 * s) / 2 : (r.width - 1000 * s) / 2, oy = rot ? (r.height - 1000 * s) / 2 : (r.height - 600 * s) / 2;
      return F.slots.map(sl => ({ i: sl.index, x: r.left + ox + (rot ? (600 - sl.y) : sl.x) * s, y: r.top + oy + (rot ? sl.x : sl.y) * s }));
    })).find(s => s.i === empty);
    const cell = await tp.evaluate(() => { const c = document.querySelector('.scell.has-stored[data-def="pikachu"]'); if (!c) return null; c.scrollIntoView({ block: 'nearest' }); const b = c.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
    if (cell) {
      await drag(cell.x, cell.y, cell.x, cell.y - 60, 6, 0);   // 쓸기 — 집으면 안 된다
      st = await state();
      res['보유 칸을 바로 쓸면 집지 않는다(스크롤)'] = st.stored.includes('pikachu') && !st.at.includes('pikachu');
      const cell2 = await tp.evaluate(() => { const c = document.querySelector('.scell.has-stored[data-def="pikachu"]'); c.scrollIntoView({ block: 'nearest' }); const b = c.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
      await drag(cell2.x, cell2.y, E.x, E.y, 14, 420);         // 길게 눌렀다 끌기
      st = await state();
      res['보유 칸 길게 눌러 집어 필드에 놓기'] = st.at[empty] === 'pikachu';
    } else { res['보유 칸 길게 눌러 집어 필드에 놓기'] = '보유 칸 없음'; }
    await tp.evaluate(() => document.querySelector('.mtab[data-mtab="owned"]').click());   // 서랍 닫기
    await hold(300);
    // ⑦ 길게 누르기 → 설명 말풍선 · 버튼은 안 눌림 (☰ 메뉴의 골드 상점)
    await tp.evaluate(() => document.getElementById('btnMore').click()); await hold(200);
    const gs = await tp.evaluate(() => { const b = document.getElementById('btnGoldShop').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
    await T('touchStart', [[gs.x, gs.y]]); await hold(650);
    const tipTxt = await tp.evaluate(() => { const t = document.querySelector('.tipbubble'); return t && !t.hidden ? t.textContent : null; });
    if (/landscape/.test(dev) === false) await tp.screenshot({ path: require('path').join(__dirname, '..', 'dist', 'm_touch_tip.png') });
    await T('touchEnd', []); await hold(250);
    res['길게 누르기 → 설명 말풍선'] = tipTxt;
    res['말풍선을 띄운 뒤 버튼은 안 눌림'] = await tp.evaluate(() => document.getElementById('goldShopOverlay').hidden);
    await tp.evaluate(() => { const h = document.querySelector('.hud'); if (h.classList.contains('is-more-open')) document.getElementById('btnMore').click(); });
    // ⑧ 두 번 탭 확대 없음 · 필드는 브라우저 손버릇을 안 받는다
    const mid = S.find(s => !s.unit && !s.unlocked) || S[S.length - 1];
    await tapAt(mid.x + 40, mid.y + 40); await hold(60); await tapAt(mid.x + 40, mid.y + 40); await hold(300);
    res['두 번 탭해도 확대되지 않는다'] = await tp.evaluate(() => (window.visualViewport ? window.visualViewport.scale : 1) === 1);
    res['필드 touch-action: none'] = await tp.evaluate(() => getComputedStyle(document.getElementById('gameCanvas')).touchAction === 'none');
    // ⑨ 누름 영역 40px 미만(필드 · 서랍 4개 · ☰ · 정보 카드)
    const smalls = new Set();
    const scan = async () => (await tp.evaluate(() => [...document.querySelectorAll('button, [role=button], select, .scell, .tchip, .rf, [data-tgt], [data-tgt-all]')].filter(n => {
      const r = n.getBoundingClientRect(), cs = getComputedStyle(n);
      if (r.width < 1 || r.height < 1 || cs.visibility === 'hidden' || cs.display === 'none' || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return false;
      return r.width < 40 || r.height < 40;
    }).map(n => (n.id ? '#' + n.id : '.' + String(n.className).split(' ')[0]) + ' ' + Math.round(n.getBoundingClientRect().width) + 'x' + Math.round(n.getBoundingClientRect().height)))).forEach(x => smalls.add(x));
    await scan();
    for (const t of ['recipes', 'owned', 'synergy', 'dex']) { await tp.evaluate(tt => document.querySelector('.mtab[data-mtab="' + tt + '"]').click(), t); await hold(200); await scan(); }
    await tp.evaluate(() => document.querySelector('.mtab[data-mtab="dex"]').click());
    await tp.evaluate(() => document.getElementById('btnMore').click()); await hold(150); await scan(); await tp.evaluate(() => document.getElementById('btnMore').click());
    await tp.evaluate(() => window.RPD.FieldManager.select(window.RPD.FieldManager.slots.find(s => s.unit).index)); await hold(200); await scan();
    res['누름 영역 40px 미만'] = [...smalls];
    touchReport.push({ device: dev, ...res, errors: terr.slice(0, 3) });
    console.log('touch', dev, JSON.stringify(res), terr.slice(0, 2));
    await tctx.close();
  }
  report.push({ touch: touchReport });

  /* ---------- 모바일 ③ — 홈 화면 앱(세션 53) ----------
   * 설치 · 오프라인은 인터넷 주소에서만 되니, 원본 폴더(dist 아님)를 이 자리에서 작은 웹 서버로 띄워 연다(localhost 는 https 와 같게 친다).
   * 확인: 크롬이 "설치할 수 있다"고 보는가(설치 불가 사유 0) · 서비스 워커 · 오프라인 저장 · 인터넷을 끊고 다시 열어도 켜지고 처음 보는 그림이 나오는가 ·
   *       ☰ [전체 화면] · [앱 설치] · 노치 화면 여백 · 앱으로 실행 중이면 두 버튼이 숨는가. */
  const http = require('http'), pathM = require('path'), ROOT = pathM.join(__dirname, '..');
  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
    const file = pathM.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[pathM.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const APP = `http://127.0.0.1:${server.address().port}/index.html`;
  const app = { url: APP.replace(/\d+\/index/, 'PORT/index') };
  // 보통 창(시크릿 아님) — 크롬은 시크릿 창에서는 설치를 막는다
  const profile = fs.mkdtempSync(pathM.join(require('os').tmpdir(), 'porandi-app-'));
  const actx = await chromium.launchPersistentContext(profile, { ...devices['Galaxy S24'], defaultBrowserType: undefined, executablePath, args: ['--no-sandbox'] });
  const ap = await actx.newPage();
  const aerr = [];
  ap.on('pageerror', e => aerr.push(e.message));
  await ap.goto(APP);
  app.saved = await ap.evaluate(() => Promise.race([window.RPD.Pwa.ready, new Promise(r => setTimeout(r, 30000))]).then(() => {
    const P = window.RPD.Pwa; return { status: P.status, saved: P.saved, total: P.total, missing: P.missing.length };
  }));
  const cdp = await actx.newCDPSession(ap);
  const inst = await cdp.send('Page.getInstallabilityErrors');
  app.installErrors = inst.installabilityErrors.map(e => e.errorId);
  const man = await cdp.send('Page.getAppManifest');
  app.manifestErrors = (man.errors || []).map(e => e.message);
  await ap.reload(); await ap.waitForTimeout(1200);
  app.controlled = await ap.evaluate(() => !!navigator.serviceWorker.controller);

  // ☰ 메뉴 — 새 버튼 둘
  const prepAppPage = async (pg) => pg.evaluate(() => {
    const R = window.RPD;
    if (R.TutorialManager && R.TutorialManager.skip) R.TutorialManager.skip();
    document.querySelectorAll('.modepick, .result, .help, .book').forEach(o => o.hidden = true);
    R.Game.resetAll('NORMAL', 'NORMAL'); R.Game.startRun('NORMAL', 'NORMAL');
    R.GameManager.setWave(41); R.WaveManager.startRound(41);
    const F = R.FieldManager;
    // 이 판에서 처음 그리는 포켓몬들 — 오프라인에서 저장소가 없으면 대체 그림(동그라미)로 나온다
    const team = ['mewtwo', 'moltres', 'zapdos', 'articuno', 'snorlax', 'kabutops', 'omastar', 'porygon', 'ditto', 'eevee'];
    let i = 0;
    F.slots.filter(s => s.unlocked).forEach(s => { if (i < team.length) F.place(s.index, R.UnitManager.create(team[i++])); });
    R.UnitManager.recomputeAll(); R.bus.emit('field:changed', {});
  });
  await prepAppPage(ap);
  await ap.tap('#btnMore'); await ap.waitForTimeout(300);
  app.menuButtons = await ap.evaluate(() => ['btnFullscreen', 'btnInstall'].map(id => {
    const b = document.getElementById(id), r = b.getBoundingClientRect();
    return { id, shown: !b.hidden && r.width > 0, size: [Math.round(r.width), Math.round(r.height)] };
  }));
  await ap.screenshot({ path: pathM.join(ROOT, 'dist', 'm_app_menu.png') });
  // 크롬이 설치 이벤트를 줬으면 [앱 설치]가 설치 창을 띄운다(한 번만 쓸 수 있다) — 그다음 누르면 방법 말풍선
  // (진짜 설치 창은 자동 검사에서 닫혀 버리고 크롬이 이벤트를 다시 보내니, 창을 띄우는 함수만 세어 본다)
  app.installEvent = await ap.evaluate(() => {
    const ev = window.RPD.Pwa.installEvent; window.__prompts = 0;
    if (ev) ev.prompt = () => { window.__prompts += 1; return Promise.resolve(); };
    return !!ev;
  });
  await ap.tap('#btnInstall'); await ap.waitForTimeout(300);
  app.installPrompted = await ap.evaluate(() => window.__prompts === 1 && !window.RPD.Pwa.installEvent && !document.querySelector('.tipbubble:not([hidden])'));
  await ap.tap('#btnMore'); await ap.waitForTimeout(200);
  await ap.tap('#btnInstall'); await ap.waitForTimeout(300);
  app.installTip = await ap.evaluate(() => { const b = document.querySelector('.tipbubble'); if (!b || b.hidden) return null;
    const r = b.getBoundingClientRect(); return { text: b.textContent, inView: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight }; });
  await ap.screenshot({ path: pathM.join(ROOT, 'dist', 'm_app_install_tip.png') });
  await ap.tap('#btnMore'); await ap.waitForTimeout(200);
  await ap.tap('#btnFullscreen'); await ap.waitForTimeout(500);
  app.fullscreen = await ap.evaluate(() => ({ on: !!document.fullscreenElement, title: document.getElementById('btnFullscreen').title }));
  if (app.fullscreen.on) await ap.evaluate(() => document.exitFullscreen());

  // 인터넷을 끊고 다시 열기 — 켜지는가 · 처음 보는 포켓몬 그림이 저장소에서 나오는가
  await actx.setOffline(true);
  await ap.reload(); await ap.waitForTimeout(1500);
  await prepAppPage(ap);
  await ap.waitForTimeout(2600);
  app.offline = await ap.evaluate(() => {
    const R = window.RPD, units = R.FieldManager.getUnits();
    return { booted: !!(R.Game && R.GameManager.state), online: navigator.onLine,
      styled: getComputedStyle(document.querySelector('.hud')).display !== 'block',
      sprites: units.filter(u => R.Assets.isReady(u.def.sprite)).length + '/' + units.length };
  });
  await ap.screenshot({ path: pathM.join(ROOT, 'dist', 'm_app_offline.png') });
  await actx.setOffline(false);

  // 앱으로 실행 중(display-mode: fullscreen)이면 [전체 화면] · [앱 설치] 는 필요 없으니 숨는다
  // (크로미움 흉내 도구가 display-mode 를 못 바꿔서, 페이지의 matchMedia 만 "앱으로 실행 중"이라고 답하게 바꿔 본다)
  try {
    await ap.evaluate(() => {
      const real = window.matchMedia.bind(window);
      window.matchMedia = q => /display-mode: fullscreen/.test(q) ? { matches: true, media: q } : real(q);
      window.RPD.bus.emit('pwa:status', window.RPD.Pwa);
    });
    app.asApp = await ap.evaluate(() => ({ isApp: window.RPD.Pwa.isApp(), fsHidden: document.getElementById('btnFullscreen').hidden, installHidden: document.getElementById('btnInstall').hidden }));
  } catch (e) { app.asApp = '흉내 불가: ' + e.message; }
  app.errors = aerr.slice(0, 3);
  await actx.close();
  fs.rmSync(profile, { recursive: true, force: true });

  // 노치 화면 여백 — 아이폰 15 가로에 노치(왼쪽 · 오른쪽 47px · 아래 21px)를 흉내 낸다
  const nctx = await browser.newContext({ ...devices['iPhone 15 landscape'], defaultBrowserType: undefined });
  const np = await nctx.newPage();
  await np.goto(URL); await np.waitForTimeout(1000);
  const ncdp = await nctx.newCDPSession(np);
  try {
    await ncdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { left: 47, right: 47, bottom: 21 } });
    await prepAppPage(np); await np.waitForTimeout(2600);
    app.notch = await np.evaluate(() => {
      const a = document.querySelector('.app'), cs = getComputedStyle(a), c = document.getElementById('gameCanvas').getBoundingClientRect();
      return { padL: cs.paddingLeft, padR: cs.paddingRight, padB: cs.paddingBottom, fieldLeft: Math.round(c.left), slotCss: +(window.RPD.FieldManager.slots[0].size * window.RPD.Renderer.scale).toFixed(1) };
    });
    await np.screenshot({ path: pathM.join(ROOT, 'dist', 'm_app_notch_landscape.png') });
  } catch (e) { app.notch = '흉내 불가: ' + e.message; }
  await nctx.close();
  server.close();
  // ---------- 모바일 ④ — 화질 사다리(세션 54): 같은 장면을 가장 고운 칸(해상도 2배)과 가장 낮은 칸(1배 · 30fps)으로 ----------
  const qctx = await browser.newContext({ ...devices['Galaxy S24'], defaultBrowserType: undefined });
  const qp = await qctx.newPage();
  await qp.goto(URL); await qp.waitForTimeout(1000);
  await prepAppPage(qp); await qp.waitForTimeout(2600);
  const quality = {};
  await qp.evaluate(() => window.RPD.Loop.setPaused(true));
  await qp.waitForTimeout(300);
  quality.top = await qp.evaluate(() => ({ level: window.RPD.FramePacer.level, dpr: window.RPD.Renderer.dpr, canvas: window.RPD.Renderer.canvas.width }));
  await qp.screenshot({ path: pathM.join(ROOT, 'dist', 'm_perf_quality_top.png') });
  await qp.evaluate(() => { const P = window.RPD.FramePacer; while (P.stepDown()) {} P.wake(); });
  await qp.waitForTimeout(300);
  quality.low = await qp.evaluate(() => ({ level: window.RPD.FramePacer.level, dpr: window.RPD.Renderer.dpr, canvas: window.RPD.Renderer.canvas.width }));
  await qp.screenshot({ path: pathM.join(ROOT, 'dist', 'm_perf_quality_low.png') });
  await qctx.close();
  app.quality = quality;

  console.log('app', JSON.stringify(app));
  report.push({ app });

  require('fs').writeFileSync(require('path').join(__dirname, '..', 'dist', 'mobile_report.json'), JSON.stringify(report, null, 2));

  await browser.close();
})();
