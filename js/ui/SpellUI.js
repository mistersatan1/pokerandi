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
    LOCKED: '…잠가 둔 포켓몬이 재료에 필요하다.',
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

  /* ---------- 연출 ----------
   * 첫 발견(세션 96): 대사 동안 그림은 검은 실루엣("?")으로 떠 있고, 끝에 흰 섬광 → 빛살이 돌며 색이 돌아온다.
   * "NEW!" 도장 · 이름 · 발견 수(히든 N/31 · 불멸 N/5 · 초월 N/2) · 도감 N/154 가 차례로. 불멸은 흔들림 · 초월은 섬광 두 번.
   * 두 번째부터는 예전 그대로(짧게). 효과 "최소" · 동작 줄이기면 빛살 · 불꽃 · 흔들림 없이 섬광 한 번. */
  function kindCount(kind) {
    var all = (RPD.SpellData && RPD.SpellData.list || []).filter(function (s) { return s.kind === kind; });
    var known = all.filter(function (s) { return RPD.SaveManager.knowsSpell && RPD.SaveManager.knowsSpell(s.id); });
    return { have: known.length, total: all.length };
  }
  function firstRevealHtml(spell, unit, tier) {
    var KIND = { hidden: '히든', immortal: '불멸', transcend: '초월' }[spell.kind] || tier.label;
    var kc = kindCount(spell.kind), SV = RPD.SaveManager;
    var sparks = '';
    for (var i = 0; i < 14; i++) sparks += '<i style="--a:' + (i * 360 / 14) + 'deg;--d:' + (i % 3) * 0.06 + 's"></i>';
    return '<div class="spellscene__rays" aria-hidden="true"></div>' +

      '<div class="spellscene__sparks" aria-hidden="true">' + sparks + '</div>' +
      '<div class="spellscene__new">' +
        '<span class="spellscene__stamp">NEW!</span>' +
        '<b class="spellscene__name">' + unit.def.name + '</b>' +
        '<span class="spellscene__count">' + KIND + ' 발견 <em>' + kc.have + '</em> / ' + kc.total +
          (SV.dexCount ? ' · 도감 <em>' + SV.dexCount() + '</em> / ' + SV.dexTotal() : '') + '</span>' +
      '</div>';
  }

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

    var first = !!p.firstTime;
    var calm = RPD.Effects && RPD.Effects.levelId && RPD.Effects.levelId() === 'minimal';
    el.scene.className = 'spellscene is-' + spell.kind + (first ? ' is-first' : '') + (calm ? ' is-calm' : '');
    el.scene.style.setProperty('--tier', tier.color);
    el.scene.innerHTML =
      '<div class="spellscene__glow"></div>' +
      '<div class="spellscene__box">' +
        '<p class="spellscene__tier">' + ({ hidden: '히든 · ' + tier.label, immortal: '불멸', transcend: '초월' }[spell.kind] || tier.label) + ' 조합' + (p.firstTime ? ' · 첫 발견!' : '') + '</p>' +
        '<p class="spellscene__phrase">「' + spell.phrase + '」</p>' +
        // 첫 발견은 대사 동안 실루엣으로 떠 있다(무엇이 나올지 궁금하게) — 정체는 끝에서 색으로
        (first ? '<div class="spellscene__art is-silhouette">' + RPD.UI.shadow(unit.def, 'spr--scene') + '<span class="spellscene__q">?</span></div>'
               : '<div class="spellscene__art is-hidden">' + RPD.UI.sprite(unit.def, 'spr--scene') + '</div>') +
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
      if (first) {
        art.innerHTML = RPD.UI.sprite(unit.def, 'spr--scene');   // 실루엣 → 진짜 그림
        art.classList.remove('is-silhouette');
        el.scene.querySelector('.spellscene__box').insertAdjacentHTML('beforeend', firstRevealHtml(spell, unit, tier));
        // 섬광은 장면 전체에 — 흔들리는 상자 안에 두면(transform) 상자 크기로 잘린다
        el.scene.insertAdjacentHTML('beforeend', '<div class="spellscene__flash" aria-hidden="true"></div>');
        lineEl.textContent = unit.def.name + ' 을(를) 처음 발견했다!';
        if (RPD.Haptics && RPD.Haptics.buzz) RPD.Haptics.buzz('discover');
        if (RPD.AudioManager && RPD.AudioManager.play) RPD.AudioManager.play('discover');
      } else {
        art.classList.remove('is-hidden');
        lineEl.textContent = unit.def.name + ' 이(가) 합류했다!';
      }
      el.scene.classList.add('is-reveal');
      timer = setTimeout(close, first ? (spell.kind === 'transcend' ? 4200 : 3400) : 2200);
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
