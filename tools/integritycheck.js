/* integritycheck.js — 브라우저를 열지 않고 잡을 수 있는 연결 오류를 미리 잡는다.
 * 실행: node tools/integritycheck.js
 *
 * 잡아내는 것:
 *   - index.html 이 참조하는 script/link 파일이 실제로 없는 경우
 *   - JS 가 getElementById 로 찾는 id 가 HTML 에 없는 경우 (오타로 인한 조용한 null)
 *   - HTML 의 id 가 아무 데서도 안 쓰이는 경우 (죽은 마크업)
 *   - 스크립트 로드 순서가 의존성을 어기는 경우
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let problems = 0;
function report(msg) { problems += 1; console.log('  FAIL  ' + msg); }
function ok(msg) { console.log('  PASS  ' + msg); }

/* 1. 참조 파일 존재 여부 */
console.log('\n참조 파일');
const refs = [];
html.replace(/<script src="([^"]+)"/g, (_, p) => { refs.push(p); return _; });
html.replace(/<link[^>]+href="([^"]+)"/g, (_, p) => { refs.push(p); return _; });

const missing = refs.filter(r => !fs.existsSync(path.join(ROOT, r)));
if (missing.length) missing.forEach(m => report(`${m} 파일이 없습니다`));
else ok(`${refs.length}개 파일 모두 존재`);

/* 2. 디스크에 있으나 HTML 이 로드하지 않는 JS */
function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.js')) out.push(path.relative(ROOT, full).replace(/\\/g, '/'));
  }
  return out;
}
const allJs = walk(path.join(ROOT, 'js'));
const unloaded = allJs.filter(f => !refs.includes(f));
if (unloaded.length) unloaded.forEach(f => report(`${f} 가 index.html 에 없습니다`));
else ok(`js 폴더의 ${allJs.length}개 파일 모두 로드됨`);

/* 3. DOM id 양방향 검증 */
console.log('\nDOM id 연결');
const htmlIds = new Set();
html.replace(/\bid="([^"]+)"/g, (_, id) => { htmlIds.add(id); return _; });

const jsSource = allJs
  .map(f => fs.readFileSync(path.join(ROOT, f), 'utf8'))
  .join('\n');

const wanted = new Set();
jsSource.replace(/\$\('([^']+)'\)/g, (_, id) => { wanted.add(id); return _; });
jsSource.replace(/getElementById\('([^']+)'\)/g, (_, id) => { wanted.add(id); return _; });

const notInHtml = [...wanted].filter(id => !htmlIds.has(id));
if (notInHtml.length) notInHtml.forEach(id => report(`JS 가 #${id} 를 찾지만 HTML 에 없습니다`));
else ok(`JS 가 참조하는 id ${wanted.size}개 모두 HTML 에 존재`);

// data-todo 가 붙은 요소는 "나중 PHASE 를 위해 의도적으로 비워둔 자리"이므로 죽은 마크업이 아니다.
const reserved = new Set();
html.replace(/<[^>]*\bid="([^"]+)"[^>]*\bdata-todo=/g, (_, id) => { reserved.add(id); return _; });
html.replace(/<[^>]*\bdata-todo="[^"]*"[^>]*\bid="([^"]+)"/g, (_, id) => { reserved.add(id); return _; });

const unused = [...htmlIds].filter(id => !wanted.has(id) && !reserved.has(id));
if (unused.length) unused.forEach(id => report(`HTML 의 #${id} 를 아무도 쓰지 않습니다`));
else ok(`HTML id ${htmlIds.size}개 중 ${htmlIds.size - reserved.size}개 사용 · ${reserved.size}개는 다음 PHASE 예약`);

/* 4. 스크립트 로드 순서 = 의존성 순서 */
console.log('\n로드 순서');
const order = refs.filter(r => r.endsWith('.js'));
const DEPS = {
  'js/core/Utils.js': ['js/core/RPD.js'],
  'js/core/EventBus.js': ['js/core/RPD.js'],
  'js/core/Assets.js': ['js/core/RPD.js'],
  'js/core/PathFollower.js': ['js/core/RPD.js', 'js/core/Utils.js'],
  'js/core/Loop.js': ['js/core/RPD.js', 'js/core/Utils.js', 'js/core/EventBus.js'],
  'js/data/map.js': ['js/core/PathFollower.js', 'js/core/RPD.js'],
  'js/data/enemies.js': ['js/core/RPD.js'],
  'js/data/tiers.js': ['js/core/RPD.js'],
  'js/data/pokemon.js': ['js/core/RPD.js'],
  'js/data/waves.js': ['js/core/Utils.js', 'js/data/enemies.js'],
  'js/systems/GameManager.js': ['js/core/EventBus.js'],
  'js/systems/FieldManager.js': ['js/data/map.js', 'js/core/EventBus.js'],
  'js/systems/EconomyManager.js': ['js/systems/GameManager.js'],
  'js/data/craftpower.js': ['js/data/pokemon.js', 'js/data/recipes.js', 'js/data/spells.js'],
  'js/data/roletuning.js': ['js/core/RPD.js'],
  'js/systems/GoldShopManager.js': ['js/systems/GameManager.js', 'js/data/types.js'],
  'js/systems/EliteManager.js': ['js/systems/GameManager.js', 'js/data/enemies.js'],
  'js/systems/StatsManager.js': ['js/core/EventBus.js'],
  'js/systems/UnitManager.js': ['js/data/pokemon.js', 'js/systems/FieldManager.js', 'js/systems/SynergyManager.js'],
  'js/systems/SummonManager.js': ['js/data/tiers.js', 'js/data/pokemon.js', 'js/systems/UnitManager.js', 'js/systems/EconomyManager.js'],
  'js/systems/EnemyManager.js': ['js/data/enemies.js', 'js/data/waves.js', 'js/data/map.js'],
  'js/systems/CombatManager.js': ['js/systems/EnemyManager.js', 'js/systems/UnitManager.js'],
  'js/systems/SynergyManager.js': ['js/data/types.js', 'js/systems/FieldManager.js'],
  'js/systems/SaveManager.js': ['js/systems/StatsManager.js', 'js/data/pokemon.js', 'js/core/EventBus.js'],
  'js/systems/BossManager.js': ['js/systems/EnemyManager.js', 'js/systems/UnitManager.js', 'js/systems/FieldManager.js'],
  'js/data/recipes.js': ['js/core/RPD.js'],
  'js/data/dexbonus.js': ['js/core/RPD.js'],
  'js/data/skills.js': ['js/core/RPD.js', 'js/data/pokemon.js'],
  'js/data/attackfx.js': ['js/core/RPD.js', 'js/data/types.js'],
  'js/systems/SpellManager.js': ['js/data/spells.js', 'js/systems/SummonManager.js', 'js/systems/SaveManager.js'],
  'js/ui/SpellUI.js': ['js/systems/SpellManager.js', 'js/ui/Icons.js'],
  'js/ui/RecipeBook.js': ['js/data/recipes.js', 'js/ui/Icons.js'],
  'js/ui/GoldShopUI.js': ['js/systems/GoldShopManager.js'],
  'js/ui/EliteUI.js': ['js/systems/EliteManager.js'],
  'js/systems/ProgressManager.js': ['js/systems/SaveManager.js', 'js/data/titles.js', 'js/systems/SummonManager.js'],
  'js/systems/TraitManager.js': ['js/data/traits.js', 'js/systems/CombatManager.js', 'js/systems/EnemyManager.js'],
  'js/systems/RewardManager.js': ['js/systems/SummonManager.js', 'js/systems/ShardManager.js'],
  'js/data/enemyskins.js': ['js/data/enemies.js'],
  'js/systems/SkillManager.js': ['js/data/skills.js', 'js/systems/CombatManager.js', 'js/systems/UnitManager.js'],
  'js/render/AttackFxRenderer.js': ['js/data/attackfx.js', 'js/render/Renderer.js'],
  'js/ui/Icons.js': ['js/data/types.js', 'js/render/SpriteFactory.js'],
  'js/ui/HudPanels.js': ['js/ui/UIManager.js', 'js/ui/Icons.js'],
  'js/systems/RecipeManager.js': ['js/data/recipes.js', 'js/systems/UnitManager.js', 'js/systems/FieldManager.js'],
  'js/systems/StorageManager.js': ['js/systems/FieldManager.js', 'js/systems/UnitManager.js'],
  'js/systems/ShardManager.js': ['js/data/pokemon.js', 'js/systems/FieldManager.js'],
  'js/systems/WaveManager.js': ['js/data/waves.js', 'js/systems/EnemyManager.js', 'js/systems/EconomyManager.js'],
  'js/render/SpriteFactory.js': ['js/data/types.js'],
  'js/render/MapRenderer.js': ['js/render/Renderer.js', 'js/data/map.js', 'js/systems/FieldManager.js'],
  'js/render/UnitRenderer.js': ['js/render/MapRenderer.js', 'js/systems/CombatManager.js', 'js/render/FxRenderer.js'],
  'js/render/EnemyRenderer.js': ['js/render/MapRenderer.js', 'js/systems/EnemyManager.js'],
  'js/render/FxRenderer.js': ['js/core/EventBus.js', 'js/data/map.js'],
  'js/ui/UIManager.js': ['js/systems/WaveManager.js', 'js/systems/StatsManager.js', 'js/systems/SummonManager.js', 'js/systems/RecipeManager.js', 'js/systems/SynergyManager.js', 'js/render/FxRenderer.js', 'js/core/Loop.js'],
  'js/main.js': ['js/ui/UIManager.js', 'js/render/EnemyRenderer.js', 'js/render/UnitRenderer.js', 'js/render/FxRenderer.js']
};

let orderOk = true;
for (const [file, deps] of Object.entries(DEPS)) {
  const at = order.indexOf(file);
  if (at < 0) { report(`${file} 가 로드 목록에 없습니다`); orderOk = false; continue; }
  for (const d of deps) {
    const dAt = order.indexOf(d);
    if (dAt < 0 || dAt > at) {
      report(`${file} 가 ${d} 보다 먼저 로드됩니다`);
      orderOk = false;
    }
  }
}
if (orderOk) ok('모든 의존성이 먼저 로드됨');

/* 5. 작동하지 않는 버튼이 활성화되어 있지 않은지 */
console.log('\n버튼 상태');
const buttons = [...html.matchAll(/<button[^>]*id="([^"]+)"[^>]*>/g)].map(m => ({ id: m[1], tag: m[0] }));
const wiredIds = new Set();
jsSource.replace(/el\.(\w+)\.addEventListener/g, (_, k) => { wiredIds.add(k); return _; });

const liveButtons = buttons.filter(b => !/\bdisabled\b/.test(b.tag));
const deadLive = liveButtons.filter(b => {
  // el.<key> 매핑을 역추적: cacheElements 의 `el.key = $('id')` 를 읽는다
  const re = new RegExp(`el\\.(\\w+)\\s*=\\s*\\$\\('${b.id}'\\)`);
  const m = jsSource.match(re);
  return !m || !wiredIds.has(m[1]);
});
if (deadLive.length) deadLive.forEach(b => report(`#${b.id} 는 활성 상태인데 클릭 핸들러가 없습니다 (가짜 버튼)`));
else ok(`활성 버튼 ${liveButtons.length}개 모두 핸들러 연결됨`);

const disabledButtons = buttons.filter(b => /\bdisabled\b/.test(b.tag));
ok(`비활성 버튼 ${disabledButtons.length}개 (미구현 표시): ${disabledButtons.map(b => b.id).join(', ')}`);

console.log(`\n────────────────────────────`);
console.log(problems === 0 ? '문제 없음' : `문제 ${problems}건`);
process.exit(problems === 0 ? 0 : 1);
