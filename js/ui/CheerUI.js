/* CheerUI.js — 응원 칸 화면(세션 82). 규칙은 FieldManager(zone 'cheer' · canPlace) · UnitManager.cheerTotals · CheerData(auras.js).
 *
 *   요약 줄  — 시너지 패널 위 "📣 응원 · 공속 +8% · 방어 무시 +9%"(상한 적용 뒤). 누르면 종별 내역(같은 종 두 번째는 줄 그어 "한 번만").
 *   설명서   — [응원 칸] 쪽: 규칙 · 응원 가능 17종 표. 값은 CheerData 로 만든다(문서에 수치를 적지 않는다).
 *   알림     — 응원 칸에 못 두는 포켓몬을 놓으면 "응원 칸에는 응원 가능한 포켓몬만 둘 수 있어요"(field:rejected).
 *              응원 가능한 포켓몬을 처음 얻으면 한 번만 "응원 칸에 두면 필드 전체를 도와줘요"(설정 cheerTipShown).
 *   ✨ 표시 · 응원 칸 카드 · 받는 버프 나눔은 UIManager(보유 칸 · 정보 카드)에 있다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;
  var UI = { open: false };
  var el = {};

  function doc() { return typeof document !== 'undefined' ? document : null; }
  function $(id) { var d = doc(); return d && d.getElementById ? d.getElementById(id) : null; }
  function name(id) { var d = RPD.PokemonData.get(id); return d ? d.name : id; }
  function say(text) {
    if (RPD.Convenience && RPD.Convenience.say) RPD.Convenience.say(text, 2200);
  }

  UI.REJECT_TEXT = '응원 칸에는 응원 가능한 포켓몬만 둘 수 있어요';
  UI.TIP_TEXT = '응원 칸에 두면 필드 전체를 도와줘요';

  /* 요약 줄 — 응원 칸에 아무도 없으면 숨긴다 */
  UI.summaryHtml = function () {
    var tot = RPD.UnitManager.cheer || RPD.UnitManager.cheerTotals();
    if (!tot.from.length) return '';
    var rows = [];
    RPD.FieldManager.cheerSlots().forEach(function (s) {
      if (!s.unlocked || !s.unit) return;
      var id = s.unit.defId, e = RPD.CheerData.get(id);
      var counted = rows.every(function (r) { return r.id !== id; });
      rows.push({ id: id, html: '<li' + (counted ? '' : ' class="is-dup"') + '>' + name(id) + ' — ' + RPD.CheerData.describe(e) +
        (counted ? '' : ' <small>(같은 종 · 한 번만)</small>') + '</li>' });
    });
    var capped = RPD.CheerData.AXES.filter(function (k) { return tot.raw[k] > tot[k] + 1e-9; })
      .map(function (k) { return RPD.CheerData.LABEL[k]; });
    return '<span class="cheersum__hd">📣 응원</span><span>' + RPD.CheerData.describe(tot) + '</span>' +
      (capped.length ? '<small>(' + capped.join(' · ') + ' 상한)</small>' : '') +
      '<ul class="cheersum__list">' + rows.map(function (r) { return r.html; }).join('') + '</ul>';
  };

  UI.render = function () {
    if (!el.sum) return;
    var html = UI.summaryHtml();
    el.sum.hidden = !html;
    if (html !== el.sum.innerHTML) el.sum.innerHTML = html;
    if (el.sum.classList) el.sum.classList.toggle('is-open', UI.open);
    if (el.sum.setAttribute) el.sum.setAttribute('aria-expanded', String(UI.open));
  };

  /* 설명서 [응원 칸] — CheerData 표로 만든다 */
  UI.renderHelp = function () {
    var box = $('helpCheer');
    var CD = RPD.CheerData;
    var slots = RPD.FieldManager.slots.filter(function (s) { return s.zone === 'cheer'; });
    var free = slots.filter(function (s) { return !s.cost; }).length;
    var paid = slots.filter(function (s) { return s.cost; }).map(function (s) { return s.cost + 'G'; });
    var rows = CD.ids().map(function (id) {
      var d = RPD.PokemonData.get(id), e = CD.get(id), t = RPD.Tiers[d.tier];
      var known = !d.hidden || (RPD.SaveManager.hasSeen && RPD.SaveManager.hasSeen(id));   // 아직 못 만난 히든은 이름을 가린다
      return { rank: RPD.tierRank(d.tier), html: '<tr><td>' + (known ? d.name : '???') + ' <small style="color:' + t.color + '">' + t.label + '</small></td>' +
        '<td>' + CD.describe(e) + '</td><td>' + (e.source === 'aura' ? '버퍼(이웃 버프 × ' + CD.SCALE + ')' : '응원 전용') + '</td></tr>' };
    }).sort(function (a, b) { return a.rank - b.rank; }).map(function (r) { return r.html; });
    var html =
      '<h3>응원 칸</h3>' +
      '<ul class="help__list">' +
        '<li>필드 오른쪽 끝의 <b>분홍 "응원" 칸</b> — 처음 ' + free + '칸, 골드로 ' + paid.length + '칸 더(' + paid.join(' · ') + ').</li>' +
        '<li><b>✨ 응원 가능</b>한 포켓몬만 둘 수 있어요. 응원 칸의 포켓몬은 싸우지 않고, 버프를 <b>필드 전체</b>의 싸우는 포켓몬에게 줍니다.</li>' +
        '<li>공격 · 스킬 · 특성 · 시너지에서 빠지고 강화(사거리)도 안 됩니다. 응원 칸끼리는 서로 버프를 주지 않아요.</li>' +
        '<li><b>같은 종은 한 번만</b> 셉니다. 다른 종은 더해지고, 축마다 상한이 있어요(공격력 +' + Math.round(CD.capAttack * 100) + '%까지).</li>' +
        '<li>보유한 포켓몬이라 조합 · 주문 재료로 쓰입니다(창고 → 필드 → 응원 칸 순서 · 잠그면 빠짐). 방출 · 잠금 · 이동도 됩니다.</li>' +
        '<li>일괄 창고로 · 자동 배치 · 소환은 응원 칸을 건드리지 않아요. 이웃 버프(버퍼 옆 칸)는 그대로입니다.</li>' +
      '</ul>' +
      '<table class="help__keys cheerhelp"><thead><tr><th>포켓몬</th><th>응원(필드 전체)</th><th>출처</th></tr></thead><tbody>' + rows.join('') + '</tbody></table>';
    if (box) box.innerHTML = html;
    return html;
  };

  /* 응원 가능한 포켓몬을 처음 얻었을 때 — 한 번만 */
  function maybeTip(units) {
    var SM = RPD.SaveManager;
    if (!SM || SM.getSetting('cheerTipShown', false)) return;
    if (!(units || []).some(function (u) { return u && RPD.CheerData.isCheerable(u.defId); })) return;
    SM.setSetting('cheerTipShown', true);
    say(UI.TIP_TEXT);
  }

  UI.init = function () {
    el.sum = $('cheerSummary');
    if (el.sum && el.sum.addEventListener) {
      el.sum.addEventListener('click', function () { UI.open = !UI.open; UI.render(); });
    }
    var bus = RPD.bus;
    ['units:recomputed', 'field:changed', 'game:reset'].forEach(function (ev) { bus.on(ev, UI.render); });
    bus.on('field:rejected', function (p) { if (p && p.reason === 'NOT_CHEERABLE') say(UI.REJECT_TEXT); });
    bus.on('summon:result', function (r) { if (r && r.unit) maybeTip([r.unit]); });
    bus.on('summon:granted', function (p) { maybeTip(p && p.units); });
    bus.on('recipe:crafted', function (p) { if (p && p.unit) maybeTip([p.unit]); });
    bus.on('spell:cast', function (p) { if (p && p.unit) maybeTip([p.unit]); });
    var tabs = $('helpTabs');
    if (tabs && tabs.addEventListener) tabs.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-help="cheer"]');
      if (b) UI.renderHelp();
    });
    UI.render();
  };

  RPD.CheerUI = UI;
})(typeof window !== 'undefined' ? window : globalThis);
