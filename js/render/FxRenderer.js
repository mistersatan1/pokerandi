/* FxRenderer.js — 손맛 담당.
 *
 * 데미지 숫자는 초당 수백 개가 생겼다 사라진다. 매번 객체를 만들면 GC 가 튀면서
 * 3배속에서 프레임이 끊긴다. 그래서 처음부터 풀링으로 만든다.
 * 사용 후에는 alive=false 로 돌려놓기만 하고 배열은 그대로 재사용한다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;
  var U = RPD.Utils;

  var POOL_TEXT = 220;
  var POOL_PUFF = 90;

  var texts = [];
  var puffs = [];
  var screenFlash = { alpha: 0, color: '#e0554f' };

  for (var i = 0; i < POOL_TEXT; i++) {
    texts.push({ alive: false, x: 0, y: 0, vy: 0, life: 0, maxLife: 1, text: '', color: '#fff', size: 13 });
  }
  for (var j = 0; j < POOL_PUFF; j++) {
    puffs.push({ alive: false, x: 0, y: 0, life: 0, maxLife: 1, radius: 10, color: '#fff', ring: false });
  }

  function takeText() {
    for (var i = 0; i < texts.length; i++) if (!texts[i].alive) return texts[i];
    return texts[(Math.random() * texts.length) | 0];   // 풀이 꽉 차면 가장 오래된 것 대신 아무거나 재활용
  }

  function takePuff() {
    for (var i = 0; i < puffs.length; i++) if (!puffs[i].alive) return puffs[i];
    return puffs[(Math.random() * puffs.length) | 0];
  }

  var FxRenderer = {};

  FxRenderer.reset = function () {
    for (var i = 0; i < texts.length; i++) texts[i].alive = false;
    for (var j = 0; j < puffs.length; j++) puffs[j].alive = false;
    screenFlash.alpha = 0;
  };

  FxRenderer.text = function (x, y, str, color, opts) {
    opts = opts || {};
    var t = takeText();
    t.alive = true;
    t.x = x + (opts.jitter === false ? 0 : U.randRange(-7, 7));
    t.y = y;
    t.vy = opts.vy != null ? opts.vy : -34;
    t.maxLife = opts.life || 0.85;
    t.life = t.maxLife;
    t.text = str;
    t.color = color || '#e9e7d8';
    t.size = opts.size || 13;
    return t;
  };

  FxRenderer.damage = function (x, y, amount, opts) {
    opts = opts || {};
    if (amount < 1) return;
    var crit = !!opts.crit;
    this.text(x, y - 8, (crit ? '' : '') + Math.round(amount), crit ? '#ffd15c' : '#f2efe0', {
      size: crit ? 18 : 13,
      life: crit ? 1.0 : 0.8,
      vy: crit ? -46 : -34
    });
  };

  FxRenderer.puff = function (x, y, color, radius) {
    var p = takePuff();
    p.alive = true;
    p.x = x; p.y = y;
    p.maxLife = 0.42;
    p.life = p.maxLife;
    p.radius = radius || 14;
    p.color = color || '#e9e7d8';
    p.ring = false;
    return p;
  };

  FxRenderer.ring = function (x, y, color, radius, life) {
    var p = takePuff();
    p.alive = true;
    p.x = x; p.y = y;
    p.maxLife = life || 0.6;
    p.life = p.maxLife;
    p.radius = radius || 40;
    p.color = color || '#f0b429';
    p.ring = true;
    return p;
  };

  FxRenderer.flash = function (color, strength) {
    screenFlash.color = color || '#e0554f';
    screenFlash.alpha = Math.max(screenFlash.alpha, strength || 0.3);
  };

  /* 고정 timestep 으로 갱신한다 → 3배속에서는 이펙트도 3배로 빨라져 화면이 밀리지 않는다. */
  FxRenderer.update = function (dt) {
    var i;
    for (i = 0; i < texts.length; i++) {
      var t = texts[i];
      if (!t.alive) continue;
      t.life -= dt;
      t.y += t.vy * dt;
      t.vy += 42 * dt;              // 살짝 감속해서 위로 떠오르다 멈추는 느낌
      if (t.life <= 0) t.alive = false;
    }
    for (i = 0; i < puffs.length; i++) {
      var p = puffs[i];
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) p.alive = false;
    }
    if (screenFlash.alpha > 0) {
      screenFlash.alpha = Math.max(0, screenFlash.alpha - dt * 1.6);
    }
  };

  FxRenderer.draw = function (ctx) {
    var i;

    for (i = 0; i < puffs.length; i++) {
      var p = puffs[i];
      if (!p.alive) continue;
      var k = p.life / p.maxLife;
      ctx.save();
      ctx.globalAlpha = k;
      if (p.ring) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * (1.15 - k * 0.5), 0, Math.PI * 2);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3 * k;
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * (1.5 - k * 0.7), 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = k * 0.55;
        ctx.fill();
      }
      ctx.restore();
    }

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (i = 0; i < texts.length; i++) {
      var t = texts[i];
      if (!t.alive) continue;
      var a = Math.min(1, t.life / (t.maxLife * 0.45));
      ctx.globalAlpha = a;
      ctx.font = '800 ' + t.size + 'px ' + RPD.FONT_STACK;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(10,22,44,0.85)';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.restore();

    if (screenFlash.alpha > 0.001) {
      ctx.save();
      ctx.globalAlpha = screenFlash.alpha;
      ctx.fillStyle = screenFlash.color;
      var fb = RPD.Renderer && RPD.Renderer.logicalBounds ? RPD.Renderer.logicalBounds()
        : { x: 0, y: 0, w: RPD.VIEW.width, h: RPD.VIEW.height };
      ctx.fillRect(fb.x, fb.y, fb.w, fb.h);
      ctx.restore();
    }
  };

  /* 게임 이벤트를 연출로 옮긴다. 이벤트를 쏘는 쪽은 FxRenderer 의 존재를 모른다. */
  FxRenderer.init = function () {
    RPD.bus.on('enemy:damaged', function (p) {
      FxRenderer.damage(p.enemy.x, p.enemy.y, p.amount, { crit: p.crit });
    });

    RPD.bus.on('enemy:died', function (p) {
      var e = p.enemy;
      FxRenderer.puff(e.x, e.y, e.def.color, e.size * 0.7);
      if (e.isBoss) {
        FxRenderer.ring(e.x, e.y, '#f0b429', 90, 0.9);
        FxRenderer.text(e.x, e.y - 34, '보스 처치', '#f0b429', { size: 20, life: 1.4, jitter: false });
      }
    });

    RPD.bus.on('enemy:shieldBroken', function (e) {
      FxRenderer.ring(e.x, e.y, '#7fb4f0', 26, 0.4);
    });

    RPD.bus.on('enemy:leaked', function (e) {
      FxRenderer.flash('#e0554f', 0.26);
      FxRenderer.text(RPD.MapData.exit.x - 60, RPD.MapData.exit.y - 34,
        '-' + (e.def.lifeCost || 1), '#ff8a7a', { size: 19, life: 1.0, jitter: false });
    });

    RPD.bus.on('enemy:frozen', function (e) {
      FxRenderer.ring(e.x, e.y, '#9fe6f5', 20, 0.35);
    });

    RPD.bus.on('summon:granted', function (p) {
      for (var i = 0; i < p.units.length; i++) {
        var u = p.units[i];
        FxRenderer.ring(u.x, u.y, '#6fd48a', 34, 0.5);
        FxRenderer.text(u.x, u.y - 22, u.name, '#6fd48a', { size: 12, life: 0.8, jitter: false });
      }
    });

    /* 특성 발동 — 아이콘과 이름. 금전운은 받은 골드를 함께.
     * 같은 개체가 연달아 터져도 0.6초에 한 번만 띄운다(글자가 겹쳐 읽히지 않는다). */
    var traitShown = {};
    RPD.bus.on('trait:proc', function (p) {
      var key = p.unit.id || p.unit.def.id;
      var now = RPD.EnemyManager.clock || 0;
      if (traitShown[key] && now - traitShown[key] < 0.6) return;
      traitShown[key] = now;
      var info = p.info || {};
      var text = p.trait.icon + ' ' + p.trait.name + (info.label ? '·' + info.label : '') +
        (info.gold ? ' +' + info.gold + 'G' : '');
      var x = info.x != null ? info.x : p.unit.x, y = (info.y != null ? info.y : p.unit.y) - 30;
      FxRenderer.text(x, y, text, info.gold ? '#ffd23f' : '#ffffff', { size: 14, life: 0.9, jitter: false });
    });

    /* 스킬 발동 — 이름을 띄운다. 무엇이 터졌는지 모르면 화면이 그냥 시끄러운 것이 된다. */
    RPD.bus.on('unit:skill', function (p) {
      var tier = RPD.Tiers[p.unit.tier] || RPD.Tiers.T4;
      FxRenderer.text(p.unit.x, p.unit.y - 34, p.skill.name, tier.color,
        { size: 15, life: 1.1, jitter: false });
    });

    RPD.bus.on('unit:upgraded', function (p) {
      FxRenderer.ring(p.unit.x, p.unit.y, '#f0b429', 40, 0.5);
      FxRenderer.text(p.unit.x, p.unit.y - 26, '+' + p.level, '#f0b429',
        { size: 16, life: 0.9, jitter: false });
    });

    RPD.bus.on('field:slotBought', function (p) {
      FxRenderer.ring(p.slot.x, p.slot.y, '#6fd48a', 56, 0.8);
      FxRenderer.text(p.slot.x, p.slot.y - 30, '슬롯 개방', '#6fd48a',
        { size: 15, life: 1.1, jitter: false });
    });

    RPD.bus.on('boss:pattern', function (p) {
      var color = p.id === 'summon' ? '#c07fd0'
                : p.id === 'silence' ? '#7f9ee0' : '#e0554f';
      FxRenderer.text(p.boss.x, p.boss.y - 46, p.label, color,
        { size: 17, life: 1.1, jitter: false });

      if (p.id === 'silence' && p.result.slots) {
        for (var i = 0; i < p.result.slots.length; i++) {
          var slot = RPD.FieldManager.get(p.result.slots[i]);
          if (slot) FxRenderer.ring(slot.x, slot.y, '#7f9ee0', 40, 0.5);
        }
      }
      if (p.id === 'shockwave') FxRenderer.flash('#e0554f', 0.2);
    });

    RPD.bus.on('boss:phase', function (p) {
      FxRenderer.flash('#e0554f', 0.32);
      FxRenderer.text(p.boss.x, p.boss.y - 58, '2페이즈 · ' + p.label, '#ff9a6a',
        { size: 20, life: 1.5, jitter: false });
    });

    RPD.bus.on('boss:enraged', function (e) {
      FxRenderer.flash('#e0554f', 0.34);
      FxRenderer.text(e.x, e.y - 44, '돌진', '#ff7a6a', { size: 22, life: 1.2, jitter: false });
    });

    RPD.bus.on('economy:gold', function (p) {
      if (p.reason === 'interest' && p.delta > 0) {
        FxRenderer.text(RPD.VIEW.width / 2, 120, '이자 +' + p.delta, '#f0b429',
          { size: 17, life: 1.3, jitter: false });
      }
    });
  };

  RPD.FxRenderer = FxRenderer;
})(typeof window !== 'undefined' ? window : globalThis);
