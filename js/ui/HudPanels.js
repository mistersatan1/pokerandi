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
  }
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
    return on;
  };

  function bindMobile() {
    if (typeof document === 'undefined' || !document.addEventListener) return;
    if (el.mobileTabs && el.mobileTabs.addEventListener) {
      el.mobileTabs.addEventListener('click', function (e) {
        var b = e.target && e.target.closest ? e.target.closest('[data-mtab]') : null;
        if (!b) return;
        var tab = b.getAttribute('data-mtab');
        if (tab === 'shop') { if (RPD.GoldShopUI) RPD.GoldShopUI.toggle(); return; }
        HudPanels.setDrawer(tab);
      });
    }
    if (el.moreBtn && el.moreBtn.addEventListener) el.moreBtn.addEventListener('click', function () { HudPanels.toggleMore(); });
    // 메뉴 안 버튼을 누르면 닫는다(소리 설정은 작은 창이 따로 열리니 둔다) · 메뉴 밖을 누르면 닫는다
    document.addEventListener('click', function (e) {
      var hud = document.querySelector('.hud');
      if (!hud || !hud.classList || !hud.classList.contains('is-more-open') || !e.target || !e.target.closest) return;
      if (e.target.closest('#btnMore') || e.target.closest('.audio')) return;
      if (e.target.closest('#hudMore .iconbtn') || !e.target.closest('#hudMore')) HudPanels.toggleMore(false);
    });
    bindLongPressTips();

    // 조합 가능 개수를 [조합식] 탭에도 — 서랍이 닫혀 있어도 보이게
    RPD.bus.on('recipe:changed', function () {
      var badge = $('mtabCraft');
      if (!badge || !RPD.RecipeManager) return;
      var n = (RPD.RecipeManager.view || []).filter(function (v) { return v.ready; }).length;
      badge.hidden = n === 0;
      badge.textContent = n;
    });
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
      b.style.left = Math.max(8, Math.min(vw - 8, rect.left + rect.width / 2)) + 'px';
      b.style.top = Math.max(8, rect.top - 8) + 'px';
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
    // 길게 누르기에 브라우저 기본 메뉴(복사 · 이미지 저장)가 뜨지 않게 — 입력칸은 둔다
    document.addEventListener('contextmenu', function (e) {
      var t = e.target && e.target.tagName;
      if (t === 'INPUT' || t === 'TEXTAREA') return;
      if (e.pointerType === 'touch' || (global.matchMedia && global.matchMedia('(pointer: coarse)').matches)) e.preventDefault();
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
        ['ownedPop', 'recipePop', 'audioPop', 'helpOverlay', 'bookOverlay', 'goldShopOverlay', 'eliteOverlay'].forEach(function (id) {
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
    var t = RPD.Tiers[r.tier];
    var art = r.unit ? RPD.UI.sprite(r.unit.def, 'spr--reward') : '';
    return '<span class="rchip2" style="--tier:' + t.color + '">' + art +
      (r.unit ? r.unit.name : t.label + ' 유닛 ×' + (r.count || 1)) + '</span>';
  }

  var rewardTimer = null;
  function showReward(entry) {
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
    F.getUnits().forEach(function (u) {
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
    var on = RPD.DexBonus.activeFor(have);
    var next = RPD.DexBonus.nextFor(have);
    var rows = on.map(function (b) {
      var m = b.label.match(/^(.*?)\s*(\+[\d.]+%?p?|\+\d+)$/);
      return '<li class="is-on"><span>' + (m ? m[1] : b.label) + '</span><b>' + (m ? m[2] : '') + '</b></li>';
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
