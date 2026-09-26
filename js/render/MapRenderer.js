/* MapRenderer.js — 필드의 정적/준정적 요소.
 * 배경과 경로는 매 프레임 다시 그리면 낭비이므로 오프스크린 캔버스에 한 번만 굽고 재사용한다.
 * 슬롯은 hover/select 로 상태가 바뀌므로 매 프레임 그린다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;
  var MAP = RPD.MapData;

  /* UI 리디자인: 어두운 풀밭 → 밝은 한낮 풀밭.
   * 패널이 짙은 네이비로 바뀌면서 필드는 반대로 밝아야 대비가 선다.
   * 흙길은 크림색이라 적(대부분 어두운 색)의 실루엣이 길 위에서 또렷하다. */
  var PALETTE = {
    fieldTop: '#86c95e',
    fieldBottom: '#63ad48',
    grassTuft: 'rgba(38,92,34,0.22)',
    grassLight: 'rgba(214,247,160,0.20)',
    pathEdge: '#9c7440',
    pathBody: '#dcb77a',
    pathLit: '#ecd29c',
    pathSeam: 'rgba(130,92,48,0.22)',
    arrow: 'rgba(120,82,40,0.40)',
    slotPad: 'rgba(255,255,255,0.20)',
    slotEdge: 'rgba(255,255,255,0.70)',
    slotEdgeEmpty: 'rgba(255,255,255,0.62)',
    slotHover: '#ffd23f',
    slotSelected: '#ffd23f',
    lockedPad: 'rgba(18,48,28,0.26)',
    muted: 'rgba(24,52,30,0.72)',
    entry: '#6fd48a',
    exit: '#e0554f',
    text: '#12213d'
  };

  var baked = null;
  // 합성 가능한 슬롯 집합. 매 프레임 계산하면 낭비라 이벤트로만 갱신한다.
  var fuseReady = {};

  var MapRenderer = {};

  MapRenderer.init = function () {
    baked = null;   // 리사이즈 시 다시 굽는다
    RPD.bus.on('render:resize', function () { baked = null; });
    RPD.bus.on('fusion:changed', function () {
      fuseReady = RPD.FusionManager ? RPD.FusionManager.readySlots() : {};
    });
  };

  MapRenderer.drawBackground = function (ctx) {
    var bounds = RPD.Renderer.logicalBounds ? RPD.Renderer.logicalBounds()
      : { x: 0, y: 0, w: RPD.VIEW.width, h: RPD.VIEW.height };
    if (!baked) baked = bakeBackground(bounds);
    if (baked) {
      ctx.drawImage(baked, bounds.x, bounds.y, bounds.w, bounds.h);
    } else {
      paintBackground(ctx, bounds);
      paintPath(ctx, bounds);
    }
    // 글자는 굽지 않고 매 프레임 — 구운 그림에 넣으면 필드를 돌렸을 때 같이 눕는다
    paintEndpointLabels(ctx);
  };

  /* 배경은 캔버스 전체(논리 영역 바깥 가장자리 포함)를 한 번만 굽는다. */
  function bakeBackground(bounds) {
    if (typeof document === 'undefined' || !document.createElement) return null;
    var dpr = RPD.Renderer.dpr || 1;
    var sc = RPD.Renderer.scale || 1;
    var off = document.createElement('canvas');
    // 논리 크기 기준으로 굽는다 — 필드를 돌려 그릴 때(휴대폰 세로)는 화면 가로·세로와 논리 가로·세로가 바뀐다
    off.width = Math.max(1, Math.round(bounds.w * sc * dpr));
    off.height = Math.max(1, Math.round(bounds.h * sc * dpr));
    var octx = off.getContext('2d');
    if (!octx) return null;
    var k = (off.width / bounds.w);
    octx.setTransform(k, 0, 0, k, -bounds.x * k, -bounds.y * k);
    paintBackground(octx, bounds);
    paintPath(octx, bounds);
    return off;
  }

  function makeRnd(seed) {
    return function () {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
  }

  function paintBackground(ctx, bounds) {
    var B = bounds || { x: 0, y: 0, w: RPD.VIEW.width, h: RPD.VIEW.height };

    var g = ctx.createLinearGradient(0, B.y, 0, B.y + B.h);
    g.addColorStop(0, PALETTE.fieldTop);
    g.addColorStop(1, PALETTE.fieldBottom);
    ctx.fillStyle = g;
    ctx.fillRect(B.x, B.y, B.w, B.h);

    // 결정적 난수 — 새로고침해도 풀밭 모양이 똑같아야 화면이 안정적으로 보인다.
    var rnd = makeRnd(20260910);
    var i;

    // 큰 명암 얼룩 — 평평한 초록 한 장보다 땅의 굴곡이 느껴진다
    for (i = 0; i < 26; i++) {
      var px = B.x + rnd() * B.w, py = B.y + rnd() * B.h, pr = 40 + rnd() * 90;
      ctx.beginPath();
      ctx.ellipse(px, py, pr * 1.4, pr * 0.8, 0, 0, Math.PI * 2);
      ctx.fillStyle = rnd() < 0.5 ? 'rgba(40,110,40,0.10)' : 'rgba(210,250,150,0.10)';
      ctx.fill();
    }

    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    var area = (B.w * B.h) / (1000 * 600);
    var tufts = Math.round(520 * area);
    for (i = 0; i < tufts; i++) {
      var x = B.x + rnd() * B.w;
      var y = B.y + rnd() * B.h;
      var h = 4 + rnd() * 7;
      var lean = (rnd() - 0.5) * 3;
      ctx.strokeStyle = rnd() < 0.7 ? PALETTE.grassTuft : PALETTE.grassLight;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + lean, y - h);
      ctx.moveTo(x + 2, y);
      ctx.lineTo(x + 2 + lean * 1.4, y - h * 0.7);
      ctx.stroke();
    }

    paintDecor(ctx, B, rnd);
  }

  /* 장식(나무·덤불·바위·꽃·연못). 경로와 칸을 절대 가리지 않는 자리에만 놓는다.
   * 전부 굽는 배경에 들어가므로 프레임 비용은 0 이다. */
  function clearOf(x, y, pad) {
    var d = MAP.closestDistanceTo ? MAP.closestDistanceTo(x, y) : distToPolyline(x, y);
    if (d < MAP.pathWidth / 2 + pad) return false;
    for (var i = 0; i < MAP.slots.length; i++) {
      var sl = MAP.slots[i];
      var dx = sl.x - x, dy = sl.y - y;
      if (dx * dx + dy * dy < (34 + pad) * (34 + pad)) return false;
    }
    return true;
  }

  function distToPolyline(x, y) {
    var pts = MAP.waypoints, best = Infinity;
    for (var i = 1; i < pts.length; i++) {
      var ax = pts[i - 1].x, ay = pts[i - 1].y, bx = pts[i].x, by = pts[i].y;
      var vx = bx - ax, vy = by - ay;
      var t = ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy || 1);
      t = Math.max(0, Math.min(1, t));
      var ex = ax + vx * t - x, ey = ay + vy * t - y;
      best = Math.min(best, Math.sqrt(ex * ex + ey * ey));
    }
    return best;
  }

  function paintDecor(ctx, B, rnd) {
    var W = RPD.VIEW.width, H = RPD.VIEW.height;
    var i, x, y;
    var inside = function (px, py) { return px > 20 && px < W - 20 && py > 20 && py < H - 20; };

    // 연못 — 왼쪽 위 여백(경로 위쪽 띠)에 하나
    if (clearOf(60, 40, 30) || B.x < -40) {
      var pondX = Math.min(60, B.x + 90), pondY = 44;
      if (clearOf(pondX, pondY, 26)) {
        ctx.beginPath();
        ctx.ellipse(pondX, pondY, 58, 26, -0.08, 0, Math.PI * 2);
        ctx.fillStyle = '#4f9a5a';
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(pondX, pondY + 1, 50, 20, -0.08, 0, Math.PI * 2);
        ctx.fillStyle = '#4aa6d8';
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(pondX - 14, pondY - 6, 18, 5, -0.08, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fill();
      }
    }

    // 꽃
    var flowerColors = ['#ffffff', '#ffe36e', '#ff9ec2', '#ffb35c'];
    for (i = 0; i < 120 * (B.w / W); i++) {
      x = B.x + rnd() * B.w; y = B.y + rnd() * B.h;
      if (!clearOf(x, y, 6)) continue;
      ctx.fillStyle = flowerColors[(rnd() * flowerColors.length) | 0];
      ctx.beginPath(); ctx.arc(x, y, 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 4, y + 1.5, 1.5, 0, Math.PI * 2); ctx.fill();
    }

    // 바위
    for (i = 0; i < 26; i++) {
      x = B.x + rnd() * B.w; y = B.y + rnd() * B.h;
      if (!clearOf(x, y, 16)) continue;
      var rr = 5 + rnd() * 7;
      ctx.beginPath();
      ctx.ellipse(x, y + rr * 0.5, rr * 1.2, rr * 0.45, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(20,50,20,0.22)'; ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x, y, rr, rr * 0.75, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#9aa29a'; ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x - rr * 0.25, y - rr * 0.25, rr * 0.5, rr * 0.3, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#c3cac0'; ctx.fill();
    }

    // 덤불·나무 — 안쪽은 드물게, 바깥 여백은 숲처럼 빽빽하게
    var trees = [];
    var tries = Math.round(260 * (B.w * B.h) / (W * H));
    for (i = 0; i < tries; i++) {
      x = B.x + rnd() * B.w; y = B.y + rnd() * B.h;
      var inField = inside(x, y);
      var r = inField ? 11 + rnd() * 8 : 16 + rnd() * 18;
      if (inField && rnd() < 0.55) continue;
      if (!clearOf(x, y, r + (inField ? 12 : 6))) continue;
      trees.push({ x: x, y: y, r: r });
    }
    trees.sort(function (a, b) { return a.y - b.y; });
    for (i = 0; i < trees.length; i++) paintTree(ctx, trees[i].x, trees[i].y, trees[i].r, rnd);
  }

  function paintTree(ctx, x, y, r, rnd) {
    ctx.beginPath();
    ctx.ellipse(x + r * 0.15, y + r * 0.72, r * 1.05, r * 0.38, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(16,52,20,0.28)';
    ctx.fill();
    var blobs = [[-0.45, 0.1, 0.62], [0.45, 0.12, 0.6], [0, -0.28, 0.72], [0, 0.18, 0.7]];
    var shades = ['#2f7d3a', '#3f9444', '#56ab4f'];
    for (var s = 0; s < 3; s++) {
      for (var b = 0; b < blobs.length; b++) {
        var bl = blobs[b];
        ctx.beginPath();
        ctx.arc(x + bl[0] * r - s * r * 0.08, y + bl[1] * r - s * r * 0.12, bl[2] * r * (1 - s * 0.22), 0, Math.PI * 2);
        ctx.fillStyle = shades[s];
        ctx.fill();
      }
    }
    ctx.beginPath();
    ctx.arc(x - r * 0.25, y - r * 0.45, r * 0.18, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(200,240,150,0.45)';
    ctx.fill();
  }

  var pathBounds = null;

  /* 가장자리가 보이게 됐으므로 길도 캔버스 끝까지 이어 그린다.
   * 적이 숲 밖에서 걸어 들어오는 것처럼 보인다. 판정 경로(MapData.path)는 그대로다. */
  function tracePath(ctx) {
    // 두 갈래 — 길마다 한 줄씩(입구 줄기 · 합류 뒤 꼬리는 겹쳐 그려진다)
    var routes = MAP.routes || [MAP.waypoints];
    var B = pathBounds;
    ctx.beginPath();
    for (var r = 0; r < routes.length; r++) {
      var pts = routes[r];
      var first = pts[0], last = pts[pts.length - 1];
      ctx.moveTo(B ? Math.min(first.x, B.x - 30) : first.x, first.y);
      for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      if (B) ctx.lineTo(Math.max(last.x, B.x + B.w + 30), last.y);
    }
  }

  function paintPath(ctx, bounds) {
    var w = MAP.pathWidth;
    pathBounds = bounds || null;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 흙길 가장자리(그림자) → 본체 → 중앙 밝은 결
    tracePath(ctx);
    ctx.strokeStyle = PALETTE.pathEdge;
    ctx.lineWidth = w + 10;
    ctx.stroke();

    tracePath(ctx);
    ctx.strokeStyle = PALETTE.pathBody;
    ctx.lineWidth = w;
    ctx.stroke();

    tracePath(ctx);
    ctx.strokeStyle = PALETTE.pathLit;
    ctx.lineWidth = w - 14;
    ctx.stroke();

    tracePath(ctx);
    ctx.strokeStyle = PALETTE.pathSeam;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([16, 22]);
    ctx.stroke();
    ctx.setLineDash([]);

    paintLaneArrows(ctx);
    paintEndpoints(ctx);
  }

  function paintLaneArrows(ctx) {
    ctx.fillStyle = PALETTE.arrow;
    for (var i = 0; i < MAP.laneArrows.length; i++) {
      var a = MAP.laneArrows[i];
      var d = a.dir;
      ctx.beginPath();
      ctx.moveTo(a.x - 9 * d, a.y - 9);
      ctx.lineTo(a.x + 7 * d, a.y);
      ctx.lineTo(a.x - 9 * d, a.y + 9);
      ctx.lineTo(a.x - 4 * d, a.y);
      ctx.closePath();
      ctx.fill();
    }
  }

  function paintEndpoints(ctx) {
    var w = MAP.pathWidth;

    // 입구 — 적이 나오는 곳
    var eg = ctx.createLinearGradient(0, 0, 70, 0);
    eg.addColorStop(0, 'rgba(111,212,138,0.55)');
    eg.addColorStop(1, 'rgba(111,212,138,0)');
    ctx.fillStyle = eg;
    ctx.fillRect(0, MAP.entry.y - w / 2, 70, w);

    // 출구 — 여기로 빠져나가면 라이프가 깎인다
    var xg = ctx.createLinearGradient(1000, 0, 920, 0);
    xg.addColorStop(0, 'rgba(224,85,79,0.62)');
    xg.addColorStop(1, 'rgba(224,85,79,0)');
    ctx.fillStyle = xg;
    ctx.fillRect(920, MAP.exit.y - w / 2, 80, w);

  }

  function paintEndpointLabels(ctx) {
    var w = MAP.pathWidth;
    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.font = '800 13px ' + RPD.FONT_STACK;
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = 'rgba(12,28,50,0.75)';
    ctx.textAlign = 'left';
    ctx.strokeText('적 등장', 10, MAP.entry.y - w / 2 - 14);
    ctx.fillStyle = '#c8ffd6';
    ctx.fillText('적 등장', 10, MAP.entry.y - w / 2 - 14);

    ctx.textAlign = 'right';
    ctx.strokeText('출구', 990, MAP.exit.y + w / 2 + 15);
    ctx.fillStyle = '#ffd0cb';
    ctx.fillText('출구', 990, MAP.exit.y + w / 2 + 15);
    ctx.restore();
  }

  /* ---------- 슬롯 (매 프레임) ---------- */

  MapRenderer.drawSlots = function (ctx) {
    var F = RPD.FieldManager;
    for (var i = 0; i < F.slots.length; i++) {
      drawSlot(ctx, F.slots[i], i === F.hoverIndex, i === F.selectedIndex,
               i === F.dragFromIndex, !!fuseReady[i]);
    }
  };

  function drawSlot(ctx, slot, hovered, selected, dragging, fusable) {
    var s = slot.size;
    var x = slot.x - s / 2;
    var y = slot.y - s / 2;
    var r = 12;

    ctx.save();

    roundRect(ctx, x, y, s, s, r);
    ctx.fillStyle = slot.unlocked ? PALETTE.slotPad : PALETTE.lockedPad;
    ctx.fill();

    // 잠긴 확장 칸 — 가격을 그대로 보여 준다. 눌러 봐야 알 수 있으면 안 된다.
    if (!slot.unlocked) {
      // 모드 제한으로 막힌 칸은 살 수도 없다. 가격을 보여 주면 거짓말이 된다.
      if (slot.blocked) {
        ctx.setLineDash([2, 5]);
        ctx.strokeStyle = 'rgba(24,52,30,0.30)';
        ctx.lineWidth = 1.2;
        roundRect(ctx, x + 1, y + 1, s - 2, s - 2, r - 1);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = '600 10px ' + RPD.FONT_STACK;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = PALETTE.muted;
        ctx.fillText('사용 불가', slot.x, slot.y);
        ctx.restore();
        return;
      }

      var affordable = RPD.GameManager.gold >= slot.cost;
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = hovered
        ? (affordable ? PALETTE.slotHover : 'rgba(224,85,79,0.7)')
        : 'rgba(24,52,30,0.40)';
      ctx.lineWidth = hovered ? 2 : 1.4;
      roundRect(ctx, x + 1, y + 1, s - 2, s - 2, r - 1);
      ctx.stroke();
      ctx.setLineDash([]);

      var lockAt = RPD.Renderer.at(slot.x, slot.y, 0, -8), costAt = RPD.Renderer.at(slot.x, slot.y, 0, 15);
      drawLock(ctx, lockAt.x, lockAt.y, affordable ? '#ffd23f' : PALETTE.muted);

      ctx.font = '700 11px ' + RPD.FONT_STACK;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = affordable ? '#fff3b8' : PALETTE.muted;
      ctx.fillText(slot.cost + 'G', costAt.x, costAt.y);

      ctx.restore();
      return;
    }

    if (!slot.unit) {
      // 빈 슬롯 — 점선. "여기 놓을 수 있다"를 설명 없이 전달한다.
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = hovered ? PALETTE.slotHover : PALETTE.slotEdgeEmpty;
      ctx.lineWidth = hovered ? 2 : 1.4;
      roundRect(ctx, x + 1, y + 1, s - 2, s - 2, r - 1);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.strokeStyle = selected ? PALETTE.slotSelected
                      : hovered ? PALETTE.slotHover : PALETTE.slotEdge;
      ctx.lineWidth = selected ? 2.6 : (hovered ? 2 : 1.4);
      roundRect(ctx, x + 1, y + 1, s - 2, s - 2, r - 1);
      ctx.stroke();
    }

    if (dragging) {
      roundRect(ctx, x, y, s, s, r);
      ctx.fillStyle = 'rgba(240,180,41,0.16)';
      ctx.fill();
    }

    // 합성 준비된 칸은 테두리가 숨쉰다. 설명 없이 "여기 뭔가 있다"를 전달한다.
    if (fusable) {
      var pulse = 0.55 + 0.45 * Math.sin(RPD.CombatManager.clock * 4);
      roundRect(ctx, x - 2, y - 2, s + 4, s + 4, r + 2);
      ctx.strokeStyle = 'rgba(240,180,41,' + (0.35 + pulse * 0.45).toFixed(2) + ')';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.restore();
  }

  /* 선택한 유닛의 사거리 원. "왜 얘가 저 적을 안 때리지?"를 즉시 해소한다. */
  MapRenderer.drawRange = function (ctx) {
    var F = RPD.FieldManager;
    var slot = F.getSelected() || F.get(F.hoverIndex);
    if (!slot || !slot.unit || !slot.unit.range) return;

    ctx.save();
    ctx.beginPath();
    ctx.arc(slot.x, slot.y, slot.unit.range, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(240,180,41,0.07)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(240,180,41,0.42)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([7, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  };

  function drawLock(ctx, cx, cy, color) {
    ctx.save();
    RPD.Renderer.upright(ctx, cx, cy);   // 필드를 돌려 그려도 자물쇠는 똑바로
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy - 2, 4.5, Math.PI, 0);
    ctx.stroke();
    roundRect(ctx, cx - 6.5, cy - 2, 13, 10, 2);
    ctx.fill();
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  MapRenderer.roundRect = roundRect;
  MapRenderer.PALETTE = PALETTE;
  RPD.MapRenderer = MapRenderer;
})(typeof window !== 'undefined' ? window : globalThis);
