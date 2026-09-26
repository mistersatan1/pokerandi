/* icons.js — 홈 화면 앱 아이콘(모바일 ③ · 세션 53)을 만든다.
 *
 *   node tools/icons.js   → assets/icons/*.png
 *
 * 실제 크로미움 캔버스로 그린다(몬스터볼 + 피카츄 도트 그림). 그림을 바꾸고 싶으면 draw() 만 고치고 다시 돌린다.
 *   icon-192 · icon-512       : 안드로이드 · PC 설치용. 모서리를 둥글게 깎은 그림
 *   icon-maskable-512         : 안드로이드가 원 · 물방울 등으로 잘라 쓰는 그림 — 가운데 80% 원 안에 내용
 *   apple-touch-icon (180)    : 아이폰 홈 화면. 투명 없이 꽉 채운다(모서리는 iOS 가 깎는다)
 *   icon-32                   : 브라우저 탭
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
const OUT = path.join(ROOT, 'assets', 'icons');
const SPRITE = 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, 'assets/pokemon/pikachu.png')).toString('base64');

const ICONS = [
  { file: 'icon-32.png', size: 32, kind: 'round' },
  { file: 'icon-192.png', size: 192, kind: 'round' },
  { file: 'icon-512.png', size: 512, kind: 'round' },
  { file: 'icon-maskable-512.png', size: 512, kind: 'maskable' },
  { file: 'apple-touch-icon.png', size: 180, kind: 'full' }
];

/* 페이지 안에서 돈다. kind: round(둥근 모서리 · 바깥 투명) · full(꽉 채움) · maskable(꽉 채움 + 내용을 80% 안으로) */
function draw({ size, kind, sprite }) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const g = c.getContext('2d');
      const S = size / 512;                 // 512 기준으로 그린다
      g.scale(S, S);

      // 바탕 — 게임 배경(--bg #07122b → --panel #0f2248) + 가운데 금빛
      g.save();
      if (kind === 'round') {
        const r = 112;
        g.beginPath();
        g.moveTo(r, 0); g.arcTo(512, 0, 512, 512, r); g.arcTo(512, 512, 0, 512, r);
        g.arcTo(0, 512, 0, 0, r); g.arcTo(0, 0, 512, 0, r); g.closePath(); g.clip();
      }
      const bg = g.createLinearGradient(0, 0, 0, 512);
      bg.addColorStop(0, '#1a386f'); bg.addColorStop(1, '#07122b');
      g.fillStyle = bg; g.fillRect(0, 0, 512, 512);
      const glow = g.createRadialGradient(256, 250, 10, 256, 250, 250);
      glow.addColorStop(0, 'rgba(255, 201, 60, 0.45)'); glow.addColorStop(1, 'rgba(255, 201, 60, 0)');
      g.fillStyle = glow; g.fillRect(0, 0, 512, 512);

      // 내용은 maskable 이면 가운데 80% 원 안으로(안드로이드가 잘라 낸다)
      const k = kind === 'maskable' ? 0.78 : 1;
      g.translate(256, 256); g.scale(k, k); g.translate(-256, -256);

      // 몬스터볼 — 게임 HUD 의 .ball 과 같은 색
      const cx = 256, cy = 300, R = 150;
      g.lineWidth = 16; g.strokeStyle = '#1b2438';
      g.beginPath(); g.arc(cx, cy, R, Math.PI, 0); g.closePath(); g.fillStyle = '#ff4b4b'; g.fill();
      g.beginPath(); g.arc(cx, cy, R, 0, Math.PI); g.closePath(); g.fillStyle = '#f4f6fb'; g.fill();
      g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#1b2438'; g.fillRect(cx - R, cy - 12, R * 2, 24);
      g.beginPath(); g.arc(cx, cy, 46, 0, Math.PI * 2); g.fillStyle = '#1b2438'; g.fill();
      g.beginPath(); g.arc(cx, cy, 30, 0, Math.PI * 2); g.fillStyle = '#f4f6fb'; g.fill();

      // 피카츄 — 도트 그림이라 뭉개지지 않게 키운다. 볼 위에 올라탄 자리
      g.imageSmoothingEnabled = false;
      g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = 18; g.shadowOffsetY = 8;
      const w = size <= 32 ? 300 : 288;     // 탭 아이콘(32px)은 그림이 주인공
      g.drawImage(img, 256 - w / 2, 30, w, w);
      g.restore();
      resolve(c.toDataURL('image/png'));
    };
    img.src = sprite;
  });
}

(async () => {
  const browser = await playwright.chromium.launch({ executablePath, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  fs.mkdirSync(OUT, { recursive: true });
  for (const icon of ICONS) {
    const url = await page.evaluate(draw, { size: icon.size, kind: icon.kind, sprite: SPRITE });
    fs.writeFileSync(path.join(OUT, icon.file), Buffer.from(url.split(',')[1], 'base64'));
    console.log(icon.file, icon.size + 'px');
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
