/* auras.js — 버퍼의 패시브 버프.
 *
 * 특별함 이상 버퍼(역할 BUFFER)는 원래 "주변 아군 공격력 +%"만 있었다.
 * 여기에 버퍼마다 다른 결의 패시브를 하나씩 더 준다 — 누구 옆에 두느냐가 달라진다.
 *
 * ┌─ 고치는 법 ─────────────────────────────────────────────────┐
 * │ 포켓몬 id 를 키로 한 줄. 숫자만 바꾸면 된다. desc 도 같이 고친다. │
 * │ 효과는 셋 중 여럿을 섞어도 된다:                                │
 * │   attackSpeed  주변 아군 공격속도 +비율 (0.1 = +10%)             │
 * │   critRate     주변 아군 치명타율 +비율                          │
 * │   critDamage   주변 아군 치명타 피해 +배수 (0.3 = +30%)          │
 * │   range        주변 아군 사거리 +비율   cooldown 스킬 쿨다운 -비율 │
 * │   armorPierce  방어 무시 비율          bossDamage 보스 피해 +비율  │
 * └─────────────────────────────────────────────────────────────┘
 *
 * "주변" 은 공격력 오라와 같다 — 칸 격자에서 상하좌우·대각선으로 맞닿은 칸.
 * 같은 종류가 여러 버퍼에서 겹치면 더해지되 상한(CAP)에서 멈춘다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  /* 세션 33: 버퍼마다 결이 다르게 — 무엇을 주느냐로 "누구 옆에 두느냐"가 갈린다.
   *   사거리 range · 스킬 쿨다운 cooldown · 방어 무시 armorPierce · 보스 피해 bossDamage 를 새로 넣었다.
   *   공격력 오라도 역할 보정으로 ×1.4 (roletuning.js). 예전엔 5종이 공속·치명 두 축만 나눠 가졌다. */
  var AURAS = {
    clefairy:   { icon: '🌙', name: '달의가루', desc: '주변 아군 사거리 +10%.', range: 0.10 },
    jigglypuff: { icon: '🎤', name: '노래하기', desc: '주변 아군 스킬 쿨다운 -12%.', cooldown: 0.12 },
    psyduck:    { icon: '💫', name: '두통', desc: '주변 아군 방어 무시 +15%.', armorPierce: 0.15 },
    golduck:    { icon: '🌀', name: '정신집중', desc: '주변 아군 치명타율 +10% · 방어 무시 +20%.', critRate: 0.10, armorPierce: 0.20 },
    chansey:    { icon: '🥚', name: '치유의파동', desc: '주변 아군 공격속도 +15% · 스킬 쿨다운 -10%.', attackSpeed: 0.15, cooldown: 0.10 },
    mr_mime:    { icon: '🪞', name: '리플렉터', desc: '주변 아군 치명타 피해 +40% · 사거리 +10%.', critDamage: 0.40, range: 0.10 },
    wigglytuff: { icon: '🎶', name: '응원가', desc: '주변 아군 공격속도 +12% · 치명타 피해 +40%.', attackSpeed: 0.12, critDamage: 0.40 },
    clefable:   { icon: '✨', name: '달빛', desc: '주변 아군 보스 피해 +30% · 치명타율 +12% · 사거리 +10%.', bossDamage: 0.30, critRate: 0.12, range: 0.10 },
    mew:        { icon: '🧬', name: '근원의빛', desc: '주변 아군 공격속도 +15% · 스킬 쿨다운 -15% · 보스 피해 +25%.', attackSpeed: 0.15, cooldown: 0.15, bossDamage: 0.25 }
  };

  var CAP = { attackSpeed: 0.40, critRate: 0.30, critDamage: 1.0, range: 0.25, cooldown: 0.30, armorPierce: 0.50, bossDamage: 0.60 };

  RPD.AuraData = {
    list: AURAS,
    cap: CAP,
    get: function (id) { return AURAS[id] || null; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
