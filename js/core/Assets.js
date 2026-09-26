/* Assets.js — 이미지 로더.
 * 설계 원칙: 이미지가 없어도 게임이 절대 깨지지 않는다.
 * 파일이 없으면 타입 색상 원형 + 이름 첫 글자를 그리는 placeholder 로 대체한다.
 * 사용자는 나중에 assets/pokemon/*.png 를 넣기만 하면 자동으로 반영된다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  var cache = {};   // src -> { img, state: 'loading'|'ready'|'failed' }

  var Assets = {};

  /* 파일 경로 → 실제로 읽을 주소.
   * 테스트용 단일 파일(tools/build-tester.js)은 그림을 HTML 안에 넣어 두고
   * window.RPD_INLINE 에 { 경로: data URL } 로 건네준다. 그 경우 그쪽을 쓴다.
   * 평소(폴더째 여는 경우)에는 경로 그대로다. */
  Assets.url = function (src) {
    var inline = global.RPD_INLINE;
    return (inline && src && inline[src]) || src;
  };

  Assets.get = function (src) {
    if (!src) return null;
    if (cache[src]) return cache[src];

    var entry = { img: null, state: 'loading' };
    cache[src] = entry;

    if (typeof Image === 'undefined') { entry.state = 'failed'; return entry; }

    var img = new Image();
    img.onload = function () { entry.img = img; entry.state = 'ready'; };
    img.onerror = function () { entry.state = 'failed'; };
    img.src = Assets.url(src);
    entry.img = img;
    return entry;
  };

  Assets.isReady = function (src) {
    var e = cache[src];
    return !!(e && e.state === 'ready');
  };

  /* 스프라이트를 (cx, cy) 중심에 size 크기로 그린다.
   * opts: { label, color, ring, alpha }
   */
  Assets.drawSprite = function (ctx, src, cx, cy, size, opts) {
    opts = opts || {};
    var entry = src ? Assets.get(src) : null;

    ctx.save();
    if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
    // 필드를 90° 돌려 그릴 때(휴대폰 세로)도 포켓몬은 똑바로 선다
    if (RPD.Renderer && RPD.Renderer.upright && ctx === RPD.Renderer.ctx) RPD.Renderer.upright(ctx, cx, cy);

    if (entry && entry.state === 'ready') {
      // 도트 그림은 뭉개지지 않게, 크게 줄여 그리는 고해상도 그림은 부드럽게
      ctx.imageSmoothingEnabled = !!opts.smooth;
      if (opts.smooth) ctx.imageSmoothingQuality = 'high';
      if (opts.flip) {
        ctx.translate(cx, cy);
        ctx.scale(-1, 1);
        ctx.drawImage(entry.img, -size / 2, -size / 2, size, size);
      } else {
        ctx.drawImage(entry.img, cx - size / 2, cy - size / 2, size, size);
      }
    } else {
      // 그림 파일이 없으면 코드로 만든 스프라이트를 쓴다.
      // 그것도 못 만들면(캔버스 없는 환경) 마지막으로 색깔 원.
      var made = opts.def && RPD.SpriteFactory
        ? RPD.SpriteFactory.get(opts.def, { awakened: opts.awakened })
        : null;
      if (made) {
        var s = size * 1.32;   // 생성 스프라이트는 여백을 포함하므로 조금 키운다
        ctx.drawImage(made, cx - s / 2, cy - s / 2, s, s);
      } else {
        drawPlaceholder(ctx, cx, cy, size, opts);
      }
    }

    if (opts.ring) {
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.52, 0, Math.PI * 2);
      ctx.strokeStyle = opts.ring;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
    ctx.restore();
  };

  function drawPlaceholder(ctx, cx, cy, size, opts) {
    var color = opts.color || '#7d8a80';
    var r = size * 0.44;

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // 위쪽만 밝게 — 평면 원보다 입체감이 생겨 필드에서 잘 읽힌다.
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.18, r * 0.82, Math.PI, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fill();

    var label = (opts.label || '?').charAt(0);
    ctx.fillStyle = '#0f1710';
    ctx.font = '700 ' + Math.round(size * 0.42) + 'px ' + RPD.FONT_STACK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, cy + size * 0.02);
  }

  Assets.drawPlaceholder = drawPlaceholder;

  RPD.Assets = Assets;
  RPD.FONT_STACK = '"Pretendard","Apple SD Gothic Neo","Malgun Gothic",system-ui,-apple-system,sans-serif';
})(typeof window !== 'undefined' ? window : globalThis);
