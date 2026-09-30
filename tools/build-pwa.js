/* build-pwa.js — 서비스 워커 프리캐시 목록을 만든다(모바일 ④ · 세션 71).
 *
 *   npm run pwa   (= node tools/build-pwa.js)   → pwa-precache.js (커밋한다)
 *   node tools/build-pwa.js --check             → 커밋된 목록이 지금 파일과 같은지만 본다(npm run check 가 부른다 · 다르면 실패)
 *
 * GitHub Pages 는 빌드 없이 커밋된 파일을 그대로 내보낸다 — 그래서 목록을 여기서 만들어 커밋해 둔다.
 *   code   : index.html · ./ · manifest.webmanifest · js/**.js · css/**.css — 서비스 워커가 "인터넷 먼저"로 준다(목록은 오프라인 대비로 미리 받을 것)
 *   images : assets/**.png(assets/music 제외) — "저장소 먼저". hash 는 그림 경로 + 내용의 해시 → 그림이 바뀌면 캐시 이름이 바뀌어 새로 받는다
 *   assets/music 은 넣지 않는다 — 서비스 워커가 가로채지도 않는다(사파리가 서비스 워커로 받은 오디오의 Range 요청을 못 다루고, 용량도 크다)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'pwa-precache.js');

function walk(dir, ext, out) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const name of fs.readdirSync(abs).sort()) {
    const rel = dir + '/' + name;
    const st = fs.statSync(path.join(ROOT, rel));
    if (st.isDirectory()) { if (rel !== 'assets/music') walk(rel, ext, out); }
    else if (name.endsWith(ext)) out.push(rel);
  }
  return out;
}

function build() {
  const code = ['./', 'index.html', 'manifest.webmanifest', ...walk('js', '.js', []), ...walk('css', '.css', [])];
  const images = walk('assets', '.png', []);
  const h = crypto.createHash('sha1');
  for (const f of images) { h.update(f); h.update(fs.readFileSync(path.join(ROOT, f))); }
  const hash = h.digest('hex').slice(0, 10);
  const text = '/* pwa-precache.js — tools/build-pwa.js 가 만든다(손으로 고치지 않는다 · npm run pwa). sw.js 가 importScripts 로 읽는다.\n' +
    ' * code: 인터넷 먼저 · images: 저장소 먼저(hash 가 바뀌면 새 저장소) · assets/music 은 없다(서비스 워커를 거치지 않는다). */\n' +
    'self.PRECACHE = ' + JSON.stringify({ hash, code, images }, null, 1) + ';\n';
  return { text, hash, code, images };
}

if (require.main === module) {
  const b = build();
  if (process.argv.includes('--check')) {
    const now = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (now !== b.text) {
      console.log('  FAIL  pwa-precache.js 가 지금 파일과 다릅니다 — npm run pwa 로 다시 만들고 커밋하세요');
      process.exit(1);
    }
    console.log('  PASS  서비스 워커 프리캐시 목록 = 실제 파일(코드 ' + b.code.length + ' · 그림 ' + b.images.length + ' · hash ' + b.hash + ')');
  } else {
    fs.writeFileSync(OUT, b.text);
    console.log('만들었다: pwa-precache.js — 코드 ' + b.code.length + ' · 그림 ' + b.images.length + ' · hash ' + b.hash);
  }
}
module.exports = { build };
