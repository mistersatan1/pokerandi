/* UIManager.js — DOM 을 아는 유일한 곳.
 * 시스템들은 UI 를 모르고, UI 는 EventBus 구독으로만 상태를 받는다.
 * (폴링 없음 → 값이 바뀌는 순간에만 DOM 을 건드린다)
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;
  var GM = RPD.GameManager;
  var F = RPD.FieldManager;
  var S = RPD.GameState;
  var U = RPD.Utils;

  var el = {};
  var bannerTimer = null;
  var devHitMode = false;

  var UIManager = {};

  UIManager.init = function () {
    cacheElements();
    bindButtons();
    bindCanvas();
    bindEvents();
    this.refreshAll();
  };

  function $(id) {
    var node = document.getElementById(id);
    if (!node) console.warn('[UI] #' + id + ' 를 찾지 못했습니다.');
    return node;
  }

  function cacheElements() {
    el.wave = $('statWave');
    el.gold = $('statGold');
    el.life = $('statLife');
    el.lifeBox = el.life ? el.life.closest('.stat') : null;
    el.enemies = $('statEnemies');
    el.time = $('statTime');

    el.speedGroup = $('speedGroup');
    el.pause = $('btnPause');

    el.canvas = $('gameCanvas');
    el.banner = $('waveBanner');
    el.hint = $('boardHint');
    el.waveStatus = $('waveStatus');
    el.wavePhase = $('wavePhase');
    el.waveTimer = $('waveTimer');

    el.slotBody = $('slotBody');
    el.slotCard = $('slotCard');
    el.slotClose = $('btnSlotClose');
    el.ownedPop = $('ownedPop');
    el.ownedCount = $('ownedCount');
    el.synergyCount = $('synergyCount');

    el.start = $('btnStart');
    el.restart = $('btnRestart');
    el.summonCost = $('summonCost');

    el.sell = $('btnSell');
    el.store = $('btnStore');
    el.storeHint = $('storeHint');
    el.tierFilter = $('tierFilter');
    el.recipePop = $('recipePop');
    el.ownedSort = $('ownedSort');
    el.sellValue = $('sellValue');
    el.upgrade = $('btnUpgrade');
    el.upgradeCost = $('upgradeCost');
    el.summon = $('btnSummon');

    el.craft = $('btnCraft');
    el.craftHint = $('craftHint');
    el.craftBadge = $('craftBadge');
    el.recipeList = $('recipeList');
    el.recipeFilter = $('recipeFilter');
    el.recipeCount = $('recipeCount');
    el.shardCount = $('shardCount');
    el.storageList = $('storageList');
    el.storageBadge = $('storageBadge');
    el.expandStorage = $('btnExpandStorage');
    el.nextUnlock = $('statNextUnlock');
    el.synergyBody = $('synergyBody');
    el.shield = $('statShield');

    el.dex = $('dexOverlay');
    el.dexBtn = $('btnDex');
    el.dexClose = $('btnDexClose');
    el.dexGrid = $('dexGrid');
    el.dexCount = $('dexCount');
    el.dexBonus = $('dexBonus');

    el.reveal = $('summonReveal');
    el.revealRarity = $('revealRarity');
    el.revealArt = $('revealArt');
    el.revealName = $('revealName');
    el.revealRole = $('revealRole');

    el.modeOverlay = $('modeOverlay');
    el.modeList = $('modeList');
    el.modeCancel = $('btnModeCancel');
    el.startMode = $('startMode');
    el.resultBest = $('resultBest');

    el.result = $('resultOverlay');
    el.resultKicker = $('resultKicker');
    el.resultTitle = $('resultTitle');
    el.resultStats = $('resultStats');
    el.resultNote = $('resultNote');
    el.resultTrainer = $('resultTrainer');
    el.trainerInfo = $('trainerInfo');
    el.resultRestart = $('btnResultRestart');
  }

  function bindButtons() {
    if (el.speedGroup) {
      el.speedGroup.addEventListener('click', function (e) {
        var btn = e.target.closest('.speed__btn');
        if (!btn) return;
        RPD.Loop.setSpeed(parseFloat(btn.dataset.speed));
      });
    }

    if (el.pause) {
      el.pause.addEventListener('click', function () {
        if (GM.state === S.GAMEOVER || GM.state === S.VICTORY) return;
        RPD.Loop.togglePause();
        GM.setState(RPD.Loop.paused ? S.PAUSED : S.RUNNING);
      });
    }

    if (el.start) el.start.addEventListener('click', showModePick);

    if (el.modeList) {
      el.modeList.addEventListener('click', function (e) {
        var diff = e.target.closest('.diffbtn');
        if (diff) {
          hideModePick();
          RPD.Game.startRun('NORMAL', diff.dataset.diff);
          return;
        }
        var card = e.target.closest('.modecard');
        if (!card || !card.dataset.mode) return;   // 일반 카드는 난이도 버튼으로만 시작
        hideModePick();
        RPD.Game.startRun(card.dataset.mode);
      });
    }

    if (el.modeCancel) el.modeCancel.addEventListener('click', hideModePick);
    if (el.restart) el.restart.addEventListener('click', function () { RPD.Game.restart(); });
    if (el.resultRestart) el.resultRestart.addEventListener('click', function () { RPD.Game.restart(); });
    if (el.resultModes) el.resultModes.addEventListener('click', function () {
      if (el.result) el.result.hidden = true;
      showModePick();
    });


    if (el.summon) {
      el.summon.addEventListener('click', function () {
        var r = RPD.SummonManager.summon();
        if (!r.ok) shakeSummon(r.reason);
      });
    }

    if (el.upgrade) {
      el.upgrade.addEventListener('click', function () {
        var slot = F.getSelected();
        if (!slot) return;
        var r = RPD.EconomyManager.upgrade(slot.index);
        if (!r.ok && r.reason === 'NO_GOLD') {
          RPD.FxRenderer.text(RPD.VIEW.width / 2, 190, '골드가 부족합니다', '#ff8a7a',
            { size: 15, life: 1.1, jitter: false });
        }
        renderSlotPanel({ slot: slot });
        refreshActionButtons();
      });
    }

    if (el.store) {
      el.store.addEventListener('click', function () {
        var slot = F.getSelected();
        if (!slot || !slot.unit) return;
        var r = RPD.StorageManager.store(slot.index);
        if (!r || !r.ok) {
          RPD.FxRenderer.text(RPD.VIEW.width / 2, 190, '창고가 가득 찼습니다', '#ff8a7a',
            { size: 15, life: 1.1, jitter: false });
        }
      });
    }

    if (el.sell) {
      el.sell.addEventListener('click', function () {
        var slot = F.getSelected();
        if (!slot || !slot.unit) return;
        var refund = RPD.EconomyManager.sell(slot.index);
        if (refund > 0) {
          RPD.FxRenderer.text(slot.x, slot.y - 20, '+' + refund, '#f0b429',
            { size: 15, life: 0.9, jitter: false });
        }
      });
    }

    if (el.craft) {
      el.craft.addEventListener('click', function () {
        var r = RPD.RecipeManager.craftBest();
        if (!r.ok) {
          RPD.FxRenderer.text(RPD.VIEW.width / 2, 190, '완성된 조합식이 없습니다', '#ff8a7a',
            { size: 15, life: 1.1, jitter: false });
        }
      });
    }

    if (el.recipeList) {
      el.recipeList.addEventListener('click', function (e) {
        var shop = e.target.closest('.shoprow');
        if (shop && shop.dataset.buy) { buyShard(shop.dataset.buy); return; }
        /* 그림(과 이름)을 눌렀을 때만 조합식 창. 줄의 빈 곳을 누르면 예전처럼 조합한다 —
         * 결과 칸 전체를 받았더니 줄 가운데를 눌러도 조합이 안 되고 창만 떴다. */
        var pic = e.target.closest('.rmat, .rres .spr, .rres__name');
        var poke = pic && (pic.dataset.def ? pic : pic.closest('.rres'));
        if (poke && poke.dataset.def) { openRecipePop(poke.dataset.def, []); return; }
        var row = e.target.closest('.rrow');
        if (row && row.dataset.spell) {
          var sp = RPD.SpellData.get(row.dataset.spell);
          // 이미 발견한 주문이라 여기 떠 있다 — 문구를 다시 안 쳐도 바로 조합한다(일반 조합식과 같은 손맛)
          if (row.classList.contains('is-ready')) { row.classList.add('is-crafting'); RPD.SpellManager.cast(sp.phrase); }
          else { row.classList.remove('is-nope'); void row.offsetWidth; row.classList.add('is-nope'); }
          return;
        }
        if (!row || !row.dataset.result) return;
        if (row.classList.contains('is-ready')) {
          row.classList.add('is-crafting');
          RPD.RecipeManager.craft(row.dataset.key || row.dataset.result);
        } else {
          row.classList.remove('is-nope');
          void row.offsetWidth;
          row.classList.add('is-nope');
        }
      });
    }

    if (el.ownedSort) {
      el.ownedSort.addEventListener('click', function (e) {
        var b = e.target.closest('.tchip');
        if (!b) return;
        ownedSort = b.dataset.sort;
        var all = el.ownedSort.querySelectorAll('.tchip');
        for (var i = 0; i < all.length; i++) all[i].classList.toggle('is-on', all[i] === b);
        ownedSig = '';
        renderStorage();
      });
    }

    if (el.recipePop) {
      el.recipePop.addEventListener('click', function (e) {
        var b = e.target.closest('[data-go], [data-back], [data-close], [data-craft]');
        if (!b) return;
        var trail = recipePopTrail.slice();
        if (b.dataset.close != null) { el.recipePop.hidden = true; return; }
        if (b.dataset.back != null) {
          var prev = trail.pop();
          if (prev) openRecipePop(prev, trail); else el.recipePop.hidden = true;
          return;
        }
        if (b.dataset.craft) {
          RPD.RecipeManager.craft(b.dataset.craft);
          openRecipePop(el.recipePop.dataset.def, trail);
          return;
        }
        if (b.dataset.go) {
          trail.push(el.recipePop.dataset.def);
          openRecipePop(b.dataset.go, trail);
        }
      });
    }

    if (el.tierFilter) {
      el.tierFilter.addEventListener('click', function (e) {
        var b = e.target.closest('.tchip');
        if (!b) return;
        if (b.dataset.tier === 'CLEAR') recipeSpecies = null;
        else { recipeTier = b.dataset.tier; recipeSpecies = null; }
        recipeSig = '';
        renderRecipes();
      });
    }

    if (el.recipeFilter) {
      el.recipeFilter.addEventListener('click', function (e) {
        var b = e.target.closest('.rf');
        if (!b) return;
        recipeFilter = b.dataset.filter;
        var all = el.recipeFilter.querySelectorAll('.rf');
        for (var i = 0; i < all.length; i++) all[i].classList.toggle('is-on', all[i] === b);
        renderRecipes();
      });
    }

    /* 보유 포켓몬 칸 → 작은 상세 창(배치 · 필드에서 보기 · 들어가는 조합식) */
    if (el.storageList) {
      el.storageList.addEventListener('click', function (e) {
        if (ownedDrag.suppressClick) { ownedDrag.suppressClick = false; return; }
        var cell = e.target.closest('.scell');
        if (!cell) return;
        openOwnedPop(cell.dataset.def, cell);
      });
      el.storageList.addEventListener('pointerdown', function (e) {
        var cell = e.target.closest && e.target.closest('.scell.has-stored');
        if (!cell) return;
        ownedDrag.def = cell.dataset.def;
        ownedDrag.x = e.clientX; ownedDrag.y = e.clientY;
        ownedDrag.active = false;
      });
      global.addEventListener('pointermove', function (e) { ownedDragMove(e.clientX, e.clientY); });
      global.addEventListener('pointerup', function (e) { ownedDragEnd(e.clientX, e.clientY); });
    }

    if (el.ownedPop) {
      el.ownedPop.addEventListener('click', function (e) {
        var b = e.target.closest('[data-act]');
        if (!b) return;
        var def = el.ownedPop.dataset.def;
        if (b.dataset.act === 'close') { closeOwnedPop(); return; }
        if (b.dataset.act === 'deploy') {
          var idx = RPD.StorageManager.indexOfSpecies(def);
          if (idx < 0) return;
          var r = RPD.StorageManager.deploy(idx);
          if (!r.ok && r.reason === 'NO_SLOT') {
            RPD.FxRenderer.text(RPD.VIEW.width / 2, 190, '필드에 빈 칸이 없습니다', '#ff8a7a',
              { size: 15, life: 1.1, jitter: false });
          }
          if (r.ok) closeOwnedPop(); else openOwnedPop(def);
          return;
        }
        if (b.dataset.act === 'sell') {
          var si = RPD.StorageManager.indexOfSpecies(def);
          if (si < 0) return;
          RPD.EconomyManager.sellStored(si);
          if (RPD.StorageManager.indexOfSpecies(def) >= 0 || F.getUnits().some(function (u) { return u.defId === def; })) {
            openOwnedPop(def);
          } else {
            closeOwnedPop();
          }
          return;
        }

        if (b.dataset.act === 'select') {
          for (var i = 0; i < F.slots.length; i++) {
            if (F.slots[i].unit && F.slots[i].unit.defId === def) { F.select(i); break; }
          }
          closeOwnedPop();
        }
      });
    }

    if (el.slotClose) el.slotClose.addEventListener('click', function () { F.select(-1); });

    if (el.synergyBody) {
      // 키보드로도 펼칠 수 있어야 한다 (줄이 role=button 이다)
      el.synergyBody.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        var row = e.target.closest && e.target.closest('.synrow');
        if (!row) return;
        if (e.preventDefault) e.preventDefault();
        synergyOpen[row.dataset.type] = !synergyOpen[row.dataset.type];
        renderSynergyPanel();
      });
      el.synergyBody.addEventListener('click', function (e) {
        var row = e.target.closest('.synrow');
        if (!row) return;
        var id = row.dataset.type;
        synergyOpen[id] = !synergyOpen[id];
        renderSynergyPanel();
      });
    }

    if (el.expandStorage) {
      el.expandStorage.addEventListener('click', function () {
        var r = RPD.StorageManager.expand();
        if (!r.ok && r.reason === 'NO_GOLD') {
          RPD.FxRenderer.text(RPD.VIEW.width / 2, 190, r.cost + '골드가 필요합니다', '#ff8a7a',
            { size: 15, life: 1.1, jitter: false });
        }
        renderStorage();
      });
    }

    if (el.dexBtn) el.dexBtn.addEventListener('click', showDex);
    if (el.dexClose) el.dexClose.addEventListener('click', hideDex);



  }

  function bindCanvas() {
    var canvas = el.canvas;
    if (!canvas) return;

    canvas.addEventListener('mousemove', function (e) {
      var p = RPD.Renderer.toLogical(e.clientX, e.clientY);
      F.setHover(F.hitTest(p.x, p.y));
    });

    // 캔버스를 벗어나도 끌기는 유지한다 — 보유 패널로 끌어다 놓아 창고로 보낼 수 있어야 한다.
    // (놓는 곳이 필드도 패널도 아니면 window 의 mouseup 이 취소한다)
    canvas.addEventListener('mouseleave', function () {
      F.setHover(-1);
    });

    canvas.addEventListener('mousedown', function (e) {
      pointerDown(e.clientX, e.clientY, e.shiftKey);
    });

    // 드롭은 window 에서 받는다 — 캔버스 밖에서 손을 떼도 드래그 상태가 남지 않게.
    global.addEventListener('mouseup', function (e) {
      pointerUp(e.clientX, e.clientY);
    });
    global.addEventListener('mousemove', function (e) {
      if (F.dragFromIndex >= 0) setOwnedDropHint(overOwnedPane(e.clientX, e.clientY));
    });

    /* 터치. 마우스와 같은 경로를 쓴다 —
     * 예전에는 탭으로 고르기만 되고 드래그로 자리를 바꿀 수 없었다(태블릿에서 반쪽이었다). */
    canvas.addEventListener('touchstart', function (e) {
      if (!e.touches[0]) return;
      var t = e.touches[0];
      var p = RPD.Renderer.toLogical(t.clientX, t.clientY);
      F.setHover(F.hitTest(p.x, p.y));
      pointerDown(t.clientX, t.clientY, false);
    }, { passive: true });

    canvas.addEventListener('touchmove', function (e) {
      if (!e.touches[0]) return;
      var t = e.touches[0];
      var p = RPD.Renderer.toLogical(t.clientX, t.clientY);
      F.setHover(F.hitTest(p.x, p.y));
      // 칸을 끌고 있는 동안에는 화면이 같이 스크롤되면 안 된다
      if (F.dragFromIndex >= 0 && e.cancelable && e.preventDefault) e.preventDefault();
    }, { passive: false });

    canvas.addEventListener('touchend', function (e) {
      var t = (e.changedTouches && e.changedTouches[0]) || null;
      if (!t) { F.cancelDrag(); return; }
      pointerUp(t.clientX, t.clientY);
      F.setHover(-1);
    });

    canvas.addEventListener('touchcancel', function () { F.cancelDrag(); F.setHover(-1); });
  }

  function pointerDown(clientX, clientY, shift) {
    var p = RPD.Renderer.toLogical(clientX, clientY);

    // 개발 도구: 전투 경로를 실제로 검증하기 위한 임시 타격
    if (devHitMode) {
      var target = RPD.EnemyManager.findAt(p.x, p.y);
      if (target) {
        RPD.EnemyManager.damage(target, target.maxHp * 0.34, { crit: !!shift, source: 'dev' });
        return;
      }
    }

    var idx = F.hitTest(p.x, p.y);
    F.select(idx);

    var slot = F.get(idx);
    if (slot && !slot.unlocked) {
      var r = RPD.EconomyManager.unlockSlot(idx);
      if (!r.ok && r.reason === 'NO_GOLD') {
        RPD.FxRenderer.text(slot.x, slot.y - 34, slot.cost + '골드 필요', '#ff8a7a',
          { size: 14, life: 1.1, jitter: false });
      }
      return;
    }

    if (idx >= 0) F.beginDrag(idx);
  }

  /* ---------- 창고 → 필드 끌어놓기 ----------
   * 창고에 있는 개체(창고 배지가 붙은 칸)를 끌어 필드 칸에 놓는다.
   * 빈 칸이면 배치, 누가 있으면 자리를 맞바꾼다(StorageManager.deploy 규칙 그대로).
   * 6px 이상 움직여야 끌기로 본다 — 그보다 짧으면 평소처럼 상세창이 뜬다. */
  var ownedDrag = { def: null, x: 0, y: 0, active: false, ghost: null, suppressClick: false };

  function ownedDragMove(x, y) {
    if (!ownedDrag.def) return;
    if (!ownedDrag.active) {
      if (Math.abs(x - ownedDrag.x) + Math.abs(y - ownedDrag.y) < 6) return;
      ownedDrag.active = true;
      if (typeof document !== 'undefined' && document.createElement) {
        var g = document.createElement('div');
        g.className = 'dragghost';
        g.innerHTML = RPD.UI.sprite(RPD.PokemonData.get(ownedDrag.def), 'spr--ghost');
        document.body.appendChild(g);
        ownedDrag.ghost = g;
      }
    }
    if (ownedDrag.ghost && ownedDrag.ghost.style) {
      ownedDrag.ghost.style.left = x + 'px';
      ownedDrag.ghost.style.top = y + 'px';
    }
    var p = RPD.Renderer.toLogical(x, y);
    F.setHover(F.hitTest(p.x, p.y));
  }

  function ownedDragEnd(x, y) {
    if (!ownedDrag.def) return;
    var def = ownedDrag.def, active = ownedDrag.active;
    ownedDrag.def = null; ownedDrag.active = false;
    if (ownedDrag.ghost && ownedDrag.ghost.parentNode) ownedDrag.ghost.parentNode.removeChild(ownedDrag.ghost);
    ownedDrag.ghost = null;
    if (!active) return;
    ownedDrag.suppressClick = true;
    var p = RPD.Renderer.toLogical(x, y);
    var inside = p.x >= 0 && p.x <= RPD.VIEW.width && p.y >= 0 && p.y <= RPD.VIEW.height;
    if (!inside) return;
    var slot = F.hitTest(p.x, p.y);
    if (slot < 0) return;
    var idx = RPD.StorageManager.indexOfSpecies(def);
    if (idx < 0) return;
    var r = RPD.StorageManager.deploy(idx, slot);
    if (!r.ok && r.reason === 'LOCKED') {
      RPD.FxRenderer.text(RPD.VIEW.width / 2, 190, '잠긴 칸입니다', '#ff8a7a', { size: 15, life: 1.1, jitter: false });
    }
    if (r.ok) F.select(r.slotIndex);
  }
  UIManager.dragStoredTo = function (defId, slotIndex) {
    var idx = RPD.StorageManager.indexOfSpecies(defId);
    return idx < 0 ? { ok: false, reason: 'NO_UNIT' } : RPD.StorageManager.deploy(idx, slotIndex);
  };

  /* 좌표가 보유 포켓몬 패널 위인가 — 필드에서 끌어 와 놓으면 창고로 보낸다 */
  function overOwnedPane(clientX, clientY) {
    if (typeof document === 'undefined' || !document.querySelector) return false;
    var pane = document.querySelector('.pane--owned');
    if (!pane || !pane.getBoundingClientRect) return false;
    var r = pane.getBoundingClientRect();
    return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
  }

  function setOwnedDropHint(on) {
    if (typeof document === 'undefined' || !document.querySelector) return;
    var pane = document.querySelector('.pane--owned');
    if (pane && pane.classList) pane.classList.toggle('is-droptarget', !!on);
  }

  function pointerUp(clientX, clientY) {
    if (F.dragFromIndex < 0) return;
    setOwnedDropHint(false);
    if (overOwnedPane(clientX, clientY)) {
      var from = F.dragFromIndex;
      F.cancelDrag();
      var r = RPD.StorageManager.store(from);
      if (!r.ok) {
        RPD.FxRenderer.text(RPD.VIEW.width / 2, 190, '창고가 가득 찼습니다', '#ff8a7a',
          { size: 15, life: 1.1, jitter: false });
      }
      return;
    }
    var p = RPD.Renderer.toLogical(clientX, clientY);
    var inside = p.x >= 0 && p.x <= RPD.VIEW.width && p.y >= 0 && p.y <= RPD.VIEW.height;
    F.endDrag(inside ? F.hitTest(p.x, p.y) : -1);
  }

  function bindEvents() {
    RPD.bus.on('stats:changed', UIManager.refreshStats);
    RPD.bus.on('loop:speed', refreshSpeed);
    RPD.bus.on('loop:paused', refreshPause);
    RPD.bus.on('game:state', onStateChange);
    RPD.bus.on('field:select', renderSlotPanel);
    RPD.bus.on('field:changed', function () { renderSlotPanel({ slot: F.getSelected() }); });

    RPD.bus.on('enemy:countChanged', function (n) {
      if (el.enemies) el.enemies.textContent = n;
    });

    RPD.bus.on('summon:result', onSummonResult);
    RPD.bus.on('synergy:changed', renderSynergyPanel);
    RPD.bus.on('recipe:changed', renderRecipes);
    RPD.bus.on('recipe:crafted', onCrafted);
    RPD.bus.on('shard:changed', renderShards);
    RPD.bus.on('storage:changed', renderStorage);
    RPD.bus.on('shard:changed', function () {
      if (recipeFilter === 'shards') renderShardShop();
    });
    RPD.bus.on('storage:expanded', renderStorage);
    RPD.bus.on('field:changed', renderStorage);
    RPD.bus.on('recipe:changed', renderStorage);
    RPD.bus.on('game:reset', function () {
      recipeSig = ''; ownedSig = ''; recipeTier = 'ALL'; recipeSpecies = null; closeOwnedPop();
      if (el.recipePop) el.recipePop.hidden = true;
    });
    RPD.bus.on('game:shield', renderShield);
    RPD.bus.on('summon:stateChanged', renderSummonPanel);
    RPD.bus.on('units:recomputed', function () { renderSlotPanel({ slot: F.getSelected() }); });
    RPD.bus.on('economy:gold', refreshActionButtons);
    RPD.bus.on('field:changed', refreshActionButtons);
    RPD.bus.on('field:select', refreshActionButtons);
    RPD.bus.on('game:wave', renderSummonPanel);

    RPD.bus.on('wave:phase', renderWaveStatus);
    RPD.bus.on('wave:started', onWaveStarted);
    RPD.bus.on('tier:unlocked', onTierUnlocked);
    RPD.bus.on('wave:preview', onWavePreview);
    RPD.bus.on('summon:stateChanged', renderNextUnlock);
    RPD.bus.on('wave:cleared', onWaveCleared);
    RPD.bus.on('game:over', function (p) { showResult(false, p); });
    RPD.bus.on('progress:cleared', function (p) {
      lastProgress = p;
      if (el.result && !el.result.hidden) renderClearNote(true);
    });
    RPD.bus.on('game:reset', function () { lastProgress = null; renderTrainerInfo(); });
    RPD.bus.on('progress:bonus', renderTrainerInfo);
    RPD.bus.on('pool:rolled', function () { recipeSig = ''; renderTrainerInfo(); });
    RPD.bus.on('game:victory', function (p) { showResult(true, p); });
  }

  UIManager.refreshAll = function () {
    UIManager.refreshStats({ wave: GM.wave, gold: GM.gold, life: GM.life });
    refreshSpeed(RPD.Loop.speed);
    refreshPause(RPD.Loop.paused);
    renderSlotPanel({ slot: null });
    
    if (el.enemies) el.enemies.textContent = RPD.EnemyManager.aliveCount();
    
    recipeSig = ''; ownedSig = '';
    renderRecipes();
    renderSynergyPanel();
    renderStorage();
    renderShards();
    setBodyState(GM.state);
    
    renderShield({ shield: GM.shield });
    hideDex();
    refreshActionButtons();
    if (el.result) el.result.hidden = true;
    if (el.waveStatus) el.waveStatus.hidden = true;
    if (el.waveBody) {
      el.waveBody.innerHTML = '<p class="empty">게임을 시작하면 이번 웨이브의 적 구성이 나옵니다.</p>';
    }
  };

  UIManager.refreshStats = function (s) {
    if (el.wave) el.wave.textContent = s.wave > 0 ? s.wave : '—';
    if (el.gold) el.gold.textContent = U.formatNumber(s.gold);
    if (el.life) el.life.textContent = s.life;
    if (el.lifeBox) el.lifeBox.classList.toggle('is-danger', s.life <= 5);
  };

  UIManager.refreshClock = function () {
    if (el.time) el.time.textContent = U.formatTime(GM.elapsed);
    
  };

  function refreshSpeed(speed) {
    if (!el.speedGroup) return;
    var btns = el.speedGroup.querySelectorAll('.speed__btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('is-on', parseFloat(btns[i].dataset.speed) === speed);
    }
  }

  function refreshPause(paused) {
    if (!el.pause) return;
    el.pause.title = paused ? '이어하기' : '일시정지';
    el.pause.setAttribute && el.pause.setAttribute('aria-label', paused ? '이어하기' : '일시정지');
    el.pause.classList.toggle('is-paused', !!paused);
  }

  /* 화면 전체의 상태 표시. CSS 가 시작 패널·필드 흐림 등을 여기에 맞춘다. */
  function setBodyState(state) {
    if (typeof document !== 'undefined' && document.body && document.body.dataset) {
      document.body.dataset.state = state || 'READY';
    }
  }

  function onStateChange(e) {
    setBodyState(e.to);
    if (el.startMode) el.startMode.textContent = GM.mode.label;
    var live = e.to === S.RUNNING || e.to === S.PAUSED;
    var ended = e.to === S.GAMEOVER || e.to === S.VICTORY;

    if (el.pause) el.pause.disabled = !live;
    if (el.start) el.start.disabled = live || ended;
    if (el.hint) el.hint.hidden = live || ended;
    if (el.waveStatus) el.waveStatus.hidden = !live;

    refreshActionButtons();
    if (ended) RPD.Loop.setPaused(true);
  }

  /* ---------- 웨이브 표시 ---------- */

  var PHASE_LABEL = {
    SPAWNING: '진행 중',
    CLEARING: '소탕',
    INTERLUDE: '다음 라운드',
    IDLE: '대기'
  };

  function renderWaveStatus(p) {
    if (!el.waveStatus) return;

    if (el.wavePhase) {
      el.wavePhase.textContent = (p.isBoss ? '보스 · ' : '라운드 ' + p.wave + ' · ') +
        (PHASE_LABEL[p.phase] || p.phase);
    }
    if (el.waveTimer) {
      el.waveTimer.textContent = p.phase === RPD.WaveManager.PHASE.INTERLUDE
        ? '곧 시작'
        : (p.remaining + ' / ' + p.total);
    }
    el.waveStatus.classList.toggle('is-urgent', p.phase === RPD.WaveManager.PHASE.INTERLUDE);
    el.waveStatus.classList.toggle('is-boss', !!p.isBoss);
  }

  /* 새 등급 해금 — 이 게임에서 가장 큰 기대 지점이다. 크게 알린다. */
  function onTierUnlocked(p) {
    UIManager.showBanner(p.tier.label + ' 등급 등장!', false);
    RPD.FxRenderer.flash(p.tier.color, 0.35);
    RPD.FxRenderer.text(RPD.VIEW.width / 2, 170,
      p.tier.role, p.tier.color, { size: 14, life: 2.2, jitter: false });
    renderNextUnlock();
  }

  /* 다음 라운드에 무엇이 달라지는지 미리 알린다 */
  function onWavePreview(p) {
    if (p.kind !== 'unlock') return;
    RPD.FxRenderer.text(RPD.VIEW.width / 2, 120,
      '다음 라운드 · ' + p.tier.label + ' 등장!', p.tier.color,
      { size: 17, life: 1.6, jitter: false });
  }

  /* 상단에 "N라운드 뒤 특별함" 을 항상 띄워 둔다 */
  function renderNextUnlock() {
    if (!el.nextUnlock) return;
    var st = RPD.SummonManager.state();
    if (!st.nextUnlock) { el.nextUnlock.hidden = true; return; }
    el.nextUnlock.hidden = false;
    el.nextUnlock.textContent = st.nextUnlock.inRounds + 'R 뒤 ' + st.nextUnlock.tier.label;
    el.nextUnlock.style.color = st.nextUnlock.tier.color;
  }

  function onWaveStarted(plan) {
    UIManager.showBanner(plan.isBoss ? '보스 · 웨이브 ' + plan.wave : '웨이브 ' + plan.wave, plan.isBoss);
  }

  function onWaveCleared(p) {
    UIManager.showBanner('웨이브 ' + p.wave + ' 클리어  +' + (p.reward + p.interest), false);
  }

  function renderWaveComposition(plan) {
    if (!el.waveBody) return;

    var counts = {};
    for (var i = 0; i < plan.entries.length; i++) {
      var id = plan.entries[i].enemyId;
      var def = RPD.EnemyData.get(id);
      counts[id] = (counts[id] || 0) + (def.packSize || 1);
    }

    var rows = Object.keys(counts).map(function (id) {
      return { def: RPD.EnemyData.get(id), count: counts[id] };
    }).sort(function (a, b) {
      if (a.def.isBoss !== b.def.isBoss) return a.def.isBoss ? -1 : 1;
      return b.count - a.count;
    });

    var html = '<div class="wavelist">';
    for (var r = 0; r < rows.length; r++) {
      var d = rows[r].def;
      html += '<div class="wavelist__row">' +
        '<span class="wavelist__name">' +
          '<span class="wavelist__dot" style="background:' + d.color + '"></span>' +
          '<span class="' + (d.isBoss ? 'wavelist__boss' : '') + '">' + d.name + '</span>' +
          '<span class="wavelist__role">' + d.role + '</span>' +
        '</span>' +
        '<span class="wavelist__count">' + rows[r].count + '</span>' +
      '</div>';
    }
    html += '</div>';

    // 보스 웨이브면 어떤 패턴을 쓰는지 미리 알려 준다.
    // 처음 만나서 당하고 배우는 것보다, 알고도 막지 못해서 지는 쪽이 낫다.
    var boss = rows.find(function (r) { return r.def.isBoss; });
    if (boss && boss.def.patterns) {
      html += '<div class="bosspat">' + boss.def.patterns.map(function (pt) {
        return '<div class="bosspat__row">' +
          '<span class="bosspat__name">' + (pt.label || pt.id) + '</span>' +
          '<span class="bosspat__when">' + (pt.every || 12) + '초마다</span>' +
        '</div>';
      }).join('');
      if (boss.def.phase2) {
        html += '<div class="bosspat__row bosspat__row--phase">' +
          '<span class="bosspat__name">체력 ' +
            Math.round(boss.def.phase2.at * 100) + '% · ' + boss.def.phase2.label + '</span>' +
          '<span class="bosspat__when">' + (boss.def.phase2.note || '') + '</span>' +
        '</div>';
      }
      html += '</div>';
    }

    if (rows.length) html += '<p class="devnote">' + rows[0].def.desc + '</p>';

    el.waveBody.innerHTML = html;
  }

  function refreshDevReadout() {
    if (!el.devReadout) return;
    el.devReadout.textContent =
      RPD.Loop.fps + ' fps · 적 ' + RPD.EnemyManager.aliveCount() +
      '체 · 슬롯 ' + F.slots.length + '칸';
  }

  /* ---------- 슬롯 패널 ---------- */

  function renderSlotPanel(payload) {
    if (!el.slotBody) return;
    var slot = payload && payload.slot;

    if (el.slotCard) el.slotCard.hidden = !slot;
    if (!slot) {
      el.slotBody.innerHTML = '';
      return;
    }

    if (slot.blocked) {
      el.slotBody.innerHTML =
        '<div class="sc__head"><span class="sc__title">사용 불가 칸</span></div>' +
        '<p class="sc__note">' + GM.mode.label + ' 모드는 칸을 ' +
        RPD.modeMod('slotLimit', RPD.MapData.baseSlotCount) + '개만 씁니다. ' +
        '이 칸은 골드로도 열 수 없습니다.</p>';
      positionSlotCard(slot);
      return;
    }

    if (!slot.unlocked) {
      var afford = GM.canAfford(slot.cost);
      el.slotBody.innerHTML =
        '<div class="sc__head"><span class="sc__title">잠긴 확장 칸</span>' +
          '<span class="sc__tag">' + (slot.label || '확장') + '</span></div>' +
        slotKindHtml(slot) +
        '<div class="sc__buy' + (afford ? ' is-ok' : '') + '">' +
          '<span class="gem gem--coin gem--sm"></span><b>' + slot.cost + '</b>' +
          '<span>' + (afford ? '칸을 한 번 더 누르면 구매합니다' : '골드가 부족합니다') + '</span></div>';
      positionSlotCard(slot);
      return;
    }

    if (!slot.unit) {
      el.slotBody.innerHTML =
        '<div class="sc__head"><span class="sc__title">빈 칸</span>' +
          '<span class="sc__tag">경로까지 ' + Math.round(slot.distToPath) + 'px</span></div>' +
        slotKindHtml(slot) +
        (slot.note ? '<p class="sc__note">' + slot.note + '</p>' : '');
      positionSlotCard(slot);
      return;
    }

    el.slotBody.innerHTML = unitCardHtml(slot, slot.unit);
    positionSlotCard(slot);
  }

  /* 정보 카드는 고른 칸 옆에 뜬다. 칸이 화면 오른쪽 절반이면 왼쪽에, 아니면 오른쪽에.
   * 필드를 가리는 건 사용자가 칸을 고른 동안뿐이다. */
  function positionSlotCard(slot) {
    if (!el.slotCard || !RPD.Renderer.toCanvasCss || !el.slotCard.style) return;
    var p = RPD.Renderer.toCanvasCss(slot.x, slot.y);
    var gap = (slot.size / 2 + 12) * p.scale;
    var right = slot.x < RPD.VIEW.width * 0.55;
    el.slotCard.classList.toggle('is-left', !right);

    /* 보드 밖으로 나가지 않게 가둔다. 카드가 잘리면 경고 문구부터 안 보인다. */
    var board = el.slotCard.parentNode;
    var bw = (board && board.clientWidth) || 0;
    var bh = (board && board.clientHeight) || 0;
    var cw = el.slotCard.offsetWidth || 250;
    var ch = el.slotCard.offsetHeight || 200;
    var left = right ? p.x + gap : p.x - gap;
    if (bw) {
      var min = right ? 8 : cw + 8;
      var max = right ? bw - cw - 8 : bw - 8;
      if (max >= min) left = Math.max(min, Math.min(max, left));
    }
    var top = p.y;
    if (bh) top = Math.max(ch / 2 + 8, Math.min(bh - ch / 2 - 8, top));
    el.slotCard.style.left = Math.round(left) + 'px';
    el.slotCard.style.top = Math.round(top) + 'px';
  }
  UIManager.positionSlotCard = function () {
    var slot = F.getSelected();
    if (slot) positionSlotCard(slot);
  };

  var ATTACK_LABEL = {
    SINGLE: '단일 공격',
    SPLASH: '광역 공격',
    PIERCE: '관통 공격',
    CHAIN: '연쇄 공격'
  };

  var TARGET_LABEL = {
    FIRST: '출구에 가까운 적',
    LAST: '갓 나온 적',
    STRONGEST: '체력이 가장 많은 적',
    WEAKEST: '체력이 가장 적은 적',
    BOSS: '보스 우선'
  };

  /* 옆 버퍼에게서 받는 패시브 — 왜 공속이 올랐는지 보이게 */
  function receivedAura(u) {
    var x = u.auraExtras;
    if (!x || !x.from || !x.from.length) return '';
    var parts = [];
    if (x.attackSpeed) parts.push('공속 +' + Math.round(x.attackSpeed * 100) + '%');
    if (x.critRate) parts.push('치명 +' + Math.round(x.critRate * 100) + '%');
    if (x.critDamage) parts.push('치피 +' + Math.round(x.critDamage * 100) + '%');
    if (x.range) parts.push('사거리 +' + Math.round(x.range * 100) + '%');
    if (x.cooldown) parts.push('쿨다운 -' + Math.round(x.cooldown * 100) + '%');
    if (x.armorPierce) parts.push('방어무시 +' + Math.round(x.armorPierce * 100) + '%');
    if (x.bossDamage) parts.push('보스피해 +' + Math.round(x.bossDamage * 100) + '%');
    var names = x.from.map(function (id) { var a = RPD.AuraData.get(id); return a ? a.icon : ''; }).join('');
    return '<p class="sc__buffed">' + names + ' 받는 버프 · ' + parts.join(' · ') + '</p>';
  }

  function unitCardHtml(slot, u) {
    var UI = RPD.UI;
    var tier = RPD.Tiers[u.tier] || RPD.Tiers.T1;
    var def = u.def;

    var types = (u.types || []).map(function (id) {
      var t = RPD.Types[id];
      if (!t) return '';
      return '<span class="typechip" style="--tc:' + t.color + '">' + UI.typeIcon(id) + t.label + '</span>';
    }).join('');

    var attackNote = ATTACK_LABEL[u.attackType] || ATTACK_LABEL.SINGLE;
    if (u.attackType === 'SPLASH') attackNote += ' ' + u.splash;
    else if (u.attackType === 'PIERCE') attackNote += ' ' + u.pierce + '체';
    else if (u.attackType === 'CHAIN') attackNote += ' ' + u.chain + '회';

    var stats = [
      ['DPS', U.formatNumber(Math.round(u.dps)), true],
      ['공격', U.formatNumber(Math.round(u.attack)) + ' <small>×' + u.attackSpeed.toFixed(2) +
        (RPD.CraftPower && RPD.CraftPower.labelOf(u.def) ? ' · ' + RPD.CraftPower.labelOf(u.def) : '') + '</small>'],
      ['사거리', (u.range >= RPD.Range.GLOBAL ? '전체' : u.range)],
      ['방식', attackNote],
      ['대상', TARGET_LABEL[u.targeting] || u.targeting],
      ['사거리 강화', u.def.range >= RPD.Range.GLOBAL ? '<small>전체 사거리라 필요 없음</small>'
        : '+' + u.level + ' <small>/ ' + RPD.Config.upgradeMaxLevel + ' · 사거리 +' +
          Math.round(u.level * RPD.Config.upgradeRangeStep * 100) + '%' + covNote(u) + '</small>']
    ];
    if (u.auraBonus > 0) stats[4] = ['버프', '+' + Math.round(u.auraBonus * 100) + '%'];

    var html =
      '<div class="sc__unit" style="--tier:' + tier.color + '">' +
        UI.sprite(def, 'spr--card') +
        '<div class="sc__who">' +
          '<span class="sc__tier">' + tier.label + ' · ' + (u.roleLabel || u.role) + '</span>' +
          '<span class="sc__name">' + u.name + '</span>' +
          '<span class="typerow">' + types + '</span>' +
        '</div>' +
      '</div>' +
      '<dl class="sc__stats">' +
        stats.map(function (r) {
          return '<div' + (r[2] ? ' class="is-key"' : '') + '><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>';
        }).join('') +
      '</dl>' +
      UI.trait(def.id, 'trait--card') +
      UI.aura(def.id, 'trait--card') +
      receivedAura(u) +
      (u.skill ? '<div class="sc__skill' + (u.skillCooldown <= 0 ? ' is-ready' : '') + '">' +
          '<span class="sc__skillName">' + u.skill.name + '</span>' +
          '<span class="sc__skillCd">' + (u.skillCooldown <= 0 ? '준비 완료'
            : Math.ceil(u.skillCooldown) + '초') + '</span>' +
          '<span class="sc__skillDesc">' + u.skill.desc + '</span>' +
        '</div>' : '') +
      (RPD.SkillData && RPD.SkillData.passiveForUnit(def) ?
        '<div class="sc__passive"><b>' + RPD.SkillData.passiveForUnit(def).name + '</b>' +
        RPD.SkillData.passiveForUnit(def).desc + '</div>' : '') +
      '<div class="sc__foot">' + slotKindHtml(slot) +
        '<span class="sc__dmg">누적 ' + U.formatNumber(u.totalDamage) + '</span></div>';

    // 이 칸에서 실제로 일하는지. 0 이면 자리를 옮기라는 뜻이다.
    var cover = RPD.MapData.coverageOf(slot, u.range);
    if (cover === 0) {
      html += '<p class="unitwarn">이 칸에서는 경로에 닿지 못합니다. 자리를 옮기세요.</p>';
    } else {
      var better = 0;
      for (var i = 0; i < F.slots.length; i++) {
        var o = F.slots[i];
        if (!o.unlocked || o.unit) continue;
        if (RPD.MapData.coverageOf(o, u.range) > cover) better += 1;
      }
      if (better > 0) {
        html += '<p class="unitwarn">더 잘 닿는 빈 칸이 ' + better + '곳 있습니다. 드래그해 옮기세요.</p>';
      }
    }
    return html;
  }

  /* 칸의 성격을 한마디로 말해 준다.
   *
   * 호출만 있고 정의가 없어서 빈 칸을 클릭하면 그 자리에서 터지고 있었다.
   * 사이드바가 깨져 보인 직접 원인이다.
   *
   * 정의하면서 형태도 바꿨다. 사거리 3종의 커버리지를 px 막대로 보여 주는 대신
   * 판정을 대신 내려 준다 — 기획: "보고 바로 이 자리는 장거리용 정도를 이해할 수 있어야 한다."
   */
  var SLOT_KIND = [
    { label: '근접용',      hint: '짧은 사거리도 제 몫을 한다' },
    { label: '중거리용',    hint: '사거리 155 이상이 어울린다' },
    { label: '장거리 전용', hint: '사거리 235가 아니면 거의 논다' },
    { label: '구석 자리',   hint: '긴 사거리를 넣어도 덮는 구간이 짧다' }
  ];

  function slotKindHtml(slot) {
    var M = RPD.MapData;
    var s100 = M.coverageOf(slot, RPD.Range.SHORT);
    var s155 = M.coverageOf(slot, RPD.Range.MID);
    var s235 = M.coverageOf(slot, RPD.Range.LONG);

    var k = s100 >= 140 ? SLOT_KIND[0]
          : s155 >= 380 ? SLOT_KIND[1]
          : s235 >= 500 ? SLOT_KIND[2]
          : SLOT_KIND[3];

    return '<div class="slotkind" title="' + k.hint + '">' +
      '<span class="slotkind__tag">' + k.label + '</span>' +
      '<span class="slotkind__hint">' + k.hint + '</span>' +
    '</div>';
  }

  function hexAlpha(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  /* ---------- 소환 ---------- */

  function refreshActionButtons() {
    var playable = GM.isPlayable();
    var slot = F.getSelected();
    var hasUnit = !!(slot && slot.unit);

    if (el.summon) {
      var cost = RPD.EconomyManager.summonCost();
      var free = RPD.SummonManager.tickets > 0;
      /* 필드가 차도 창고에 자리가 있으면 소환된다(SummonManager 규칙).
       * 버튼만 필드를 보고 잠기던 것을 시스템 규칙에 맞췄다. */
      var noRoom = !F.firstEmpty() && RPD.StorageManager.isFull();
      var banned = RPD.EliteManager && RPD.EliteManager.isBanned();
      var blocked = !playable || (!free && !GM.canAfford(cost)) || noRoom || banned;
      el.summon.disabled = blocked;
      el.summon.classList.toggle('is-poor', playable && !free && !GM.canAfford(cost));
      el.summon.classList.toggle('is-banned', !!banned);
      if (el.summonCost) {
        el.summonCost.textContent = banned ? '금지 ' + RPD.EliteManager.banRoundsLeft() + 'R'
          : free ? '소환권 ' + RPD.SummonManager.tickets : cost;
      }
    }

    if (el.upgrade) {
      var canUp = hasUnit && RPD.EconomyManager.canUpgrade(slot.unit);
      var upCost = canUp ? RPD.EconomyManager.upgradeCost(slot.unit) : 0;
      el.upgrade.disabled = !playable || !canUp || !GM.canAfford(upCost);
      if (el.upgradeCost) {
        el.upgradeCost.textContent = !hasUnit ? '칸 선택'
          : slot.unit.def.range >= RPD.Range.GLOBAL ? '전체 사거리'
          : (canUp ? upCost + 'G' : '최대');
      if (hasUnit && el.upgrade.setAttribute) {
        var cv = RPD.EconomyManager.upgradeCoverage(slot.unit);
        el.upgrade.setAttribute('title', canUp && cv
          ? '사거리 강화 — 이 칸이 덮는 경로 ' + cv.now + 'px → ' + cv.next + 'px'
          : '사거리 강화 (W)');
      }
      }
    }

    if (el.store) {
      var room = !RPD.StorageManager.isFull();
      el.store.disabled = !playable || !hasUnit || !room;
      if (el.storeHint) {
        el.storeHint.textContent = !hasUnit ? '칸 선택'
          : (room ? RPD.StorageManager.freeSlots() + '칸 남음' : '가득 참');
      }
    }

    if (el.sell) {
      el.sell.disabled = !playable || !hasUnit;
      if (el.sellValue) {
        el.sellValue.textContent = hasUnit
          ? '+' + RPD.EconomyManager.sellValue(slot.unit) + 'G' : '칸 선택';
      }
    }
  }

  /* 시작 전 화면의 칭호 · 이번 판 시작 보너스 */
  function renderTrainerInfo() {
    if (!el.trainerInfo) return;
    var PM = RPD.ProgressManager;
    if (!PM) { el.trainerInfo.hidden = true; return; }
    var t = PM.title(), b = PM.lastBonus && PM.describeBonus(PM.lastBonus);
    el.trainerInfo.innerHTML = '<b>' + (t ? t.name : '새 트레이너') + '</b>' +
      '<span>클리어 ' + PM.clears() + '회</span>' +
      (b ? '<span class="ti__bonus">이번 판 시작 보너스 · ' + b + '</span>' : '');
    el.trainerInfo.hidden = false;
  }
  UIManager.renderTrainerInfo = renderTrainerInfo;

  /* ---------- 모드 선택 ---------- */

  function recordHtml(key) {
    var rec = RPD.SaveManager.recordFor(key);
    var n = RPD.SaveManager.clearsFor(key);
    if (!rec) return '<small>기록 없음</small>';
    return n ? '<b class="is-clear">클리어 ' + n + '회</b>' : '<b>최고 ' + rec.wave + 'R</b>';
  }

  function showModePick() {
    if (!el.modeOverlay || !el.modeList) return;
    var PM = RPD.ProgressManager;

    var head = '';
    if (PM) {
      var t = PM.title(), nx = PM.next(), bonus = PM.describeBonus();
      head = '<div class="trainer">' +
        '<span class="trainer__title">' + (t ? t.name : '칭호 없음') + '</span>' +
        '<span class="trainer__count">총 클리어 ' + PM.clears() + '회' +
          (nx ? ' · ' + nx.name + '까지 ' + (nx.clears - PM.clears()) + '회' : '') + '</span>' +
        (bonus ? '<span class="trainer__bonus">시작 보너스: ' + bonus + '</span>'
               : '<span class="trainer__bonus is-none">한 번 클리어하면 시작 보너스가 생깁니다</span>') +
        (PM.specialTitles().length ? '<span class="trainer__special">' +
          PM.specialTitles().map(function (x) { return '🏅 ' + x.name; }).join(' · ') + '</span>' : '') +
      '</div>';
    }

    el.modeList.innerHTML = head + RPD.MODE_ORDER.map(function (id) {
      var m = RPD.Modes[id];
      var goal = m.finalWave > 0 ? m.finalWave + '라운드' : '무한';

      if (id === 'NORMAL') {
        /* 일반 모드는 난이도를 골라야 시작한다. 난이도마다 기록이 따로 남는다. */
        var diffs = RPD.DIFFICULTY_ORDER.map(function (did) {
          var d = RPD.Difficulties[did];
          return '<button type="button" class="diffbtn" data-mode="NORMAL" data-diff="' + did +
            '" style="--dc:' + d.color + '">' +
            '<span class="diffbtn__name">' + d.label + '</span>' +
            '<span class="diffbtn__desc">' + d.desc + '</span>' +
            '<span class="diffbtn__rec">' + recordHtml('NORMAL:' + did) + '</span>' +
          '</button>';
        }).join('');
        return '<div class="modecard modecard--normal">' +
          '<span class="modecard__main">' +
            '<span class="modecard__name">' + m.label + '  <span class="modecard__tag">' + goal + '</span></span>' +
            '<span class="modecard__tag">' + m.tagline + '</span>' +
            '<span class="modecard__desc">' + m.desc + '</span>' +
          '</span>' +
          '<div class="difflist">' + diffs + '</div>' +
        '</div>';
      }

      var rec = RPD.SaveManager.recordFor(id);
      var recHtml = rec
        ? '<strong>' + rec.wave + '</strong>' + (rec.cleared ? '클리어' : '최고 라운드')
        : '<strong>—</strong>기록 없음';
      return '<button type="button" class="modecard" data-mode="' + id + '">' +
        '<span class="modecard__main">' +
          '<span class="modecard__name">' + m.label + '  <span class="modecard__tag">' + goal + '</span></span>' +
          '<span class="modecard__tag">' + m.tagline + '</span>' +
          '<span class="modecard__desc">' + m.desc + '</span>' +
        '</span>' +
        '<span class="modecard__rec' + (rec && rec.cleared ? ' is-clear' : '') + '">' + recHtml + '</span>' +
      '</button>';
    }).join('');

    el.modeOverlay.hidden = false;
  }

  function hideModePick() {
    if (el.modeOverlay) el.modeOverlay.hidden = true;
  }

  /* ---------- 기록 / 도감 ---------- */

  function renderRecordPanel() {
    if (!el.recordBody) return;
    var SM = RPD.SaveManager;
    var dex = SM.dexCount();
    var total = SM.dexTotal();
    var rec = SM.recordFor(GM.mode.id);
    var t = SM.data.totals;

    var html =
      '<dl class="kv">' +
        '<dt>도감</dt><dd>' + dex + ' / ' + total + '</dd>' +
      '</dl>' +
      '<div class="dexbar"><div class="dexbar__fill" style="width:' +
        (total ? (dex / total * 100).toFixed(1) : 0) + '%"></div></div>' +
      '<dl class="kv" style="margin-top:10px">' +
        '<dt>' + GM.mode.label + ' 최고</dt>' +
        '<dd>' + (rec ? '웨이브 ' + rec.wave + (rec.cleared ? ' · 클리어' : '') : '—') + '</dd>' +
        '<dt>플레이</dt><dd>' + t.runs + '판</dd>' +
        '<dt>클리어</dt><dd>' + t.clears + '회</dd>' +
        '<dt>누적 처치</dt><dd>' + U.formatNumber(t.kills) + '</dd>' +
      '</dl>';

    if (!SM.available) {
      html += '<p class="recnote">이 브라우저에서는 저장이 막혀 있어 이번 세션에만 유지됩니다.</p>';
    }

    el.recordBody.innerHTML = html;
  }

  /* ---------- 타입 시너지 ---------- */

  function renderShield(p) {
    if (!el.shield) return;
    var n = p ? p.shield : GM.shield;
    el.shield.hidden = !n;
    el.shield.textContent = '보호막 ' + n;
  }

  var synergyOpen = {};
  var synergyPrev = {};

  /* 시너지 10종을 항상 전부 보여 준다.
   * 켜진 것만 보여 주면 "무엇을 모으면 무엇이 켜지는지"를 판 중에 알 방법이 없다.
   * 켜진 타입이 위로 오고, 꺼진 타입은 흐리게 둔다. 줄을 누르면 단계표가 펼쳐진다. */
  function renderSynergyPanel(state) {
    if (!el.synergyBody) return;
    state = state || RPD.SynergyManager;
    var UI = RPD.UI;

    var byType = {};
    (state.active || []).forEach(function (a) { byType[a.typeId] = a; });

    var ids = Object.keys(RPD.Synergies).sort(function (a, b) {
      var A = byType[a], B = byType[b];
      var ai = A ? A.tierIndex : -2, bi = B ? B.tierIndex : -2;
      if (ai !== bi) return bi - ai;
      return (B ? B.count : 0) - (A ? A.count : 0);
    });

    var activeCount = 0;
    var html = ids.map(function (id) {
      var t = RPD.Types[id];
      var tiers = RPD.Synergies[id];
      var a = byType[id] || { count: 0, tierIndex: -1, next: tiers[0] };
      var on = a.tierIndex >= 0;
      if (on) activeCount += 1;

      var pips = tiers.map(function (tier, i) {
        return '<span class="pip' + (i <= a.tierIndex ? ' is-on' : '') + '"></span>';
      }).join('');

      var effect = on ? a.tier.label
        : (a.count > 0 ? (a.next.count - a.count) + '마리 더 → ' + a.next.label : tiers[0].count + '마리 · ' + tiers[0].label);

      var pulse = on && (synergyPrev[id] === undefined ? false : a.tierIndex > synergyPrev[id]);
      synergyPrev[id] = a.tierIndex;

      var detail = '';
      if (synergyOpen[id]) {
        detail = '<div class="syndetail">' +
          '<p>' + (t.desc || '') + '</p>' +
          tiers.map(function (tier, i) {
            return '<div class="syndetail__row' + (i <= a.tierIndex ? ' is-on' : '') + '">' +
              '<b>' + tier.count + '</b><span>' + tier.label + '</span></div>';
          }).join('') +
        '</div>';
      }

      return '<div class="synrow' + (on ? ' is-active' : '') + (a.count > 0 && !on ? ' is-partial' : '') +
          (pulse ? ' is-pulse' : '') + (synergyOpen[id] ? ' is-open' : '') +
          '" data-type="' + id + '" style="--tc:' + t.color + '" role="button" tabindex="0">' +
        '<span class="synrow__icon">' + UI.typeIcon(id) + '</span>' +
        '<span class="synrow__main">' +
          '<span class="synrow__name">' + t.label + '<em>' + a.count + '</em></span>' +
          '<span class="synrow__effect">' + effect + '</span>' +
        '</span>' +
        '<span class="synrow__pips">' + pips + '</span>' +
        '<span class="synrow__chev" aria-hidden="true"></span>' +
        detail +
      '</div>';
    }).join('');

    el.synergyBody.innerHTML = html;
    if (el.synergyCount) el.synergyCount.textContent = activeCount ? activeCount + '개 활성' : '';
  }

  /* ---------- 조각 상점 ----------
   *
   * 조각은 "재료가 끝내 안 나오는 판"을 구제하는 장치인데, 그동안 모이기만 하고
   * 쓸 화면이 없었다(자동 플레이 봇만 API 를 호출하고 있었다).
   *
   * 별도 창을 만들지 않고 조합식 패널의 탭으로 넣는다. 조각을 쓰고 싶어지는 순간은
   * "조합식을 보다가 재료가 하나 모자란 걸 알았을 때"이고, 그 자리에서 끝나야 한다.
   * 그래서 조합에 바로 쓰이는 재료가 맨 위로 온다. */
  /* 같은 재료가 두 번 들어간 조합식(캐터피 ×2)은 그림 하나에 ×2 로 묶어 보여 준다.
   * 그림 두 장이 나란히 있으면 "서로 다른 둘"로 읽혀 헷갈린다. */
  function groupMaterials(materials) {
    var out = [], at = {};
    for (var i = 0; i < materials.length; i++) {
      var m = materials[i];
      if (at[m.id] == null) {
        at[m.id] = out.length;
        out.push({ id: m.id, name: m.name, need: 0, ownedSlots: 0 });
      }
      var g = out[at[m.id]];
      g.need += 1;
      if (m.owned) g.ownedSlots += 1;
    }
    out.forEach(function (g) { g.owned = g.ownedSlots >= g.need; });
    return out;
  }
  UIManager.groupMaterials = groupMaterials;

  function matTierColor(mat) {
    var tier = RPD.RecipeData.tierOf(mat);
    return RPD.Tiers[tier] ? RPD.Tiers[tier].color : '#888';
  }
  /* 사거리 강화 — 다음 레벨에서 이 칸이 덮는 경로가 얼마나 느는지 */
  function covNote(u) {
    var cv = RPD.EconomyManager.upgradeCoverage(u);
    if (!cv) return '';
    return u.level >= RPD.Config.upgradeMaxLevel ? ' · 경로 ' + cv.now + 'px'
      : ' · 경로 ' + cv.now + '→' + cv.next + 'px';
  }
  function matCount(mat, counts) { return counts[mat] || 0; }
  /* ['a','a','b'] → [{id:'a',need:2},{id:'b',need:1}] */
  function groupIds(ids) {
    var out = [], at = {};
    ids.forEach(function (id) {
      if (at[id] == null) { at[id] = out.length; out.push({ id: id, need: 0 }); }
      out[at[id]].need += 1;
    });
    return out;
  }

  /* ---------- 주문 줄 ----------
   * 조합식 목록에 주문(히든·불멸·초월)도 함께 늘어놓는다. 재료·문구는 다 보이고,
   * 아직 만들어 본 적 없는 결과만 그림자 + ??? 로 가린다. 줄을 누르면 채팅에 문구가 채워진다
   * (Enter 는 직접 — 외치는 손맛은 남긴다). 조합 버튼·배지는 조합식만 센다. */
  function spellViews(counts) {
    if (!RPD.SpellData || !RPD.SpellManager) return [];
    /* 필드 조합식에는 "히든"만 올린다 — 불멸·초월은 조합 사전에서만 본다(재료가 전설급이라
     * 판 하나에 몇 번 안 쓰고, 여기 섞이면 진짜 조합식 줄이 파묻힌다).
     * 그리고 **발견한 것만** 줄로 뜬다 — 못 찾은 히든은 조합 사전에만 있고, 여기엔 아예 없다. */
    return RPD.SpellData.list.filter(function (sp) {
      return sp.kind === 'hidden' && RPD.SaveManager.knowsSpell && RPD.SaveManager.knowsSpell(sp.id);
    }).map(function (sp) {
      var def = RPD.PokemonData.get(sp.result);
      var used = {}, missing = 0;
      var mats = sp.materials.map(function (m) {
        used[m] = (used[m] || 0) + 1;
        var owned = (counts[m] || 0) >= used[m];
        if (!owned) missing += 1;
        return { id: m, name: RPD.PokemonData.get(m).name, owned: owned };
      });
      var ok = RPD.SpellManager.check(sp).ok;
      return {
        spell: sp, key: 'spell:' + sp.id, resultId: sp.result, resultTier: def.tier, isHidden: true,
        resultName: def.name, known: true, discovered: true,
        materials: mats, missingCount: ok ? 0 : Math.max(1, missing), ready: ok
      };
    });
  }
  /* 히든(🔒) 재료 표시 — 조합식 목록에 없고 채팅 주문으로만 만든다 */
  /* 히든인데 아직 그 주문을 성공한 적 없는 재료 — 필드 쪽에서는 이름·그림을 가린다.
   * (조합 사전은 다르다: 사전은 재료를 항상 다 보여 준다 — 이건 필드 조합식/조합식 창/보유 상세용) */
  function matSecret(id) {
    if (!RPD.PokemonData.isHidden(id)) return false;
    var sp = RPD.SpellData && RPD.SpellData.forResult(id);
    return !(sp && RPD.SaveManager.knowsSpell && RPD.SaveManager.knowsSpell(sp.id));
  }
  function lockTag(id) {
    if (matSecret(id)) return '<span class="rmat__lock rmat__lock--mystery" title="아직 모르는 재료 — 무엇인지는 이 포켓몬을 먼저 찾아내야 안다">❔</span>';
    return RPD.PokemonData.isHidden(id) ? '<span class="rmat__lock" title="히든 — 채팅 주문으로만 만든다">🔒</span>' : '';
  }

  /* ---------- 개체 조합식 창 ----------
   *
   * 조합식 줄의 그림을 누르면 "그 포켓몬을 만드는 법"이 뜬다.
   * 전설을 목표로 잡으면 필요한 희귀함 → 그 희귀함에 필요한 특별함 … 을
   * 계속 눌러 내려가며 계획을 세울 수 있어야 한다. 그래서 창 안의 그림도 다시 누를 수 있다. */
  var recipePopTrail = [];

  function ownedCounts() {
    var counts = {};
    RPD.StorageManager.allUnits().forEach(function (u) { counts[u.defId] = (counts[u.defId] || 0) + 1; });
    return counts;
  }

  function openRecipePop(defId, trail) {
    if (!el.recipePop) return;
    var def = RPD.PokemonData.get(defId);
    if (!def) return;
    recipePopTrail = trail || [];
    var UI = RPD.UI;
    var tier = RPD.Tiers[def.tier];
    var counts = ownedCounts();

    // 경로가 둘인 조합식(OR-조합식)은 둘 다 보여 준다
    var makes = RPD.RecipeManager.view.filter(function (v) { return v.resultId === defId; })
      .sort(function (a, b) { return a.route - b.route; });
    var makeHtml;
    if (makes.length) {
      makeHtml = makes.map(function (make, mi) {
        return (mi > 0 ? '<p class="rp__or">또는</p>' : '') +
        '<div class="rp__recipe' + (make.ready ? ' is-ready' : '') + '">' +
        groupMaterials(make.materials).map(function (m) {
          var md = RPD.PokemonData.get(m.id);
          var secret = matSecret(m.id);
          var craftable = !secret && (RPD.RecipeManager.view.some(function (v) { return v.resultId === m.id; }) ||
            RPD.PokemonData.isHidden(m.id));
          return '<button type="button" class="rp__mat ' + (m.owned ? 'is-owned' : 'is-missing') +
            (md.hidden ? ' is-hidden' : '') + '"' + (secret ? '' : ' data-go="' + m.id + '"') + ' style="--mt:' + matTierColor(m.id) +
            '" title="' + (secret ? '아직 모르는 재료' : m.name + (md.hidden ? ' — 히든: 채팅 주문으로 만든다' : ' 조합식 보기')) + '">' +
            (secret ? UI.shadow(md, 'spr--rp') : UI.sprite(md, 'spr--rp')) +
            '<span class="rp__matName">' + (secret ? '???' : m.name + (md.hidden ? ' 🔒' : '')) + (m.need > 1 ? ' ×' + m.need : '') + '</span>' +
            '<span class="rp__matN">' + matCount(m.id, counts) + '/' + m.need + '</span>' +
            (craftable ? '<span class="rp__more">' + (md.hidden ? '주문 ›' : '조합 ›') + '</span>' : '') +
          '</button>';
        }).join('<span class="rplus">+</span>') +
        '</div>' +
        (make.ready
          ? '<button type="button" class="btn btn--primary btn--block rp__craft" data-craft="' + make.key + '">★ 지금 조합하기' +
            (makes.length > 1 ? ' (경로 ' + (make.route + 1) + ')' : '') + '</button>'
          : '<p class="rp__note">부족한 재료 ' + make.missingCount + '개 — 재료를 누르면 그 재료를 만드는 법으로 내려갑니다.</p>');
      }).join('');
    } else if (def.hidden || tier.special) {
      /* 히든·불멸은 주문으로 만든다. 재료와 문구는 언제나 보여 준다
       * (발견 전에 가리는 것은 조합식 목록의 결과 그림·이름뿐이다). */
      var sp = RPD.SpellData && RPD.SpellData.forResult(defId);
      makeHtml = sp
        ? '<div class="rp__recipe">' + groupIds(sp.materials).map(function (g) {
            var md = RPD.PokemonData.get(g.id);
            var secret = matSecret(g.id);
            return '<button type="button" class="rp__mat ' + ((counts[g.id] || 0) >= g.need ? 'is-owned' : 'is-missing') +
              '"' + (secret ? '' : ' data-go="' + g.id + '"') + ' style="--mt:' + matTierColor(g.id) + '">' +
              (secret ? UI.shadow(md, 'spr--rp') : UI.sprite(md, 'spr--rp')) +
              '<span class="rp__matName">' + (secret ? '???' : md.name + (md.hidden ? ' 🔒' : '')) +
              (g.need > 1 ? ' ×' + g.need : '') + '</span>' +
              '<span class="rp__matN">' + (counts[g.id] || 0) + '/' + g.need + '</span></button>';
          }).join('<span class="rplus">+</span>') + '</div>' +
          '<p class="rp__note">🔒 조합식 목록에는 없습니다. 재료를 모아 채팅(Enter)으로 「' + sp.phrase + '」</p>'
        : '<p class="rp__note">🔒 주문으로만 만듭니다.</p>';
    } else {
      makeHtml = '<p class="rp__note">' + (tier.summonable === false
        ? '조합식이 없습니다. 조각 상점이나 보스 보상으로 얻습니다.'
        : '조합으로 만들지 않습니다. 소환으로 얻습니다.') + '</p>';
    }

    var uses = RPD.RecipeManager.view.filter(function (v) {
      return v.materials.some(function (m) { return m.id === defId; });
    }).sort(function (a, b) {
      return RPD.TIER_ORDER.indexOf(b.resultTier) - RPD.TIER_ORDER.indexOf(a.resultTier);
    });
    var usesHtml = uses.length
      ? '<div class="rp__uses">' + uses.map(function (v) {
          var rd = RPD.PokemonData.get(v.resultId);
          return '<button type="button" class="rp__use' + (v.ready ? ' is-ready' : '') + '" data-go="' + v.resultId +
            '" style="--mt:' + RPD.Tiers[rd.tier].color + '">' + UI.sprite(rd, 'spr--rpuse') +
            '<span>' + rd.name + '</span></button>';
        }).join('') + '</div>'
      : '<p class="rp__note">재료로 쓰이는 곳이 없습니다.</p>';

    el.recipePop.dataset.def = defId;
    el.recipePop.innerHTML =
      '<div class="rp__head" style="--tier:' + tier.color + '">' +
        (recipePopTrail.length ? '<button type="button" class="rp__back" data-back aria-label="뒤로">‹</button>' : '') +
        UI.sprite(def, 'spr--rphead') +
        '<div><span class="sc__tier">' + tier.label + '</span><span class="sc__name">' + def.name + '</span>' +
        '<span class="rp__own">보유 ' + (counts[defId] || 0) + '마리</span></div>' +
        '<button type="button" class="rp__close" data-close aria-label="닫기">×</button>' +
      '</div>' +
      UI.trait(defId, 'trait--pop') + UI.aura(defId, 'trait--pop') +
      '<p class="rp__label">만드는 법</p>' + makeHtml +
      '<p class="rp__label">재료로 쓰이는 곳 <span>' + uses.length + '</span></p>' + usesHtml;
    el.recipePop.hidden = false;
  }
  UIManager.openRecipePop = function (defId) { openRecipePop(defId, []); };

  function setRecipeTitle(text) {
    if (typeof document === 'undefined' || !document.querySelector) return;
    var node = document.querySelector('.pane--recipes .pane__title');
    if (!node) return;
    var icon = node.querySelector && node.querySelector('.ico');
    node.textContent = text;
    if (icon) node.insertBefore(icon, node.firstChild);
  }

  function renderShardShop() {
    setRecipeTitle('조각 상점');
    if (el.tierFilter) el.tierFilter.innerHTML = '';
    var SH = RPD.ShardManager;
    var UI = RPD.UI;
    var needed = RPD.RecipeManager.missingMaterials(1);
    var soon = RPD.RecipeManager.missingMaterials(2);

    var rows = RPD.PokemonData.all().filter(function (id) {
      var d = RPD.PokemonData.get(id);
      return !RPD.Tiers[d.tier].special && !d.hidden;   // 히든(주문 전용)·불멸·초월은 조각으로 못 산다
    }).map(function (id) {
      var def = RPD.PokemonData.get(id);
      var state = SH.checkBuy(id);
      return {
        def: def, state: state,
        need: !!needed[id], soon: !!soon[id],
        tierIdx: RPD.TIER_ORDER.indexOf(def.tier)
      };
    }).filter(function (r) {
      // 아직 열리지 않은 등급은 목록에 두되 맨 뒤로 — 무엇이 열릴지는 보여 준다
      return true;
    }).sort(function (a, b) {
      if (a.need !== b.need) return a.need ? -1 : 1;
      if (a.soon !== b.soon) return a.soon ? -1 : 1;
      if (a.state.ok !== b.state.ok) return a.state.ok ? -1 : 1;
      if (a.tierIdx !== b.tierIdx) return b.tierIdx - a.tierIdx;
      return a.state.price - b.state.price;
    });

    if (el.recipeCount) {
      var buyable = rows.filter(function (r) { return r.state.ok; }).length;
      el.recipeCount.textContent = '◆ ' + SH.shards + ' · 살 수 있는 것 ' + buyable + '종';
    }

    recipeSig = '';   // 탭을 되돌아오면 조합식을 다시 그린다

    el.recipeList.innerHTML = rows.map(function (r) {
      var t = RPD.Tiers[r.def.tier];
      var why = r.state.ok ? ''
        : r.state.reason === 'LOCKED' ? r.state.unlockRound + '라운드부터'
        : r.state.reason === 'NO_ROOM' ? '자리 없음'
        : '조각 부족';
      return '<button type="button" class="shoprow' + (r.state.ok ? ' is-buyable' : '') +
        (r.need ? ' is-need' : '') + '" data-buy="' + r.def.id + '" style="--tier:' + t.color + '"' +
        (r.state.ok ? '' : ' disabled') + '>' +
        UI.sprite(r.def, 'spr--shop') +
        '<span class="shoprow__main">' +
          '<span class="shoprow__name">' + r.def.name + '</span>' +
          '<span class="shoprow__tier">' + t.label + (r.need ? ' · 조합에 바로 필요' : (r.soon ? ' · 곧 필요' : '')) +
            (r.active ? '' : ' · 이번 판 소환 안 됨') + '</span>' +
        '</span>' +
        '<span class="shoprow__price"><span class="shoprow__gem">◆</span>' + r.state.price + '</span>' +
        (why ? '<span class="shoprow__why">' + why + '</span>' : '<span class="shoprow__why is-ok">구매</span>') +
      '</button>';
    }).join('');
  }

  function buyShard(id) {
    var r = RPD.ShardManager.buy(id);
    if (r.ok) {
      renderShardShop();
      return;
    }
    var msg = r.reason === 'NO_SHARD' ? '조각이 ' + r.price + '개 필요합니다'
      : r.reason === 'LOCKED' ? '아직 열리지 않은 등급입니다'
      : r.reason === 'NO_ROOM' ? '필드와 창고가 가득 찼습니다'
      : '살 수 없습니다';
    RPD.FxRenderer.text(RPD.VIEW.width / 2, 190, msg, '#ff8a7a', { size: 15, life: 1.2, jitter: false });
  }

  /* ---------- 창고 ---------- */

  /* 보유 포켓몬 — 필드와 창고를 합쳐 종류별로 한 칸.
   *
   * 예전 창고 탭은 개체를 한 줄씩 늘어놓아 "파이리가 몇 마리 있지?"를 세야 했다.
   * 종류별로 묶어 수량만 보여 주고, 창고에 있는 것은 칸 아래 띠로 구분한다.
   * 조합에 곧 쓰일 종은 초록 점이 붙고 앞에 온다. 누르면 배치·조합식 창이 뜬다. */
  var ownedSig = '';
  var ownedSort = 'field';   // field | tier | count | name

  /* 보유 목록 정렬 규칙.
   * 기본은 "필드 먼저" — 지금 싸우는 것과 쟁여 둔 것을 눈으로 가르는 게 우선이다.
   * 그 밖에는 목적에 따라 고른다: 등급순(무엇이 센가) · 수량순(무엇이 쌓였나) · 이름순(찾기). */
  var OWNED_SORTS = {
    field: function (a, b) {
      var af = a.g.field > 0 ? 0 : 1, bf = b.g.field > 0 ? 0 : 1;
      if (af !== bf) return af - bf;
      if (a.mat !== b.mat) return a.mat ? -1 : 1;
      if (a.tierIdx !== b.tierIdx) return b.tierIdx - a.tierIdx;
      return b.g.total - a.g.total;
    },
    tier: function (a, b) {
      if (a.tierIdx !== b.tierIdx) return b.tierIdx - a.tierIdx;
      if (a.g.total !== b.g.total) return b.g.total - a.g.total;
      return a.g.def.name.localeCompare(b.g.def.name);
    },
    type: function (a, b) {
      if (a.tierIdx !== b.tierIdx) return b.tierIdx - a.tierIdx;
      return a.g.def.name.localeCompare(b.g.def.name);
    },
    count: function (a, b) {
      if (a.g.total !== b.g.total) return b.g.total - a.g.total;
      if (a.tierIdx !== b.tierIdx) return b.tierIdx - a.tierIdx;
      return a.g.def.name.localeCompare(b.g.def.name);
    },
    name: function (a, b) { return a.g.def.name.localeCompare(b.g.def.name); }
  };

  function ownedGroups() {
    var SG = RPD.StorageManager;
    var groups = {};
    var order = [];
    function add(u, inStore) {
      var g = groups[u.defId];
      if (!g) { g = groups[u.defId] = { def: u.def, total: 0, stored: 0, field: 0 }; order.push(u.defId); }
      g.total += 1;
      if (inStore) g.stored += 1; else g.field += 1;
    }
    F.getUnits().forEach(function (u) { add(u, false); });
    SG.units.forEach(function (u) { add(u, true); });
    return { groups: groups, order: order };
  }

  function materialSet() {
    var needed = RPD.RecipeManager.missingMaterials(2);
    var usedIn = {};
    RPD.RecipeManager.view.forEach(function (v) {
      if (v.missingCount > 1) return;
      v.materials.forEach(function (m) { if (m.owned) usedIn[m.id] = true; });
    });
    return { needed: needed, usedIn: usedIn };
  }

  function renderStorage() {
    var SG = RPD.StorageManager;
    if (el.storageBadge) el.storageBadge.textContent = SG.units.length + '/' + SG.capacity;

    if (el.expandStorage) {
      var can = SG.canExpand();
      el.expandStorage.textContent = can ? '확장 ' + SG.expandCost() + 'G' : '최대';
      el.expandStorage.disabled = !can || !GM.canAfford(SG.expandCost());
    }

    if (!el.storageList) return;

    var og = ownedGroups();
    var mats = materialSet();
    var rows = og.order.map(function (id) {
      var g = og.groups[id];
      return { id: id, g: g, mat: !!mats.usedIn[id], tierIdx: RPD.tierRank(g.def.tier) };
    }).sort(OWNED_SORTS[ownedSort] || OWNED_SORTS.field);

    if (el.ownedCount) {
      var units = F.getUnits().length + SG.units.length;
      el.ownedCount.textContent = rows.length ? rows.length + '종 · ' + units + '마리' : '';
    }

    var sig = ownedSort + '#' + rows.map(function (r) {
      return r.id + r.g.field + '/' + r.g.stored + (r.mat ? 'm' : '');
    }).join('|');
    if (sig === ownedSig && el.storageList.innerHTML) return;
    ownedSig = sig;

    if (!rows.length) {
      el.storageList.innerHTML =
        '<p class="empty">아직 없습니다. 소환하면 여기에 모입니다.</p>';
      return;
    }

    if (ownedSort === 'type') {
      el.storageList.innerHTML = renderByType(rows);
      return;
    }

    el.storageList.innerHTML = rows.map(cellHtml).join('');
  }

  /* 타입별 묶어보기 — 시너지를 읽기 위한 보기.
   * 두 타입을 가진 포켓몬은 두 묶음에 모두 나온다(시너지도 양쪽에 다 센다).
   * 묶음 머리에는 필드에 올린 수와 다음 시너지 단계를 보여 준다 — 창고에 있는 것은 시너지에 안 들어간다. */
  function renderByType(rows) {
    var groups = {};
    rows.forEach(function (r) {
      (r.g.def.types || []).forEach(function (t) {
        (groups[t] = groups[t] || []).push(r);
      });
    });
    var fieldCount = {};
    F.getUnits().forEach(function (u) {
      (u.types || []).forEach(function (t) { fieldCount[t] = (fieldCount[t] || 0) + 1; });
    });
    var order = Object.keys(groups).sort(function (a, b) {
      return (fieldCount[b] || 0) - (fieldCount[a] || 0) || groups[b].length - groups[a].length;
    });
    return order.map(function (typeId) {
      var t = RPD.Types[typeId] || { label: typeId, color: '#888' };
      var tiers = RPD.Synergies[typeId];
      var on = fieldCount[typeId] || 0;
      var syn = '';
      if (tiers) {
        var next = null, cur = null;
        tiers.forEach(function (s) { if (on >= s.count) cur = s; else if (!next) next = s; });
        syn = next ? '<em>' + on + '/' + next.count + ' → ' + next.label + '</em>'
                   : '<em class="is-max">' + (cur ? cur.label : '') + '</em>';
      } else {
        syn = '<em class="is-none">시너지 없음</em>';
      }
      return '<div class="typegroup" style="--tc:' + t.color + '">' +
        '<div class="typegroup__head">' + RPD.UI.typeIcon(typeId) + '<b>' + t.label + '</b>' +
          '<span>필드 ' + on + '</span>' + syn + '</div>' +
        '<div class="typegroup__cells">' + groups[typeId].map(cellHtml).join('') + '</div>' +
      '</div>';
    }).join('');
  }

  function cellHtml(r) {
      var t = RPD.Tiers[r.g.def.tier];
      return '<button type="button" class="scell' + (r.mat ? ' is-material' : '') +
        (r.g.stored ? ' has-stored' : '') + (r.g.field ? '' : ' is-storedOnly') +
        '" data-def="' + r.id + '" style="--tier:' + t.color +
        '" title="' + r.g.def.name + ' · ' + t.label +
        (r.g.stored ? ' · 창고 ' + r.g.stored : '') + (r.mat ? ' · 조합 재료' : '') + '">' +
        RPD.UI.sprite(r.g.def, 'spr--cell') +
        '<span class="scell__n">' + r.g.total + '</span>' +
        (r.g.stored ? '<span class="scell__store">창고 ' + r.g.stored + '</span>' : '') +
      '</button>';
  }

  function openOwnedPop(defId, anchor) {
    if (!el.ownedPop) return;
    var def = RPD.PokemonData.get(defId);
    if (!def) return;
    var og = ownedGroups();
    var g = og.groups[defId] || { total: 0, stored: 0, field: 0 };
    var tier = RPD.Tiers[def.tier];
    var UI = RPD.UI;

    /* 이 개체가 재료로 들어가는 조합식. 결과 이름만 보여 주면
     * "그래서 뭘 더 모아야 하지?"에 답이 안 된다 — 재료를 전부 편다. */
    var uses = recipesUsing(defId).map(function (v) {
      var res = RPD.PokemonData.get(v.resultId);
      var mats = groupMaterials(v.materials).map(function (g) {
        var mdef = RPD.PokemonData.get(g.id);
        var secret = matSecret(g.id) && g.id !== defId;   // 지금 보고 있는 그 재료 자신은 안 가린다
        return '<span class="opmat ' + (g.owned ? 'is-owned' : 'is-missing') +
          (g.id === defId ? ' is-self' : '') + '" style="--mt:' + matTierColor(g.id) +
          '" title="' + (secret ? '아직 모르는 재료' : g.name + (mdef.hidden ? ' 🔒' : '')) + (g.need > 1 ? ' ×' + g.need : '') + '">' +
          (secret ? UI.shadow(mdef, 'spr--opmat') : UI.sprite(mdef, 'spr--opmat')) +
          (g.need > 1 ? '<em class="opmat__x">×' + g.need + '</em>' : '') + '</span>';
      }).join('<i>+</i>');
      return '<li class="' + (v.ready ? 'is-ready' : '') + '">' +
        '<span class="op__mats">' + mats + '</span>' +
        '<span class="op__arrow" aria-hidden="true">→</span>' +
        '<span class="op__to" style="--tier:' + RPD.Tiers[res.tier].color + '">' + res.name + '</span>' +
        '<span class="op__have">' + (v.ready ? '완성 가능' : v.haveCount + '/' + v.materials.length) + '</span>' +
      '</li>';
    }).join('');

    el.ownedPop.dataset.def = defId;
    el.ownedPop.innerHTML =
      '<button type="button" class="op__close" data-act="close" aria-label="닫기">×</button>' +
      '<div class="op__head" style="--tier:' + tier.color + '">' + UI.sprite(def, 'spr--pop') +
        '<div><span class="sc__tier">' + tier.label + ' · ' + def.roleLabel + '</span>' +
        '<span class="sc__name">' + def.name + '</span>' +
        '<span class="typerow">' + def.types.map(function (id) {
          var t = RPD.Types[id]; return t ? '<span class="typechip" style="--tc:' + t.color + '">' + UI.typeIcon(id) + t.label + '</span>' : '';
        }).join('') + '</span></div></div>' +
      UI.trait(defId, 'trait--pop') + UI.aura(defId, 'trait--pop') +
      '<div class="op__counts"><span>필드 <b>' + g.field + '</b></span><span>창고 <b>' + g.stored + '</b></span></div>' +
      '<div class="op__acts">' +
        '<button type="button" class="btn btn--primary" data-act="deploy"' + (g.stored ? '' : ' disabled') + '>필드에 배치</button>' +
        '<button type="button" class="btn btn--ghost" data-act="select"' + (g.field ? '' : ' disabled') + '>필드에서 보기</button>' +
        '<button type="button" class="btn btn--danger" data-act="sell"' + (g.stored ? '' : ' disabled') + '>창고에서 방출' +
          (g.stored ? ' <b>+' + RPD.EconomyManager.sellValue(storedUnitOf(defId)) + 'G</b>' : '') + '</button>' +
      '</div>' +
      (uses ? '<p class="op__label">재료로 쓰이는 조합식 <span>아래 조합식 목록도 이 개체로 좁혀졌습니다</span></p>' +
              '<ul class="op__uses">' + uses + '</ul>'
            : '<p class="op__label">재료로 쓰이는 조합식이 없습니다</p>');
    el.ownedPop.hidden = false;

    // 아래 조합식 패널도 이 개체가 들어가는 것만 보여 준다
    if (uses) setSpeciesFilter(defId);
  }

  function storedUnitOf(defId) {
    var i = RPD.StorageManager.indexOfSpecies(defId);
    return i >= 0 ? RPD.StorageManager.units[i] : null;
  }

  function recipesUsing(defId) {
    return RPD.RecipeManager.view.filter(function (v) {
      for (var i = 0; i < v.materials.length; i++) if (v.materials[i].id === defId) return true;
      return false;
    }).map(function (v) {
      var have = 0;
      for (var i = 0; i < v.materials.length; i++) if (v.materials[i].owned) have += 1;
      v.haveCount = have;
      return v;
    });
  }

  function closeOwnedPop() {
    if (el.ownedPop) el.ownedPop.hidden = true;
  }

  /* ---------- 조합식 ---------- */

  var recipeFilter = 'all';
  var recipeTier = 'ALL';        // 결과 등급으로 좁히기
  var recipeSpecies = null;      // 특정 개체가 재료로 들어가는 것만
  var recipeSig = '';

  /* 등급 칩과 "이 개체가 들어가는 조합식" 칩. 조합식이 39개라
   * 한 줄로 늘어놓으면 "전설만 보고 싶다"가 불가능하다. */
  function renderTierFilter() {
    if (!el.tierFilter) return;
    var counts = {};
    RPD.RecipeManager.view.forEach(function (v) {
      counts[v.resultTier] = (counts[v.resultTier] || 0) + 1;
    });
    var hiddenCount = RPD.SpellData ? RPD.SpellData.list.filter(function (sp) {
      return sp.kind === 'hidden' && RPD.SaveManager.knowsSpell && RPD.SaveManager.knowsSpell(sp.id);
    }).length : 0;
    var chips = ['ALL'].concat(RPD.TIER_ORDER.slice(1)).concat(['HIDDEN']).map(function (id) {
      if (id === 'ALL') {
        return '<button type="button" class="tchip' + (recipeTier === 'ALL' ? ' is-on' : '') +
          '" data-tier="ALL">전체</button>';
      }
      if (id === 'HIDDEN') {
        // 히든은 안흔함/희귀함 등으로 쪼개지 않는다 — 발견한 히든을 전부 여기 한 칸에 모은다
        return '<button type="button" class="tchip tchip--hidden' + (recipeTier === 'HIDDEN' ? ' is-on' : '') +
          '" data-tier="HIDDEN" style="--tier:#2ee6c6">🔒 히든<b>' + hiddenCount + '</b></button>';
      }
      var t = RPD.Tiers[id];
      return '<button type="button" class="tchip' + (recipeTier === id ? ' is-on' : '') +
        '" data-tier="' + id + '" style="--tier:' + t.color + '">' + t.label +
        '<b>' + (counts[id] || 0) + '</b></button>';
    }).join('');

    var species = '';
    if (recipeSpecies) {
      var def = RPD.PokemonData.get(recipeSpecies);
      species = '<button type="button" class="tchip tchip--species is-on" data-tier="CLEAR">' +
        (def ? def.name : '') + ' 재료 조합식 <i>×</i></button>';
    }
    el.tierFilter.innerHTML = chips + species;
  }

  function setSpeciesFilter(defId) {
    recipeSpecies = defId;
    recipeTier = 'ALL';
    recipeSig = '';
    renderRecipes();
  }

  /* 조합식 한 줄 = [재료] + [재료] → [결과].
   * 재료마다 보유 수를 붙이고, 없는 재료만 흐리게+빨간 테두리로 강조한다.
   * 아직 만든 적 없는 결과는 그림도 이름도 가린다(발견의 재미). */
  function renderRecipes(list) {
    list = list || RPD.RecipeManager.view;

    var ready = list.filter(function (v) { return v.ready; });

    if (el.craftBadge) {
      el.craftBadge.hidden = ready.length === 0;
      el.craftBadge.textContent = ready.length;
    }
    if (el.craft) {
      el.craft.disabled = !GM.isPlayable() || ready.length === 0;
      el.craft.classList.toggle('is-ready', ready.length > 0);
      if (el.craftHint) el.craftHint.textContent = ready.length ? ready[0].resultName : '—';
    }

    if (!el.recipeList) return;

    if (recipeFilter === 'shards') { renderShardShop(); return; }
    setRecipeTitle('조합식');

    renderTierFilter();

    var ownedNow = {};
    RPD.StorageManager.allUnits().forEach(function (u) { ownedNow[u.defId] = (ownedNow[u.defId] || 0) + 1; });
    var all = list.concat(spellViews(ownedNow));

    var shown;
    if (recipeFilter === 'ready') shown = all.filter(function (v) { return v.ready; });
    else if (recipeFilter === 'pending') shown = all.filter(function (v) { return !v.ready; });
    else shown = all;

    /* 히든은 등급 칩과 구분되는 별도 칸 — "히든 안흔함" "히든 희귀함" 으로 안 쪼갠다.
     * 등급 칩(안흔함~전설)을 고르면 히든은 안 보이고, [히든] 칩에서만 전부 모여 보인다. */
    if (recipeTier === 'HIDDEN') shown = shown.filter(function (v) { return v.isHidden; });
    else if (recipeTier !== 'ALL') shown = shown.filter(function (v) { return v.resultTier === recipeTier && !v.isHidden; });
    if (recipeSpecies) {
      shown = shown.filter(function (v) {
        for (var i = 0; i < v.materials.length; i++) {
          if (v.materials[i].id === recipeSpecies) return true;
        }
        return false;
      });
    }

    /* 등급 순으로 묶는다(전설 → 흔함). 같은 등급 안에서는 완성 가능한 것이 위로.
     * 예전에는 완성 가능 순으로만 섞여 있어 "전설 조합식만 보고 싶다"가 안 됐다. */
    shown = shown.slice().sort(function (a, b) {
      var at = RPD.tierRank(a.resultTier), bt = RPD.tierRank(b.resultTier);
      if (at !== bt) return bt - at;
      if (a.ready !== b.ready) return a.ready ? -1 : 1;
      if (!!a.spell !== !!b.spell) return a.spell ? 1 : -1;      // 같은 등급이면 조합식 먼저
      if (a.missingCount !== b.missingCount) return a.missingCount - b.missingCount;
      return a.resultName.localeCompare(b.resultName);
    });

    if (el.recipeCount) {
      el.recipeCount.textContent = ready.length ? '완성 가능 ' + ready.length : (list.length ? list.length + '개' : '');
    }

    var counts = {};
    RPD.StorageManager.allUnits().forEach(function (u) { counts[u.defId] = (counts[u.defId] || 0) + 1; });

    /* 재료 보유 수만으로는 부족하다 — 히든 재료 하나를 "막 발견"해도 보유 수는 그대로일 수 있어서,
     * 발견 여부(matSecret)를 서명에 넣지 않으면 방금 드러난 이름·그림을 다시 안 그려서 계속 가려 보인다. */
    var sig = recipeFilter + recipeTier + recipeSpecies + GM.isPlayable() + '#' + shown.map(function (v) {
      return v.key + (v.ready ? 'R' : '') + (v.discovered ? 'D' : '') + (v.spell ? 'S' : '') +
        v.materials.map(function (m) { return (counts[m.id] || 0) + (matSecret(m.id) ? 'u' : 'k'); }).join(',');
    }).join('|');
    if (sig === recipeSig && el.recipeList.innerHTML) return;
    recipeSig = sig;

    if (!shown.length) {
      el.recipeList.innerHTML = '<p class="empty">' +
        (recipeSpecies ? '이 개체가 재료로 들어가는 조합식이 없습니다.'
          : recipeTier === 'HIDDEN' ? '아직 발견한 히든이 없습니다. 채팅(Enter)으로 주문을 외쳐 보세요.'
          : recipeTier !== 'ALL' ? RPD.Tiers[recipeTier].label + ' 조합식이 여기에 없습니다.'
          : recipeFilter === 'ready' ? '지금 완성할 수 있는 조합식이 없습니다. 미완성 탭에서 부족한 재료를 확인하세요.'
          : '아직 공개된 조합식이 없습니다.') + '</p>';
      return;
    }

    var UI = RPD.UI;
    el.recipeList.innerHTML = shown.map(function (v) {
      if (v.spell) return spellRowHtml(v, counts);
      var tierInfo = RPD.Tiers[v.resultTier];
      var have = 0;
      v.materials.forEach(function (m) { if (m.owned) have += 1; });
      var mats = groupMaterials(v.materials).map(function (g) {
        var def = RPD.PokemonData.get(g.id);
        var c = matCount(g.id, counts);
        var ditto = v.materials.some(function (m) { return m.id === g.id && m.viaDitto; });
        var secret = matSecret(g.id);
        return '<span class="rmat ' + (g.owned ? 'is-owned' : 'is-missing') + (g.need > 1 ? ' is-multi' : '') +
          (ditto ? ' is-ditto' : '') + (def.hidden ? ' is-hidden' : '') +
          '"' + (secret ? '' : ' data-def="' + g.id + '"') + ' style="--mt:' + matTierColor(g.id) + '" title="' +
          (secret ? '아직 모르는 재료 — 무엇인지는 먼저 만들어 봐야 안다' : g.name + (def.hidden ? ' 🔒 히든(주문으로 만든다)' : '')) +
          (g.need > 1 ? ' ×' + g.need : '') + ' — ' + c + '마리 보유' + (secret ? '' : ' · 누르면 조합식') + '">' +
          (secret ? UI.shadow(def, 'spr--mat') : UI.sprite(def, 'spr--mat')) + lockTag(g.id) +
          (g.need > 1 ? '<span class="rmat__x">×' + g.need + '</span>' : '') +
          (ditto ? '<span class="rmat__ditto" title="메타몽이 대신합니다">메타몽</span>' : '') +
          '<span class="rmat__n">' + Math.min(c, 99) + '<small>/' + g.need + '</small></span>' +
          '<span class="rmat__name">' + (secret ? '???' : g.name) + '</span>' +
        '</span>';
      }).join('<span class="rplus">+</span>');

      /* 결과를 가리지 않는다.
       * 랜덤 디펜스는 "어떤 전설을 향해 갈지" 정하고 그쪽으로 재료를 모으는 게임인데,
       * 목적지가 ??? 면 계획 자체가 불가능하다. 발견의 재미는 첫 조합 연출이 맡는다. */
      var resDef = RPD.PokemonData.get(v.resultId);
      var result = UI.sprite(resDef, 'spr--res') +
        '<span class="rres__name' + (v.discovered ? '' : ' is-new') + '">' + v.resultName + '</span>';

      return '<button type="button" class="rrow' + (v.ready ? ' is-ready' : '') +
        '" data-result="' + v.resultId + '" data-key="' + v.key + '" style="--tier:' + tierInfo.color + '">' +
        '<span class="rrow__mats">' + mats + '</span>' +
        '<span class="rrow__arrow" aria-hidden="true"></span>' +
        '<span class="rres" data-def="' + v.resultId + '" title="누르면 조합식">' + result +
          '<span class="rres__tier">' + tierInfo.label + '</span>' +
          (v.routeCount > 1 ? '<span class="rres__route" title="같은 결과를 다른 재료로도 만들 수 있다">경로 ' + (v.route + 1) + '</span>' : '') +
        '</span>' +
        '<span class="rrow__state">' +
          (v.ready ? '<span class="rready">★ 조합 가능!</span>' : '<span class="rprog"><b>' + have + '</b>/' + v.materials.length + '</span>') +
        '</span>' +
      '</button>';
    }).join('');
  }

  /* 필드 조합식의 히든 줄 — 여기 뜨는 건 전부 이미 발견한 것이다(spellViews 가 미발견을 거른다).
   * 그래도 재료 쪽에 "다른" 미발견 히든이 끼어 있을 수 있어(예: 상위 히든이 하위 히든을 재료로 쓸 때)
   * 그 재료만은 여전히 그림자로 가린다. */
  function spellRowHtml(v, counts) {
    var UI = RPD.UI, sp = v.spell, def = RPD.PokemonData.get(v.resultId);
    var tierInfo = RPD.Tiers[v.resultTier];
    var have = v.materials.filter(function (m) { return m.owned; }).length;
    var mats = groupMaterials(v.materials).map(function (g) {
      var md = RPD.PokemonData.get(g.id), c = counts[g.id] || 0;
      var secret = matSecret(g.id);
      return '<span class="rmat ' + (g.owned ? 'is-owned' : 'is-missing') + (g.need > 1 ? ' is-multi' : '') +
        (md.hidden ? ' is-hidden' : '') + '"' + (secret ? '' : ' data-def="' + g.id + '"') + ' style="--mt:' + matTierColor(g.id) +
        '" title="' + (secret ? '아직 모르는 재료' : g.name + (g.need > 1 ? ' ×' + g.need : '')) + ' — ' + c + '마리 보유' + (secret ? '' : ' · 누르면 조합식') + '">' +
        (secret ? UI.shadow(md, 'spr--mat') : UI.sprite(md, 'spr--mat')) + lockTag(g.id) +
        (g.need > 1 ? '<span class="rmat__x">×' + g.need + '</span>' : '') +
        '<span class="rmat__n">' + Math.min(c, 99) + '<small>/' + g.need + '</small></span>' +
        '<span class="rmat__name">' + (secret ? '???' : g.name) + '</span></span>';
    }).join('<span class="rplus">+</span>');
    var result = '<span class="rres" data-def="' + v.resultId + '" title="누르면 조합식">' + UI.sprite(def, 'spr--res') +
        '<span class="rres__name">' + def.name + '</span>';
    var kind = '🔒 히든';
    return '<button type="button" class="rrow rrow--spell' + (v.ready ? ' is-ready' : '') +
      '" data-spell="' + sp.id + '" style="--tier:' + tierInfo.color + '">' +
      '<span class="rrow__mats">' + mats + '</span>' +
      '<span class="rrow__arrow" aria-hidden="true"></span>' +
      result + '<span class="rres__tier">' + tierInfo.label + '</span>' +
        '<span class="rres__route">' + kind + '</span></span>' +
      '<span class="rrow__state">' +
        '<span class="rspell" title="주문 「' + sp.phrase + '」 — 채팅으로 직접 외쳐도 된다">「' + sp.phrase + '」</span>' +
        (v.ready ? '<span class="rready">★ 조합 가능!</span>' : '<span class="rprog"><b>' + have + '</b>/' + v.materials.length + '</span>') +
      '</span>' +
    '</button>';
  }

  function onCrafted(p) {
    var tierInfo = RPD.Tiers[p.tier] || RPD.Tiers.T1;
    var u = p.unit;

    RPD.FxRenderer.ring(u.x, u.y, tierInfo.color, 56, 0.8);
    RPD.FxRenderer.text(u.x, u.y - 30, u.name, tierInfo.color,
      { size: 17, life: 1.2, jitter: false });

    // 처음 만든 결과물과 상위 등급만 크게 알린다
    var big = p.firstTime || RPD.TIER_ORDER.indexOf(p.tier) >= 2;
    if (big && el.reveal) {
      el.revealRarity.textContent = p.firstTime ? '새 조합 발견' : '조합 완성';
      el.revealRarity.style.color = tierInfo.color;
      el.revealName.textContent = u.name;
      if (el.revealArt) el.revealArt.innerHTML = RPD.UI.sprite(u.def, 'spr--reveal');
      el.reveal.style.setProperty && el.reveal.style.setProperty('--tier', tierInfo.color);
      el.revealRole.textContent = tierInfo.label + ' · ' + (u.roleLabel || '');
      el.reveal.style.borderColor = tierInfo.color;
      el.reveal.classList.remove('is-on');
      void el.reveal.offsetWidth;
      el.reveal.classList.add('is-on');
      RPD.FxRenderer.flash(tierInfo.color, 0.22);
    }
    renderSlotPanel({ slot: F.getSelected() });
    refreshActionButtons();
  }

  function renderShards(n) {
    if (el.shardCount) el.shardCount.textContent = (n === undefined ? RPD.ShardManager.shards : n);
  }

  /* ---------- 도감 ---------- */

  function showDex() {
    if (!el.dex) return;
    var SV = RPD.SaveManager;
    var total = SV.dexTotal(), have = SV.dexCount();

    if (el.dexCount) el.dexCount.textContent = have + ' / ' + total;

    if (el.dexBonus) {
      var cur = RPD.DexBonus ? RPD.DexBonus.activeFor(have) : [];
      var next = RPD.DexBonus ? RPD.DexBonus.nextFor(have) : null;
      el.dexBonus.innerHTML =
        (cur.length
          ? cur.map(function (b) {
              return '<div class="dex__bonusRow"><span>' + b.label + '</span><strong>적용 중</strong></div>';
            }).join('')
          : '<div class="dex__bonusRow"><span>아직 보너스가 없습니다</span></div>') +
        (next
          ? '<div class="dex__bonusRow is-next"><span>' + next.at + '종 등록 → ' + next.label +
            '</span><span>' + (next.at - have) + '종 남음</span></div>'
          : '');
    }

    if (el.dexGrid) {
      el.dexGrid.innerHTML = RPD.ALL_TIERS.map(function (t) {
        return RPD.PokemonData.ofTier(t).map(function (id) {
          var def = RPD.PokemonData.byId[id];
          var seen = SV.hasSeen(id);
          return '<div class="dexcell' + (seen ? '' : ' is-locked') + '" style="--tier:' + RPD.Tiers[t].color + '">' +
            RPD.UI.sprite(def, 'spr--dex') +
            '<span class="dexcell__name">' + (seen ? def.name : '???') + '</span>' +
          '</div>';
        }).join('');
      }).join('');
    }

    el.dex.hidden = false;
    RPD.Loop.setPaused(true);
  }

  function hideDex() {
    if (!el.dex) return;
    el.dex.hidden = true;
    if (GM.isPlayable()) RPD.Loop.setPaused(false);
  }

  function shakeSummon(reason) {
    var msg = (reason === 'NO_SLOT' || reason === 'NO_ROOM') ? '필드와 창고가 가득 찼습니다. 하나를 방출하세요.'
            : reason === 'NO_GOLD' ? '골드가 부족합니다.'
            : '소환할 수 없습니다.';
    RPD.FxRenderer.text(RPD.VIEW.width / 2, 190, msg, '#ff8a7a',
      { size: 15, life: 1.2, jitter: false });
  }

  function renderSummonPanel() {
    if (!el.summonBody) return;

    var st = RPD.SummonManager.state();
    var order = RPD.TIER_ORDER;

    var odds = order.map(function (id) {
      var r = RPD.Tiers[id];
      var pct = st.odds[id] || 0;
      var boosted = pct > RPD.TiersTable.base[id] + 0.05;
      return '<div class="odds__row' + (boosted ? ' is-boosted' : '') + '">' +
        '<span class="odds__dot" style="background:' + r.color + '"></span>' +
        '<span class="odds__label">' + r.label + '</span>' +
        '<span class="odds__value">' + pct.toFixed(1) + '%</span>' +
      '</div>';
    }).join('');

    var epicLeft = Math.max(0, RPD.TiersTable.hardPityEpic - st.sinceEpic);
    var legLeft = Math.max(0, RPD.TiersTable.hardPityLegendary - st.sinceLegendary);
    var epicPct = (st.sinceEpic / RPD.TiersTable.hardPityEpic) * 100;

    el.summonBody.innerHTML =
      '<div class="odds">' + odds + '</div>' +
      '<div class="pity">' +
        '<div>에픽 확정까지 ' + epicLeft + '회</div>' +
        '<div class="pity__bar"><div class="pity__fill" style="width:' +
          Math.min(100, epicPct) + '%"></div></div>' +
        '<div>전설 확정까지 ' + legLeft + '회</div>' +
        (st.tickets > 0 ? '<div>특별 소환권 ' + st.tickets + '장</div>' : '') +
      '</div>';
  }

  function onSummonResult(r) {
    if (!r.ok) return;
    refreshActionButtons();
    

    var tier = RPD.Tiers[r.tier] || RPD.Tiers.T1;
    var order = RPD.TIER_ORDER.indexOf(r.tier);

    // 에픽 이상만 크게 연출한다. 매번 터뜨리면 정작 좋은 게 나와도 감흥이 없다.
    if (order >= 2 && el.reveal) {
      el.revealRarity.textContent = tier.label;
      el.revealRarity.style.color = tier.color;
      el.revealName.textContent = r.unit.name;
      if (el.revealArt) el.revealArt.innerHTML = RPD.UI.sprite(r.unit.def, 'spr--reveal');
      el.reveal.style.setProperty && el.reveal.style.setProperty('--tier', tier.color);
      el.revealRole.textContent = r.unit.roleLabel || r.unit.role;
      el.reveal.style.borderColor = tier.color;
      el.reveal.classList.remove('is-on');
      void el.reveal.offsetWidth;
      el.reveal.classList.add('is-on');
      RPD.FxRenderer.flash(tier.color, order >= 3 ? 0.3 : 0.16);
    } else {
      RPD.FxRenderer.text(r.unit.x, r.unit.y - 26, r.unit.name, tier.color,
        { size: 13, life: 0.9, jitter: false });
    }
  }

  /* ---------- 배너 / 결과 ---------- */

  UIManager.showBanner = function (text, isBoss) {
    if (!el.banner) return;
    el.banner.textContent = text;
    el.banner.classList.toggle('is-boss', !!isBoss);
    el.banner.classList.remove('is-on');
    void el.banner.offsetWidth;   // 리플로우 강제 — 연속 호출 시에도 애니메이션이 다시 돈다
    el.banner.classList.add('is-on');

    if (bannerTimer) clearTimeout(bannerTimer);
    bannerTimer = setTimeout(function () { el.banner.classList.remove('is-on'); }, 1600);
  };

  function showResult(win) {
    if (!el.result) return;
    var s = RPD.StatsManager.summary();
    var card = el.result.querySelector('.result__card');

    if (card) card.classList.toggle('is-win', win);
    if (el.resultKicker) el.resultKicker.textContent = win ? '클리어' : '게임 오버';
    if (el.resultTitle) {
      el.resultTitle.textContent = win
        ? '웨이브 ' + s.wave + '까지 지켜냈습니다'
        : '웨이브 ' + s.wave + '에서 멈췄습니다';
    }

    if (el.resultStats) {
      var rows = [
        ['도달 웨이브', s.wave],
        ['처치한 적', s.kills + '체'],
        ['놓친 적', s.leaks + '체'],
        ['보스 처치', s.bossKills + '체'],
        ['획득 골드', U.formatNumber(s.goldEarned)],
        ['누적 피해', U.formatNumber(s.damageDealt)],
        ['플레이 시간', U.formatTime(s.elapsed)]
      ];
      el.resultStats.innerHTML = rows.map(function (r) {
        return '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>';
      }).join('');
    }

    if (el.resultBest) {
      var rec = RPD.SaveManager.recordFor(GM.mode.recordKey || GM.mode.id);
      var isBest = rec && rec.wave === s.wave && Math.abs(rec.elapsed - Math.round(s.elapsed)) < 2;
      el.resultBest.hidden = !isBest;
      if (isBest) {
        el.resultBest.textContent = GM.mode.label + ' 신기록 · 웨이브 ' + rec.wave;
      }
    }

    if (el.resultNote) {
      var top = RPD.UnitManager.topDamage();
      el.resultNote.textContent = top
        ? '최고 피해: ' + top.name + ' ' + U.formatNumber(top.totalDamage) +
          ' · 도감 ' + RPD.SaveManager.dexCount() + '/' + RPD.SaveManager.dexTotal()
        : '도감 ' + RPD.SaveManager.dexCount() + '/' + RPD.SaveManager.dexTotal();
    }

    renderClearNote(win);
    el.result.hidden = false;
  }

  /* 클리어 횟수 · 칭호 — 기록이 저장된 뒤(progress:cleared) 채워진다 */
  var lastProgress = null;
  function renderClearNote(win) {
    if (!el.resultTrainer) return;
    var PM = RPD.ProgressManager;
    if (!win || !PM) { el.resultTrainer.hidden = true; return; }
    var p = lastProgress || { clears: PM.clears(), title: PM.title(), next: PM.next() };
    var html = '<span class="rt__count">통산 ' + p.clears + '번째 클리어 · ' +
      RPD.SaveManager.clearsFor(GM.mode.recordKey || GM.mode.id) + '번째 ' + GM.mode.label + '</span>';
    if (p.newTitle) {
      html += '<span class="rt__new">새 칭호 <b>' + p.newTitle.name + '</b> · 다음 판부터 ' + p.newTitle.desc + '</span>';
    }
    if (p.special) html += '<span class="rt__new">🏅 <b>' + p.special.name + '</b> 획득</span>';
    if (p.next) html += '<span class="rt__next">' + p.next.name + '까지 ' + (p.next.clears - p.clears) + '회</span>';
    el.resultTrainer.innerHTML = html;
    el.resultTrainer.hidden = false;
  }

  UIManager.devHitEnabled = function () { return devHitMode; };

  RPD.UIManager = UIManager;
})(typeof window !== 'undefined' ? window : globalThis);
