/* map.js — 필드 레이아웃: 두 갈래 경로 (세션 56).
 *
 * 입구에서 들어온 적은 갈림길에서 위 · 아래 두 길로 나뉘고(번갈아 배정), 출구 앞에서 다시 합쳐진다.
 * 두 길은 가운데 줄(y 300) 기준 위아래 대칭이라 길이가 같다 — "얼마나 왔나(distance)"를 두 길 사이에서 그대로 비교할 수 있다
 * (출구 앞 적 고르기 · 봇의 걷는 시간 계산이 그대로 맞는다).
 *
 *            ┌─┐   ┌─┐   ┌─┐          ← 위 길: 위로 올라갔다 가운데로 두 번 내려온다
 *   입구 ────┤ └─┘ └─┘ └─┤──── 출구   ← 갈림길(x 130) · 합류(x 820) · 출구까지 한 줄
 *            │ ┌─┐   ┌─┐ │
 *            └─┘ └─┘ └─┘ ┘            ← 아래 길: 위 길을 뒤집은 모양
 *
 * 길이는 한 길로 걸어서 약 2400px — 예전 한 줄 경로(2510px)와 비슷하게 맞췄다. 길이가 확 줄면 "두 갈래라서" 달라진 것과
 * "짧아져서" 달라진 것이 섞인다.
 *
 * 칸(기본 20 + 확장 8 = 28 — 세션 57 에 명당 +2)은 세 종류다.
 *   명당   — 두 길이 가운데로 내려오는 자리 사이(가운데 줄). 양쪽 길이 다 사거리 안이라 모든 적을 본다. 기본 5칸 + 갈림길 1칸.
 *   한쪽   — 위 길 · 아래 길 주머니 안. 그쪽 길로 오는 적(절반)만 보지만 경로가 세 면을 감싸 가까이서 오래 때린다.
 *   출구   — 합류한 뒤 출구까지의 한 줄을 지키는 칸. 두 길 모든 적이 지나간다.
 * 커버리지는 겹치는 곳(입구 줄기 · 합류 뒤 꼬리)을 한 번만 세도록 "조각(part)"으로 잰다.
 * 조건은 redesigncheck "필드 배치"가 감시한다(긴 사거리로 못 덮는 구간 없음 · 출구 방어 칸 · 명당 · 한쪽 칸 · 대칭 · 길이).
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  var MID_Y = 300;
  var TOP_Y = 45;           // 위 길의 바깥 줄
  var INNER_Y = 248;        // 위 길이 가운데로 내려오는 줄(아래 길은 600 − 이 값) — 가운데 칸에서 52px
  var SPLIT_X = 130;
  var MERGE_X = 820;
  /* 세로로 꺾이는 자리. 위 줄(주머니)은 100px — 칸이 양쪽 길에서 50px 떨어져 딱 들어간다.
   * 가운데로 내려오는 줄은 195px 로 길게 — 명당(가운데 칸)이 양쪽 길을 길게 보게 */
  var XS = [SPLIT_X, 230, 425, 525, 720, MERGE_X];

  function flip(pts) { return pts.map(function (p) { return { x: p.x, y: 600 - p.y }; }); }

  var TRUNK = [{ x: -40, y: MID_Y }, { x: SPLIT_X, y: MID_Y }];
  var UPPER = [
    { x: XS[0], y: MID_Y }, { x: XS[0], y: TOP_Y }, { x: XS[1], y: TOP_Y }, { x: XS[1], y: INNER_Y },
    { x: XS[2], y: INNER_Y }, { x: XS[2], y: TOP_Y }, { x: XS[3], y: TOP_Y }, { x: XS[3], y: INNER_Y },
    { x: XS[4], y: INNER_Y }, { x: XS[4], y: TOP_Y }, { x: XS[5], y: TOP_Y }, { x: XS[5], y: MID_Y }
  ];
  var LOWER = flip(UPPER);
  var TAIL = [{ x: MERGE_X, y: MID_Y }, { x: 1040, y: MID_Y }];

  function join() {
    var out = [];
    for (var i = 0; i < arguments.length; i++) {
      var seg = arguments[i];
      for (var j = 0; j < seg.length; j++) {
        var p = seg[j], last = out[out.length - 1];
        if (!last || last.x !== p.x || last.y !== p.y) out.push({ x: p.x, y: p.y });
      }
    }
    return out;
  }

  var ROUTES = [join(TRUNK, UPPER, TAIL), join(TRUNK, LOWER, TAIL)];
  /* 겹치지 않는 조각 — 커버리지 · 그리기 · 검사용 */
  var PARTS = [
    { id: 'trunk', label: '입구', pts: TRUNK },
    { id: 'upper', label: '위 길', pts: UPPER },
    { id: 'lower', label: '아래 길', pts: LOWER },
    { id: 'tail', label: '합류 뒤', pts: TAIL }
  ];

  /* 칸 — 위 · 아래는 짝(대칭)으로 둔다. kind: center(명당) · fork(갈림길) · upper · lower(한쪽) · exit(출구) */
  var slots = [];
  function add(x, y, kind, extra) {
    var s = { index: slots.length, row: 0, col: -1, x: x, y: y, kind: kind, unlocked: true };
    for (var k in extra || {}) s[k] = extra[k];
    slots.push(s);
    return s;
  }
  function pair(x, y, extra) {             // 위 길 쪽 칸 + 뒤집은 아래 길 쪽 칸
    add(x, y, 'upper', extra);
    add(x, 600 - y, 'lower', extra);
  }

  // 기본 20칸
  add(328, MID_Y, 'center'); add(475, MID_Y, 'center'); add(622, MID_Y, 'center');   // 명당 — 두 길이 가운데로 내려오는 사이
  add(401, MID_Y, 'center'); add(548, MID_Y, 'center');   // 명당 사이 — 두 길이 꺾이는 모서리를 양쪽으로 본다(세션 57: 두 갈래로 떨어진 클리어율을 맞추려 +2)
  add(180, MID_Y, 'fork');                                                           // 갈림길 — 줄기 끝 · 두 길의 시작을 본다
  pair(180, 150);   // 첫 주머니(위 줄 아래 — 길이 세 면을 감싼다)
  pair(475, 150);   // 둘째 주머니
  pair(770, 150);   // 셋째 주머니 — 합류 직전
  pair(328, 125);   // 가운데로 내려온 줄 위(위가 트인 자리 — 짧은 사거리는 못 닿는다)
  pair(622, 125);
  pair(70, 150);    // 입구 바깥 — 먼 자리(긴 사거리용)
  add(890, MID_Y - 62, 'exit'); add(890, MID_Y + 62, 'exit');   // 출구 — 합류 뒤 한 줄
  slots.forEach(function (s) { s.exit = s.kind === 'exit'; });

  /* 확장 8칸 — 골드로 산다. 가격은 성능 순이 아니라 구매 순서대로 오른다(살수록 비싸진다).
   * 주머니 입구 쪽(가운데에 더 가까워 반대편 길 · 줄기 · 꼬리 끝자락까지 닿는다)과 출구 바깥. */
  var EXPANSION = [
    { x: 475, y: 215, cost: 200,  label: '위 둘째 주머니 입구', kind: 'upper' },
    { x: 475, y: 385, cost: 340,  label: '아래 둘째 주머니 입구', kind: 'lower' },
    { x: 180, y: 215, cost: 560,  label: '위 첫 주머니 입구', kind: 'upper' },
    { x: 180, y: 385, cost: 850,  label: '아래 첫 주머니 입구', kind: 'lower' },
    { x: 770, y: 215, cost: 1250, label: '위 셋째 주머니 입구', kind: 'upper' },
    { x: 770, y: 385, cost: 1800, label: '아래 셋째 주머니 입구', kind: 'lower' },
    { x: 955, y: MID_Y - 62, cost: 680, label: '출구 위', kind: 'exit' },
    { x: 955, y: MID_Y + 62, cost: 980, label: '출구 아래', kind: 'exit' }
  ];
  var BASE = slots.length;
  EXPANSION.forEach(function (ex) {
    add(ex.x, ex.y, ex.kind, { row: 4, unlocked: false, cost: ex.cost, label: ex.label, expansion: true, exit: ex.kind === 'exit' });
  });

  /* 칸 종류 이름 · 설명(정보 카드) */
  var KIND_INFO = {
    center: { label: '명당', note: '두 길 사이 — 위 · 아래 길로 오는 적을 모두 본다.' },
    fork:   { label: '갈림길', note: '입구 줄기 끝 — 모든 적이 지나가고, 두 길의 시작을 본다.' },
    upper:  { label: '위 길만', note: '위 길로 오는 적(절반)만 본다. 대신 길이 가까이 감싼다.' },
    lower:  { label: '아래 길만', note: '아래 길로 오는 적(절반)만 본다. 대신 길이 가까이 감싼다.' },
    exit:   { label: '출구 방어', note: '두 길이 합쳐진 뒤 — 빠져나가려는 모든 적이 지나간다.' }
  };
  slots.forEach(function (s) { var k = KIND_INFO[s.kind]; if (k) { s.kindLabel = k.label; s.note = k.note; } });

  var paths = ROUTES.map(function (w) { return new RPD.Path(w); });
  var partPaths = PARTS.map(function (p) { return { id: p.id, label: p.label, path: new RPD.Path(p.pts) }; });

  RPD.MapData = {
    laneY: { TOP: TOP_Y, MID: MID_Y, BOT: 600 - TOP_Y },
    routes: ROUTES,
    parts: PARTS,
    waypoints: ROUTES[0],
    slots: slots,
    baseSlotCount: BASE,
    slotSize: RPD.Config.slotSize,
    pathWidth: 42,
    /* 버퍼(옆 칸 오라)의 "옆" — 칸 중심 사이 200px. 모든 칸이 옆 칸을 2개 이상 가진다(기본 칸 평균 2.9, 예전 격자 4.8) */
    neighborRange: 200,
    laneArrows: [
      { x: 60, y: MID_Y, dir: 1 },
      { x: 180, y: TOP_Y, dir: 1 }, { x: 475, y: TOP_Y, dir: 1 }, { x: 770, y: TOP_Y, dir: 1 },
      { x: 328, y: INNER_Y, dir: 1 }, { x: 622, y: INNER_Y, dir: 1 },
      { x: 180, y: 600 - TOP_Y, dir: 1 }, { x: 475, y: 600 - TOP_Y, dir: 1 }, { x: 770, y: 600 - TOP_Y, dir: 1 },
      { x: 328, y: 600 - INNER_Y, dir: 1 }, { x: 622, y: 600 - INNER_Y, dir: 1 },
      { x: 930, y: MID_Y, dir: 1 }
    ],
    entry: { x: 0, y: MID_Y },
    exit: { x: 1000, y: MID_Y }
  };

  RPD.MapData.paths = paths;
  RPD.MapData.path = paths[0];          // 두 길은 길이가 같다 — 길이 · 끝 판정만 필요한 곳은 이것으로 충분
  RPD.MapData.partPaths = partPaths;
  RPD.MapData.totalLength = partPaths.reduce(function (a, p) { return a + p.path.length; }, 0);

  /* 적이 걷는 길 — 번호가 없으면 위 길 */
  RPD.MapData.pathFor = function (enemy) { return paths[(enemy && enemy.route) || 0] || paths[0]; };

  /* 번갈아 배정 — 판마다 위 길부터 */
  var routeTurn = 0;
  RPD.MapData.nextRoute = function () { var r = routeTurn % paths.length; routeTurn += 1; return r; };
  RPD.MapData.resetRoutes = function () { routeTurn = 0; };

  /* 가장 가까운 길까지의 거리(칸이 길 위에 앉지 않게 · 장식 배치) */
  RPD.MapData.closestDistanceTo = function (x, y) {
    var best = Infinity;
    for (var i = 0; i < partPaths.length; i++) best = Math.min(best, partPaths[i].path.closestDistanceTo(x, y));
    return best;
  };

  /* 한 칸이 경로를 얼마나 덮는지. 배치 판단의 근거를 UI 가 그대로 보여 줄 수 있게
   * 여기서 계산한다 (칸 26개 × 사거리 3종, 부팅 시 1회). */
  RPD.MapData.coverageParts = function (x, y, range) {
    var out = {};
    for (var i = 0; i < partPaths.length; i++) {
      var path = partPaths[i].path, covered = 0;
      for (var d = 0; d < path.length; d += 4) {
        var p = path.pointAt(d);
        var dx = p.x - x, dy = p.y - y;
        if (dx * dx + dy * dy <= range * range) covered += 4;
      }
      out[partPaths[i].id] = covered;
    }
    return out;
  };

  /* 칸의 커버리지 = "적 한 마리가 지나는 길 중 사거리 안에 드는 길이"의 평균(px).
   * 입구 줄기 · 합류 뒤 꼬리는 모든 적이 지나고, 위 · 아래 길은 번갈아 절반씩 지나므로 0.5 를 곱한다.
   * 그래서 한쪽 길만 보는 칸은 그 길을 길게 덮어도 절반만 쳐 주고, 명당(두 길) · 출구(꼬리)는 제값을 받는다.
   * 소환 자동 배치 · "더 좋은 칸" 안내 · 강화 미리보기 · 칸 정보가 전부 이 값을 쓴다. */
  RPD.MapData.ROUTE_SHARE = { trunk: 1, upper: 0.5, lower: 0.5, tail: 1 };
  RPD.MapData.coverageAt = function (x, y, range) {
    var parts = RPD.MapData.coverageParts(x, y, range), sum = 0, w = RPD.MapData.ROUTE_SHARE;
    for (var k in parts) sum += parts[k] * (w[k] == null ? 1 : w[k]);
    return Math.round(sum);
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
