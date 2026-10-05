/* HudPanels.js — 리디자인에서 새로 생긴 작은 HUD 조각들.
 *
 * UIManager 가 원래 그리던 영역(조합식·시너지·보유 포켓몬·칸 정보)은 UIManager 가 계속 맡는다.
 * 여기는 새로 생긴 표시와 손맛만 맡는다. 서로 같은 요소를 건드리지 않는다.
 *
 *   상단 확률 배지 · 사거리 구성 칩 · 도감 요약 패널
 *   소환/조합 결과 카드(버튼 옆 토스트) · 버튼 눌림 반동 · 라이프 피격 흔들림
 *   정보 카드 위치 보정 · 보유 포켓몬 창 바깥 클릭 닫기
 *
 * 전부 EventBus 구독이다. 값이 바뀔 때만 DOM 을 건드린다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;
  var GM = RPD.GameManager;
  var F = RPD.FieldManager;

  var el = {};
  var toastTimer = null;

  var HudPanels = {};

  function $(id) {
    var node = document.getElementById(id);
    if (!node) console.warn('[HUD] #' + id + ' 를 찾지 못했습니다.');
    return node;
  }

  HudPanels.init = function () {
    el.odds = $('oddsBar');
    el.range = $('rangeChips');
    el.dexMiniCount = $('dexMiniCount');
    el.dexMiniBar = $('dexMiniBar');
    el.dexMiniList = $('dexMiniList');
    el.dexOpen = $('btnDexOpen');
    el.toast = $('actionToast');
    el.lifeNum = $('statLife');
    el.summonBtn = $('btnSummon');
    el.upgradeBtn = $('btnUpgrade');
    el.sellBtn = $('btnSell');
    el.slotCardEl = $('slotCard');
    el.help = $('helpOverlay');
    el.helpBtn = $('btnHelp');
    el.helpClose = $('btnHelpClose');
    el.helpTabs = $('helpTabs');
    el.nextReward = $('nextReward');
    el.rewardPop = $('rewardPop');
    el.audioBtn = $('btnAudio');
    el.audioPop = $('audioPop');
    el.musicVol = $('musicVol');
    el.sfxVol = $('sfxVol');
    el.mute = $('btnMute');
    el.ownedPopEl = $('ownedPop');
    el.moreBtn = $('btnMore');
    el.hudMore = document.getElementById('hudMore');
    el.mobileTabs = $('mobileTabs');
    el.fullscreenBtn = $('btnFullscreen');
    el.installBtn = $('btnInstall');

    if (el.dexOpen) {
      el.dexOpen.addEventListener('click', function () {
        var b = document.getElementById('btnDex');
        if (b && b.click) b.click();
      });
    }

    // 버튼 눌림 반동 — 실패해도 눌렀다는 감각은 남긴다
    [el.summonBtn, el.upgradeBtn, el.sellBtn].forEach(function (b) {
      if (!b || !b.addEventListener) return;
      b.addEventListener('pointerdown', function () { bump(b, 'is-press'); });
    });

    if (typeof document.addEventListener === 'function') {
      document.addEventListener('pointerdown', function (e) {
        if (!el.ownedPopEl || el.ownedPopEl.hidden || !e.target || !e.target.closest) return;
        if (e.target.closest('#ownedPop') || e.target.closest('.scell')) return;
        el.ownedPopEl.hidden = true;
      });
    }

    bindAudio();
    bindHotkeys();
    bindHelp();
    bindMobile();

    RPD.bus.on('game:wave', renderNextReward);
    RPD.bus.on('game:wave', function () { if (el.help && !el.help.hidden) renderBossHelp(); });
    RPD.bus.on('game:reset', renderNextReward);
    RPD.bus.on('reward:granted', function (entry) { showReward(entry); renderNextReward(); });
    renderNextReward();

    RPD.bus.on('summon:stateChanged', renderOdds);
    RPD.bus.on('game:wave', renderOdds);
    RPD.bus.on('field:changed', renderRange);
    RPD.bus.on('units:recomputed', renderRange);

    RPD.bus.on('summon:result', onSummon);
    RPD.bus.on('recipe:crafted', onCraft);
    RPD.bus.on('save:loaded', renderDex);
    RPD.bus.on('game:reset', renderDex);
    RPD.bus.on('unit:upgraded', function () { bump(el.upgradeBtn, 'is-pop'); });
    RPD.bus.on('unit:sold', onSold);
    RPD.bus.on('shard:gained', function () {
      var line = document.querySelector('.shardline');
      bump(line, 'is-bump');
    });
    RPD.bus.on('game:life', function (p) {
      if (p && p.delta < 0) {
        var box = el.lifeNum && el.lifeNum.closest ? el.lifeNum.closest('.chip') : null;
        bump(box, 'is-hit');
      }
    });
    RPD.bus.on('render:resize', function () { if (RPD.UIManager.positionSlotCard) RPD.UIManager.positionSlotCard(); });

    renderOdds();
    renderRange();
    renderDex();
  };

  /* 소리 설정 — 버튼 하나와 슬라이더 둘.
   * 브라우저가 첫 입력 전에는 소리를 막으므로, 처음 누를 때 오디오가 함께 깨어난다. */
  function bindAudio() {
    var AM = RPD.AudioManager;
    if (!AM || !el.audioBtn) return;

    syncAudioUi();

    el.audioBtn.addEventListener('click', function () {
      AM.start();
      if (el.audioPop) el.audioPop.hidden = !el.audioPop.hidden;
      syncAudioUi();
    });

    if (el.musicVol) {
      el.musicVol.addEventListener('input', function () {
        AM.start();
        AM.setMusicVolume(this.value / 100);
      });
    }
    if (el.sfxVol) {
      el.sfxVol.addEventListener('input', function () {
        AM.start();
        AM.setSfxVolume(this.value / 100);
        AM.play('click');
      });
    }
    if (el.mute) {
      el.mute.addEventListener('click', function () {
        AM.start();
        AM.setMuted(!AM.muted);
      });
    }

    RPD.bus.on('audio:changed', syncAudioUi);

    // 바깥을 누르면 닫는다
    document.addEventListener('pointerdown', function (e) {
      if (!el.audioPop || el.audioPop.hidden || !e.target || !e.target.closest) return;
      if (e.target.closest('.audio')) return;
      el.audioPop.hidden = true;
    });

    /* 버튼을 누르면 딸깍 — 개별 버튼마다 붙이지 않고 한 곳에서 위임으로 받는다 */
    document.addEventListener('pointerdown', function (e) {
      if (!e.target || !e.target.closest) return;
      var b = e.target.closest('button');
      if (!b || b.disabled) return;
      if (b.id === 'btnSummon' || b.classList.contains('rrow')) return;   // 전용 소리가 있다
      AM.play('click');
    });
  }

  /* ---------- 설명서 ---------- */
  function toggleHelp(open) {
    if (!el.help) return;
    el.help.hidden = open === undefined ? !el.help.hidden : !open;
    if (!el.help.hidden) renderBossHelp();
  }

  /* ---------- 설명서 "보스 보상" (세션 66) ----------
   * 휴대폰은 필드 위 "다음 보스 보상" 칩을 숨겼다 — 대신 여기서(PC · 휴대폰 공용) 전부 본다.
   * 표의 값은 문서에 적지 않고 RewardManager.table/beyond(보상) · EconomyManager.bossGoldPreview(처치 골드 — 모드 · 시너지 · 도감 보정까지)로 만든다. */
  function renderBossHelp() {
    var box = typeof document !== 'undefined' && document.getElementById ? document.getElementById('helpBoss') : null;
    var RM = RPD.RewardManager, EM = RPD.EconomyManager;
    if (!box || !RM) return '';
    var mode = GM.mode || {};
    var every = mode.bossEvery || 10;
    var rewardEvery = every < 5 ? 10 : every;               // RewardManager.bossIndex 와 같은 규칙(보스 러시는 10라운드마다)
    var final = mode.finalWave || 0;
    var w = Math.max(1, GM.wave || 1);
    var nextBoss = Math.ceil(w / every) * every;
    var nextReward = RM.next(w).wave;
    var gold = function (wave) { return EM ? RPD.Utils.formatNumber(EM.bossGoldPreview(wave)) + 'G' : '—'; };
    var keys = Object.keys(RM.table).map(Number).sort(function (a, b) { return a - b; });
    var rows = keys.map(function (n) {
      var wave = n * rewardEvery;
      var off = final && wave > final;
      var tag = off ? ' <small>이 모드엔 없음</small>' : (final && wave === final ? ' <small>마지막 보스</small>' : '');
      return '<tr class="bosshelp__row' + (off ? ' is-off' : '') + (wave === nextReward ? ' is-next' : '') + '" data-boss-n="' + n + '">' +
        '<td>' + n + '번째 · <b>' + wave + 'R</b>' + tag + '</td>' +
        '<td>' + gold(wave) + '</td><td>' + RM.describe(RM.table[n]) + '</td></tr>';
    });
    var after = keys[keys.length - 1] + 1;
    rows.push('<tr class="bosshelp__row' + (final && after * rewardEvery > final ? ' is-off' : '') + '" data-boss-n="beyond">' +
      '<td>' + after + '번째부터 · <b>' + (after * rewardEvery) + 'R~</b></td>' +
      '<td>' + gold(after * rewardEvery) + '~</td><td>' + RM.describe(RM.beyond) + ' (되풀이)</td></tr>');
    box.innerHTML =
      '<h3>보스 보상 — ' + (mode.label || '') + ' 모드</h3>' +
      '<p class="bosshelp__when">보스: <b>' + (every === 1 ? '매 라운드' : every + '라운드마다') + '</b>' +
        (rewardEvery !== every ? ' · 보상은 <b>' + rewardEvery + '라운드마다</b>' : '') +
        (final ? ' · 마지막 보스 <b>' + final + 'R</b>' : '') + '</p>' +
      '<p class="bosshelp__next">다음 보스: <b>' + nextBoss + '라운드</b>' + (nextReward !== nextBoss ? ' · 다음 보상 보스: <b>' + nextReward + '라운드</b>' : '') + '</p>' +
      '<table class="help__keys bosshelp"><thead><tr><th>보스</th><th>처치 골드</th><th>보상</th></tr></thead><tbody>' + rows.join('') + '</tbody></table>' +
      '<p class="bosshelp__note">처치 골드는 지금 모드 · 시너지 · 도감 보너스를 반영한 값입니다. 유닛은 그 등급에서 조합에 필요한 쪽이 잘 나오고, 자리가 없으면 조각으로 바뀝니다.</p>';
    return box.innerHTML;
  }
  HudPanels.renderBossHelp = renderBossHelp;
  HudPanels.toggleHelp = toggleHelp;

  function showHelpPage(page) {
    if (!el.help || !el.help.querySelectorAll) return;
    var pages = el.help.querySelectorAll('.help__page');
    for (var i = 0; i < pages.length; i++) pages[i].hidden = pages[i].dataset.page !== page;
    var tabs = el.helpTabs ? el.helpTabs.querySelectorAll('.rf') : [];
    for (var j = 0; j < tabs.length; j++) tabs[j].classList.toggle('is-on', tabs[j].dataset.help === page);
  }

  function bindHelp() {
    if (el.helpBtn) el.helpBtn.addEventListener('click', function () { toggleHelp(); });
    if (el.helpClose) el.helpClose.addEventListener('click', function () { toggleHelp(false); });
    if (el.helpTabs) {
      el.helpTabs.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('[data-help]');
        if (b) showHelpPage(b.dataset.help);
      });
    }
    if (el.help) {
      // 카드 바깥(어두운 배경)을 누르면 닫는다
      el.help.addEventListener('click', function (e) { if (e.target === el.help) toggleHelp(false); });
    }
  }

  /* ---------- 단축키 ----------
   * 버튼을 대신 눌러 준다(버튼이 잠겨 있으면 아무 일도 없다) — 규칙이 버튼과 똑같이 유지된다.
   * 입력칸·슬라이더에 초점이 있을 때는 가로채지 않는다. */
  var HOTKEYS = {
    ' ': 'btnSummon', 'q': 'btnSummon',
    'w': 'btnUpgrade', 's': 'btnStore', 'c': 'btnCraft', 'p': 'btnPause',
    '1': 'speed1', '2': 'speed2', '3': 'speed3'
  };

  function clickIf(node) {
    if (!node || node.disabled || !node.click) return false;
    node.click();
    return true;
  }

  /* ---------- 휴대폰 탭(서랍) · ☰ 메뉴 (모바일 ① · 세션 51) ----------
   * 1100px 미만에서만 보이는 버튼들이다. 서랍은 body[data-mtab] 하나로 켜고 끈다 — 보이는 패널은 CSS 가 고른다.
   * 같은 탭을 다시 누르면 닫힌다. [상점]은 골드 상점 창(G)을 여닫는다. */
  HudPanels.setDrawer = function (tab) {
    if (typeof document === 'undefined' || !document.body) return;
    var cur = document.body.getAttribute('data-mtab') || '';
    var next = tab === cur ? '' : (tab || '');
    document.body.setAttribute('data-mtab', next);
    var tabs = document.querySelectorAll ? document.querySelectorAll('.mtab[data-mtab]') : [];
    for (var i = 0; i < tabs.length; i++) {
      var t = tabs[i];
      if (t.getAttribute('data-mtab') !== 'shop') t.setAttribute('aria-pressed', String(t.getAttribute('data-mtab') === next));
    }
    return next;
  };

  HudPanels.toggleMore = function (open) {
    var hud = el.hudMore && el.hudMore.parentNode;
    var btn = el.moreBtn;
    if (!hud || !hud.classList) return false;
    var on = open == null ? !hud.classList.contains('is-more-open') : !!open;
    hud.classList.toggle('is-more-open', on);
    if (btn && btn.setAttribute) btn.setAttribute('aria-expanded', String(on));
    var tb = typeof document !== 'undefined' && document.getElementById ? document.getElementById('tbMore') : null;   // 휴대폰 툴바 [더보기]
    if (tb && tb.setAttribute) tb.setAttribute('aria-expanded', String(on));
    return on;
  };

  function bindMobile() {
    if (typeof document === 'undefined' || !document.addEventListener) return;
    if (el.mobileTabs && el.mobileTabs.addEventListener) {
      el.mobileTabs.addEventListener('click', function (e) {
        var b = e.target && e.target.closest ? e.target.closest('[data-mtab]') : null;
        // 탭 줄 밖(= <body data-mtab="…">)까지 올라간 것은 탭이 아니다 — [조합] 을 길게 눌러 연 시트를 손 뗄 때 click 이 다시 닫던 버그(세션 68)
        if (b && el.mobileTabs.contains && !el.mobileTabs.contains(b)) b = null;
        if (!b || (b.hasAttribute && b.hasAttribute('data-tb'))) return;   // 툴바 버튼(세션 66)은 MobileToolbar 가 받는다
        var tab = b.getAttribute('data-mtab');
        if (tab === 'shop') { if (RPD.GoldShopUI) RPD.GoldShopUI.toggle(); return; }
        HudPanels.setDrawer(tab);
      });
    }
    if (el.moreBtn && el.moreBtn.addEventListener) el.moreBtn.addEventListener('click', function () { HudPanels.toggleMore(); });
    // 메뉴 안 버튼을 누르면 닫는다(소리 설정은 작은 창이 따로 열리니 둔다 · 진동 · 효과는 켬/끔이 바로 보이게 둔다 — 세션 68) · 메뉴 밖을 누르면 닫는다
    document.addEventListener('click', function (e) {
      var hud = document.querySelector('.hud');
      if (!hud || !hud.classList || !hud.classList.contains('is-more-open') || !e.target || !e.target.closest) return;
      if (e.target.closest('#btnMore') || e.target.closest('#tbMore') || e.target.closest('.audio') ||
          e.target.closest('#btnHaptics') || e.target.closest('#btnFx') || e.target.closest('#btnWake')) return;
      if (e.target.closest('#hudMore .iconbtn') || !e.target.closest('#hudMore')) HudPanels.toggleMore(false);
    });
    bindLongPressTips();
    bindAppButtons();

    // 조합 가능 개수를 [조합식] 탭에도 — 서랍이 닫혀 있어도 보이게
    RPD.bus.on('recipe:changed', function () {
      var badge = $('mtabCraft');
      if (!badge || !RPD.RecipeManager) return;
      var n = (RPD.RecipeManager.view || []).filter(function (v) { return v.ready; }).length;
      badge.hidden = n === 0;
      badge.textContent = n;
    });
  }

  /* ---------- 홈 화면 앱 버튼 (모바일 ③ · 세션 53) — ☰ 메뉴 [전체 화면] · [앱 설치] ----------
   * 전체 화면: 브라우저가 못 하면(아이폰 사파리) 숨기고, 전체 화면 앱으로 실행 중이면 필요 없으니 숨긴다.
   * 앱 설치: 설치한 앱으로 실행 중이면 숨긴다. 안드로이드 크롬이 설치 창을 줄 수 있으면 띄우고, 아니면 방법을 말풍선으로. */
  function refreshAppButtons() {
    var P = RPD.Pwa;
    if (!P) return;
    var app = P.isApp();
    if (el.fullscreenBtn) {
      el.fullscreenBtn.hidden = app || !P.canFullscreen();
      var on = P.isFullscreen();
      el.fullscreenBtn.title = on ? '전체 화면 끝내기' : '전체 화면';
      if (el.fullscreenBtn.setAttribute) el.fullscreenBtn.setAttribute('aria-pressed', String(on));
    }
    if (el.installBtn) {
      el.installBtn.hidden = app;
      var note = P.status === 'ready' ? ' · 오프라인 준비 끝' : P.status === 'saving' ? ' · 오프라인 준비 중 ' + P.saved + '/' + P.total : '';
      el.installBtn.title = '홈 화면에 앱으로 설치' + note;
    }
  }
  function bindAppButtons() {
    if (el.fullscreenBtn) {
      el.fullscreenBtn.addEventListener('click', function () {
        if (RPD.Pwa) RPD.Pwa.toggleFullscreen().then(refreshAppButtons);
      });
    }
    if (el.installBtn) {
      // 설치 창(크롬) 또는 안내 시트(아이폰 · 창이 없을 때) — 세션 71 에 말풍선에서 시트로(AppUI)
      el.installBtn.addEventListener('click', function () { if (RPD.AppUI) RPD.AppUI.install(); });
    }
    document.addEventListener('fullscreenchange', refreshAppButtons);
    document.addEventListener('webkitfullscreenchange', refreshAppButtons);
    RPD.bus.on('pwa:status', refreshAppButtons);
    refreshAppButtons();
  }

  /* ---------- 길게 누르기 → 설명 말풍선 (모바일 ② · 세션 52) ----------
   * PC 는 마우스를 올리면 title 설명이 뜨지만 손가락에는 "올리기"가 없다. 0.5초 길게 누르면 그 설명을 말풍선으로 띄우고,
   * 그 손을 뗄 때 버튼이 눌리지 않게 한 번 막는다. 움직이면(스크롤) 취소. 필드 캔버스 · 보유 칸(길게 눌러 집기)은 제외. */
  var TIP_HOLD_MS = 500;
  var tip = { timer: 0, x: 0, y: 0, node: null, eatClick: false, bubble: null, hideAt: 0 };
  HudPanels.showTip = function (text, rect) {
    if (!text || typeof document === 'undefined' || !document.createElement) return null;
    var b = tip.bubble;
    if (!b) { b = document.createElement('div'); b.className = 'tipbubble'; b.setAttribute('role', 'tooltip'); document.body.appendChild(b); tip.bubble = b; }
    b.textContent = text;
    b.hidden = false;
    if (rect && b.style) {
      var vw = global.innerWidth || 800;
      var half = (b.offsetWidth || 0) / 2 + 8;   // 말풍선이 화면 밖으로 삐져나가지 않게(가운데 기준)
      b.style.left = Math.max(half, Math.min(vw - half, rect.left + rect.width / 2)) + 'px';
      // 위에 자리가 없으면(화면 맨 위 HUD · ☰ 메뉴) 아래로
      var below = rect.top - 8 - (b.offsetHeight || 40) < 4;
      b.style.top = (below ? rect.top + rect.height + 8 : Math.max(8, rect.top - 8)) + 'px';
      b.style.transform = below ? 'translate(-50%, 0)' : '';
    }
    clearTimeout(tip.hideAt);
    tip.hideAt = setTimeout(function () { if (tip.bubble) tip.bubble.hidden = true; }, 2600);
    return b;
  };
  function bindLongPressTips() {
    document.addEventListener('pointerdown', function (e) {
      if (tip.bubble) tip.bubble.hidden = true;
      if (e.pointerType !== 'touch' || !e.target || !e.target.closest) return;
      var n = e.target.closest('[title]');
      if (!n || n.id === 'gameCanvas' || e.target.closest('.scell')) return;
      tip.node = n; tip.x = e.clientX; tip.y = e.clientY;
      clearTimeout(tip.timer);
      tip.timer = setTimeout(function () {
        if (!tip.node) return;
        HudPanels.showTip(tip.node.getAttribute('title'), tip.node.getBoundingClientRect ? tip.node.getBoundingClientRect() : null);
        tip.eatClick = true;
        tip.node = null;
      }, TIP_HOLD_MS);
    }, true);
    document.addEventListener('pointermove', function (e) {
      if (tip.node && Math.abs(e.clientX - tip.x) + Math.abs(e.clientY - tip.y) > 10) { clearTimeout(tip.timer); tip.node = null; }
    }, true);
    ['pointerup', 'pointercancel'].forEach(function (ev) {
      document.addEventListener(ev, function () { clearTimeout(tip.timer); tip.node = null; }, true);
    });
    // 말풍선을 띄운 길게 누르기 끝의 click 은 먹는다(설명을 보려다 소환·방출이 눌리면 안 된다)
    document.addEventListener('click', function (e) {
      if (!tip.eatClick) return;
      tip.eatClick = false;
      if (e.stopPropagation) e.stopPropagation();
      if (e.preventDefault) e.preventDefault();
    }, true);
    // 길게 누르기에 브라우저 기본 메뉴(복사 · 이미지 저장)가 뜨지 않게 — 입력칸은 둔다.
    // 필드 캔버스 · 포켓몬 그림은 마우스 오른쪽 단추로도 막는다(세션 68 — 그림 저장 메뉴가 끌기를 끊지 않게)
    document.addEventListener('contextmenu', function (e) {
      var tg = e.target, t = tg && tg.tagName;
      if (t === 'INPUT' || t === 'TEXTAREA') return;
      var art = t === 'CANVAS' || t === 'IMG' || !!(tg && tg.closest && tg.closest('.spr, .infobar'));
      if (art || e.pointerType === 'touch' || (global.matchMedia && global.matchMedia('(pointer: coarse)').matches)) e.preventDefault();
    });
  }

  function bindHotkeys() {
    if (typeof document === 'undefined' || !document.addEventListener) return;
    document.addEventListener('keydown', function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      var key = (e.key || '').toLowerCase();
      var handled = false;

      if (key === 'h' || key === '?') {
        toggleHelp();
        handled = true;
      } else if (key === 'enter') {
        if (RPD.SpellUI) RPD.SpellUI.open();
        handled = true;
      } else if (key === 'r') {
        if (RPD.RecipeBook) RPD.RecipeBook.toggle();
        handled = true;
      } else if (key === 'g') {
        if (RPD.GoldShopUI) RPD.GoldShopUI.toggle();
        handled = true;
      } else if (key === 'e') {
        if (RPD.EliteUI) RPD.EliteUI.toggle();
        handled = true;
      } else if (key === 'escape') {
        RPD.FieldManager.select(-1);
        HudPanels.toggleMore(false);
        if (RPD.SpellUI) RPD.SpellUI.close();
        ['ownedPop', 'recipePop', 'audioPop', 'helpOverlay', 'bookOverlay', 'goldShopOverlay', 'eliteOverlay', 'bulkOverlay', 'legendOverlay'].forEach(function (id) {
          var n = document.getElementById(id);
          if (n) n.hidden = true;
        });
        handled = true;
      } else if (key === 't') {
        // 고른 포켓몬의 공격 대상을 다음 것으로(출구 앞 → 보스 → 센 적 → 약한 적 → 갓 나온)
        var sel = RPD.FieldManager.getSelected();
        handled = !!(sel && sel.unit && RPD.UnitManager.cycleTargeting(sel.unit));
      } else if (key === 'f') {
        handled = clickIf(document.querySelector('#ownedPop:not([hidden]) [data-act="deploy"]'));
      } else if (key === 'l') {
        // 잠금 — 고른 칸의 포켓몬을 재료 · 방출에서 빼거나 되돌린다
        handled = clickIf(document.getElementById('btnLock'));
      } else if (key === 'x' || key === 'delete') {
        var slot = RPD.FieldManager.getSelected();
        handled = slot && slot.unit
          ? clickIf(document.getElementById('btnSell'))
          : clickIf(document.querySelector('#ownedPop:not([hidden]) [data-act="sell"]'));
      } else if (HOTKEYS[key]) {
        var id = HOTKEYS[key];
        if (id.indexOf('speed') === 0) {
          handled = clickIf(document.querySelector('.speed__btn[data-speed="' + id.slice(5) + '"]'));
        } else {
          var btn = document.getElementById(id);
          handled = clickIf(btn);
          if (btn && id !== 'btnPause') bump(btn, 'is-press');
        }
      }
      // 스페이스가 페이지를 내리거나 버튼을 두 번 누르지 않게
      if (handled || key === ' ') { if (e.preventDefault) e.preventDefault(); }
    });
  }

  function syncAudioUi() {
    var AM = RPD.AudioManager;
    if (!AM) return;
    if (el.musicVol) el.musicVol.value = Math.round(AM.musicVolume * 100);
    if (el.sfxVol) el.sfxVol.value = Math.round(AM.sfxVolume * 100);
    if (el.mute) el.mute.textContent = AM.muted ? '음소거 해제' : '음소거';
    if (el.audioBtn) el.audioBtn.classList.toggle('is-muted', AM.muted);
  }

  /* ---------- 보스 보상 ---------- */

  /* 다음 보스 보상 예고 — 목표가 보여야 보스 라운드를 버틸 이유가 생긴다 */
  function renderNextReward() {
    var RM = RPD.RewardManager;
    if (!RM || !el.nextReward) return;
    var mode = RPD.GameManager.mode || {};
    var n = RM.next(RPD.GameManager.wave || 1);
    var last = mode.finalWave && n.wave > mode.finalWave;
    if (!n.rewards || last) { el.nextReward.hidden = true; return; }
    el.nextReward.hidden = false;
    el.nextReward.innerHTML = '<span class="nextreward__at">' + n.wave + 'R 보스 보상</span>' +
      n.rewards.map(rewardChip).join('');
  }

  function rewardChip(r) {
    if (r.kind === 'gold') {
      return '<span class="rchip2 rchip2--gold"><b>◎</b>' + r.amount + 'G</span>';
    }
    if (r.kind === 'ticket') {
      return '<span class="rchip2 rchip2--ticket"><i class="ball"></i>소환권 ×' + r.count + '</span>';
    }
    if (r.kind === 'shard') {
      return '<span class="rchip2"><b>◆</b>조각 ' + r.count + '</span>';
    }
    // 40R 보스 보상 — 초월의 조각(RewardManager.describe 는 이미 알았다. 여기만 빠져 31~40R 칩이 오류로 안 바뀌고 40R 보상 카드가 안 떴다 · 세션 72)
    if (r.kind === 'item') {
      return '<span class="rchip2 rchip2--item"><b>✦</b>초월의 조각 ×' + (r.count || 1) + '</span>';
    }
    var t = RPD.Tiers[r.tier];
    var art = r.unit ? RPD.UI.sprite(r.unit.def, 'spr--reward') : '';
    return '<span class="rchip2" style="--tier:' + t.color + '">' + art +
      (r.unit ? r.unit.name : t.label + ' 유닛 ×' + (r.count || 1)) + '</span>';
  }

  var rewardTimer = null;
  function showReward(entry) {
    // 휴대폰은 필드를 덮는 카드 대신 툴바 위 알림 줄로(모바일 ② · 세션 66)
    if (RPD.MobileToolbar && RPD.MobileToolbar.rewardToast(entry)) return;
    if (!el.rewardPop || !entry || !entry.items.length) return;
    el.rewardPop.innerHTML =
      '<p class="rewardpop__kicker">' + entry.wave + '라운드 보스 처치</p>' +
      '<p class="rewardpop__title">보상 획득!</p>' +
      '<div class="rewardpop__items">' + entry.items.map(rewardChip).join('') + '</div>';
    el.rewardPop.hidden = false;
    bump(el.rewardPop, 'is-on');
    if (rewardTimer) clearTimeout(rewardTimer);
    rewardTimer = setTimeout(function () { if (el.rewardPop) el.rewardPop.hidden = true; }, 3200);
  }

  function bump(node, cls) {
    if (!node || !node.classList) return;
    node.classList.remove(cls);
    void node.offsetWidth;
    node.classList.add(cls);
  }

  /* ---------- 상단 확률 ---------- */

  function renderOdds() {
    if (!el.odds) return;
    var st = RPD.SummonManager.state();
    var unlocked = {};
    (st.unlocked || []).forEach(function (t) { unlocked[t] = true; });
    el.odds.innerHTML = RPD.TIER_ORDER.map(function (id) {
      var t = RPD.Tiers[id];
      var pct = st.odds[id] || 0;
      var txt = pct >= 10 || pct === 0 ? Math.round(pct) : pct.toFixed(1);
      return '<span class="odd' + (pct > 0 ? '' : ' is-off') + '" style="--tier:' + t.color + '">' +
        '<span class="odd__tag">' + t.label + '</span><b class="odd__pct">' + txt + '%</b></span>';
    }).join('');
  }

  /* ---------- 사거리 구성 ---------- */

  function renderRange() {
    if (!el.range) return;
    var R = RPD.Range;
    var n = { s: 0, m: 0, l: 0 };
    F.getBattleUnits().forEach(function (u) {   // 사거리 구성 — 싸우는 개체만(응원 칸 제외)
      if (u.range <= R.SHORT) n.s += 1;
      else if (u.range <= R.MID) n.m += 1;
      else n.l += 1;
    });
    el.range.innerHTML =
      '<span class="rchip rchip--s" title="사거리 ' + R.SHORT + ' 이하"><i></i>근접<b>' + n.s + '</b></span>' +
      '<span class="rchip rchip--m" title="사거리 ' + R.MID + ' 이하"><i></i>중거리<b>' + n.m + '</b></span>' +
      '<span class="rchip rchip--l" title="사거리 ' + R.LONG + ' 이상"><i></i>장거리<b>' + n.l + '</b></span>';
  }

  /* ---------- 도감 요약 ---------- */

  var lastDex = -1;
  function renderDex() {
    var SV = RPD.SaveManager;
    if (!SV || !el.dexMiniCount) return;
    var have = SV.dexCount(), total = SV.dexTotal();
    if (have === lastDex && el.dexMiniList && el.dexMiniList.innerHTML) return;
    lastDex = have;
    el.dexMiniCount.innerHTML = '<b>' + have + '</b>/' + total;
    if (el.dexMiniBar && el.dexMiniBar.style) {
      el.dexMiniBar.style.width = (total ? have / total * 100 : 0).toFixed(1) + '%';
    }
    if (!el.dexMiniList || !RPD.DexBonus) return;
    var next = RPD.DexBonus.nextFor(have);
    var rows = RPD.DexBonus.summary(have).map(function (b) {   // 종류별 합계 한 줄씩(세션 97)
      return '<li class="is-on"><span>' + b.name + '</span><b>' + b.value + '</b></li>';
    });
    if (next) {
      rows.push('<li class="is-next"><span>' + next.at + '종 · ' + next.label + '</span><b>' + (next.at - have) + '종 남음</b></li>');
    }
    if (!rows.length) rows.push('<li class="is-next"><span>아직 버프가 없습니다</span></li>');
    el.dexMiniList.innerHTML = rows.join('');
  }

  /* ---------- 결과 카드 ---------- */

  function showToast(def, tierId, kicker) {
    if (!el.toast || !def) return;
    var t = RPD.Tiers[tierId] || RPD.Tiers.T1;
    el.toast.innerHTML = RPD.UI.sprite(def, 'spr--toast') +
      '<span class="toast__txt"><span class="toast__kicker">' + kicker + '</span>' +
      '<span class="toast__name">' + def.name + '</span></span>';
    if (el.toast.style && el.toast.style.setProperty) el.toast.style.setProperty('--tier', t.color);
    bump(el.toast, 'is-on');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { if (el.toast) el.toast.classList.remove('is-on'); }, 1400);
  }

  function onSummon(r) {
    renderDex();
    if (!r || !r.ok) return;
    showToast(r.unit.def, r.tier, r.toStorage ? RPD.Tiers[r.tier].label + ' · 창고로' : RPD.Tiers[r.tier].label);
  }

  function onCraft(p) {
    renderDex();
    if (!p || !p.unit) return;
    showToast(p.unit.def, p.tier, p.firstTime ? '새 조합 발견!' : '조합 완성');
  }

  function onSold() {
    bump(el.sellBtn, 'is-pop');
    bump(el.slotCardEl, 'is-sold');
  }

  RPD.HudPanels = HudPanels;
})(typeof window !== 'undefined' ? window : globalThis);
