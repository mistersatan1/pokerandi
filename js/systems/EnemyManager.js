/* EnemyManager.js — 살아 있는 적 전부의 주인.
 *
 * 여기서 하는 일: 생성, 이동, 상태이상 시간 관리, 피해 적용, 사망/분열, 출구 통과.
 * 여기서 안 하는 일: 누가 때릴지 고르는 것(PHASE 7 CombatManager), 그리는 것(EnemyRenderer).
 *
 * 상태이상 슬롯(slow/freeze/burn/poison)은 지금 비어 있지만 구조는 미리 잡아 둔다.
 * PHASE 8 에서 SkillManager 가 apply* 함수만 호출하면 바로 붙는다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;
  var U = RPD.Utils;

  var EnemyManager = {
    enemies: [],
    boss: null,
    // 상태이상 만료 판정용 자체 시계.
    // GameManager.elapsed 를 쓰면 "GM.update 가 먼저 불렸는가"라는 숨은 전제가 생긴다.
    clock: 0
  };

  EnemyManager.reset = function () {
    this.enemies.length = 0;
    this.boss = null;
    this.clock = 0;
    RPD.bus.emit('enemy:countChanged', 0);
  };

  EnemyManager.aliveCount = function () { return this.enemies.length; };
  /* 라운드 진행이 기다리는 적 — 플레이어가 불러낸 정예는 뺀다.
   * 정예 하나 때문에 라운드가 안 끝나면 "정예를 부르면 게임이 느려진다"가 된다. */
  EnemyManager.waveAliveCount = function () {
    var n = 0;
    for (var i = 0; i < this.enemies.length; i++) if (!this.enemies[i].isElite) n += 1;
    return n;
  };

  /* ---------- 생성 ---------- */

  EnemyManager.spawn = function (enemyId, wave, opts) {
    opts = opts || {};
    var def = RPD.EnemyData.get(enemyId);
    var WD = RPD.WaveData;
    var mode = RPD.GameManager.mode;

    var maxHp = Math.round(WD.enemyMaxHp(def, wave, mode));
    var shield = def.shieldRatio ? Math.round(maxHp * def.shieldRatio) : 0;

    var enemy = {
      id: U.uid('enemy'),
      defId: def.id,
      def: def,
      name: def.name,
      isBoss: !!def.isBoss,
      isElite: !!def.isElite,

      distance: opts.distance || 0,
      x: 0, y: 0,

      maxHp: maxHp,
      hp: maxHp,
      maxShield: shield,
      shield: shield,

      baseSpeed: WD.scaleSpeed(def.speed, wave),
      armor: WD.scaleArmor(def.armor, wave),
      size: def.size,

      wave: wave,
      alive: true,
      // 상태이상 컨테이너 — PHASE 8 에서 채워진다
      effects: { slowMul: 1, slowUntil: 0, frozenUntil: 0, dots: [], armorShred: 0 },
      age: 0,
      enraged: false,
      damageTaken: 0
    };

    /* 겉모습 — 라운드 구간마다 다른 몬스터로 보인다. 판정·수치는 그대로다. */
    var skin = RPD.EnemySkins ? RPD.EnemySkins.resolve(def.skinAs ? RPD.EnemyData.get(def.skinAs) : def, wave) : null;
    if (skin) {
      enemy.sprite = skin.sprite;
      enemy.name = skin.name;
      enemy.skinScale = skin.scale;
      enemy.elite = !!skin.elite;
    }

    var p = RPD.MapData.path.pointAt(enemy.distance);
    enemy.x = p.x;
    enemy.y = p.y;

    this.enemies.push(enemy);
    if (enemy.isBoss) this.boss = enemy;

    RPD.bus.emit('enemy:spawned', enemy);
    RPD.bus.emit('enemy:countChanged', this.enemies.length);
    return enemy;
  };

  /* 군집형은 한 항목이 여러 마리다. 살짝 간격을 두고 줄줄이 세운다. */
  EnemyManager.spawnEntry = function (enemyId, wave) {
    var def = RPD.EnemyData.get(enemyId);
    if (!def.packSize || def.packSize <= 1) return [this.spawn(enemyId, wave)];

    var out = [];
    for (var i = 0; i < def.packSize; i++) {
      out.push(this.spawn(enemyId, wave, { distance: -i * 16 }));
    }
    return out;
  };

  /* ---------- 갱신 ---------- */

  EnemyManager.update = function (dt) {
    var path = RPD.MapData.path;
    this.clock += dt;
    var now = this.clock;

    for (var i = this.enemies.length - 1; i >= 0; i--) {
      var e = this.enemies[i];
      e.age += dt;

      tickEffects(e, dt, now);
      // 지속 피해로 이번 틱에 죽었을 수 있다. 죽은 적은 이미 배열에서 빠졌으므로
      // 계속 진행하면 엉뚱한 인덱스를 건드리게 된다.
      if (!e.alive) continue;

      if (e.def.regenPerSecond && e.hp < e.maxHp) {
        e.hp = Math.min(e.maxHp, e.hp + e.maxHp * e.def.regenPerSecond * dt);
      }

      if (e.isBoss && e.def.timeLimit && !e.enraged && e.age >= e.def.timeLimit) {
        e.enraged = true;
        RPD.bus.emit('boss:enraged', e);
      }

      var speed = currentSpeed(e);
      if (speed > 0) {
        e.distance += speed * dt;
        var p = path.pointAt(e.distance);
        e.x = p.x;
        e.y = p.y;
      }

      if (path.isFinished(e.distance)) {
        leak(this, e);
      }
    }
  };

  function currentSpeed(e) {
    var now = EnemyManager.clock;
    if (now < e.effects.frozenUntil) return 0;
    var s = e.baseSpeed;
    if (now < e.effects.slowUntil) s *= e.effects.slowMul;
    if (e.enraged) s *= (e.def.enrageSpeedMul || 2);
    return s;
  }

  EnemyManager.currentSpeed = currentSpeed;

  function tickEffects(e, dt, now) {
    if (now >= e.effects.slowUntil) e.effects.slowMul = 1;

    var dots = e.effects.dots;
    for (var i = dots.length - 1; i >= 0; i--) {
      var d = dots[i];
      d.remaining -= dt;
      applyRaw(e, d.perSecond * dt, d.source);
      if (d.remaining <= 0) dots.splice(i, 1);
    }
  }

  /* ---------- 피해 ---------- */

  /* opts: { ignoreArmor, armorPierce, crit, source, flatShieldBonus }
   * 반환: 실제로 들어간 피해량
   */
  EnemyManager.damage = function (enemy, amount, opts) {
    if (!enemy || !enemy.alive || amount <= 0) return 0;
    opts = opts || {};

    // 옆 버퍼가 준 방어 무시 · 보스 피해 (auras.js) — 기본 공격 · 스킬 · 특성 모두 여기를 지난다
    var ax = opts.source && opts.source.auraExtras;
    var auraPierce = ax && ax.armorPierce ? enemy.armor * ax.armorPierce : 0;
    if (ax && ax.bossDamage && enemy.isBoss) amount *= 1 + ax.bossDamage;
    var armor = Math.max(0, enemy.armor - (enemy.effects.armorShred || 0) - (opts.armorPierce || 0) - auraPierce);
    var mitigation = opts.ignoreArmor ? 1 : (100 / (100 + armor));
    var dealt = amount * mitigation;

    // 실드는 타격 1회당 최소치가 보장된다 → 다단히트가 유리해진다
    if (enemy.shield > 0) {
      var flat = enemy.def.shieldFlatReduction || 0;
      var toShield = Math.max(dealt, flat);
      if (toShield >= enemy.shield) {
        dealt -= enemy.shield * (dealt / (toShield || 1));
        enemy.shield = 0;
        RPD.bus.emit('enemy:shieldBroken', enemy);
      } else {
        enemy.shield -= toShield;
        recordDamage(enemy, toShield, opts);
        return toShield;
      }
    }

    return applyRaw(enemy, dealt, opts.source, opts);
  };

  function applyRaw(enemy, dealt, source, opts) {
    if (!enemy.alive || dealt <= 0) return 0;
    var actual = Math.min(dealt, enemy.hp);
    enemy.hp -= dealt;
    recordDamage(enemy, actual, opts || { source: source });

    if (enemy.hp <= 0) kill(EnemyManager, enemy, source);
    return actual;
  }

  function recordDamage(enemy, amount, opts) {
    enemy.damageTaken += amount;
    RPD.bus.emit('enemy:damaged', {
      enemy: enemy, amount: amount,
      crit: !!(opts && opts.crit),
      source: opts && opts.source
    });
  }

  /* 지속 피해.
   * kind 를 주면 같은 종류끼리 관리된다.
   *   maxStacks 없음 → 갱신형 (화상: 때릴 때마다 새로 걸지 않고 더 센 쪽으로 갱신)
   *   maxStacks 있음 → 중첩형 (독: 한도까지 쌓이고, 넘치면 가장 약한 스택을 밀어낸다)
   * kind 가 없으면 그냥 하나 추가한다.
   */
  EnemyManager.applyDot = function (enemy, perSecond, duration, source, kind, maxStacks) {
    if (!enemy || !enemy.alive || perSecond <= 0) return;
    var dots = enemy.effects.dots;

    if (!kind) {
      dots.push({ perSecond: perSecond, remaining: duration, source: source, kind: null });
      return;
    }

    var same = [];
    for (var i = 0; i < dots.length; i++) if (dots[i].kind === kind) same.push(dots[i]);

    if (!maxStacks) {
      if (same.length) {
        var d = same[0];
        d.perSecond = Math.max(d.perSecond, perSecond);
        d.remaining = Math.max(d.remaining, duration);
        d.source = source;
        return;
      }
    } else if (same.length >= maxStacks) {
      var weakest = same[0];
      for (var k = 1; k < same.length; k++) {
        if (same[k].perSecond < weakest.perSecond) weakest = same[k];
      }
      if (weakest.perSecond >= perSecond) {
        weakest.remaining = Math.max(weakest.remaining, duration);
        return;
      }
      dots.splice(dots.indexOf(weakest), 1);
    }

    dots.push({ perSecond: perSecond, remaining: duration, source: source, kind: kind });
  };

  EnemyManager.dotStacks = function (enemy, kind) {
    var n = 0, dots = enemy.effects.dots;
    for (var i = 0; i < dots.length; i++) if (dots[i].kind === kind) n += 1;
    return n;
  };

  EnemyManager.applySlow = function (enemy, mul, duration) {
    if (!enemy || !enemy.alive) return;
    var now = EnemyManager.clock;
    // 더 강한 슬로우가 우선한다 (중첩은 물 시너지 6단계에서 해금)
    if (mul < enemy.effects.slowMul || now >= enemy.effects.slowUntil) {
      enemy.effects.slowMul = mul;
    }
    enemy.effects.slowUntil = Math.max(enemy.effects.slowUntil, now + duration);
  };

  EnemyManager.applyFreeze = function (enemy, duration) {
    if (!enemy || !enemy.alive) return;
    enemy.effects.frozenUntil = Math.max(
      enemy.effects.frozenUntil, EnemyManager.clock + duration
    );
    RPD.bus.emit('enemy:frozen', enemy);
  };

  /* ---------- 사망 / 통과 ---------- */

  function kill(mgr, enemy, source) {
    if (!enemy.alive) return;
    enemy.alive = false;

    var idx = mgr.enemies.indexOf(enemy);
    if (idx >= 0) mgr.enemies.splice(idx, 1);
    if (mgr.boss === enemy) mgr.boss = null;

    if (enemy.def.splitInto) spawnSplit(mgr, enemy);

    RPD.bus.emit('enemy:died', { enemy: enemy, source: source });
    RPD.bus.emit('enemy:countChanged', mgr.enemies.length);
  }

  EnemyManager.kill = function (enemy, source) { kill(this, enemy, source); };

  function spawnSplit(mgr, enemy) {
    var cfg = enemy.def.splitInto;
    for (var i = 0; i < cfg.count; i++) {
      // 진행 방향으로 살짝 어긋나게 놓아 겹쳐 보이지 않게 한다
      var offset = (i - (cfg.count - 1) / 2) * (cfg.spread || 30);
      var child = mgr.spawn(cfg.id, enemy.wave, {
        distance: Math.max(0, enemy.distance + offset)
      });
      RPD.bus.emit('enemy:split', { parent: enemy, child: child });
    }
  }

  function leak(mgr, enemy) {
    enemy.alive = false;
    enemy.leaked = true;
    // 같은 프레임에 다른 적이 죽어 배열이 밀렸을 수 있으므로 인덱스를 다시 찾는다.
    var idx = mgr.enemies.indexOf(enemy);
    if (idx >= 0) mgr.enemies.splice(idx, 1);
    if (mgr.boss === enemy) mgr.boss = null;

    // lifeCost 0 은 "안 깎는다"(정예 — 벌칙은 EliteManager 가 따로 준다). || 1 로 쓰면 0 이 1 이 된다.
    var cost = enemy.def.lifeCost == null ? 1 : enemy.def.lifeCost;
    if (cost > 0) RPD.GameManager.loseLife(cost);
    RPD.bus.emit('enemy:leaked', enemy);
    RPD.bus.emit('enemy:countChanged', mgr.enemies.length);
  }

  /* ---------- 조회 (PHASE 7 타겟팅이 쓸 API) ---------- */

  EnemyManager.queryInRange = function (x, y, range, out) {
    var result = out || [];
    result.length = 0;
    var r2 = range * range;
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      if (!e.alive) continue;
      var dx = e.x - x, dy = e.y - y;
      if (dx * dx + dy * dy <= r2) result.push(e);
    }
    return result;
  };

  // 출구에 가장 가까운 적 = 가장 위험한 적. 기본 타겟팅 규칙이 된다.
  EnemyManager.mostAdvancedInRange = function (x, y, range) {
    var best = null;
    var r2 = range * range;
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      if (!e.alive) continue;
      var dx = e.x - x, dy = e.y - y;
      if (dx * dx + dy * dy > r2) continue;
      if (!best || e.distance > best.distance) best = e;
    }
    return best;
  };

  EnemyManager.findAt = function (x, y, slack) {
    slack = slack || 6;
    for (var i = this.enemies.length - 1; i >= 0; i--) {
      var e = this.enemies[i];
      var r = e.size / 2 + slack;
      if (U.dist2(x, y, e.x, e.y) <= r * r) return e;
    }
    return null;
  };

  RPD.EnemyManager = EnemyManager;
})(typeof window !== 'undefined' ? window : globalThis);
