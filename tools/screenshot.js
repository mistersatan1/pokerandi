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
    return F.getAllUnits().length;
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


  // ⑪ 필드 조합식 [🔒 히든] 칩 — 미발견 히든도 그림자 + ??? 로(세션 58). 피카츄만 발견, 이브이 재료는 다 모음(완성 가능 · 미발견)
  const hiddenPrep = () => {
    const R = window.RPD;
    document.querySelectorAll('.modepick, .result, .help, .book').forEach(o => o.hidden = true);
    R.Game.resetAll('NORMAL', 'NORMAL'); R.Game.startRun('NORMAL', 'NORMAL');
    R.GameManager.setWave(18); R.WaveManager.startRound(18);
    R.SaveManager.data.spells = {};
    R.SaveManager.recordSpell(R.SpellData.forResult('pikachu').id);
    R.StorageManager.reset();
    R.SpellData.forResult('eevee').materials.forEach(id => R.StorageManager.add(R.UnitManager.create(id)));
    R.Loop.setPaused(true);
    R.bus.emit('field:changed', {});
    const chip = document.querySelector('#tierFilter [data-tier="HIDDEN"]');
    if (chip) chip.click();
    const list = document.getElementById('recipeList');
    return { chip: chip ? chip.innerText.replace(/\s+/g, ' ') : null, rows: list.querySelectorAll('.rrow--spell').length, secret: list.querySelectorAll('.rrow--secret').length,
      firstReady: !!(list.querySelector('.rrow--spell') && list.querySelector('.rrow--spell').classList.contains('is-ready')) };
  };
  console.log('hiddenchip pc', JSON.stringify(await page.evaluate(hiddenPrep)));
  await page.waitForTimeout(400);
  // 그림자 캔버스가 실제로 칠해졌는가(번호표는 떼어졌는가) · 목록 HTML 에 그림 경로가 없는가 — 테스트판은 그림이 data URL 이라 픽셀을 읽을 수 있다
  console.log('shadows pc', JSON.stringify(await page.evaluate(() => {
    const cs = [...document.querySelectorAll('#recipeList .rrow--secret .rres canvas')];
    const painted = cs.filter(c => { try { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return true; } catch (e) { return 'tainted'; } return false; }).length;
    return { canvases: cs.length, painted, tagsLeft: document.querySelectorAll('canvas[data-sh]').length,
      pathInHtml: /assets\/pokemon\//.test(document.getElementById('recipeList').innerHTML) };
  })));
  await page.screenshot({ path: require('path').join(__dirname, '..', 'dist', '11_hidden_chip_pc.png') });
  await page.evaluate(() => { const c = document.querySelector('#tierFilter [data-tier="ALL"]'); if (c) c.click(); window.RPD.Loop.setPaused(false); });
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
    for (const [k, sel] of [['Space 소환', '#btnSummon'],
                            ['1·2·3 배속', '.speed__btn[data-speed="3"]'], ['P 일시정지', '#btnPause']]) reach[k] = await visible(sel);
    for (const [k, sel] of [['C 조합 (툴바)', '#tbCraft'], ['창고 (툴바)', '#tbOwned'], ['더보기 (툴바)', '#tbMore']]) reach[k] = await visible(sel);
    await mp.tap('#tbMore'); await mp.waitForTimeout(200);
    for (const [k, sel] of [['H 설명서', '#btnHelp'], ['Enter 주문', '#btnChat'], ['R 조합 사전', '#btnBook'], ['G 골드 상점', '#btnGoldShop'],
                            ['E 정예 소환', '#btnElite'], ['도감', '#btnDex'], ['소리', '#btnAudio'], ['처음부터', '#btnRestart']]) reach[k + ' (☰)'] = await visible(sel);
    if (/portrait|Galaxy S24$|iPhone 15$/.test(dev) && !/landscape/.test(dev)) await mp.screenshot({ path: require('path').join(__dirname, '..', 'dist', 'm_' + tag + '_menu.png') });
    await mp.tap('#tbMore'); await mp.waitForTimeout(200);
    await mp.evaluate(() => window.RPD.HudPanels.setDrawer('recipes'));   // 세션 66: [조합] 은 조합, 시트는 길게 누르기 — 여기선 시트만 await mp.waitForTimeout(400);
    reach['C 조합 (조합식 탭)'] = await visible('#btnCraft');
    await mp.screenshot({ path: require('path').join(__dirname, '..', 'dist', 'm_' + tag + '_drawer.png') });
    await mp.tap('.mtab[data-mtab="owned"]'); await mp.waitForTimeout(300);
    reach['F 필드로 · 보유 (보유 탭)'] = await visible('#storageList');
    await mp.tap('.mtab[data-mtab="owned"]'); await mp.waitForTimeout(300);   // 서랍 닫기
    const t0 = targets.find(t => t.i === 0);
    await mp.touchscreen.tap(t0.x, t0.y); await mp.waitForTimeout(300);
    // 강화 · 창고로 · 방출 — 세션 65 부터 정보 바에(원래 버튼은 숨어 있고 W · S · X 단축키는 그대로)
    for (const [k, sel] of [['W 강화 (정보 바)', '#infoBar [data-ib="upgrade"]'], ['S 창고로 (정보 바)', '#infoBar [data-ib="store"]'],
                            ['X 방출 (정보 바)', '#infoBar [data-ib="sell"]'], ['이동 (정보 바)', '#infoBar [data-ib="move"]']]) reach[k] = await visible(sel);
    // 자세한 정보(스킬 · 특성 · 공격 대상)는 정보 바를 길게 눌러 여는 시트에 — 실제 손가락(CDP)으로 0.6초 누르기
    {
      const cdp0 = await mctx.newCDPSession(mp);
      await mp.locator('#infoBar .ib__who').waitFor({ state: 'visible', timeout: 3000 });   // 칸을 누른 직후 바가 다시 그려지는 사이에 재면 가끔 비었다(세션 66)
      // 바는 이벤트마다 innerHTML 로 다시 그려진다(세션 68 부터 되돌리기 기록에도) — 재는 순간 바뀌어 null 이면 다시 잰다
      let bb = null;
      for (let k = 0; k < 10 && !bb; k++) { bb = await mp.locator('#infoBar .ib__who').boundingBox(); if (!bb) await mp.waitForTimeout(100); }
      await cdp0.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bb.x + 8, y: bb.y + bb.height / 2 }] });
      await mp.waitForTimeout(650);
      await cdp0.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await mp.waitForTimeout(300);
    }
    // 공격 대상 칩은 보이기만 하면 안 되고 실제로 눌려야 한다(카드 안을 스크롤해서라도)
    await mp.evaluate(() => { const c = document.querySelector('#slotCard [data-tgt="BOSS"]'); if (c) c.scrollIntoView({ block: 'nearest' }); });
    await mp.waitForTimeout(150);
    reach['T 공격 대상 (정보 카드)'] = await visible('#slotCard [data-tgt="BOSS"]');
    if (reach['T 공격 대상 (정보 카드)']) {
      await mp.tap('#slotCard [data-tgt="BOSS"]'); await mp.waitForTimeout(200);
      reach['T 공격 대상 — 칩을 눌러 바뀜'] = await mp.evaluate(() => { const s = window.RPD.FieldManager.getSelected(); return !!(s && s.unit && s.unit.targeting === 'BOSS'); });
      if (/landscape/.test(dev)) await mp.screenshot({ path: require('path').join(__dirname, '..', 'dist', 'm_' + tag + '_card.png') });
    }
    reach['Esc 닫기 (자세한 정보 시트 ×)'] = await visible('#btnSlotClose');
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
      const F = R.FieldManager;
      F.slots.forEach(s => { if (s.unit) F.remove(s.index); });   // 시작 포켓몬이 무작위 칸에 있어 끌기 결과가 판마다 달랐다 — 비우고 시작
      const open = F.slots.filter(s => s.unlocked);
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
    await tp.evaluate(() => document.getElementById('tbMore').click()); await hold(200);
    const gs = await tp.evaluate(() => { const b = document.getElementById('btnGoldShop').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
    await T('touchStart', [[gs.x, gs.y]]); await hold(650);
    const tipTxt = await tp.evaluate(() => { const t = document.querySelector('.tipbubble'); return t && !t.hidden ? t.textContent : null; });
    if (/landscape/.test(dev) === false) await tp.screenshot({ path: require('path').join(__dirname, '..', 'dist', 'm_touch_tip.png') });
    await T('touchEnd', []); await hold(250);
    res['길게 누르기 → 설명 말풍선'] = tipTxt;
    res['말풍선을 띄운 뒤 버튼은 안 눌림'] = await tp.evaluate(() => document.getElementById('goldShopOverlay').hidden);
    await tp.evaluate(() => { const h = document.querySelector('.hud'); if (h.classList.contains('is-more-open')) document.getElementById('tbMore').click(); });
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
    for (const t of ['recipes', 'owned', 'synergy', 'dex']) { await tp.evaluate(tt => window.RPD.HudPanels.setDrawer(tt), t); await hold(200); await scan(); }
    await tp.evaluate(() => window.RPD.HudPanels.setDrawer('dex'));
    await tp.evaluate(() => document.getElementById('tbMore').click()); await hold(150); await scan(); await tp.evaluate(() => document.getElementById('tbMore').click());
    await tp.evaluate(() => window.RPD.FieldManager.select(window.RPD.FieldManager.slots.find(s => s.unit).index)); await hold(200); await scan();
    res['누름 영역 40px 미만'] = [...smalls];
    touchReport.push({ device: dev, ...res, errors: terr.slice(0, 3) });
    console.log('touch', dev, JSON.stringify(res), terr.slice(0, 2));
    await tctx.close();
  }
  report.push({ touch: touchReport });

  // ⑪ 휴대폰 — [조합식] 서랍을 열고 [🔒 히든] 칩(세로 · 가로)
  for (const dev of ['Galaxy S24', 'Galaxy S24 landscape']) {
    const hctx = await browser.newContext({ ...devices[dev], defaultBrowserType: undefined });
    const hp = await hctx.newPage();
    await hp.goto(URL); await hp.waitForTimeout(1000);
    const info = await hp.evaluate(hiddenPrep);
    await hp.evaluate(() => { window.RPD.HudPanels.setDrawer('recipes'); const c = document.querySelector('#tierFilter [data-tier="HIDDEN"]'); if (c && !c.classList.contains('is-on')) c.click(); });
    await hp.waitForTimeout(500);
    console.log('hiddenchip', dev, JSON.stringify(info));
    await hp.screenshot({ path: require('path').join(__dirname, '..', 'dist', 'm_hidden_chip_' + dev.replace(/ /g, '_') + '.png') });
    await hctx.close();
  }

  // ⑫ 도감 세부 카드(세션 61) — 전설(스킬 · 패시브 · 특성: 라이츄) · 버퍼(픽시) · 미등록(뮤츠). PC · 휴대폰 세로 · 가로.
  //    도감 칸을 실제로 눌러 연다. 확인: 카드가 화면 안에 다 들어오는가 · 휴대폰은 아래 시트인가 · 미등록 카드에 이름이 없는가.
  const dexPrep = () => {
    const R = window.RPD;
    document.querySelectorAll('.modepick, .result, .help, .book').forEach(o => o.hidden = true);
    R.Game.resetAll('NORMAL', 'NORMAL'); R.Game.startRun('NORMAL', 'NORMAL');
    R.SaveManager.data.spells = {};
    ['bulbasaur', 'charmander', 'squirtle', 'pikachu', 'raichu', 'clefairy', 'clefable', 'magnemite', 'magneton', 'charmeleon', 'charizard']
      .forEach(id => { R.SaveManager.data.pokedex[id] = 1; });
    R.Loop.setPaused(true);
    document.getElementById('btnDex').click();
    return document.getElementById('dexOverlay').hidden === false;
  };
  const dexCardShots = [];
  for (const dev of ['PC', 'Galaxy S24', 'Galaxy S24 landscape']) {
    const dctx = await browser.newContext(dev === 'PC' ? { viewport: { width: 1440, height: 900 } } : { ...devices[dev], defaultBrowserType: undefined });
    const dp = await dctx.newPage();
    await dp.goto(URL); await dp.waitForTimeout(1000);
    await dp.evaluate(dexPrep);
    for (const id of ['raichu', 'clefable', 'mewtwo']) {
      const n = await dp.evaluate(id => window.RPD.PokemonData.list.findIndex(d => d.id === id), id);
      await dp.evaluate(() => window.RPD.DexCard.close());
      const cell = dp.locator('#dexGrid [data-dex-n="' + n + '"]');
      await cell.scrollIntoViewIfNeeded();
      await cell.click();                      // 실제 누르기로 연다
      await dp.waitForTimeout(450);
      const info = await dp.evaluate(() => {
        const panel = document.getElementById('dexCardPanel'), r = panel.getBoundingClientRect();
        return { open: !document.getElementById('dexCard').hidden, no: (panel.querySelector('.dc__no') || {}).textContent,
          name: (panel.querySelector('.sc__name') || {}).textContent, inView: r.top >= -1 && r.bottom <= innerHeight + 1 && r.left >= -1 && r.right <= innerWidth + 1,
          sheet: Math.abs(r.bottom - innerHeight) < 24 && r.width >= innerWidth - 2, w: Math.round(r.width), h: Math.round(r.height) };
      });
      const file = '12_dexcard_' + dev.replace(/ /g, '_') + '_' + id + '.png';
      dexCardShots.push({ dev, id, ...info });
      console.log('dexcard', dev, id, JSON.stringify(info));
      await dp.screenshot({ path: require('path').join(__dirname, '..', 'dist', file) });
    }
    // 닫기 — Esc 는 카드만 닫고 도감은 남는다 · 바깥(어두운 곳) 누르기
    await dp.keyboard.press('Escape');
    const afterEsc = await dp.evaluate(() => ({ card: !document.getElementById('dexCard').hidden, dex: !document.getElementById('dexOverlay').hidden }));
    await dp.locator('#dexGrid [data-dex-n="0"]').click();
    const bb = await dp.locator('#dexCard').boundingBox();
    await dp.mouse.click(bb.x + 6, bb.y + 6);          // 카드 바깥(어두운 곳)
    const afterOutside = await dp.evaluate(() => !document.getElementById('dexCard').hidden);
    console.log('dexcard close', dev, JSON.stringify({ afterEsc, afterOutside }));
    await dctx.close();
  }

  // ⑬ 화상 확률(burnChance, 세션 62) — 지속 피해 역할(불꽃 아닌 종 위주)을 올려 실제로 싸우게 한 뒤: 필드 · 도감 카드(뿔충이).
  //    확인: 불꽃 타입이 아닌 개체가 건 화상(= 화상 확률로만 생긴다)이 적에게 실제로 붙는가.
  {
    const bctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const bp = await bctx.newPage();
    await bp.goto(URL); await bp.waitForTimeout(1000);
    await bp.evaluate(() => {
      const R = window.RPD;
      document.querySelectorAll('.modepick, .result, .help, .book').forEach(o => o.hidden = true);
      R.Game.resetAll('NORMAL', 'NORMAL'); R.Game.startRun('NORMAL', 'NORMAL');
      R.GameManager.setWave(14); R.WaveManager.startRound(14);
      const F = R.FieldManager;
      F.slots.forEach(s => { if (s.unit) F.remove(s.index); });
      const ids = ['weedle', 'ekans', 'zubat', 'gloom', 'paras', 'venonat', 'bellsprout', 'grimer', 'tentacool', 'charmander'];
      F.slots.filter(s => s.unlocked).slice(0, ids.length).forEach((s, i) => F.place(s.index, R.UnitManager.create(ids[i])));
      R.GameManager.life = 999;
      R.bus.emit('field:changed', {});
      // 화상을 누가 걸었는지 센다(도구 쪽 관찰 — 게임 코드는 그대로)
      const EM = R.EnemyManager, orig = EM.applyDot;
      window.__burn = { procNonFire: 0 };
      window.__dot = {};   // 개체별 지속 피해 합(적이 받은 피해 이벤트 중 지속 피해 틱만 — 틱은 opts 없이 source 만 온다)
      R.bus.on('enemy:damaged', p => { if (p.source && p.source.uid && !p.crit && p.amount > 0 && window.__inTick) window.__dot[p.source.uid] = (window.__dot[p.source.uid] || 0) + p.amount; });
      const upd = EM.update.bind(EM);
      EM.update = function (dt) { window.__inTick = true; try { return upd(dt); } finally { window.__inTick = false; } };
      EM.applyDot = function (enemy, perSecond, duration, source, kind, maxStacks) {
        if (kind === 'burn' && source && source.def && source.def.burnChance && !source.typeFlags.FIRE) window.__burn.procNonFire += 1;
        return orig.apply(this, arguments);
      };
      R.Loop.setSpeed(2); R.Loop.setPaused(false);
    });
    await bp.waitForTimeout(9000);
    const info = await bp.evaluate(() => {
      const R = window.RPD, en = R.EnemyManager.enemies.filter(e => e.alive);
      return { ...window.__burn, enemies: en.length,
        burningNow: en.filter(e => e.effects.dots.some(d => d.kind === 'burn' && d.source && d.source.def && !d.source.typeFlags.FIRE)).length };
    });
    console.log('burn field', JSON.stringify(info));
    await bp.evaluate(() => window.RPD.Loop.setPaused(true));
    await bp.screenshot({ path: require('path').join(__dirname, '..', 'dist', '13_burn_field_pc.png') });
    // 누적 피해에 지속 피해(세션 63) — 질퍽이(독 · 화상 확률) 칸 카드의 "누적"과, 그 개체가 건 지속 피해 몫
    const slotInfo = await bp.evaluate(() => {
      const R = window.RPD, F = R.FieldManager;
      const s = F.slots.find(x => x.unit && x.unit.defId === 'grimer');
      F.select(s.index);
      return { total: Math.round(s.unit.totalDamage), dot: Math.round(window.__dot[s.unit.uid] || 0),
        card: (document.querySelector('#slotBody .sc__dmg') || {}).textContent, top: R.UnitManager.topDamage().name };
    });
    console.log('dot total', JSON.stringify(slotInfo));
    await bp.waitForTimeout(200);
    await bp.screenshot({ path: require('path').join(__dirname, '..', 'dist', '14_dot_total_slotcard_pc.png') });
    await bp.evaluate(() => window.RPD.FieldManager.select(-1));
    await bp.evaluate(() => {
      const R = window.RPD;
      R.SaveManager.data.pokedex.weedle = 1;
      document.getElementById('btnDex').click();
      R.DexCard.openId('weedle');
    });
    await bp.waitForTimeout(400);
    await bp.screenshot({ path: require('path').join(__dirname, '..', 'dist', '13_burn_dexcard_pc.png') });
    await bctx.close();
  }

  // ⑮ 처형도 누적 피해에(세션 64) — 고스트 3마리(시너지 "체력 14% 이하 즉사")로 싸운 뒤 칸 카드 "누적"과 처형으로 들어간 몫.
  {
    const xctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const xp = await xctx.newPage();
    await xp.goto(URL); await xp.waitForTimeout(1000);
    await xp.evaluate(() => {
      const R = window.RPD;
      document.querySelectorAll('.modepick, .result, .help, .book').forEach(o => o.hidden = true);
      R.Game.resetAll('NORMAL', 'NORMAL'); R.Game.startRun('NORMAL', 'NORMAL');
      R.GameManager.setWave(14); R.WaveManager.startRound(14);
      const F = R.FieldManager;
      F.slots.forEach(s => { if (s.unit) F.remove(s.index); });
      const ids = ['gastly', 'haunter', 'haunter', 'pidgeotto'];
      F.slots.filter(s => s.unlocked).slice(0, ids.length).forEach((s, i) => F.place(s.index, R.UnitManager.create(ids[i])));
      R.GameManager.life = 999;
      R.bus.emit('field:changed', {});
      // 처형으로 들어간 몫을 개체별로(도구 쪽 관찰) — 처형 알림 순간의 적 체력이 곧 처형 한 방
      window.__exec = {};
      R.bus.on('combat:execute', p => { window.__exec[p.unit.uid] = (window.__exec[p.unit.uid] || 0) + Math.max(0, p.enemy.hp); });
      R.Loop.setSpeed(2); R.Loop.setPaused(false);
    });
    await xp.waitForTimeout(9000);
    const xinfo = await xp.evaluate(() => {
      const R = window.RPD, F = R.FieldManager;
      R.Loop.setPaused(true);
      const us = F.getAllUnits().filter(u => window.__exec[u.uid]).sort((a, b) => window.__exec[b.uid] - window.__exec[a.uid]);
      const u = us[0] || F.getAllUnits().find(x => x.defId === 'haunter');
      F.select(u.slotIndex);
      return { synergy: (R.SynergyManager.active || []).filter(a => a.typeId === 'GHOST').map(a => a.label || a.count), unit: u.name,
        total: Math.round(u.totalDamage), exec: Math.round(window.__exec[u.uid] || 0),
        executes: Object.values(window.__exec).length, card: (document.querySelector('#slotBody .sc__dmg') || {}).textContent };
    });
    console.log('execute total', JSON.stringify(xinfo));
    await xp.waitForTimeout(200);
    await xp.screenshot({ path: require('path').join(__dirname, '..', 'dist', '15_execute_total_slotcard_pc.png') });
    await xctx.close();
  }

  /* ⑯ 모바일 재설계 ① — 필드 고정 · 시트 · 정보 바 · 이동 모드(세션 65). 갤럭시 S24 세로 · 가로, 실제 손가락(터치)으로.
   * 검사(하나라도 어긋나면 이 도구가 실패로 끝난다):
   *   캔버스 화면 크기(getBoundingClientRect)가 시트(탭 넷 × peek · 절반 · 전체 · 손잡이 끌기) · 창(상점 · 정예 · 조합 사전) · 자세한 정보 · 이동 모드에서 모두 같다
   *   정보 바가 필드 칸(과 캔버스)과 겹치지 않는다 / 이동 모드에서 칸을 눌러 실제로 옮겨진다 / 칸 근처 빈 곳을 눌러도 가장 가까운 칸이 골라진다
   * 캡처: (a) 칸 선택 + 정보 바 (b) 이동 모드 (c) 조합식 시트 절반 — 칸의 화면 크기(px)도 남긴다. */
  const m1Problems = [];
  for (const dev of ['Galaxy S24', 'Galaxy S24 landscape']) {
    const gctx = await browser.newContext({ ...devices[dev], defaultBrowserType: undefined });
    const gp = await gctx.newPage();
    const gerr = [];
    gp.on('pageerror', e => gerr.push(e.message));
    await gp.goto(URL); await gp.waitForTimeout(1000);
    await gp.evaluate(() => {
      const R = window.RPD;
      if (R.TutorialManager && R.TutorialManager.skip) R.TutorialManager.skip();
      document.querySelectorAll('.modepick, .result, .help, .book').forEach(o => o.hidden = true);
      R.Game.resetAll('NORMAL', 'NORMAL'); R.Game.startRun('NORMAL', 'NORMAL');
      R.GameManager.setWave(23); R.WaveManager.startRound(23);
      const F = R.FieldManager;
      F.slots.forEach(x => { if (x.unit) F.remove(x.index); });
      const open = F.slots.filter(x => x.unlocked && !x.blocked);
      ['charizard', 'blastoise', 'venusaur', 'pikachu', 'gengar', 'alakazam'].forEach((id, i) => F.place(open[i].index, R.UnitManager.create(id)));
      R.GameManager.life = 999; R.GameManager.gold = 0;
      R.bus.emit('field:changed', {});
    });
    await gp.waitForTimeout(2600);                                   // 라운드 배너가 지나가게
    await gp.evaluate(() => window.RPD.Loop.setPaused(true));
    const tag = dev.replace(/ /g, '_');
    const canvasRect = () => gp.evaluate(() => { const r = document.getElementById('gameCanvas').getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(v => Math.round(v * 10) / 10).join(','); });
    const slots = () => gp.evaluate(() => {
      const R = window.RPD.Renderer, F = window.RPD.FieldManager, c = document.getElementById('gameCanvas').getBoundingClientRect();
      return F.slots.map(sl => { const p = R.toCanvasCss(sl.x, sl.y), h = sl.size / 2 * p.scale;
        return { i: sl.index, x: c.left + p.x, y: c.top + p.y, h, unit: sl.unit ? sl.unit.defId : null, open: sl.unlocked && !sl.blocked }; });
    });
    const R0 = await canvasRect();
    const bad = (what) => { m1Problems.push(dev + ': ' + what); };
    const same = async (what) => { const r = await canvasRect(); if (r !== R0) bad('캔버스 크기가 바뀜 — ' + what + ' ' + R0 + ' → ' + r); };
    const S = await slots();
    const slotPx = +(S[0].h * 2).toFixed(1);

    // (a) 칸 선택 — 실제 손가락으로 리자몽 칸
    const A = S.find(x => x.unit === 'charizard');
    await gp.touchscreen.tap(A.x, A.y); await gp.waitForTimeout(250);
    if (await gp.evaluate(() => window.RPD.FieldManager.selectedIndex) !== A.i) bad('리자몽 칸이 안 골라짐');
    const bar = await gp.evaluate(() => { const r = document.getElementById('infoBar').getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, text: document.getElementById('infoBar').innerText.replace(/\s+/g, ' ') }; });
    const cv = await gp.evaluate(() => { const r = document.getElementById('gameCanvas').getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; });
    const overlap = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
    const hitSlots = S.filter(x => overlap(bar, { l: x.x - x.h, t: x.y - x.h, r: x.x + x.h, b: x.y + x.h })).map(x => x.i);
    if (hitSlots.length) bad('정보 바가 칸과 겹침: ' + hitSlots.join(','));
    if (overlap(bar, cv)) bad('정보 바가 필드(캔버스)와 겹침');
    if (!/리자몽/.test(bar.text) || !/DPS/.test(bar.text)) bad('정보 바에 이름 · DPS 가 없음: ' + bar.text);
    if (await gp.evaluate(() => { const c = document.getElementById('slotCard'); return c && getComputedStyle(c).display !== 'none'; })) bad('필드 위에 정보 카드가 뜸');
    await same('칸 선택');
    await gp.screenshot({ path: require('path').join(__dirname, '..', 'dist', '16_m1_' + tag + '_a_select.png') });

    // (b) 이동 모드 — [이동] 누르고 빈 칸을 눌러 옮기기
    await gp.tap('#infoBar [data-ib="move"]'); await gp.waitForTimeout(350);
    if (await gp.evaluate(() => window.RPD.MobileSheet.moving) !== A.i) bad('[이동] 을 눌러도 이동 모드가 아님');
    const moveBar = await gp.evaluate(() => document.getElementById('infoBar').innerText.replace(/\s+/g, ' '));
    if (!/옮길 칸을 누르세요/.test(moveBar) || !/취소/.test(moveBar)) bad('이동 모드 정보 바 문구: ' + moveBar);
    await same('이동 모드');
    await gp.screenshot({ path: require('path').join(__dirname, '..', 'dist', '16_m1_' + tag + '_b_move.png') });
    const E = S.find(x => x.open && !x.unit && x.i !== A.i);
    await gp.touchscreen.tap(E.x, E.y); await gp.waitForTimeout(300);
    const moved = await gp.evaluate(([a, e]) => { const F = window.RPD.FieldManager; return { at: F.get(e).unit && F.get(e).unit.defId, left: !!F.get(a).unit, sel: F.selectedIndex, moving: window.RPD.MobileSheet.moving }; }, [A.i, E.i]);
    if (moved.at !== 'charizard' || moved.left) bad('이동 모드에서 칸을 눌렀는데 안 옮겨짐: ' + JSON.stringify(moved));
    if (moved.moving !== -1 || moved.sel !== E.i) bad('옮긴 뒤 정보 바로 안 돌아옴: ' + JSON.stringify(moved));

    // 칸 근처 빈 곳 — 칸 가장자리 밖 14px(손가락 반지름 22px 안) · 다른 칸이 더 가깝지 않은 방향으로
    const S2 = await slots();
    let nearTest = null;
    for (const x of S2) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const px = x.x + dx * (x.h + 14), py = x.y + dy * (x.h + 14);
        const clash = S2.some(o => o.i !== x.i && Math.hypot(Math.max(0, Math.abs(px - o.x) - o.h), Math.max(0, Math.abs(py - o.y) - o.h)) <= 22);
        if (!clash && px > cv.l + 2 && px < cv.r - 2 && py > cv.t + 2 && py < cv.b - 2) { nearTest = { i: x.i, x: px, y: py }; break; }
      }
      if (nearTest) break;
    }
    await gp.evaluate(() => window.RPD.FieldManager.select(-1));
    await gp.touchscreen.tap(nearTest.x, nearTest.y); await gp.waitForTimeout(200);
    const nearGot = await gp.evaluate(() => window.RPD.FieldManager.selectedIndex);
    if (nearGot !== nearTest.i) bad('칸 근처 빈 곳(가장자리 밖 14px) → ' + nearGot + ' (기대 ' + nearTest.i + ')');
    await gp.evaluate(() => window.RPD.FieldManager.select(-1));

    // (c) 조합식 시트 절반
    await gp.touchscreen.tap(A.x, A.y); await gp.waitForTimeout(100);        // 빈 칸 하나 골라 두기(정보 바가 보이게)
    const B = S2.find(x => x.unit === 'charizard');
    await gp.touchscreen.tap(B.x, B.y); await gp.waitForTimeout(150);
    await gp.evaluate(() => window.RPD.HudPanels.setDrawer('recipes')); await gp.waitForTimeout(450);
    const sheetInfo = await gp.evaluate(() => { const p = document.querySelector('.pane--recipes').getBoundingClientRect(); return { size: document.body.getAttribute('data-sheet'), w: Math.round(p.width), h: Math.round(p.height) }; });
    if (sheetInfo.size !== 'half') bad('조합식 탭을 열었는데 절반 시트가 아님: ' + sheetInfo.size);
    await same('조합식 시트 절반');
    await gp.screenshot({ path: require('path').join(__dirname, '..', 'dist', '16_m1_' + tag + '_c_recipes_half.png') });

    // 필드를 누르면 peek 로 · 선택은 그대로
    const selBefore = await gp.evaluate(() => window.RPD.FieldManager.selectedIndex);
    await gp.touchscreen.tap(B.x, B.y); await gp.waitForTimeout(250);
    const afterTap = await gp.evaluate(() => ({ size: document.body.getAttribute('data-sheet'), sel: window.RPD.FieldManager.selectedIndex }));
    if (afterTap.size !== 'peek' || afterTap.sel !== selBefore) bad('필드를 누르면 peek + 선택 유지여야 하는데: ' + JSON.stringify(afterTap));

    // 캔버스 크기 불변 — 탭 넷 × 세 크기 · 손잡이 끌기 · 창 셋 · 자세한 정보
    for (const tab of ['recipes', 'owned', 'synergy', 'dex']) {
      await gp.evaluate(t => { window.RPD.HudPanels.setDrawer(''); window.RPD.HudPanels.setDrawer(t); }, tab);
      for (const size of ['peek', 'half', 'full']) {
        await gp.evaluate(z => window.RPD.MobileSheet.setSize(z), size); await gp.waitForTimeout(120);
        await same(tab + ' ' + size);
      }
    }
    // 손잡이를 실제 손가락으로 끌기(세로: 위로 · 가로: 왼쪽으로) → 크기가 바뀌고 캔버스는 그대로
    await gp.evaluate(() => window.RPD.MobileSheet.setSize('peek')); await gp.waitForTimeout(150);
    const gb = await gp.locator('#sheetGrip').boundingBox();
    const land = /landscape/.test(dev);
    const cdp = await gctx.newCDPSession(gp);
    const gx = gb.x + gb.width / 2, gy = gb.y + gb.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: gx, y: gy }] });
    for (let k = 1; k <= 8; k++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: land ? gx - k * 30 : gx, y: land ? gy : gy - k * 30 }] }); await gp.waitForTimeout(16); }
    await same('손잡이 끄는 중');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await gp.waitForTimeout(200);
    const dragged = await gp.evaluate(() => document.body.getAttribute('data-sheet'));
    if (dragged === 'peek') bad('손잡이를 끌어도 시트 크기가 그대로 peek');
    await same('손잡이 끈 뒤(' + dragged + ')');
    await gp.evaluate(() => window.RPD.HudPanels.setDrawer(''));
    for (const id of ['goldShopOverlay', 'eliteOverlay', 'bookOverlay']) {
      await gp.evaluate(i => { document.getElementById(i).hidden = false; }, id); await gp.waitForTimeout(150);
      await same(id);
      await gp.evaluate(i => { document.getElementById(i).hidden = true; }, id);
    }
    await gp.touchscreen.tap(B.x, B.y); await gp.waitForTimeout(150);
    await gp.evaluate(() => window.RPD.MobileSheet.openDetail()); await gp.waitForTimeout(200);
    await same('자세한 정보 시트');
    const detailShown = await gp.evaluate(() => getComputedStyle(document.getElementById('slotCard')).display !== 'none');
    if (!detailShown) bad('자세한 정보 시트가 안 보임');
    const info = { canvas: R0, slotCssPx: slotPx, bar: [Math.round(bar.l), Math.round(bar.t), Math.round(bar.r - bar.l), Math.round(bar.b - bar.t)], sheet: sheetInfo, dragged, errors: gerr.slice(0, 2) };
    console.log('mobile1', dev, JSON.stringify(info));
    report.push({ mobile1: dev, ...info });
    await gctx.close();
  }
  console.log('mobile1 problems', JSON.stringify(m1Problems));
  if (m1Problems.length) process.exitCode = 1;

  /* ⑰ 모바일 ② — 하단 툴바 · "★ 조합 가능" 줄 · 보스 보상(세션 66). 갤럭시 S24 세로 · 가로 + PC.
   * 검사(하나라도 어긋나면 이 도구가 실패로 끝난다):
   *   툴바 버튼 높이 44px 이상 · 툴바가 캔버스와 안 겹침 / 시트([창고] · [조합] 길게 누르기) · [더보기] 를 열고 닫아도 캔버스 크기 그대로 /
   *   [조합] 배지 = 완성 가능 개수 · "★ 조합 가능" 줄을 누르면 실제로 조합 / 소환 금지 중 [소환] "금지 NR" 잠김 /
   *   휴대폰에서 보스 보상 칩이 getComputedStyle 로 안 보임 · PC 에서는 보임 / 설명서 보스 보상 표에 RewardManager.table 전부.
   * 캡처: (a) 세로 기본 (b) 세로 조합 가능 (c) 세로 [더보기] (d) 세로 보스 라운드 (e) 세로 설명서 보스 보상 (f) 가로 (a)(d) (g) PC 보스 라운드 */
  const m2Problems = [];
  const m2Report = [];
  const tbPrep = (opt) => {
    const R = window.RPD;
    if (R.TutorialManager && R.TutorialManager.skip) R.TutorialManager.skip();
    document.querySelectorAll('.modepick, .result, .help, .book').forEach(o => o.hidden = true);
    R.Game.resetAll('NORMAL', 'NORMAL'); R.Game.startRun('NORMAL', 'NORMAL');
    R.GameManager.setWave(opt.wave); R.WaveManager.startRound(opt.wave);
    const F = R.FieldManager;
    F.slots.forEach(x => { if (x.unit) F.remove(x.index); });
    const open = F.slots.filter(x => x.unlocked && !x.blocked);
    ['charizard', 'blastoise', 'venusaur', 'pikachu', 'gengar'].forEach((id, i) => F.place(open[i].index, R.UnitManager.create(id)));
    R.StorageManager.reset();
    if (opt.ready) {   // 소환으로 나오는 재료만 쓰는 조합식 둘을 완성 가능하게
      R.RecipeData.list.filter(x => x.materials.every(m => R.PokemonData.get(m).summon)).slice(0, 2)
        .forEach(r => r.materials.forEach(m => R.StorageManager.add(R.UnitManager.create(m))));
    }
    R.GameManager.life = 999; R.GameManager.gold = 500;
    R.bus.emit('field:changed', {});
    R.bus.emit('economy:gold', { gold: 500, delta: 0 });
  };
  const rectOf = (pg, q) => pg.evaluate(sel => { const n = document.querySelector(sel); if (!n) return null; const r = n.getBoundingClientRect();
    return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: Math.round(r.width), h: Math.round(r.height) }; }, q);
  for (const dev of ['Galaxy S24', 'Galaxy S24 landscape']) {
    const tctx2 = await browser.newContext({ ...devices[dev], defaultBrowserType: undefined });
    const tp2 = await tctx2.newPage();
    const terr = [];
    tp2.on('pageerror', e => terr.push(e.message));
    await tp2.goto(URL); await tp2.waitForTimeout(1000);
    const tag = dev.replace(/ /g, '_'), land = /landscape/.test(dev);
    const bad = w => m2Problems.push(dev + ': ' + w);
    const shot = name => tp2.screenshot({ path: require('path').join(__dirname, '..', 'dist', '17_m2_' + tag + '_' + name + '.png') });
    const cvs = async () => { const r = await rectOf(tp2, '#gameCanvas'); return [r.l, r.t, r.w, r.h].map(Math.round).join(','); };

    // (a) 기본 툴바
    await tp2.evaluate(tbPrep, { wave: 7 });
    await tp2.waitForTimeout(2600);
    await tp2.evaluate(() => window.RPD.Loop.setPaused(true));
    const C0 = await cvs();
    const canvasR = await rectOf(tp2, '#gameCanvas');
    const btns = {};
    for (const q of ['#btnSummon', '#tbCraft', '#tbOwned', '#tbMore']) btns[q] = await rectOf(tp2, q);
    const tbar = await rectOf(tp2, '#mobileTabs'), act = await rectOf(tp2, '.pane--action');
    Object.entries(btns).forEach(([q, r]) => { if (!r || r.h < 44) bad(q + ' 높이 ' + (r && r.h) + 'px < 44'); });
    const ov = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
    if (ov(tbar, canvasR) || ov(act, canvasR)) bad('툴바가 캔버스와 겹침');
    if (!land && Math.abs(tbar.b - (await tp2.evaluate(() => innerHeight))) > 12) bad('세로 툴바가 화면 맨 아래가 아님');
    if (!(await shot('a_toolbar'), true)) {}

    // (d) 보스 라운드 — 필드 위 보상 칩이 안 보여야
    await tp2.evaluate(tbPrep, { wave: 10 });
    await tp2.waitForTimeout(2600);
    await tp2.evaluate(() => window.RPD.Loop.setPaused(true));
    const chip = await tp2.evaluate(() => { const n = document.getElementById('nextReward'); return { display: getComputedStyle(n).display, text: n.textContent.length }; });
    if (chip.display !== 'none') bad('휴대폰인데 보스 보상 칩이 보임(display ' + chip.display + ')');
    const bossUp = await tp2.evaluate(() => window.RPD.EnemyManager.enemies.some(e => e.isBoss));
    await shot('d_boss_round');
    if (land) { m2Report.push({ dev, canvas: C0, toolbar: [tbar.w, tbar.h], summon: [btns['#btnSummon'].w, btns['#btnSummon'].h], bossUp, chip }); await tctx2.close(); continue; }

    // (b) 조합 가능 — 배지 · 줄 · 누르면 조합
    await tp2.evaluate(tbPrep, { wave: 7, ready: true });
    await tp2.waitForTimeout(2600);
    await tp2.evaluate(() => window.RPD.Loop.setPaused(true));
    const rd = await tp2.evaluate(() => ({ n: window.RPD.RecipeManager.readyList().length, badge: document.getElementById('mtabCraft').textContent, badgeShown: !document.getElementById('mtabCraft').hidden,
      strip: document.getElementById('infoBar').innerText.replace(/\s+/g, ' '), best: window.RPD.RecipeManager.readyList()[0].resultName }));
    if (!rd.badgeShown || String(rd.n) !== rd.badge) bad('[조합] 배지 ' + rd.badge + ' ≠ 완성 가능 ' + rd.n);
    if (!/★ 조합 가능/.test(rd.strip) || rd.strip.indexOf(rd.best) < 0) bad('조합 가능 줄: ' + rd.strip);
    await shot('b_craft_ready');
    const before = await tp2.evaluate(() => ({ n: window.RPD.RecipeManager.readyList().length, units: window.RPD.StorageManager.allUnits().map(u => u.defId).sort().join(',') }));
    await tp2.tap('#infoBar [data-ib="craft"]'); await tp2.waitForTimeout(300);
    const after = await tp2.evaluate(() => ({ n: window.RPD.RecipeManager.readyList().length, units: window.RPD.StorageManager.allUnits().map(u => u.defId).sort().join(','), badge: document.getElementById('mtabCraft').textContent }));
    if (after.units === before.units || !(after.n < before.n)) bad('조합 가능 줄을 눌렀는데 조합이 안 됨: ' + JSON.stringify({ before, after }));
    if (String(after.n) !== after.badge && after.n > 0) bad('조합 뒤 배지 ' + after.badge + ' ≠ ' + after.n);
    await cvs() !== C0 && bad('조합 뒤 캔버스 크기 바뀜');

    // 시트 — [창고] 누르기 · [조합] 길게 누르기(실제 손가락) → 캔버스 그대로
    await tp2.tap('#tbOwned'); await tp2.waitForTimeout(300);
    if (await tp2.evaluate(() => document.body.getAttribute('data-mtab')) !== 'owned') bad('[창고] 로 보유 시트가 안 열림');
    if (await cvs() !== C0) bad('보유 시트를 열었더니 캔버스 크기 바뀜');
    await tp2.tap('#tbOwned'); await tp2.waitForTimeout(200);
    {
      const cdp2 = await tctx2.newCDPSession(tp2);
      const b = btns['#tbCraft'];
      await cdp2.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: (b.l + b.r) / 2, y: (b.t + b.b) / 2 }] });
      await tp2.waitForTimeout(600);
      await cdp2.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await tp2.waitForTimeout(300);
    }
    const tabNow = await tp2.evaluate(() => document.body.getAttribute('data-mtab'));
    if (tabNow !== 'recipes') bad('[조합] 길게 누르기로 조합식 시트가 안 열림(' + tabNow + ')');
    if (await cvs() !== C0) bad('조합식 시트를 열었더니 캔버스 크기 바뀜');
    await tp2.evaluate(() => window.RPD.HudPanels.setDrawer(''));

    // (c) [더보기]
    await tp2.tap('#tbMore'); await tp2.waitForTimeout(300);
    const more = await tp2.evaluate(() => { const m = document.getElementById('hudMore'), r = m.getBoundingClientRect(), t = document.getElementById('mobileTabs').getBoundingClientRect();
      const ids = ['btnGoldShop', 'btnElite', 'btnBook', 'btnDex', 'btnHelp', 'btnAudio', 'btnRestart', 'btnSynergy'];
      const vis = ids.filter(id => { const b = document.getElementById(id).getBoundingClientRect(); return b.width > 4 && b.height > 4 && b.top >= 0 && b.bottom <= innerHeight; });
      return { open: getComputedStyle(m).display !== 'none', aboveToolbar: r.bottom <= t.top + 1, vis, missing: ids.filter(i => vis.indexOf(i) < 0) }; });
    if (!more.open || !more.aboveToolbar || more.missing.length) bad('[더보기] 메뉴: ' + JSON.stringify(more));
    if (await cvs() !== C0) bad('[더보기] 를 열었더니 캔버스 크기 바뀜');
    await shot('c_more');
    await tp2.tap('#tbMore'); await tp2.waitForTimeout(200);
    if (await cvs() !== C0) bad('[더보기] 를 닫았더니 캔버스 크기 바뀜');

    // 소환 금지 — [소환] "금지 NR" 잠김 · [더보기] 점
    const ban = await tp2.evaluate(() => { const R = window.RPD, E = R.EliteManager; E.banUntil = R.GameManager.wave + 3; R.bus.emit('elite:changed', {});
      const b = document.getElementById('btnSummon'); const out = { disabled: b.disabled, text: document.getElementById('summonCost').textContent, dot: !document.getElementById('tbMoreDot').hidden, left: E.banRoundsLeft() };
      E.banUntil = 0; R.bus.emit('elite:changed', {}); return out; });
    if (!ban.disabled || ban.text !== '금지 ' + ban.left + 'R' || !ban.dot) bad('소환 금지 표시: ' + JSON.stringify(ban));

    // 보상 지급 알림 — 툴바 위 줄에(필드 위 카드 없음)
    const toast = await tp2.evaluate(() => { const R = window.RPD; R.bus.emit('reward:granted', { wave: 10, items: [{ kind: 'gold', amount: 550, paid: true }, { kind: 'ticket', count: 2 }] });
      return { strip: document.getElementById('infoBar').innerText.replace(/\s+/g, ' '), pop: getComputedStyle(document.getElementById('rewardPop')).display }; });
    if (!/10R 보스 처치/.test(toast.strip) || toast.pop !== 'none') bad('보상 알림: ' + JSON.stringify(toast));

    // (e) 설명서 — 보스 보상 절
    await tp2.evaluate(() => { window.RPD.HudPanels.toggleHelp(true); document.querySelector('#helpTabs [data-help="boss"]').click(); });
    await tp2.waitForTimeout(300);
    const help = await tp2.evaluate(() => { const RM = window.RPD.RewardManager, box = document.getElementById('helpBoss');
      const keys = Object.keys(RM.table); const missing = keys.filter(k => !box.querySelector('[data-boss-n="' + k + '"]') || box.innerText.indexOf(RM.describe(RM.table[k])) < 0);
      return { rows: box.querySelectorAll('[data-boss-n]').length, keys: keys.length, missing, next: /다음 보스/.test(box.innerText) }; });
    if (help.missing.length || !help.next) bad('설명서 보스 보상: ' + JSON.stringify(help));
    await shot('e_help_boss');
    await tp2.evaluate(() => window.RPD.HudPanels.toggleHelp(false));
    m2Report.push({ dev, canvas: C0, toolbar: [tbar.w, tbar.h], summon: [btns['#btnSummon'].w, btns['#btnSummon'].h], bossUp, chip, craft: { rd, after }, help, errors: terr.slice(0, 2) });
    await tctx2.close();
  }
  // (g) PC 보스 라운드 — 보상 칩이 그대로 보여야
  {
    const pctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const pp = await pctx.newPage();
    await pp.goto(URL); await pp.waitForTimeout(1000);
    await pp.evaluate(tbPrep, { wave: 10 });
    await pp.waitForTimeout(2600);
    await pp.evaluate(() => window.RPD.Loop.setPaused(true));
    const pchip = await pp.evaluate(() => { const n = document.getElementById('nextReward'), r = n.getBoundingClientRect();
      return { display: getComputedStyle(n).display, hidden: n.hidden, w: Math.round(r.width), toolbar: getComputedStyle(document.getElementById('mobileTabs')).display, strip: getComputedStyle(document.getElementById('infoBar')).display }; });
    if (pchip.display === 'none' || pchip.hidden || !(pchip.w > 0)) bad('PC 에서 보스 보상 칩이 안 보임: ' + JSON.stringify(pchip));
    if (pchip.toolbar !== 'none' || pchip.strip !== 'none') bad('PC 에 휴대폰 툴바 · 조합 가능 줄이 보임: ' + JSON.stringify(pchip));
    await pp.screenshot({ path: require('path').join(__dirname, '..', 'dist', '17_m2_PC_g_boss_round.png') });
    m2Report.push({ dev: 'PC', chip: pchip });
    await pctx.close();
  }
  function bad(w) { m2Problems.push('PC: ' + w); }
  m2Report.forEach(r => console.log('mobile2', JSON.stringify(r)));
  console.log('mobile2 problems', JSON.stringify(m2Problems));
  if (m2Problems.length) process.exitCode = 1;

  /* ⑱ 모바일 ③ 편의 기능(세션 68) — 되돌리기 · 진동/효과 설정 · 자리 비움 일시정지 · 조작 방해 막기 · 효과 3단계 그리기 시간.
   * 검사(하나라도 어긋나면 이 도구가 실패로 끝난다):
   *   [되돌리기] 가 이동 뒤 켜지고(44px 가까이) 누르면 실제로 제자리 · 가로는 누구 줄 안 / [더보기] 에 진동 · 효과 /
   *   hidden 이벤트 → 일시정지 + 덮개, 다시 보여도 그대로, 누르면 계속 / 계산된 스타일(overscroll · touch-action · user-select) · viewport-fit=cover /
   *   효과 3단계에서 캔버스 해상도 · 파티클 상한이 바뀐다.
   * 캡처: (a) 세로 [되돌리기] 켜짐 (b) 세로 [더보기] 진동 · 효과 (c) 세로 "일시정지됨 — 눌러서 계속" (d) 가로 (a) · 효과 단계별 같은 전투 장면 */
  const m3Problems = [];
  const m3Report = {};
  for (const dev of ['Galaxy S24', 'Galaxy S24 landscape']) {
    const c3 = await browser.newContext({ ...devices[dev], defaultBrowserType: undefined });
    const p3 = await c3.newPage();
    const e3 = [];
    p3.on('pageerror', e => e3.push(e.message));
    await p3.goto(URL); await p3.waitForTimeout(1000);
    const tag = dev.replace(/ /g, '_'), land = /landscape/.test(dev);
    const bad = w => m3Problems.push(dev + ': ' + w);
    const shot = name => p3.screenshot({ path: require('path').join(__dirname, '..', 'dist', '18_m3_' + tag + '_' + name + '.png') });

    // (a) 옮긴 뒤 [되돌리기] 켜짐 — 실제 정보 바 [이동] → 빈 칸
    await p3.evaluate(tbPrep, { wave: 7 });
    await p3.waitForTimeout(2600);
    await p3.evaluate(() => window.RPD.Loop.setPaused(true));
    const undoOff = await p3.evaluate(() => { const b = document.querySelector('#infoBar [data-ib="undo"]'); return b ? b.disabled : 'none'; });
    if (undoOff !== true) bad('기록이 없는데 [되돌리기] 가 흐리지 않다(' + undoOff + ')');
    const mv = await p3.evaluate(() => {
      const R = window.RPD, F = R.FieldManager;
      const from = F.slots.find(x => x.unit && x.unit.defId === 'charizard').index;
      const to = F.slots.find(x => x.unlocked && !x.blocked && !x.unit).index;
      F.select(from);
      return { from, to };
    });
    await p3.tap('#infoBar [data-ib="move"]'); await p3.waitForTimeout(150);
    await p3.evaluate(m => window.RPD.MobileSheet.moveTo(m.to), mv); await p3.waitForTimeout(200);
    const ub = await p3.evaluate(() => {
      const b = document.querySelector('#infoBar [data-ib="undo"]'), w = document.querySelector('#infoBar .ib__who'), bar = document.getElementById('infoBar');
      const r = b.getBoundingClientRect(), wr = w.getBoundingClientRect(), br = bar.getBoundingClientRect();
      return { disabled: b.disabled, count: b.textContent.replace(/\s+/g, ''), w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), whoTop: Math.round(wr.top),
        inside: r.left >= br.left - 1 && r.right <= br.right + 1 && r.top >= br.top - 1 && r.bottom <= br.bottom + 1, whoW: Math.round(wr.width) };
    });
    if (ub.disabled) bad('옮겼는데 [되돌리기] 가 흐리다');
    if (ub.h < 40 || ub.w < 40) bad('[되돌리기] 크기 ' + ub.w + '×' + ub.h);
    if (!ub.inside) bad('[되돌리기] 가 정보 바 밖으로 나갔다');
    if (land && Math.abs(ub.top - ub.whoTop) > 12) bad('가로: [되돌리기] 가 누구 줄에 없다(' + ub.top + ' vs ' + ub.whoTop + ')');
    await shot(land ? 'd_undo' : 'a_undo');
    await p3.tap('#infoBar [data-ib="undo"]'); await p3.waitForTimeout(200);
    const back = await p3.evaluate(m => { const F = window.RPD.FieldManager; return { from: F.get(m.from).unit && F.get(m.from).unit.defId, to: !!F.get(m.to).unit, left: window.RPD.UndoManager.count() }; }, mv);
    if (back.from !== 'charizard' || back.to) bad('[되돌리기] 를 눌렀는데 제자리로 안 돌아감 ' + JSON.stringify(back));
    m3Report[dev] = { undoBtn: ub, back };
    // 정보 바 글이 안 잘리는가(세션 69 — [↶] 가 들어온 뒤 세로에서 DPS 가 "…"로 잘렸다) — 가장 긴 이름 · 긴 DPS 로
    const cuts = await p3.evaluate(() => {
      const R = window.RPD, F = R.FieldManager, idx = F.slots.find(x => x.unit && x.unit.defId === 'charizard').index;
      const keep = F.get(idx).unit, out = [];
      for (const [id, dps] of [['charizard_transcend', 9876543], ['vileplume', 99999], ['pikachu', 158]]) {
        const u = R.UnitManager.create(id); F.remove(idx); F.place(idx, u); u.dps = dps; F.select(idx); R.MobileSheet.renderBar();
        const cut = sel => { const n = document.querySelector('#infoBar ' + sel); return !n || n.scrollWidth > n.clientWidth + 1; };
        const undo = document.querySelector('#infoBar [data-ib="undo"]').getBoundingClientRect(), who = document.querySelector('#infoBar .ib__who').getBoundingClientRect();
        out.push({ id, name: cut('.ib__name'), meta: cut('.ib__meta'), text: document.querySelector('#infoBar .ib__txt').innerText.replace(/\s+/g, ' '), undoRow: Math.abs(undo.top - who.top) < 14  });
      }
      F.select(idx);
      return { out, restore: (F.remove(idx), F.place(idx, keep), F.select(idx), R.MobileSheet.renderBar(), true) };
    });
    cuts.out.forEach(c => { if (c.name || c.meta) bad('정보 바 글이 잘림: ' + c.text + (c.name ? ' (이름)' : '') + (c.meta ? ' (등급 · DPS)' : '')); });
    if (land) cuts.out.forEach(c => { if (!c.undoRow) bad('가로: 긴 글에 [↶] 가 다음 줄로 밀림 — ' + c.id); });
    await p3.evaluate(() => { const R = window.RPD, F = R.FieldManager, u = R.UnitManager.create('charizard_transcend'); const i = F.selectedIndex; F.remove(i); F.place(i, u); u.dps = 9876543; F.select(i); R.MobileSheet.renderBar(); });
    await shot(land ? 'd2_longtext' : 'a2_longtext');
    await p3.evaluate(() => { const R = window.RPD, F = R.FieldManager, i = F.selectedIndex; F.remove(i); F.place(i, R.UnitManager.create('charizard')); F.select(i); R.MobileSheet.renderBar(); });
    m3Report[dev].infoBarText = cuts.out;
    if (land) { m3Report[dev].errors = e3.slice(0, 2); await c3.close(); continue; }

    // 조작 방해 막기 — 계산된 스타일 · viewport
    const st = await p3.evaluate(() => {
      const cs = (n, p) => n ? getComputedStyle(n).getPropertyValue(p) : 'none';
      const chat = document.getElementById('chatInput');
      return {
        viewport: document.querySelector('meta[name="viewport"]').content,
        htmlOverscroll: cs(document.documentElement, 'overscroll-behavior-y'), bodyOverscroll: cs(document.body, 'overscroll-behavior-y'),
        bodyTouch: cs(document.body, 'touch-action'), canvasTouch: cs(document.getElementById('gameCanvas'), 'touch-action'),
        btnTouch: cs(document.getElementById('btnSummon'), 'touch-action'),
        canvasSelect: cs(document.getElementById('gameCanvas'), 'user-select'), bodySelect: cs(document.body, 'user-select'),
        inputSelect: chat ? cs(chat, 'user-select') : 'no-input', inputId: chat && chat.id,
        appH: Math.round(document.querySelector('.app').getBoundingClientRect().height), innerH: innerHeight,
        coarse: matchMedia('(pointer: coarse)').matches
      };
    });
    if (!/viewport-fit=cover/.test(st.viewport)) bad('viewport-fit=cover 없음');
    if (st.htmlOverscroll !== 'none' || st.bodyOverscroll !== 'none') bad('overscroll-behavior ' + st.htmlOverscroll + '/' + st.bodyOverscroll);
    if (st.bodyTouch !== 'manipulation') bad('body touch-action ' + st.bodyTouch);
    if (st.canvasTouch !== 'none') bad('캔버스 touch-action ' + st.canvasTouch + ' (끌기 · 길게 누르기는 게임이 받아야)');
    if (st.canvasSelect !== 'none' || st.bodySelect !== 'none') bad('user-select ' + st.canvasSelect + '/' + st.bodySelect);
    if (st.inputSelect !== 'text' && st.inputSelect !== 'auto') bad('입력칸 user-select ' + st.inputSelect);
    if (Math.abs(st.appH - st.innerH) > 2) bad('.app 높이 ' + st.appH + ' ≠ 화면 ' + st.innerH + '(100dvh)');
    m3Report.styles = st;
    // 캔버스 길게 누르기 메뉴가 막히는가(contextmenu 가 취소되는가)
    const ctxBlocked = await p3.evaluate(() => {
      const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      document.getElementById('gameCanvas').dispatchEvent(ev);
      const ev2 = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      const inp = document.getElementById('chatInput'); if (inp) inp.dispatchEvent(ev2);
      return { canvas: ev.defaultPrevented, input: inp ? ev2.defaultPrevented : null };
    });
    if (!ctxBlocked.canvas || ctxBlocked.input) bad('contextmenu 캔버스 ' + ctxBlocked.canvas + ' · 입력칸 ' + ctxBlocked.input);
    m3Report.contextmenu = ctxBlocked;

    // (b) [더보기] — 진동 · 효과
    await p3.tap('#tbMore'); await p3.waitForTimeout(300);
    const mb = await p3.evaluate(() => ['btnHaptics', 'btnFx'].map(id => { const n = document.getElementById(id), r = n.getBoundingClientRect();
      return { id, shown: getComputedStyle(n).display !== 'none' && r.width > 0, label: n.getAttribute('aria-label'), w: Math.round(r.width), h: Math.round(r.height) }; }));
    mb.forEach(b => { if (!b.shown) bad('[더보기] 에 ' + b.id + ' 가 안 보임'); if (b.h < 44) bad(b.id + ' 높이 ' + b.h); });
    await p3.tap('#btnHaptics'); await p3.waitForTimeout(100);
    const hOff = await p3.evaluate(() => ({ label: document.getElementById('btnHaptics').getAttribute('aria-label'), saved: window.RPD.SaveManager.getSetting('haptics', true) }));
    if (hOff.saved !== false || hOff.label !== '진동 끔') bad('진동 끄기: ' + JSON.stringify(hOff));
    await p3.tap('#btnHaptics'); await p3.waitForTimeout(100);
    await shot('b_more_settings');
    m3Report.more = { buttons: mb, hapticsOff: hOff, fxDefault: await p3.evaluate(() => window.RPD.Effects.levelId()) };
    await p3.tap('#tbMore'); await p3.waitForTimeout(200);

    // (c) 자리 비움 — 실제 visibilitychange(hidden) · 다시 visible · 덮개 누르기
    await p3.evaluate(() => { window.RPD.Loop.setPaused(false); window.RPD.GameManager.setState(window.RPD.GameState.RUNNING); });
    const setHidden = h => p3.evaluate(v => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => v });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (v ? 'hidden' : 'visible') });
      document.dispatchEvent(new Event('visibilitychange'));
    }, h);
    await setHidden(true); await p3.waitForTimeout(150);
    await setHidden(false); await p3.waitForTimeout(400);
    const aw = await p3.evaluate(() => ({ paused: window.RPD.Loop.paused, state: window.RPD.GameManager.state, overlay: getComputedStyle(document.getElementById('awayOverlay')).display !== 'none',
      text: document.getElementById('awayOverlay').innerText.replace(/\s+/g, ' ') }));
    if (!aw.paused || aw.state !== 'PAUSED' || !aw.overlay) bad('hidden 뒤 일시정지 · 덮개: ' + JSON.stringify(aw));
    await shot('c_away_paused');
    await p3.tap('#awayOverlay'); await p3.waitForTimeout(200);
    const aw2 = await p3.evaluate(() => ({ paused: window.RPD.Loop.paused, state: window.RPD.GameManager.state, overlay: !document.getElementById('awayOverlay').hidden }));
    if (aw2.paused || aw2.state !== 'RUNNING' || aw2.overlay) bad('덮개를 눌렀는데 안 이어짐: ' + JSON.stringify(aw2));
    m3Report.away = { hidden: aw, afterTap: aw2 };

    // 효과 3단계 — 같은 전투 장면(47R — 보스 라운드가 아닌 적 무리 · 6마리)의 한 프레임 그리기 시간 · 해상도 · 파티클(CPU 4배 느리게)
    const cdp3 = await c3.newCDPSession(p3);
    const fxRes = {};
    for (const lv of ['normal', 'reduced', 'minimal']) {
      await p3.evaluate(() => {
        const R = window.RPD;
        document.querySelectorAll('.modepick, .result, .help, .book').forEach(o => o.hidden = true);
        R.Game.resetAll('NORMAL', 'NORMAL'); R.Game.startRun('NORMAL', 'NORMAL');
        R.GameManager.setWave(47); R.WaveManager.startRound(47);
        const F = R.FieldManager;
        F.slots.forEach(x => { if (!x.unlocked) x.unlocked = true; });
        F.slots.forEach(x => { if (x.unit) F.remove(x.index); });
        const ids = ['charizard', 'blastoise', 'venusaur', 'pikachu', 'gengar', 'alakazam', 'dragonite', 'gyarados', 'arcanine', 'lapras', 'jolteon', 'flareon', 'vaporeon', 'machamp', 'golem', 'raichu', 'ninetales', 'starmie', 'exeggutor', 'snorlax'];
        // 6마리만 — 다 올리면 47R 적이 순식간에 녹아 재는 동안 필드가 빈다(적이 살아 있어야 연출 · 체력 막대가 그려진다)
        F.slots.filter(x => x.unlocked && !x.blocked).slice(0, 6).forEach((x, i) => { const u = R.UnitManager.create(ids[i % ids.length]); if (u) F.place(x.index, u); });
        R.GameManager.life = 9999; R.Loop.setSpeed(1);
        R.bus.emit('field:changed', {});
      });
      // 화질 사다리(FramePacer)는 재는 동안 멈춘다 — 느린 CPU 흉내에서 사다리가 먼저 해상도를 내리면 단계 차이가 안 보인다
      await p3.evaluate(l => { const P = window.RPD.FramePacer; P.reset(); P._stepDown = P._stepDown || P.stepDown; P.stepDown = () => false; window.RPD.Effects.force(l); }, lv);
      await cdp3.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await p3.waitForTimeout(5000);   // 적이 들어오고 연출이 쌓일 때까지
      const m = await p3.evaluate(() => new Promise(res => {
        const R = window.RPD, times = [], parts = [];
        let n = 0;
        function frame() {
          const t0 = performance.now();
          R.Renderer.render(1 / 60);
          times.push(performance.now() - t0);
          parts.push(R.AttackFx.stats().particles);
          if (++n < 90) requestAnimationFrame(frame); else res({ times, parts });
        }
        requestAnimationFrame(frame);
      }));
      await cdp3.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      const sorted = m.times.slice().sort((a, b) => a - b);
      const avg = m.times.reduce((a, b) => a + b, 0) / m.times.length;
      const info = await p3.evaluate(() => ({ dpr: window.RPD.Renderer.dpr, canvas: window.RPD.Renderer.canvas.width + '×' + window.RPD.Renderer.canvas.height,
        cap: window.RPD.AttackFx.stats().particleCap, fps: window.RPD.FramePacer.targetFps(), enemies: window.RPD.EnemyManager.enemies.filter(e => e.alive).length }));
      // 1초에 그리기에 쓰는 시간 = 한 번 그리는 시간 × 1초에 그리는 횟수(최소는 30fps 라 절반만 그린다)
      fxRes[lv] = { ...info, drawMsPerSec: Math.round(avg * info.fps), drawMsAvg: +avg.toFixed(2), drawMsMedian: +sorted[sorted.length >> 1].toFixed(2), drawMsP90: +sorted[Math.floor(sorted.length * 0.9)].toFixed(2),
        particlesAvg: Math.round(m.parts.reduce((a, b) => a + b, 0) / m.parts.length) };
      await p3.evaluate(() => window.RPD.Loop.setPaused(true));
      await p3.screenshot({ path: require('path').join(__dirname, '..', 'dist', '18_m3_fx_' + lv + '.png') });
      await p3.evaluate(() => window.RPD.Loop.setPaused(false));
    }
    await p3.evaluate(() => { const P = window.RPD.FramePacer; if (P._stepDown) P.stepDown = P._stepDown; window.RPD.Effects.force(null); });
    if (!(fxRes.normal.dpr > fxRes.reduced.dpr && fxRes.reduced.dpr > fxRes.minimal.dpr)) bad('효과 단계별 해상도가 안 내려감 ' + [fxRes.normal.dpr, fxRes.reduced.dpr, fxRes.minimal.dpr]);
    if (!(fxRes.normal.cap > fxRes.reduced.cap && fxRes.reduced.cap > fxRes.minimal.cap)) bad('효과 단계별 파티클 상한이 안 내려감');
    m3Report.fx = fxRes;
    m3Report[dev].errors = e3.slice(0, 2);
    if (e3.length) bad('페이지 오류: ' + e3[0]);
    await c3.close();
  }
  console.log('mobile3', JSON.stringify(m3Report, null, 1));
  console.log('mobile3 problems', JSON.stringify(m3Problems));
  report.push({ mobile3: m3Report });
  if (m3Problems.length) process.exitCode = 1;

  /* ⑲ 판 이어하기(세션 70) — 34라운드까지 진행 → 새로고침 → 이어하기 카드 → [이어하기] → "눌러서 계속" → 그 라운드가 다시 열린다.
   * 새로고침 전(34라운드 시작 순간 = 저장 시점)과 이어한 뒤를 비교한다. 어긋나면 이 도구가 실패로 끝난다.
   * 캡처: (a) 세로 시작 화면 이어하기 카드 (b) 이어한 직후 "눌러서 계속" (c) 버전 불일치 안내 (d) PC 이어하기 카드 */
  const m4Problems = [], m4Report = {};
  {
    const bad = w => m4Problems.push(w);
    const snap = () => {
      const R = window.RPD, F = R.FieldManager, S = R.StorageManager, GM = R.GameManager, GS = R.GoldShopManager;
      const lv = o => Object.keys(o).sort().map(k => k + o[k]).join(',');
      return { round: GM.wave, gold: GM.gold, life: GM.life, fieldUnits: F.getAllUnits().length, storageUnits: S.units.length,
        species: F.getAllUnits().concat(S.units).map(u => u.defId + '/' + (u.level || 0)).sort().join(' '),
        tickets: R.SummonManager.tickets, shards: R.ShardManager.shards, shop: lv(GS.typeLv) + ' | ' + lv(GS.tierLv), eliteBan: R.EliteManager.banUntil,
        mode: GM.mode.label };
    };
    const c4 = await browser.newContext({ ...devices['Galaxy S24'], defaultBrowserType: undefined });
    const p4 = await c4.newPage();
    const e4 = [];
    p4.on('pageerror', e => e4.push(e.message));
    await p4.goto(URL); await p4.waitForTimeout(1000);
    // 34라운드까지 — 게임 로직(고정 60Hz 갱신)을 빨리 돌린다. 중간에 소환 · 골드 상점 · 창고도 쓴다
    const progressed = await p4.evaluate(() => {
      const R = window.RPD, GM = R.GameManager, F = R.FieldManager, S = R.GameState;
      if (R.TutorialManager && R.TutorialManager.skip) R.TutorialManager.skip();
      document.querySelectorAll('.modepick, .result, .help, .book').forEach(o => o.hidden = true);
      R.RunSave.clear();
      R.Game.startRun('NORMAL', 'NORMAL');
      R.Loop.setPaused(true);   // 진짜 시간 대신 아래에서 갱신을 직접 돌린다
      const open = F.slots.filter(x => x.unlocked && !x.blocked);
      ['mewtwo', 'moltres', 'zapdos', 'articuno', 'dragonite', 'alakazam', 'gengar', 'charizard'].forEach((id, i) => {
        if (open[i] && !open[i].unit) F.place(open[i].index, R.UnitManager.create(id));
      });
      R.bus.emit('field:changed', {});
      let snapAt34 = null;
      const onStart = () => { if (GM.wave === 34 && !snapAt34) snapAt34 = JSON.parse(localStorage.getItem(R.RunSave.KEY) || 'null'); };
      R.bus.on('wave:started', onStart);
      const step = R.Config.fixedStep;
      let guard = 0;
      while (!(GM.wave === 34 && snapAt34) && GM.state !== S.GAMEOVER && guard < 60 * 60 * 40) {
        for (let k = 0; k < R.Loop._updateFns.length; k++) R.Loop._updateFns[k](step);
        guard++;
        if (guard % 600 === 0) {   // 10초마다 — 사람이 하듯 소환 · 상점
          if (GM.gold > 400) R.SummonManager.summon();
          if (GM.gold > 600) R.GoldShopManager.buy('type', 'PSYCHIC');
          if (GM.wave === 20 && R.StorageManager.units.length < 2) R.StorageManager.add(R.UnitManager.create('bulbasaur'));
        }
      }
      R.bus.off('wave:started', onStart);
      return { wave: GM.wave, state: GM.state, gameSeconds: Math.round(guard * step), saved: !!snapAt34, savedWave: snapAt34 && snapAt34.summary.wave };
    });
    m4Report.progressed = progressed;
    if (progressed.wave !== 34 || !progressed.saved) bad('34라운드 저장까지 못 갔다 ' + JSON.stringify(progressed));
    const before = await p4.evaluate(() => {
      // 저장 시점(34라운드 시작 직후)의 값 — 저장본에서 그대로 읽는다(그 뒤에 흐른 몇 프레임과 섞이지 않게)
      const d = JSON.parse(localStorage.getItem(window.RPD.RunSave.KEY)), st = d.state;
      const lv = o => Object.keys(o).sort().map(k => k + o[k]).join(',');
      const units = st.FieldManager.units.map(e => e.unit).concat(st.StorageManager.units);
      return { round: st.GameManager.wave, gold: st.GameManager.gold, life: st.GameManager.life, fieldUnits: st.FieldManager.units.length, storageUnits: st.StorageManager.units.length,
        species: units.map(u => u.defId + '/' + (u.level || 0)).sort().join(' '), tickets: st.SummonManager.tickets, shards: st.ShardManager.shards,
        shop: lv(st.GoldShopManager.typeLv) + ' | ' + lv(st.GoldShopManager.tierLv), eliteBan: st.EliteManager.banUntil, mode: d.summary.label };
    });
    // 새로고침(휴대폰이 탭을 닫았다 다시 연 것과 같다)
    await p4.reload(); await p4.waitForTimeout(1200);
    const card = await p4.evaluate(() => { const c = document.getElementById('resumeCard'); return { shown: !c.hidden && getComputedStyle(c).display !== 'none', text: document.getElementById('resumeInfo').textContent,
      state: window.RPD.GameManager.state, wave: window.RPD.GameManager.wave }; });
    if (!card.shown) bad('새로고침 뒤 이어하기 카드가 없다');
    const inView = await p4.evaluate(() => ['resumeCard', 'btnResume', 'btnNewRun', 'btnStart'].map(id => { const r = document.getElementById(id).getBoundingClientRect();
      return { id, ok: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, r: [Math.round(r.left), Math.round(r.right)] }; }));
    inView.forEach(v => { if (!v.ok) bad('세로 시작 화면에서 ' + v.id + ' 가 화면 밖 ' + JSON.stringify(v.r)); });
    if (card.wave !== 0 || card.state !== 'READY') bad('새로고침 뒤 저절로 이어했다 ' + JSON.stringify(card));
    ['34라운드', '라이프 ' + before.life, '골드 ' + String(before.gold).replace(/\B(?=(\d{3})+(?!\d))/g, ',')].forEach(w => { if (card.text.indexOf(w) < 0) bad('카드에 "' + w + '" 없음: ' + card.text); });
    await p4.screenshot({ path: require('path').join(__dirname, '..', 'dist', '19_resume_a_card_portrait.png') });
    await p4.tap('#btnResume'); await p4.waitForTimeout(400);
    const after = await p4.evaluate(snap);
    const gate = await p4.evaluate(() => ({ overlay: !document.getElementById('awayOverlay').hidden, paused: window.RPD.Loop.paused, phase: window.RPD.WaveManager.phase }));
    if (!gate.overlay || !gate.paused || gate.phase !== 'IDLE') bad('이어한 직후 "눌러서 계속"이 아니다 ' + JSON.stringify(gate));
    await p4.screenshot({ path: require('path').join(__dirname, '..', 'dist', '19_resume_b_tap_to_continue.png') });
    Object.keys(before).forEach(k => { if (String(before[k]) !== String(after[k])) bad('이어한 뒤 ' + k + ' 다름: ' + before[k] + ' → ' + after[k]); });
    await p4.tap('#awayOverlay'); await p4.waitForTimeout(1500);
    const run = await p4.evaluate(() => ({ phase: window.RPD.WaveManager.phase, wave: window.RPD.WaveManager.wave, state: window.RPD.GameManager.state, spawned: window.RPD.WaveManager.spawnedUnits }));
    if (run.wave !== 34 || run.state !== 'RUNNING' || !(run.spawned > 0)) bad('"눌러서 계속" 뒤 34라운드가 안 열렸다 ' + JSON.stringify(run));
    m4Report.table = { before, after, run, card: card.text };
    // (c) 버전 불일치 — 없는 포켓몬이 든 저장
    await p4.evaluate(() => { const k = window.RPD.RunSave.KEY, d = JSON.parse(localStorage.getItem(k)); d.state.StorageManager.units.push({ defId: 'agumon', level: 0 }); localStorage.setItem(k, JSON.stringify(d)); });
    await p4.reload(); await p4.waitForTimeout(1200);
    const ver = await p4.evaluate(() => ({ notice: !document.getElementById('runNotice').hidden, text: document.getElementById('runNoticeText').textContent, card: !document.getElementById('resumeCard').hidden,
      saved: localStorage.getItem(window.RPD.RunSave.KEY) != null }));
    if (!ver.notice || ver.card || ver.saved) bad('버전 불일치 안내 · 저장 지움 ' + JSON.stringify(ver));
    await p4.screenshot({ path: require('path').join(__dirname, '..', 'dist', '19_resume_c_version_mismatch.png') });
    m4Report.version = ver;
    m4Report.errors = e4.slice(0, 3);
    if (e4.length) bad('페이지 오류: ' + e4[0]);
    await c4.close();
    // (d) PC — 같은 저장을 넣고 연다
    const c5 = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const p5 = await c5.newPage();
    await p5.goto(URL); await p5.waitForTimeout(800);
    await p5.evaluate(() => {
      const R = window.RPD;
      R.Game.startRun('NORMAL', 'HARD'); R.Loop.setPaused(true);
      const F = R.FieldManager, open = F.slots.filter(x => x.unlocked && !x.blocked);
      ['charizard', 'pikachu', 'gengar'].forEach((id, i) => F.place(open[i].index, R.UnitManager.create(id)));
      R.GameManager.setWave(22); R.GameManager.gold = 2380; R.GameManager.life = 37;
      R.RunSave.save();
      const d = JSON.parse(localStorage.getItem(R.RunSave.KEY)); d.savedAt = Date.now() - 7 * 60000; localStorage.setItem(R.RunSave.KEY, JSON.stringify(d));
    });
    await p5.reload(); await p5.waitForTimeout(1200);
    const pc = await p5.evaluate(() => ({ shown: !document.getElementById('resumeCard').hidden, text: document.getElementById('resumeInfo').textContent }));
    if (!pc.shown || pc.text.indexOf('7분 전') < 0) bad('PC 이어하기 카드 ' + JSON.stringify(pc));
    await p5.screenshot({ path: require('path').join(__dirname, '..', 'dist', '19_resume_d_card_pc.png') });
    m4Report.pc = pc;
    await c5.close();
  }
  console.log('resume', JSON.stringify(m4Report, null, 1));
  console.log('resume problems', JSON.stringify(m4Problems));
  report.push({ resume: m4Report });
  if (m4Problems.length) process.exitCode = 1;

  /* ⑳ HUD 표시 버그 둘(세션 72) — PC. (a) 31~40R 에 "다음 보스 보상" 칩이 40R 초월의 조각까지 그려지는가 · 40R 보스를 잡으면 보상 카드가 뜨는가
   * (b) 상단 "N R 뒤 등급" 이 소환 없이 라운드만 바뀌어도 맞는가(23R "2R 뒤 희귀함" → 61R 숨김). 어긋나면 도구가 실패로 끝난다.
   * 캡처: 20_hud_a_next_reward_40R · 20_hud_b_reward_card_40R · 20_hud_c_next_unlock_23R · 20_hud_d_next_unlock_61R */
  const m5Problems = [], m5Report = {};
  {
    const bad = w => m5Problems.push(w);
    const c6 = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const p6 = await c6.newPage();
    const e6 = [];
    p6.on('pageerror', e => e6.push(e.message));
    p6.on('console', m => { if (m.type() === 'error') e6.push(m.text()); });
    await p6.goto(URL); await p6.waitForTimeout(1000);
    await p6.evaluate(() => {
      const R = window.RPD;
      if (R.TutorialManager && R.TutorialManager.skip) R.TutorialManager.skip();
      document.querySelectorAll('.modepick, .result, .help, .book').forEach(o => o.hidden = true);
      R.RunSave.clear(); R.Game.startRun('NORMAL', 'NORMAL'); R.Loop.setPaused(true);
      R.GameManager.life = 999;
    });
    const shot6 = n => p6.screenshot({ path: require('path').join(__dirname, '..', 'dist', '20_hud_' + n + '.png'), clip: { x: 0, y: 0, width: 1440, height: 330 } });
    // (c) 23R — 소환 없이 라운드만 이동
    await p6.evaluate(() => window.RPD.GameManager.setWave(23)); await p6.waitForTimeout(250);
    m5Report.unlock23 = await p6.evaluate(() => { const n = document.getElementById('statNextUnlock'); return { hidden: n.hidden, text: n.textContent }; });
    if (m5Report.unlock23.hidden || m5Report.unlock23.text !== '2R 뒤 희귀함') bad('23R 다음 해금: ' + JSON.stringify(m5Report.unlock23));
    await shot6('c_next_unlock_23R');
    // (d) 61R
    await p6.evaluate(() => window.RPD.GameManager.setWave(61)); await p6.waitForTimeout(250);
    m5Report.unlock61 = await p6.evaluate(() => { const n = document.getElementById('statNextUnlock'); return { hidden: n.hidden || getComputedStyle(n).display === 'none', text: n.textContent }; });
    if (!m5Report.unlock61.hidden) bad('61R 인데 다음 해금이 보인다: ' + JSON.stringify(m5Report.unlock61));
    await shot6('d_next_unlock_61R');
    // (a) 33R — 다음 보스 보상(40R · 초월의 조각)
    await p6.evaluate(() => window.RPD.GameManager.setWave(33)); await p6.waitForTimeout(250);
    m5Report.chip = await p6.evaluate(() => { const n = document.getElementById('nextReward'); return { shown: getComputedStyle(n).display !== 'none', text: n.textContent.replace(/\s+/g, ' ') }; });
    if (!m5Report.chip.shown || !/40R 보스 보상/.test(m5Report.chip.text) || !/초월의 조각/.test(m5Report.chip.text)) bad('33R 다음 보스 보상 칩: ' + JSON.stringify(m5Report.chip));
    await shot6('a_next_reward_40R');
    // (b) 40R 보스 처치 — 실제로 보스를 잡아 보상 카드(PC)가 뜨는가
    m5Report.card = await p6.evaluate(() => new Promise(res => {
      const R = window.RPD;
      R.GameManager.setWave(40); R.WaveManager.startRound(40);
      R.Loop.setPaused(false);
      setTimeout(() => {
        const boss = R.EnemyManager.enemies.find(e => e.isBoss);   // 라운드가 열린 뒤 실제 보스(방어가 있어 넉넉히 때린다)
        if (boss) R.EnemyManager.damage(boss, boss.maxHp * 10, {});
        setTimeout(() => { const c = document.getElementById('rewardPop'); res({ boss: !!boss, shown: !c.hidden, text: c.textContent.replace(/\s+/g, ' ') }); }, 400);
      }, 1500);   // 보스가 나올 때까지(스폰 간격)
    }));
    if (!m5Report.card.shown || !/초월의 조각/.test(m5Report.card.text)) bad('40R 보스 처치 보상 카드: ' + JSON.stringify(m5Report.card));
    await p6.screenshot({ path: require('path').join(__dirname, '..', 'dist', '20_hud_b_reward_card_40R.png') });
    m5Report.errors = e6.slice(0, 3);
    if (e6.length) bad('페이지 오류: ' + e6[0]);
    await c6.close();
  }
  console.log('hud', JSON.stringify(m5Report));
  console.log('hud problems', JSON.stringify(m5Problems));
  report.push({ hud: m5Report });
  if (m5Problems.length) process.exitCode = 1;

  /* ㉑ 포켓몬 잠금(세션 74) — 갤럭시 S24 세로(실제 손가락) + PC. 잠근 포켓몬: 필드 🔒 · 정보 바 [잠금] · 방출 막힘 · 조합식 줄 "0/1 🔒1".
   * 어긋나면 도구가 실패로 끝난다. 캡처: 21_lock_{portrait|pc}_a_field · 21_lock_{portrait|pc}_b_recipe */
  const lkProblems = [], lkReport = {};
  const lkSetup = () => {
    const R = window.RPD, F = R.FieldManager;
    const rec = R.RecipeData.list.find(x => x.materials.length === 2 && x.materials[0] !== x.materials[1] && x.materials.every(m => R.PokemonData.get(m).summon && R.PokemonData.get(m).tier === 'T1'));
    const free = F.slots.find(x => x.unlocked && !x.blocked && !x.unit);
    F.place(free.index, R.UnitManager.create(rec.materials[0]));
    const b = R.UnitManager.create(rec.materials[1]); R.StorageManager.add(b); R.UnitManager.setLocked(b, true);   // 필드엔 하나, 둘째는 창고에서 잠김
    R.RecipeManager.refresh();
    R.bus.emit('field:changed', {}); R.bus.emit('storage:changed', R.StorageManager.units);
    return { id: rec.id, a: rec.materials[0], b: rec.materials[1], slot: F.slots.find(x => x.unit && x.unit.defId === 'charizard').index };
  };
  const lkRowProbe = () => {
    const rows = [...document.querySelectorAll('#recipeList .rrow')].filter(r => r.querySelector('.rmat__lk'));
    return rows.map(r => ({ txt: r.querySelector('.rmat.is-missing .rmat__n') ? r.querySelector('.rmat.is-missing .rmat__n').textContent.replace(/\s+/g, '') : '', lk: r.querySelector('.rmat__lk').textContent.trim() }));
  };
  {
    const bad = w => lkProblems.push(w);
    // ---- 세로 휴대폰 ----
    const lctx = await browser.newContext({ ...devices['Galaxy S24'], defaultBrowserType: undefined });
    const lp = await lctx.newPage();
    const le = [];
    lp.on('pageerror', e => le.push(e.message));
    await lp.goto(URL); await lp.waitForTimeout(1000);
    await lp.evaluate(tbPrep, { wave: 7 });
    await lp.waitForTimeout(600);
    await lp.evaluate(() => window.RPD.Loop.setPaused(true));
    const info = await lp.evaluate(lkSetup);
    await lp.evaluate(i => window.RPD.FieldManager.select(i.slot), info); await lp.waitForTimeout(200);
    await lp.tap('#infoBar [data-ib="lock"]'); await lp.waitForTimeout(250);
    const pr = await lp.evaluate(i => {
      const R = window.RPD, u = R.FieldManager.get(i.slot).unit, bar = document.getElementById('infoBar');
      const bs = [...bar.querySelectorAll('.ib__btn')].map(b => { const r = b.getBoundingClientRect(); return { a: b.getAttribute('data-ib'), w: Math.round(r.width), h: Math.round(r.height) }; });
      const who = bar.querySelector('.ib__who'), br = bar.getBoundingClientRect();
      const sell = bar.querySelector('[data-ib="sell"]');
      return { locked: u.locked, bs, overflowX: bar.scrollWidth > bar.clientWidth + 1, sellDisabled: sell.disabled, sellText: sell.textContent.replace(/\s+/g, ''),
        nameCut: [...bar.querySelectorAll('.ib__name, .ib__meta')].some(n => n.scrollWidth > n.clientWidth + 1), whoW: Math.round(who.getBoundingClientRect().width),
        pageOverflow: document.documentElement.scrollWidth > window.innerWidth + 1 };
    }, info);
    if (!pr.locked) bad('세로: [잠금] 을 눌렀는데 안 잠겼다');
    if (!pr.sellDisabled) bad('세로: 잠겼는데 [방출] 이 안 막혔다');
    const lockBtn = pr.bs.find(b => b.a === 'lock');
    if (!lockBtn || lockBtn.w < 40 || lockBtn.h < 40) bad('세로: [잠금] 버튼 크기 ' + JSON.stringify(lockBtn));
    if (pr.overflowX) bad('세로: 정보 바가 가로로 넘친다');
    if (pr.nameCut) bad('세로: 정보 바 글이 잘린다');
    if (pr.pageOverflow) bad('세로: 화면이 가로로 밀린다');
    await lp.screenshot({ path: require('path').join(__dirname, '..', 'dist', '21_lock_portrait_a_field.png') });
    await lp.evaluate(() => window.RPD.HudPanels.setDrawer('recipes')); await lp.waitForTimeout(450);
    await lp.evaluate(() => { const b = document.querySelector('#recipeFilter [data-filter="all"]'); if (b) b.click(); });
    await lp.waitForTimeout(300);
    const rows = await lp.evaluate(lkRowProbe);
    if (!rows.some(r => /^0\/1/.test(r.txt) && /🔒1/.test(r.lk))) bad('세로: 조합식 줄에 "0/1 🔒1" 이 없다 ' + JSON.stringify(rows.slice(0, 3)));
    await lp.evaluate(() => { const r = document.querySelector('#recipeList .rrow:has(.rmat__lk)'); if (r) r.scrollIntoView({ block: 'center' }); });
    await lp.waitForTimeout(200);
    await lp.screenshot({ path: require('path').join(__dirname, '..', 'dist', '21_lock_portrait_b_recipe.png') });
    await lp.tap('#infoBar [data-ib="lock"]').catch(() => {});
    lkReport.portrait = { bar: pr, rows: rows.slice(0, 2) };
    if (le.length) bad('세로 페이지 오류: ' + le[0]);
    await lctx.close();

    // ---- PC ----
    const pctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const pp = await pctx.newPage();
    const pe = [];
    pp.on('pageerror', e => pe.push(e.message));
    await pp.goto(URL); await pp.waitForTimeout(1000);
    await pp.evaluate(tbPrep, { wave: 7 });
    await pp.waitForTimeout(600);
    await pp.evaluate(() => window.RPD.Loop.setPaused(true));
    const pinfo = await pp.evaluate(lkSetup);
    await pp.evaluate(i => window.RPD.FieldManager.select(i.slot), pinfo); await pp.waitForTimeout(200);
    await pp.keyboard.press('l'); await pp.waitForTimeout(250);   // 단축키 L
    const pc = await pp.evaluate(i => {
      const R = window.RPD, u = R.FieldManager.get(i.slot).unit;
      return { locked: u.locked, sellDisabled: document.getElementById('btnSell').disabled, sellText: document.getElementById('sellValue').textContent,
        lockName: document.getElementById('lockName').textContent, card: (document.getElementById('slotCard') || document.body).textContent.indexOf('🔒') >= 0 };
    }, pinfo);
    if (!pc.locked) bad('PC: L 키로 안 잠겼다');
    if (!pc.sellDisabled || pc.sellText.indexOf('잠금 해제 후 방출') < 0) bad('PC: 방출 막힘/안내 ' + JSON.stringify(pc));
    if (pc.lockName !== '잠금 해제') bad('PC: 버튼 글 ' + pc.lockName);
    await pp.screenshot({ path: require('path').join(__dirname, '..', 'dist', '21_lock_pc_a_field.png') });
    await pp.evaluate(() => { const b = document.querySelector('#recipeFilter [data-filter="all"]'); if (b) b.click(); });
    await pp.waitForTimeout(300);
    const prow = await pp.evaluate(lkRowProbe);
    if (!prow.some(r => /^0\/1/.test(r.txt) && /🔒1/.test(r.lk))) bad('PC: 조합식 줄에 "0/1 🔒1" 이 없다 ' + JSON.stringify(prow.slice(0, 3)));
    await pp.evaluate(() => { const r = document.querySelector('#recipeList .rrow:has(.rmat__lk)'); if (r) r.scrollIntoView({ block: 'center' }); });
    await pp.waitForTimeout(200);
    await pp.screenshot({ path: require('path').join(__dirname, '..', 'dist', '21_lock_pc_b_recipe.png') });
    lkReport.pc = { state: pc, rows: prow.slice(0, 2) };
    if (pe.length) bad('PC 페이지 오류: ' + pe[0]);
    await pctx.close();
  }
  console.log('lock', JSON.stringify(lkReport));
  console.log('lock problems', JSON.stringify(lkProblems));
  report.push({ lock: lkReport });
  if (lkProblems.length) process.exitCode = 1;

  /* ㉒ 일괄 창고로(세션 75) — 갤럭시 S24 세로(실제 손가락) + PC. (a) 선택 창(흔함 · 전설 · 히든 체크, 잠금 제외 표시, 창고 자리 부족 안내)
   * (b) [보내기] 뒤 토스트 "흔함 N마리를 창고로 보냈어요 (M마리는 창고가 가득 차 남음)". 어긋나면 도구가 실패로 끝난다.
   * 캡처: 22_bulk_{portrait|pc}_a_dialog · 22_bulk_{portrait|pc}_b_toast */
  const bkProblems = [], bkReport = {};
  const bkSetup = () => {
    const R = window.RPD, F = R.FieldManager, SM = R.StorageManager;
    F.slots.forEach(x => { if (!x.blocked) x.unlocked = true; });
    F.slots.forEach(x => { if (x.unit) F.remove(x.index); });
    SM.reset();
    const hid = R.PokemonData.list.find(d => d.hidden && d.tier !== 'T2') || R.PokemonData.list.find(d => d.hidden);
    const t = tier => R.PokemonData.list.find(d => d.tier === tier && !d.hidden && d.id !== 'ditto').id;
    const put = (id, n) => { const out = []; for (let i = 0; i < n; i++) { const sl = F.slots.find(x => x.unlocked && !x.blocked && !x.unit); const u = R.UnitManager.create(id); F.place(sl.index, u); out.push(u); } return out; };
    const t1 = put(t('T1'), 5); R.UnitManager.setLocked(t1[0], true);
    put(t('T2'), 2); put(t('T3'), 1); put(t('T5'), 1); put(hid.id, 1);
    SM.capacity = 2;       // 자리 2칸 — 흔함 4(잠금 제외)마리 중 2마리만 들어간다
    R.UnitManager.recomputeAll();
    R.GameManager.life = 999;
    R.bus.emit('field:changed', {}); R.bus.emit('storage:changed', SM.units);
    return { hidden: hid.id };
  };
  {
    const bad = w => bkProblems.push(w);
    for (const mode of ['portrait', 'pc']) {
      const bctx = await browser.newContext(mode === 'pc' ? { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } : { ...devices['Galaxy S24'], defaultBrowserType: undefined });
      const bp = await bctx.newPage();
      const be = [];
      bp.on('pageerror', e => be.push(e.message));
      await bp.goto(URL); await bp.waitForTimeout(1000);
      await bp.evaluate(tbPrep, { wave: 7 });
      await bp.waitForTimeout(500);
      await bp.evaluate(() => window.RPD.Loop.setPaused(true));
      await bp.evaluate(bkSetup);
      if (mode === 'pc') await bp.click('#btnBulkStore');
      else { await bp.evaluate(() => window.RPD.HudPanels.setDrawer('owned')); await bp.waitForTimeout(400); await bp.tap('#btnBulkStore'); }
      await bp.waitForTimeout(350);
      // 흔함 + 히든을 체크(실제 손가락/마우스)
      for (const id of ['T1', 'HIDDEN']) { if (mode === 'pc') await bp.click('#bulkList input[data-id="' + id + '"]'); else await bp.tap('#bulkList input[data-id="' + id + '"]'); }
      await bp.waitForTimeout(250);
      const dlg = await bp.evaluate(() => {
        const rows = [...document.querySelectorAll('#bulkList .bulkrow')].map(r => r.textContent.replace(/\s+/g, ' ').trim());
        const o = document.getElementById('bulkOverlay'), r = o.getBoundingClientRect(), send = document.getElementById('btnBulkSend').getBoundingClientRect();
        const card = o.querySelector('.book__card').getBoundingClientRect();
        return { rows, summary: document.getElementById('bulkSummary').textContent.replace(/\s+/g, ' '), open: !o.hidden, sendH: Math.round(send.height), sendIn: send.bottom <= innerHeight + 1 && send.top >= 0, cardIn: card.right <= innerWidth + 1,
          sheet: document.body.getAttribute('data-sheet'), title: (window.RPD.MobileSheet.openSheets() || []).join('/') };
      });
      if (!dlg.open) bad(mode + ': 창이 안 열렸다');
      const cd = await bp.evaluate(() => getComputedStyle(document.getElementById('bulkConfirm')).display);
      if (cd !== 'none') bad(mode + ': 확인 칸이 처음부터 보인다(' + cd + ')');
      if (!dlg.rows.some(r => /흔함.*필드 5마리.*잠금 1마리 제외/.test(r))) bad(mode + ': 흔함 줄 ' + JSON.stringify(dlg.rows));
      if (dlg.rows.length !== 7) bad(mode + ': 칸 ' + dlg.rows.length + '개');
      if (!/2마리만 보냅니다/.test(dlg.summary)) bad(mode + ': 자리 부족 안내 ' + dlg.summary);
      if (mode === 'portrait' && (dlg.sendH < 44 || !dlg.sendIn)) bad(mode + ': [보내기] 크기/위치 ' + JSON.stringify(dlg));
      if (!dlg.cardIn) bad(mode + ': 창이 화면 밖으로 나간다');
      await bp.screenshot({ path: require('path').join(__dirname, '..', 'dist', '22_bulk_' + mode + '_a_dialog.png') });
      // 히든이 들어 있어 한 번 확인 — 먼저 확인 문구 · 그 뒤 실행
      if (mode === 'pc') await bp.click('#btnBulkSend'); else await bp.tap('#btnBulkSend');
      await bp.waitForTimeout(250);
      const conf = await bp.evaluate(() => ({ shown: !document.getElementById('bulkConfirm').hidden, display: getComputedStyle(document.getElementById('bulkConfirm')).display, text: document.getElementById('bulkConfirmText').textContent, stored: window.RPD.StorageManager.units.length }));
      if (!conf.shown || conf.stored !== 0 || conf.display === 'none') bad(mode + ': 히든 포함인데 확인 없이 갔다 ' + JSON.stringify(conf));
      await bp.screenshot({ path: require('path').join(__dirname, '..', 'dist', '22_bulk_' + mode + '_a2_confirm.png') });
      const before = await bp.evaluate(() => window.RPD.FieldManager.getAllUnits().length + window.RPD.StorageManager.units.length);
      if (mode === 'pc') await bp.click('#btnBulkYes'); else await bp.tap('#btnBulkYes');
      await bp.waitForTimeout(220);
      const after = await bp.evaluate(() => ({ total: window.RPD.FieldManager.getAllUnits().length + window.RPD.StorageManager.units.length, stored: window.RPD.StorageManager.units.map(u => u.def.name), msg: window.RPD.BulkStoreUI.lastMessage,
        bar: (document.getElementById('infoBar') || {}).textContent || '', open: !document.getElementById('bulkOverlay').hidden, undo: window.RPD.UndoManager.count() }));
      if (after.total !== before) bad(mode + ': 유닛 총수가 바뀌었다 ' + before + '→' + after.total);
      if (after.stored.length !== 2 || after.open) bad(mode + ': 결과 ' + JSON.stringify(after));
      if (!/흔함 · 히든 2마리를 창고로 보냈어요 \(\d마리는 창고가 가득 차 남음\)|흔함 2마리를 창고로 보냈어요 \(\d마리는 창고가 가득 차 남음\)/.test(after.msg || '')) bad(mode + ': 토스트 ' + after.msg);
      if (mode === 'portrait' && after.bar.indexOf('창고로 보냈어요') < 0) bad('portrait: 정보 바 토스트가 안 보인다 ' + after.bar.slice(0, 80));
      if (after.undo !== 1) bad(mode + ': 되돌리기 기록 ' + after.undo + '건');
      await bp.screenshot({ path: require('path').join(__dirname, '..', 'dist', '22_bulk_' + mode + '_b_toast.png') });
      bkReport[mode] = { dlg, conf, after };
      if (be.length) bad(mode + ' 페이지 오류: ' + be[0]);
      await bctx.close();
    }
  }
  console.log('bulk', JSON.stringify(bkReport));
  console.log('bulk problems', JSON.stringify(bkProblems));
  report.push({ bulk: bkReport });
  if (bkProblems.length) process.exitCode = 1;

  /* ㉓ 창고 고정 칸(세션 76) — 골드 확장 삭제 · 기본 36칸. 갤럭시 S24 세로 + PC: 보유 목록 머리의 "창고 n/36" 과 [확장] 버튼이 없는가.
   * 캡처: 23_storage_{portrait|pc}.png */
  const stProblems = [], stReport = {};
  {
    const bad = w => stProblems.push(w);
    for (const mode of ['portrait', 'pc']) {
      const sctx = await browser.newContext(mode === 'pc' ? { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } : { ...devices['Galaxy S24'], defaultBrowserType: undefined });
      const sp = await sctx.newPage();
      const se = [];
      sp.on('pageerror', e => se.push(e.message));
      await sp.goto(URL); await sp.waitForTimeout(1000);
      await sp.evaluate(tbPrep, { wave: 7 });
      await sp.waitForTimeout(400);
      await sp.evaluate(() => {
        const R = window.RPD, SM = R.StorageManager;
        R.Loop.setPaused(true);
        const ids = R.PokemonData.list.filter(d => d.summon).slice(0, 22).map(d => d.id);
        SM.reset();
        ids.forEach(id => SM.add(R.UnitManager.create(id)));
        R.bus.emit('storage:changed', SM.units); R.bus.emit('field:changed', {});
        if (window.innerWidth < 1100) R.HudPanels.setDrawer('owned');
      });
      await sp.waitForTimeout(500);
      const st = await sp.evaluate(() => ({ badge: document.getElementById('storageBadge').textContent, expandBtn: !!document.getElementById('btnExpandStorage'),
        text: document.querySelector('.pane--owned .pane__head').textContent.replace(/\s+/g, ' ').trim(), cells: document.querySelectorAll('#storageList .scell').length,
        cfg: window.RPD.Config.storageBase, cap: window.RPD.StorageManager.capacity }));
      if (st.badge !== '22/36') bad(mode + ': 창고 표시 ' + st.badge);
      if (st.expandBtn || /확장/.test(st.text)) bad(mode + ': [확장] 이 남아 있다 ' + st.text);
      if (st.cap !== 36 || st.cfg !== 36) bad(mode + ': 용량 ' + st.cap + '/' + st.cfg);
      await sp.screenshot({ path: require('path').join(__dirname, '..', 'dist', '23_storage_' + mode + '.png') });
      stReport[mode] = st;
      if (se.length) bad(mode + ' 페이지 오류: ' + se[0]);
      await sctx.close();
    }
  }
  console.log('storage', JSON.stringify(stReport));
  console.log('storage problems', JSON.stringify(stProblems));
  report.push({ storage: stReport });
  if (stProblems.length) process.exitCode = 1;

  /* ㉔ 시너지 — 서로 다른 종 기준(세션 77). 구구 2마리를 둔 필드의 시너지 패널(세로 시트 · PC): "비행 1/2" · "구구 ×2는 1종으로".
   * 캡처: 24_synergy_{portrait|pc}_a_dup(구구 ×2) · _b_two(구구 + 피죤 — 비행 켜짐). 어긋나면 도구가 실패로 끝난다. */
  const syProblems = [], syReport = {};
  {
    const bad = w => syProblems.push(w);
    for (const mode of ['portrait', 'pc']) {
      const yctx = await browser.newContext(mode === 'pc' ? { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } : { ...devices['Galaxy S24'], defaultBrowserType: undefined });
      const yp = await yctx.newPage();
      const ye = [];
      yp.on('pageerror', e => ye.push(e.message));
      await yp.goto(URL); await yp.waitForTimeout(1000);
      await yp.evaluate(tbPrep, { wave: 7 });
      await yp.waitForTimeout(400);
      const put = ids => yp.evaluate(ids => {
        const R = window.RPD, F = R.FieldManager;
        F.slots.forEach(x => { if (x.unit) F.remove(x.index); });
        ids.forEach(id => { const sl = F.slots.find(x => x.unlocked && !x.blocked && !x.unit); F.place(sl.index, R.UnitManager.create(id)); });
        R.UnitManager.recomputeAll(); R.bus.emit('field:changed', {});
        R.Loop.setPaused(true);
      }, ids);
      const probe = () => yp.evaluate(() => {
        const row = document.querySelector('#synergyBody .synrow[data-type="FLYING"]');
        return { text: row ? row.textContent.replace(/\s+/g, ' ').trim() : '', active: !!row && row.classList.contains('is-active'),
          cut: row ? [...row.querySelectorAll('.synrow__effect, .synrow__dup, .synrow__name')].some(n => n.scrollWidth > n.clientWidth + 1) : null,
          rowW: row ? Math.round(row.getBoundingClientRect().width) : 0 };
      });
      await put(['pidgey', 'pidgey']);
      if (mode === 'portrait') { await yp.evaluate(() => window.RPD.HudPanels.setDrawer('synergy')); await yp.waitForTimeout(450); }
      await yp.waitForTimeout(250);
      const a = await probe();
      if (!/비행\s*1\/2/.test(a.text) || a.text.indexOf('구구 ×2는 1종으로') < 0 || a.active) bad(mode + ': 구구 ×2 줄 ' + JSON.stringify(a));
      if (a.cut) bad(mode + ': 시너지 줄 글이 잘린다 ' + JSON.stringify(a));
      await yp.evaluate(() => { const r = document.querySelector('#synergyBody .synrow[data-type="FLYING"]'); if (r && r.scrollIntoView) r.scrollIntoView({ block: 'center' }); });
      await yp.waitForTimeout(150);
      await yp.screenshot({ path: require('path').join(__dirname, '..', 'dist', '24_synergy_' + mode + '_a_dup.png') });
      await put(['pidgey', 'pidgey', 'pidgeotto']);
      await yp.waitForTimeout(250);
      const b = await probe();
      if (!/비행\s*2/.test(b.text) || !b.active) bad(mode + ': 구구 + 피죤 줄 ' + JSON.stringify(b));
      await yp.screenshot({ path: require('path').join(__dirname, '..', 'dist', '24_synergy_' + mode + '_b_two.png') });
      syReport[mode] = { a, b };
      if (ye.length) bad(mode + ' 페이지 오류: ' + ye[0]);
      await yctx.close();
    }
  }
  console.log('synergy', JSON.stringify(syReport));
  console.log('synergy problems', JSON.stringify(syProblems));
  report.push({ synergy: syReport });
  if (syProblems.length) process.exitCode = 1;

  /* ㉕ 전설 추천(세션 78) — 세로(갤럭시 S24) (a) 재료가 일부 있는 보드의 추천 3개 (b) "지금 바로 조합 가능" (d) 미발견 히든 제외 안내 · PC (c).
   * (a)(b)(c) 는 주문을 모두 밝힌 기록(히든 재료도 추천에 나온다) · (d) 는 아무것도 안 밝힌 기록. 어긋나면 도구가 실패로 끝난다.
   * 캡처: 25_legend_portrait_a_partial · _b_ready · _d_hidden · 25_legend_pc_c */
  const lgProblems = [], lgReport = {};
  const lgSetup = (o) => {
    const R = window.RPD, F = R.FieldManager, SM = R.StorageManager;
    R.Loop.setPaused(true);
    R.GameManager.setWave(22);
    F.slots.forEach(x => { if (x.unit) F.remove(x.index); });
    SM.reset();
    R.SaveManager.data.spells = {};
    if (o.knowAll) R.SpellData.list.forEach(sp => { R.SaveManager.data.spells[sp.id] = 1; });
    R.ShardManager.shards = o.shards || 0;
    const put = id => { const sl = F.slots.find(x => x.unlocked && !x.blocked && !x.unit); const u = R.UnitManager.create(id); if (sl) F.place(sl.index, u); else SM.add(u); };
    o.field.forEach(put);
    (o.store || []).forEach(id => SM.add(R.UnitManager.create(id)));
    R.UnitManager.recomputeAll(); R.RecipeManager.refresh(); R.LegendAdvisor.invalidate();
    R.bus.emit('field:changed', {}); R.bus.emit('storage:changed', SM.units); R.bus.emit('shard:changed', R.ShardManager.shards);
  };
  const lgProbe = (pg) => pg.evaluate(() => {
    const cards = [...document.querySelectorAll('#legendList .lgcard')].map(c => ({ id: c.dataset.legend, text: c.textContent.replace(/\s+/g, ' ').trim(),
      chips: [...c.querySelectorAll('.lgchip')].map(x => x.className.replace('lgchip ', '')), w: Math.round(c.getBoundingClientRect().width), overflow: c.scrollWidth > c.clientWidth + 1 }));
    const o = document.getElementById('legendOverlay');
    return { open: !o.hidden, cards, note: document.getElementById('legendNote').textContent, ms: window.RPD.LegendAdvisor.lastMs,
      pageOverflow: document.documentElement.scrollWidth > window.innerWidth + 1 };
  });
  {
    const bad = w => lgProblems.push(w);
    for (const mode of ['portrait', 'pc']) {
      const lctx2 = await browser.newContext(mode === 'pc' ? { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } : { ...devices['Galaxy S24'], defaultBrowserType: undefined });
      const lp2 = await lctx2.newPage();
      const le2 = [];
      lp2.on('pageerror', e => le2.push(e.message));
      await lp2.goto(URL); await lp2.waitForTimeout(1000);
      await lp2.evaluate(tbPrep, { wave: 7 });
      await lp2.waitForTimeout(400);
      const shot = n => lp2.screenshot({ path: require('path').join(__dirname, '..', 'dist', '25_legend_' + n + '.png') });
      const openPanel = async () => {
        if (mode === 'portrait') { await lp2.evaluate(() => window.RPD.HudPanels.setDrawer('recipes')); await lp2.waitForTimeout(350); await lp2.tap('#btnLegend'); }
        else await lp2.click('#btnLegend');
        await lp2.waitForTimeout(500);
      };
      // (a)/(c) 재료가 일부 — 리자몽 재료 2/3 · 윈디 재료 1/3 · 조각 30
      await lp2.evaluate(lgSetup, { knowAll: true, shards: 30, field: ['charmeleon', 'rapidash', 'growlithe', 'pidgey', 'pidgey'], store: ['weedle', 'caterpie'] });
      await openPanel();
      const a = await lgProbe(lp2);
      if (!a.open || a.cards.length !== 3) bad(mode + ': 추천 3개가 아니다 ' + JSON.stringify(a.cards.map(c => c.id)));
      if (!a.cards.some(c => /예상 추가 소환 약 \d+회/.test(c.text))) bad(mode + ': "예상 추가 소환 약 N회" 없음 ' + JSON.stringify(a.cards.map(c => c.text)));
      if (a.cards.some(c => /조합 0번/.test(c.text))) bad(mode + ': "조합 0번" 같은 말이 나온다');
      if (!a.cards.some(c => c.chips.includes('is-have')) || !a.cards.some(c => c.chips.includes('is-miss'))) bad(mode + ': 칩 색(있음 · 모자람)이 다 안 보인다');
      if (a.cards.some(c => c.overflow) || a.pageOverflow) bad(mode + ': 카드가 넘친다');
      if (a.ms > 5000) bad(mode + ': 계산 ' + a.ms + 'ms');
      await shot(mode === 'pc' ? 'pc_c' : 'portrait_a_partial');
      // 칩을 누르면 그 재료의 조합식 창
      if (mode === 'portrait') await lp2.tap('#legendList .lgchip.is-miss'); else await lp2.click('#legendList .lgchip.is-miss');
      await lp2.waitForTimeout(400);
      const pop = await lp2.evaluate(() => ({ open: !document.getElementById('recipePop').hidden, legend: !document.getElementById('legendOverlay').hidden, def: document.getElementById('recipePop').dataset.def }));
      if (!pop.open) bad(mode + ': 재료 칩을 눌렀는데 조합식 창이 안 열린다 ' + JSON.stringify(pop));
      if (mode === 'portrait') {
        await shot('portrait_a2_chip_recipe');
        // (b) 지금 바로 조합 가능
        await lp2.evaluate(() => { document.getElementById('recipePop').hidden = true; });
        await lp2.evaluate(lgSetup, { knowAll: true, shards: 0, field: ['vulpix', 'rapidash', 'magmar', 'charmeleon'] });
        await lp2.evaluate(() => { if (document.body.getAttribute('data-mtab') === 'recipes') window.RPD.HudPanels.setDrawer('recipes'); });
        await openPanel();
        const b = await lgProbe(lp2);
        if (!b.cards[0] || b.cards[0].id !== 'ninetales' || b.cards[0].text.indexOf('지금 바로 조합 가능') < 0) bad('portrait: 지금 바로 1위가 아니다 ' + JSON.stringify(b.cards[0]));
        await shot('portrait_b_ready');
        // (d) 미발견 히든 제외
        await lp2.evaluate(() => { window.RPD.LegendAdvisorUI.hide(); if (document.body.getAttribute('data-mtab') === 'recipes') window.RPD.HudPanels.setDrawer('recipes'); });
        await lp2.evaluate(lgSetup, { knowAll: false, shards: 0, field: ['charmeleon', 'rapidash', 'growlithe'] });
        await openPanel();
        const d = await lgProbe(lp2);
        const names = await lp2.evaluate(() => window.RPD.PokemonData.list.filter(x => x.hidden).map(x => x.name));
        const html = await lp2.evaluate(() => document.getElementById('legendOverlay').innerHTML);
        if (!/숨은 재료가 필요한 전설 \d+종은 제외/.test(d.note)) bad('portrait: 제외 안내 없음 ' + d.note);
        const leak = names.filter(n => html.indexOf(n) >= 0);
        if (leak.length) bad('portrait: 숨은 이름이 보인다 ' + leak.join(','));
        await shot('portrait_d_hidden');
        lgReport.portrait = { a: a.cards.map(c => c.text.slice(0, 60)), b: b.cards.map(c => c.id), d: { cards: d.cards.map(c => c.id), note: d.note }, ms: a.ms };
      } else lgReport.pc = { a: a.cards.map(c => c.text.slice(0, 60)), ms: a.ms };
      if (le2.length) bad(mode + ' 페이지 오류: ' + le2[0]);
      await lctx2.close();
    }
  }
  console.log('legend', JSON.stringify(lgReport));
  console.log('legend problems', JSON.stringify(lgProblems));
  report.push({ legend: lgReport });
  if (lgProblems.length) process.exitCode = 1;

  /* ㉖ 보유 창 [타입별] 머리 — 서로 다른 종 기준(세션 80). 구구 ×2 + 꼬렛 ×2 를 필드에 둔 보기: "필드 1종 · 1/2종 → … · 구구 ×2는 1종으로".
   * 캡처: 26_bytype_{portrait|pc}.png. 어긋나면 도구가 실패로 끝난다. */
  const btProblems = [], btReport = {};
  {
    const bad = w => btProblems.push(w);
    for (const mode of ['portrait', 'pc']) {
      const bctx2 = await browser.newContext(mode === 'pc' ? { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } : { ...devices['Galaxy S24'], defaultBrowserType: undefined });
      const bp2 = await bctx2.newPage();
      const be2 = [];
      bp2.on('pageerror', e => be2.push(e.message));
      await bp2.goto(URL); await bp2.waitForTimeout(1000);
      await bp2.evaluate(tbPrep, { wave: 7 });
      await bp2.waitForTimeout(400);
      await bp2.evaluate(() => {
        const R = window.RPD, F = R.FieldManager;
        R.Loop.setPaused(true);
        F.slots.forEach(x => { if (x.unit) F.remove(x.index); });
        R.StorageManager.reset();
        ['pidgey', 'pidgey', 'rattata', 'rattata', 'pikachu'].forEach(id => { const sl = F.slots.find(x => x.unlocked && !x.blocked && !x.unit); F.place(sl.index, R.UnitManager.create(id)); });
        R.StorageManager.add(R.UnitManager.create('pidgeotto'));
        R.UnitManager.recomputeAll(); R.bus.emit('field:changed', {}); R.bus.emit('storage:changed', R.StorageManager.units);
        if (window.innerWidth < 1100) R.HudPanels.setDrawer('owned');
      });
      await bp2.waitForTimeout(400);
      if (mode === 'portrait') await bp2.tap('#ownedSort [data-sort="type"]'); else await bp2.click('#ownedSort [data-sort="type"]');
      await bp2.waitForTimeout(400);
      const r = await bp2.evaluate(() => {
        const heads = [...document.querySelectorAll('#storageList .typegroup__head')].map(h => h.textContent.replace(/\s+/g, ' ').trim());
        const fl = heads.find(h => h.indexOf('비행') === 0) || '';
        const bad = [...document.querySelectorAll('#storageList .typegroup__head')].some(h => h.scrollWidth > h.clientWidth + 1);
        return { fl, heads: heads.slice(0, 4), cut: bad, syn: window.RPD.SynergyManager.countOf('FLYING'), pageOverflow: document.documentElement.scrollWidth > window.innerWidth + 1 };
      });
      if (!/필드 1종/.test(r.fl) || !/1\/2종/.test(r.fl) || r.fl.indexOf('구구 ×2는 1종으로') < 0) bad(mode + ': 비행 머리 ' + r.fl);
      if (r.syn !== 1) bad(mode + ': 실제 시너지 비행 ' + r.syn);
      if (r.cut || r.pageOverflow) bad(mode + ': 머리가 잘리거나 넘친다');
      await bp2.screenshot({ path: require('path').join(__dirname, '..', 'dist', '26_bytype_' + mode + '.png') });
      btReport[mode] = r;
      if (be2.length) bad(mode + ' 페이지 오류: ' + be2[0]);
      await bctx2.close();
    }
  }
  console.log('bytype', JSON.stringify(btReport));
  console.log('bytype problems', JSON.stringify(btProblems));
  report.push({ bytype: btReport });
  if (btProblems.length) process.exitCode = 1;

  /* ㉙ 리디자인 ①(세션 85) 등급 프레임 · 잠긴 칸 — tools/tiershots.js(단독으로도 돈다). 29_tier_* */
  {
    const tr = await require('./tiershots.js').run(browser);
    console.log('tier', JSON.stringify(tr.report));
    console.log('tier problems', JSON.stringify(tr.problems));
    report.push({ tier: tr.report });
    if (tr.problems.length) process.exitCode = 1;
  }

  /* ㉚ 리디자인 ②(세션 86) 보스 등장 · 처치 연출 — tools/bossshots.js(단독으로도 돈다). 30_boss_* */
  {
    const br = await require('./bossshots.js').run(browser);
    console.log('boss', JSON.stringify(br.report));
    console.log('boss problems', JSON.stringify(br.problems));
    report.push({ boss: br.report });
    if (br.problems.length) process.exitCode = 1;
  }

  /* ㉛ 리디자인 ③(세션 87) 조합 성공 · 소환 템포 — tools/craftshots.js(단독으로도 돈다). 31_craft_* */
  {
    const cr = await require('./craftshots.js').run(browser);
    console.log('craft', JSON.stringify(cr.report));
    console.log('craft problems', JSON.stringify(cr.problems));
    report.push({ craft: cr.report });
    if (cr.problems.length) process.exitCode = 1;
  }

  /* ㉜ 리디자인 ④(세션 88) 시너지 패널 — tools/synshots.js(단독으로도 돈다). 32_syn_* */
  {
    const sy = await require('./synshots.js').run(browser);
    console.log('syn', JSON.stringify(sy.report));
    console.log('syn problems', JSON.stringify(sy.problems));
    report.push({ syn: sy.report });
    if (sy.problems.length) process.exitCode = 1;
  }

  /* ㉝ 리디자인 ⑤(세션 89) 조합식 줄 — tools/recipeshots.js(단독으로도 돈다). 33_recipe_* */
  {
    const rc = await require('./recipeshots.js').run(browser);
    console.log('recipe', JSON.stringify(rc.report));
    console.log('recipe problems', JSON.stringify(rc.problems));
    report.push({ recipe: rc.report });
    if (rc.problems.length) process.exitCode = 1;
  }

  /* ㉘ 응원 칸(세션 82) — tools/cheershots.js(단독으로도 돈다). (b) 빈 응원 칸 (c) 2마리 + 요약 줄 (d) 응원 칸 카드 (e) 받는 버프 (f) 거절 알림 (g) 2라운드 */
  {
    const ch = await require('./cheershots.js').run(browser);
    console.log('cheer', JSON.stringify(ch.report));
    console.log('cheer problems', JSON.stringify(ch.problems));
    report.push({ cheer: ch.report });
    if (ch.problems.length) process.exitCode = 1;
  }

  /* ---------- 홈 화면 앱(세션 53 · 모바일 ④ 세션 71) ----------
   * 설치 · 오프라인은 인터넷 주소에서만 되니, 원본 폴더(dist 아님)를 이 자리에서 작은 웹 서버로 띄워 연다(localhost 는 https 와 같게 친다).
   * 확인: 크롬이 "설치할 수 있다"고 보는가(설치 불가 사유 0) · 서비스 워커 · 오프라인 저장 · 인터넷을 끊고 다시 열어도 켜지고 처음 보는 그림이 나오는가 ·
   *       ☰ [전체 화면] · [앱 설치] · 노치 화면 여백 · 앱으로 실행 중이면 두 버튼이 숨는가. */
  const http = require('http'), pathM = require('path'), ROOT = pathM.join(__dirname, '..');
  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.mp3': 'audio/mpeg' };
  const srv = { bump: 0 };   // 새 버전 흉내 — pwa-precache.js 끝에 한 줄을 붙여 새 서비스 워커를 만든다
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
    const file = pathM.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[pathM.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    if (rel === 'pwa-precache.js' && srv.bump) { res.end(fs.readFileSync(file, 'utf8') + '\n// bump ' + srv.bump + '\n'); return; }
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const APP = `http://localhost:${server.address().port}/`;
  const app = { url: APP.replace(/:\d+\//, ':PORT/') };
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
  // 어느 요청이 서비스 워커를 거쳤나 — 코드 · 그림은 거치고, 음악(assets/music)은 안 거친다
  const viaSW = {};
  const onResp = r => { const u = r.url(); if (/\/js\/main\.js|\/assets\/icons\/icon-192\.png|\/assets\/music\//.test(u)) viaSW[u.replace(/^.*\/\/[^/]+\//, '')] = r.fromServiceWorker(); };
  ap.on('response', onResp);
  const musicFile = fs.readdirSync(pathM.join(ROOT, 'assets/music')).find(f => f.endsWith('.mp3'));
  await ap.evaluate(async (m) => { await fetch('js/main.js'); await fetch('assets/icons/icon-192.png'); if (m) await fetch('assets/music/' + m, { headers: { Range: 'bytes=0-99' } }); }, musicFile || null);
  await ap.waitForTimeout(300);
  ap.off('response', onResp);
  app.viaServiceWorker = viaSW;
  app.caches = await ap.evaluate(async () => (await caches.keys()).sort());

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
  await ap.tap('#tbMore'); await ap.waitForTimeout(300);
  app.menuButtons = await ap.evaluate(() => ['btnFullscreen', 'btnInstall', 'btnWake', 'btnRecords'].map(id => {
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
  // 설치 창을 한 번 쓴 뒤(또는 크롬이 창을 안 줄 때)는 안내 시트
  await ap.tap('#tbMore'); await ap.waitForTimeout(200);
  await ap.tap('#btnInstall'); await ap.waitForTimeout(300);
  app.installSheet = await ap.evaluate(() => ({ shown: !document.getElementById('installSheet').hidden, steps: document.getElementById('installSteps').innerText.replace(/\s+/g, ' ') }));
  await ap.tap('#btnInstallClose'); await ap.waitForTimeout(150);
  // 기록 옮기기 창
  await ap.tap('#tbMore'); await ap.waitForTimeout(200);
  await ap.tap('#btnRecords'); await ap.waitForTimeout(300);
  app.records = await ap.evaluate(() => ({ shown: !document.getElementById('recordSheet').hidden, exportLen: document.getElementById('recordExport').value.length, summary: document.getElementById('recordSummary').textContent }));
  await ap.screenshot({ path: pathM.join(ROOT, 'dist', 'm_app_records.png') });
  await ap.tap('#btnRecordClose'); await ap.waitForTimeout(150);
  await ap.tap('#tbMore'); await ap.waitForTimeout(200);
  await ap.tap('#btnFullscreen'); await ap.waitForTimeout(500);
  app.fullscreen = await ap.evaluate(() => ({ on: !!document.fullscreenElement, title: document.getElementById('btnFullscreen').title }));
  if (app.fullscreen.on) await ap.evaluate(() => document.exitFullscreen());

  // 인터넷을 끊고 다시 열기 — 켜지는가 · 처음 보는 포켓몬 그림이 저장소에서 나오는가
  await actx.setOffline(true);
  await ap.reload(); await ap.waitForTimeout(1500);
  await prepAppPage(ap);
  await ap.waitForTimeout(2600);
  app.offline = await ap.evaluate(() => {
    const R = window.RPD, units = R.FieldManager.getAllUnits();
    return { booted: !!(R.Game && R.GameManager.state), online: navigator.onLine,
      styled: getComputedStyle(document.querySelector('.hud')).display !== 'block',
      sprites: units.filter(u => R.Assets.isReady(u.def.sprite)).length + '/' + units.length };
  });
  await ap.screenshot({ path: pathM.join(ROOT, 'dist', 'm_app_offline.png') });
  await actx.setOffline(false);

  // 새 버전 — 서버의 프리캐시 목록이 바뀌면 새 서비스 워커가 기다린다. 페이지는 토스트만 띄우고 스스로 새로고침하지 않는다
  await ap.reload(); await ap.waitForTimeout(1500);
  await ap.evaluate(() => { window.__sameDoc = 1; document.querySelectorAll('.modepick, .result, .help, .book').forEach(o => o.hidden = true); });
  srv.bump = 1;
  await ap.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r && r.update()));
  let upd = null;
  for (let k = 0; k < 40 && !(upd && upd.toast); k++) {
    await ap.waitForTimeout(250);
    upd = await ap.evaluate(() => ({ toast: !document.getElementById('updateToast').hidden, sameDoc: window.__sameDoc === 1,
      waiting: !!(window.RPD.Pwa.reg && window.RPD.Pwa.reg.waiting), menu: !document.getElementById('btnUpdate').hidden }));
  }
  await ap.waitForTimeout(1500);
  upd.stillSameDoc = await ap.evaluate(() => window.__sameDoc === 1);   // 기다려도 저절로 새로고침하지 않는다
  await ap.screenshot({ path: pathM.join(ROOT, 'dist', 'm_app_update_toast.png') });
  const nav = ap.waitForNavigation({ timeout: 8000 }).then(() => true, () => false);
  await ap.tap('#btnUpdateNow');
  upd.reloadedOnTap = await nav;
  await ap.waitForTimeout(800);
  upd.afterTap = await ap.evaluate(() => ({ sameDoc: window.__sameDoc === 1, waiting: !!(window.RPD.Pwa.reg && window.RPD.Pwa.reg.waiting) }));
  app.update = upd;
  srv.bump = 0;

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

  // 아이폰 사파리 — 설치 API 가 없어 [앱으로 설치] 는 안내 시트("공유(□↑) → 홈 화면에 추가")
  const ictx = await browser.newContext({ ...devices['iPhone 15'], defaultBrowserType: undefined });
  const ip = await ictx.newPage();
  await ip.goto(APP); await ip.waitForTimeout(1200);
  await prepAppPage(ip); await ip.waitForTimeout(600);
  await ip.evaluate(() => window.RPD.Loop.setPaused(true));
  await ip.tap('#tbMore'); await ip.waitForTimeout(300);
  await ip.screenshot({ path: pathM.join(ROOT, 'dist', 'm_app_menu_iphone.png') });
  await ip.tap('#btnInstall'); await ip.waitForTimeout(300);
  app.iosSheet = await ip.evaluate(() => ({ shown: !document.getElementById('installSheet').hidden, steps: document.getElementById('installSteps').innerText.replace(/\s+/g, ' ') }));
  await ip.screenshot({ path: pathM.join(ROOT, 'dist', 'm_app_install_ios_sheet.png') });
  await ictx.close();

  // 한 파일 테스트판(file://) — 서비스 워커를 등록하려 하지도 않고 오류도 없다
  const tctx3 = await browser.newContext({ ...devices['Galaxy S24'], defaultBrowserType: undefined });
  const tp3 = await tctx3.newPage();
  const terr3 = []; tp3.on('pageerror', e => terr3.push(e.message)); tp3.on('console', m => { if (m.type() === 'error') terr3.push(m.text()); });
  await tp3.goto(URL); await tp3.waitForTimeout(1200);
  // file:// 에서는 getRegistration 자체가 막힌다(SecurityError) — 막혔으면 등록도 없는 것
  app.tester = await tp3.evaluate(() => (navigator.serviceWorker ? navigator.serviceWorker.getRegistration().then(r => !!r, () => false) : Promise.resolve(false))
    .then(reg => ({ reg, status: window.RPD.Pwa.status })));
  app.tester.errors = terr3.slice(0, 2);
  await tctx3.close();
  server.close();

  // 이 장면의 검사 — 어긋나면 도구가 실패로 끝난다
  const appProblems = [];
  const bad4 = w => appProblems.push(w);
  if (app.installErrors.length) bad4('크롬 설치 불가 사유: ' + app.installErrors.join(','));
  if (!app.controlled) bad4('서비스 워커가 페이지를 안 잡았다');
  if (app.saved.status !== 'ready' || app.saved.saved !== app.saved.total) bad4('미리 받기 ' + JSON.stringify(app.saved));
  if (!app.offline.booted || app.offline.online !== false) bad4('오프라인 새로고침에 게임이 안 뜸 ' + JSON.stringify(app.offline));
  const vs = app.viaServiceWorker, musicKey = Object.keys(vs).find(k => /assets\/music/.test(k));
  if (vs['js/main.js'] !== true || vs['assets/icons/icon-192.png'] !== true) bad4('코드 · 그림이 서비스 워커를 안 거침 ' + JSON.stringify(vs));
  if (musicKey && vs[musicKey] !== false) bad4('음악이 서비스 워커를 거쳤다 ' + musicKey);
  if (!app.update || !app.update.toast || !app.update.stillSameDoc || !app.update.menu || !app.update.reloadedOnTap) bad4('새 버전 흐름 ' + JSON.stringify(app.update));
  if (!app.iosSheet.shown || !/공유/.test(app.iosSheet.steps) || !/홈 화면에 추가/.test(app.iosSheet.steps)) bad4('아이폰 안내 시트 ' + JSON.stringify(app.iosSheet));
  if (!app.records.shown || !(app.records.exportLen > 50)) bad4('기록 옮기기 창 ' + JSON.stringify(app.records));
  if (app.tester.reg || app.tester.status !== 'off' || app.tester.errors.length) bad4('테스트판이 서비스 워커를 건드렸다 ' + JSON.stringify(app.tester));
  if (app.errors.length) bad4('페이지 오류 ' + app.errors[0]);
  app.problems = appProblems;
  console.log('app problems', JSON.stringify(appProblems));
  if (appProblems.length) process.exitCode = 1;
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
