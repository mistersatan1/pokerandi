/* titles.js — 칭호와 시작 보너스.
 *
 * 클리어 횟수(모든 모드 합계)에 따라 칭호가 오르고, 오른 칭호의 보너스는 **모두 쌓인다**.
 * 5회를 넘기면 1회·3회·5회 보너스를 전부 받는다.
 *
 * ┌─ 고치는 법 ────────────────────────────────────────────────────┐
 * │ clears: 필요한 클리어 횟수 · name: 칭호 · bonus: 판 시작 때 주는 것  │
 * │   gold: 골드 · tickets: 소환권 · shards: 조각 · unit: 등급(한 마리) │
 * │ desc 는 화면에 그대로 나온다 — bonus 를 바꾸면 같이 고친다.          │
 * └──────────────────────────────────────────────────────────────┘
 *
 * 난이도 칭호는 보너스 없이 이름만 준다 — 자랑용이다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  var TITLES = [
    { clears: 1,  name: '새내기 트레이너',   bonus: { gold: 30 },          desc: '시작 골드 +30' },
    { clears: 3,  name: '성장하는 트레이너', bonus: { tickets: 1 },        desc: '시작 소환권 +1' },
    { clears: 5,  name: '베테랑 트레이너',   bonus: { shards: 15 },        desc: '시작 조각 +15' },
    { clears: 10, name: '엘리트 트레이너',   bonus: { gold: 50, tickets: 1 }, desc: '시작 골드 +50 · 소환권 +1' },
    { clears: 20, name: '챔피언',            bonus: { unit: 'T3' },        desc: '시작할 때 특별함 1마리' },
    { clears: 50, name: '포켓몬 마스터',     bonus: { tickets: 2, shards: 30 }, desc: '시작 소환권 +2 · 조각 +30' }
  ];

  // 난이도 첫 클리어 칭호 — 일반 모드 한정
  var SPECIAL = {
    HARD: { name: '도전자', desc: '일반 · 어려움 첫 클리어' },
    HELL: { name: '지옥에서 돌아온 트레이너', desc: '일반 · 지옥 첫 클리어' }
  };

  RPD.TitleData = { list: TITLES, special: SPECIAL };
})(typeof window !== 'undefined' ? window : globalThis);
