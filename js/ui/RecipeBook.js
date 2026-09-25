/* RecipeBook.js — 조합 사전.
 *
 * 원랜디 조합식 사이트(ordsearch)를 참고했다. 거기서 가져온 생각 세 가지:
 *   1. 등급별로 모든 조합식을 한눈에 — 결과 · 재료 / 재료 / 재료 한 줄.
 *   2. "흔함 환산" — 그 포켓몬 하나를 만들려면 흔함이 **몇 마리, 무엇이** 드는지 끝까지 풀어 보여 준다.
 *      전설을 목표로 잡을 때 실제로 모아야 하는 것이 이것이다.
 *   3. 검색 · 태그 — 이름, 초성(ㄹㅈㅁ → 리자몽), 영어 id, 역할·타입으로 좁히기.
 * 여기에 "보유 기준"을 더했다 — 지금 필드·창고에 있는 것으로 얼마나 가까운지.
 *
 * 게임 규칙은 건드리지 않는다. RecipeData · PokemonData · RecipeManager 를 읽기만 한다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  var Book = { tier: 'ALL', role: 'ALL', query: '', sort: 'tier' };
  var el = {};
  function $(id) { return document.getElementById(id); }

  /* ---------- 초성 검색 ---------- */
  var CHO = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
  function choseong(str) {
    var out = '';
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i) - 0xAC00;
      out += (c >= 0 && c < 11172) ? CHO[Math.floor(c / 588)] : str[i];
    }
    return out;
  }
  function isChoOnly(q) { return /^[ㄱ-ㅎ]+$/.test(q); }

  /* ---------- 흔함 환산 ----------
   * 재료를 조합식(히든은 주문)으로 끝까지 풀어 흔함까지 센다.
   * 주문의 재료·문구는 발견 전에도 보여 준다(가리는 것은 결과 그림·이름뿐) — 그래서 끝까지 푼다. */
  var memo = {};
  function knows(id) {
    var sp = RPD.SpellData && RPD.SpellData.forResult(id);
    return !!(sp && RPD.SaveManager.knowsSpell && RPD.SaveManager.knowsSpell(sp.id));
  }
  function makeOf(id) {
    var r = RPD.RecipeData.get(id);
    if (r) return r.materials;
    var sp = RPD.SpellData && RPD.SpellData.forResult(id);
    return sp ? sp.materials : null;
  }
  function expand(id, depth, reveal) {
    var key = id + (reveal ? '!' : '');
    if (memo[key]) return memo[key];
    var out = {};
    var def = RPD.PokemonData.get(id);
    var mats = makeOf(id);
    if (!mats || !def || def.tier === 'T1' || depth > 8) {
      out[id] = 1;
    } else {
      mats.forEach(function (m) {
        var sub = expand(m, depth + 1, reveal);
        for (var k in sub) out[k] = (out[k] || 0) + sub[k];
      });
    }
    memo[key] = out;
    return out;
  }
  Book.expand = function (id) { return expand(id, 0, false); };

  /* 흔함 몇 마리 분량인가 */
  Book.commonCost = function (id) {
    var e = expand(id, 0, true), n = 0;
    for (var k in e) n += e[k];
    return n;
  };

  function breakdownHtml(id) {
    var e = expand(id, 0);
    var keys = Object.keys(e).sort(function (a, b) {
      var ta = RPD.TIER_ORDER.indexOf(RPD.RecipeData.tierOf(a)), tb = RPD.TIER_ORDER.indexOf(RPD.RecipeData.tierOf(b));
      if (ta !== tb) return ta - tb;
      return e[b] - e[a];
    });
    return keys.map(function (k) {
      var tier = RPD.Tiers[RPD.RecipeData.tierOf(k)];
      var hid = RPD.PokemonData.isHidden(k);
      return '<span class="bk__bd' + (hid ? ' is-hidden' : '') + '" style="--tc:' + tier.color + '">' +
        RPD.RecipeData.labelOf(k) + (hid ? ' 🔒' : '') + ' <b>' + e[k] + '</b></span>';
    }).join('');
  }

  /* ---------- 보유 ---------- */
  function ownedCounts() {
    var c = {};
    (RPD.StorageManager ? RPD.StorageManager.allUnits() : []).forEach(function (u) { c[u.defId] = (c[u.defId] || 0) + 1; });
    return c;
  }

  /* ---------- 그리기 ---------- */
  function rows() {
    var q = Book.query.trim().toLowerCase().replace(/\s+/g, '');
    var view = RPD.RecipeManager ? RPD.RecipeManager.view : [];
    var byKey = {};
    view.forEach(function (v) { byKey[v.key] = v; });

    return RPD.RecipeData.list.map(function (r) {
      var def = RPD.PokemonData.get(r.id);
      return { recipe: r, def: def, view: byKey[r.key], cost: Book.commonCost(r.id) };
    }).filter(function (x) {
      if (!x.def) return false;
      if (Book.tier === 'HIDDEN') return false;          // 히든 칩은 주문만 보여 준다
      if (Book.tier !== 'ALL' && x.def.tier !== Book.tier) return false;
      if (Book.role !== 'ALL' && x.def.role !== Book.role && x.def.types.indexOf(Book.role) < 0) return false;
      if (!q) return true;
      var name = x.def.name.replace(/\s+/g, '');
      if (name.indexOf(q) >= 0 || x.def.id.indexOf(q) >= 0) return true;
      if (isChoOnly(q) && choseong(name).indexOf(q) >= 0) return true;
      // 재료 이름으로도 찾는다 — "캐터피가 들어가는 조합식". 흔함 환산까지 풀어서 본다
      // (캐터피 → 단데기뿐 아니라 그 위의 버터플까지)
      var keys = x.recipe.materials.concat(Object.keys(Book.expand(x.def.id)));
      return keys.some(function (m) {
        var n = RPD.RecipeData.labelOf(m).replace(/\s+/g, '');
        return n.indexOf(q) >= 0 || (isChoOnly(q) && choseong(n).indexOf(q) >= 0);
      });
    }).sort(function (a, b) {
      if (Book.sort === 'cost') return a.cost - b.cost;
      if (Book.sort === 'near') {
        var am = a.view ? a.view.missingCount : 9, bm = b.view ? b.view.missingCount : 9;
        if (am !== bm) return am - bm;
      }
      if (Book.sort === 'name') return a.def.name.localeCompare(b.def.name);
      var ta = RPD.TIER_ORDER.indexOf(a.def.tier), tb = RPD.TIER_ORDER.indexOf(b.def.tier);
      return tb - ta || a.cost - b.cost;
    });
  }

  function matHtml(m, owned) {
    var UI = RPD.UI;
    var tier = RPD.Tiers[RPD.RecipeData.tierOf(m)];
    var hid = RPD.PokemonData.isHidden(m);
    var art = UI.sprite(RPD.PokemonData.get(m), 'spr--bk');
    return '<button type="button" class="bk__mat' + (owned ? ' is-owned' : '') + (hid ? ' is-hidden' : '') +
      '" style="--mt:' + tier.color + '" data-find="' + RPD.PokemonData.get(m).name + '"' +
      ' title="' + RPD.RecipeData.labelOf(m) + (hid ? ' — 히든: 채팅 주문으로만 만든다' : ' — 눌러서 이 포켓몬으로 찾기') + '">' + art +
      '<span>' + RPD.RecipeData.labelOf(m) + (hid ? ' 🔒' : '') + '</span></button>';
  }

  function render() {
    if (!el.list) return;
    memo = {};
    var list = rows();
    var owned = ownedCounts();
    var UI = RPD.UI;
    if (el.count) el.count.textContent = list.length + '개';

    var specialOnly = Book.tier === 'HIDDEN' || (RPD.SPECIAL_TIERS && RPD.SPECIAL_TIERS.indexOf(Book.tier) >= 0);
    var spellHtml = spellRows();
    if (el.count) el.count.textContent = (specialOnly ? 0 : list.length) + '개' + (spellHtml.count ? ' · 주문 ' + spellHtml.count : '');
    if (specialOnly) {
      el.list.innerHTML = spellHtml.html || '<p class="empty">이 등급의 주문이 없습니다.</p>';
      return;
    }

    el.list.innerHTML = spellHtml.html + (list.length ? list.map(function (x) {
      var d = x.def, t = RPD.Tiers[d.tier];
      // 재료별 보유 여부(같은 재료 ×2 는 두 칸으로 센다)
      var v = x.view;
      var mats = x.recipe.materials.map(function (m, i) {
        return matHtml(m, v && v.materials[i] && v.materials[i].owned);
      }).join('<i class="bk__plus">+</i>');
      var have = v ? v.materials.filter(function (m) { return m.owned; }).length : 0;
      var trait = RPD.TraitData && RPD.TraitData.get(d.id);
      var skill = RPD.SkillData && RPD.SkillData.forUnit(d);
      var alt = x.recipe.routeCount > 1 ? ' · 경로 ' + (x.recipe.route + 1) + '/' + x.recipe.routeCount : '';
      var sum = d.summon ? ' · 소환으로도 나옴' : '';
      return '<article class="bk__row' + (v && v.ready ? ' is-ready' : '') + '" style="--tier:' + t.color + '">' +
        '<div class="bk__res">' + UI.sprite(d, 'spr--bkres') +
          '<div><span class="bk__tier">' + t.label + alt + sum + '</span>' +
          '<b class="bk__name">' + d.name + '</b><span class="bk__alias">' + d.id + ' · ' + d.roleLabel + '</span></div>' +
          '<span class="bk__have">' + (v && v.ready ? '완성 가능' : have + '/' + x.recipe.materials.length) + '</span>' +
        '</div>' +
        '<div class="bk__mats">' + mats + '</div>' +
        '<div class="bk__common"><span class="bk__label">흔함 환산 약 ' + x.cost + '마리</span>' + breakdownHtml(d.id) + '</div>' +
        ((trait || skill) ? '<div class="bk__extra">' +
          (skill ? '<span>✦ 스킬 ' + skill.name + '</span>' : '') +
          (trait ? '<span>' + trait.icon + ' ' + trait.name + '</span>' : '') + '</div>' : '') +
      '</article>';
    }).join('') : (spellHtml.html ? '' : '<p class="empty">찾는 조합식이 없습니다.</p>'));
  }

  /* ---------- 숨겨진 조합(주문) ----------
   * 재료와 주문 문구는 처음부터 보여 준다. 발견하기 전에는 **결과만** 그림자 + ??? 로 가린다 —
   * 무엇을 모아 무엇을 외칠지는 알되, 무엇이 나올지는 한 번 만들어 봐야 안다. */
  function spellRows() {
    if (!RPD.SpellData) return { html: '', count: 0 };
    var q = Book.query.trim().toLowerCase().replace(/\s+/g, '');
    var list = RPD.SpellData.list.filter(function (sp) {
      var rt = RPD.PokemonData.get(sp.result).tier;
      if (Book.tier === 'HIDDEN' && sp.kind !== 'hidden') return false;
      if (Book.tier !== 'ALL' && Book.tier !== 'HIDDEN' && rt !== Book.tier) return false;
      if (Book.role !== 'ALL') return false;
      var known = RPD.SaveManager.knowsSpell && RPD.SaveManager.knowsSpell(sp.id);
      if (!q) return true;
      if (RPD.SpellData.normalize(sp.phrase).indexOf(q) >= 0) return true;
      // 재료 이름으로는 언제나 찾는다 — "캐터피가 들어가는 주문"
      var hitMat = sp.materials.some(function (m) {
        var n = RPD.PokemonData.get(m).name.replace(/\s+/g, '');
        return n.indexOf(q) >= 0 || (isChoOnly(q) && choseong(n).indexOf(q) >= 0);
      });
      if (hitMat) return true;
      if (!known) return false;          // 결과 이름으로는 발견한 뒤에만(이름이 곧 정답이다)
      var name = RPD.PokemonData.get(sp.result).name.replace(/\s+/g, '');
      return name.indexOf(q) >= 0 || (isChoOnly(q) && choseong(name).indexOf(q) >= 0);
    });
    var RULE = { hidden: '히든 · 재료만 있으면', immortal: '불멸 · 전설 3마리', transcend: '전설 이상 + 초월의 조각 · 판당 하나' };
    var html = list.map(function (sp) {
      var t = RPD.Tiers[RPD.PokemonData.get(sp.result).tier];
      var known = RPD.SaveManager.knowsSpell && RPD.SaveManager.knowsSpell(sp.id);
      var def = RPD.PokemonData.get(sp.result);
      var owned = ownedCounts(), used = {};
      var mats = sp.materials.map(function (m) {
        used[m] = (used[m] || 0) + 1;
        return matHtml(m, (owned[m] || 0) >= used[m]);
      }).join('<i class="bk__plus">+</i>') + (sp.kind === 'transcend' ? '<i class="bk__plus">+</i><span class="bk__item">✦ 초월의 조각</span>' : '');
      return '<article class="bk__row bk__row--spell' + (known ? '' : ' bk__row--secret') + '" style="--tier:' + t.color + '">' +
        '<div class="bk__res">' + (known ? RPD.UI.sprite(def, 'spr--bkres') : RPD.UI.shadow(def, 'spr--bkres')) +
          '<div><span class="bk__tier">' + t.label + (known ? ' · 발견함' : ' · 아직 모름') + '</span>' +
          '<b class="bk__name">' + (known ? def.name : '???') + '</b>' +
          '<span class="bk__alias">' + RULE[sp.kind] + '</span></div></div>' +
          (known ? '' : '<p class="bk__secret">재료를 모으고 채팅(Enter)으로 주문을 외치면 무엇이 나오는지 알게 된다.</p>') +
        '<div class="bk__mats">' + mats + '</div>' +
        '<div class="bk__common"><span class="bk__label">주문</span><span class="bk__phrase">「' + sp.phrase + '」</span></div>' +
      '</article>';
    }).join('');
    return { html: html, count: list.length };
  }

  function renderFilters() {
    if (!el.tiers) return;
    // '히든'은 등급이 아니라 얻는 법이지만, 주문만 모아 보는 칩으로 둔다
    var tiers = ['ALL'].concat(RPD.TIER_ORDER.slice(1)).concat(['HIDDEN']).concat(RPD.SPECIAL_TIERS || []);
    el.tiers.innerHTML = tiers.map(function (id) {
      var t = RPD.Tiers[id];
      var label = id === 'HIDDEN' ? '🔒 히든' : (t ? t.label : '전체');
      return '<button type="button" class="tchip' + (Book.tier === id ? ' is-on' : '') + '" data-tier="' + id + '"' +
        (t ? ' style="--tier:' + t.color + '"' : (id === 'HIDDEN' ? ' style="--tier:#2ee6c6"' : '')) + '>' + label + '</button>';
    }).join('');
    var roles = RPD.PokemonData.Roles;
    var opts = '<option value="ALL">역할 · 타입 전체</option><optgroup label="역할">' +
      Object.keys(roles).map(function (r) { return '<option value="' + r + '"' + (Book.role === r ? ' selected' : '') + '>' + roles[r] + '</option>'; }).join('') +
      '</optgroup><optgroup label="타입">' +
      Object.keys(RPD.Synergies).map(function (ty) { return '<option value="' + ty + '"' + (Book.role === ty ? ' selected' : '') + '>' + RPD.Types[ty].label + '</option>'; }).join('') +
      '</optgroup>';
    el.role.innerHTML = opts;
  }

  Book.open = function () {
    if (!el.overlay) return;
    el.overlay.hidden = false;
    renderFilters();
    render();
    if (el.search && el.search.focus) el.search.focus();
  };
  Book.close = function () { if (el.overlay) el.overlay.hidden = true; };
  Book.toggle = function () { if (el.overlay && el.overlay.hidden) Book.open(); else Book.close(); };
  Book.render = render;

  Book.init = function () {
    el.overlay = $('bookOverlay'); el.list = $('bookList'); el.search = $('bookSearch');
    el.tiers = $('bookTiers'); el.role = $('bookRole'); el.sort = $('bookSort'); el.count = $('bookCount');
    el.btn = $('btnBook'); el.close = $('btnBookClose');
    if (!el.overlay) return;

    if (el.btn) el.btn.addEventListener('click', Book.toggle);
    if (el.close) el.close.addEventListener('click', Book.close);
    el.overlay.addEventListener('click', function (e) { if (e.target === el.overlay) Book.close(); });
    // 검색칸에 글자를 치는 중에도 Esc 는 사전을 닫는다(전역 단축키는 입력칸에서 쉬므로 여기서 받는다)
    el.overlay.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { Book.close(); if (e.stopPropagation) e.stopPropagation(); }
    });
    if (el.search) el.search.addEventListener('input', function () { Book.query = this.value; render(); });
    if (el.role) el.role.addEventListener('change', function () { Book.role = this.value; render(); });
    if (el.sort) el.sort.addEventListener('change', function () { Book.sort = this.value; render(); });
    if (el.tiers) el.tiers.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-tier]');
      if (!b) return;
      Book.tier = b.dataset.tier; renderFilters(); render();
    });
    // 재료를 누르면 그 포켓몬 이름으로 찾는다
    el.list.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-find]');
      if (!b) return;
      Book.query = b.dataset.find; Book.tier = 'ALL';
      if (el.search) el.search.value = Book.query;
      renderFilters(); render();
    });
    RPD.bus.on('recipe:crafted', function () { if (!el.overlay.hidden) render(); });
  };

  RPD.RecipeBook = Book;
})(typeof window !== 'undefined' ? window : globalThis);
