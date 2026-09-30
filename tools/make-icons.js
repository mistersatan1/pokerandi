/* make-icons.js — 홈 화면 앱 아이콘을 만든다(모바일 ④ · 세션 71 — 세션 53 의 tools/icons.js 를 바꿨다).
 *
 *   npm run icons   (= node tools/make-icons.js)   → assets/icons/*.png   (결과 PNG 는 커밋한다 — GitHub Pages 는 빌드 없이 그대로 서비스)
 *
 * 그림은 게임 HUD 왼쪽 위 몬스터볼 마크(css/ui.css 의 .ball — 위 빨강 · 가운데 띠 · 아래 흰색 · 가운데 단추)를 SVG 로 그려 sharp 로 굽는다.
 *   icon-192 · icon-512    : purpose "any" — 둥근 사각 남색 판 위에 공(바깥은 투명)
 *   icon-maskable-512      : purpose "maskable" — 남색이 꽉 차고 공은 가운데 안전 영역(지름 80% 원) 안
 *   apple-touch-icon (180) : 아이폰 — 투명 없이 꽉 채움(모서리는 iOS 가 깎는다)
 *   icon-32                : 브라우저 탭
 */
'use strict';
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const OUT = path.join(__dirname, '..', 'assets', 'icons');
const BG = '#07122b';
const RED = '#ff4b4b', BAND = '#1b2438', WHITE = '#f4f6fb';

/* 공 하나 — 중심 (c,c) 반지름 r. .ball 과 같은 비율: 띠 46~54% · 단추 지름 34% · 테두리 */
function ball(c, r) {
  const d = r * 2, top = c - r;
  const bandTop = top + d * 0.46, bandBot = top + d * 0.54;
  const stroke = Math.max(2, r * 0.09), btn = r * 0.34, btnStroke = Math.max(2, r * 0.1);
  return `
    <defs><clipPath id="b"><circle cx="${c}" cy="${c}" r="${r}"/></clipPath></defs>
    <g clip-path="url(#b)">
      <rect x="${c - r}" y="${top}" width="${d}" height="${d}" fill="${WHITE}"/>
      <rect x="${c - r}" y="${top}" width="${d}" height="${bandTop - top}" fill="${RED}"/>
      <rect x="${c - r}" y="${bandTop}" width="${d}" height="${bandBot - bandTop}" fill="${BAND}"/>
      <rect x="${c - r}" y="${c + r * 0.62}" width="${d}" height="${r}" fill="rgba(0,0,0,.12)"/>
      <ellipse cx="${c - r * 0.38}" cy="${top + r * 0.42}" rx="${r * 0.2}" ry="${r * 0.12}" fill="rgba(255,255,255,.35)"/>
    </g>
    <circle cx="${c}" cy="${c}" r="${r - stroke / 2}" fill="none" stroke="${BAND}" stroke-width="${stroke}"/>
    <circle cx="${c}" cy="${c}" r="${btn}" fill="${WHITE}" stroke="${BAND}" stroke-width="${btnStroke}"/>
    <circle cx="${c}" cy="${c}" r="${btn * 0.45}" fill="none" stroke="rgba(27,36,56,.35)" stroke-width="${Math.max(1, btnStroke * 0.4)}"/>`;
}

function svg(size, kind) {
  const c = size / 2;
  // any: 둥근 사각 판(모서리 22%) · 공 지름 72% / maskable: 꽉 찬 판 · 공 지름 64%(안전 영역 80% 원 안) / full: 꽉 찬 판 · 공 70%
  const ratio = kind === 'maskable' ? 0.64 : kind === 'full' ? 0.70 : 0.72;
  const plate = kind === 'round'
    ? `<rect x="0" y="0" width="${size}" height="${size}" rx="${size * 0.22}" fill="${BG}"/>`
    : `<rect x="0" y="0" width="${size}" height="${size}" fill="${BG}"/>`;
  const glow = `<radialGradient id="g" cx="50%" cy="45%" r="55%"><stop offset="0" stop-color="#1d3a78"/><stop offset="1" stop-color="${BG}" stop-opacity="0"/></radialGradient>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <defs>${glow}</defs>${plate}
    <circle cx="${c}" cy="${c}" r="${size * 0.46}" fill="url(#g)"/>
    ${ball(c, size * ratio / 2)}</svg>`;
}

const ICONS = [
  { file: 'icon-32.png', size: 32, kind: 'round' },
  { file: 'icon-192.png', size: 192, kind: 'round' },
  { file: 'icon-512.png', size: 512, kind: 'round' },
  { file: 'icon-maskable-512.png', size: 512, kind: 'maskable' },
  { file: 'apple-touch-icon.png', size: 180, kind: 'full' }
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const ic of ICONS) {
    let img = sharp(Buffer.from(svg(ic.size, ic.kind)));
    if (ic.kind !== 'round') img = img.flatten({ background: BG });   // 투명 없이
    await img.png({ compressionLevel: 9 }).toFile(path.join(OUT, ic.file));
    const meta = await sharp(path.join(OUT, ic.file)).metadata();
    console.log(ic.file, meta.width + '×' + meta.height, meta.hasAlpha ? '투명 있음' : '투명 없음');
  }
  // 나란히 보기(보고용 · 커밋 안 함) — dist/icons_preview.png
  const tiles = ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'];
  const H = 300, W = 300, pad = 24;
  const comp = [];
  for (let i = 0; i < tiles.length; i++) {
    const buf = await sharp(path.join(OUT, tiles[i])).resize(256, 256, { kernel: 'nearest' }).png().toBuffer();
    comp.push({ input: buf, left: pad + i * (W + pad) + 22, top: 22 });
    // maskable 은 안전 영역(80% 원)을 점선으로 겹쳐 보여 준다
    if (tiles[i] === 'icon-maskable-512.png') {
      comp.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><circle cx="128" cy="128" r="102.4" fill="none" stroke="#ffe07a" stroke-width="2" stroke-dasharray="6 5"/></svg>`),
        left: pad + i * (W + pad) + 22, top: 22 });
    }
    comp.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="40"><text x="${W / 2}" y="26" font-size="18" font-family="sans-serif" fill="#e9eefc" text-anchor="middle">${tiles[i].replace('.png', '')}</text></svg>`),
      left: pad + i * (W + pad), top: H - 20 });
  }
  const dist = path.join(__dirname, '..', 'dist');
  fs.mkdirSync(dist, { recursive: true });
  await sharp({ create: { width: pad + tiles.length * (W + pad), height: H + 30, channels: 4, background: '#2a3550' } })
    .composite(comp).png().toFile(path.join(dist, 'icons_preview.png'));
  console.log('미리보기 dist/icons_preview.png');
})();
