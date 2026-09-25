/* build-tester.js — 테스터에게 보낼 파일 하나를 만든다.
 *
 *   node tools/build-tester.js
 *   → dist/포켓몬랜덤디펜스_테스트.html
 *
 * 이 파일 하나에 게임 전체(HTML · CSS · JS · 그림)가 들어 있다.
 * 받은 사람은 더블클릭만 하면 된다. 작업 기록(VERSION · CHECKPOINT · docs),
 * 검사 도구(tools), 원본 폴더 구조는 들어가지 않는다.
 *
 * 원본은 건드리지 않는다. 읽기만 하고 dist/ 에 새로 쓴다.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'dist');
const OUT = path.join(OUT_DIR, '포켓몬랜덤디펜스_테스트.html');

let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// </script> 가 코드·문자열 안에 있으면 HTML 이 거기서 끊긴다
const safeScript = s => s.replace(/<\/script/gi, '<\\/script');
const safeStyle = s => s.replace(/<\/style/gi, '<\\/style');

// 1) CSS 를 안으로
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, href) => {
  const css = fs.readFileSync(path.join(ROOT, href), 'utf8');
  return `<style>/* ${href} */\n${safeStyle(css)}\n</style>`;
});

// 2) 그림을 data URL 로 모은다 (assets 아래 PNG 전부)
function walk(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.png$/i.test(name)) out.push(full);
  }
  return out;
}
/* 게임이 실제로 쓰는 그림만 넣는다.
 * assets/pokemon 에는 아직 로스터에 안 들어간 포켓몬 그림도 쌓여 있다(다음 조합식 작업용).
 * 그것까지 넣으면 테스트판이 쓸데없이 커진다. */
const usedPokemon = new Set(
  [...fs.readFileSync(path.join(ROOT, 'js/data/pokemon.js'), 'utf8').matchAll(/id:'([a-z_]+)'/g)].map(m => m[1]));
function isUsed(rel) {
  if (rel.startsWith('assets/icons/')) return false;   // 앱 아이콘은 아래 5) 에서 <link> 에만 넣는다
  const m = rel.match(/^assets\/pokemon\/([a-z_]+)\.png$/);
  return m ? usedPokemon.has(m[1]) : true;
}
const inline = {};
let imageBytes = 0;
let skipped = 0;
for (const file of walk(path.join(ROOT, 'assets'))) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  if (!isUsed(rel)) { skipped += 1; continue; }
  const buf = fs.readFileSync(file);
  imageBytes += buf.length;
  inline[rel] = 'data:image/png;base64,' + buf.toString('base64');
}

// 3) JS 를 안으로. 그림 목록은 첫 스크립트보다 먼저 들어가야 한다
let first = true;
let jsCount = 0;
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => {
  const js = fs.readFileSync(path.join(ROOT, src), 'utf8');
  jsCount += 1;
  let prefix = '';
  if (first) {
    first = false;
    prefix = `<script>window.RPD_INLINE = ${safeScript(JSON.stringify(inline))};</script>\n`;
  }
  return `${prefix}<script>/* ${src} */\n${safeScript(js)}\n</script>`;
});

// 5) 홈 화면 앱(모바일 ③) — 한 파일(file://)은 설치 · 오프라인이 안 된다(브라우저 규칙). 매니페스트는 빼고,
//    탭 아이콘 · 아이폰 아이콘만 안으로 넣는다. js/core/Pwa.js 는 RPD_INLINE 을 보고 서비스 워커를 등록하지 않는다.
html = html.replace(/<link rel="manifest"[^>]*>\n?/, '');
html = html.replace(/(<link rel="(?:icon|apple-touch-icon)"[^>]*href=")([^"]+\.png)(")/g, (_, a, href, b) =>
  a + 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, href)).toString('base64') + b);

// 4) 빌드 표시 — 테스터가 어느 판을 받았는지 말할 수 있게
const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
html = html.replace('<title>포켓몬 랜덤 디펜스</title>',
  `<title>포켓몬 랜덤 디펜스 · 테스트판 ${stamp}</title>`);
html = html.replace('<body', `<!-- 테스트판 ${stamp} -->\n<body`);

// 남은 외부 참조가 없어야 한다(있으면 받은 사람 쪽에서 깨진다)
const leftovers = [...html.matchAll(/(?:src|href)="(?!data:|#|https?:)([^"]+\.(?:js|css|png))"/g)].map(m => m[1]);
if (leftovers.length) {
  console.error('외부 파일 참조가 남아 있다:', leftovers);
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, html);

const kb = n => (n / 1024).toFixed(0) + 'KB';
console.log(`만들었다: ${path.relative(ROOT, OUT)}`);
console.log(`  스크립트 ${jsCount}개 · 그림 ${Object.keys(inline).length}장(${kb(imageBytes)}) · 전체 ${kb(Buffer.byteLength(html))}`);
if (skipped) console.log(`  아직 게임에서 안 쓰는 포켓몬 그림 ${skipped}장은 넣지 않았다`);
console.log(`  빌드 ${stamp}`);
