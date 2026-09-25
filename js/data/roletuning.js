/* roletuning.js — 역할별 보정 (세션 33).
 *
 * 80판 실전 측정에서 같은 등급 중앙 대비 초당 피해가 연쇄 2.9~4.4배 · 광역 1.5~2.5배였고,
 * 단일은 1.0 안팎, 전설 보스킬러는 0.30 이었다(VERSION.md "포켓몬 전체 밸런스 점검").
 * 한 라운드에 13~26마리가 몰려오는 구조라 여러 마리를 때리는 쪽이 몫을 다 가져간다.
 *
 *   연쇄 · 광역   — 피해를 살짝 줄인다
 *   단일 · 보스킬러 — 피해와 공격속도를 둘 다 올린다
 *   버퍼          — 주변 공격력 오라를 키운다(버프 종류는 js/data/auras.js)
 *
 * attack 은 기본 공격과 스킬 모두에 실린다(스킬 피해가 실효 공격력을 쓰므로).
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;
  var T = {
    AOE_DPS:     { attack: 0.85 },
    CHAIN_DPS:   { attack: 0.8 },
    SINGLE_DPS:  { attack: 1.2, attackSpeed: 1.15 },
    BOSS_KILLER: { attack: 1.35, attackSpeed: 1.2 },
    BUFFER:      { aura: 1.4 }
  };
  RPD.RoleTuning = {
    table: T,
    attack: function (role) { return (T[role] && T[role].attack) || 1; },
    attackSpeed: function (role) { return (T[role] && T[role].attackSpeed) || 1; },
    aura: function (role) { return (T[role] && T[role].aura) || 1; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
