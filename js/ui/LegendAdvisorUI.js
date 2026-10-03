/* LegendAdvisorUI.js — [전설 추천] 창 (세션 78). 계산은 js/systems/LegendAdvisor.js — 여기는 그리기만 한다.
 *
 *   조합식 목록 위 [★ 전설 추천] → 창(휴대폰은 시트 — .board > .book · MobileSheet OVERLAYS). 상위 3개:
 *   전설 그림 · 이름 / "지금 바로 조합 가능" · "예상 추가 소환 약 N회" / 재료 칩(있음 초록 · 모자람 빨강 −N · 조각 노랑) /
 *   "다음에 모으면 좋은 것"(모자란 재료 중 소환으로 나오는 것). 재료 칩을 누르면 그 재료의 조합식 창.
 *   추천만 한다 — 조합 · 소환 · 조각은 쓰지 않는다. 숨은 재료가 필요한 전설은 수만("N종은 제외") 보여 준다.
 *   창이 열려 있을 때만 계산한다(라운드 시작 · 조합 · 소환 · 주문 · 조각 · 잠금 · 창고 변화 때 다시 — 같은 보유면 캐시).
 *   버튼 자리는 "다음 목표" 줄(세션 89) — 라운드 끝 · 조합 · 주문 뒤 쉴 때 1위를 고른다(UI.renderGoal).
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;
  var UI = { open: false };
  var el = {};
  var pending = null;
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function name(id) { var d = RPD.PokemonData.get(id); return d ? d.name : id; }

  function etaText(r) {
    if (r.ready) return '<b class="lgcard__now">지금 바로 조합 가능</b>' + (r.viaSpell ? ' <small>(주문)</small>' : '');
    if (!isFinite(r.expected)) return '지금 라운드에선 소환으로 다 못 모아요';
    var n = Math.max(1, Math.round(r.expected));
    if (r.expected === 0) {
      // 소환은 더 필요 없다 — 조각으로 재료를 사거나(조각 표시는 아래 줄) 가진 것으로 아래 단계를 조합하면 된다
      if (!r.crafts) return '<b class="lgcard__now">조각으로 재료를 사면 바로 조합 가능</b>';
      return '추가 소환 없이 <b>조합 ' + r.crafts + '번</b>' + (r.shardsUsed ? '(조각 구매 포함)' : '') + '이면 완성';
    }
    return '예상 추가 소환 <b>약 ' + n + '회</b>';
  }

  function chipHtml(c) {
    var d = RPD.PokemonData.get(c.id);
    var cls, label;
    if (c.missing > 0) { cls = 'is-miss'; label = '−' + c.missing; }
    else if (c.shard > 0) { cls = 'is-shard'; label = '조각'; }
    else { cls = 'is-have'; label = c.viaDitto ? '메타몽' : '있음'; }
    return '<button type="button" class="lgchip ' + cls + '" data-def="' + c.id + '" title="' + esc(d.name) +
      (c.need > 1 ? ' ×' + c.need : '') + ' — 누르면 조합식">' +
      RPD.UI.sprite(d, 'spr--lgchip') +
      '<span class="lgchip__name">' + esc(d.name) + (c.need > 1 ? ' ×' + c.need : '') + '</span>' +
      '<em class="lgchip__st">' + label + '</em></button>';
  }

  function cardHtml(r, i) {
    var d = RPD.PokemonData.get(r.id), tier = RPD.Tiers[d.tier];
    var next = r.next.slice(0, 4).map(function (x) { return esc(name(x.id)) + (x.n > 1 ? ' ×' + x.n : ''); }).join(' · ');
    return '<div class="lgcard" data-legend="' + r.id + '" style="--tier:' + tier.color + '">' +
      '<div class="lgcard__head">' +
        '<span class="lgcard__rank">' + (i + 1) + '</span>' +
        RPD.UI.sprite(d, 'spr--lg') +
        '<div class="lgcard__who"><b class="lgcard__name">' + esc(d.name) + '</b>' +
          '<span class="lgcard__eta">' + etaText(r) + '</span>' +
          (r.shardsUsed ? '<span class="lgcard__shard">◆ 조각 ' + r.shardsUsed + ' 사용</span>' : '') +
        '</div>' +
      '</div>' +
      '<div class="lgcard__mats">' + r.chips.map(chipHtml).join('<i class="lgcard__plus">+</i>') + '</div>' +
      (next ? '<p class="lgcard__next">다음에 모으면 좋은 것: ' + next + '</p>' : '') +
    '</div>';
  }

  UI.render = function () {
    pending = null;
    if (!el.overlay || el.overlay.hidden) return;
    var res = RPD.LegendAdvisor.compute();
    UI.last = res;
    UI.renderGoal();
    el.list.innerHTML = res.top.length ? res.top.map(cardHtml).join('')
      : '<p class="empty">추천할 전설이 없습니다.</p>';
    el.note.textContent = (res.hiddenExcluded ? '숨은 재료가 필요한 전설 ' + res.hiddenExcluded + '종은 제외 · ' : '') +
      '조각은 보유 안에서 비싼 재료부터 쓴다고 치고 셉니다 · 추천만 합니다(조합 · 소환 · 조각은 직접)';
  };
  function later() { if (!el.overlay || el.overlay.hidden || pending) return; pending = setTimeout(UI.render, 0); }

  /* ---------- 조합식 목록 위 "다음 목표" 줄(리디자인 ⑤ · 세션 89) ----------
   * [★ 전설 추천] 버튼 자리를 그대로 쓴다(높이 안 늘림) — 추천 1위 전설 · 그 조합식 재료 칸(지금 보유로 매번 갱신) · "추천 ›".
   * 1위를 고르는 계산(몬테카를로 · 브라우저 약 80ms)은 라운드가 끝날 때 · 조합 · 주문 뒤에만, 쉴 때(requestIdleCallback) 한다.
   * 소환할 때마다 다시 고르지 않는다 — 1위는 그 사이 낡을 수 있지만 재료 칸은 늘 지금 보유다. 창을 열면 그때 다시 잰다. */
  var goalPending = null, goalSig = '';
  function goalLater() {
    if (goalPending || !el.btn) return;
    var run = function () {
      goalPending = null;
      try { RPD.LegendAdvisor.compute(); } catch (e) { /* 추천은 보조 기능 — 실패해도 버튼은 남는다 */ }
      UI.renderGoal();
    };
    goalPending = typeof global.requestIdleCallback === 'function' ? global.requestIdleCallback(run, { timeout: 2500 }) : setTimeout(run, 400);
  }
  function goalRow(id) {
    var best = null;
    (RPD.RecipeManager.view || []).forEach(function (v) {
      if (v.resultId !== id) return;
      var have = v.materials.filter(function (m) { return m.owned; }).length;
      if (!best || (v.ready && !best.ready) || (v.ready === best.ready && have > best.have)) best = { ready: v.ready, have: have, total: v.materials.length };
    });
    return best;
  }
  UI.goal = function () {
    var c = RPD.LegendAdvisor.cache, r = c && c.top && c.top[0];
    if (!r) return null;
    var row = goalRow(r.id);
    if (!row) {   // 주문으로 만드는 전설 — 추천 카드의 재료 칩으로 센다
      var have = r.chips.filter(function (x) { return !(x.missing > 0); }).length;
      row = { ready: !!r.ready, have: have, total: r.chips.length };
    }
    return { id: r.id, ready: row.ready, have: row.have, total: row.total };
  };
  UI.renderGoal = function () {
    if (!el.btn) return;
    var g = UI.goal();
    var sig = g ? g.id + (g.ready ? 'R' : '') + g.have + '/' + g.total : '';
    if (sig === goalSig && el.btn.innerHTML) return;
    goalSig = sig;
    el.btn.classList.toggle('has-goal', !!g);
    if (!g) { el.btn.innerHTML = '★ 전설 추천'; el.btn.title = '지금 보유한 포켓몬으로 가장 빨리 만들 수 있는 전설'; return; }
    var d = RPD.PokemonData.get(g.id), tier = RPD.Tiers[d.tier];
    var pips = '';
    for (var i = 0; i < g.total; i++) pips += '<i' + (i < g.have ? ' class="is-on"' : '') + '></i>';
    if (el.btn.style && el.btn.style.setProperty) el.btn.style.setProperty('--tier', tier.color);
    el.btn.title = '다음 목표 — 지금 보유로 가장 빨리 만들 수 있는 전설(라운드 끝 · 조합 때 다시 고른다). 누르면 추천 3개';
    el.btn.innerHTML = '<span class="lgoal__k">★ 다음 목표</span>' + RPD.UI.sprite(d, 'spr--goal') +
      '<b class="lgoal__name">' + esc(d.name) + '</b>' +
      (g.ready ? '<span class="lgoal__now">조합 가능!</span>'
        : '<span class="rprog lgoal__prog" aria-label="재료 ' + g.have + '/' + g.total + '">' + pips + '</span>') +
      '<span class="lgoal__more">추천 ›</span>';
  };

  UI.show = function () {
    if (!el.overlay) return;
    el.overlay.hidden = false;
    UI.render();
    if (el.list) el.list.scrollTop = 0;   // 열 때마다 1위부터(지난번 스크롤이 남아 1위가 가려졌다)
  };
  UI.hide = function () { if (el.overlay) el.overlay.hidden = true; };
  UI.toggle = function () { if (!el.overlay) return; if (el.overlay.hidden) UI.show(); else UI.hide(); };

  /* 재료 칩 → 그 재료의 조합식 창(휴대폰은 조합식 시트를 열고 그 위에) */
  function openRecipe(id) {
    UI.hide();
    var mobile = RPD.MobileSheet && RPD.MobileSheet.isMobile && RPD.MobileSheet.isMobile();
    if (mobile && RPD.HudPanels && document.body && document.body.getAttribute('data-mtab') !== 'recipes') RPD.HudPanels.setDrawer('recipes');
    if (RPD.UIManager && RPD.UIManager.openRecipePop) RPD.UIManager.openRecipePop(id);
  }

  UI.init = function () {
    el.overlay = $('legendOverlay'); el.list = $('legendList'); el.note = $('legendNote');
    el.btn = $('btnLegend'); el.close = $('btnLegendClose');
    if (!el.overlay) return;
    if (el.btn) el.btn.addEventListener('click', UI.toggle);
    if (el.close) el.close.addEventListener('click', UI.hide);
    el.overlay.addEventListener('click', function (e) {
      if (e.target === el.overlay) { UI.hide(); return; }
      var chip = e.target.closest && e.target.closest('.lgchip');
      if (chip && chip.dataset.def) openRecipe(chip.dataset.def);
    });
    ['wave:started', 'recipe:crafted', 'summon:result', 'summon:granted', 'spell:cast', 'shard:changed',
     'unit:sold', 'unit:lock', 'storage:changed', 'field:changed'].forEach(function (ev) { RPD.bus.on(ev, later); });
    RPD.bus.on('game:reset', function () { RPD.LegendAdvisor.invalidate(); UI.hide(); UI.renderGoal(); });
    ['wave:cleared', 'recipe:crafted', 'spell:cast'].forEach(function (ev) { RPD.bus.on(ev, goalLater); });
    RPD.bus.on('recipe:changed', UI.renderGoal);   // 재료 칸만 — 1위는 다시 안 고른다(싸다)
  };

  RPD.LegendAdvisorUI = UI;
})(typeof window !== 'undefined' ? window : globalThis);
