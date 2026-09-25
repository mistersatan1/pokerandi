/* RewardManager.js — 보스 처치 보상.
 *
 * 10라운드마다 오는 보스를 잡으면 보상을 준다. 보스는 그 판의 고비다 —
 * 넘겼을 때 "무언가를 받았다"가 없으면 고비가 그냥 통과 지점이 된다.
 *
 * 보상은 조합 계획을 앞당기는 쪽으로 준다.
 *   특별함·희귀함 유닛: 소환으로는 희귀함 이상이 안 나오므로, 보스가 거의 유일한 지름길이다.
 *   소환권: 골드 없이 뽑는다(소환으로 나오는 등급 중 위에서 두 번째를 보장).
 * 유닛의 종은 조합 보정을 따른다 — 필요한 재료가 올 확률이 높다.
 *
 * 보스마다 준다(몇 번째 보스인가로 찾는다). 보스 러시(매 라운드 보스)는 매번 주면
 * 모드가 무너지므로 10·20라운드에만 받는다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  /* 몇 번째 보스인가 → 보상 목록. (세션 33 ⑤ 상향)
   *   { kind: 'unit', tier, count }   그 등급 유닛
   *   { kind: 'ticket', count }       소환권
   *   { kind: 'item', item, count }   초월의 조각
   * 골드는 여기 없다 — 처치 골드(EconomyManager.bossGoldBase)로 나가고, 미리보기에만 붙인다.
   *
   * 예전에는 "라운드 번호"(10·20·…)로 찾아서, 7라운드마다 보스가 오는 엔드리스는
   * 70라운드 전까지 보상을 한 번도 못 받았다. 이제 "몇 번째 보스"로 찾는다. */
  var TABLE = {
    1: [{ kind: 'unit', tier: 'T3', count: 2 }, { kind: 'ticket', count: 2 }],
    2: [{ kind: 'unit', tier: 'T4', count: 1 }, { kind: 'unit', tier: 'T3', count: 1 }, { kind: 'ticket', count: 3 }],
    3: [{ kind: 'unit', tier: 'T4', count: 2 }, { kind: 'ticket', count: 3 }],
    4: [{ kind: 'unit', tier: 'T5', count: 1 }, { kind: 'ticket', count: 3 },
        { kind: 'item', item: 'transcendShard', count: 1 }],   // 초월의 조각 — 채팅 주문 '초월'에 쓴다
    5: [{ kind: 'unit', tier: 'T5', count: 1 }, { kind: 'unit', tier: 'T4', count: 1 }],
    // 노멀·챌린지가 70라운드로 늘면서(세션 33) 6·7번째 보스(60·70라운드)가 생겼다.
    // 7번째가 이제 진짜 마지막 보스라, 5번째보다 확실히 크게 준다.
    6: [{ kind: 'unit', tier: 'T5', count: 1 }, { kind: 'unit', tier: 'T4', count: 1 }, { kind: 'ticket', count: 3 }],
    7: [{ kind: 'unit', tier: 'T5', count: 2 }, { kind: 'ticket', count: 5 }]
  };
  // 그 이후(엔드리스가 여기를 넘어가면) — 이것을 되풀이한다
  var BEYOND = [{ kind: 'unit', tier: 'T4', count: 2 }, { kind: 'ticket', count: 3 }];

  var RewardManager = { table: TABLE, beyond: BEYOND, history: [] };

  /* 이 라운드 보스는 몇 번째 보상 보스인가(없으면 0).
   * 보스 러시(매 라운드 보스)는 매번 주면 모드가 무너지므로 10라운드마다만 센다. */
  RewardManager.bossIndex = function (wave, mode) {
    mode = mode || RPD.GameManager.mode || {};
    var every = mode.bossEvery || 10;
    if (every < 5) every = 10;
    if (!wave || wave % every !== 0) return 0;
    return wave / every;
  };

  RewardManager.rewardsFor = function (wave, mode) {
    var n = this.bossIndex(wave, mode);
    if (!n) return null;
    return TABLE[n] || BEYOND;
  };

  RewardManager.reset = function () {
    this.history = [];
  };

  RewardManager.init = function () {
    var self = this;
    RPD.bus.on('enemy:died', function (p) {
      if (!p || !p.enemy || !p.enemy.isBoss) return;
      self.grant(p.enemy.wave || RPD.GameManager.wave);
    });
    RPD.bus.on('game:reset', function () { self.reset(); });
  };

  /* 보상 지급. 자리가 없어 유닛을 못 주면 그 등급 조각 값만큼 조각으로 바꿔 준다 —
   * 보상이 조용히 사라지면 안 된다. */
  RewardManager.grant = function (wave) {
    var list = this.rewardsFor(wave);
    if (!list) return null;
    // 같은 라운드 보상은 한 번만(분열·증원으로 보스 판정이 두 번 나는 경우 대비)
    for (var h = 0; h < this.history.length; h++) {
      if (this.history[h].wave === wave) return null;
    }

    var given = [];
    var gold = RPD.EconomyManager ? RPD.EconomyManager.bossGoldPreview(wave) : 0;
    if (gold) given.push({ kind: 'gold', amount: gold, paid: true });   // 이미 처치 골드로 받았다 — 팝업 표시용
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (r.kind === 'ticket') {
        RPD.SummonManager.grantTicket(r.count);
        given.push({ kind: 'ticket', count: r.count });
      } else if (r.kind === 'item') {
        given.push({ kind: 'item', item: r.item, count: r.count || 1 });   // 받는 쪽(SpellManager)이 센다
      } else if (r.kind === 'unit') {
        for (var c = 0; c < (r.count || 1); c++) {
          var unit = RPD.SummonManager.grantUnit(r.tier);
          if (unit) {
            given.push({ kind: 'unit', tier: r.tier, unit: unit });
          } else {
            var shards = RPD.ShardManager.priceFor(r.tier);
            RPD.ShardManager.add(shards, 'reward');
            given.push({ kind: 'shard', tier: r.tier, count: shards });
          }
        }
      }
    }

    var entry = { wave: wave, items: given };
    this.history.push(entry);
    RPD.bus.emit('reward:granted', entry);
    return entry;
  };

  /* 화면용 한 줄 요약: "특별함 유닛 1 · 소환권 3" */
  RewardManager.describe = function (list) {
    if (!list) return '';
    return list.map(function (r) {
      if (r.kind === 'gold') return r.amount + '골드';
      if (r.kind === 'ticket') return '소환권 ' + r.count;
      if (r.kind === 'item') return '초월의 조각 ' + (r.count || 1);
      if (r.kind === 'shard') return '조각 ' + r.count + ' (자리 없음)';
      var t = RPD.Tiers[r.tier];
      return (t ? t.label : r.tier) + ' 유닛' + (r.unit ? ' ' + r.unit.name : ' ' + (r.count || 1));
    }).join(' · ');
  };

  /* 다음 보상까지 — HUD 가 쓴다 */
  RewardManager.next = function (wave) {
    var mode = RPD.GameManager.mode || {};
    var every = mode.bossEvery || 10;
    if (every < 5) every = 10;
    var w = Math.max(1, wave || 1);
    var at = Math.ceil(w / every) * every;
    if (at === w && this.history.some(function (h) { return h.wave === w; })) at += every;
    var list = this.rewardsFor(at, mode);
    // 골드는 처치 골드로 나가지만 미리보기엔 맨 앞에 보여 준다 — 가장 먼저 눈에 들어와야 하는 몫이다
    if (list && RPD.EconomyManager) list = [{ kind: 'gold', amount: RPD.EconomyManager.bossGoldPreview(at) }].concat(list);
    return { wave: at, rewards: list };
  };

  RPD.RewardManager = RewardManager;
})(typeof window !== 'undefined' ? window : globalThis);
