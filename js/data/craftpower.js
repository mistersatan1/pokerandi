/* craftpower.js — 조합 난이도에 따른 전투력 보정 (세션 33).
 *
 * 두 규칙
 *   1. 까다로운 조합 보너스 — 같은 등급(조합 전용) 평균보다 재료가 많이 드는 개체는 그만큼 조금 더 세다.
 *      "힘들게 만들었다"는 보상. 흔함 환산이 평균의 몇 배인가로 잰다.
 *        배율 = 1 + STEEP × (내 환산 ÷ 등급 평균 − 1),  0 ~ CAP 사이로 자른다
 *      평균보다 싼 것은 깎지 않는다(1.0) — 쉬운 조합을 벌주는 규칙이 아니다.
 *      소환으로도 나오는 종은 제외 — 뽑아서 얻을 수 있으니 "힘들게 만든" 게 아니다.
 *   2. 히든 1.5배 — 히든(주문으로만 만드는 종)은 같은 등급 일반 조합(보너스 포함) 평균의 1.5배.
 *      종 하나하나를 1.5배로 맞추면 역할 차이(광역·단일·지원)가 지워지므로, **히든 무리 전체의 평균**이
 *      1.5배가 되도록 등급마다 한 배율을 곱한다. 히든 안의 개성은 그대로 남는다.
 *
 * 측정(세션 33, 보정 전): 히든은 오히려 일반 조합의 0.79~0.97배였다.
 * STEEP 0.6 — 평균의 1.5배 재료면 +30%. 0.35(최대 +16%)로는 "힘들게 만든 보상"으로 느껴지지 않았다.
 * 무리끼리 DPS 를 비교하면 역할이 섞여 흐려진다(비싼 전설엔 감속·제어형이, 싼 전설엔 보스킬러가 몰려 있다).
 * 보너스는 종마다 자기 값에 곱하므로 "같은 역할끼리"는 비싸게 만든 쪽이 확실히 세진다 — tierpower.js 가 그걸 본다.
 *
 * 배율은 조합식·주문 데이터에서 매번 계산한다 — 조합식을 고치면 알아서 따라간다.
 * 적용: UnitManager.recompute 가 공격력에 곱한다. 확인: node tools/tierpower.js
 * 흔함은 대상이 아니다. 불멸·초월은 3번 규칙(재료 합의 몇 배)을 따른다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  var CFG = { STEEP: 0.6, CAP: 0.35, HIDDEN: 1.5, PULL: 0.75, TIERS: ['T2', 'T3', 'T4', 'T5'],
    IMMORTAL: 1.6, TRANSCEND: 1.8 };   // 불멸·초월 = 재료 합의 몇 배(아래 3번 규칙)

  var CraftPower = { CFG: CFG, mul: {}, cost: {}, avgCost: {}, hiddenGroupMul: {} };

  /* 흔함 환산 — 가장 싼 경로(조합식·주문) */
  function buildCost() {
    var PD = RPD.PokemonData, RD = RPD.RecipeData, SD = RPD.SpellData;
    var bySpell = {};
    if (SD) SD.list.forEach(function (s) { if (!bySpell[s.result]) bySpell[s.result] = s; });
    var memo = {};
    function cost(id) {
      if (memo[id] != null) return memo[id];
      var d = PD.get(id);
      if (!d || d.tier === 'T1') return (memo[id] = 1);
      var routes = RD.routesOf(id).map(function (r) { return r.materials; });
      if (bySpell[id]) routes.push(bySpell[id].materials);
      if (!routes.length) return (memo[id] = 1);
      memo[id] = Infinity;
      var best = Infinity;
      routes.forEach(function (ms) {
        var c = 0;
        ms.forEach(function (m) { c += cost(m); });
        if (c < best) best = c;
      });
      return (memo[id] = best);
    }
    PD.list.forEach(function (d) { CraftPower.cost[d.id] = cost(d.id); });
  }

  /* 혼자 있을 때의 기대 DPS(시너지·버프 없음) — 히든 무리와 일반 무리의 평균을 비교하는 데만 쓴다 */
  function basePower(d) {
    var crit = (d.critRate || 0) * ((d.critDamage || 1.5) - 1);
    var e = d.attack * (1 + crit) * (d.attackSpeed || 1);
    if (d.attackType === 'SPLASH') e *= 1.6;
    else if (d.attackType === 'PIERCE') e *= Math.min(d.pierce || 1, 2.2);
    else if (d.attackType === 'CHAIN') e *= 1 + (d.chain || 0) * 0.45;
    return e;
  }

  CraftPower.build = function () {
    var PD = RPD.PokemonData;
    this.mul = {}; this.cost = {}; this.avgCost = {}; this.hiddenGroupMul = {};
    buildCost();
    var self = this;
    CFG.TIERS.forEach(function (t) {
      var crafted = PD.list.filter(function (d) { return d.tier === t && !d.form && !d.hidden && !d.summon; });
      if (!crafted.length) return;
      var avg = crafted.reduce(function (a, d) { return a + self.cost[d.id]; }, 0) / crafted.length;
      self.avgCost[t] = avg;
      /* 0. 같은 등급 · 같은 역할 안의 기본 편차를 PULL 만큼 가운데(중앙값)로 모은다.
       *    옛 데이터의 흔적으로 같은 역할인데 기본 공격력이 30%씩 차이 나는 곳이 있었다(버터플 vs 고지).
       *    그 편차가 조합 보너스를 덮어 "비싸게 만든 게 더 약한" 역전이 생겼다. 역할이 같으면 하는 일이 같으니
       *    그 안에서는 조합 난이도가 강함을 정하게 한다. 개성은 (1 − PULL) 만큼 남는다. */
      var byRole = {};
      crafted.forEach(function (d) { (byRole[d.role] = byRole[d.role] || []).push(d); });
      var pull = {};
      Object.keys(byRole).forEach(function (role) {
        var ps = byRole[role].map(basePower).sort(function (a, b) { return a - b; });
        var med = ps[Math.floor((ps.length - 1) / 2)];
        if (ps.length % 2 === 0) med = (ps[ps.length / 2 - 1] + ps[ps.length / 2]) / 2;
        byRole[role].forEach(function (d) { pull[d.id] = Math.pow(med / basePower(d), CFG.PULL); });
      });
      // 1. 까다로운 조합 보너스
      crafted.forEach(function (d) {
        var b = CFG.STEEP * (self.cost[d.id] / avg - 1);
        self.mul[d.id] = pull[d.id] * (1 + Math.max(0, Math.min(CFG.CAP, b)));
      });
      // 2. 히든 — 무리 평균이 일반 조합(보너스 포함) 평균의 1.5배가 되게
      var hidden = PD.list.filter(function (d) { return d.tier === t && d.hidden; });
      if (!hidden.length) return;
      var normalAvg = crafted.reduce(function (a, d) { return a + basePower(d) * self.mul[d.id]; }, 0) / crafted.length;
      var hiddenAvg = hidden.reduce(function (a, d) { return a + basePower(d); }, 0) / hidden.length;
      var g = CFG.HIDDEN * normalAvg / hiddenAvg;
      self.hiddenGroupMul[t] = g;
      hidden.forEach(function (d) { self.mul[d.id] = g; });
    });

    /* 3. 불멸·초월 — 재료 합의 IMMORTAL / TRANSCEND 배 (세션 33 · 70라운드 후반 벽).
     *    전과 비교(재료 합 대비): 썬더 2.47 · 뮤츠 1.67 · 파이어 1.45 · 뮤 1.37 · 프리져 0.80 · 초월 뮤츠 1.00 · 초월 리자몽 3.14.
     *    프리져·초월 뮤츠는 만들면 오히려 손해였다. 61라운드 벽을 "불멸·초월을 갖춰야 넘는" 벽으로 만들려면
     *    이것들이 확실한 전력 도약이어야 한다 — 종마다 재료 합에 맞춰 한 배율로 통일한다.
     *    초월 재료에 불멸이 들어가므로 불멸을 먼저 정한다. */
    var SD = RPD.SpellData;
    if (SD) {
      ['immortal', 'transcend'].forEach(function (kind) {
        var over = kind === 'immortal' ? CFG.IMMORTAL : CFG.TRANSCEND;
        SD.list.filter(function (sp) { return sp.kind === kind; }).forEach(function (sp) {
          var res = PD.get(sp.result);
          if (!res) return;
          /* 역할 보정(roletuning.js)까지 넣은 실효 세기로 비교한다. 안 그러면 재료(전설 단일·보스킬러 ↑)와
           * 결과(썬더 연쇄·파이어 광역 ↓)가 반대로 보정돼 "1.6배"가 실제론 1.6배가 아니게 된다. */
          var RT = RPD.RoleTuning;
          var roleF = function (d) { return RT ? RT.attack(d.role) * RT.speedOf(d) : 1; };
          var mat = sp.materials.reduce(function (a, m) { var d = PD.get(m); return a + basePower(d) * (self.mul[m] || 1) * roleF(d); }, 0);
          self.mul[res.id] = over * mat / (basePower(res) * roleF(res));
        });
      });
    }
  };

  CraftPower.mulOf = function (def) {
    return (def && this.mul[def.id]) || 1;
  };

  /* 화면용 한마디 — 선택한 칸 정보에 붙인다 */
  /* 까다로운 조합 보너스만(역할 안 편차 보정은 뺀) 값 — 화면에 보여 주는 몫 */
  CraftPower.bonusOf = function (def) {
    var t = def && def.tier, avg = this.avgCost[t];
    if (!def || def.hidden || def.summon || !avg) return 0;
    return Math.max(0, Math.min(CFG.CAP, CFG.STEEP * (this.cost[def.id] / avg - 1)));
  };
  CraftPower.labelOf = function (def) {
    if (def && def.hidden && this.hiddenGroupMul[def.tier]) return '히든 보정 ×' + this.mulOf(def).toFixed(2);
    if (def && (def.tier === 'T6' || def.tier === 'T7') && this.mul[def.id]) {
      return (def.tier === 'T6' ? '불멸' : '초월') + ' — 재료 합의 ' + (def.tier === 'T6' ? CFG.IMMORTAL : CFG.TRANSCEND) + '배';
    }
    var b = this.bonusOf(def);
    return b > 0.005 ? '까다로운 조합 +' + Math.round(b * 100) + '%' : '';
  };

  CraftPower.build();
  RPD.CraftPower = CraftPower;
})(typeof window !== 'undefined' ? window : globalThis);
