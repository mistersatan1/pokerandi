/* Utils.js — 수학 / 랜덤 / 포맷 유틸. 게임 규칙은 여기 들어오지 않는다. */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  var U = {};

  U.clamp = function (v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); };

  U.lerp = function (a, b, t) { return a + (b - a) * t; };

  U.dist = function (ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // 제곱 거리. 사거리 비교처럼 실제 거리값이 필요 없을 때 sqrt 를 피한다.
  U.dist2 = function (ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    return dx * dx + dy * dy;
  };

  U.randInt = function (min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
  };

  U.randRange = function (min, max) {
    return min + Math.random() * (max - min);
  };

  U.pick = function (arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  };

  U.chance = function (p) { return Math.random() < p; };

  // { key: weight } 또는 [{ id, weight }] 에서 가중 추첨
  U.weightedPick = function (entries) {
    var list = Array.isArray(entries)
      ? entries
      : Object.keys(entries).map(function (k) { return { id: k, weight: entries[k] }; });

    var total = 0, i;
    for (i = 0; i < list.length; i++) total += list[i].weight;
    if (total <= 0) return null;

    var roll = Math.random() * total;
    for (i = 0; i < list.length; i++) {
      roll -= list[i].weight;
      if (roll <= 0) return list[i].id;
    }
    return list[list.length - 1].id;
  };

  U.formatNumber = function (n) {
    n = Math.floor(n);
    if (n < 10000) return String(n);
    if (n < 1000000) return (n / 1000).toFixed(n < 100000 ? 1 : 0) + 'K';
    return (n / 1000000).toFixed(1) + 'M';
  };

  U.formatTime = function (seconds) {
    var s = Math.max(0, Math.floor(seconds));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  };

  // 짧은 고유 id. 슬롯/유닛/적 인스턴스 식별용.
  var idCounter = 0;
  U.uid = function (prefix) {
    idCounter += 1;
    return (prefix || 'id') + '_' + idCounter;
  };

  U.resetUid = function () { idCounter = 0; };

  RPD.Utils = U;
})(typeof window !== 'undefined' ? window : globalThis);
