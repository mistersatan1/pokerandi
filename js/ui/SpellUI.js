/* SpellUI.js — 주문 입력창과 주문 연출.
 *
 * Enter(또는 💬 버튼)로 입력줄이 열린다. 입력하는 동안 단축키는 쉰다(입력칸에서는 전역 단축키가 동작하지 않는다).
 * 주문이 맞고 재료가 있으면 화면이 어두워지고, 대사가 한 줄씩 뜬 뒤 결과가 나타난다.
 * 초월·불멸은 전용 배경음악이 깔린다. 연출 동안 게임은 잠깐 멈춘다(대사를 읽는 사이 뚫리지 않게).
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  var UI = { busy: false };
  var el = {};
  function $(id) { return document.getElementById(id); }

  var FAIL_TEXT = {
    NOT_READY: '…아직 때가 아니다.',
    NO_SHARD: '…초월의 조각이 필요하다.',
    ONCE: '…초월은 한 판에 한 번뿐이다.',
    NOT_PLAYING: '게임을 시작한 뒤에 외칠 수 있다.'
  };

  function say(text, cls) {
    if (!el.log) return;
    var p = document.createElement('p');
    p.className = 'chatlog__line ' + (cls || '');
    p.textContent = text;
    el.log.appendChild(p);
    while (el.log.children.length > 4) el.log.removeChild(el.log.firstChild);
    setTimeout(function () { if (p.parentNode) p.classList.add('is-fade'); }, 3200);
    setTimeout(function () { if (p.parentNode) p.parentNode.removeChild(p); }, 4200);
  }

  /* prefill — 조합식 줄에서 주문을 눌렀을 때 문구를 미리 적어 둔다.
   * 그래도 Enter 는 직접 누른다 — "외친다"는 손맛은 남긴다. */
  UI.open = function (prefill) {
    if (!el.bar || UI.busy) return;
    el.bar.hidden = false;
    el.input.value = typeof prefill === 'string' ? prefill : '';
    el.input.focus();
  };
  UI.close = function () {
    if (!el.bar) return;
    el.bar.hidden = true;
    if (el.input.blur) el.input.blur();
  };

  UI.submit = function () {
    var text = el.input.value.trim();
    UI.close();
    if (!text) return;
    say('트레이너: ' + text, 'is-me');
    var r = RPD.SpellManager.cast(text);
    if (r.ok) return;                       // 연출은 spell:cast 에서
    if (r.reason === 'UNKNOWN') return;     // 그냥 한 말 — 아무 일도 없다
    setTimeout(function () { say(FAIL_TEXT[r.reason] || '…', 'is-hint'); }, 350);
  };

  /* ---------- 연출 ---------- */
  function playScene(p) {
    var spell = p.spell, unit = p.unit, tier = RPD.Tiers[unit.def.tier];   // 색은 결과 포켓몬의 등급
    UI.busy = true;
    var wasPaused = RPD.Loop.paused;
    if (RPD.AudioManager) RPD.AudioManager.scene = true;   // 멈춰도 음악은 계속
    if (!wasPaused && RPD.Loop.setPaused) RPD.Loop.setPaused(true);
    if (RPD.AudioManager) {
      RPD.AudioManager.play('spell');
      RPD.AudioManager.playScene({ hidden: 'hidden', immortal: 'immortal', transcend: 'transcend' }[spell.kind] || 'boss');
    }

    el.scene.className = 'spellscene is-' + spell.kind;
    el.scene.style.setProperty('--tier', tier.color);
    el.scene.innerHTML =
      '<div class="spellscene__glow"></div>' +
      '<div class="spellscene__box">' +
        '<p class="spellscene__tier">' + ({ hidden: '히든 · ' + tier.label, immortal: '불멸', transcend: '초월' }[spell.kind] || tier.label) + ' 조합' + (p.firstTime ? ' · 첫 발견!' : '') + '</p>' +
        '<p class="spellscene__phrase">「' + spell.phrase + '」</p>' +
        '<div class="spellscene__art is-hidden">' + RPD.UI.sprite(unit.def, 'spr--scene') + '</div>' +
        '<p class="spellscene__speaker">' + (spell.speaker || unit.def.name) + '</p>' +
        '<p class="spellscene__line"></p>' +
        '<p class="spellscene__skip">클릭하면 넘어갑니다</p>' +
      '</div>';
    el.scene.hidden = false;

    var lines = (spell.lines || []).slice();
    var lineEl = el.scene.querySelector('.spellscene__line');
    var art = el.scene.querySelector('.spellscene__art');
    var i = 0, typing = null, timer = null, done = false;

    function finish() {
      if (done) return;
      done = true;
      clearInterval(typing); clearTimeout(timer);
      art.classList.remove('is-hidden');
      lineEl.textContent = unit.def.name + ' 이(가) 합류했다!';
      el.scene.classList.add('is-reveal');
      timer = setTimeout(close, 2200);
    }
    function close() {
      el.scene.hidden = true;
      el.scene.onclick = null;
      UI.busy = false;
      if (!wasPaused && RPD.Loop.setPaused) RPD.Loop.setPaused(false);
      if (RPD.AudioManager && RPD.AudioManager.restoreTrack) RPD.AudioManager.restoreTrack();
    }
    function next() {
      clearInterval(typing); clearTimeout(timer);
      if (i >= lines.length) { finish(); return; }
      var text = lines[i++], n = 0;
      lineEl.textContent = '';
      typing = setInterval(function () {
        n += 1;
        lineEl.textContent = text.slice(0, n);
        if (n >= text.length) { clearInterval(typing); timer = setTimeout(next, 1400); }
      }, 38);
    }
    el.scene.onclick = function () { if (done) { clearTimeout(timer); close(); } else next(); };
    next();
  }

  function renderShard() {
    if (!el.shard) return;
    var n = RPD.SpellManager.transcendShards;
    el.shard.hidden = !(n > 0);
    el.shard.textContent = '✦ 초월의 조각 ' + n;
  }

  UI.init = function () {
    el.bar = $('chatBar'); el.input = $('chatInput'); el.log = $('chatLog');
    el.scene = $('spellScene'); el.btn = $('btnChat'); el.shard = $('spellShard');
    if (!el.bar) return;

    el.input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); UI.submit(); }
      else if (e.key === 'Escape') { e.preventDefault(); UI.close(); }
      if (e.stopPropagation) e.stopPropagation();
    });
    if (el.btn) el.btn.addEventListener('click', function () { if (el.bar.hidden) UI.open(); else UI.close(); });

    RPD.bus.on('spell:cast', playScene);
    RPD.bus.on('spell:shard', function (p) {
      renderShard();
      say('✦ 초월의 조각을 얻었다. 전설과 함께 주문을 외쳐라.', 'is-hint');
    });
    RPD.bus.on('game:reset', renderShard);
    renderShard();
  };

  RPD.SpellUI = UI;
})(typeof window !== 'undefined' ? window : globalThis);
