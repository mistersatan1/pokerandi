/* SpecialRunUI.js — 특수 런 표시(세션 99).
 *
 *   필드 왼쪽 위 띠 #ruleStrip — 이번 판 규칙 아이콘 · 이름(규칙이 없으면 숨김). 누르면 설명이 한 줄씩 펼쳐진다.
 *   "불꽃만 사용"에서 전투 칸에 못 서는 개체를 놓으려 하면 이유를 말해 준다(field:rejected · TYPE_RULE).
 * 고르는 화면은 모드 선택(UIManager.rulePickHtml). 규칙은 SpecialRunManager · 각 매니저.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;
  var d = global.document;

  var UI = { open: false };
  var el = {};
  function $(id) { return d.getElementById(id); }

  UI.render = function () {
    if (!el.strip) return;
    var GM = RPD.GameManager, ids = (GM.mode && GM.mode.rules) || [];
    if (!ids.length) { el.strip.hidden = true; el.strip.innerHTML = ''; return; }
    var rules = ids.map(function (id) { return RPD.SpecialRules.get(id); });
    el.strip.innerHTML = '<span class="rulestrip__kicker">특수 런</span>' +
      rules.map(function (r) { return '<span class="rulestrip__rule is-' + r.tone + '">' + r.icon + ' ' + r.name + '</span>'; }).join('') +
      (UI.open ? '<ul class="rulestrip__desc">' + rules.map(function (r) { return '<li>' + r.icon + ' ' + r.desc + '</li>'; }).join('') + '</ul>' : '');
    el.strip.classList.toggle('is-open', UI.open);
    el.strip.hidden = false;
  };

  UI.REJECT_TEXT = function (type) {
    var t = RPD.Types && RPD.Types[type] ? RPD.Types[type].label : type;
    return '특수 런 — 전투 칸에는 ' + t + ' 타입만 설 수 있어요(창고 · 응원 칸 · 조합 재료로는 그대로)';
  };

  UI.init = function () {
    el.strip = $('ruleStrip');
    if (el.strip) el.strip.addEventListener('click', function () { UI.open = !UI.open; UI.render(); });
    RPD.bus.on('special:setup', UI.render);
    RPD.bus.on('game:reset', UI.render);
    RPD.bus.on('run:restored', UI.render);
    RPD.bus.on('field:rejected', function (p) {
      if (!p || p.reason !== 'TYPE_RULE') return;
      if (RPD.Convenience && RPD.Convenience.say) RPD.Convenience.say(UI.REJECT_TEXT(RPD.modeMod('fieldType', '')), 2600);
    });
    UI.render();
  };

  RPD.SpecialRunUI = UI;
})(typeof window !== 'undefined' ? window : globalThis);
