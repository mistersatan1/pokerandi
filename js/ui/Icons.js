/* Icons.js — UI 가 공유하는 작은 그림 조각.
 *
 * 타입 아이콘은 이모지를 쓰지 않는다. OS 마다 모양이 달라 패널 톤이 깨지고,
 * 윈도우에서는 흑백으로 나오기도 한다. 16px 격자 위의 단순한 SVG 로 직접 그린다.
 *
 * 포켓몬 이미지는 assets/pokemon/*.png 를 쓴다. 파일이 없으면 SpriteFactory 가
 * 만든 그림으로 조용히 대체한다(게임 필드와 같은 규칙).
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  var PATHS = {
    FIRE:     '<path d="M8 1.5c.6 2.4 3.9 4 3.9 7.6A3.9 3.9 0 0 1 4.1 9.1c0-1.7.9-2.8 1.8-3.6.1 1.2.7 2 1.5 2.3C7.2 5.6 7.4 3.4 8 1.5z"/>',
    WATER:    '<path d="M8 1.8c2.3 3.1 4.2 5.4 4.2 7.6a4.2 4.2 0 0 1-8.4 0c0-2.2 1.9-4.5 4.2-7.6z"/>',
    ELECTRIC: '<path d="M9.4 1.5 3.6 9h3.6L6.4 14.5 12.4 7H8.7z"/>',
    GRASS:    '<path d="M13.5 2.5C7 2.5 3 5.6 3 10c0 1 .2 1.9.6 2.6C5 9.5 7.3 7.6 10 6.6 7.8 8 6 10 4.9 13.3c.7.2 1.3.3 2 .3 4.6 0 6.6-4.6 6.6-11.1z"/>',
    GROUND:   '<path d="M1.5 13 6 5.5l2.3 3.3L10.2 6l4.3 7z"/>',
    FLYING:   '<path d="M1.5 9.5c3.5-.3 6.2-2.4 8-6 .5 2.3.2 4.1-.8 5.5 1.7-.4 3.5-1.5 5.3-3.4-.6 4.6-3.8 7.6-8.6 7.6-1.7 0-3.1-.8-3.9-3.7z"/>',
    DRAGON:   '<path d="M3 13.5c0-4 1.6-7.7 5.5-10.9l.3 2.6 2.6-1.6-.6 3 2.7.2-2.3 2.1c1 .9 1.3 2 .9 3.2-1.4-1.1-2.7-1.2-4.1-.4-1.3.7-2.8 1.2-5 1.8z"/>',
    FIGHTING: '<path d="M4 7.2V4.6a1.2 1.2 0 0 1 2.4 0V4a1.2 1.2 0 0 1 2.4 0v.3a1.2 1.2 0 0 1 2.4 0v.6a1.2 1.2 0 0 1 2.3.5v3.3A5.3 5.3 0 0 1 8.2 14H7.4A4.4 4.4 0 0 1 3 9.6V8.4a1.2 1.2 0 0 1 1-1.2z"/>',
    PSYCHIC:  '<path d="M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zm0 2.3a3.2 3.2 0 1 1 0 6.4 3.2 3.2 0 0 1 0-6.4zm0 1.6a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2z" fill-rule="evenodd"/>',
    GHOST:    '<path d="M8 1.8a5 5 0 0 0-5 5v7l1.7-1.3L6.4 14 8 12.7 9.6 14l1.7-1.3L13 14V6.8a5 5 0 0 0-5-5zM6 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm4 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" fill-rule="evenodd"/>',
    POISON:   '<path d="M8 2c2.8 0 5 2 5 4.6 0 1.6-.9 3-2.3 3.8V12H5.3v-1.6A4.4 4.4 0 0 1 3 6.6C3 4 5.2 2 8 2zM6.2 6a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm3.6 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2zM5.5 13h5v1.2h-5z" fill-rule="evenodd"/>',
    BUG:      '<path d="M8 4.2c2 0 3.4 1.7 3.4 4.4 0 3-1.5 5-3.4 5s-3.4-2-3.4-5c0-2.7 1.4-4.4 3.4-4.4zM6 2l1.1 2h1.8L10 2l.8.5-1 1.9H6.2L5.2 2.5z"/>',
    NORMAL:   '<circle cx="8" cy="8" r="5"/><circle cx="8" cy="8" r="2.2" fill="rgba(0,0,0,.25)"/>',
    FAIRY:    '<path d="M8 1.5 9.6 6.4h5l-4 3 1.5 4.8L8 11.3l-4.1 2.9 1.5-4.8-4-3h5z"/>',
    ICE:      '<path d="M7.3 1.5h1.4v4.3l3.1-2.4.9 1.1L9.4 7h4.1v1.4H9.4l3.3 2.5-.9 1.1-3.1-2.4v4.3H7.3v-4.3l-3.1 2.4-.9-1.1L6.6 8.4H2.5V7h4.1L3.3 4.5l.9-1.1 3.1 2.4z"/>',
    STEEL:    '<path d="M8 1.5 13.6 4.7v6.6L8 14.5 2.4 11.3V4.7zM8 5.4a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2z" fill-rule="evenodd"/>',
    ROCK:     '<path d="M4.5 3 11 2.5l3 5-2.2 6H4.2L2 7.5z"/>',
    DARK:     '<path d="M10.5 2A6 6 0 1 0 14 12.6 5 5 0 0 1 10.5 2z"/>'
  };

  var UI = {};

  UI.typeIcon = function (typeId, cls) {
    var t = RPD.Types[typeId] || { color: '#8ea3c7' };
    return '<span class="tico ' + (cls || '') + '" style="--tc:' + t.color + '">' +
      '<svg viewBox="0 0 16 16" aria-hidden="true">' + (PATHS[typeId] || PATHS.NORMAL) + '</svg></span>';
  };

  UI.typeColor = function (typeId) {
    var t = RPD.Types[typeId];
    return (t && t.color) || '#8ea3c7';
  };

  /* 포켓몬 이미지 한 장. 크기는 CSS 가 정한다. */
  UI.sprite = function (def, cls) {
    if (!def) return '<span class="spr spr--empty ' + (cls || '') + '"></span>';
    return '<span class="spr ' + (cls || '') + '"><img src="' + RPD.Assets.url(def.sprite) + '" alt="' + def.name +
      '" draggable="false" loading="lazy" data-def="' + def.id + '" onerror="RPD.UI.spriteFallback(this)"></span>';
  };

  /* 아직 발견하지 않은 것(주문 결과 · 미발견 재료) — 그림자(실루엣)만. 이름 · alt 도 가린다.
   * 재료와 주문은 다 보여 주고, "무엇이 나오는지"만 힌트로 남긴다.
   *
   * img 태그(assets/pokemon/피카츄id.png) 로 그리면 파일 경로에 id(= 정답)가 그대로 남는다(세션 59).
   * 그래서 빈 <canvas> 에 **무작위 번호표**만 달아 내보내고, 화면에 붙은 직후(paintShadows) 그림을 그려 검게 칠한 뒤 번호표를 뗀다.
   * 번호 → 포켓몬 대응은 이 파일 안 변수에만 있다. 더블클릭(file://)에서는 그림을 data URL 로 바꿀 수 없지만(보안)
   * 캔버스에 그리는 것까지는 되므로 이 방법이 file:// · 인터넷 주소 · 한 파일 테스트판 모두에서 같게 돈다. */
  var shadowQueue = {};
  var shadowSeq = 0;
  var shadowTimer = null;
  UI.shadow = function (def, cls) {
    if (!def) return '<span class="spr spr--empty ' + (cls || '') + '"></span>';
    var tok = 's' + (++shadowSeq).toString(36) + Math.random().toString(36).slice(2, 7);
    shadowQueue[tok] = def.id;
    scheduleShadows();
    return '<span class="spr is-shadow ' + (cls || '') + '" title="아직 만들어 본 적 없다">' +
      '<canvas class="spr__shadow" data-sh="' + tok + '" width="96" height="96" role="img" aria-label="???"></canvas></span>';
  };

  function scheduleShadows() {
    if (shadowTimer || typeof global.setTimeout !== 'function') return;
    // innerHTML 에 넣는 건 같은 흐름 안에서 끝난다 — 그 다음 차례에 칠한다
    shadowTimer = global.setTimeout(function () { shadowTimer = null; UI.paintShadows(); }, 0);
  }

  function paintShadow(cv, id) {
    var g = cv.getContext && cv.getContext('2d');
    var def = RPD.PokemonData && RPD.PokemonData.get(id);
    if (!g || !def) return;
    var draw = function (src) {
      if (!src) return;
      g.clearRect(0, 0, cv.width, cv.height);
      g.imageSmoothingEnabled = false;
      g.globalCompositeOperation = 'source-over';
      g.drawImage(src, 0, 0, cv.width, cv.height);
      g.globalCompositeOperation = 'source-in';   // 그림이 있는 자리만 검게
      g.fillStyle = '#000';
      g.fillRect(0, 0, cv.width, cv.height);
      g.globalCompositeOperation = 'source-over';
    };
    var made = function () { return RPD.SpriteFactory ? RPD.SpriteFactory.get(def) : null; };
    var e = RPD.Assets && RPD.Assets.get(def.sprite);
    if (!e || !e.img) { draw(made()); return; }
    if (e.state === 'ready') { draw(e.img); return; }
    if (e.state === 'failed') { draw(made()); return; }
    e.img.addEventListener('load', function () { draw(e.img); });
    e.img.addEventListener('error', function () { draw(made()); });
  }

  /* 화면에 붙은 그림자 캔버스를 칠하고 번호표를 뗀다. 칠하지 못한(이미 다시 그려져 사라진) 번호는 버린다. */
  UI.paintShadows = function () {
    var d = global.document;
    var q = shadowQueue;
    shadowQueue = {};
    if (!d || !d.querySelectorAll) return 0;
    var list = d.querySelectorAll('canvas[data-sh]'), n = 0;
    for (var i = 0; i < list.length; i++) {
      var cv = list[i], tok = cv.getAttribute('data-sh'), id = q[tok];
      cv.removeAttribute('data-sh');
      if (id) { paintShadow(cv, id); n += 1; }
    }
    return n;
  };

  UI.spriteFallback = function (img) {
    if (!img || img.dataset.fallback) return;
    img.dataset.fallback = '1';
    var def = RPD.PokemonData.get(img.dataset.def);
    var made = def && RPD.SpriteFactory ? RPD.SpriteFactory.get(def) : null;
    if (made && made.toDataURL) {
      try { img.src = made.toDataURL(); return; } catch (e) { /* 캔버스가 오염되면 그냥 숨긴다 */ }
    }
    img.style.visibility = 'hidden';
  };

  /* 특성 한 줄. 특성이 없는 포켓몬이면 빈 문자열 */
  UI.trait = function (defId, cls) {
    var t = RPD.TraitData && RPD.TraitData.get(defId);
    if (!t) return '';
    return '<div class="trait ' + (cls || '') + '"><span class="trait__name">' + t.icon + ' ' + t.name +
      '</span><span class="trait__desc">' + t.desc + '</span></div>';
  };

  /* 버퍼 패시브 한 줄 */
  UI.aura = function (defId, cls) {
    var a = RPD.AuraData && RPD.AuraData.get(defId);
    if (!a) return '';
    return '<div class="trait trait--aura ' + (cls || '') + '"><span class="trait__name">' + a.icon + ' ' + a.name +
      ' <small>패시브</small></span><span class="trait__desc">' + a.desc + '</span></div>';
  };

  UI.tierColor = function (tierId) {
    return (RPD.Tiers[tierId] || RPD.Tiers.T1).color;
  };

  UI.escape = function (str) {
    return String(str).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };

  RPD.UI = UI;
})(typeof window !== 'undefined' ? window : globalThis);
