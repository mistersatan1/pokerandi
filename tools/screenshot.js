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
  require('fs').writeFileSync(require('path').join(__dirname, '..', 'dist', 'mobile_report.json'), JSON.stringify(report, null, 2));

  await browser.close();
})();
