/* main.js — 부트스트랩.
 * 모든 조립은 여기서만 한다. 시스템끼리는 서로를 직접 부르지 않는다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;
  var GM = RPD.GameManager;
  var S = RPD.GameState;

  var Game = {};

  var booted = false;

  Game.boot = function () {
    /* 두 번 부팅되면 EventBus 핸들러가 겹쳐 등록되어 처치 보상이 두 배로 들어온다.
     * 정상 경로에서는 한 번만 불리지만, 값이 조용히 틀어지는 종류의 사고라 막아 둔다. */
    if (booted) {
      console.warn('[RPD] boot() 가 이미 실행됐습니다. 두 번째 호출은 무시합니다.');
      return;
    }
    booted = true;

    var canvas = document.getElementById('gameCanvas');
    if (!canvas) { console.error('[RPD] 캔버스를 찾지 못했습니다.'); return; }

    RPD.FieldManager.init();
    RPD.EconomyManager.init();
    RPD.GoldShopManager.init();
    RPD.EliteManager.init();
    RPD.StatsManager.init();
    RPD.SynergyManager.reset();
    RPD.UnitManager.init();
    RPD.SummonManager.init();
    RPD.CombatManager.init();
    RPD.SkillManager.init();
    RPD.TraitManager.init();
    RPD.RecipeManager.init();
    RPD.ShardManager.init();
    RPD.RewardManager.init();
    RPD.BossManager.init();
    RPD.SaveManager.init();
    RPD.ProgressManager.init();
    RPD.SpellManager.init();
    RPD.AudioManager.init();
    RPD.FxRenderer.init();
    RPD.UnitRenderer.init();
    if (RPD.AttackFx) RPD.AttackFx.init();

    if (RPD.FramePacer) RPD.FramePacer.init();
    RPD.Renderer.init(canvas);
    RPD.MapRenderer.init();
    RPD.UIManager.init();
    if (RPD.RecipeBook) RPD.RecipeBook.init();
    if (RPD.GoldShopUI) RPD.GoldShopUI.init();
    if (RPD.EliteUI) RPD.EliteUI.init();
    if (RPD.SpellUI) RPD.SpellUI.init();
    if (RPD.HudPanels) RPD.HudPanels.init();

    registerLayers();
    registerUpdates();

    Game.resetAll('NORMAL');
    // 저장해 둔 배속을 복원한다. 매번 다시 누르게 하면 안 된다.
    // 1배속 기본은 너무 느리다. 저장된 설정이 없으면 2배속으로 시작한다.
    RPD.Loop.setSpeed(RPD.SaveManager.getSetting('speed', 2));
    RPD.Loop.start();
    // 홈 화면 앱(모바일 ③) — 인터넷 주소로 열었을 때만 오프라인 저장 · 설치. 게임 화면이 뜬 다음에 돈다
    if (RPD.Pwa) RPD.Pwa.start();

    console.log('[RPD] v' + RPD.VERSION + ' 준비 완료 · 슬롯 ' +
                RPD.FieldManager.slots.length + '칸 · 경로 ' +
                Math.round(RPD.MapData.path.length) + 'px · 적 ' +
                RPD.EnemyData.list.length + '종 · 포켓몬 ' +
                RPD.PokemonData.all().length + '종');
  };

  function registerLayers() {
    var L = RPD.Renderer.LAYER;
    RPD.Renderer.addLayer(L.BACKGROUND, function (ctx) { RPD.MapRenderer.drawBackground(ctx); });
    RPD.Renderer.addLayer(L.SLOTS, function (ctx) { RPD.MapRenderer.drawSlots(ctx); });
    RPD.Renderer.addLayer(L.RANGE, function (ctx) { RPD.MapRenderer.drawRange(ctx); });
    RPD.Renderer.addLayer(L.ENEMIES, function (ctx) { RPD.EnemyRenderer.draw(ctx); });
    RPD.Renderer.addLayer(L.UNITS, function (ctx) { RPD.UnitRenderer.draw(ctx); });
    RPD.Renderer.addLayer(L.PROJECTILES, function (ctx) { RPD.UnitRenderer.drawAttacks(ctx); });
    // 포켓몬별 공격 연출 — 적 위, 데미지 숫자 아래
    if (RPD.AttackFx) RPD.Renderer.addLayer(L.PROJECTILES + 1, function (ctx) { RPD.AttackFx.draw(ctx); });
    RPD.Renderer.addLayer(L.FX, function (ctx) { RPD.FxRenderer.draw(ctx); });
    RPD.Renderer.addLayer(L.OVERLAY, function (ctx) { RPD.EnemyRenderer.drawBossBar(ctx); });
  }

  var clockAcc = 0;

  function registerUpdates() {
    RPD.Loop.onUpdate(function (dt) {
      GM.update(dt);
      if (GM.state === S.RUNNING) {
        RPD.WaveManager.update(dt);
        RPD.EnemyManager.update(dt);
        // 적이 움직인 다음에 때린다. 순서가 반대면 한 프레임 전 위치를 쏘게 된다.
        RPD.CombatManager.update(dt);
        RPD.SkillManager.update(dt);
        RPD.BossManager.update(dt);
      }
      RPD.FxRenderer.update(dt);
      RPD.UnitRenderer.update(dt);
      if (RPD.AttackFx) RPD.AttackFx.update(dt);
    });

    RPD.Loop.onRender(function (dt) {
      // 쉬는 동안 · 가려졌을 때는 덜 그리고, 느린 휴대폰은 화질을 내린다(FramePacer). 게임 시간은 위 update 가 그대로 간다
      var drawDt = RPD.FramePacer ? RPD.FramePacer.tick(dt) : dt;
      if (drawDt) RPD.Renderer.render(drawDt);
      clockAcc += dt;
      if (clockAcc >= 0.25) { clockAcc = 0; RPD.UIManager.refreshClock(); }
    });
  }

  Game.resetAll = function (modeId, diffId) {
    RPD.EnemyManager.reset();
    RPD.WaveManager.reset();
    RPD.EconomyManager.reset();
    RPD.StatsManager.reset();
    RPD.SummonManager.reset();
    RPD.CombatManager.reset();
    RPD.SkillManager.reset();
    RPD.TraitManager.reset();
    RPD.RewardManager.reset();
    RPD.RecipeManager.reset();
    RPD.ShardManager.reset();
    RPD.StorageManager.reset();
    RPD.BossManager.reset();
    RPD.SynergyManager.reset();
    RPD.FxRenderer.reset();
    RPD.UnitRenderer.reset();
    if (RPD.AttackFx) RPD.AttackFx.reset();
    RPD.FieldManager.init();
    RPD.Loop.setPaused(false);
    GM.reset(modeId, diffId);
    // 클리어 횟수에 따른 시작 보너스(칭호)
    if (RPD.ProgressManager) RPD.ProgressManager.applyStartBonus();
    RPD.UIManager.refreshAll();
  };

  Game.startRun = function (modeId, diffId) {
    if (GM.isPlayable()) return;
    var target = (modeId && RPD.Modes[modeId]) ? modeId : GM.mode.id;
    var diff = diffId || (target === GM.mode.id ? GM.mode.difficulty : 'NORMAL');
    // 모드·난이도가 바뀌거나 지난 판이 끝났으면 처음부터 다시 세운다
    if (target !== GM.mode.id || diff !== GM.mode.difficulty ||
        GM.state === S.GAMEOVER || GM.state === S.VICTORY) {
      Game.resetAll(target, diff);
    }
    RPD.WaveManager.begin();
  };

  Game.restart = function () {
    Game.resetAll(GM.mode.id, GM.mode.difficulty);
  };

  RPD.Game = Game;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', Game.boot);
  } else {
    Game.boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
