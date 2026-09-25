/* attackfx.js — 포켓몬별 공격 연출 설정.
 *
 * 55종 각각에 고유한 공격 연출을 준다. 이미지는 새로 만들지 않는다.
 * 렌더러(AttackFxRenderer)는 하나만 두고, 여기서는 "무엇을 어떻게 그릴지"만 적는다.
 *
 * 전투 판정과는 완전히 분리돼 있다. 전투는 즉시 타격(hitscan)이라 피해는 이미 들어갔고,
 * 투사체는 그 사실을 눈에 보이게 옮기는 그림일 뿐이다. 이 파일을 통째로 지워도
 * 게임 결과는 한 자리도 바뀌지 않는다.
 *
 * 필드
 *   type      PROJECTILE | BEAM | BREATH | SLASH | EXPLOSION | CHAIN | AREA | ORBIT
 *   style     타입 스타일 키(FIRE, WATER …). 생략하면 개체의 첫 번째 타입
 *   shape     투사체·참격 모양 (orb flame drop leaf seed needle rock star note feather
 *             wisp crescent bubble coin spore wave drill glob sand fang claw chop thrust silk)
 *   color     주 색 / color2 밝은 심
 *   size      기본 크기(px, 논리 좌표). 등급 배율이 렌더러에서 곱해진다
 *   speed     투사체 속도(px/초)
 *   trail     꼬리 세기 0~2
 *   particles 명중 파티클 수(등급 가산 전)
 *   impact    명중 연출 (burst splash spark leaves shards poison ring shadow dust metal
 *             star feather thump spore coins petals notes)
 *   shake     화면 흔들림 세기(전설 등급에서만 쓰인다)
 *   count     한 번에 나가는 투사체 수 / curve 휘어짐 / arc 포물선 높이 / spin 회전
 *   width     빔·브레스 굵기 / radius 광역 연출 반경(판정 반경이 있으면 그쪽이 우선)
 *   skill     스킬용 대형 연출(희귀함·전설). 평타와 확실히 다르게 보인다
 *
 * 이 빌드에는 스킬 발동 로직(SkillManager)이 없다. skill 연출은 'unit:skill' 이벤트나
 * AttackFx.skill(unit, target) 호출이 오면 바로 쓰이도록 데이터와 렌더러만 준비돼 있다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  /* 타입별 기본값. 개체 설정이 비워 둔 칸을 채운다.
   * 로스터에 아직 없는 타입(얼음·에스퍼·고스트·바위·강철·드래곤·악)도 미리 둔다 —
   * 그 타입 포켓몬을 추가하면 데이터 한 줄로 고유 연출이 붙는다. */
  var STYLES = {
    FIRE:     { color: '#ff7a2f', color2: '#ffd25e', impact: 'burst',   trailKind: 'ember'  },
    WATER:    { color: '#3d9bff', color2: '#d4f0ff', impact: 'splash',  trailKind: 'drop'   },
    ELECTRIC: { color: '#ffd92e', color2: '#ffffff', impact: 'spark',   trailKind: 'spark'  },
    GRASS:    { color: '#4fbf45', color2: '#d8ff8a', impact: 'leaves',  trailKind: 'leaf'   },
    ICE:      { color: '#7fe3ff', color2: '#ffffff', impact: 'shards',  trailKind: 'frost'  },
    FIGHTING: { color: '#ff6a3d', color2: '#ffe6cc', impact: 'thump',   trailKind: 'spark'  },
    PSYCHIC:  { color: '#c86bff', color2: '#ffc6f2', impact: 'ring',    trailKind: 'glow'   },
    GHOST:    { color: '#8a5cff', color2: '#e2d4ff', impact: 'shadow',  trailKind: 'shadow' },
    POISON:   { color: '#b25ce0', color2: '#f0b8ff', impact: 'poison',  trailKind: 'bubble' },
    BUG:      { color: '#9ccf2e', color2: '#f4ff9a', impact: 'spore',   trailKind: 'glow'   },
    ROCK:     { color: '#b0936a', color2: '#eadcc0', impact: 'shards',  trailKind: 'pebble' },
    GROUND:   { color: '#c79a52', color2: '#f4dca6', impact: 'dust',    trailKind: 'pebble' },
    STEEL:    { color: '#a9b8d0', color2: '#ffffff', impact: 'metal',   trailKind: 'spark'  },
    DRAGON:   { color: '#6f5bff', color2: '#62e0ff', impact: 'ring',    trailKind: 'glow'   },
    NORMAL:   { color: '#f4efe2', color2: '#ffffff', impact: 'thump',   trailKind: 'glow'   },
    FLYING:   { color: '#d6ecff', color2: '#ffffff', impact: 'feather', trailKind: 'wind'   },
    FAIRY:    { color: '#ff8fcf', color2: '#fff0fa', impact: 'star',    trailKind: 'sparkle'},
    DARK:     { color: '#5a4a6a', color2: '#d4c4ec', impact: 'shadow',  trailKind: 'shadow' }
  };

  var FX = {
    /* ---------- 흔함 — 작고 단순하게 ---------- */
    bulbasaur:  { type: 'PROJECTILE', style: 'GRASS', shape: 'seed', color: '#6cc24a', color2: '#e3ff9c',
                  size: 4, speed: 520, curve: 18, trail: 0, particles: 3, impact: 'leaves' },
    charmander: { type: 'PROJECTILE', style: 'FIRE', shape: 'flame', color: '#ff7a1f', color2: '#ffe07a',
                  size: 5, speed: 640, trail: 1, particles: 4, impact: 'burst' },
    squirtle:   { type: 'PROJECTILE', style: 'WATER', shape: 'bubble', color: '#56b2ff', color2: '#e6f6ff',
                  size: 5, speed: 460, trail: 0, particles: 4, impact: 'splash' },
    caterpie:   { type: 'BEAM', style: 'BUG', shape: 'silk', color: '#e8f5c8', color2: '#ffffff',
                  width: 1.6, particles: 2, impact: 'spore' },
    weedle:     { type: 'PROJECTILE', style: 'POISON', shape: 'needle', color: '#d8b04a', color2: '#b25ce0',
                  size: 3, speed: 900, trail: 0, particles: 3, impact: 'poison' },
    pidgey:     { type: 'PROJECTILE', style: 'FLYING', shape: 'crescent', color: '#e9f4ff', color2: '#ffffff',
                  size: 6, speed: 560, trail: 0, particles: 2, impact: 'feather' },
    rattata:    { type: 'SLASH', style: 'NORMAL', shape: 'fang', color: '#ffffff', color2: '#d9c7ff',
                  size: 9, particles: 3, impact: 'thump' },
    spearow:    { type: 'PROJECTILE', style: 'FLYING', shape: 'needle', color: '#c98a52', color2: '#fff1d6',
                  size: 4, speed: 1000, trail: 1, particles: 2, impact: 'feather' },
    ekans:      { type: 'EXPLOSION', style: 'POISON', shape: 'glob', color: '#a44fd6', color2: '#e6a8ff',
                  size: 5, speed: 420, arc: 26, trail: 0, particles: 4, impact: 'poison', radius: 22 },
    nidoran_f:  { type: 'PROJECTILE', style: 'POISON', shape: 'needle', color: '#7fb6ff', color2: '#e0b8ff',
                  size: 3, speed: 820, count: 2, trail: 0, particles: 2, impact: 'poison' },
    nidoran_m:  { type: 'SLASH', style: 'POISON', shape: 'thrust', color: '#d27bff', color2: '#ffffff',
                  size: 10, particles: 3, impact: 'thump' },
    clefairy:   { type: 'ORBIT', style: 'FAIRY', shape: 'star', color: '#ff9fd6', color2: '#fff6fb',
                  size: 5, speed: 420, curve: 40, spin: 6, trail: 1, particles: 3, impact: 'star' },
    vulpix:     { type: 'BREATH', style: 'FIRE', shape: 'flame', color: '#ff5a2a', color2: '#ffc15c',
                  size: 4, width: 16, particles: 3, impact: 'burst' },
    jigglypuff: { type: 'ORBIT', style: 'FAIRY', shape: 'note', color: '#ff7fbf', color2: '#ffffff',
                  size: 5, speed: 340, curve: 55, trail: 0, particles: 3, impact: 'notes' },
    zubat:      { type: 'PROJECTILE', style: 'POISON', shape: 'wave', color: '#9a7cff', color2: '#e5dcff',
                  size: 7, speed: 520, trail: 0, particles: 2, impact: 'ring' },
    oddish:     { type: 'PROJECTILE', style: 'GRASS', shape: 'spore', color: '#c6e05a', color2: '#fff7a8',
                  size: 4, speed: 380, curve: -16, trail: 0, particles: 4, impact: 'spore' },

    /* ---------- 안흔함 — 꼬리와 파티클이 붙는다 ---------- */
    ivysaur:    { type: 'PROJECTILE', style: 'GRASS', shape: 'leaf', color: '#3fb34a', color2: '#c8ff8a',
                  size: 6, speed: 620, count: 2, spin: 14, curve: 22, trail: 1, particles: 5, impact: 'leaves' },
    charmeleon: { type: 'EXPLOSION', style: 'FIRE', shape: 'fireball', color: '#ff6a1a', color2: '#ffe37a',
                  size: 7, speed: 520, arc: 30, trail: 2, particles: 7, impact: 'burst' },
    wartortle:  { type: 'BEAM', style: 'WATER', shape: 'stream', color: '#3a8cff', color2: '#cdeeff',
                  width: 5, particles: 6, impact: 'splash' },
    metapod:    { type: 'AREA', style: 'BUG', shape: 'shell', color: '#8fcf5a', color2: '#e8ffd0',
                  size: 6, particles: 4, impact: 'thump', radius: 40 },
    kakuna:     { type: 'PROJECTILE', style: 'POISON', shape: 'needle', color: '#ffd23a', color2: '#b25ce0',
                  size: 4, speed: 940, count: 2, trail: 1, particles: 4, impact: 'poison' },
    pidgeotto:  { type: 'PROJECTILE', style: 'FLYING', shape: 'crescent', color: '#dff0ff', color2: '#ffffff',
                  size: 8, speed: 620, count: 2, curve: 14, trail: 1, particles: 3, impact: 'feather' },
    raticate:   { type: 'SLASH', style: 'NORMAL', shape: 'fang', color: '#fff4e0', color2: '#ffcf6a',
                  size: 13, particles: 5, impact: 'thump' },
    fearow:     { type: 'PROJECTILE', style: 'FLYING', shape: 'drill', color: '#d98a46', color2: '#fff0cc',
                  size: 5, speed: 1080, spin: 22, trail: 1, particles: 5, impact: 'dust' },
    arbok:      { type: 'BREATH', style: 'POISON', shape: 'glob', color: '#9a3fd0', color2: '#e3a3ff',
                  size: 5, width: 20, particles: 5, impact: 'poison' },
    nidorina:   { type: 'SLASH', style: 'POISON', shape: 'fang', color: '#8fb8ff', color2: '#d49aff',
                  size: 12, particles: 4, impact: 'poison' },
    nidorino:   { type: 'SLASH', style: 'POISON', shape: 'thrust', color: '#e07aff', color2: '#ffffff',
                  size: 14, particles: 5, impact: 'thump' },
    gloom:      { type: 'AREA', style: 'POISON', shape: 'cloud', color: '#c27ad8', color2: '#ffc4e6',
                  size: 6, particles: 6, impact: 'poison', radius: 30 },
    ninetales:  { type: 'ORBIT', style: 'FIRE', shape: 'wisp', color: '#7a6bff', color2: '#ffd8a8',
                  size: 6, speed: 380, count: 2, curve: 48, trail: 2, particles: 5, impact: 'burst' , skill: { type: 'AREA', scale: 2.6, impact: 'burst' } },
    golbat:     { type: 'BEAM', style: 'POISON', shape: 'drain', color: '#d0447a', color2: '#ffb0cf',
                  width: 3, particles: 5, impact: 'shadow' },

    /* ---------- 특별함 — 투사체가 커지고 파티클이 늘어난다 ---------- */
    diglett:    { type: 'AREA', style: 'GROUND', shape: 'crack', color: '#a8753e', color2: '#f0cf8e',
                  size: 7, particles: 6, impact: 'dust', radius: 26 },
    dugtrio:    { type: 'AREA', style: 'GROUND', shape: 'quake', color: '#9c6a36', color2: '#f4d69c',
                  size: 8, particles: 9, impact: 'dust', radius: 60 },
    mankey:     { type: 'SLASH', style: 'FIGHTING', shape: 'chop', color: '#ff7040', color2: '#fff0dc',
                  size: 16, particles: 6, impact: 'thump' },
    meowth:     { type: 'PROJECTILE', style: 'NORMAL', shape: 'coin', color: '#ffc629', color2: '#fff6c2',
                  size: 6, speed: 700, spin: 16, trail: 1, particles: 6, impact: 'coins' },
    paras:      { type: 'PROJECTILE', style: 'BUG', shape: 'spore', color: '#ff8a3a', color2: '#ffe0a8',
                  size: 6, speed: 420, curve: 20, trail: 1, particles: 7, impact: 'spore' },
    parasect:   { type: 'AREA', style: 'BUG', shape: 'cloud', color: '#ff6a2a', color2: '#ffd79a',
                  size: 7, particles: 9, impact: 'spore', radius: 36 },
    persian:    { type: 'SLASH', style: 'NORMAL', shape: 'claw', color: '#ffffff', color2: '#ffe28a',
                  size: 16, particles: 6, impact: 'thump' },
    pikachu:    { type: 'CHAIN', style: 'ELECTRIC', shape: 'bolt', color: '#ffe23a', color2: '#ffffff',
                  width: 2.6, particles: 6, impact: 'spark' },
    psyduck:    { type: 'ORBIT', style: 'PSYCHIC', shape: 'orb', color: '#6fb8ff', color2: '#ffd0f4',
                  size: 7, speed: 360, curve: 60, trail: 1, particles: 5, impact: 'ring' },
    sandshrew:  { type: 'EXPLOSION', style: 'GROUND', shape: 'sand', color: '#e0b85a', color2: '#fff0c0',
                  size: 7, speed: 480, arc: 34, trail: 1, particles: 8, impact: 'dust' },
    venomoth:   { type: 'BREATH', style: 'BUG', shape: 'powder', color: '#c9a2ff', color2: '#fff2a8',
                  size: 4, width: 26, particles: 6, impact: 'spore' },
    venonat:    { type: 'BEAM', style: 'PSYCHIC', shape: 'psybeam', color: '#d06bff', color2: '#ffb4e8',
                  width: 4, particles: 6, impact: 'ring' },

    /* ---------- 희귀함 — 강한 꼬리 + 명중 링. 스킬 연출이 붙는다 ---------- */
    butterfree: { type: 'ORBIT', style: 'BUG', shape: 'powder', color: '#a8c8ff', color2: '#ffffff',
                  size: 7, speed: 360, count: 3, curve: 50, trail: 2, particles: 8, impact: 'spore',
                  skill: { type: 'AREA', scale: 2.4, impact: 'spore', color: '#bcd6ff' } },
    beedrill:   { type: 'PROJECTILE', style: 'BUG', shape: 'needle', color: '#ffd000', color2: '#2a2a2a',
                  size: 6, speed: 1200, count: 2, trail: 2, particles: 8, impact: 'poison',
                  skill: { type: 'PROJECTILE', scale: 2.2, count: 5, impact: 'poison' } },
    pidgeot:    { type: 'PROJECTILE', style: 'FLYING', shape: 'crescent', color: '#ffe7a8', color2: '#ffffff',
                  size: 12, speed: 760, count: 2, curve: 26, trail: 2, particles: 8, impact: 'feather',
                  skill: { type: 'AREA', scale: 2.6, impact: 'feather', color: '#e8f4ff' } },
    raichu:     { type: 'CHAIN', style: 'ELECTRIC', shape: 'bolt', color: '#ffc21a', color2: '#ffffff',
                  width: 4, particles: 10, impact: 'spark',
                  skill: { type: 'CHAIN', scale: 2.4, impact: 'spark' } },
    sandslash:  { type: 'EXPLOSION', style: 'GROUND', shape: 'rock', color: '#c9953f', color2: '#ffe2a0',
                  size: 9, speed: 560, arc: 40, spin: 10, trail: 2, particles: 10, impact: 'shards',
                  skill: { type: 'AREA', scale: 2.6, impact: 'dust' } },
    clefable:   { type: 'ORBIT', style: 'FAIRY', shape: 'moon', color: '#ffb8e6', color2: '#ffffff',
                  size: 10, speed: 420, curve: 70, trail: 2, particles: 9, impact: 'star',
                  skill: { type: 'BEAM', scale: 2.4, impact: 'star', color: '#ffd6f2' } },
    vileplume:  { type: 'AREA', style: 'GRASS', shape: 'bloom', color: '#ff4f5e', color2: '#ffd1a1',
                  size: 8, particles: 12, impact: 'petals', radius: 56,
                  skill: { type: 'AREA', scale: 2.2, impact: 'petals' } },
    wigglytuff: { type: 'PROJECTILE', style: 'FAIRY', shape: 'wave', color: '#ff86c8', color2: '#fff3fb',
                  size: 12, speed: 560, trail: 2, particles: 8, impact: 'notes',
                  skill: { type: 'AREA', scale: 2.4, impact: 'notes' } },

    /* ---------- 전설 — 대형 연출 + 강한 명중 + 짧은 흔들림 ---------- */
    venusaur:   { type: 'BEAM', style: 'GRASS', shape: 'solar', color: '#8ee04a', color2: '#fff8b0',
                  width: 10, particles: 14, impact: 'leaves', shake: 0.5,
                  skill: { type: 'BEAM', scale: 2.0, impact: 'petals', color: '#fff27a' } },
    charizard:  { type: 'BREATH', style: 'FIRE', shape: 'flame', color: '#ff5412', color2: '#ffe066',
                  size: 8, width: 44, particles: 14, impact: 'burst', shake: 0.7,
                  skill: { type: 'EXPLOSION', scale: 2.6, impact: 'burst' } },
    blastoise:  { type: 'BEAM', style: 'WATER', shape: 'cannon', color: '#2a7dff', color2: '#e6f6ff',
                  width: 9, count: 2, particles: 14, impact: 'splash', shake: 0.6,
                  skill: { type: 'BEAM', scale: 2.2, impact: 'splash' } },
    nidoqueen:  { type: 'AREA', style: 'GROUND', shape: 'quake', color: '#8a64c8', color2: '#f0d49a',
                  size: 10, particles: 16, impact: 'dust', radius: 80, shake: 0.8,
                  skill: { type: 'AREA', scale: 2.2, impact: 'shards' } },
    nidoking:   { type: 'SLASH', style: 'POISON', shape: 'thrust', color: '#b86bff', color2: '#ffffff',
                  size: 26, particles: 14, impact: 'thump', shake: 0.8,
                  skill: { type: 'SLASH', scale: 2.4, impact: 'shadow' } },

    /* ---------- 1세대 확장 — 역할·타입 규칙으로 만든 설정(개체마다 색·모양·크기가 조금씩 다르다) ---------- */
    poliwag: { type: 'PROJECTILE', style: 'WATER', shape: 'wave', color: '#3759ff', color2: '#d4f0ff', size: 4, speed: 630, particles: 3, impact: 'splash' },
    poliwhirl: { type: 'PROJECTILE', style: 'WATER', shape: 'wave', color: '#4cbdff', color2: '#d4f0ff', size: 6, speed: 570, particles: 5, impact: 'splash', count: 2 },
    poliwrath: { type: 'SLASH', style: 'WATER', shape: 'drop', color: '#5197ff', color2: '#d4f0ff', size: 7, speed: 630, particles: 9, impact: 'splash', skill: { type: 'AREA', scale: 2.3, impact: 'splash' } },
    abra: { type: 'BEAM', style: 'PSYCHIC', shape: 'wave', color: '#cb89ff', color2: '#ffc6f2', size: 5, speed: 540, particles: 3, impact: 'ring', width: 14 },
    kadabra: { type: 'BEAM', style: 'PSYCHIC', shape: 'orb', color: '#803dff', color2: '#ffc6f2', size: 6, speed: 510, particles: 5, impact: 'ring', width: 20 },
    alakazam: { type: 'BEAM', style: 'PSYCHIC', shape: 'star', color: '#f660ff', color2: '#ffc6f2', size: 7, speed: 510, particles: 9, impact: 'ring', width: 32, skill: { type: 'AREA', scale: 2.3, impact: 'ring' } },
    machop: { type: 'SLASH', style: 'FIGHTING', shape: 'chop', color: '#ff962d', color2: '#ffe6cc', size: 4, speed: 510, particles: 3, impact: 'thump' },
    machoke: { type: 'SLASH', style: 'FIGHTING', shape: 'chop', color: '#ff612d', color2: '#ffe6cc', size: 6, speed: 570, particles: 5, impact: 'thump' },
    machamp: { type: 'SLASH', style: 'FIGHTING', shape: 'chop', color: '#ff920f', color2: '#ffe6cc', size: 7, speed: 510, particles: 9, impact: 'thump', skill: { type: 'BEAM', scale: 2.2, impact: 'thump' } },
    bellsprout: { type: 'PROJECTILE', style: 'GRASS', shape: 'seed', color: '#44bf51', color2: '#d8ff8a', size: 5, speed: 510, particles: 3, impact: 'leaves' },
    weepinbell: { type: 'PROJECTILE', style: 'GRASS', shape: 'leaf', color: '#55c454', color2: '#d8ff8a', size: 6, speed: 690, particles: 5, impact: 'leaves' },
    victreebel: { type: 'EXPLOSION', style: 'GRASS', shape: 'seed', color: '#63c971', color2: '#d8ff8a', size: 8, speed: 480, particles: 9, impact: 'leaves', radius: 82, skill: { type: 'BEAM', scale: 2.4, impact: 'leaves' } },
    geodude: { type: 'AREA', style: 'ROCK', shape: 'sand', color: '#9a7951', color2: '#eadcc0', size: 4, speed: 660, particles: 3, impact: 'shards', radius: 40 },
    graveler: { type: 'AREA', style: 'ROCK', shape: 'rock', color: '#ae9d66', color2: '#eadcc0', size: 6, speed: 540, particles: 5, impact: 'shards', radius: 54 },
    golem: { type: 'EXPLOSION', style: 'ROCK', shape: 'rock', color: '#ac7e63', color2: '#eadcc0', size: 7, speed: 510, particles: 9, impact: 'shards', radius: 82, skill: { type: 'EXPLOSION', scale: 2.2, impact: 'shards' } },
    gastly: { type: 'ORBIT', style: 'GHOST', shape: 'wisp', color: '#898fff', color2: '#e2d4ff', size: 5, speed: 720, particles: 3, impact: 'shadow' },
    haunter: { type: 'ORBIT', style: 'GHOST', shape: 'orb', color: '#b46bff', color2: '#e2d4ff', size: 6, speed: 660, particles: 5, impact: 'shadow' },
    gengar: { type: 'ORBIT', style: 'GHOST', shape: 'wisp', color: '#c05cff', color2: '#e2d4ff', size: 7, speed: 570, particles: 9, impact: 'shadow', skill: { type: 'EXPLOSION', scale: 2.3, impact: 'shadow' } },
    dratini: { type: 'BEAM', style: 'DRAGON', shape: 'crescent', color: '#747dff', color2: '#62e0ff', size: 6, speed: 630, particles: 5, impact: 'ring', width: 20 },
    dragonair: { type: 'BEAM', style: 'DRAGON', shape: 'wave', color: '#8894ff', color2: '#62e0ff', size: 6, speed: 540, particles: 7, impact: 'ring', width: 26 , skill: { type: 'BEAM', scale: 2.2, impact: 'ring' } },
    dragonite: { type: 'BEAM', style: 'DRAGON', shape: 'wave', color: '#a560ff', color2: '#62e0ff', size: 9, speed: 540, particles: 11, impact: 'ring', width: 38, skill: { type: 'BEAM', scale: 2.5, impact: 'ring' }, shake: 0.6 },
    tentacool: { type: 'PROJECTILE', style: 'WATER', shape: 'bubble', color: '#0f73ff', color2: '#d4f0ff', size: 5, speed: 630, particles: 3, impact: 'splash' },
    tentacruel: { type: 'PROJECTILE', style: 'WATER', shape: 'drop', color: '#14c8fe', color2: '#d4f0ff', size: 6, speed: 600, particles: 7, impact: 'splash', count: 2 , skill: { type: 'AREA', scale: 2.2, impact: 'splash' } },
    ponyta: { type: 'PROJECTILE', style: 'FIRE', shape: 'flame', color: '#ff6252', color2: '#ffd25e', size: 4, speed: 480, particles: 3, impact: 'burst', count: 2 },
    rapidash: { type: 'BREATH', style: 'FIRE', shape: 'flame', color: '#ffb25c', color2: '#ffd25e', size: 7, speed: 510, particles: 7, impact: 'burst', width: 26 , skill: { type: 'EXPLOSION', scale: 2.2, impact: 'burst' } },
    slowpoke: { type: 'PROJECTILE', style: 'WATER', shape: 'bubble', color: '#70e0ff', color2: '#d4f0ff', size: 4, speed: 540, particles: 3, impact: 'splash', count: 2 },
    slowbro: { type: 'PROJECTILE', style: 'WATER', shape: 'wave', color: '#3dceff', color2: '#d4f0ff', size: 6, speed: 510, particles: 7, impact: 'splash' , skill: { type: 'AREA', scale: 2.2, impact: 'splash' } },
    magnemite: { type: 'CHAIN', style: 'ELECTRIC', shape: 'orb', color: '#fefc47', color2: '#ffffff', size: 4, speed: 690, particles: 3, impact: 'spark' },
    magneton: { type: 'CHAIN', style: 'ELECTRIC', shape: 'star', color: '#febe33', color2: '#ffffff', size: 7, speed: 570, particles: 7, impact: 'spark' , skill: { type: 'AREA', scale: 2.2, impact: 'spark' } },
    doduo: { type: 'SLASH', style: 'NORMAL', shape: 'orb', color: '#e7dcc0', color2: '#ffffff', size: 4, speed: 540, particles: 3, impact: 'thump' },
    dodrio: { type: 'SLASH', style: 'NORMAL', shape: 'orb', color: '#ece4cf', color2: '#ffffff', size: 7, speed: 720, particles: 7, impact: 'thump' },
    seel: { type: 'PROJECTILE', style: 'WATER', shape: 'drop', color: '#14c4fe', color2: '#d4f0ff', size: 4, speed: 600, particles: 3, impact: 'splash' },
    dewgong: { type: 'BEAM', style: 'WATER', shape: 'drop', color: '#60caff', color2: '#d4f0ff', size: 6, speed: 540, particles: 7, impact: 'splash', width: 26 , skill: { type: 'AREA', scale: 2.2, impact: 'splash' } },
    grimer: { type: 'PROJECTILE', style: 'POISON', shape: 'bubble', color: '#7e4fdd', color2: '#f0b8ff', size: 5, speed: 690, particles: 3, impact: 'poison' },
    muk: { type: 'PROJECTILE', style: 'POISON', shape: 'needle', color: '#d379e5', color2: '#f0b8ff', size: 6, speed: 480, particles: 7, impact: 'poison' },
    shellder: { type: 'PROJECTILE', style: 'WATER', shape: 'wave', color: '#518bff', color2: '#d4f0ff', size: 4, speed: 690, particles: 3, impact: 'splash' },
    cloyster: { type: 'EXPLOSION', style: 'WATER', shape: 'drop', color: '#146efe', color2: '#d4f0ff', size: 6, speed: 570, particles: 7, impact: 'splash', radius: 68 , skill: { type: 'EXPLOSION', scale: 2.6, impact: 'splash' } },
    drowzee: { type: 'EXPLOSION', style: 'PSYCHIC', shape: 'wave', color: '#d851fe', color2: '#ffc6f2', size: 5, speed: 690, particles: 3, impact: 'ring', radius: 40 },
    hypno: { type: 'AREA', style: 'PSYCHIC', shape: 'wave', color: '#b556ff', color2: '#ffc6f2', size: 6, speed: 720, particles: 7, impact: 'ring', radius: 68 , skill: { type: 'AREA', scale: 2.2, impact: 'ring' } },
    krabby: { type: 'SLASH', style: 'WATER', shape: 'bubble', color: '#2d5eff', color2: '#d4f0ff', size: 4, speed: 720, particles: 3, impact: 'splash' },
    kingler: { type: 'SLASH', style: 'WATER', shape: 'wave', color: '#4287ff', color2: '#d4f0ff', size: 6, speed: 600, particles: 7, impact: 'splash' , skill: { type: 'BEAM', scale: 2.2, impact: 'thump' } },
    voltorb: { type: 'AREA', style: 'ELECTRIC', shape: 'orb', color: '#ffe261', color2: '#ffffff', size: 4, speed: 540, particles: 3, impact: 'spark', radius: 40 },
    electrode: { type: 'AREA', style: 'ELECTRIC', shape: 'orb', color: '#ffdc42', color2: '#ffffff', size: 6, speed: 600, particles: 7, impact: 'spark', radius: 68 },
    exeggcute: { type: 'PROJECTILE', style: 'GRASS', shape: 'leaf', color: '#359b46', color2: '#d8ff8a', size: 5, speed: 510, particles: 3, impact: 'leaves' },
    exeggutor: { type: 'PROJECTILE', style: 'GRASS', shape: 'seed', color: '#38a34d', color2: '#d8ff8a', size: 6, speed: 630, particles: 7, impact: 'leaves' , skill: { type: 'EXPLOSION', scale: 2.2, impact: 'leaves' } },
    cubone: { type: 'PROJECTILE', style: 'GROUND', shape: 'rock', color: '#cf996c', color2: '#f4dca6', size: 5, speed: 690, particles: 3, impact: 'dust' },
    marowak: { type: 'PROJECTILE', style: 'GROUND', shape: 'rock', color: '#b5633a', color2: '#f4dca6', size: 6, speed: 630, particles: 7, impact: 'dust' },
    koffing: { type: 'PROJECTILE', style: 'POISON', shape: 'glob', color: '#c960e0', color2: '#f0b8ff', size: 4, speed: 660, particles: 3, impact: 'poison' },
    weezing: { type: 'PROJECTILE', style: 'POISON', shape: 'needle', color: '#d44fdd', color2: '#f0b8ff', size: 6, speed: 630, particles: 7, impact: 'poison' },
    horsea: { type: 'PROJECTILE', style: 'WATER', shape: 'wave', color: '#4271ff', color2: '#d4f0ff', size: 4, speed: 720, particles: 3, impact: 'splash' },
    seadra: { type: 'PROJECTILE', style: 'WATER', shape: 'wave', color: '#476fff', color2: '#d4f0ff', size: 6, speed: 660, particles: 7, impact: 'splash' },
    goldeen: { type: 'PROJECTILE', style: 'WATER', shape: 'bubble', color: '#0a8cfe', color2: '#d4f0ff', size: 4, speed: 600, particles: 3, impact: 'splash', count: 2 },
    seaking: { type: 'PROJECTILE', style: 'WATER', shape: 'bubble', color: '#4784ff', color2: '#d4f0ff', size: 7, speed: 600, particles: 7, impact: 'splash', count: 2 },
    staryu: { type: 'CHAIN', style: 'WATER', shape: 'wave', color: '#5bdbff', color2: '#d4f0ff', size: 4, speed: 570, particles: 3, impact: 'splash' },
    starmie: { type: 'CHAIN', style: 'WATER', shape: 'wave', color: '#23c1ff', color2: '#d4f0ff', size: 6, speed: 540, particles: 7, impact: 'splash' , skill: { type: 'AREA', scale: 2.6, impact: 'star' } },
    golduck: { type: 'ORBIT', style: 'WATER', shape: 'drop', color: '#14a1fe', color2: '#d4f0ff', size: 7, speed: 480, particles: 7, impact: 'splash' },
    primeape: { type: 'SLASH', style: 'FIGHTING', shape: 'fang', color: '#ff732d', color2: '#ffe6cc', size: 7, speed: 660, particles: 7, impact: 'thump' },
    growlithe: { type: 'PROJECTILE', style: 'FIRE', shape: 'orb', color: '#feaf29', color2: '#ffd25e', size: 5, speed: 510, particles: 5, impact: 'burst' },
    arcanine: { type: 'BREATH', style: 'FIRE', shape: 'flame', color: '#ff572f', color2: '#ffd25e', size: 8, speed: 690, particles: 9, impact: 'burst', width: 32, skill: { type: 'EXPLOSION', scale: 2.4, impact: 'burst' } },
    rhyhorn: { type: 'AREA', style: 'GROUND', shape: 'rock', color: '#b96d3b', color2: '#f4dca6', size: 5, speed: 630, particles: 5, impact: 'dust', radius: 54 },
    rhydon: { type: 'EXPLOSION', style: 'GROUND', shape: 'sand', color: '#c48b4a', color2: '#f4dca6', size: 7, speed: 720, particles: 9, impact: 'dust', radius: 82, skill: { type: 'BEAM', scale: 2.3, impact: 'dust' } },
    omanyte: { type: 'PROJECTILE', style: 'ROCK', shape: 'sand', color: '#b58c73', color2: '#eadcc0', size: 6, speed: 510, particles: 5, impact: 'shards' },
    omastar: { type: 'PROJECTILE', style: 'ROCK', shape: 'sand', color: '#bc9e81', color2: '#eadcc0', size: 8, speed: 690, particles: 9, impact: 'shards', skill: { type: 'BEAM', scale: 2.2, impact: 'shards' } },
    kabuto: { type: 'PROJECTILE', style: 'ROCK', shape: 'rock', color: '#b79277', color2: '#eadcc0', size: 6, speed: 720, particles: 5, impact: 'shards' },
    kabutops: { type: 'PROJECTILE', style: 'ROCK', shape: 'rock', color: '#b78c77', color2: '#eadcc0', size: 7, speed: 600, particles: 9, impact: 'shards', skill: { type: 'BEAM', scale: 2.2, impact: 'shards' } },
    magikarp: { type: 'PROJECTILE', style: 'WATER', shape: 'drop', color: '#1975ff', color2: '#d4f0ff', size: 5, speed: 720, particles: 3, impact: 'splash' },
    gyarados: { type: 'EXPLOSION', style: 'WATER', shape: 'bubble', color: '#3795ff', color2: '#d4f0ff', size: 7, speed: 540, particles: 9, impact: 'splash', radius: 82, skill: { type: 'EXPLOSION', scale: 2.3, impact: 'splash' } },
    eevee: { type: 'SLASH', style: 'NORMAL', shape: 'orb', color: '#f3ebe1', color2: '#ffffff', size: 6, speed: 480, particles: 5, impact: 'thump' },
    vaporeon: { type: 'PROJECTILE', style: 'WATER', shape: 'wave', color: '#5694ff', color2: '#d4f0ff', size: 6, speed: 690, particles: 7, impact: 'splash' },
    jolteon: { type: 'CHAIN', style: 'ELECTRIC', shape: 'star', color: '#ffae23', color2: '#ffffff', size: 6, speed: 540, particles: 7, impact: 'spark' },
    flareon: { type: 'BREATH', style: 'FIRE', shape: 'orb', color: '#ffbf4d', color2: '#ffd25e', size: 7, speed: 690, particles: 7, impact: 'burst', width: 26 },
    farfetchd: { type: 'PROJECTILE', style: 'NORMAL', shape: 'claw', color: '#eeefd6', color2: '#ffffff', size: 5, speed: 600, particles: 5, impact: 'thump' },
    lickitung: { type: 'AREA', style: 'NORMAL', shape: 'star', color: '#f3e9e1', color2: '#ffffff', size: 5, speed: 570, particles: 5, impact: 'thump', radius: 54 },
    tangela: { type: 'PROJECTILE', style: 'GRASS', shape: 'leaf', color: '#3cae54', color2: '#d8ff8a', size: 6, speed: 510, particles: 5, impact: 'leaves' },
    porygon: { type: 'PROJECTILE', style: 'NORMAL', shape: 'claw', color: '#f3ebe1', color2: '#ffffff', size: 5, speed: 630, particles: 5, impact: 'thump' },
    ditto: { type: 'PROJECTILE', style: 'NORMAL', shape: 'orb', color: '#f3f3e1', color2: '#ffffff', size: 6, speed: 690, particles: 5, impact: 'thump' },
    onix: { type: 'AREA', style: 'ROCK', shape: 'sand', color: '#966d50', color2: '#eadcc0', size: 7, speed: 540, particles: 7, impact: 'shards', radius: 68 , skill: { type: 'EXPLOSION', scale: 2.2, impact: 'shards' } },
    hitmonlee: { type: 'SLASH', style: 'FIGHTING', shape: 'chop', color: '#fe776a', color2: '#ffe6cc', size: 6, speed: 630, particles: 7, impact: 'thump' , skill: { type: 'BEAM', scale: 2.2, impact: 'thump' } },
    hitmonchan: { type: 'PROJECTILE', style: 'FIGHTING', shape: 'fang', color: '#ffa342', color2: '#ffe6cc', size: 6, speed: 510, particles: 7, impact: 'thump' , skill: { type: 'BEAM', scale: 2.2, impact: 'thump' } },
    chansey: { type: 'ORBIT', style: 'NORMAL', shape: 'claw', color: '#f3f2e1', color2: '#ffffff', size: 7, speed: 480, particles: 7, impact: 'thump' , skill: { type: 'AREA', scale: 2.2, impact: 'star' } },
    kangaskhan: { type: 'PROJECTILE', style: 'NORMAL', shape: 'orb', color: '#f3ece1', color2: '#ffffff', size: 6, speed: 720, particles: 7, impact: 'thump' },
    mr_mime: { type: 'ORBIT', style: 'PSYCHIC', shape: 'star', color: '#f251fe', color2: '#ffc6f2', size: 7, speed: 660, particles: 7, impact: 'ring' , skill: { type: 'AREA', scale: 2.2, impact: 'ring' } },
    jynx: { type: 'AREA', style: 'ICE', shape: 'crescent', color: '#89c7ff', color2: '#ffffff', size: 7, speed: 630, particles: 7, impact: 'shards', radius: 68 , skill: { type: 'AREA', scale: 2.2, impact: 'shards' } },
    electabuzz: { type: 'CHAIN', style: 'ELECTRIC', shape: 'orb', color: '#fff705', color2: '#ffffff', size: 6, speed: 510, particles: 7, impact: 'spark' , skill: { type: 'AREA', scale: 2.2, impact: 'spark' } },
    magmar: { type: 'PROJECTILE', style: 'FIRE', shape: 'flame', color: '#fe7148', color2: '#ffd25e', size: 6, speed: 570, particles: 7, impact: 'burst' , skill: { type: 'AREA', scale: 2.2, impact: 'burst' } },
    pinsir: { type: 'SLASH', style: 'BUG', shape: 'silk', color: '#55a524', color2: '#f4ff9a', size: 7, speed: 690, particles: 7, impact: 'spore' , skill: { type: 'BEAM', scale: 2.2, impact: 'thump' } },
    tauros: { type: 'PROJECTILE', style: 'NORMAL', shape: 'orb', color: '#f3e9e1', color2: '#ffffff', size: 7, speed: 480, particles: 7, impact: 'thump' },
    scyther: { type: 'PROJECTILE', style: 'BUG', shape: 'silk', color: '#60be2a', color2: '#f4ff9a', size: 7, speed: 660, particles: 9, impact: 'spore', count: 2, skill: { type: 'BEAM', scale: 2.4, impact: 'spore' } },
    lapras: { type: 'BEAM', style: 'WATER', shape: 'wave', color: '#658eff', color2: '#d4f0ff', size: 7, speed: 690, particles: 9, impact: 'splash', width: 32, skill: { type: 'AREA', scale: 2.2, impact: 'splash' } },
    aerodactyl: { type: 'PROJECTILE', style: 'ROCK', shape: 'sand', color: '#9a8d51', color2: '#eadcc0', size: 7, speed: 570, particles: 9, impact: 'shards', skill: { type: 'BEAM', scale: 2.3, impact: 'shards' } },
    snorlax: { type: 'EXPLOSION', style: 'NORMAL', shape: 'claw', color: '#f3e8e1', color2: '#ffffff', size: 7, speed: 690, particles: 9, impact: 'thump', radius: 82, skill: { type: 'BEAM', scale: 2.3, impact: 'thump' } },
    articuno: { type: 'PROJECTILE', style: 'ICE', shape: 'crescent', color: '#84d9ff', color2: '#ffffff', size: 9, speed: 480, particles: 11, impact: 'shards', skill: { type: 'BEAM', scale: 2.4, impact: 'shards' }, shake: 0.6 },
    zapdos: { type: 'CHAIN', style: 'ELECTRIC', shape: 'orb', color: '#fec53d', color2: '#ffffff', size: 8, speed: 690, particles: 11, impact: 'spark', skill: { type: 'AREA', scale: 2.4, impact: 'spark' }, shake: 0.6 },
    moltres: { type: 'BREATH', style: 'FIRE', shape: 'flame', color: '#ffa643', color2: '#ffd25e', size: 8, speed: 480, particles: 11, impact: 'burst', width: 38, skill: { type: 'EXPLOSION', scale: 2.4, impact: 'burst' }, shake: 0.6 },
    mewtwo: { type: 'SLASH', style: 'PSYCHIC', shape: 'wave', color: '#f147ff', color2: '#ffc6f2', size: 8, speed: 630, particles: 11, impact: 'ring', skill: { type: 'BEAM', scale: 2.4, impact: 'ring' }, shake: 0.6 },

    /* ---------- 특수 등급 ---------- */
    politoed: { type: 'AREA', style: 'WATER', shape: 'drop', color: '#3fd07a', color2: '#e6fff0', size: 8, speed: 600, particles: 10, radius: 90, impact: 'splash', skill: { type: 'AREA', scale: 2.6, impact: 'splash' } },
    mew: { type: 'ORBIT', style: 'PSYCHIC', shape: 'star', color: '#ffb6e6', color2: '#ffffff', size: 8, speed: 620, particles: 10, impact: 'star', skill: { type: 'AREA', scale: 2.4, impact: 'star' } },
    mewtwo_transcend: { type: 'BEAM', style: 'PSYCHIC', shape: 'wave', color: '#ffd23f', color2: '#e6c8ff', size: 11, speed: 760, particles: 18, width: 40, impact: 'ring', shake: 1.0, skill: { type: 'EXPLOSION', scale: 3.4, impact: 'ring' } },
    charizard_transcend: { type: 'BREATH', style: 'FIRE', shape: 'flame', color: '#ffd23f', color2: '#fff4b0', size: 11, speed: 760, particles: 18, width: 56, impact: 'burst', shake: 1.0, skill: { type: 'EXPLOSION', scale: 3.4, impact: 'burst' } }
  };

  var DEFAULT = { type: 'PROJECTILE', shape: 'orb', size: 5, speed: 560, trail: 0, particles: 3,
                  count: 1, curve: 0, arc: 0, spin: 0, width: 3, radius: 0, shake: 0 };

  var cache = {};

  /* 개체 정의 → 최종 설정. 타입 기본값 + 개체 설정을 합친다(한 번만 만들고 재사용). */
  function resolve(def) {
    if (!def) return null;
    var key = def.id;
    if (cache[key]) return cache[key];
    var own = FX[def.id] || {};
    var styleKey = own.style || (def.types && def.types[0]) || 'NORMAL';
    var st = STYLES[styleKey] || STYLES.NORMAL;
    var out = {};
    var k;
    for (k in DEFAULT) out[k] = DEFAULT[k];
    out.style = styleKey;
    out.color = st.color; out.color2 = st.color2; out.impact = st.impact; out.trailKind = st.trailKind;
    for (k in own) if (Object.prototype.hasOwnProperty.call(own, k)) out[k] = own[k];
    out.tierIndex = RPD.tierPower ? RPD.tierPower(def.tier) : Math.max(0, RPD.TIER_ORDER.indexOf(def.tier));
    cache[key] = out;
    return out;
  }

  RPD.AttackFxData = {
    styles: STYLES,
    list: FX,
    TYPES: ['PROJECTILE', 'BEAM', 'BREATH', 'SLASH', 'EXPLOSION', 'CHAIN', 'AREA', 'ORBIT'],
    resolve: resolve,
    clearCache: function () { cache = {}; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
