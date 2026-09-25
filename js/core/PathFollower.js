/* PathFollower.js — 웨이포인트 경로를 따라 움직이는 순수 로직.
 * 적, 보스, 경로 미리보기 마커가 전부 이걸 공유한다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  // waypoints: [{x, y}, ...]  →  누적 길이 테이블을 미리 만들어 둔다.
  function Path(waypoints) {
    this.points = waypoints;
    this.segments = [];
    this.length = 0;

    for (var i = 0; i < waypoints.length - 1; i++) {
      var a = waypoints[i], b = waypoints[i + 1];
      var dx = b.x - a.x, dy = b.y - a.y;
      var len = Math.sqrt(dx * dx + dy * dy);
      this.segments.push({
        ax: a.x, ay: a.y,
        dx: dx / (len || 1), dy: dy / (len || 1),
        length: len,
        start: this.length
      });
      this.length += len;
    }
  }

  // 경로 시작점으로부터 distance 만큼 진행한 좌표.
  Path.prototype.pointAt = function (distance) {
    if (distance <= 0) {
      var f = this.segments[0];
      return { x: f.ax, y: f.ay, dx: f.dx, dy: f.dy };
    }
    for (var i = 0; i < this.segments.length; i++) {
      var s = this.segments[i];
      if (distance <= s.start + s.length) {
        var local = distance - s.start;
        return { x: s.ax + s.dx * local, y: s.ay + s.dy * local, dx: s.dx, dy: s.dy };
      }
    }
    var last = this.segments[this.segments.length - 1];
    return {
      x: last.ax + last.dx * last.length,
      y: last.ay + last.dy * last.length,
      dx: last.dx, dy: last.dy
    };
  };

  Path.prototype.isFinished = function (distance) {
    return distance >= this.length;
  };

  // 경로 위 어떤 점이 (px,py) 에 가장 가까운지 — 슬롯 배치 힌트/디버그용.
  Path.prototype.closestDistanceTo = function (px, py) {
    var best = Infinity;
    for (var i = 0; i < this.segments.length; i++) {
      var s = this.segments[i];
      var vx = px - s.ax, vy = py - s.ay;
      var t = RPD.Utils.clamp(vx * s.dx + vy * s.dy, 0, s.length);
      var cx = s.ax + s.dx * t, cy = s.ay + s.dy * t;
      var d = RPD.Utils.dist(px, py, cx, cy);
      if (d < best) best = d;
    }
    return best;
  };

  RPD.Path = Path;
})(typeof window !== 'undefined' ? window : globalThis);
