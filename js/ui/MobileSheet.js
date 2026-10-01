/* MobileSheet.js — 휴대폰(1100px 미만): 필드는 고정, 나머지는 시트 (모바일 재설계 ① · 세션 65).
 *
 * 예전(세션 51~52) 불편: ① 칸을 고르면 정보 카드가 필드 위에 떠서 옮길 칸을 가렸다 ② 서랍을 열면 필드(캔버스)가 줄었다.
 * 그래서
 *   필드 캔버스의 화면 크기는 무엇이 열리고 닫혀도 안 변한다 — 필드 줄(격자) 둘레는 높이가 정해진 줄뿐이고(css/mobile.css),
 *     패널은 필드를 밀지 않고 필드 위를 덮는 시트다(세로: 아래에서 · 가로: 오른쪽에서). 시트는 필드 영역 안에서만 열려
 *     정보 바 · 소환 · 탭은 늘 보인다.
 *   시트 — 조합식 · 보유 · 시너지 · 도감(탭) · 골드 상점 · 정예 · 조합 사전 · 자세한 칸 정보. 높이(가로는 너비)는
 *     peek(한 줄) · 절반 · 전체(화면의 45%) — 손잡이를 끌거나 눌러 바꾼다. 필드를 누르면 peek 로 내려간다(선택은 그대로).
 *   정보 바 — 칸을 고르면 필드 밖 한 줄에 이름 · 등급 · DPS + [이동][창고로][사거리 강화][방출].
 *     위로 밀거나 길게 누르면 자세한 정보(예전 정보 카드 — 스킬 · 특성 · 버프 · 공격 대상)가 시트로.
 *   [이동] — 옮길 칸을 누르면 그리로(누가 있으면 맞바꾼다). 옮길 수 있는 칸이 반짝이고 칸마다 근접용 · 중거리용 · 장거리 · 구석 태그.
 *     칸 누르기는 손가락 크기(지름 44px) 기준으로 가장 가까운 칸.
 * PC(1100px 이상)에서는 아무것도 하지 않는다 — 정보 바 · 손잡이는 CSS 가 숨기고, 여기 입력 처리도 isMobile() 로 막는다.
 * 기존 버튼(강화 · 창고로 · 방출)과 단축키(W · S · X · Esc …)는 그대로다 — 정보 바의 버튼은 그 버튼을 누를 뿐이다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;
  var F = RPD.FieldManager;

  var PANE_TITLE = { recipes: '조합식', owned: '보유 포켓몬', synergy: '타입 시너지', dex: '도감' };
  var OVERLAYS = [
    { id: 'goldShopOverlay', title: '골드 상점' },
    { id: 'eliteOverlay', title: '정예 소환' },
    { id: 'bookOverlay', title: '조합 사전' }
  ];
  var FINGER = 44;              // 손가락 지름(화면 px) — 칸 누르기 범위
  var SWIPE_UP = 24;            // 정보 바를 이만큼 위로 밀면 자세한 정보
  var HOLD_MS = 450;            // 정보 바 길게 누르기

  var M = {
    forceMobile: false,         // 검사용(가짜 DOM 에는 matchMedia 가 없다)
    moving: -1,                 // 이동 모드 — 옮길 개체가 있는 칸 번호(-1 이면 아님)
    kinds: null,                // 이동 모드 동안 칸 태그(칸마다 한 번만 판정)
    detail: false,              // 자세한 칸 정보 시트
    size: 'half',               // 시트 크기 peek · half · full
    actions: null               // UIManager 가 알려 준 버튼 상태(ui:actions)
  };
  var el = {};

  function doc() { return typeof document !== 'undefined' ? document : null; }
  function body() { var d = doc(); return d && d.body; }
  M.isMobile = function () {
    if (M.forceMobile) return true;
    return !!(global.matchMedia && global.matchMedia('(max-width: 1099.98px)').matches);
  };
  function landscape() { return !!(global.matchMedia && global.matchMedia('(orientation: landscape)').matches); }

  /* ---------- 필드 영역 — 시트는 이 사각형 안에서만 열린다 ---------- */
  M.measure = function () {
    var d = doc(), b = el.board;
    if (!d || !b || !b.getBoundingClientRect || !d.documentElement || !d.documentElement.style) return;
    var r = b.getBoundingClientRect(), s = d.documentElement.style;
    var vw = global.innerWidth || r.right, vh = global.innerHeight || r.bottom;
    s.setProperty('--bt', Math.round(r.top) + 'px');
    s.setProperty('--bl', Math.round(r.left) + 'px');
    s.setProperty('--bb', Math.round(vh - r.bottom) + 'px');
    s.setProperty('--br', Math.round(vw - r.right) + 'px');
    s.setProperty('--bw', Math.round(r.width) + 'px');
    s.setProperty('--bh', Math.round(r.height) + 'px');
  };

  /* ---------- 시트 ---------- */
  function openSheets() {
    var out = [], bd = body(), d = doc();
    if (!bd || !d) return out;
    var tab = bd.getAttribute('data-mtab') || '';
    if (PANE_TITLE[tab]) out.push(PANE_TITLE[tab]);
    OVERLAYS.forEach(function (o) { var n = d.getElementById(o.id); if (n && !n.hidden) out.push(o.title); });
    if (M.detail) out.push('칸 정보');
    return out;
  }
  M.openSheets = openSheets;

  M.setSize = function (size) {
    M.size = size === 'peek' || size === 'full' ? size : 'half';
    var bd = body();
    if (bd && bd.setAttribute) bd.setAttribute('data-sheet', M.size);
    return M.size;
  };

  /* 열린 시트가 있으면 손잡이를 보이고 제목(맨 위 시트)을 단다 */
  M.sync = function () {
    var bd = body();
    if (!bd || !bd.classList) return;
    var open = openSheets();
    bd.classList.toggle('has-sheet', open.length > 0);
    bd.classList.toggle('is-slotsheet', !!M.detail);
    if (el.gripTitle) el.gripTitle.textContent = open.length ? open[open.length - 1] : '';
  };

  /* 끌기 — 세로: 필드 아래 끝에서 손가락까지가 시트 높이 · 가로: 필드 오른쪽 끝에서 손가락까지가 너비 */
  function limits() {
    var r = el.board.getBoundingClientRect();
    var land = landscape();
    var span = land ? r.width : r.height;
    var screen = land ? (global.innerWidth || r.width) : (global.innerHeight || r.height);
    var full = Math.min(screen * 0.45, span);
    return { r: r, land: land, peek: land ? 48 : 52, half: full / 2, full: full };
  }
  M.limits = limits;
  function bindGrip() {
    var g = el.grip;
    if (!g || !g.addEventListener) return;
    var drag = null;
    g.addEventListener('pointerdown', function (e) {
      if (!M.isMobile()) return;
      var L = limits();
      drag = { L: L, x: e.clientX, y: e.clientY, moved: false };
      if (g.setPointerCapture) { try { g.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ } }
      if (e.preventDefault) e.preventDefault();
    });
    g.addEventListener('pointermove', function (e) {
      if (!drag) return;
      if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 6) drag.moved = true;
      if (!drag.moved) return;
      var L = drag.L;
      var px = L.land ? L.r.right - e.clientX : L.r.bottom - e.clientY;
      px = Math.max(L.peek, Math.min(L.full, px));
      var bd = body();
      bd.setAttribute('data-sheet', 'drag');
      bd.style.setProperty('--sheet-size', Math.round(px) + 'px');
      drag.px = px;
    });
    function end() {
      if (!drag) return;
      var d = drag, bd = body();
      drag = null;
      bd.style.removeProperty('--sheet-size');
      if (!d.moved) { M.setSize(M.size === 'peek' ? 'half' : 'peek'); return; }   // 누르기 = 접기/펴기
      var L = d.L, best = 'half', bestD = Infinity;
      [['peek', L.peek], ['half', L.half], ['full', L.full]].forEach(function (c) {
        var dd = Math.abs(c[1] - d.px);
        if (dd < bestD) { bestD = dd; best = c[0]; }
      });
      M.setSize(best);
    }
    g.addEventListener('pointerup', end);
    g.addEventListener('pointercancel', end);
  }

  /* ---------- 자세한 칸 정보(예전 정보 카드) ---------- */
  M.openDetail = function () {
    if (!F.getSelected()) return false;
    M.detail = true;
    M.setSize(landscape() ? 'full' : 'half');   // 가로는 시트 너비가 좁아 절반이면 카드가 한 글자씩 접힌다
    M.sync();
    return true;
  };
  M.closeDetail = function () {
    if (!M.detail) return;
    M.detail = false;
    M.sync();
  };

  /* ---------- 이동 모드 ---------- */
  M.startMove = function () {
    var s = F.getSelected();
    if (!s || !s.unit) return false;
    M.moving = s.index;
    M.kinds = {};
    F.slots.forEach(function (x) { if (x.unlocked && !x.blocked) M.kinds[x.index] = RPD.UI.slotKind(x).short; });
    F.cancelDrag();
    M.closeDetail();
    var bd = body(); if (bd && bd.classList) bd.classList.add('is-moving');
    renderBar();
    return true;
  };
  M.cancelMove = function () {
    if (M.moving < 0) return;
    M.moving = -1; M.kinds = null;
    var bd = body(); if (bd && bd.classList) bd.classList.remove('is-moving');
    renderBar();
  };
  /* 옮길 칸으로 — 빈 칸이면 옮기고, 누가 있으면 맞바꾼다. 같은 칸이면 취소. 잠긴 칸은 그대로 이동 모드 */
  M.moveTo = function (idx) {
    var from = M.moving;
    if (from < 0) return false;
    var t = F.get(idx);
    if (idx === from) { M.cancelMove(); return false; }
    if (!t || !t.unlocked || t.blocked) {
      if (t && RPD.FxRenderer) RPD.FxRenderer.text(t.x, t.y - 34, '잠긴 칸 — 옮길 수 없습니다', '#ff8a7a', { size: 14, life: 1.1, jitter: false });
      return false;
    }
    var ok = F.swap(from, idx);
    M.cancelMove();
    if (ok) F.select(idx);
    return ok;
  };
  /* 화면 좌표 → 가장 가까운 칸(손가락 지름 44px — 손가락 끝 원이 닿는 칸 중 가장 가까운 것) */
  M.slotAt = function (clientX, clientY) {
    var p = RPD.Renderer.toLogical(clientX, clientY);
    var sc = (RPD.Renderer.toCanvasCss ? RPD.Renderer.toCanvasCss(0, 0).scale : RPD.Renderer.scale) || 1;
    return F.hitTestNear(p.x, p.y, (FINGER / 2) / sc);
  };
  M.FINGER = FINGER;

  /* 이동 모드 그리기 — 옮길 수 있는 칸 반짝임 + 칸 태그. 논리 좌표(세로 화면 90° 돌림은 Renderer 가 맡는다) */
  function drawMove(ctx) {
    if (M.moving < 0) return;
    var t = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
    var pulse = 0.55 + 0.45 * Math.sin(t * 6);
    ctx.save();
    F.slots.forEach(function (s) {
      if (!s.unlocked || s.blocked) return;
      var half = s.size / 2;
      if (s.index === M.moving) {
        ctx.setLineDash([6, 5]);
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.lineWidth = 3;
        ctx.strokeRect(s.x - half - 4, s.y - half - 4, s.size + 8, s.size + 8);
        ctx.setLineDash([]);
        return;
      }
      ctx.globalAlpha = 0.35 + 0.55 * pulse;
      ctx.strokeStyle = s.unit ? '#62a4ff' : '#ffd84a';     // 빈 칸 금색 · 바꿀 칸 파랑
      ctx.lineWidth = 4;
      ctx.strokeRect(s.x - half - 3, s.y - half - 3, s.size + 6, s.size + 6);
      ctx.globalAlpha = 1;
      var tag = M.kinds && M.kinds[s.index];
      if (tag) {
        var p = RPD.Renderer.at ? RPD.Renderer.at(s.x, s.y, 0, half + 13) : { x: s.x, y: s.y + half + 13 };
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        var w = ctx.measureText(tag).width + 10;
        ctx.fillStyle = 'rgba(8,18,40,0.82)';
        if (RPD.Renderer.rotated && RPD.Renderer.at) ctx.fillRect(p.x - 11, p.y - w / 2, 22, w);
        else ctx.fillRect(p.x - w / 2, p.y - 11, w, 22);
        ctx.fillStyle = '#fff';
        ctx.fillText(tag, p.x, p.y);
      }
    });
    ctx.restore();
  }

  /* ---------- 정보 바 ---------- */
  function btn(act, label, sub, disabled, cls) {
    return '<button type="button" class="ib__btn ' + (cls || '') + '" data-ib="' + act + '"' + (disabled ? ' disabled' : '') + '>' +
      '<span>' + label + '</span>' + (sub ? '<small>' + sub + '</small>' : '') + '</button>';
  }
  function renderBar() {
    if (!el.bar) return;
    var U = RPD.UI, s = F.getSelected(), A = M.actions || {};
    var html, T = RPD.MobileToolbar;
    var toast = T && T.toastHtml ? T.toastHtml() : '';
    if (M.moving < 0 && toast) {
      html = toast;                                                  // 보스 보상 지급 알림(세션 67) — 3.2초 · 누르면 닫힘
    } else if (M.moving >= 0) {
      var mu = F.get(M.moving) && F.get(M.moving).unit;
      html = '<div class="ib__who ib__who--move"><span class="ib__name">옮길 칸을 누르세요</span>' +
        '<span class="ib__meta">' + (mu ? mu.name + ' · ' : '') + '빈 칸 금색 · 바꿀 칸 파랑</span></div>' +
        '<div class="ib__acts">' + btn('cancel', '취소', '', false, 'ib__btn--cancel') + '</div>';
    } else if (s && s.unit) {
      var u = s.unit, tier = RPD.Tiers[u.tier] || RPD.Tiers.T1;
      html = '<div class="ib__who" style="--tier:' + tier.color + '">' + U.sprite(u.def, 'spr--ib') +
        '<span class="ib__txt"><span class="ib__name">' + u.name + '</span>' +
        '<span class="ib__meta"><b style="color:' + tier.color + '">' + tier.label + '</b><span class="ib__sep"> · </span>' +
          '<span class="ib__dps">DPS ' + RPD.Utils.formatNumber(Math.round(u.dps)) + '</span></span></span></div>' +
        '<div class="ib__acts">' +
          btn('move', '이동', '', false) +
          btn('lock', A.lock && A.lock.on ? '🔒' : '🔓', A.lock && A.lock.on ? '해제' : '잠금', A.lock ? A.lock.disabled : false, 'ib__btn--lock' + (A.lock && A.lock.on ? ' is-on' : '')) +
          btn('store', '창고로', '', A.store ? A.store.disabled : false) +
          btn('upgrade', '강화', A.upgrade ? A.upgrade.cost : '', A.upgrade ? A.upgrade.disabled : false) +
          btn('sell', '방출', A.lock && A.lock.on ? '🔒' : (A.sell ? A.sell.value : ''), A.sell ? A.sell.disabled : false, 'ib__btn--danger') +
        '</div>';
    } else if (s) {
      var k = U.slotKind(s);
      html = '<div class="ib__who"><span class="ib__txt"><span class="ib__name">' + (s.unlocked ? '빈 칸' : '잠긴 칸 · ' + s.cost + 'G') + '</span>' +
        '<span class="ib__meta">' + (s.kindLabel ? s.kindLabel + ' · ' : '') + k.label +
        (s.unlocked ? '' : ' — 한 번 더 누르면 구매') + '</span></span></div>';
    } else if (T && T.craftHtml && (html = T.craftHtml())) {
      // "★ 조합 가능 · 이름" — 아무 칸도 안 골랐을 때(세션 67 — 따로 있던 줄을 합쳤다)
    } else {
      html = '<div class="ib__who"><span class="ib__txt"><span class="ib__name ib__name--hint">칸을 누르면 여기에 정보가 나옵니다</span>' +
        '<span class="ib__meta">바를 위로 밀거나 길게 누르면 자세히</span></span></div>';
    }
    if (M.moving < 0) html = withUndo(html);
    el.bar.innerHTML = html;
  }
  M.renderBar = renderBar;

  /* [되돌리기](세션 68) — 이동 모드가 아니면 늘 같은 자리: 누구 다음 · 버튼 넷 앞(가로 화면은 누구 줄 오른쪽 끝).
   * 기록이 없으면 흐리게(disabled). 숫자 = 되돌릴 수 있는 횟수(최대 3) */
  function withUndo(html) {
    var U = RPD.UndoManager, n = U ? U.count() : 0;
    var b = '<button type="button" class="ib__btn ib__btn--undo" data-ib="undo"' + (n ? '' : ' disabled') +
      ' title="되돌리기 (Ctrl+Z) — 배치 이동만" aria-label="되돌리기' + (n ? ' ' + n + '번 가능' : ' — 기록 없음') + '">' +
      '<span>↶</span><small>' + (n ? n : '') + '</small></button>';
    var at = html.indexOf('<div class="ib__acts">');
    return at >= 0 ? html.slice(0, at) + b + html.slice(at) : html + b;
  }

  function clickById(id) {
    var d = doc(), n = d && d.getElementById(id);
    if (n && !n.disabled && n.click) { n.click(); return true; }
    return false;
  }
  function bindBar() {
    var b = el.bar;
    if (!b || !b.addEventListener) return;
    b.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('[data-ib]') : null;
      if (!t || t.disabled) return;
      var a = t.getAttribute('data-ib');
      if (a === 'move') M.startMove();
      else if (a === 'cancel') M.cancelMove();
      else if (a === 'lock') clickById('btnLock');
      else if (a === 'store') clickById('btnStore');
      else if (a === 'upgrade') clickById('btnUpgrade');
      else if (a === 'sell') clickById('btnSell');
      else if (a === 'craft') clickById('btnCraft');                           // [조합] 과 같은 조합식(craftBest)
      else if (a === 'toast' && RPD.MobileToolbar) RPD.MobileToolbar.dismissToast();
      else if (a === 'undo' && RPD.Convenience) RPD.Convenience.undo();         // 배치 이동만(세션 68 · UndoManager)
    });
    // 위로 밀기 · 길게 누르기(버튼이 아닌 곳) → 자세한 정보
    var g = null;
    b.addEventListener('pointerdown', function (e) {
      if (!M.isMobile() || M.moving >= 0) return;
      var onBtn = e.target && e.target.closest && e.target.closest('[data-ib]');
      g = { x: e.clientX, y: e.clientY, done: false };
      if (!onBtn) g.timer = setTimeout(function () { if (g && !g.done) { g.done = true; M.openDetail(); } }, HOLD_MS);
    });
    b.addEventListener('pointermove', function (e) {
      if (!g || g.done) return;
      if (g.y - e.clientY > SWIPE_UP) { g.done = true; clearTimeout(g.timer); M.openDetail(); }
      else if (Math.abs(e.clientX - g.x) + Math.abs(e.clientY - g.y) > 10) clearTimeout(g.timer);
    });
    ['pointerup', 'pointercancel'].forEach(function (ev) {
      b.addEventListener(ev, function () { if (g) clearTimeout(g.timer); g = null; });
    });
    b.addEventListener('touchmove', function (e) { if (g && e.cancelable && e.preventDefault) e.preventDefault(); }, { passive: false });
  }

  /* ---------- 필드 누르기 — 이동 모드는 여기서 먼저 받는다(UIManager 의 고르기 · 끌기보다 앞 · capture) ---------- */
  function bindField() {
    var bd = el.board;
    if (!bd || !bd.addEventListener) return;
    var t0 = null;
    function onCanvas(e) { return e.target && e.target.id === 'gameCanvas'; }
    function stop(e) { if (e.stopPropagation) e.stopPropagation(); if (e.cancelable && e.preventDefault) e.preventDefault(); }
    function lower() {
      // 필드를 누르면 시트는 peek 로 · 자세한 정보는 닫는다(선택은 그대로)
      if (M.detail) M.closeDetail();
      if (openSheets().length && M.size !== 'peek') M.setSize('peek');
    }
    bd.addEventListener('touchstart', function (e) {
      if (!M.isMobile() || !onCanvas(e)) return;
      var t = e.touches && e.touches[0];
      if (M.moving >= 0) { if (t) t0 = { x: t.clientX, y: t.clientY, moved: false }; stop(e); return; }
      lower();
    }, { capture: true, passive: false });
    bd.addEventListener('touchmove', function (e) {
      if (M.moving < 0 || !t0 || !onCanvas(e)) return;
      var t = e.touches && e.touches[0];
      if (t && Math.abs(t.clientX - t0.x) + Math.abs(t.clientY - t0.y) > 10) t0.moved = true;
      stop(e);
    }, { capture: true, passive: false });
    bd.addEventListener('touchend', function (e) {
      if (M.moving < 0 || !onCanvas(e)) return;
      stop(e);
      var t = e.changedTouches && e.changedTouches[0];
      var ok = t0 && !t0.moved && t;
      t0 = null;
      if (!ok) return;
      var idx = M.slotAt(t.clientX, t.clientY);
      if (idx >= 0) M.moveTo(idx);
    }, { capture: true, passive: false });
    // 마우스(휴대폰에 마우스를 꽂았거나 좁은 창) — 누르는 즉시
    bd.addEventListener('mousedown', function (e) {
      if (!M.isMobile() || !onCanvas(e)) return;
      if (M.moving >= 0) { stop(e); var idx = M.slotAt(e.clientX, e.clientY); if (idx >= 0) M.moveTo(idx); return; }
      lower();
    }, true);
  }

  M.init = function () {
    var d = doc();
    if (!d) return;
    el.bar = d.getElementById('infoBar');
    el.grip = d.getElementById('sheetGrip');
    el.gripTitle = d.getElementById('sheetGripTitle');
    el.board = d.querySelector ? d.querySelector('.board') : null;
    el.slotClose = d.getElementById('btnSlotClose');

    M.setSize('half');
    bindBar();
    bindGrip();
    bindField();

    // 탭(서랍) — 열면 절반 높이 시트
    var H = RPD.HudPanels;
    if (H && H.setDrawer) {
      var setDrawer = H.setDrawer;
      H.setDrawer = function (tab) { var next = setDrawer.apply(H, arguments); if (next) M.setSize('half'); M.sync(); return next; };
    }
    // 창(골드 상점 · 정예 · 조합 사전) — 열리면 전체 높이 시트
    if (typeof global.MutationObserver === 'function') {
      var mo = new global.MutationObserver(function (list) {
        var opened = list.some(function (m) { return m.target && !m.target.hidden; });
        if (opened) M.setSize('full');
        M.sync();
      });
      OVERLAYS.forEach(function (o) { var n = d.getElementById(o.id); if (n) mo.observe(n, { attributes: true, attributeFilter: ['hidden'] }); });
    }
    // 자세한 정보 시트의 × — 휴대폰에선 시트만 닫는다(선택은 정보 바에 남는다)
    if (el.slotClose && el.slotClose.addEventListener) {
      el.slotClose.addEventListener('click', function (e) {
        if (!M.isMobile() || !M.detail) return;
        M.closeDetail();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      }, true);
    }
    // Esc — 이동 모드 · 자세한 정보부터 닫는다
    d.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (M.moving >= 0) { M.cancelMove(); if (e.stopPropagation) e.stopPropagation(); }
      else if (M.detail) M.closeDetail();
    }, true);

    RPD.bus.on('ui:actions', function (a) { M.actions = a; renderBar(); });
    RPD.bus.on('field:select', function () {
      if (M.moving >= 0 && F.selectedIndex !== M.moving) M.cancelMove();
      if (!F.getSelected()) M.closeDetail();
      renderBar();
    });
    RPD.bus.on('field:changed', function () {
      if (M.moving >= 0 && !(F.get(M.moving) && F.get(M.moving).unit)) M.cancelMove();
      renderBar();
    });
    RPD.bus.on('units:recomputed', renderBar);
    RPD.bus.on('undo:changed', renderBar);
    RPD.bus.on('game:reset', function () { M.cancelMove(); M.closeDetail(); renderBar(); });
    RPD.bus.on('render:resize', M.measure);
    global.addEventListener && global.addEventListener('resize', M.measure);
    if (typeof global.ResizeObserver === 'function' && el.board) new global.ResizeObserver(M.measure).observe(el.board);

    if (RPD.Renderer && RPD.Renderer.addLayer && RPD.Renderer.LAYER) RPD.Renderer.addLayer(RPD.Renderer.LAYER.OVERLAY - 1, drawMove);

    M.measure();
    M.sync();
    renderBar();
  };

  RPD.MobileSheet = M;
})(typeof window !== 'undefined' ? window : globalThis);
