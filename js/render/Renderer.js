/* Renderer.js — 캔버스 소유자.
 * 게임 로직은 언제나 1000x600 논리 좌표로만 생각한다.
 * 실제 화면 크기와 devicePixelRatio 변환은 전부 여기서 흡수한다. (HiDPI 흐림 방지)
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  var Renderer = {
    canvas: null,
    ctx: null,
    cssWidth: 0,
    cssHeight: 0,
    scale: 1,
    dpr: 1,
    layers: []
  };

  Renderer.init = function (canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize();

    var self = this;
    global.addEventListener('resize', function () { self.resize(); });

    /* 창 크기만 보면 안 된다.
     * 조합식 "전체"를 펼치면 그리드가 재배치되면서 캔버스가 줄어드는데
     * 창 크기는 그대로다. 그러면 scale 이 옛 값으로 남아
     * 마우스 좌표가 실제 클릭 위치와 어긋난다. (실제로 그랬다)
     * 캔버스 자체의 크기 변화를 관찰한다. */
    if (typeof ResizeObserver !== 'undefined') {
      var ro = new ResizeObserver(function () { self.resize(); });
      ro.observe(canvas);
      this._observer = ro;
    }
    return this;
  };

  Renderer.resize = function () {
    var canvas = this.canvas;
    if (!canvas) return;

    var rect = canvas.getBoundingClientRect();
    var cssW = Math.max(1, Math.round(rect.width));
    var cssH = Math.max(1, Math.round(rect.height));

    this.dpr = Math.min(global.devicePixelRatio || 1, 2);   // 3x 이상은 성능 대비 이득이 없다
    this.cssWidth = cssW;
    this.cssHeight = cssH;

    canvas.width = Math.round(cssW * this.dpr);
    canvas.height = Math.round(cssH * this.dpr);

    var fit = fitOf(cssW, cssH);
    this.scale = fit.s;
    this.offsetX = fit.ox;
    this.offsetY = fit.oy;
    RPD.bus.emit('render:resize', { cssW: cssW, cssH: cssH, scale: this.scale });
  };

  /* UI 리디자인: 캔버스가 보드 영역을 꽉 채운다.
   *
   * 전에는 캔버스 자체를 5:3 으로 잘라 가운데 두었고, 넓은 화면에서 좌우에
   * 300px 가까운 빈 띠가 생겼다. 필드가 "웹페이지 안의 그림"처럼 보인 원인이다.
   *
   * 지금은 캔버스가 보드 전체를 덮고, 1000x600 논리 영역을 그 안에 contain 으로
   * 맞춘다. 남는 가장자리는 MapRenderer 가 숲·풀밭으로 이어 그린다(장식 전용).
   * 게임 로직은 여전히 1000x600 만 안다. 변환은 전부 여기서 흡수한다. */
  function fitOf(w, h) {
    var s = Math.min(w / RPD.VIEW.width, h / RPD.VIEW.height);
    if (!(s > 0)) s = 1;
    return { s: s, ox: (w - RPD.VIEW.width * s) / 2, oy: (h - RPD.VIEW.height * s) / 2 };
  }

  /* 화면 좌표(클라이언트 px) → 논리 좌표(1000x600).
   *
   * 캐시된 scale 을 믿지 않고 매번 rect 에서 직접 구한다.
   * 클릭은 초당 몇 번뿐이라 비용이 무의미하고, 레이아웃이 바뀐 직후
   * 한 프레임이라도 어긋나면 "커서와 클릭 위치가 다르다"가 된다. */
  Renderer.toLogical = function (clientX, clientY) {
    var rect = this.canvas.getBoundingClientRect();
    var fit = rect.width > 0 ? fitOf(rect.width, rect.height) : { s: this.scale || 1, ox: 0, oy: 0 };
    return {
      x: (clientX - rect.left - fit.ox) / fit.s,
      y: (clientY - rect.top - fit.oy) / fit.s
    };
  };

  /* 논리 좌표 → 캔버스 기준 CSS px. 필드 위에 띄우는 DOM 카드 위치를 잡을 때 쓴다. */
  Renderer.toCanvasCss = function (x, y) {
    var rect = this.canvas ? this.canvas.getBoundingClientRect() : { width: 1000, height: 600 };
    var fit = fitOf(rect.width || 1000, rect.height || 600);
    return { x: fit.ox + x * fit.s, y: fit.oy + y * fit.s, scale: fit.s };
  };

  /* 캔버스 전체가 논리 좌표로 어디부터 어디까지인지. 가장자리 장식이 쓴다. */
  Renderer.logicalBounds = function () {
    var s = this.scale || 1;
    var ox = this.offsetX || 0, oy = this.offsetY || 0;
    return {
      x: -ox / s, y: -oy / s,
      w: (this.cssWidth || RPD.VIEW.width) / s,
      h: (this.cssHeight || RPD.VIEW.height) / s
    };
  };

  /* 화면 흔들림. 전설 등급의 강한 타격에서만 AttackFxRenderer 가 아주 짧게 건다.
   * 그림만 흔들린다 — 클릭 좌표 변환에는 절대 섞지 않는다. */
  Renderer.shakeX = 0;
  Renderer.shakeY = 0;

  /* 레이어는 낮은 order 부터 그려진다. */
  Renderer.addLayer = function (order, fn) {
    this.layers.push({ order: order, fn: fn });
    this.layers.sort(function (a, b) { return a.order - b.order; });
  };

  Renderer.render = function (dt) {
    var ctx = this.ctx;
    if (!ctx) return;

    // ResizeObserver 가 없는 환경 대비. 크기가 변했으면 즉시 맞춘다.
    var rect = this.canvas.getBoundingClientRect();
    if (Math.abs(Math.round(rect.width) - this.cssWidth) > 1 ||
        Math.abs(Math.round(rect.height) - this.cssHeight) > 1) {
      this.resize();
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    var s = this.scale * this.dpr;
    var tx = ((this.offsetX || 0) + this.shakeX) * this.dpr;
    var ty = ((this.offsetY || 0) + this.shakeY) * this.dpr;
    ctx.setTransform(s, 0, 0, s, tx, ty);

    for (var i = 0; i < this.layers.length; i++) {
      this.layers[i].fn(ctx, dt);
    }
  };

  Renderer.LAYER = {
    BACKGROUND: 0,
    PATH: 10,
    SLOTS: 20,
    RANGE: 30,
    ENEMIES: 40,
    UNITS: 50,
    PROJECTILES: 60,
    FX: 70,
    OVERLAY: 90
  };

  RPD.Renderer = Renderer;
})(typeof window !== 'undefined' ? window : globalThis);
