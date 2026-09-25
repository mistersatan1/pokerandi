/* tiers.js — 라운드별 소환 확률과 보정 규칙.
 *
 * v1 은 전 구간 고정 확률이었다. 그래서 1라운드나 40라운드나 같은 기대감이었다.
 * v2 는 라운드가 올라갈 때마다 새 등급이 열린다. 소환을 누르는 이유가
 * "더 센 게 나왔으면"에서 "이번엔 안흔함이 나올까"로 바뀐다.
 *
 * 확률은 전부 여기 데이터로 둔다. 로직에는 숫자를 박지 않는다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  var SummonTable = {
    /* 구간별 등급 가중치. until 은 "이 라운드까지".
     * 합이 100이 아니어도 된다 — 가중치로 정규화된다. */
    bands: [
      /* 경계는 해금 라운드 바로 앞이다(9/17/25/33 해금 → 8/16/24/32).
       * 밴드와 해금이 어긋나면 "열렸다는데 안 나온다"가 된다 — 검사가 이걸 본다. */
      /* 소환으로 나오는 것은 특별함(T3)까지다.
       * 희귀함·전설은 조합식과 조각 상점으로만 얻는다 —
       * "뽑기로 전설이 나온다"면 조합식을 향해 계획을 세울 이유가 사라진다. */
      { until: 8,        weights: { T1: 100 } },
      { until: 16,       weights: { T1: 72, T2: 28 } },
      { until: 24,       weights: { T1: 52, T2: 34, T3: 14 } },
      /* 흔함은 어느 라운드에도 50% 밑으로 내려가지 않는다.
       * 안흔함이 "같은 흔함 2마리"라 흔함은 끝까지 재료로 쓰인다 — 후반에 흔함이 말라 버리면
       * 안흔함을 새로 못 만들어 특별함·희귀함 조합이 줄줄이 막혔다. */
      { until: 32,       weights: { T1: 50, T2: 28, T3: 22 } },
      { until: Infinity, weights: { T1: 50, T2: 24, T3: 26 } }
    ],

    /* 해금 직후 보정 — 새 등급이 열린 티를 확실히 낸다.
     * 해금 라운드부터 N라운드 동안 그 등급 가중치에 배수를 건다. */
    unlockBoostRounds: 3,
    unlockBoostMul: 1.5,

    /* 조합 보정 — 이번 리디자인의 핵심 장치.
     * "리자드가 나올 때까지 뽑아보자"가 좌절로 끝나지 않게 한다.
     * 완성까지 재료 하나만 남은 레시피의 그 재료에 가중치를 얹는다.
     * 플레이어에게 수치를 노출하지 않는다 — 보이는 순간 확률 계산 게임이 된다. */
    recipeBoostMul: 1.4,
    recipeBoostMaxMissing: 1,   // 재료가 이만큼만 부족할 때 적용

    /* 중복 보정 — 같은 게 계속 나오는 좌절 완화.
     * 이미 이 수 이상 보유한 종은 가중치를 낮춘다. */
    duplicateSoftenFrom: 3,
    duplicateSoftenMul: 0.5,

    /* 천장 — 해금된 등급에만 적용된다.
     * 아직 안 열린 등급을 천장으로 당겨오지 않는다. */
    // 천장은 소환으로 나오는 등급(특별함까지)에만 둔다
    hardPity: { T3: 25 },
    // 천장·보정이 섞여도 흔함 비중은 이 아래로 내려가지 않는다
    minCommonShare: 0.5,
    softPityAfter: 10,
    softPityStep: 3,

    /* 특별 소환권(보스 보상)의 최소 등급 — 그 시점에 열린 등급 중 두 번째로 높은 것 */
    ticketFloorOffset: 1
  };

  /* 이 라운드의 기본 가중치 (해금 보정까지 반영) */
  SummonTable.weightsFor = function (round) {
    var band = null;
    for (var i = 0; i < this.bands.length; i++) {
      if (round <= this.bands[i].until) { band = this.bands[i]; break; }
    }
    if (!band) band = this.bands[this.bands.length - 1];

    var out = {};
    for (var k in band.weights) {
      if (Object.prototype.hasOwnProperty.call(band.weights, k)) out[k] = band.weights[k];
    }

    // 해금 직후 보정
    for (var t = 0; t < RPD.TIER_ORDER.length; t++) {
      var id = RPD.TIER_ORDER[t];
      var unlock = RPD.Tiers[id].unlockRound;
      if (out[id] && round >= unlock && round < unlock + this.unlockBoostRounds) {
        out[id] *= this.unlockBoostMul;
      }
    }
    return clampCommon(out, this.minCommonShare);
  };

  /* 흔함이 minCommonShare 밑으로 가지 않게 나머지 등급을 줄인다.
   * 해금 직후 보정이 새 등급을 부풀려도 이 규칙이 우선한다. */
  function clampCommon(w, minShare) {
    if (!(minShare > 0) || !w.T1) return w;
    var rest = 0;
    for (var k in w) if (k !== 'T1') rest += w[k];
    if (rest > 0 && w.T1 / (w.T1 + rest) < minShare) {
      var scale = (w.T1 * (1 - minShare) / minShare) / rest;
      for (var q in w) if (q !== 'T1') w[q] *= scale;
    }
    return w;
  }
  SummonTable.clampCommon = clampCommon;

  /* 표시용 확률(%) — UI 가 따로 계산하면 표기와 실제가 어긋난다 */
  SummonTable.oddsFor = function (round) {
    var w = this.weightsFor(round);
    var total = 0, k;
    for (k in w) if (Object.prototype.hasOwnProperty.call(w, k)) total += w[k];

    var out = {};
    for (var i = 0; i < RPD.TIER_ORDER.length; i++) {
      var id = RPD.TIER_ORDER[i];
      out[id] = total > 0 && w[id] ? (w[id] / total) * 100 : 0;
    }
    return out;
  };

  /* 다음 라운드에 무엇이 달라지는지 — 상단 예고에 쓴다 */
  SummonTable.previewNext = function (round) {
    var next = RPD.tierUnlockedAt(round + 1);
    if (next) return { kind: 'unlock', tier: next };

    var now = this.oddsFor(round), then = this.oddsFor(round + 1);
    for (var i = 0; i < RPD.TIER_ORDER.length; i++) {
      var id = RPD.TIER_ORDER[i];
      if (Math.abs((then[id] || 0) - (now[id] || 0)) > 0.5) {
        return { kind: 'oddsChange', tier: RPD.Tiers[id], from: now[id], to: then[id] };
      }
    }
    return null;
  };

  RPD.SummonTable = SummonTable;
})(typeof window !== 'undefined' ? window : globalThis);
