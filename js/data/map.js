/* map.js — 필드 레이아웃.
 *
 * === PHASE 14 재설계 ===
 * 이전 레이아웃은 모든 칸이 레인에서 정확히 65px 등거리여서, 16칸 중 12칸의
 * 경로 커버리지가 392px 로 완전히 동일했다. "위치가 전략"이라고 해 놓고
 * 실제로는 어디에 두든 결과가 같았다. 드래그 기능이 장식이었다.
 *
 * 그래서 경로를 비대칭으로 다시 그렸다. 위 레인은 길고 아래로 갈수록 짧아지는
 * 계단 모양이라, 칸마다 "경로가 몇 면을 지나가는지"가 다르다.
 *
 *      ▶ (-40,105) ─────────────────────────▶ (790,105)
 *        [150]   [340]   [520]   [700]         │
 *          ·       ·       ·       ·           │  ← 오른쪽 세로 구간
 *      ◀ (250,290) ◀──────────────────── (790,290)
 *        │  ·       ·       ·       ·
 *        │ (왼쪽 세로 구간)
 *      ▶ (250,455) ──────────────────────────▶ 출구
 *
 * 좌표는 손으로 고르지 않고 탐색으로 찾았다. 조건은 세 가지다.
 *   ① 칸이 경로와 겹치지 않는다 (중심 간 최소 55px)
 *   ② 사거리 155 커버리지 편차가 최대한 크다
 *   ③ 짧은 사거리로 아무것도 못 때리는 칸이 최소 2개 있다
 *
 * 실측 (사거리 155 커버리지):
 *   최고 648px · 최저 128px · 편차 ×5.06
 *   같은 커버리지를 가진 칸은 최대 2칸 (v1 은 12칸이 동일했다)
 *   사거리 100 으로는 3칸이 커버리지 0 — "짧은 사거리를 아무 데나 두면 안 된다"가 성립
 *
 * 이 조건들은 selftest 의 "필드 슬롯" 항목이 계속 감시한다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  var LANE_TOP = 105;
  var LANE_MID = 290;
  var LANE_BOT = 455;
  var TURN_RIGHT_X = 790;
  var TURN_LEFT_X = 250;

  var WAYPOINTS = [
    { x: -40, y: LANE_TOP },
    { x: TURN_RIGHT_X, y: LANE_TOP },
    { x: TURN_RIGHT_X, y: LANE_MID },
    { x: TURN_LEFT_X, y: LANE_MID },
    { x: TURN_LEFT_X, y: LANE_BOT },
    { x: 1040, y: LANE_BOT }
  ];

  /* 기본 16칸. 열마다 성격이 다르다.
   *   150열 — 경로가 멀다. 사거리 235 이상만 제값을 한다
   *   340열 — 아래 띠가 강하다 (왼쪽 세로 구간 + 아래 레인)
   *   520열 — 평범하지만 안정적
   *   700열 — 최고 자리. 오른쪽 모서리를 끼고 두 구간을 본다
   */
  /* 좌표는 탐색으로 찾았다. 조건은 넷이다.
   *   ① 경로와 겹치지 않는다 (중심 간 최소 52px)
   *   ② 칸끼리 겹치지 않는다 (중심 간 최소 60px) ← v1 에서 빠뜨려 드래그가 망가졌다
   *   ③ 사거리 155 커버리지 편차가 최대한 크다
   *   ④ 짧은 사거리로 아무것도 못 덮는 칸이 2개 이상 있다
   * 결과: 커버리지 80~640px (편차 ×8.0) */
  var COLS = [100, 310, 495, 685];
  var ROWS = [157, 217, 342, 402];

  var slots = [];
  for (var c = 0; c < COLS.length; c++) {
    for (var r = 0; r < ROWS.length; r++) {
      slots.push({
        index: slots.length,
        row: r,
        col: c,
        x: COLS[c],
        y: ROWS[r],
        unlocked: true
      });
    }
  }

  /* 출구 구간(x 800~1000) 칸.
   * 기본 격자가 x 685 에서 끝나 마지막 직선 250px 를 아무도 못 덮었다.
   * "출구 앞에서 놓친다"가 구조적으로 생기던 자리다. 위·아래로 두 칸씩 둔다
   * (경로 중심에서 65px — 최소 52px 규칙을 지킨다). */
  var EXIT_SLOTS = [
    { x: 860, y: 390 },
    { x: 960, y: 520 }
  ];
  for (var xs = 0; xs < EXIT_SLOTS.length; xs++) {
    slots.push({
      index: slots.length, row: 5, col: -1,
      x: EXIT_SLOTS[xs].x, y: EXIT_SLOTS[xs].y,
      unlocked: true, exit: true
    });
  }

  /* 확장 2칸 — 기본 격자의 빈틈에 놓인 프리미엄 자리.
   * 사거리 235 기준 커버리지가 950px 이상으로 맵에서 가장 넓다. */
  /* 확장 칸 — 골드로 산다. 기본 16칸이 차지하지 못한 자리다.
   * 585,235 는 긴 사거리로 맵에서 가장 넓게 덮는 자리(235 기준 1160px, 기본 최고 904).
   * 385,370 은 중간 사거리 최고(155 기준 680px, 기본 최고 640).
   * 기본 칸과도, 서로도 겹치지 않는다. */
  /* 확장 칸 6개 — 골드 사용처를 늘리기 위해 2개에서 늘렸다.
   * 전부 기본 16칸이 차지하지 못한 자리이고, 서로도 기본 칸과도 겹치지 않는다.
   * 가격은 성능 순이 아니라 구매 순서대로 오른다(살수록 비싸진다). */
  var EXPANSION = [
    { x: 385, y: 370, cost: 200,  label: '아래 띠 중앙',     row: 4 },
    { x: 585, y: 235, cost: 340,  label: '오른쪽 모서리 안쪽', row: 4 },
    { x: 385, y: 235, cost: 560,  label: '위 띠 중앙',       row: 4 },
    { x: 620, y: 360, cost: 850,  label: '오른쪽 아래',      row: 4 },
    { x: 580, y: 175, cost: 1250, label: '위 띠 오른쪽',     row: 4 },
    { x: 555, y: 365, cost: 1800, label: '아래 띠 오른쪽',   row: 4 },
    { x: 960, y: 390, cost: 680,  label: '출구 위',          row: 5 },
    { x: 860, y: 520, cost: 980,  label: '출구 아래',        row: 5 }
  ];

  for (var e = 0; e < EXPANSION.length; e++) {
    var ex = EXPANSION[e];
    slots.push({
      index: slots.length,
      row: ex.row,
      col: -1,
      x: ex.x,
      y: ex.y,
      unlocked: false,
      cost: ex.cost,
      label: ex.label,
      expansion: true
    });
  }

  RPD.MapData = {
    laneY: { A: LANE_TOP, B: LANE_MID, C: LANE_BOT },
    waypoints: WAYPOINTS,
    slots: slots,
    baseSlotCount: COLS.length * ROWS.length + EXIT_SLOTS.length,
    slotSize: RPD.Config.slotSize,
    pathWidth: 42,
    laneArrows: [
      { x: 230, y: LANE_TOP, dir: 1 },
      { x: 560, y: LANE_TOP, dir: 1 },
      { x: 640, y: LANE_MID, dir: -1 },
      { x: 400, y: LANE_MID, dir: -1 },
      { x: 470, y: LANE_BOT, dir: 1 },
      { x: 810, y: LANE_BOT, dir: 1 }
    ],
    entry: { x: 0, y: LANE_TOP },
    exit: { x: 1000, y: LANE_BOT }
  };

  RPD.MapData.path = new RPD.Path(WAYPOINTS);

  /* 한 칸이 경로를 얼마나 덮는지. 배치 판단의 근거를 UI 가 그대로 보여 줄 수 있게
   * 여기서 계산한다 (칸 18개 × 사거리 3종, 부팅 시 1회). */
  RPD.MapData.coverageAt = function (x, y, range) {
    var path = RPD.MapData.path;
    var covered = 0;
    for (var d = 0; d < path.length; d += 4) {
      var p = path.pointAt(d);
      var dx = p.x - x, dy = p.y - y;
      if (dx * dx + dy * dy <= range * range) covered += 4;
    }
    return covered;
  };

  /* 슬롯 단위 조회 + 캐시.
   * UI 가 칸을 고를 때마다 18칸 × 사거리 3종을 계산하면 낭비다.
   * 슬롯 좌표와 경로는 바뀌지 않으므로 한 번 재면 끝이다. */
  var coverageCache = {};

  RPD.MapData.coverageOf = function (slot, range) {
    var key = slot.index + ':' + range;
    if (coverageCache[key] === undefined) {
      coverageCache[key] = RPD.MapData.coverageAt(slot.x, slot.y, range);
    }
    return coverageCache[key];
  };
})(typeof window !== 'undefined' ? window : globalThis);
