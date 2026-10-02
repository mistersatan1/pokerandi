/* BossIntroUI.js — 보스 이름표(리디자인 ② · 세션 86). 캔버스 연출은 js/render/BossIntro.js.
 *
 * boss:appeared 때 필드 위쪽(라운드 배너 자리)에 0.3초 늦게 미끄러져 들어와 잠깐 머문다 — 클릭을 막지 않는다(pointer-events: none).
 *   "BOSS" (마지막 라운드면 "최종 보스") · 보스 이름 · 한 줄 위협(패턴 주기 · 2페이즈 · 돌진 시간). 값은 보스 데이터에서 만든다.
 * 같은 자리에 떠 있던 라운드 배너("보스 · 웨이브 N")는 내린다(둘이 겹치지 않게).
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;
  var UI = {};
  var el = null, timer = null;

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* "증원 15초마다 · 체력 50% 가속 · 60초 뒤 돌진" */
  UI.threatOf = function (boss) {
    var d = (boss && boss.def) || {}, out = [];
    (d.patterns || []).slice(0, 2).forEach(function (p) { out.push(p.label + ' ' + (p.every || 10) + '초마다'); });   // 한 줄에 들게 둘까지
    if (d.phase2) out.push('체력 ' + Math.round(d.phase2.at * 100) + '% ' + d.phase2.label);
    if (d.timeLimit && out.length < 3) out.push(d.timeLimit + '초 뒤 돌진');
    return out.slice(0, 3).join(' · ');
  };

  UI.show = function (boss) {
    if (!el || !boss) return;
    var GM = RPD.GameManager;
    var fin = !!(GM.isFinalWave && GM.isFinalWave(boss.wave));
    el.innerHTML = '<span class="bossintro__kicker">' + (fin ? '최종 보스' : 'BOSS') + '</span>' +
      '<span class="bossintro__name">' + esc(boss.name || (boss.def && boss.def.name) || '') + '</span>' +
      '<span class="bossintro__threat">' + esc(UI.threatOf(boss)) + '</span>';
    if (el.classList) {
      el.classList.toggle('is-final', fin);
      el.classList.remove('is-on');
      void el.offsetWidth;   // 연속으로 와도 애니메이션이 다시 돈다
      el.classList.add('is-on');
    }
    var banner = typeof document !== 'undefined' && document.getElementById ? document.getElementById('waveBanner') : null;
    if (banner && banner.classList) banner.classList.remove('is-on');
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () { if (el && el.classList) el.classList.remove('is-on'); }, fin ? 2600 : 2000);
  };
  UI.hide = function () { if (el && el.classList) el.classList.remove('is-on'); };

  UI.init = function () {
    el = typeof document !== 'undefined' && document.getElementById ? document.getElementById('bossIntro') : null;
    RPD.bus.on('boss:appeared', UI.show);
    RPD.bus.on('game:reset', UI.hide);
    // 보스가 일찍 쓰러지면 바로 내린다 — 보상 카드 · 클리어 배너와 겹치지 않게
    RPD.bus.on('enemy:died', function (p) { if (p && p.enemy && p.enemy.isBoss) UI.hide(); });
    RPD.bus.on('enemy:leaked', function (e) { if (e && e.isBoss) UI.hide(); });
  };

  RPD.BossIntroUI = UI;
})(typeof window !== 'undefined' ? window : globalThis);
