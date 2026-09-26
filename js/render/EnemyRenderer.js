/* EnemyRenderer.js — 적을 그린다.
 * 전투 정보(체력·실드·상태)가 이펙트에 가려지지 않는 것이 최우선.
 * 체력바는 항상 몸통 위 고정 위치에 그리고, 상태이상은 색이 아니라 테두리로 표시한다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  var EnemyRenderer = {};

  EnemyRenderer.draw = function (ctx) {
    var list = RPD.EnemyManager.enemies;
    for (var i = 0; i < list.length; i++) {
      drawEnemy(ctx, list[i]);
    }
  };

  /* 진행 방향. 그림은 대부분 왼쪽을 본다 — 오른쪽으로 걸을 때만 뒤집는다. */
  function movingRight(e) {
    var prev = e._lastX;
    e._lastX = e.x;
    if (prev == null || Math.abs(e.x - prev) < 0.01) return !!e._facingRight;
    e._facingRight = e.x > prev;
    return e._facingRight;
  }

  function drawEnemy(ctx, e) {
    var now = RPD.EnemyManager.clock;
    var frozen = now < e.effects.frozenUntil;
    var slowed = !frozen && now < e.effects.slowUntil;
    var size = e.size;

    ctx.save();

    // 바닥 그림자 — 경로 위에 떠 있지 않고 붙어 있는 느낌을 준다
    ctx.beginPath();
    ctx.ellipse(e.x, e.y + size * 0.42, size * 0.36, size * 0.14, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fill();

    if (e.isElite) {   // 불러낸 정예 — 보라 이중 고리
      var ep = 0.5 + 0.5 * Math.sin(now * 5);
      ctx.beginPath();
      ctx.arc(e.x, e.y, size * 0.7 + ep * 3, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(178,120,255,0.85)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(e.x, e.y, size * 0.82 + ep * 4, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(178,120,255,0.3)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    if (e.isBoss) {
      var pulse = 0.5 + 0.5 * Math.sin(now * 4);
      ctx.beginPath();
      ctx.arc(e.x, e.y, size * 0.66 + pulse * 3, 0, Math.PI * 2);
      ctx.strokeStyle = e.enraged ? 'rgba(255,90,60,0.85)' : 'rgba(240,110,90,0.45)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    /* 스킨 그림이 준비됐으면 그것을, 아니면 원래 그림(없으면 코드 생성)을 쓴다.
     * 스킨은 여백이 있어 판정 크기보다 크게 그린다. 판정(e.size)은 건드리지 않는다. */
    var skinReady = e.sprite && RPD.Assets.get(e.sprite) && RPD.Assets.get(e.sprite).state === 'ready';
    var drawSize = skinReady ? size * (e.skinScale || 1.5) : size;
    // 스킨이 아직 읽히는 중이면 원래 경로(없는 파일)를 요청하지 않고 코드 생성 그림으로 잠깐 대신한다
    var src = skinReady ? e.sprite : (e.sprite ? null : e.def.sprite);
    if (e.sprite && !skinReady) RPD.Assets.get(e.sprite);
    RPD.Assets.drawSprite(ctx, src, e.x, e.y, drawSize, {
      label: e.name,
      color: frozen ? mix(e.def.color, '#9fe6f5', 0.6) : e.def.color,
      def: e.def,
      smooth: skinReady,
      flip: skinReady && movingRight(e)
    });
    if (skinReady) size = drawSize * 0.72;   // 체력바·상태 표시를 그림 크기에 맞춘다

    if (frozen) {
      ctx.beginPath();
      ctx.arc(e.x, e.y, size * 0.5, 0, Math.PI * 2);
      ctx.strokeStyle = '#9fe6f5';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    } else if (slowed) {
      ctx.beginPath();
      ctx.arc(e.x, e.y, size * 0.5, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(90,160,224,0.8)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (e.effects.dots.length > 0) {
      ctx.beginPath();
      ctx.arc(e.x + size * 0.36, e.y - size * 0.36, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = '#e0623c';
      ctx.fill();
    }

    if (!e.isBoss) drawBars(ctx, e, size);

    ctx.restore();
  }

  function drawBars(ctx, e, size) {
    var w = Math.max(24, size * 1.15);
    var h = 4;
    var x = e.x - w / 2;
    var y = e.y - size * 0.62;

    // 실드가 있으면 체력바 위에 한 줄 더
    if (e.maxShield > 0) {
      drawBar(ctx, x, y - 5.5, w, 3, e.shield / e.maxShield, '#7fb4f0', 'rgba(0,0,0,0.45)');
    }

    var ratio = Math.max(0, e.hp / e.maxHp);
    var color = ratio > 0.5 ? '#6fd48a' : (ratio > 0.22 ? '#e8c341' : '#e0554f');
    drawBar(ctx, x, y, w, h, ratio, color, 'rgba(0,0,0,0.5)');
  }

  function drawBar(ctx, x, y, w, h, ratio, color, bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, ratio)), h);
  }

  /* 보스 체력바는 화면 상단에 크게. 몸통 위 작은 바로는 진행도가 안 읽힌다. */
  EnemyRenderer.drawBossBar = function (ctx) {
    var boss = RPD.EnemyManager.boss;
    if (!boss || !boss.alive) return;
    // 필드를 돌려 그려도(휴대폰 세로) 체력바는 화면 위쪽에 가로로
    if (RPD.Renderer && RPD.Renderer.withScreenFrame) RPD.Renderer.withScreenFrame(ctx, function (c, W) { drawBossBarIn(c, W, boss); });
    else drawBossBarIn(ctx, RPD.VIEW.width, boss);
  };

  function drawBossBarIn(ctx, W, boss) {
    var barW = Math.min(460, W - 40);
    var x = (W - barW) / 2;
    // 화면 위쪽 가운데는 라운드 진행 알약(DOM)이 차지한다. 그 아래로 내린다.
    var y = 56;

    ctx.save();
    RPD.MapRenderer.roundRect(ctx, x - 8, y - 14, barW + 16, 40, 8);
    ctx.fillStyle = 'rgba(10,16,11,0.82)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(224,85,79,0.55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.font = '700 13px ' + RPD.FONT_STACK;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f0b8b2';
    ctx.fillText(boss.name + (boss.phase >= 2 ? '  2페이즈' : ''), x, y - 3);

    // 다음 패턴 예고 — 뭐가 올지 알아야 대비가 선택이 된다
    var next = RPD.BossManager.nextPattern();
    if (next && next.inSeconds < 6) {
      ctx.textAlign = 'center';
      ctx.font = '700 12px ' + RPD.FONT_STACK;
      ctx.fillStyle = next.inSeconds < 2 ? '#ffd15c' : '#9aa896';
      ctx.fillText(next.label + ' ' + next.inSeconds.toFixed(1) + '초', x + barW / 2, y - 3);
    }

    if (boss.def.timeLimit) {
      var left = Math.max(0, boss.def.timeLimit - boss.age);
      ctx.textAlign = 'right';
      ctx.fillStyle = boss.enraged ? '#ff7a6a' : '#9aa896';
      ctx.fillText(boss.enraged ? '돌진 중' : RPD.Utils.formatTime(left), x + barW, y - 3);
    }

    var ratio = Math.max(0, boss.hp / boss.maxHp);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x, y + 8, barW, 9);
    ctx.fillStyle = boss.enraged ? '#ff6a52' : '#e0554f';
    ctx.fillRect(x, y + 8, barW * ratio, 9);

    ctx.textAlign = 'center';
    ctx.font = '600 11px ' + RPD.FONT_STACK;
    ctx.fillStyle = '#e9e7d8';
    ctx.fillText(Math.ceil(Math.max(0, boss.hp)) + ' / ' + boss.maxHp, x + barW / 2, y + 12.5);
    ctx.restore();
  }

  function mix(a, b, t) {
    var pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    var r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
    var g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
    var bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }

  RPD.EnemyRenderer = EnemyRenderer;
})(typeof window !== 'undefined' ? window : globalThis);
