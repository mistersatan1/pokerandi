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
  console.log('errors', errors.slice(0, 5));
  await browser.close();
})();
