/* SpriteFactory.js — 이미지 파일 없이 생물처럼 보이는 스프라이트를 코드로 그린다.
 *
 * 왜 필요한가: 94개의 그림 파일이 준비되기 전까지 모든 개체가 "색깔 원 + 글자 하나"로
 * 보인다. 그 상태로는 무엇이 강한지, 무엇이 같은 종인지 화면만 보고 알 수 없다.
 *
 * 규칙 세 가지
 *   1) 같은 개체는 언제나 같은 모습 — id 해시를 시드로 쓴다
 *   2) 같은 계열은 닮았고 단계가 오를수록 커진다 — family 를 시드에 섞는다
 *   3) 타입과 역할이 실루엣에 드러난다 — 비행은 날개, 바위는 각진 몸, 물은 지느러미
 *
 * 한 번 그린 결과는 오프스크린 캔버스에 캐시한다. 매 프레임 다시 그리면 3배속에서 죽는다.
 * assets 폴더에 진짜 그림을 넣으면 Assets 가 그쪽을 우선한다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  var SIZE = 128;        // 원본 해상도. 실제 표시는 축소된다.
  var cache = {};

  /* 문자열 → 32비트 정수. 같은 id 는 언제나 같은 값. */
  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h;
  }

  function rngFrom(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function shade(hex, amount) {
    var n = parseInt(String(hex).slice(1), 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (amount > 0) {
      r += (255 - r) * amount; g += (255 - g) * amount; b += (255 - b) * amount;
    } else {
      r *= (1 + amount); g *= (1 + amount); b *= (1 + amount);
    }
    return 'rgb(' + Math.round(r) + ',' + Math.round(g) + ',' + Math.round(b) + ')';
  }

  /* ---------- 몸통 형태 ---------- */

  var BODIES = {
    /* 둥근 몸 — 기본형 */
    BLOB: function (ctx, r, w, h) {
      ctx.beginPath();
      ctx.ellipse(0, 6, w, h, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    },
    /* 각진 몸 — 바위·강철 */
    ROCKY: function (ctx, r, w, h) {
      var sides = 7;
      ctx.beginPath();
      for (var i = 0; i < sides; i++) {
        var a = (i / sides) * Math.PI * 2 - Math.PI / 2;
        var rad = (i % 2 === 0 ? 1 : 0.82);
        ctx.lineTo(Math.cos(a) * w * rad, 6 + Math.sin(a) * h * rad);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    },
    /* 길쭉한 몸 — 드래곤·독 계열 */
    SERPENT: function (ctx, r, w, h) {
      ctx.beginPath();
      ctx.ellipse(0, 10, w * 0.78, h * 1.12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, -h * 0.55, w * 0.62, h * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    },
    /* 물방울 — 물·얼음 */
    DROP: function (ctx, r, w, h) {
      ctx.beginPath();
      ctx.moveTo(0, -h * 1.15);
      ctx.bezierCurveTo(w, -h * 0.4, w, h * 0.9, 0, h * 1.05);
      ctx.bezierCurveTo(-w, h * 0.9, -w, -h * 0.4, 0, -h * 1.15);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    },
    /* 네발 — 격투·노말 */
    BEAST: function (ctx, r, w, h) {
      ctx.beginPath();
      ctx.ellipse(0, 14, w * 1.02, h * 0.76, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, -h * 0.5, w * 0.7, h * 0.58, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  };

  function bodyFor(types, role, rand) {
    if (types.indexOf('ROCK') >= 0 || types.indexOf('STEEL') >= 0 ||
        types.indexOf('GROUND') >= 0) return 'ROCKY';
    if (types.indexOf('DRAGON') >= 0 || types.indexOf('POISON') >= 0) return 'SERPENT';
    if (types.indexOf('WATER') >= 0 || types.indexOf('ICE') >= 0) return 'DROP';
    if (types.indexOf('FIGHTING') >= 0 || types.indexOf('NORMAL') >= 0 ||
        role === 'TANK') return 'BEAST';
    return rand() < 0.35 ? 'BEAST' : 'BLOB';
  }

  /* ---------- 부속 ---------- */

  function drawWings(ctx, w, h, color) {
    ctx.fillStyle = color;
    [-1, 1].forEach(function (dir) {
      ctx.beginPath();
      ctx.moveTo(dir * w * 0.6, -2);
      ctx.quadraticCurveTo(dir * w * 1.9, -h * 0.95, dir * w * 1.5, h * 0.35);
      ctx.quadraticCurveTo(dir * w * 1.1, h * 0.1, dir * w * 0.6, -2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });
  }

  function drawFlame(ctx, w, h, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -h * 1.05);
    ctx.quadraticCurveTo(w * 0.5, -h * 1.5, 0, -h * 2.0);
    ctx.quadraticCurveTo(-w * 0.5, -h * 1.5, 0, -h * 1.05);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  function drawSpikes(ctx, w, h, color, count) {
    ctx.fillStyle = color;
    for (var i = 0; i < count; i++) {
      var a = -Math.PI * 0.85 + (i / Math.max(1, count - 1)) * Math.PI * 0.7;
      var bx = Math.cos(a) * w * 0.9, by = 6 + Math.sin(a) * h * 0.9;
      ctx.beginPath();
      ctx.moveTo(bx - 7, by);
      ctx.lineTo(bx + Math.cos(a) * 16, by + Math.sin(a) * 16);
      ctx.lineTo(bx + 7, by);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  function drawFins(ctx, w, h, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.9);
    ctx.lineTo(-10, -h * 1.45);
    ctx.lineTo(12, -h * 1.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  function drawEars(ctx, w, h, color) {
    ctx.fillStyle = color;
    [-1, 1].forEach(function (dir) {
      ctx.beginPath();
      ctx.moveTo(dir * w * 0.4, -h * 0.75);
      ctx.lineTo(dir * w * 0.62, -h * 1.55);
      ctx.lineTo(dir * w * 0.05, -h * 0.95);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });
  }

  function drawEyes(ctx, w, h, rand, angry) {
    var ex = w * 0.34, ey = -h * 0.18;
    var r = 8.5;
    [-1, 1].forEach(function (dir) {
      ctx.beginPath();
      ctx.arc(dir * ex, ey, r, 0, Math.PI * 2);
      ctx.fillStyle = '#f6f4e8';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = 'rgba(12,18,13,0.85)';
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(dir * ex + dir * 1.5, ey + 1, r * 0.46, 0, Math.PI * 2);
      ctx.fillStyle = '#16200f';
      ctx.fill();
    });

    if (angry) {
      ctx.strokeStyle = 'rgba(12,18,13,0.9)';
      ctx.lineWidth = 3.5;
      [-1, 1].forEach(function (dir) {
        ctx.beginPath();
        ctx.moveTo(dir * (ex - 10), ey - 12);
        ctx.lineTo(dir * (ex + 8), ey - 5);
        ctx.stroke();
      });
    }
  }

  /* ---------- 본체 ---------- */

  function render(ctx, opts) {
    var types = opts.types || [];
    var rand = rngFrom(hash(opts.seedKey));
    var primary = (RPD.Types[types[0]] || {}).color || '#8a9a8f';
    var secondary = (RPD.Types[types[1]] || {}).color || shade(primary, 0.25);

    // 단계가 오를수록 커지고 각이 선다
    var stage = opts.stage || 1;
    var scale = 0.78 + stage * 0.09 + (opts.awakened ? 0.06 : 0);
    var w = 30 * scale;
    var h = 28 * scale;

    ctx.save();
    ctx.translate(SIZE / 2, SIZE / 2 + 4);

    // 바닥 그림자
    ctx.beginPath();
    ctx.ellipse(0, h * 1.25, w * 0.9, 7, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.20)';
    ctx.fill();

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = 3.4;
    ctx.strokeStyle = 'rgba(12,18,13,0.82)';

    // 부속은 몸통 뒤에 먼저
    if (types.indexOf('FLYING') >= 0) drawWings(ctx, w, h, shade(secondary, 0.1));
    if (types.indexOf('FIRE') >= 0) drawFlame(ctx, w, h, shade(secondary, 0.18));
    if (types.indexOf('WATER') >= 0 || types.indexOf('ICE') >= 0) drawFins(ctx, w, h, shade(secondary, 0.2));

    // 몸통
    var grad = ctx.createLinearGradient(0, -h * 1.2, 0, h * 1.2);
    grad.addColorStop(0, shade(primary, 0.22));
    grad.addColorStop(1, shade(primary, -0.22));
    ctx.fillStyle = grad;
    BODIES[opts.body](ctx, rand, w, h);

    // 배 무늬 — 두 번째 타입을 드러낸다
    if (types.length > 1) {
      ctx.beginPath();
      ctx.ellipse(0, h * 0.38, w * 0.46, h * 0.34, 0, 0, Math.PI * 2);
      ctx.fillStyle = shade(secondary, 0.28);
      ctx.globalAlpha = 0.9;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // 몸통 앞 부속
    if (types.indexOf('ROCK') >= 0 || types.indexOf('STEEL') >= 0 ||
        types.indexOf('DRAGON') >= 0) {
      drawSpikes(ctx, w, h, shade(secondary, -0.1), 2 + stage);
    }
    if (types.indexOf('ELECTRIC') >= 0 || types.indexOf('FAIRY') >= 0 ||
        types.indexOf('PSYCHIC') >= 0) {
      drawEars(ctx, w, h, shade(secondary, 0.12));
    }

    drawEyes(ctx, w, h, rand, opts.angry || stage >= 3);

    ctx.restore();
  }

  /* ---------- 공개 API ---------- */

  var SpriteFactory = {};

  SpriteFactory.available = function () {
    return typeof document !== 'undefined' && !!document.createElement;
  };

  /* def: pokemon 또는 enemy 정의. 캐시된 캔버스를 돌려준다. */
  SpriteFactory.get = function (def, opts) {
    if (!SpriteFactory.available() || !def) return null;
    opts = opts || {};

    var key = def.id;
    if (cache[key]) return cache[key];

    var canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    var ctx = canvas.getContext('2d');
    if (!ctx) return null;

    var types = def.types || [];
    var rand = rngFrom(hash(def.id));

    render(ctx, {
      seedKey: def.id,
      types: types.length ? types : ['NORMAL'],
      stage: def.isBoss ? 4 : (RPD.tierPower ? RPD.tierPower(def.tier) + 1 : RPD.TIER_ORDER.indexOf(def.tier) + 1),
      awakened: false,
      angry: !!def.isBoss,
      body: bodyFor(types, def.role, rand)
    });

    cache[key] = canvas;
    return canvas;
  };

  SpriteFactory.clear = function () { cache = {}; };
  SpriteFactory.size = SIZE;
  SpriteFactory.cacheCount = function () { return Object.keys(cache).length; };

  RPD.SpriteFactory = SpriteFactory;
})(typeof window !== 'undefined' ? window : globalThis);
