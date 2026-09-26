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
    rotated: false,   // 세로로 긴 캔버스(휴대폰 세로)면 필드를 90° 돌려 그린다 — 칸이 커지게
    screenSpace: 0,   // withScreenFrame 안(화면 기준으로 그리는 중)이면 글자를 되돌려 세우지 않는다
    layers: []
  };

  Renderer.init = function (canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    uprightText(this, this.ctx);
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

    // 3x 이상은 성능 대비 이득이 없다. 느린 휴대폰이면 FramePacer 가 상한을 더 내린다(1.5 · 1.25 · 1)
    var cap = RPD.FramePacer ? RPD.FramePacer.maxDpr() : 2;
    this.dpr = Math.min(global.devicePixelRatio || 1, cap);
    this.cssWidth = cssW;
    this.cssHeight = cssH;

    canvas.width = Math.round(cssW * this.dpr);
    canvas.height = Math.round(cssH * this.dpr);

    this.rotated = wantsRotation(cssW, cssH);
    var fit = fitOf(cssW, cssH, this.rotated);
    this.scale = fit.s;
    this.offsetX = fit.ox;
    this.offsetY = fit.oy;
    RPD.bus.emit('render:resize', { cssW: cssW, cssH: cssH, scale: this.scale, rotated: this.rotated });
  };

  /* UI 리디자인: 캔버스가 보드 영역을 꽉 채운다.
   *
   * 전에는 캔버스 자체를 5:3 으로 잘라 가운데 두었고, 넓은 화면에서 좌우에
   * 300px 가까운 빈 띠가 생겼다. 필드가 "웹페이지 안의 그림"처럼 보인 원인이다.
   *
   * 지금은 캔버스가 보드 전체를 덮고, 1000x600 논리 영역을 그 안에 contain 으로
   * 맞춘다. 남는 가장자리는 MapRenderer 가 숲·풀밭으로 이어 그린다(장식 전용).
   * 게임 로직은 여전히 1000x600 만 안다. 변환은 전부 여기서 흡수한다. */
  /* 휴대폰 세로(모바일 ①): 캔버스가 세로로 길면 1000x600 을 90° 돌려 600x1000 으로 채운다.
   * 가로로 둔 채 contain 하면 칸이 화면 폭의 1/10 도 안 된다. 게임 로직은 여전히 1000x600 만 안다 —
   * 돌림은 그리기 변환(render) · 입력 역변환(toLogical) · DOM 카드 위치(toCanvasCss)에서만 흡수한다.
   * 기준은 화면 방향이 아니라 "돌리면 칸이 커지는가"다 — 돌린 배율이 5% 이상 클 때만. PC 필드는 가로로 넓어 절대 안 돈다. */
  function wantsRotation(w, h) {
    // 레이아웃이 정한 방향이 있으면 그것을 따른다(css/mobile.css 의 --field-rotate: 휴대폰 세로 1 · 가로 0).
    // 서랍을 여닫아 캔버스 모양이 바뀔 때마다 필드가 돌았다 섰다 하면 누를 곳이 뒤바뀐다(실제로 그랬다).
    var forced = cssRotate();
    if (forced != null) return forced;
    var flat = Math.min(w / RPD.VIEW.width, h / RPD.VIEW.height);
    var turned = Math.min(w / RPD.VIEW.height, h / RPD.VIEW.width);
    return turned > flat * 1.05;
  }

  function cssRotate() {
    var c = Renderer.canvas;
    if (!c || typeof global.getComputedStyle !== 'function') return null;
    var cs = global.getComputedStyle(c);
    var v = cs && cs.getPropertyValue ? String(cs.getPropertyValue('--field-rotate')).trim() : '';
    return v === '1' ? true : v === '0' ? false : null;
  }

  function fitOf(w, h, rotated) {
    var LW = rotated ? RPD.VIEW.height : RPD.VIEW.width;    // 화면 가로에 놓이는 논리 길이
    var LH = rotated ? RPD.VIEW.width : RPD.VIEW.height;
    var s = Math.min(w / LW, h / LH);
    if (!(s > 0)) s = 1;
    return { s: s, ox: (w - LW * s) / 2, oy: (h - LH * s) / 2, rotated: !!rotated };
  }

  /* 논리 (x, y) → 캔버스 안 CSS px. 돌렸을 때: 논리 x 가 아래로(적 등장 = 위), 논리 y 가 오른쪽→왼쪽.
   *   X = ox + (600 − y)·s,  Y = oy + x·s   (시계 방향 90°) */
  function forward(fit, x, y) {
    if (!fit.rotated) return { x: fit.ox + x * fit.s, y: fit.oy + y * fit.s };
    return { x: fit.ox + (RPD.VIEW.height - y) * fit.s, y: fit.oy + x * fit.s };
  }
  function inverse(fit, X, Y) {
    if (!fit.rotated) return { x: (X - fit.ox) / fit.s, y: (Y - fit.oy) / fit.s };
    return { x: (Y - fit.oy) / fit.s, y: RPD.VIEW.height - (X - fit.ox) / fit.s };
  }
  Renderer._fit = { fitOf: fitOf, forward: forward, inverse: inverse, wantsRotation: wantsRotation };   // 검사용

  /* 돌린 화면에서도 글자·포켓몬 그림은 똑바로 서 있어야 한다. 그리는 점을 중심으로 −90° 되돌린다.
   * 글자는 이 캔버스의 fillText/strokeText 를 감싸 한 곳에서 처리한다(그리는 코드 17곳을 고치지 않게). */
  Renderer.upright = function (ctx, x, y) {
    if (!this.rotated || this.screenSpace > 0) return;
    ctx.translate(x, y);
    ctx.rotate(-Math.PI / 2);
    ctx.translate(-x, -y);
  };
  function uprightText(R, ctx) {
    if (!ctx || R._wrappedCtx === ctx) return;
    ['fillText', 'strokeText'].forEach(function (m) {
      var orig = ctx[m];
      if (typeof orig !== 'function') return;
      ctx[m] = function (text, x, y, maxW) {
        if (!R.rotated || R.screenSpace > 0) return maxW == null ? orig.call(ctx, text, x, y) : orig.call(ctx, text, x, y, maxW);
        ctx.save();
        R.upright(ctx, x, y);
        if (maxW == null) orig.call(ctx, text, x, y); else orig.call(ctx, text, x, y, maxW);
        ctx.restore();
      };
    });
    R._wrappedCtx = ctx;
  }

  /* (cx, cy) 에서 "화면 방향으로" (dx, dy) 떨어진 논리 좌표. 칸 안의 자물쇠·가격·+강화 같은 붙임 글자가
   * 필드를 돌렸을 때도 화면에서 같은 자리(위·아래·모서리)에 오게 한다. 돌림: 화면 → = 논리 −y, 화면 ↓ = 논리 +x. */
  Renderer.at = function (cx, cy, dx, dy) {
    if (!this.rotated || this.screenSpace > 0) return { x: cx + dx, y: cy + dy };
    return { x: cx + dy, y: cy - dx };
  };

  /* 화면에 붙어 있어야 하는 것(보스 체력 막대)을 그릴 틀. 돌렸을 때는 필드 화면 폭 = 논리 600 인 똑바른 틀을 준다.
   * fn(ctx, W) — W 는 그 틀의 가로 논리 길이. 안 돌렸으면 평소 틀 그대로(W = 1000). */
  Renderer.withScreenFrame = function (ctx, fn) {
    if (!this.rotated) return fn(ctx, RPD.VIEW.width);
    ctx.save();
    var k = this.scale * this.dpr;
    ctx.setTransform(k, 0, 0, k, ((this.offsetX || 0) + this.shakeX) * this.dpr, ((this.offsetY || 0) + this.shakeY) * this.dpr);
    this.screenSpace++;
    try { fn(ctx, RPD.VIEW.height); } finally { this.screenSpace--; ctx.restore(); }
  };

  /* 화면 좌표(클라이언트 px) → 논리 좌표(1000x600).
   *
   * 캐시된 scale 을 믿지 않고 매번 rect 에서 직접 구한다.
   * 클릭은 초당 몇 번뿐이라 비용이 무의미하고, 레이아웃이 바뀐 직후
   * 한 프레임이라도 어긋나면 "커서와 클릭 위치가 다르다"가 된다. */
  Renderer.toLogical = function (clientX, clientY) {
    var rect = this.canvas.getBoundingClientRect();
    var fit = rect.width > 0 ? fitOf(rect.width, rect.height, wantsRotation(rect.width, rect.height))
      : { s: this.scale || 1, ox: 0, oy: 0, rotated: false };
    return inverse(fit, clientX - rect.left, clientY - rect.top);
  };

  /* 논리 좌표 → 캔버스 기준 CSS px. 필드 위에 띄우는 DOM 카드 위치를 잡을 때 쓴다. */
  Renderer.toCanvasCss = function (x, y) {
    var rect = this.canvas ? this.canvas.getBoundingClientRect() : { width: 1000, height: 600 };
    var w = rect.width || 1000, h = rect.height || 600;
    var fit = fitOf(w, h, wantsRotation(w, h));
    var p = forward(fit, x, y);
    return { x: p.x, y: p.y, scale: fit.s, rotated: fit.rotated };
  };

  /* 캔버스 전체가 논리 좌표로 어디부터 어디까지인지. 가장자리 장식이 쓴다. */
  Renderer.logicalBounds = function () {
    var s = this.scale || 1;
    var ox = this.offsetX || 0, oy = this.offsetY || 0;
    var cw = this.cssWidth || RPD.VIEW.width, ch = this.cssHeight || RPD.VIEW.height;
    if (this.rotated) {
      // 화면 세로(ch)가 논리 x, 화면 가로(cw)가 논리 y(뒤집힘)
      return { x: -oy / s, y: RPD.VIEW.height - (cw - ox) / s, w: ch / s, h: cw / s };
    }
    return { x: -ox / s, y: -oy / s, w: cw / s, h: ch / s };
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
    if (this.rotated) {
      // forward() 와 같은 식: X = ox + (600 − y)·s, Y = oy + x·s
      ctx.setTransform(0, s, -s, 0, tx + RPD.VIEW.height * s, ty);
    } else {
      ctx.setTransform(s, 0, 0, s, tx, ty);
    }

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
