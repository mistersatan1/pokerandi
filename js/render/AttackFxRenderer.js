/* AttackFxRenderer.js — 포켓몬별 공격 연출.
 *
 * 렌더러는 하나, 설정은 55개(attackfx.js).
 *
 * 성능 원칙 (3배속 · 필드 25칸 · 적 30마리에서도 판정 루프를 방해하지 않는다)
 *   - DOM 을 만들지 않는다. 전부 캔버스.
 *   - 파티클은 Float32Array 열(column)로 둔 고정 풀이다. 객체 할당 0.
 *     빈 자리는 스택으로 관리해 꺼내기·돌려놓기가 O(1) 이다.
 *   - 풀이 60% 를 넘으면 새 파티클 수를 줄이고, 85% 를 넘으면 장식 파티클은 건너뛴다.
 *     명중 자체(링·빔·투사체)는 줄이지 않는다 — "누가 때렸는지"는 항상 보여야 한다.
 *   - 빛번짐은 shadowBlur 대신 색별로 한 번 구운 글로우 스프라이트를 drawImage 한다.
 *   - 회전은 ctx.rotate/save 대신 꼭짓점을 직접 계산한다(파티클마다 save/restore 하지 않음).
 *   - 필드 밖으로 나간 파티클은 즉시 버린다.
 *
 * 전투는 즉시 타격이다. 여기서 날리는 투사체는 판정과 무관한 그림이다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  var PI2 = Math.PI * 2;

  /* ---------- 색 레지스트리 ---------- */
  var colors = [];
  var colorIdx = {};
  function cix(c) {
    var i = colorIdx[c];
    if (i === undefined) { i = colors.length; colors.push(c); colorIdx[c] = i; }
    return i;
  }

  /* ---------- 글로우 스프라이트 캐시 ---------- */
  var glowCache = {};
  function glowSprite(color) {
    var g = glowCache[color];
    if (g !== undefined) return g;
    g = null;
    if (typeof document !== 'undefined' && document.createElement) {
      var c = document.createElement('canvas');
      c.width = 32; c.height = 32;
      var x = c.getContext && c.getContext('2d');
      if (x) {
        var grad = x.createRadialGradient(16, 16, 0, 16, 16, 16);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(0.22, color);
        grad.addColorStop(0.55, color);
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = grad;
        x.fillRect(0, 0, 32, 32);
        g = c;
      }
    }
    glowCache[color] = g;
    return g;
  }

  /* ---------- 파티클 풀 ---------- */
  var P_CAP = 1600;
  var P = {
    x: new Float32Array(P_CAP), y: new Float32Array(P_CAP),
    vx: new Float32Array(P_CAP), vy: new Float32Array(P_CAP),
    life: new Float32Array(P_CAP), max: new Float32Array(P_CAP),
    size: new Float32Array(P_CAP), grow: new Float32Array(P_CAP),
    rot: new Float32Array(P_CAP), vr: new Float32Array(P_CAP),
    drag: new Float32Array(P_CAP), grav: new Float32Array(P_CAP),
    kind: new Uint8Array(P_CAP), col: new Uint16Array(P_CAP), alive: new Uint8Array(P_CAP)
  };
  var freeStack = new Uint16Array(P_CAP);
  var freeTop = 0;
  var pActive = 0;

  var K = {
    GLOW: 0, DOT: 1, SPARK: 2, LEAF: 3, SHARD: 4, BUBBLE: 5, SMOKE: 6, STAR: 7,
    FEATHER: 8, COIN: 9, SQUARE: 10, NOTE: 11, PETAL: 12
  };

  function resetParticles() {
    freeTop = 0;
    for (var i = P_CAP - 1; i >= 0; i--) { P.alive[i] = 0; freeStack[freeTop++] = i; }
    pActive = 0;
  }
  resetParticles();

  function spawnP(kind, color, x, y, vx, vy, life, size, opts) {
    if (freeTop === 0) return -1;
    var i = freeStack[--freeTop];
    P.alive[i] = 1; pActive += 1;
    P.kind[i] = kind; P.col[i] = cix(color);
    P.x[i] = x; P.y[i] = y; P.vx[i] = vx; P.vy[i] = vy;
    life *= 1.25;
    P.life[i] = life; P.max[i] = life; P.size[i] = size;
    P.grow[i] = opts && opts.grow || 0;
    P.rot[i] = opts && opts.rot != null ? opts.rot : Math.random() * PI2;
    P.vr[i] = opts && opts.vr || 0;
    P.drag[i] = opts && opts.drag != null ? opts.drag : 2.2;
    P.grav[i] = opts && opts.grav || 0;
    return i;
  }

  /* 풀 사용량에 따른 파티클 배율. 명중 판정이 몰리는 순간에만 줄어든다. */
  var lodCache = 1;
  function lod() { return lodCache; }
  function refreshLod() {
    var used = pActive / P_CAP;
    var f = used > 0.85 ? 0.25 : used > 0.6 ? 0.55 : 1;
    if (RPD.Loop && RPD.Loop.speed >= 3) f *= 0.8;
    lodCache = f;
  }
  function n(count) {
    var v = count * lodCache;
    var whole = v | 0;
    return whole + (Math.random() < v - whole ? 1 : 0);
  }

  /* ---------- 오브젝트 풀(투사체·빔·번개·링) ---------- */
  function makePool(size, factory) {
    var arr = [];
    for (var i = 0; i < size; i++) arr.push(factory());
    return arr;
  }
  function take(pool) {
    for (var i = 0; i < pool.length; i++) if (!pool[i].alive) return pool[i];
    // 가득 차면 가장 수명이 적게 남은 것을 재활용한다
    var best = pool[0];
    for (var j = 1; j < pool.length; j++) if (pool[j].life < best.life) best = pool[j];
    return best;
  }

  var projectiles = makePool(360, function () {
    return { alive: false, sx: 0, sy: 0, cx: 0, cy: 0, tx: 0, ty: 0, t: 0, dur: 1, x: 0, y: 0, ang: 0,
             cfg: null, lvl: 0, crit: false, life: 0, trailAcc: 0, splash: 0, scale: 1, lob: 0, big: false };
  });
  var beams = makePool(140, function () {
    return { alive: false, x1: 0, y1: 0, x2: 0, y2: 0, life: 0, max: 1, width: 2, color: '#fff', color2: '#fff', shape: '' };
  });
  var BOLT_SEG = 9;
  var bolts = makePool(90, function () {
    return { alive: false, pts: new Float32Array((BOLT_SEG + 1) * 2), life: 0, max: 1, width: 2, color: '#fff', color2: '#fff', regen: 0,
             x1: 0, y1: 0, x2: 0, y2: 0 };
  });
  var rings = makePool(220, function () {
    return { alive: false, kind: 'ring', x: 0, y: 0, r0: 0, r1: 10, life: 0, max: 1, width: 2, color: '#fff', color2: '#fff',
             ang: 0, fill: 0 };
  });

  var shake = { time: 0, max: 0, amp: 0, cooldown: 0 };
  var reduceMotion = false;

  var AttackFx = { K: K };

  /* ---------- 공개 API ---------- */

  AttackFx.init = function () {
    try {
      reduceMotion = !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { reduceMotion = false; }

    RPD.bus.on('unit:attack', function (p) {
      if (!p || !p.unit || !p.target) return;
      AttackFx.attack(p.unit, p.target, !!p.crit);
    });
    RPD.bus.on('combat:chain', function (p) {
      if (!p || !p.from || !p.to) return;
      addBolt(p.from.x, p.from.y, p.to.x, p.to.y, '#ffe23a', '#ffffff', 2, 0.14);
      impact(p.to.x, p.to.y, RPD.AttackFxData.resolve(RPD.PokemonData.get('pikachu')) || { impact: 'spark', color: '#ffe23a', color2: '#fff', particles: 3 }, 1, false, 0.7);
    });
    RPD.bus.on('combat:splash', function (p) {
      if (!p || !p.unit) return;
      onSplash(p.unit, p.x, p.y, p.radius);
    });
    // 특성 '멍함' 같은 광역 발동 — 퍼지는 물결로 범위를 보여 준다
    RPD.bus.on('trait:proc', function (p) {
      var info = p && p.info;
      if (!info || !info.radius) return;
      addRing('disc', info.x, info.y, 8, info.radius, 0.45, 0, '#6fb8ff', '#dff2ff', 0.18);
      addRing('ring', info.x, info.y, 8, info.radius, 0.5, 2.5, '#9fd4ff', '#dff2ff');
    });

    RPD.bus.on('unit:skill', function (p) {
      if (p && p.unit) AttackFx.skill(p.unit, p.target || null);
    });
  };

  AttackFx.reset = function () {
    resetParticles();
    var i;
    for (i = 0; i < projectiles.length; i++) projectiles[i].alive = false;
    for (i = 0; i < beams.length; i++) beams[i].alive = false;
    for (i = 0; i < bolts.length; i++) bolts[i].alive = false;
    for (i = 0; i < rings.length; i++) rings[i].alive = false;
    shake.time = 0; shake.cooldown = 0;
    if (RPD.Renderer) { RPD.Renderer.shakeX = 0; RPD.Renderer.shakeY = 0; }
  };

  AttackFx.stats = function () {
    var c = function (pool) { var k = 0; for (var i = 0; i < pool.length; i++) if (pool[i].alive) k++; return k; };
    return { particles: pActive, particleCap: P_CAP, projectiles: c(projectiles), beams: c(beams),
             bolts: c(bolts), rings: c(rings), lod: lodCache };
  };

  AttackFx.configFor = function (defOrUnit) {
    var def = defOrUnit && defOrUnit.def ? defOrUnit.def : defOrUnit;
    return RPD.AttackFxData.resolve(def);
  };

  /* 등급 배율: 흔함 작고 단순 → 전설 크고 화려. 무조건 키우지 않도록 상한을 둔다. */
  /* 필드가 1000x600 논리 좌표를 1.0~1.6배로 확대해 그리므로 기본 크기를 넉넉히 잡는다. */
  var SIZE_MUL = [1.45, 1.62, 1.85, 2.1, 2.45];
  var PART_ADD = [0, 1, 2, 4, 6];
  var TRAIL_MIN = [0, 1, 1, 2, 2];

  AttackFx.attack = function (unit, target, crit) {
    var cfg = RPD.AttackFxData.resolve(unit.def);
    if (!cfg) return;
    refreshLod();
    var lvl = Math.min(4, cfg.tierIndex || 0);
    emitByType(cfg.type, unit, target, cfg, lvl, crit, 1, false);
    unit._fxCfg = cfg;
  };

  /* 스킬 — 같은 설정의 skill 블록을 크게 쓴다. skill 이 없으면 평타를 2배로. */
  AttackFx.skill = function (unit, target) {
    var cfg = RPD.AttackFxData.resolve(unit.def);
    if (!cfg) return;
    refreshLod();
    var sk = cfg.skill || {};
    var merged = {};
    for (var k in cfg) merged[k] = cfg[k];
    for (var s in sk) merged[s] = sk[s];
    var scale = sk.scale || 2;
    var lvl = Math.min(4, cfg.tierIndex || 0);
    var tgt = target || nearestEnemy(unit) || { x: unit.x + 80, y: unit.y };
    // 발동 표시: 시전자 발밑에 링 두 겹 + 섬광
    addRing('ring', unit.x, unit.y, 10, 46 * Math.min(scale, 2.2), 0.45, 4, merged.color, merged.color2);
    addRing('disc', unit.x, unit.y, 4, 30, 0.3, 0, merged.color2, merged.color2, 0.35);
    emitByType(merged.type, unit, tgt, merged, lvl, true, scale, true);
    impact(tgt.x, tgt.y, merged, 4, true, scale);
    requestShake(0.9, true);
  };

  function nearestEnemy(unit) {
    var list = RPD.EnemyManager ? RPD.EnemyManager.enemies : [];
    var best = null, bd = Infinity;
    for (var i = 0; i < list.length; i++) {
      var dx = list[i].x - unit.x, dy = list[i].y - unit.y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = list[i]; }
    }
    return best;
  }

  function emitByType(type, unit, target, cfg, lvl, crit, scale, big) {
    var sx = unit.x, sy = unit.y, tx = target.x, ty = target.y;
    switch (type) {
      case 'BEAM': emitBeam(sx, sy, tx, ty, cfg, lvl, crit, scale, big); break;
      case 'BREATH': emitBreath(sx, sy, tx, ty, cfg, lvl, crit, scale, big); break;
      case 'SLASH': emitSlash(sx, sy, tx, ty, cfg, lvl, crit, scale, big); break;
      case 'CHAIN': emitChain(sx, sy, tx, ty, cfg, lvl, crit, scale, big); break;
      case 'AREA': emitArea(tx, ty, (cfg.radius || 30) * (big ? scale * 0.8 : 1), cfg, lvl, crit, scale); break;
      case 'EXPLOSION':
      case 'ORBIT':
      case 'PROJECTILE':
      default:
        emitProjectiles(unit, sx, sy, tx, ty, cfg, lvl, crit, scale, big, type);
    }
  }

  /* ---------- 투사체 ---------- */

  function emitProjectiles(unit, sx, sy, tx, ty, cfg, lvl, crit, scale, big, type) {
    var count = Math.max(1, cfg.count || 1);
    var dx = tx - sx, dy = ty - sy;
    var dist = Math.sqrt(dx * dx + dy * dy) || 1;
    var nx = -dy / dist, ny = dx / dist;
    var clock = RPD.CombatManager ? RPD.CombatManager.clock : 0;
    var last = null;

    for (var i = 0; i < count; i++) {
      var p = take(projectiles);
      var spread = count > 1 ? (i - (count - 1) / 2) : 0;
      p.alive = true;
      p.cfg = cfg; p.lvl = lvl; p.crit = crit; p.scale = scale; p.big = big;
      p.splash = 0; p.trailAcc = 0; p.t = 0;

      var ox = 0, oy = 0;
      if (type === 'ORBIT') {
        // 시전자 주변 궤도에서 출발해 휘어져 날아간다
        var a = clock * 5 + i * (PI2 / count);
        ox = Math.cos(a) * 16; oy = Math.sin(a) * 16;
      } else {
        ox = nx * spread * 8; oy = ny * spread * 8;
      }
      p.sx = sx + ox; p.sy = sy + oy;
      p.tx = tx + nx * spread * 5; p.ty = ty + ny * spread * 5;

      var curve = (cfg.curve || 0) * (count > 1 ? (spread === 0 ? 0.4 : Math.sign(spread)) : 1);
      if (type === 'ORBIT' && count > 1) curve = (cfg.curve || 40) * (i % 2 ? 1 : -1);
      p.cx = (p.sx + p.tx) / 2 + nx * curve;
      p.cy = (p.sy + p.ty) / 2 + ny * curve;
      p.lob = type === 'EXPLOSION' ? (cfg.arc || 28) * (big ? 1.4 : 1) : 0;

      var speed = cfg.speed || 560;
      var minDur = type === 'EXPLOSION' ? 0.24 : 0.12;
      var maxDur = type === 'EXPLOSION' ? 0.46 : type === 'ORBIT' ? 0.42 : 0.34;
      p.dur = Math.max(minDur, Math.min(maxDur, dist / speed)) * (1 + i * 0.08);
      p.life = p.dur;
      p.x = p.sx; p.y = p.sy; p.ang = Math.atan2(dy, dx);
      p.type = type;
      last = p;
    }
    // 발사 섬광 — 특별함 이상
    if (lvl >= 2 || big) {
      spawnP(K.GLOW, cfg.color, sx + dx / dist * 12, sy + dy / dist * 12, 0, 0, 0.12, 10 * SIZE_MUL[lvl] * scale, { drag: 0 });
    }
    unit._fxLastProj = last;
  }

  function projPos(p, t) {
    var u = 1 - t;
    var x = u * u * p.sx + 2 * u * t * p.cx + t * t * p.tx;
    var y = u * u * p.sy + 2 * u * t * p.cy + t * t * p.ty;
    if (p.lob) y -= p.lob * 4 * t * u;
    return { x: x, y: y };
  }

  function updateProjectiles(dt) {
    for (var i = 0; i < projectiles.length; i++) {
      var p = projectiles[i];
      if (!p.alive) continue;
      p.t += dt;
      var k = Math.min(1, p.t / p.dur);
      var prevX = p.x, prevY = p.y;
      var pos = projPos(p, k);
      p.x = pos.x; p.y = pos.y;
      p.ang = Math.atan2(p.y - prevY, p.x - prevX) || p.ang;

      var cfg = p.cfg;
      var trail = Math.max(cfg.trail || 0, TRAIL_MIN[p.lvl]) + (p.big ? 1 : 0);
      if (trail > 0 && p.type !== 'DELAY') {
        p.trailAcc += dt;
        var every = trail >= 2 ? 0.014 : 0.026;
        while (p.trailAcc >= every) {
          p.trailAcc -= every;
          trailParticle(p, trail);
        }
      }

      if (k >= 1) {
        p.alive = false;
        var sc = p.scale * (p.crit ? 1.25 : 1);
        impact(p.tx, p.ty, cfg, p.lvl, p.crit, sc);
        if (p.type === 'EXPLOSION') {
          emitArea(p.tx, p.ty, Math.max(p.splash, (cfg.radius || 26) * sc), cfg, p.lvl, p.crit, sc);
        } else if (p.splash > 0) {
          emitArea(p.tx, p.ty, p.splash, cfg, p.lvl, p.crit, p.scale);
        }
      }
    }
  }

  function trailParticle(p, strength) {
    var cfg = p.cfg;
    if (lodCache < 0.3 && strength < 2) return;
    var size = (cfg.size || 5) * SIZE_MUL[p.lvl] * p.scale;
    var jx = (Math.random() - 0.5) * size * 0.8, jy = (Math.random() - 0.5) * size * 0.8;
    var x = p.x + jx, y = p.y + jy;
    switch (cfg.trailKind) {
      case 'ember':
        spawnP(K.GLOW, Math.random() < 0.5 ? cfg.color : cfg.color2, x, y, (Math.random() - 0.5) * 20, -20 - Math.random() * 30, 0.28, size * 0.9, { drag: 3 });
        break;
      case 'drop':
        spawnP(K.DOT, cfg.color2, x, y, (Math.random() - 0.5) * 30, 10, 0.22, size * 0.35, { grav: 260 });
        break;
      case 'spark':
        spawnP(K.SPARK, cfg.color2, x, y, (Math.random() - 0.5) * 120, (Math.random() - 0.5) * 120, 0.12, size * 0.4, { drag: 6 });
        break;
      case 'leaf':
        spawnP(K.LEAF, cfg.color, x, y, (Math.random() - 0.5) * 30, 8, 0.4, size * 0.5, { vr: 8, grav: 40 });
        break;
      case 'frost':
        spawnP(K.SHARD, cfg.color2, x, y, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, 0.3, size * 0.4, { vr: 6 });
        break;
      case 'shadow':
        spawnP(K.SMOKE, cfg.color, x, y, 0, -12, 0.35, size * 0.7, { grow: size * 2, drag: 1 });
        break;
      case 'bubble':
        spawnP(K.BUBBLE, cfg.color2, x, y, (Math.random() - 0.5) * 18, -24, 0.34, size * 0.35, { drag: 1 });
        break;
      case 'pebble':
        spawnP(K.SQUARE, cfg.color, x, y, (Math.random() - 0.5) * 40, 0, 0.3, size * 0.35, { grav: 300, vr: 10 });
        break;
      case 'wind':
        spawnP(K.SPARK, cfg.color, x, y, -Math.cos(p.ang) * 90, -Math.sin(p.ang) * 90, 0.16, size * 0.7, { drag: 4 });
        break;
      case 'sparkle':
        spawnP(K.STAR, cfg.color2, x, y, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, 0.36, size * 0.45, { vr: 4 });
        break;
      default:
        spawnP(K.GLOW, cfg.color, x, y, 0, 0, 0.22, size * 0.8, { drag: 2 });
    }
  }

  /* ---------- 빔 ---------- */

  function emitBeam(sx, sy, tx, ty, cfg, lvl, crit, scale, big) {
    var width = (cfg.width || 3) * SIZE_MUL[lvl] * scale * (crit ? 1.25 : 1);
    var count = Math.max(1, cfg.count || 1);
    var dx = tx - sx, dy = ty - sy, dist = Math.sqrt(dx * dx + dy * dy) || 1;
    var nx = -dy / dist, ny = dx / dist;
    for (var i = 0; i < count; i++) {
      var off = count > 1 ? (i - (count - 1) / 2) * width * 1.1 : 0;
      var b = take(beams);
      b.alive = true;
      b.x1 = sx + nx * off; b.y1 = sy + ny * off; b.x2 = tx; b.y2 = ty;
      b.max = (0.14 + lvl * 0.025) * (big ? 1.8 : 1);
      b.life = b.max; b.width = width; b.color = cfg.color; b.color2 = cfg.color2; b.shape = cfg.shape || '';
    }
    // 빔을 따라 흩어지는 입자 — 특별함 이상
    var along = n((lvl >= 2 ? 4 : 1) + (big ? 6 : 0));
    for (var k = 0; k < along; k++) {
      var t = Math.random();
      spawnP(lvl >= 3 ? K.GLOW : K.DOT, Math.random() < 0.5 ? cfg.color : cfg.color2,
        sx + dx * t + (Math.random() - 0.5) * width * 2, sy + dy * t + (Math.random() - 0.5) * width * 2,
        nx * (Math.random() - 0.5) * 60, ny * (Math.random() - 0.5) * 60, 0.25, width * 0.7, { drag: 3 });
    }
    impact(tx, ty, cfg, lvl, crit, scale);
  }

  /* ---------- 브레스(원추형 분사) ---------- */

  function emitBreath(sx, sy, tx, ty, cfg, lvl, crit, scale, big) {
    var dx = tx - sx, dy = ty - sy, dist = Math.sqrt(dx * dx + dy * dy) || 1;
    var ux = dx / dist, uy = dy / dist;
    var spread = (cfg.width || 16) * SIZE_MUL[lvl] * scale;
    var travel = 0.2;
    var count = n(5 + lvl * 3 + (big ? 10 : 0));
    var kind = cfg.style === 'FIRE' ? K.GLOW : cfg.shape === 'powder' ? K.STAR : K.DOT;
    var size = (cfg.size || 4) * SIZE_MUL[lvl] * scale;
    for (var i = 0; i < count; i++) {
      var off = (Math.random() - 0.5) * spread * 1.1;
      var spd = dist / travel * (0.75 + Math.random() * 0.35);
      spawnP(kind, Math.random() < 0.55 ? cfg.color : cfg.color2,
        sx + ux * 10, sy + uy * 10,
        ux * spd + (-uy) * off * 2.2, uy * spd + ux * off * 2.2,
        travel * (0.9 + Math.random() * 0.4), size * (0.8 + Math.random() * 0.8),
        { drag: 1.2, grow: size * 1.4, vr: 5 });
    }
    // 시전자 앞 원추 잔상
    addRing('cone', sx, sy, 0, dist, 0.14, spread, cfg.color, cfg.color2, 0.22);
    ringAngle(Math.atan2(dy, dx));
    // 도착 시점에 명중 연출
    delayedImpact(tx, ty, cfg, lvl, crit, scale, travel * 0.8);
  }

  /* 브레스·번개 같은 즉발형에 약간의 지연 명중을 주기 위한 보이지 않는 투사체 */
  function delayedImpact(x, y, cfg, lvl, crit, scale, delay) {
    var p = take(projectiles);
    p.alive = true; p.cfg = { impact: cfg.impact, color: cfg.color, color2: cfg.color2, particles: cfg.particles,
      size: cfg.size, trail: 0, trailKind: null, style: cfg.style, radius: cfg.radius, shape: 'none', shake: cfg.shake };
    p.lvl = lvl; p.crit = crit; p.scale = scale; p.big = false; p.splash = 0;
    p.sx = x; p.sy = y; p.cx = x; p.cy = y; p.tx = x; p.ty = y; p.lob = 0;
    p.t = 0; p.dur = delay; p.life = delay; p.x = x; p.y = y; p.type = 'DELAY';
    return p;
  }

  /* ---------- 참격 ---------- */

  function emitSlash(sx, sy, tx, ty, cfg, lvl, crit, scale, big) {
    var ang = Math.atan2(ty - sy, tx - sx);
    var size = (cfg.size || 10) * SIZE_MUL[lvl] * scale * (crit ? 1.2 : 1);
    var shape = cfg.shape || 'claw';
    var life = 0.18 + lvl * 0.02;
    if (shape === 'thrust') {
      // 뿔 찌르기 — 시전자에서 적까지 뾰족한 창 잔상
      var b = take(beams);
      b.alive = true; b.x1 = sx; b.y1 = sy; b.x2 = tx; b.y2 = ty;
      b.max = life * 0.8; b.life = b.max; b.width = size * 0.35; b.color = cfg.color; b.color2 = cfg.color2; b.shape = 'thrust';
      addRing('ring', tx, ty, 4, size * 1.6, life, 3, cfg.color2, cfg.color2);
    } else if (shape === 'fang') {
      addRing('fang', tx, ty, size, size, life, 3.2, cfg.color, cfg.color2);
      ringAngle(ang);
    } else if (shape === 'chop') {
      addRing('slash', tx, ty, size * 0.2, size * 1.4, life, 5, cfg.color, cfg.color2);
      ringAngle(ang + Math.PI / 2);
      addRing('ring', tx, ty, 3, size * 1.2, life * 0.9, 3, cfg.color2, cfg.color2);
    } else {
      // 할퀴기 3줄
      for (var i = -1; i <= 1; i++) {
        addRing('slash', tx + Math.cos(ang + Math.PI / 2) * i * size * 0.32, ty + Math.sin(ang + Math.PI / 2) * i * size * 0.32,
          size * 0.1, size * 1.1, life, 2.6, cfg.color, cfg.color2);
        ringAngle(ang + 0.9);
      }
    }
    impact(tx, ty, cfg, lvl, crit, scale);
  }

  /* ---------- 번개 ---------- */

  function emitChain(sx, sy, tx, ty, cfg, lvl, crit, scale, big) {
    var w = (cfg.width || 2.5) * SIZE_MUL[lvl] * scale;
    addBolt(sx, sy, tx, ty, cfg.color, cfg.color2, w, 0.16 + lvl * 0.02);
    if (lvl >= 3 || big) addBolt(sx, sy, tx, ty, cfg.color2, cfg.color, w * 0.5, 0.12);
    impact(tx, ty, cfg, lvl, crit, scale);
  }

  function addBolt(x1, y1, x2, y2, color, color2, width, life) {
    var b = take(bolts);
    b.alive = true; b.x1 = x1; b.y1 = y1; b.x2 = x2; b.y2 = y2;
    b.life = life; b.max = life; b.width = width; b.color = color; b.color2 = color2; b.regen = 0;
    jitterBolt(b);
  }

  function jitterBolt(b) {
    var dx = b.x2 - b.x1, dy = b.y2 - b.y1;
    var dist = Math.sqrt(dx * dx + dy * dy) || 1;
    var nx = -dy / dist, ny = dx / dist;
    var amp = Math.min(18, dist * 0.12);
    for (var i = 0; i <= BOLT_SEG; i++) {
      var t = i / BOLT_SEG;
      var j = (i === 0 || i === BOLT_SEG) ? 0 : (Math.random() - 0.5) * 2 * amp;
      b.pts[i * 2] = b.x1 + dx * t + nx * j;
      b.pts[i * 2 + 1] = b.y1 + dy * t + ny * j;
    }
  }

  /* ---------- 광역 ---------- */

  function onSplash(unit, x, y, radius) {
    var cfg = unit._fxCfg || RPD.AttackFxData.resolve(unit.def);
    if (!cfg) return;
    var lp = unit._fxLastProj;
    if (lp && lp.alive && (cfg.type === 'PROJECTILE' || cfg.type === 'ORBIT' || cfg.type === 'EXPLOSION')) {
      lp.splash = radius;   // 투사체가 도착하는 순간에 광역 연출
      return;
    }
    if (cfg.type === 'AREA') {
      // AREA 는 attack 때 이미 반경 연출을 냈다. 실제 판정 반경으로 한 겹 더 보여 준다.
      addRing('ring', x, y, radius * 0.6, radius, 0.22, 2, cfg.color2, cfg.color2);
      return;
    }
    emitArea(x, y, radius, cfg, Math.min(4, cfg.tierIndex || 0), false, 1);
  }

  function emitArea(x, y, radius, cfg, lvl, crit, scale) {
    var r = Math.max(14, radius);
    var life = 0.3 + lvl * 0.04;
    /* 큰 스킬일수록 채움을 옅게. 필드가 이펙트에 가려지면 무엇이 오는지 안 보인다. */
    var fill = 0.26 / Math.max(1, (scale || 1) * 0.85);
    addRing('disc', x, y, r * 0.3, r, life, 0, cfg.color, cfg.color2, fill);
    addRing('ring', x, y, r * 0.4, r * 1.05, life, 2.5 + lvl * 0.5, cfg.color2, cfg.color2);
    var shape = cfg.shape || '';
    if (shape === 'crack' || shape === 'quake') {
      addRing('crack', x, y, r * 0.2, r, life + 0.15, 2.4, cfg.color, cfg.color2);
      ringAngle(Math.random() * PI2);
    }
    if (shape === 'bloom') {
      addRing('bloom', x, y, r * 0.2, r * 0.7, life + 0.1, 0, cfg.color, cfg.color2);
      ringAngle(Math.random() * PI2);
    }
    var count = n(3 + lvl * 2 + (cfg.particles || 3) * 0.5);
    for (var i = 0; i < count; i++) {
      var a = Math.random() * PI2, d = Math.sqrt(Math.random()) * r * 0.9;
      var px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
      areaParticle(cfg, px, py, a, lvl, scale);
    }
  }

  function areaParticle(cfg, x, y, a, lvl, scale) {
    var size = (cfg.size || 5) * SIZE_MUL[lvl] * scale;
    switch (cfg.impact) {
      case 'dust': case 'shards':
        spawnP(K.SMOKE, cfg.color2, x, y, Math.cos(a) * 30, -10, 0.45, size * 0.8, { grow: size * 2.2, drag: 2 });
        break;
      case 'petals':
        spawnP(K.PETAL, Math.random() < 0.6 ? cfg.color : cfg.color2, x, y, Math.cos(a) * 50, -40, 0.6, size * 0.7, { vr: 7, grav: 60 });
        break;
      case 'spore': case 'poison':
        spawnP(K.SMOKE, cfg.color, x, y, Math.cos(a) * 16, -14, 0.55, size * 0.7, { grow: size * 1.8, drag: 1.2 });
        break;
      case 'burst':
        spawnP(K.GLOW, Math.random() < 0.5 ? cfg.color : cfg.color2, x, y, Math.cos(a) * 20, -50, 0.4, size, { drag: 2 });
        break;
      case 'notes':
        spawnP(K.NOTE, cfg.color, x, y, Math.cos(a) * 20, -40, 0.6, size * 0.7, { drag: 1 });
        break;
      default:
        spawnP(K.GLOW, cfg.color, x, y, Math.cos(a) * 40, Math.sin(a) * 40, 0.3, size * 0.8, { drag: 3 });
    }
  }

  /* ---------- 명중 ---------- */

  function impact(x, y, cfg, lvl, crit, scale) {
    var base = (cfg.particles || 3) + PART_ADD[lvl] + (crit ? 2 : 0);
    var count = n(base);
    var s = (cfg.size || 5) * SIZE_MUL[lvl] * (scale || 1) * (crit ? 1.2 : 1);
    var c1 = cfg.color, c2 = cfg.color2;
    var i, a, sp;

    switch (cfg.impact) {
      case 'burst':
        spawnP(K.GLOW, c2, x, y, 0, 0, 0.16, s * 2.4, { drag: 0 });
        for (i = 0; i < count; i++) {
          a = Math.random() * PI2; sp = 40 + Math.random() * 90;
          spawnP(K.GLOW, Math.random() < 0.5 ? c1 : c2, x, y, Math.cos(a) * sp, Math.sin(a) * sp - 30, 0.3 + Math.random() * 0.2, s * 0.7, { drag: 3.5, grav: -40 });
        }
        break;
      case 'splash':
        addRing('ring', x, y, 2, s * 2.6, 0.24, 2, c2, c2);
        for (i = 0; i < count; i++) {
          a = -Math.PI * Math.random(); sp = 60 + Math.random() * 90;
          spawnP(K.DOT, Math.random() < 0.6 ? c1 : c2, x, y, Math.cos(a) * sp, Math.sin(a) * sp, 0.36, s * 0.35, { grav: 420, drag: 0.6 });
        }
        break;
      case 'spark':
        spawnP(K.GLOW, c2, x, y, 0, 0, 0.1, s * 2.2, { drag: 0 });
        for (i = 0; i < count; i++) {
          a = Math.random() * PI2; sp = 140 + Math.random() * 160;
          spawnP(K.SPARK, Math.random() < 0.5 ? c1 : c2, x, y, Math.cos(a) * sp, Math.sin(a) * sp, 0.14, s * 0.5, { drag: 6 });
        }
        break;
      case 'leaves':
        for (i = 0; i < count; i++) {
          a = Math.random() * PI2; sp = 40 + Math.random() * 70;
          spawnP(K.LEAF, Math.random() < 0.7 ? c1 : c2, x, y, Math.cos(a) * sp, Math.sin(a) * sp - 20, 0.45, s * 0.55, { vr: 9, drag: 2.5, grav: 80 });
        }
        break;
      case 'shards':
        for (i = 0; i < count; i++) {
          a = Math.random() * PI2; sp = 70 + Math.random() * 110;
          spawnP(K.SHARD, Math.random() < 0.6 ? c1 : c2, x, y, Math.cos(a) * sp, Math.sin(a) * sp - 40, 0.42, s * 0.55, { vr: 10, grav: 320, drag: 1 });
        }
        break;
      case 'poison':
        spawnP(K.SMOKE, c1, x, y, 0, -6, 0.4, s * 0.9, { grow: s * 2.4, drag: 1 });
        for (i = 0; i < count; i++) {
          a = Math.random() * PI2;
          spawnP(K.BUBBLE, Math.random() < 0.5 ? c1 : c2, x + Math.cos(a) * s, y + Math.sin(a) * s * 0.6, Math.cos(a) * 20, -30 - Math.random() * 30, 0.45, s * 0.35, { drag: 1.2 });
        }
        break;
      case 'ring':
        addRing('ring', x, y, 2, s * 2.8, 0.26, 2.4, c1, c2);
        if (lvl >= 2 || crit) addRing('ring', x, y, 2, s * 1.6, 0.2, 1.6, c2, c2);
        for (i = 0; i < Math.min(count, 4); i++) {
          a = Math.random() * PI2;
          spawnP(K.GLOW, c2, x, y, Math.cos(a) * 70, Math.sin(a) * 70, 0.22, s * 0.6, { drag: 4 });
        }
        break;
      case 'shadow':
        for (i = 0; i < count; i++) {
          a = Math.random() * PI2; sp = 20 + Math.random() * 40;
          spawnP(K.SMOKE, Math.random() < 0.6 ? c1 : '#2a1a44', x, y, Math.cos(a) * sp, Math.sin(a) * sp - 20, 0.42, s * 0.6, { grow: s * 1.6, drag: 2 });
        }
        break;
      case 'dust':
        for (i = 0; i < count; i++) {
          a = Math.PI + Math.random() * Math.PI; sp = 30 + Math.random() * 60;
          spawnP(i % 3 === 0 ? K.SQUARE : K.SMOKE, i % 3 === 0 ? c1 : c2, x, y + 4, Math.cos(a) * sp, Math.sin(a) * sp * 0.5, 0.45, s * (i % 3 === 0 ? 0.35 : 0.8), { grow: s * 1.6, grav: i % 3 === 0 ? 300 : 0, drag: 2, vr: 8 });
        }
        break;
      case 'metal':
        addRing('ring', x, y, 2, s * 2, 0.16, 1.5, c2, c2);
        for (i = 0; i < count; i++) {
          a = Math.random() * PI2; sp = 160 + Math.random() * 120;
          spawnP(K.SPARK, c2, x, y, Math.cos(a) * sp, Math.sin(a) * sp, 0.12, s * 0.5, { drag: 7 });
        }
        break;
      case 'star':
        for (i = 0; i < count; i++) {
          a = Math.random() * PI2; sp = 40 + Math.random() * 70;
          spawnP(K.STAR, Math.random() < 0.5 ? c1 : c2, x, y, Math.cos(a) * sp, Math.sin(a) * sp, 0.45, s * 0.7, { vr: 5, drag: 3 });
        }
        spawnP(K.GLOW, c2, x, y, 0, 0, 0.16, s * 2, { drag: 0 });
        break;
      case 'feather':
        for (i = 0; i < Math.max(1, count - 1); i++) {
          a = Math.random() * PI2;
          spawnP(K.FEATHER, i % 2 ? c1 : '#ffffff', x, y, Math.cos(a) * 50, Math.sin(a) * 30 - 20, 0.6, s * 0.8, { vr: 3, grav: 60, drag: 2.5 });
        }
        addRing('ring', x, y, 2, s * 1.8, 0.16, 1.6, '#ffffff', '#ffffff');
        break;
      case 'coins':
        for (i = 0; i < count; i++) {
          a = -Math.PI * (0.15 + Math.random() * 0.7); sp = 90 + Math.random() * 80;
          spawnP(K.COIN, c1, x, y, Math.cos(a) * sp, Math.sin(a) * sp, 0.5, s * 0.5, { grav: 420, vr: 14, drag: 0.5 });
        }
        spawnP(K.STAR, c2, x, y - 4, 0, -20, 0.3, s * 0.8, { vr: 4 });
        break;
      case 'spore':
        for (i = 0; i < count; i++) {
          a = Math.random() * PI2; sp = 20 + Math.random() * 40;
          spawnP(i % 2 ? K.DOT : K.SMOKE, Math.random() < 0.6 ? c1 : c2, x, y, Math.cos(a) * sp, Math.sin(a) * sp - 10, 0.5, s * (i % 2 ? 0.3 : 0.6), { grow: s, drag: 2 });
        }
        break;
      case 'petals':
        for (i = 0; i < count; i++) {
          a = Math.random() * PI2; sp = 50 + Math.random() * 60;
          spawnP(K.PETAL, Math.random() < 0.6 ? c1 : c2, x, y, Math.cos(a) * sp, Math.sin(a) * sp - 20, 0.55, s * 0.6, { vr: 8, grav: 80, drag: 2.5 });
        }
        break;
      case 'notes':
        for (i = 0; i < Math.min(count, 5); i++) {
          a = -Math.PI * Math.random();
          spawnP(K.NOTE, i % 2 ? c1 : c2, x, y, Math.cos(a) * 40, -30 - Math.random() * 40, 0.55, s * 0.7, { drag: 1.5 });
        }
        addRing('ring', x, y, 2, s * 2.2, 0.22, 2, c1, c1);
        break;
      case 'thump':
      default:
        addRing('ring', x, y, s * 0.3, s * 2.2, 0.16, 3.4, c2 || '#fff', c2 || '#fff');
        addRing('lines', x, y, s * 0.8, s * 2, 0.14, 2.2, c1, c2);
        ringAngle(Math.random() * PI2);
        for (i = 0; i < Math.min(count, 4); i++) {
          a = Math.random() * PI2;
          spawnP(K.GLOW, c1, x, y, Math.cos(a) * 60, Math.sin(a) * 60, 0.16, s * 0.6, { drag: 5 });
        }
    }

    // 희귀함 이상 · 치명타: 명중 링 한 겹 더
    if (lvl >= 3 || (crit && lvl >= 1)) {
      addRing('ring', x, y, s * 0.5, s * (lvl >= 4 ? 4.2 : 3), 0.28, lvl >= 4 ? 3.2 : 2.2, c1, c2);
    }
    // 전설: 섬광 + 흔들림(치명타일 때만, 쿨다운)
    if (lvl >= 4) {
      spawnP(K.GLOW, c2, x, y, 0, 0, 0.2, s * 3.4, { drag: 0 });
      if (crit && cfg.shake) requestShake(cfg.shake, false);
    }
  }

  /* ---------- 링 / 흔들림 ---------- */

  var lastRing = null;
  var DECOR_RINGS = { disc: 1, lines: 1, crack: 1, cone: 1, bloom: 1 };

  function addRing(kind, x, y, r0, r1, life, width, color, color2, fill) {
    /* 링 풀이 마를 만큼 공격이 몰리면 장식용 링은 건너뛴다.
     * "누가 누구를 때렸는지"를 말하는 링(ring·slash·fang)은 절대 줄이지 않는다. */
    if (lodCache <= 0.3 && DECOR_RINGS[kind]) { lastRing = null; return null; }
    var r = take(rings);
    r.alive = true; r.kind = kind; r.x = x; r.y = y; r.r0 = r0; r.r1 = r1;
    r.life = life; r.max = life; r.width = width; r.color = color; r.color2 = color2 || color;
    r.ang = 0; r.fill = fill || 0;
    lastRing = r;
    return r;
  }
  function ringAngle(a) { if (lastRing) lastRing.ang = a; }


  function requestShake(strength, force) {
    if (reduceMotion) return;
    if (!force && shake.cooldown > 0) return;
    shake.max = 0.16;
    shake.time = shake.max;
    shake.amp = Math.max(shake.time > 0 ? shake.amp : 0, 3.2 * Math.min(1, strength));
    shake.cooldown = force ? 0.2 : 0.7;
  }

  /* ---------- 갱신 ---------- */

  AttackFx.update = function (dt) {
    updateProjectiles(dt);

    var W = RPD.VIEW.width, H = RPD.VIEW.height;
    for (var i = 0; i < P_CAP; i++) {
      if (!P.alive[i]) continue;
      var life = P.life[i] - dt;
      if (life <= 0) { kill(i); continue; }
      P.life[i] = life;
      var drag = 1 - Math.min(0.95, P.drag[i] * dt);
      P.vx[i] *= drag;
      P.vy[i] = P.vy[i] * drag + P.grav[i] * dt;
      P.x[i] += P.vx[i] * dt;
      P.y[i] += P.vy[i] * dt;
      P.rot[i] += P.vr[i] * dt;
      P.size[i] += P.grow[i] * dt;
      // 화면 밖이면 즉시 정리
      if (P.x[i] < -120 || P.x[i] > W + 120 || P.y[i] < -120 || P.y[i] > H + 120) kill(i);
    }

    var k;
    for (k = 0; k < beams.length; k++) {
      if (!beams[k].alive) continue;
      beams[k].life -= dt;
      if (beams[k].life <= 0) beams[k].alive = false;
    }
    for (k = 0; k < bolts.length; k++) {
      var b = bolts[k];
      if (!b.alive) continue;
      b.life -= dt;
      if (b.life <= 0) { b.alive = false; continue; }
      b.regen += dt;
      if (b.regen > 0.045) { b.regen = 0; jitterBolt(b); }
    }
    for (k = 0; k < rings.length; k++) {
      if (!rings[k].alive) continue;
      rings[k].life -= dt;
      if (rings[k].life <= 0) rings[k].alive = false;
    }

    if (shake.cooldown > 0) shake.cooldown -= dt;
    if (RPD.Renderer) {
      if (shake.time > 0) {
        shake.time -= dt;
        var amt = Math.max(0, shake.time / shake.max) * shake.amp;
        RPD.Renderer.shakeX = (Math.random() - 0.5) * 2 * amt;
        RPD.Renderer.shakeY = (Math.random() - 0.5) * 2 * amt;
      } else if (RPD.Renderer.shakeX || RPD.Renderer.shakeY) {
        RPD.Renderer.shakeX = 0; RPD.Renderer.shakeY = 0;
      }
    }
  };

  function kill(i) {
    P.alive[i] = 0;
    freeStack[freeTop++] = i;
    pActive -= 1;
  }

  /* ---------- 그리기 ---------- */

  AttackFx.draw = function (ctx) {
    drawRings(ctx);
    drawBeams(ctx);
    drawBolts(ctx);
    drawProjectiles(ctx);
    drawParticles(ctx);
  };

  function drawRings(ctx) {
    for (var i = 0; i < rings.length; i++) {
      var r = rings[i];
      if (!r.alive) continue;
      var k = 1 - r.life / r.max;               // 0 → 1
      var ease = 1 - (1 - k) * (1 - k);
      var rad = r.r0 + (r.r1 - r.r0) * ease;
      var a = 1 - k;
      ctx.globalAlpha = a;
      switch (r.kind) {
        case 'disc':
          ctx.globalAlpha = a * (r.fill || 0.25);
          ctx.fillStyle = r.color;
          ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, PI2); ctx.fill();
          break;
        case 'slash':
          // 초승달 참격
          ctx.strokeStyle = r.color2; ctx.lineWidth = r.width * (1 - k * 0.6) + 0.5;
          ctx.beginPath(); ctx.arc(r.x, r.y, r.r1 * 0.7, r.ang - 0.9 + k * 0.4, r.ang + 0.9 + k * 0.4); ctx.stroke();
          ctx.strokeStyle = r.color; ctx.lineWidth = r.width * 0.4;
          ctx.beginPath(); ctx.arc(r.x, r.y, r.r1 * 0.62, r.ang - 0.7 + k * 0.4, r.ang + 0.7 + k * 0.4); ctx.stroke();
          break;
        case 'fang':
          // 위아래로 맞물리는 두 개의 송곳니 호
          var close = r.r1 * (0.9 - ease * 0.55);
          ctx.strokeStyle = r.color; ctx.lineWidth = r.width;
          ctx.beginPath(); ctx.arc(r.x, r.y - close * 0.5, r.r1 * 0.55, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
          ctx.beginPath(); ctx.arc(r.x, r.y + close * 0.5, r.r1 * 0.55, 1.2 * Math.PI, 1.8 * Math.PI); ctx.stroke();
          ctx.fillStyle = r.color2;
          ctx.beginPath(); ctx.arc(r.x, r.y, 2 + ease * 3, 0, PI2); ctx.fill();
          break;
        case 'lines':
          ctx.strokeStyle = r.color2; ctx.lineWidth = r.width;
          ctx.beginPath();
          for (var l = 0; l < 6; l++) {
            var la = r.ang + l * (PI2 / 6);
            var c = Math.cos(la), s = Math.sin(la);
            ctx.moveTo(r.x + c * rad * 0.55, r.y + s * rad * 0.55);
            ctx.lineTo(r.x + c * rad, r.y + s * rad);
          }
          ctx.stroke();
          break;
        case 'crack':
          ctx.strokeStyle = 'rgba(70,45,20,0.85)'; ctx.lineWidth = r.width;
          ctx.beginPath();
          for (var cr = 0; cr < 5; cr++) {
            var ca = r.ang + cr * (PI2 / 5);
            var len = r.r1 * (0.6 + ((cr * 37) % 10) / 25);
            ctx.moveTo(r.x, r.y);
            ctx.lineTo(r.x + Math.cos(ca) * len * 0.5 + Math.cos(ca + 1.2) * 5, r.y + Math.sin(ca) * len * 0.5 + Math.sin(ca + 1.2) * 5);
            ctx.lineTo(r.x + Math.cos(ca) * len, r.y + Math.sin(ca) * len);
          }
          ctx.stroke();
          break;
        case 'bloom':
          ctx.fillStyle = r.color;
          for (var pe = 0; pe < 5; pe++) {
            var pa = r.ang + pe * (PI2 / 5) + k * 0.6;
            ctx.beginPath();
            ctx.ellipse(r.x + Math.cos(pa) * rad * 0.55, r.y + Math.sin(pa) * rad * 0.55, rad * 0.42, rad * 0.2, pa, 0, PI2);
            ctx.fill();
          }
          ctx.fillStyle = r.color2;
          ctx.beginPath(); ctx.arc(r.x, r.y, rad * 0.22, 0, PI2); ctx.fill();
          break;
        case 'cone':
          ctx.globalAlpha = a * (r.fill || 0.2);
          ctx.fillStyle = r.color;
          var half = Math.atan2(r.width * 0.6, Math.max(20, r.r1));
          ctx.beginPath();
          ctx.moveTo(r.x, r.y);
          ctx.arc(r.x, r.y, r.r1 * (0.4 + ease * 0.6), r.ang - half, r.ang + half);
          ctx.closePath();
          ctx.fill();
          break;
        default:
          ctx.strokeStyle = r.color2; ctx.lineWidth = Math.max(0.5, r.width * (1 - k * 0.7));
          ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, PI2); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawBeams(ctx) {
    ctx.lineCap = 'round';
    for (var i = 0; i < beams.length; i++) {
      var b = beams[i];
      if (!b.alive) continue;
      var a = b.life / b.max;
      var w = b.width * (0.55 + a * 0.45);
      if (b.shape === 'silk' || b.shape === 'drain') {
        // 가느다란 실 · 흡수선 — 살짝 흔들리는 곡선
        var mx = (b.x1 + b.x2) / 2 + (b.y2 - b.y1) * 0.08 * Math.sin(a * 12);
        var my = (b.y1 + b.y2) / 2 - (b.x2 - b.x1) * 0.08 * Math.sin(a * 12);
        ctx.globalAlpha = a;
        ctx.strokeStyle = b.color; ctx.lineWidth = w + 1;
        ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.quadraticCurveTo(mx, my, b.x2, b.y2); ctx.stroke();
        ctx.strokeStyle = b.color2; ctx.lineWidth = Math.max(0.6, w * 0.4);
        ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.quadraticCurveTo(mx, my, b.x2, b.y2); ctx.stroke();
        continue;
      }
      if (b.shape === 'thrust') {
        // 창끝: 시작점은 가늘고 끝이 뾰족하게 굵다
        var dx = b.x2 - b.x1, dy = b.y2 - b.y1, d = Math.sqrt(dx * dx + dy * dy) || 1;
        var nx = -dy / d, ny = dx / d;
        var sx = b.x1 + dx * (1 - a) * 0.6, sy = b.y1 + dy * (1 - a) * 0.6;
        ctx.globalAlpha = a;
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.moveTo(sx + nx * w * 0.2, sy + ny * w * 0.2);
        ctx.lineTo(b.x2 - dx / d * w * 1.5 + nx * w, b.y2 - dy / d * w * 1.5 + ny * w);
        ctx.lineTo(b.x2 + dx / d * w, b.y2 + dy / d * w);
        ctx.lineTo(b.x2 - dx / d * w * 1.5 - nx * w, b.y2 - dy / d * w * 1.5 - ny * w);
        ctx.lineTo(sx - nx * w * 0.2, sy - ny * w * 0.2);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = b.color2; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(b.x2, b.y2); ctx.stroke();
        continue;
      }
      // 기본 빔: 바깥 색 → 밝은 심. 굵은 빔(solar/cannon)은 바깥에 반투명 테를 한 겹 더
      if (b.width >= 7) {
        ctx.globalAlpha = a * 0.35;
        ctx.strokeStyle = b.color; ctx.lineWidth = w * 2.2;
        ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
      }
      ctx.globalAlpha = a * 0.9;
      ctx.strokeStyle = b.color; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
      ctx.globalAlpha = a;
      ctx.strokeStyle = b.color2; ctx.lineWidth = Math.max(0.8, w * 0.38);
      ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
      if (b.shape === 'psybeam') {
        // 사이코빔: 빔을 따라 도는 작은 고리
        var t = 1 - a;
        ctx.strokeStyle = b.color2; ctx.lineWidth = 1.2;
        for (var q = 0; q < 3; q++) {
          var tt = (t + q / 3) % 1;
          ctx.beginPath();
          ctx.arc(b.x1 + (b.x2 - b.x1) * tt, b.y1 + (b.y2 - b.y1) * tt, w * 1.4, 0, PI2);
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawBolts(ctx) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (var i = 0; i < bolts.length; i++) {
      var b = bolts[i];
      if (!b.alive) continue;
      var a = b.life / b.max;
      for (var pass = 0; pass < 2; pass++) {
        ctx.globalAlpha = pass === 0 ? a * 0.55 : a;
        ctx.strokeStyle = pass === 0 ? b.color : b.color2;
        ctx.lineWidth = pass === 0 ? b.width * 2.4 : Math.max(0.8, b.width * 0.7);
        ctx.beginPath();
        ctx.moveTo(b.pts[0], b.pts[1]);
        for (var s = 1; s <= BOLT_SEG; s++) ctx.lineTo(b.pts[s * 2], b.pts[s * 2 + 1]);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawProjectiles(ctx) {
    for (var i = 0; i < projectiles.length; i++) {
      var p = projectiles[i];
      if (!p.alive || p.type === 'DELAY') continue;
      var cfg = p.cfg;
      var s = (cfg.size || 5) * SIZE_MUL[p.lvl] * p.scale * (p.crit ? 1.15 : 1);
      var x = p.x, y = p.y, ang = p.ang;
      var ca = Math.cos(ang), sa = Math.sin(ang);
      /* 밝은 풀밭 위에서 묻히지 않게: 땅에 옅은 그림자 + 어두운 테두리 */
      var groundY = p.ty + (y - p.ty) * 0.2 + 10;
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = '#10301a';
      ctx.beginPath(); ctx.ellipse(x, groundY, s * 1.3, s * 0.45, 0, 0, PI2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = 'rgba(16,22,48,0.65)';
      ctx.beginPath(); ctx.arc(x, y, s * 1.25, 0, PI2); ctx.stroke();
      // 공통 빛번짐 — 안흔함 이상
      if (p.lvl >= 1 || p.big) drawGlow(ctx, cfg.color, x, y, s * 2.2, 0.55);

      switch (cfg.shape) {
        case 'flame': case 'fireball': case 'wisp':
          var tail = s * (cfg.shape === 'fireball' ? 2.6 : 2.0);
          var wob = cfg.shape === 'wisp' ? Math.sin(p.t * 40) * s * 0.4 : 0;
          ctx.fillStyle = cfg.color;
          ctx.beginPath();
          ctx.moveTo(x - ca * tail - sa * wob, y - sa * tail + ca * wob);
          ctx.lineTo(x - sa * s, y + ca * s);
          ctx.arc(x, y, s, ang + Math.PI / 2, ang - Math.PI / 2, true);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = cfg.color2;
          ctx.beginPath(); ctx.arc(x + ca * s * 0.2, y + sa * s * 0.2, s * 0.55, 0, PI2); ctx.fill();
          break;
        case 'bubble': case 'glob':
          ctx.fillStyle = cfg.color;
          ctx.globalAlpha = cfg.shape === 'bubble' ? 0.55 : 0.95;
          ctx.beginPath(); ctx.arc(x, y, s, 0, PI2); ctx.fill();
          ctx.globalAlpha = 1;
          ctx.strokeStyle = cfg.color2; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(x, y, s, 0, PI2); ctx.stroke();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(x - s * 0.35, y - s * 0.35, s * 0.25, 0, PI2); ctx.fill();
          break;
        case 'seed':
          ctx.fillStyle = cfg.color;
          ctx.beginPath(); ctx.ellipse(x, y, s * 1.2, s * 0.8, ang, 0, PI2); ctx.fill();
          ctx.fillStyle = cfg.color2;
          ctx.beginPath(); ctx.ellipse(x + ca * s * 0.3, y + sa * s * 0.3, s * 0.5, s * 0.3, ang, 0, PI2); ctx.fill();
          break;
        case 'leaf':
          var rot = p.t * (cfg.spin || 10);
          ctx.fillStyle = cfg.color;
          ctx.beginPath(); ctx.ellipse(x, y, s * 1.4, s * 0.55, rot, 0, PI2); ctx.fill();
          ctx.strokeStyle = cfg.color2; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x - Math.cos(rot) * s * 1.2, y - Math.sin(rot) * s * 1.2); ctx.lineTo(x + Math.cos(rot) * s * 1.2, y + Math.sin(rot) * s * 1.2); ctx.stroke();
          break;
        case 'needle': case 'drill':
          var len = s * 3.2;
          ctx.strokeStyle = cfg.color; ctx.lineWidth = Math.max(1.2, s * 0.5); ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(x - ca * len, y - sa * len); ctx.lineTo(x, y); ctx.stroke();
          ctx.strokeStyle = cfg.color2; ctx.lineWidth = Math.max(1, s * 0.3);
          ctx.beginPath(); ctx.moveTo(x - ca * len * 0.3, y - sa * len * 0.3); ctx.lineTo(x + ca * s * 0.8, y + sa * s * 0.8); ctx.stroke();
          if (cfg.shape === 'drill') {
            var sp = p.t * (cfg.spin || 20);
            ctx.strokeStyle = cfg.color2; ctx.lineWidth = 1;
            for (var d = 0; d < 3; d++) {
              var off = -len * (0.25 + d * 0.25);
              ctx.beginPath();
              ctx.ellipse(x + ca * off, y + sa * off, s * 0.4, s * 1.1, ang + Math.sin(sp + d) * 0.3, 0, PI2);
              ctx.stroke();
            }
          }
          break;
        case 'rock': case 'sand':
          var rr = p.t * (cfg.spin || 8);
          if (cfg.shape === 'sand') {
            ctx.fillStyle = cfg.color;
            for (var g = 0; g < 5; g++) {
              var ga = rr + g * 1.26;
              ctx.fillRect(x + Math.cos(ga) * s * 0.7 - s * 0.35, y + Math.sin(ga) * s * 0.7 - s * 0.35, s * 0.7, s * 0.7);
            }
          } else {
            polygon(ctx, x, y, s * 1.1, 5, rr, cfg.color);
            polygon(ctx, x - s * 0.2, y - s * 0.2, s * 0.5, 5, rr + 0.5, cfg.color2);
          }
          break;
        case 'star': case 'moon':
          if (cfg.shape === 'moon') {
            ctx.fillStyle = cfg.color2;
            ctx.beginPath(); ctx.arc(x, y, s, 0, PI2); ctx.fill();
            ctx.fillStyle = cfg.color;
            ctx.beginPath(); ctx.arc(x + s * 0.4, y - s * 0.25, s * 0.8, 0, PI2); ctx.fill();
          }
          star(ctx, x, y, cfg.shape === 'moon' ? s * 0.6 : s * 1.3, p.t * (cfg.spin || 5), cfg.shape === 'moon' ? '#ffffff' : cfg.color);
          break;
        case 'note':
          note(ctx, x, y + Math.sin(p.t * 26) * 3, s, cfg.color);
          break;
        case 'crescent':
          ctx.strokeStyle = cfg.color2; ctx.lineWidth = Math.max(1.5, s * 0.45);
          ctx.beginPath(); ctx.arc(x - ca * s * 0.6, y - sa * s * 0.6, s * 1.2, ang - 1.1, ang + 1.1); ctx.stroke();
          ctx.strokeStyle = cfg.color; ctx.lineWidth = Math.max(1, s * 0.22);
          ctx.beginPath(); ctx.arc(x - ca * s * 1.4, y - sa * s * 1.4, s * 1.2, ang - 0.9, ang + 0.9); ctx.stroke();
          break;
        case 'wave':
          ctx.strokeStyle = cfg.color; ctx.lineWidth = 2;
          for (var wv = 0; wv < 3; wv++) {
            ctx.globalAlpha = 1 - wv * 0.28;
            ctx.beginPath(); ctx.arc(x - ca * wv * s * 0.7, y - sa * wv * s * 0.7, s * (1 - wv * 0.18), ang - 0.8, ang + 0.8); ctx.stroke();
          }
          ctx.globalAlpha = 1;
          if (cfg.style === 'FAIRY') note(ctx, x + sa * s, y - ca * s, s * 0.5, cfg.color2);
          break;
        case 'coin':
          var spinw = Math.abs(Math.cos(p.t * (cfg.spin || 16)));
          ctx.fillStyle = cfg.color;
          ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.8, s * spinw), s, 0, 0, PI2); ctx.fill();
          ctx.strokeStyle = '#b07a10'; ctx.lineWidth = 1;
          ctx.stroke();
          break;
        case 'spore': case 'powder':
          ctx.fillStyle = cfg.color;
          for (var sp2 = 0; sp2 < 4; sp2++) {
            var saa = p.t * 6 + sp2 * 1.57;
            ctx.beginPath(); ctx.arc(x + Math.cos(saa) * s * 0.8, y + Math.sin(saa) * s * 0.8, s * 0.45, 0, PI2); ctx.fill();
          }
          ctx.fillStyle = cfg.color2;
          ctx.beginPath(); ctx.arc(x, y, s * 0.4, 0, PI2); ctx.fill();
          break;
        case 'orb':
        default:
          ctx.fillStyle = cfg.color;
          ctx.beginPath(); ctx.arc(x, y, s, 0, PI2); ctx.fill();
          ctx.fillStyle = cfg.color2;
          ctx.beginPath(); ctx.arc(x, y, s * 0.5, 0, PI2); ctx.fill();
          if (cfg.style === 'PSYCHIC') {
            ctx.strokeStyle = cfg.color2; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(x, y, s * (1.4 + Math.sin(p.t * 30) * 0.3), 0, PI2); ctx.stroke();
          }
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawGlow(ctx, color, x, y, radius, alpha) {
    var g = glowSprite(color);
    if (!g) return;
    ctx.globalAlpha = alpha;
    ctx.drawImage(g, x - radius, y - radius, radius * 2, radius * 2);
    ctx.globalAlpha = 1;
  }

  function polygon(ctx, x, y, r, sides, rot, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (var i = 0; i < sides; i++) {
      var a = rot + i * (PI2 / sides);
      var rr = r * (i % 2 ? 0.82 : 1);
      if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }

  function star(ctx, x, y, r, rot, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (var i = 0; i < 8; i++) {
      var a = rot + i * (Math.PI / 4);
      var rr = i % 2 ? r * 0.38 : r;
      if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }

  function note(ctx, x, y, s, color) {
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, s * 0.22);
    ctx.beginPath(); ctx.ellipse(x, y, s * 0.55, s * 0.4, -0.4, 0, PI2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + s * 0.48, y); ctx.lineTo(x + s * 0.48, y - s * 1.5); ctx.lineTo(x + s * 1.0, y - s * 1.2); ctx.stroke();
  }

  function drawParticles(ctx) {
    var i, a, x, y, s, c, r, co, si;
    // 1) 일반 합성
    for (i = 0; i < P_CAP; i++) {
      if (!P.alive[i]) continue;
      var kind = P.kind[i];
      if (kind === K.GLOW) continue;
      a = P.life[i] / P.max[i];
      x = P.x[i]; y = P.y[i]; s = P.size[i]; c = colors[P.col[i]]; r = P.rot[i];
      switch (kind) {
        case K.DOT:
          ctx.globalAlpha = a; ctx.fillStyle = c;
          ctx.beginPath(); ctx.arc(x, y, Math.max(0.5, s), 0, PI2); ctx.fill();
          break;
        case K.SPARK:
          ctx.globalAlpha = a; ctx.strokeStyle = c; ctx.lineWidth = Math.max(0.8, s * 0.45); ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - P.vx[i] * 0.035, y - P.vy[i] * 0.035); ctx.stroke();
          break;
        case K.LEAF: case K.PETAL:
          ctx.globalAlpha = a; ctx.fillStyle = c;
          ctx.beginPath(); ctx.ellipse(x, y, s, s * (kind === K.PETAL ? 0.6 : 0.45), r, 0, PI2); ctx.fill();
          break;
        case K.FEATHER:
          ctx.globalAlpha = a; ctx.fillStyle = c;
          ctx.beginPath(); ctx.ellipse(x, y, s * 1.2, s * 0.3, r, 0, PI2); ctx.fill();
          break;
        case K.SHARD:
          ctx.globalAlpha = a; ctx.fillStyle = c;
          co = Math.cos(r); si = Math.sin(r);
          ctx.beginPath();
          ctx.moveTo(x + co * s, y + si * s);
          ctx.lineTo(x - co * s * 0.6 - si * s * 0.5, y - si * s * 0.6 + co * s * 0.5);
          ctx.lineTo(x - co * s * 0.6 + si * s * 0.5, y - si * s * 0.6 - co * s * 0.5);
          ctx.closePath(); ctx.fill();
          break;
        case K.SQUARE:
          ctx.globalAlpha = a; ctx.fillStyle = c;
          ctx.fillRect(x - s / 2, y - s / 2, s, s);
          break;
        case K.BUBBLE:
          ctx.globalAlpha = a; ctx.strokeStyle = c; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(x, y, Math.max(0.8, s), 0, PI2); ctx.stroke();
          break;
        case K.SMOKE:
          ctx.globalAlpha = a * 0.38; ctx.fillStyle = c;
          ctx.beginPath(); ctx.arc(x, y, Math.max(1, s), 0, PI2); ctx.fill();
          break;
        case K.STAR:
          ctx.globalAlpha = a;
          star(ctx, x, y, s, r, c);
          break;
        case K.COIN:
          ctx.globalAlpha = a; ctx.fillStyle = c;
          ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.6, s * Math.abs(Math.cos(r))), s, 0, 0, PI2); ctx.fill();
          break;
        case K.NOTE:
          ctx.globalAlpha = a;
          note(ctx, x, y, s, c);
          break;
      }
    }
    ctx.globalAlpha = 1;

    /* 2) 빛 파티클 — 한 번에 모아서.
     * 가산 합성('lighter')은 어두운 배경용이다. 밝은 풀밭에서는 하얗게 날아가 안 보여서
     * 일반 합성으로 색을 그대로 얹는다. */
    for (i = 0; i < P_CAP; i++) {
      if (!P.alive[i] || P.kind[i] !== K.GLOW) continue;
      var g = glowSprite(colors[P.col[i]]);
      a = P.life[i] / P.max[i];
      s = P.size[i];
      ctx.globalAlpha = a;
      if (g) ctx.drawImage(g, P.x[i] - s, P.y[i] - s, s * 2, s * 2);
      else { ctx.fillStyle = colors[P.col[i]]; ctx.beginPath(); ctx.arc(P.x[i], P.y[i], s * 0.5, 0, PI2); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
  }

  RPD.AttackFx = AttackFx;
})(typeof window !== 'undefined' ? window : globalThis);
