/* DexCard.js — 도감에서 포켓몬을 누르면 뜨는 세부 카드 (세션 61).
 *
 * 수치는 UnitManager.baseStats — 필드에 없는 임시 개체를 만들어 recompute 를 그대로 돌린 값이다
 * (게임 속 칸 정보 카드와 같은 식). 판 안에서 바뀌는 것(강화 · 골드 상점 · 시너지 · 옆 버퍼 · 스킬 버프 · 도감 보너스)은 빼고,
 * 영구 보정(CraftPower · RoleTuning) · 종 고유 특성 · 자기 전설 패시브(필드에 올리면 늘 자신에게도 걸린다)는 넣는다.
 *
 * 비밀 규칙
 *   - 도감에 등록 안 된 포켓몬: 그림자 + "아직 만나지 못한 포켓몬"만. 이름 · 수치 · 스킬 · 조합식은 HTML 에도 넣지 않는다.
 *   - 재료 · 쓰이는 곳에 나오는 안 밝혀진 히든(UI.isSecret): 그림자 + ❔, 눌러도 이동 안 함.
 *   - 카드 안의 이동은 포켓몬 id 가 아니라 도감 번호(data-dc-go="번호")로 — id 가 곧 영어 이름이라서.
 *
 * 화면: PC 는 도감 창 가운데 카드, 휴대폰(1100px 미만)은 아래에서 올라오는 시트(css/mobile.css).
 * 이전 · 다음(도감 번호 순) · 닫기(× · 바깥 누르기 · Esc). ← → 키로도 넘긴다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  var DexCard = { n: -1 };
  var el = {};

  function list() { return RPD.PokemonData.list; }
  function numLabel(n) { var s = String(n + 1); while (s.length < 3) s = '0' + s; return 'No.' + s; }
  function indexOf(id) {
    var L = list();
    for (var i = 0; i < L.length; i++) if (L[i].id === id) return i;
    return -1;
  }
  function seen(def) { return !!(RPD.SaveManager && RPD.SaveManager.hasSeen(def.id)); }
  function pct(v) { return Math.round(v * 100) + '%'; }
  function num(v) { return RPD.Utils.formatNumber(Math.round(v)); }

  var RANGE_WORD = function (r) {
    var R = RPD.Range;
    return r >= R.GLOBAL ? '전체' : r <= R.SHORT ? '근접' : r <= R.MID ? '중거리' : '장거리';
  };
  var TARGET_WORD = { FIRST: '출구에 가까운 적', LAST: '갓 나온 적', STRONGEST: '체력이 가장 많은 적', WEAKEST: '체력이 가장 적은 적', BOSS: '보스 우선' };

  /* ---------- 얻는 법 ---------- */
  var SPELL_KIND = { hidden: '히든 주문', immortal: '불멸 주문', transcend: '초월 주문' };
  function howChips(def) {
    var out = [];
    if (def.summon) out.push('소환');
    var routes = RPD.RecipeData.routesOf(def.id);
    if (routes.length) out.push('조합' + (routes.length > 1 ? ' · 경로 ' + routes.length : ''));
    var sp = RPD.SpellData && RPD.SpellData.forResult(def.id);
    if (sp) out.push(SPELL_KIND[sp.kind] || '주문');
    if (!out.length) out.push('보상');
    return out.map(function (t) { return '<span class="dc__how">' + t + '</span>'; }).join('');
  }

  /* ---------- 공격 방식 · 부가 효과 — 그 개체가 가진 것만 (시너지 없는 기본값) ---------- */
  function effectsOf(def, u) {
    var P = RPD.TypeParams, f = u.typeFlags, out = [];
    if (u.attackType === 'SPLASH') out.push('광역 반경 ' + u.splash + ' · 주변 적 ' + pct(RPD.Config.splashDamageRatio) + ' 피해');
    // 연쇄 수 · 관통 수는 위 '공격 방식' 칸에 이미 있다
    var slow = def.slowMul || (f.WATER ? P.slowMul : 0);
    if (slow) out.push('감속 ' + pct(1 - slow) + ' · ' + (def.slowDuration || P.slowDuration) + '초');
    var frz = def.freezeChance || (f.ICE ? P.freezeChance : 0);
    if (frz) out.push('빙결 ' + pct(frz) + ' · ' + (def.freezeDuration || P.freezeDuration) + '초');
    else if (f.ROCK) out.push('기절 ' + pct(P.stunChance) + ' · ' + P.stunDuration + '초');
    var shred = def.armorShred || (f.STEEL ? P.armorShred : 0);
    if (shred) out.push('방어 깎기 ' + shred);
    if (f.FIRE) out.push('화상 — 준 피해의 ' + pct(P.burnRatio) + '를 ' + P.burnDuration + '초에 걸쳐');
    if (f.POISON) out.push('독 — 준 피해의 ' + pct(P.poisonRatio) + '를 ' + P.poisonDuration + '초 · 최대 ' + P.poisonMaxStacks + '중첩');
    if (f.FIGHTING) out.push('보스에게 피해 ×' + P.bossDamageMul);
    if (def.bossDamage) out.push('보스에게 피해 +' + pct(def.bossDamage));
    if (f.DARK) out.push('처형 — 체력 ' + pct(P.executeThreshold) + ' 이하 적 즉시 처치(보스 제외)');
    if (u.ignoreArmor) out.push('방어 무시');
    if (def.goldPerKill) out.push('처치 골드 +' + def.goldPerKill);
    if (def.auraAttack) {
      var amt = def.auraAttack * (RPD.RoleTuning ? RPD.RoleTuning.aura(def.role) : 1);
      out.push((def.auraGlobal ? '아군 전체' : '옆 칸') + ' 공격력 +' + pct(amt));
    }
    return out;
  }

  /* ---------- 보정 — 영구로 붙는 것 ---------- */
  function tuneChips(def) {
    var out = [];
    var cp = RPD.CraftPower && RPD.CraftPower.labelOf(def);
    if (cp) out.push(cp);
    var RT = RPD.RoleTuning;
    if (RT) {
      var a = RT.attack(def.role), s = RT.speedOf(def), au = def.auraAttack ? RT.aura(def.role) : 1;
      if (a !== 1) out.push('역할 보정 피해 ×' + a);
      if (Math.abs(s - 1) > 1e-9) out.push('역할 · 공격 방식 보정 공격속도 ×' + (Math.round(s * 1000) / 1000));
      if (au !== 1) out.push('역할 보정 오라 ×' + au);
    }
    return out.map(function (t) { return '<span class="dc__tune">' + t + '</span>'; }).join('');
  }

  /* ---------- 포켓몬 버튼 하나(재료 · 쓰이는 곳) ---------- */
  function monBtn(id, extra, cls) {
    var UI = RPD.UI, d = RPD.PokemonData.get(id);
    if (!d) return '';
    var color = UI.tierColor(d.tier);
    if (UI.isSecret(id)) {
      return '<span class="dc__mon is-secret ' + (cls || '') + '" style="--mt:' + color + '" title="아직 모르는 포켓몬">' +
        UI.shadow(d, 'spr--dc') + '<span class="dc__monName">??? <i class="dc__q">❔</i>' + (extra || '') + '</span></span>';
    }
    return '<button type="button" class="dc__mon ' + (cls || '') + '" data-dc-go="' + indexOf(id) + '" style="--mt:' + color + '" title="' + d.name + ' 카드 보기">' +
      UI.sprite(d, 'spr--dc') + '<span class="dc__monName">' + d.name + (extra || '') + '</span></button>';
  }
  function groupIds(ids) {
    var out = [], at = {};
    ids.forEach(function (id) {
      if (at[id] == null) { at[id] = out.length; out.push({ id: id, need: 0 }); }
      out[at[id]].need += 1;
    });
    return out;
  }
  function matsRow(ids) {
    return '<div class="dc__mats">' + groupIds(ids).map(function (g) {
      return monBtn(g.id, g.need > 1 ? ' ×' + g.need : '');
    }).join('<span class="rplus">+</span>') + '</div>';
  }

  function makesHtml(def) {
    var routes = RPD.RecipeData.routesOf(def.id);
    var sp = RPD.SpellData && RPD.SpellData.forResult(def.id);
    var parts = [];
    routes.forEach(function (r, i) {
      if (i > 0) parts.push('<p class="rp__or">또는</p>');
      parts.push(matsRow(r.materials));
    });
    if (sp) {
      parts.push(matsRow(sp.materials) +
        '<p class="dc__phrase">' + (SPELL_KIND[sp.kind] || '주문') + ' — 재료를 모으고 채팅(Enter)으로 「' + sp.phrase + '」</p>');
    }
    if (!parts.length) {
      parts.push('<p class="rp__note">' + (def.summon ? '조합식이 없습니다. 소환(과 라운드 무료 지급)으로 얻습니다.'
        : '조합식이 없습니다. 보스 보상 · 조각 상점으로 얻습니다.') + '</p>');
    } else if (def.summon) {
      parts.unshift('<p class="rp__note">소환으로도 나옵니다.</p>');
    }
    return parts.join('');
  }

  function usesHtml(def) {
    var items = [];
    var seenKey = {};
    RPD.RecipeData.usedIn(def.id).forEach(function (r) {
      if (seenKey[r.id]) return;       // 경로가 둘인 결과는 한 번만
      seenKey[r.id] = true;
      items.push({ id: r.id, tag: '' });
    });
    (RPD.SpellData ? RPD.SpellData.list : []).forEach(function (sp) {
      if (sp.materials.indexOf(def.id) < 0 || seenKey[sp.result]) return;
      seenKey[sp.result] = true;
      items.push({ id: sp.result, tag: ' <small>' + (SPELL_KIND[sp.kind] || '주문') + '</small>' });
    });
    items.sort(function (a, b) {
      return RPD.TIER_ORDER.indexOf(RPD.PokemonData.get(b.id).tier) - RPD.TIER_ORDER.indexOf(RPD.PokemonData.get(a.id).tier);
    });
    return { n: items.length, html: items.length
      ? '<div class="dc__uses">' + items.map(function (it) { return monBtn(it.id, it.tag, 'dc__mon--use'); }).join('') + '</div>'
      : '<p class="rp__note">재료로 쓰이는 곳이 없습니다.</p>' };
  }

  /* ---------- 카드 전체 ---------- */
  DexCard.html = function (n) {
    var UI = RPD.UI, L = list(), def = L[n];
    if (!def) return '';
    var tier = RPD.Tiers[def.tier] || RPD.Tiers.T1;
    var nav = '<div class="dc__nav">' +
      '<button type="button" class="dc__step" data-dc-go="' + ((n - 1 + L.length) % L.length) + '" aria-label="이전 포켓몬">‹</button>' +
      '<span class="dc__no">' + numLabel(n) + '</span>' +
      '<button type="button" class="dc__step" data-dc-go="' + ((n + 1) % L.length) + '" aria-label="다음 포켓몬">›</button>' +
      '<button type="button" class="dc__close" data-dc-close aria-label="닫기">×</button></div>';

    if (!seen(def)) {
      return nav + '<div class="dc__hero is-locked" style="--tier:' + tier.color + '">' + UI.shadow(def, 'spr--dchero') +
        '<div class="dc__who"><span class="sc__name">???</span>' +
        '<span class="dc__locked">아직 만나지 못한 포켓몬</span>' +
        '<span class="dc__hint">소환 · 조합 · 주문으로 한 번 만나면 도감에 등록되고 자세한 정보가 열립니다.</span></div></div>';
    }

    var u = RPD.UnitManager.baseStats(def.id);
    var rangeTxt = u.range >= RPD.Range.GLOBAL ? '전체' : u.range + ' <small>' + RANGE_WORD(def.range) + '</small>';
    var stats = [
      ['대표 DPS', num(u.dps), 'is-key'],
      ['공격력', num(u.attack)],
      ['공격속도', u.attackSpeed.toFixed(2) + '<small>/초</small>'],
      ['사거리', rangeTxt],
      ['공격 방식', UI.attackNote(u)],
      ['치명타', pct(u.critRate) + ' <small>· 피해 ×' + (Math.round(u.critDamage * 100) / 100) + '</small>'],
      ['기본 대상', TARGET_WORD[def.targeting] || TARGET_WORD.FIRST]
    ];
    var fx = effectsOf(def, u);
    var tune = tuneChips(def);
    var uses = usesHtml(def);
    var skill = u.skill;

    return nav +
      '<div class="dc__hero" style="--tier:' + tier.color + '">' + UI.sprite(def, 'spr--dchero') +
        '<div class="dc__who">' +
          '<span class="sc__tier">' + tier.label + ' · ' + def.roleLabel + '</span>' +
          '<span class="sc__name">' + def.name + '</span>' +
          '<span class="typerow">' + UI.typeChips(def.types) + '</span>' +
          '<span class="dc__hows">' + howChips(def) + '</span>' +
        '</div></div>' +
      '<p class="dc__basis">판 안 강화 · 버프 제외(골드 상점 · 시너지 · 옆 버퍼 · 도감 보너스) — 영구 보정 · 자기 패시브는 포함</p>' +
      '<dl class="sc__stats dc__stats">' + stats.map(function (r) {
        return '<div' + (r[2] ? ' class="' + r[2] + '"' : '') + '><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>';
      }).join('') + '</dl>' +
      (fx.length ? '<ul class="dc__fx">' + fx.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul>' : '') +
      (tune ? '<div class="dc__tunes">' + tune + '</div>' : '') +
      (skill ? UI.skillBox(skill, '쿨다운 ' + skill.cooldown + '초', false) : '') +
      UI.passiveBox(def) +
      UI.trait(def.id, 'trait--card') +
      UI.aura(def.id, 'trait--card') +
      '<p class="rp__label">만드는 법</p>' + makesHtml(def) +
      '<p class="rp__label">재료로 쓰이는 곳 <span>' + uses.n + '</span></p>' + uses.html;
  };

  /* ---------- 열고 닫기 ---------- */
  DexCard.open = function (n) {
    if (!el.root || !el.panel) return false;
    var L = list();
    n = +n;
    if (!(n >= 0 && n < L.length)) return false;
    DexCard.n = n;
    el.panel.innerHTML = DexCard.html(n);
    el.panel.style.setProperty && el.panel.style.setProperty('--tier', (RPD.Tiers[L[n].tier] || RPD.Tiers.T1).color);
    el.root.hidden = false;
    if (el.panel.scrollTop != null) el.panel.scrollTop = 0;
    return true;
  };
  DexCard.openId = function (id) { return DexCard.open(indexOf(id)); };
  DexCard.close = function () {
    if (!el.root) return;
    el.root.hidden = true;
    DexCard.n = -1;
    if (el.panel) el.panel.innerHTML = '';
  };
  DexCard.isOpen = function () { return !!(el.root && !el.root.hidden); };
  DexCard.step = function (d) {
    if (!DexCard.isOpen()) return false;
    var L = list();
    return DexCard.open((DexCard.n + d + L.length) % L.length);
  };

  DexCard.init = function () {
    if (typeof document === 'undefined') return;
    el.root = document.getElementById('dexCard');
    el.panel = document.getElementById('dexCardPanel');
    el.grid = document.getElementById('dexGrid');
    if (!el.root || !el.panel) return;

    if (el.grid) el.grid.addEventListener('click', function (e) {
      var cell = e.target && e.target.closest && e.target.closest('[data-dex-n]');
      if (cell) DexCard.open(cell.dataset.dexN);
    });
    el.root.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      if (t.closest('[data-dc-close]') || t === el.root) { DexCard.close(); return; }
      var go = t.closest('[data-dc-go]');
      if (go) DexCard.open(go.dataset.dcGo);
    });
    // Esc 는 카드만 닫는다(도감은 그대로) — 전체 단축키(HudPanels)보다 먼저 받는다
    document.addEventListener('keydown', function (e) {
      if (!DexCard.isOpen()) return;
      var k = e.key;
      if (k === 'Escape') DexCard.close();
      else if (k === 'ArrowLeft') DexCard.step(-1);
      else if (k === 'ArrowRight') DexCard.step(1);
      else return;
      if (e.preventDefault) e.preventDefault();
      if (e.stopPropagation) e.stopPropagation();
    }, true);
  };

  RPD.DexCard = DexCard;
})(typeof window !== 'undefined' ? window : globalThis);
