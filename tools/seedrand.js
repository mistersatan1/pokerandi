/* seedrand.js — 검사용 고정 난수(세션 72).
 *
 * 왜: redesigncheck "조합 보정이 필요한 재료를 더 잘 나오게 한다"(약 5%) · uicheck "흔함은 어느 라운드에도 50% 밑으로…"(약 2.5%)가
 *     난수 때문에 가끔 떨어졌다(40번 중 3번 — 세션 72 측정). 같은 코드가 어떤 때는 통과하고 어떤 때는 실패하면 "진짜 고장"과 "운"을 구분할 수 없다.
 *
 * 어떻게: 검사가 도는 vm 컨텍스트 안의 Math.random 을 mulberry32 로 바꾼다. 검사 하나가 시작할 때마다 그 검사 이름으로 시드를 다시 잡는다
 *         → 검사 순서를 바꾸거나 앞 검사가 난수를 몇 번 썼든 이 검사의 결과는 언제나 같다(재현 가능).
 *         게임 코드는 안 건드린다(Math.random 을 그대로 부르고, 검사 환경에서만 결정적이다).
 *
 * 주의: 고정 시드는 "표본 오차로 가끔 실패"를 없애지만, 시드가 우연히 통과하는 값이면 진짜 변화를 가릴 수 있다.
 *       그래서 판정이 시드와 무관하게 안정적인지는 표본을 크게 해서(여러 시드로 재 본 표를 VERSION.md 에 남겼다) 따로 확인한다.
 */
'use strict';
const vm = require('vm');

/* 문자열 → 32비트 시드(FNV-1a) */
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/* sandbox(vm 컨텍스트) 안의 Math.random 을 고정 난수로 — 이후 reseed(label) 로 다시 잡는다 */
function install(sandbox, baseSeed) {
  // CHECK_SEED=숫자 로 시드를 바꿔 본다 — "이 고정 시드가 우연히 통과하는 값은 아닌가"를 여러 시드로 재 보는 용도(검사 도구에서만 읽는다)
  const envSeed = process.env.CHECK_SEED ? Number(process.env.CHECK_SEED) : null;
  const base = envSeed != null && !isNaN(envSeed) ? envSeed : (baseSeed == null ? 0x5eed : baseSeed);
  vm.runInContext(`(function () {
    var s = 0;
    globalThis.__seedRand = function (seed) { s = seed >>> 0; };
    Math.random = function () {   // mulberry32
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    globalThis.__seedRand(0x5eed);
  })()`, sandbox);
  return {
    reseed(label, extra) { sandbox.__seedRand((hash(String(label)) ^ base ^ ((extra || 0) * 0x9e3779b1)) >>> 0); },
    seed(n) { sandbox.__seedRand(n >>> 0); }
  };
}

module.exports = { install, hash };
