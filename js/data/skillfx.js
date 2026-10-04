/* skillfx.js — 스킬마다 고유 연출(세션 94). 그리는 쪽은 js/render/SkillFx.js(모티프 함수).
 *
 * m(모티프): rain 낙하 · bolt 번개 · quake 균열 · wave 물결 · beam 광선 · slash 참격 · punch 주먹 · orb 구체 · squeeze 압축 ·
 *            drill 드릴 · needles 바늘/별 · pool 지대(지속 시간 동안) · aura 아군 오라 · nova 화염 · blizzard 눈보라 · wisp 도깨비불 ·
 *            petals 꽃잎 · combo(parts 를 겹침)
 * color 주색 · color2 밝은 심 · 나머지는 모티프별(shape · per · glyph · style · count · width · through · rainbow · bits · at · all …)
 * shake 화면 흔들림(효과 "보통"에서만) · cutin 이름 띠(불멸 · 초월은 저절로)
 * 판정과는 무관하다 — 이 파일을 지워도 게임 결과는 같다(스킬은 원래 평타 확대 연출로 돌아간다).
 * 검사: bootsmoke "스킬 연출(세션 94)" — skills.js 의 모든 스킬에 줄이 있어야 한다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  RPD.SkillFxData = {
    /* ---------- 희귀함 ---------- */
    sleepPowder:  { m: 'wave', color: '#9be37a', color2: '#eaffd2', glyph: 'Z', glyphColor: '#d8ffe0', extra: 8 },
    twinSting:    { m: 'needles', color: '#c77dff', color2: '#f5d6ff', count: 2, maxTargets: 1, curve: 20 },
    skyRush:      { m: 'wave', color: '#cfe8ff', color2: '#ffffff', glyph: 'wind', extra: 10 },
    voltBurst:    { m: 'bolt', color: '#ffd92e', color2: '#fffbe0' },
    earthquake:   { m: 'quake', color: '#c79a52', color2: '#f4dca6', cracks: 8, shake: 0.8 },
    moonBlessing: { m: 'aura', color: '#c8b6ff', color2: '#fff3c4', glyph: 'moon' },
    toxicGarden:  { m: 'combo', color: '#b25ce0', color2: '#ffb8f0', parts: [{ m: 'pool' }, { m: 'petals', color: '#e07ad0' }] },
    lullaby:      { m: 'wave', color: '#ff9fd6', color2: '#ffe3f4', glyph: '♪', glyphColor: '#ffd1ec', extra: 8 },

    /* ---------- 1세대 확장 · 희귀함 ---------- */
    dynamicPunch: { m: 'punch', color: '#ff6a3d', color2: '#fff0c4', size: 40, shake: 0.6 },
    psychicBlast: { m: 'squeeze', color: '#c86bff', color2: '#ffd1fb', size: 52 },
    crossChop:    { m: 'slash', color: '#ff9a5c', color2: '#fff4e0', style: 'x', len: 52 },
    sludgeWave:   { m: 'pool', color: '#7d5a9e', color2: '#c6a6e6' },
    rockSlide:    { m: 'rain', color: '#a8865c', color2: '#e6d3b0', shape: 'rock', per: 3, size: 10, shake: 0.4 },
    shadowBall:   { m: 'orb', color: '#4a2f8e', color2: '#c9b2ff', size: 16, dark: true },
    flareBlitz:   { m: 'nova', color: '#ff6a1f', color2: '#ffe08a', style: 'dash' },
    hornDrill:    { m: 'drill', color: '#d9cfb8', color2: '#ffffff' },
    spikeCannon:  { m: 'needles', color: '#d8d29a', color2: '#ffffff', count: 5, maxTargets: 4 },
    slashCut:     { m: 'slash', color: '#e8f0ff', color2: '#ffffff', style: 'big', len: 70 },
    hyperBeam:    { m: 'beam', color: '#ffb84d', color2: '#fffbe6', width: 26, through: true, shake: 0.7 },
    furyCutter:   { m: 'slash', color: '#9ccf2e', color2: '#f4ffc4', style: 'multi', count: 4, len: 38 },
    iceBeam:      { m: 'beam', color: '#7fe3ff', color2: '#ffffff', width: 16, bits: 'crystal' },
    ancientPower: { m: 'aura', color: '#c9a46a', color2: '#ffe9b8', glyph: 'rocks' },
    bodySlam:     { m: 'combo', color: '#f0e6d0', color2: '#ffffff', parts: [{ m: 'quake', at: 'target', cracks: 5 }, { m: 'punch', size: 34 }], shake: 0.5 },
    rainDance:    { m: 'rain', color: '#3d9bff', color2: '#d4f0ff', shape: 'drop', per: 3, size: 6, slant: -30, maxTargets: 12 },
    ancestorGlow: { m: 'aura', color: '#ffd36a', color2: '#fff8d8', glyph: 'rays' },

    /* ---------- 초월 ---------- */
    psychoBreakX: { m: 'combo', color: '#ff4fd8', color2: '#ffe0f8', cutin: true, shake: 1,
                    parts: [{ m: 'squeeze', all: true, shock: true, size: 50 }, { m: 'wave', glyph: 'spiral', extra: 10 }] },
    blastBurnX:   { m: 'combo', color: '#ff3d14', color2: '#ffd36a', cutin: true, shake: 1,
                    parts: [{ m: 'nova', size: 1 }, { m: 'rain', shape: 'ember', per: 2, size: 8, maxTargets: 12 }] },

    /* ---------- 전설 · 불멸 ---------- */
    toxicTentacle: { m: 'pool', color: '#5a6bff', color2: '#c4b0ff', bits: 'ripple' },
    auroraBeam:   { m: 'beam', color: '#9fe8ff', color2: '#ffffff', width: 22, rainbow: true, through: true },
    eggBomb:      { m: 'orb', color: '#fff1d6', color2: '#ffffff', size: 13, arc: 70 },
    crabhammer:   { m: 'punch', color: '#ff7a5c', color2: '#d4f0ff', style: 'claw', size: 34 },
    hypnosis:     { m: 'wave', color: '#a96bff', color2: '#ffd1fb', glyph: 'spiral', extra: 6 },
    slackWave:    { m: 'wave', color: '#ff9fc8', color2: '#ffe4f0', glyph: '…', glyphColor: '#ffe4f0', extra: 6 },
    dragonTail:   { m: 'slash', color: '#6f5bff', color2: '#b9f3ff', style: 'tail' },
    zapCannon:    { m: 'orb', color: '#ffe14d', color2: '#ffffff', size: 18, bolts: true, shake: 0.6 },
    flameCharge:  { m: 'nova', color: '#ff7a2f', color2: '#ffd25e', style: 'dash' },
    highJumpKick: { m: 'punch', color: '#ff6a3d', color2: '#fff0c4', style: 'kick', size: 38, shake: 0.5 },
    cometPunch:   { m: 'punch', color: '#ffb27a', color2: '#fff4e0', count: 4, size: 22 },
    barrier:      { m: 'aura', color: '#8fd4ff', color2: '#e8f8ff', glyph: 'hex' },
    lovelyKiss:   { m: 'wave', color: '#ff5fa2', color2: '#ffd6e8', glyph: '♥', glyphColor: '#ff7ab6', extra: 8 },
    thunderPunch: { m: 'bolt', color: '#ffe14d', color2: '#ffffff', fist: true },
    flamethrower: { m: 'combo', color: '#ff7a2f', color2: '#ffd25e', parts: [{ m: 'beam', width: 20, bits: 'ember' }, { m: 'pool', bits: 'flame' }] },
    viceGrip:     { m: 'punch', color: '#c9a46a', color2: '#fff4dc', style: 'claw', size: 30 },
    rockTomb:     { m: 'rain', color: '#8f7052', color2: '#dcc4a0', shape: 'rock', per: 4, size: 12, shake: 0.5 },
    softBoiled:   { m: 'aura', color: '#ffb6d9', color2: '#fff4fa', glyph: 'egg' },
    willOWisp:    { m: 'wisp', color: '#6b5bff', color2: '#d8ccff' },
    icicleCrash:  { m: 'rain', color: '#7fe3ff', color2: '#ffffff', shape: 'ice', per: 2, size: 9 },
    swiftStar:    { m: 'needles', color: '#ffe066', color2: '#ffffff', shape: 'star', count: 3, maxTargets: 8, curve: 120 },
    petalStorm:   { m: 'petals', color: '#ff8fcf', color2: '#fff0fa' },
    inferno:      { m: 'nova', color: '#ff4a1f', color2: '#ffd36a', style: 'kanji', at: 'target', shake: 0.6 },
    hydroCannon:  { m: 'beam', color: '#2f86ff', color2: '#d4f0ff', width: 24, bits: 'bubble', shake: 0.5 },
    queenGuard:   { m: 'wave', color: '#b25ce0', color2: '#f0c8ff', glyph: 'hex', extra: 0 },
    kingBreaker:  { m: 'punch', color: '#ffd23f', color2: '#fffbe0', style: 'crown', size: 44, shake: 0.8 },
    dragonRush:   { m: 'combo', color: '#6f5bff', color2: '#ff8a5c', shake: 0.7,
                    parts: [{ m: 'slash', style: 'multi', count: 3, len: 50 }, { m: 'nova', at: 'target', size: 1 }] },
    blizzard:     { m: 'blizzard', color: '#9fe6ff', color2: '#ffffff' },
    thunderStorm: { m: 'bolt', color: '#fff07a', color2: '#ffffff', per: 2, dim: true, shake: 0.7 },
    skyFire:      { m: 'combo', color: '#ff7a2f', color2: '#ffe08a', shake: 0.6,
                    parts: [{ m: 'nova', style: 'wings' }, { m: 'rain', shape: 'ember', per: 1, size: 7, maxTargets: 10 }] },
    psystrike:    { m: 'combo', color: '#b05cff', color2: '#ffffff', shake: 0.8,
                    parts: [{ m: 'squeeze', size: 60, shock: true }, { m: 'beam', width: 14 }] }
  };
})(typeof window !== 'undefined' ? window : globalThis);
