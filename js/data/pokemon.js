/* pokemon.js — 1세대 151종 + 왕구리 = 152종 (조합식 개편 v2).
 *
 * 얻는 법은 두 칸으로 적는다 — 등급과는 따로다.
 *   summon:true  소환(과 라운드 무료 지급)으로 나온다. 흔함 15 · 안흔함 21 · 특별함 7.
 *   hidden:true  조합식 목록에 없고 채팅 주문으로만 만든다(js/data/spells.js).
 *                히든은 "등급"이 아니라 "얻는 법"이다 — 강함은 tier 가 정한다(안흔함~전설).
 *   둘 다 없으면 조합식(js/data/recipes.js)으로만 만든다.
 * 불멸(T6) 5종 — 파이어·썬더·프리져·뮤츠·뮤 — 은 원본 종 자체다(예전의 별도 불멸 폼은 없앴다).
 * 초월(T7) 폼 2종은 이번 개편 범위 밖이라 그대로 둔다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;
  var R = RPD.Range;
  function P(cfg) {
    var d = { tier:'T1', types:['NORMAL'], role:'SINGLE_DPS', attack:10, attackSpeed:1.0, range:R.MID,
      critRate:0.06, critDamage:1.6, attackType:'SINGLE', splash:0, pierce:1, chain:0,
      targeting:'FIRST', ignoreArmor:false, auraAttack:0, skill:null, passive:null, desc:'',
      hidden:false, summon:false };
    for (var k in cfg) if (Object.prototype.hasOwnProperty.call(cfg,k)) d[k]=cfg[k];
    // 불멸·초월은 새 그림 없이 원래 포켓몬 그림에 오라를 입힌다(spriteOf)
    d.sprite='assets/pokemon/'+(cfg.spriteOf||cfg.id)+'.png';
    return d;
  }
  var LIST = [

    P({ id:'bulbasaur', name:'이상해씨', summon:true, tier:'T1', types:["GRASS","POISON"], role:'ECONOMY', attack:10, attackSpeed:1.0, range:R.MID, goldPerKill:1, desc:'이상해씨 — ECONOMY 역할의 T1 유닛.' }),
    P({ id:'charmander', name:'파이리', summon:true, tier:'T1', types:["FIRE"], role:'DOT', attack:13, attackSpeed:1.0, range:R.MID, burnChance:0.18, desc:'파이리 — DOT 역할의 T1 유닛.' }),
    P({ id:'squirtle', name:'꼬부기', summon:true, tier:'T1', types:["WATER"], role:'SLOW', attack:13, attackSpeed:1.0, range:R.MID, slowMul:0.82, slowDuration:1.5, desc:'꼬부기 — SLOW 역할의 T1 유닛.' }),
    P({ id:'caterpie', name:'캐터피', summon:true, tier:'T1', types:["BUG"], role:'SINGLE_DPS', attack:11, attackSpeed:1.0, range:R.MID, desc:'캐터피 — SINGLE_DPS 역할의 T1 유닛.' }),
    P({ id:'weedle', name:'뿔충이', summon:true, tier:'T1', types:["BUG","POISON"], role:'DOT', attack:11, attackSpeed:1.0, range:R.MID, burnChance:0.18, desc:'뿔충이 — DOT 역할의 T1 유닛.' }),
    P({ id:'pidgey', name:'구구', summon:true, tier:'T1', types:["NORMAL","FLYING"], role:'SINGLE_DPS', attack:13, attackSpeed:1.0, range:R.LONG, desc:'구구 — SINGLE_DPS 역할의 T1 유닛.' }),
    P({ id:'rattata', name:'꼬렛', summon:true, tier:'T2', types:["NORMAL"], role:'SINGLE_DPS', attack:49, attackSpeed:1.0, range:R.MID, desc:'꼬렛 — SINGLE_DPS 역할의 T2 유닛.' }),
    P({ id:'spearow', name:'깨비참', summon:true, tier:'T2', types:["NORMAL","FLYING"], role:'SINGLE_DPS', attack:57, attackSpeed:1.0, range:R.LONG, desc:'깨비참 — SINGLE_DPS 역할의 T2 유닛.' }),
    P({ id:'ekans', name:'아보', summon:true, tier:'T2', types:["POISON"], role:'DOT', attack:49, attackSpeed:1.0, range:R.MID, burnChance:0.22, desc:'아보 — DOT 역할의 T2 유닛.' }),
    P({ id:'nidoran_f', name:'니드런♀', summon:true, tier:'T1', types:["POISON"], role:'DEBUFFER', attack:12, attackSpeed:1.0, range:R.MID, armorShred:12, desc:'니드런♀ — DEBUFFER 역할의 T1 유닛.' }),
    P({ id:'nidoran_m', name:'니드런♂', summon:true, tier:'T1', types:["POISON"], role:'BOSS_KILLER', attack:13, attackSpeed:1.0, range:R.SHORT, targeting:'BOSS', critRate:0.1, critDamage:2.0, desc:'니드런♂ — BOSS_KILLER 역할의 T1 유닛.' }),
    P({ id:'clefairy', name:'삐삐', hidden:true, tier:'T2', types:["FAIRY"], role:'BUFFER', attack:49, attackSpeed:1.0, range:R.MID, auraAttack:0.18, desc:'삐삐 — BUFFER 역할의 T2 유닛.' }),
    P({ id:'vulpix', name:'식스테일', summon:true, tier:'T2', types:["FIRE"], role:'DEBUFFER', attack:62, attackSpeed:1.0, range:R.LONG, armorShred:30, desc:'식스테일 — DEBUFFER 역할의 T2 유닛.' }),
    P({ id:'jigglypuff', name:'푸린', hidden:true, tier:'T2', types:["NORMAL","FAIRY"], role:'BUFFER', attack:57, attackSpeed:1.0, range:R.MID, auraAttack:0.18, desc:'푸린 — BUFFER 역할의 T2 유닛.' }),
    P({ id:'zubat', name:'주뱃', summon:true, tier:'T2', types:["POISON","FLYING"], role:'DOT', attack:57, attackSpeed:1.0, range:R.MID, burnChance:0.22, desc:'주뱃 — DOT 역할의 T2 유닛.' }),
    P({ id:'oddish', name:'뚜벅쵸', summon:true, tier:'T1', types:["GRASS","POISON"], role:'ECONOMY', attack:12, attackSpeed:1.0, range:R.MID, goldPerKill:1, desc:'뚜벅쵸 — ECONOMY 역할의 T1 유닛.' }),
    P({ id:'ivysaur', name:'이상해풀', tier:'T2', types:["GRASS","POISON"], role:'ECONOMY', attack:53, attackSpeed:1.0, range:R.MID, goldPerKill:2, passive:'ivysaurTrait', evolvesFrom:'bulbasaur', desc:'이상해풀 — ECONOMY 역할의 T2 유닛.' }),
    P({ id:'charmeleon', name:'리자드', tier:'T2', types:["FIRE"], role:'AOE_DPS', attack:47, attackSpeed:1.0, range:R.MID, attackType:'SPLASH', splash:58, passive:'charmeleonTrait', evolvesFrom:'charmander', desc:'리자드 — AOE_DPS 역할의 T2 유닛.' }),
    P({ id:'wartortle', name:'어니부기', tier:'T2', types:["WATER"], role:'SLOW', attack:49, attackSpeed:1.0, range:R.MID, slowMul:0.77, slowDuration:1.9, passive:'wartortleTrait', evolvesFrom:'squirtle', desc:'어니부기 — SLOW 역할의 T2 유닛.' }),
    P({ id:'metapod', name:'단데기', tier:'T2', types:["BUG"], role:'CONTROL', attack:48, attackSpeed:1.0, range:R.MID, attackType:'SPLASH', splash:58, passive:'metapodTrait', evolvesFrom:'caterpie', desc:'단데기 — CONTROL 역할의 T2 유닛.' }),
    P({ id:'kakuna', name:'딱충이', tier:'T2', types:["BUG","POISON"], role:'DEBUFFER', attack:55, attackSpeed:1.0, range:R.MID, armorShred:30, passive:'kakunaTrait', evolvesFrom:'weedle', desc:'딱충이 — DEBUFFER 역할의 T2 유닛.' }),
    P({ id:'pidgeotto', name:'피죤', tier:'T2', types:["NORMAL","FLYING"], role:'SINGLE_DPS', attack:54, attackSpeed:1.0, range:R.LONG, passive:'pidgeottoTrait', evolvesFrom:'pidgey', desc:'피죤 — SINGLE_DPS 역할의 T2 유닛.' }),
    P({ id:'raticate', name:'레트라', tier:'T3', types:["NORMAL"], role:'SINGLE_DPS', attack:225, attackSpeed:1.0, range:R.MID, passive:'raticateTrait', evolvesFrom:'rattata', desc:'레트라 — SINGLE_DPS 역할의 T3 유닛.' }),
    P({ id:'fearow', name:'깨비드릴조', tier:'T3', types:["NORMAL","FLYING"], role:'SINGLE_DPS', attack:265, attackSpeed:1.0, range:R.LONG, passive:'fearowTrait', evolvesFrom:'spearow', desc:'깨비드릴조 — SINGLE_DPS 역할의 T3 유닛.' }),
    P({ id:'arbok', name:'아보크', tier:'T3', types:["POISON"], role:'DEBUFFER', attack:208, attackSpeed:1.0, range:R.MID, armorShred:48, passive:'arbokTrait', evolvesFrom:'ekans', desc:'아보크 — DEBUFFER 역할의 T3 유닛.' }),
    P({ id:'nidorina', name:'니드리나', tier:'T2', types:["POISON"], role:'DEBUFFER', attack:55, attackSpeed:1.0, range:R.MID, armorShred:30, passive:'nidorinaTrait', evolvesFrom:'nidoran_f', desc:'니드리나 — DEBUFFER 역할의 T2 유닛.' }),
    P({ id:'nidorino', name:'니드리노', tier:'T2', types:["POISON"], role:'BOSS_KILLER', attack:63, attackSpeed:1.0, range:R.SHORT, targeting:'BOSS', critRate:0.14, critDamage:2.0, passive:'nidorinoTrait', evolvesFrom:'nidoran_m', desc:'니드리노 — BOSS_KILLER 역할의 T2 유닛.' }),
    P({ id:'gloom', name:'냄새꼬', tier:'T2', types:["GRASS","POISON"], role:'DOT', attack:55, attackSpeed:1.0, range:R.MID, burnChance:0.22, passive:'gloomTrait', evolvesFrom:'oddish', desc:'냄새꼬 — DOT 역할의 T2 유닛.' }),
    P({ id:'ninetales', name:'나인테일', tier:'T5', types:["FIRE"], role:'DEBUFFER', attack:4022, attackSpeed:1.0, range:R.LONG, armorShred:84, passive:'legend_ninetales', evolvesFrom:'vulpix', skill:'willOWisp', desc:'나인테일 — DEBUFFER 역할의 T5 유닛.' }),
    P({ id:'golbat', name:'골뱃', tier:'T3', types:["POISON","FLYING"], role:'DOT', attack:238, attackSpeed:1.0, range:R.MID, burnChance:0.26, passive:'golbatTrait', evolvesFrom:'zubat', desc:'골뱃 — DOT 역할의 T3 유닛.' }),
    P({ id:'diglett', name:'디그다', hidden:true, tier:'T2', types:["GROUND"], role:'SINGLE_DPS', attack:49, attackSpeed:1.0, range:R.SHORT, passive:'diglettTrait', desc:'디그다 — SINGLE_DPS 역할의 T2 유닛.' }),
    P({ id:'dugtrio', name:'닥트리오', tier:'T3', types:["GROUND"], role:'AOE_DPS', attack:257, attackSpeed:1.0, range:R.SHORT, attackType:'SPLASH', splash:78, passive:'dugtrioTrait', evolvesFrom:'diglett', desc:'닥트리오 — AOE_DPS 역할의 T3 유닛.' }),
    P({ id:'mankey', name:'망키', summon:true, tier:'T2', types:["FIGHTING"], role:'BOSS_KILLER', attack:57, attackSpeed:1.0, range:R.SHORT, targeting:'BOSS', critRate:0.18, critDamage:1.85, passive:'mankeyTrait', desc:'망키 — BOSS_KILLER 역할의 T2 유닛.' }),
    P({ id:'meowth', name:'나옹', hidden:true, tier:'T2', types:["NORMAL"], role:'ECONOMY', attack:49, attackSpeed:1.0, range:R.MID, goldPerKill:2, passive:'meowthTrait', desc:'나옹 — ECONOMY 역할의 T2 유닛.' }),
    P({ id:'paras', name:'파라스', summon:true, tier:'T2', types:["BUG","GRASS"], role:'DOT', attack:49, attackSpeed:1.0, range:R.MID, burnChance:0.22, passive:'parasTrait', desc:'파라스 — DOT 역할의 T2 유닛.' }),
    P({ id:'parasect', name:'파라섹트', tier:'T3', types:["BUG","GRASS"], role:'DOT', attack:238, attackSpeed:1.0, range:R.MID, burnChance:0.26, passive:'parasectTrait', evolvesFrom:'paras', desc:'파라섹트 — DOT 역할의 T3 유닛.' }),
    P({ id:'persian', name:'페르시온', tier:'T3', types:["NORMAL"], role:'SINGLE_DPS', attack:228, attackSpeed:1.0, range:R.MID, passive:'persianTrait', evolvesFrom:'meowth', desc:'페르시온 — SINGLE_DPS 역할의 T3 유닛.' }),
    P({ id:'pikachu', name:'피카츄', hidden:true, tier:'T2', types:["ELECTRIC"], role:'CHAIN_DPS', attack:60, attackSpeed:1.0, range:R.MID, attackType:'CHAIN', chain:3, passive:'pikachuTrait', desc:'피카츄 — CHAIN_DPS 역할의 T2 유닛.' }),
    P({ id:'psyduck', name:'고라파덕', hidden:true, tier:'T2', types:["WATER"], role:'BUFFER', attack:62, attackSpeed:1.0, range:R.MID, auraAttack:0.18, passive:'psyduckTrait', desc:'고라파덕 — BUFFER 역할의 T2 유닛.' }),
    P({ id:'sandshrew', name:'모래두지', summon:true, tier:'T2', types:["GROUND"], role:'CONTROL', attack:53, attackSpeed:1.0, range:R.SHORT, attackType:'SPLASH', splash:58, passive:'sandshrewTrait', desc:'모래두지 — CONTROL 역할의 T2 유닛.' }),
    P({ id:'venomoth', name:'도나리', tier:'T3', types:["BUG","POISON"], role:'DEBUFFER', attack:233, attackSpeed:1.0, range:R.MID, armorShred:48, passive:'venomothTrait', evolvesFrom:'venonat', desc:'도나리 — DEBUFFER 역할의 T3 유닛.' }),
    P({ id:'venonat', name:'콘팡', summon:true, tier:'T2', types:["BUG","POISON"], role:'DOT', attack:57, attackSpeed:1.0, range:R.MID, burnChance:0.22, passive:'venonatTrait', desc:'콘팡 — DOT 역할의 T2 유닛.' }),
    P({ id:'butterfree', name:'버터플', tier:'T4', types:["BUG","FLYING"], role:'CONTROL', attack:1165, attackSpeed:1.0, range:R.LONG, attackType:'SPLASH', splash:98, skill:'sleepPowder', evolvesFrom:'metapod', desc:'버터플 — CONTROL 역할의 T4 유닛.' }),
    P({ id:'beedrill', name:'독침붕', tier:'T4', types:["BUG","POISON"], role:'SINGLE_DPS', attack:1197, attackSpeed:1.0, range:R.LONG, skill:'twinSting', evolvesFrom:'kakuna', desc:'독침붕 — SINGLE_DPS 역할의 T4 유닛.' }),
    P({ id:'pidgeot', name:'피죤투', tier:'T5', types:["NORMAL","FLYING"], role:'SINGLE_DPS', attack:4131, attackSpeed:1.0, range:R.LONG, skill:'skyRush', evolvesFrom:'pidgeotto', passive:'legend_pidgeot', desc:'피죤투 — SINGLE_DPS 역할의 T5 유닛.' }),
    P({ id:'raichu', name:'라이츄', tier:'T5', types:["ELECTRIC"], role:'CHAIN_DPS', attack:4689, attackSpeed:1.0, range:R.LONG, attackType:'CHAIN', chain:5, skill:'voltBurst', evolvesFrom:'pikachu', passive:'legend_raichu', desc:'라이츄 — CHAIN_DPS 역할의 T5 유닛.' }),
    P({ id:'sandslash', name:'고지', tier:'T4', types:["GROUND"], role:'CONTROL', attack:892, attackSpeed:1.0, range:R.SHORT, attackType:'SPLASH', splash:98, skill:'earthquake', evolvesFrom:'sandshrew', desc:'고지 — CONTROL 역할의 T4 유닛.' }),
    P({ id:'clefable', name:'픽시', tier:'T5', types:["FAIRY"], role:'BUFFER', attack:4317, attackSpeed:1.0, range:R.LONG, auraAttack:0.42, skill:'moonBlessing', evolvesFrom:'clefairy', passive:'legend_clefable', desc:'픽시 — BUFFER 역할의 T5 유닛.' }),
    P({ id:'vileplume', name:'라플레시아', tier:'T4', types:["GRASS","POISON"], role:'AOE_DPS', attack:1082, attackSpeed:1.0, range:R.MID, attackType:'SPLASH', splash:98, skill:'toxicGarden', evolvesFrom:'gloom', desc:'라플레시아 — AOE_DPS 역할의 T4 유닛.' }),
    P({ id:'wigglytuff', name:'푸크린', tier:'T4', types:["NORMAL","FAIRY"], role:'BUFFER', attack:1008, attackSpeed:1.0, range:R.LONG, auraAttack:0.34, skill:'lullaby', evolvesFrom:'jigglypuff', desc:'푸크린 — BUFFER 역할의 T4 유닛.' }),
    P({ id:'venusaur', name:'이상해꽃', tier:'T5', types:["GRASS","POISON"], role:'ECONOMY', attack:4558, attackSpeed:1.0, range:R.LONG, goldPerKill:5, skill:'petalStorm', passive:'legend_venusaur', evolvesFrom:'ivysaur', desc:'이상해꽃 — ECONOMY 역할의 T5 유닛.' }),
    P({ id:'charizard', name:'리자몽', tier:'T5', types:["FIRE","FLYING"], role:'AOE_DPS', attack:4601, attackSpeed:1.0, range:R.LONG, attackType:'SPLASH', splash:118, skill:'inferno', passive:'legend_charizard', evolvesFrom:'charmeleon', desc:'리자몽 — AOE_DPS 역할의 T5 유닛.' }),
    P({ id:'blastoise', name:'거북왕', tier:'T5', types:["WATER"], role:'SLOW', attack:3870, attackSpeed:1.0, range:R.LONG, slowMul:0.62, slowDuration:3.1, skill:'hydroCannon', passive:'legend_blastoise', evolvesFrom:'wartortle', desc:'거북왕 — SLOW 역할의 T5 유닛.' }),
    P({ id:'nidoqueen', name:'니드퀸', tier:'T5', types:["POISON","GROUND"], role:'CONTROL', attack:3956, attackSpeed:1.0, range:R.SHORT, attackType:'SPLASH', splash:118, skill:'queenGuard', passive:'legend_nidoqueen', evolvesFrom:'nidorina', desc:'니드퀸 — CONTROL 역할의 T5 유닛.' }),
    P({ id:'nidoking', name:'니드킹', tier:'T5', types:["POISON","GROUND"], role:'BOSS_KILLER', attack:4257, attackSpeed:1.0, range:R.SHORT, targeting:'BOSS', critRate:0.26, critDamage:2.0, skill:'kingBreaker', passive:'legend_nidoking', evolvesFrom:'nidorino', desc:'니드킹 — BOSS_KILLER 역할의 T5 유닛.' }),


    /* ---------- 1세대 확장 (#055~#150) ----------
     * 수치는 등급 기준값 × 역할 계수 × 개체별 ±6% 로 만들었다(tools 없이 손으로 고쳐도 된다).
     * evolvesFrom: 진화 전 모습 — 조합식과 '계열' 추첨이 이것을 쓴다. */
    P({ id:'poliwag', name:'발챙이', summon:true, tier:'T1', types:["WATER"], role:'SLOW', attack:11, attackSpeed:1.0, range:R.MID, slowMul:0.82, slowDuration:1.5, desc:'발챙이 — SLOW 역할의 T1 유닛.' }),
    P({ id:'poliwhirl', name:'슈륙챙이', tier:'T2', types:["WATER"], role:'SLOW', attack:46, attackSpeed:1.0, range:R.MID, slowMul:0.77, slowDuration:1.9, evolvesFrom:'poliwag', desc:'슈륙챙이 — SLOW 역할의 T2 유닛.' }),
    P({ id:'poliwrath', name:'강챙이', tier:'T5', types:["WATER","FIGHTING"], role:'BOSS_KILLER', attack:4998, attackSpeed:1.0, range:R.SHORT, targeting:'BOSS', critRate:0.26, critDamage:2, evolvesFrom:'poliwhirl', skill:'dynamicPunch', passive:'legend_poliwrath', desc:'강챙이 — BOSS_KILLER 역할의 T5 유닛.' }),
    P({ id:'abra', name:'캐이시', summon:true, tier:'T1', types:["PSYCHIC"], role:'SINGLE_DPS', attack:12, attackSpeed:1.0, range:R.LONG, desc:'캐이시 — SINGLE_DPS 역할의 T1 유닛.' }),
    P({ id:'kadabra', name:'윤겔라', tier:'T2', types:["PSYCHIC"], role:'SINGLE_DPS', attack:54, attackSpeed:1.0, range:R.LONG, evolvesFrom:'abra', desc:'윤겔라 — SINGLE_DPS 역할의 T2 유닛.' }),
    P({ id:'alakazam', name:'후딘', tier:'T5', types:["PSYCHIC"], role:'SINGLE_DPS', attack:4503, attackSpeed:1.0, range:R.LONG, evolvesFrom:'kadabra', skill:'psychicBlast', passive:'legend_alakazam', desc:'후딘 — SINGLE_DPS 역할의 T5 유닛.' }),
    P({ id:'machop', name:'알통몬', summon:true, tier:'T1', types:["FIGHTING"], role:'BOSS_KILLER', attack:13, attackSpeed:1.0, range:R.SHORT, targeting:'BOSS', critRate:0.16, critDamage:1.80, desc:'알통몬 — BOSS_KILLER 역할의 T1 유닛.' }),
    P({ id:'machoke', name:'근육몬', tier:'T2', types:["FIGHTING"], role:'BOSS_KILLER', attack:54, attackSpeed:1.0, range:R.SHORT, targeting:'BOSS', critRate:0.18, critDamage:1.85, evolvesFrom:'machop', desc:'근육몬 — BOSS_KILLER 역할의 T2 유닛.' }),
    P({ id:'machamp', name:'괴력몬', tier:'T5', types:["FIGHTING"], role:'BOSS_KILLER', attack:4954, attackSpeed:1.0, range:R.SHORT, targeting:'BOSS', critRate:0.26, critDamage:2, evolvesFrom:'machoke', skill:'crossChop', passive:'legend_machamp', desc:'괴력몬 — BOSS_KILLER 역할의 T5 유닛.' }),
    P({ id:'bellsprout', name:'모다피', summon:true, tier:'T1', types:["GRASS","POISON"], role:'DOT', attack:12, attackSpeed:1.0, range:R.MID, burnChance:0.18, desc:'모다피 — DOT 역할의 T1 유닛.' }),
    P({ id:'weepinbell', name:'우츠동', tier:'T2', types:["GRASS","POISON"], role:'DOT', attack:50, attackSpeed:1.0, range:R.MID, burnChance:0.22, evolvesFrom:'bellsprout', desc:'우츠동 — DOT 역할의 T2 유닛.' }),
    P({ id:'victreebel', name:'우츠보트', tier:'T4', types:["GRASS","POISON"], role:'AOE_DPS', attack:971, attackSpeed:1.0, range:R.LONG, attackType:'SPLASH', splash:98, evolvesFrom:'weepinbell', skill:'sludgeWave', desc:'우츠보트 — AOE_DPS 역할의 T4 유닛.' }),
    P({ id:'geodude', name:'꼬마돌', summon:true, tier:'T1', types:["ROCK","GROUND"], role:'AOE_DPS', attack:12, attackSpeed:1.0, range:R.SHORT, attackType:'SPLASH', splash:40, desc:'꼬마돌 — AOE_DPS 역할의 T1 유닛.' }),
    P({ id:'graveler', name:'데구리', tier:'T2', types:["ROCK","GROUND"], role:'AOE_DPS', attack:53, attackSpeed:1.0, range:R.SHORT, attackType:'SPLASH', splash:58, evolvesFrom:'geodude', desc:'데구리 — AOE_DPS 역할의 T2 유닛.' }),
    P({ id:'golem', name:'딱구리', tier:'T5', types:["ROCK","GROUND"], role:'CONTROL', attack:4052, attackSpeed:1.0, range:R.SHORT, attackType:'SPLASH', splash:118, evolvesFrom:'graveler', skill:'rockSlide', passive:'legend_golem', desc:'딱구리 — CONTROL 역할의 T5 유닛.' }),
    P({ id:'gastly', name:'고오스', summon:true, tier:'T1', types:["GHOST","POISON"], role:'DEBUFFER', attack:12, attackSpeed:1.0, range:R.MID, armorShred:12, desc:'고오스 — DEBUFFER 역할의 T1 유닛.' }),
    P({ id:'haunter', name:'고우스트', tier:'T2', types:["GHOST","POISON"], role:'DEBUFFER', attack:53, attackSpeed:1.0, range:R.MID, armorShred:30, evolvesFrom:'gastly', desc:'고우스트 — DEBUFFER 역할의 T2 유닛.' }),
    P({ id:'gengar', name:'팬텀', tier:'T5', types:["GHOST","POISON"], role:'DEBUFFER', attack:4538, attackSpeed:1.0, range:R.LONG, armorShred:84, evolvesFrom:'haunter', skill:'shadowBall', passive:'legend_gengar', desc:'팬텀 — DEBUFFER 역할의 T5 유닛.' }),
    P({ id:'dratini', name:'미뇽', hidden:true, tier:'T2', types:["DRAGON"], role:'SINGLE_DPS', attack:54, attackSpeed:1.0, range:R.LONG, desc:'미뇽 — SINGLE_DPS 역할의 T2 유닛.' }),
    P({ id:'dragonair', name:'신뇽', tier:'T4', types:["DRAGON"], role:'SINGLE_DPS', attack:991, attackSpeed:1.0, range:R.LONG, evolvesFrom:'dratini', skill:'dragonTail', desc:'신뇽 — SINGLE_DPS 역할의 T4 유닛.' }),
    P({ id:'dragonite', name:'망나뇽', tier:'T5', types:["DRAGON","FLYING"], role:'SINGLE_DPS', attack:4441, attackSpeed:1.0, range:R.LONG, evolvesFrom:'dragonair', skill:'dragonRush', passive:'legend_dragonite', desc:'망나뇽 — SINGLE_DPS 역할의 T5 유닛.' }),
    P({ id:'tentacool', name:'왕눈해', summon:true, tier:'T2', types:["WATER","POISON"], role:'DOT', attack:53, attackSpeed:1.0, range:R.MID, burnChance:0.22, desc:'왕눈해 — DOT 역할의 T2 유닛.' }),
    P({ id:'tentacruel', name:'독파리', tier:'T4', types:["WATER","POISON"], role:'DOT', attack:1008, attackSpeed:1.0, range:R.MID, burnChance:0.3, evolvesFrom:'tentacool', skill:'toxicTentacle', desc:'독파리 — DOT 역할의 T4 유닛.' }),
    P({ id:'ponyta', name:'포니타', summon:true, tier:'T3', types:["FIRE"], role:'DOT', attack:234, attackSpeed:1.0, range:R.MID, burnChance:0.26, desc:'포니타 — DOT 역할의 T3 유닛.' }),
    P({ id:'rapidash', name:'날쌩마', tier:'T4', types:["FIRE"], role:'AOE_DPS', attack:1008, attackSpeed:1.0, range:R.MID, attackType:'SPLASH', splash:98, evolvesFrom:'ponyta', skill:'flameCharge', desc:'날쌩마 — AOE_DPS 역할의 T4 유닛.' }),
    P({ id:'slowpoke', name:'야돈', hidden:true, tier:'T2', types:["WATER","PSYCHIC"], role:'SLOW', attack:44, attackSpeed:1.0, range:R.LONG, slowMul:0.77, slowDuration:1.9, desc:'야돈 — SLOW 역할의 T2 유닛.' }),
    P({ id:'slowbro', name:'야도란', tier:'T4', types:["WATER","PSYCHIC"], role:'SLOW', attack:944, attackSpeed:1.0, range:R.LONG, slowMul:0.67, slowDuration:2.7, evolvesFrom:'slowpoke', skill:'slackWave', desc:'야도란 — SLOW 역할의 T4 유닛.' }),
    P({ id:'magnemite', name:'코일', summon:true, tier:'T3', types:["ELECTRIC","STEEL"], role:'CHAIN_DPS', attack:254, attackSpeed:1.0, range:R.LONG, attackType:'CHAIN', chain:3, desc:'코일 — CHAIN_DPS 역할의 T3 유닛.' }),
    P({ id:'magneton', name:'레어코일', tier:'T4', types:["ELECTRIC","STEEL"], role:'CHAIN_DPS', attack:1120, attackSpeed:1.0, range:R.LONG, attackType:'CHAIN', chain:4, evolvesFrom:'magnemite', skill:'zapCannon', desc:'레어코일 — CHAIN_DPS 역할의 T4 유닛.' }),
    P({ id:'doduo', name:'두두', summon:true, tier:'T2', types:["NORMAL","FLYING"], role:'SINGLE_DPS', attack:53, attackSpeed:1.0, range:R.LONG, desc:'두두 — SINGLE_DPS 역할의 T2 유닛.' }),
    P({ id:'dodrio', name:'두트리오', tier:'T3', types:["NORMAL","FLYING"], role:'SINGLE_DPS', attack:251, attackSpeed:1.0, range:R.LONG, evolvesFrom:'doduo', desc:'두트리오 — SINGLE_DPS 역할의 T3 유닛.' }),
    P({ id:'seel', name:'쥬쥬', summon:true, tier:'T2', types:["WATER"], role:'SLOW', attack:44, attackSpeed:1.0, range:R.MID, slowMul:0.77, slowDuration:1.9, desc:'쥬쥬 — SLOW 역할의 T2 유닛.' }),
    P({ id:'dewgong', name:'쥬레곤', tier:'T4', types:["WATER","ICE"], role:'SLOW', attack:931, attackSpeed:1.0, range:R.LONG, slowMul:0.67, slowDuration:2.7, evolvesFrom:'seel', skill:'auroraBeam', desc:'쥬레곤 — SLOW 역할의 T4 유닛.' }),
    P({ id:'grimer', name:'질퍽이', summon:true, tier:'T2', types:["POISON"], role:'DOT', attack:49, attackSpeed:1.0, range:R.MID, burnChance:0.22, desc:'질퍽이 — DOT 역할의 T2 유닛.' }),
    P({ id:'muk', name:'질뻐기', tier:'T3', types:["POISON"], role:'DOT', attack:225, attackSpeed:1.0, range:R.MID, burnChance:0.26, evolvesFrom:'grimer', desc:'질뻐기 — DOT 역할의 T3 유닛.' }),
    P({ id:'shellder', name:'셀러', summon:true, tier:'T3', types:["WATER"], role:'DEBUFFER', attack:215, attackSpeed:1.0, range:R.MID, armorShred:48, desc:'셀러 — DEBUFFER 역할의 T3 유닛.' }),
    P({ id:'cloyster', name:'파르셀', tier:'T5', types:["WATER","ICE"], role:'AOE_DPS', attack:4042, attackSpeed:1.0, range:R.MID, attackType:'SPLASH', splash:118, evolvesFrom:'shellder', skill:'icicleCrash', passive:'legend_cloyster', desc:'파르셀 — AOE_DPS 역할의 T5 유닛.' }),
    P({ id:'drowzee', name:'슬리프', summon:true, tier:'T2', types:["PSYCHIC"], role:'CONTROL', attack:49, attackSpeed:1.0, range:R.LONG, attackType:'SPLASH', splash:58, desc:'슬리프 — CONTROL 역할의 T2 유닛.' }),
    P({ id:'hypno', name:'슬리퍼', tier:'T4', types:["PSYCHIC"], role:'CONTROL', attack:914, attackSpeed:1.0, range:R.LONG, attackType:'SPLASH', splash:98, evolvesFrom:'drowzee', skill:'hypnosis', desc:'슬리퍼 — CONTROL 역할의 T4 유닛.' }),
    P({ id:'krabby', name:'크랩', summon:true, tier:'T2', types:["WATER"], role:'BOSS_KILLER', attack:57, attackSpeed:1.0, range:R.MID, targeting:'BOSS', critRate:0.18, critDamage:1.85, desc:'크랩 — BOSS_KILLER 역할의 T2 유닛.' }),
    P({ id:'kingler', name:'킹크랩', tier:'T4', types:["WATER"], role:'BOSS_KILLER', attack:1017, attackSpeed:1.0, range:R.MID, targeting:'BOSS', critRate:0.22, critDamage:1.95, evolvesFrom:'krabby', skill:'crabhammer', desc:'킹크랩 — BOSS_KILLER 역할의 T4 유닛.' }),
    P({ id:'voltorb', name:'찌리리공', summon:true, tier:'T2', types:["ELECTRIC"], role:'AOE_DPS', attack:49, attackSpeed:1.0, range:R.MID, attackType:'SPLASH', splash:58, desc:'찌리리공 — AOE_DPS 역할의 T2 유닛.' }),
    P({ id:'electrode', name:'붐볼', tier:'T3', types:["ELECTRIC"], role:'AOE_DPS', attack:217, attackSpeed:1.0, range:R.MID, attackType:'SPLASH', splash:78, evolvesFrom:'voltorb', desc:'붐볼 — AOE_DPS 역할의 T3 유닛.' }),
    P({ id:'exeggcute', name:'아라리', summon:true, tier:'T2', types:["GRASS","PSYCHIC"], role:'ECONOMY', attack:44, attackSpeed:1.0, range:R.MID, goldPerKill:2, desc:'아라리 — ECONOMY 역할의 T2 유닛.' }),
    P({ id:'exeggutor', name:'나시', tier:'T4', types:["GRASS","PSYCHIC"], role:'ECONOMY', attack:970, attackSpeed:1.0, range:R.MID, goldPerKill:4, evolvesFrom:'exeggcute', skill:'eggBomb', desc:'나시 — ECONOMY 역할의 T4 유닛.' }),
    P({ id:'cubone', name:'탕구리', hidden:true, tier:'T2', types:["GROUND"], role:'SINGLE_DPS', attack:53, attackSpeed:1.0, range:R.MID, desc:'탕구리 — SINGLE_DPS 역할의 T2 유닛.' }),
    P({ id:'marowak', name:'텅구리', tier:'T3', types:["GROUND"], role:'SINGLE_DPS', attack:251, attackSpeed:1.0, range:R.MID, evolvesFrom:'cubone', desc:'텅구리 — SINGLE_DPS 역할의 T3 유닛.' }),
    P({ id:'koffing', name:'또가스', summon:true, tier:'T2', types:["POISON"], role:'DEBUFFER', attack:53, attackSpeed:1.0, range:R.MID, armorShred:30, desc:'또가스 — DEBUFFER 역할의 T2 유닛.' }),
    P({ id:'weezing', name:'또도가스', tier:'T3', types:["POISON"], role:'DEBUFFER', attack:233, attackSpeed:1.0, range:R.MID, armorShred:48, evolvesFrom:'koffing', desc:'또도가스 — DEBUFFER 역할의 T3 유닛.' }),
    P({ id:'horsea', name:'쏘드라', summon:true, tier:'T2', types:["WATER"], role:'SINGLE_DPS', attack:53, attackSpeed:1.0, range:R.MID, desc:'쏘드라 — SINGLE_DPS 역할의 T2 유닛.' }),
    P({ id:'seadra', name:'시드라', tier:'T3', types:["WATER"], role:'SINGLE_DPS', attack:247, attackSpeed:1.0, range:R.MID, evolvesFrom:'horsea', desc:'시드라 — SINGLE_DPS 역할의 T3 유닛.' }),
    P({ id:'goldeen', name:'콘치', summon:true, tier:'T2', types:["WATER"], role:'SINGLE_DPS', attack:57, attackSpeed:1.0, range:R.MID, desc:'콘치 — SINGLE_DPS 역할의 T2 유닛.' }),
    P({ id:'seaking', name:'왕콘치', tier:'T3', types:["WATER"], role:'SINGLE_DPS', attack:246, attackSpeed:1.0, range:R.MID, evolvesFrom:'goldeen', desc:'왕콘치 — SINGLE_DPS 역할의 T3 유닛.' }),
    P({ id:'staryu', name:'별가사리', summon:true, tier:'T2', types:["WATER"], role:'CHAIN_DPS', attack:53, attackSpeed:1.0, range:R.MID, attackType:'CHAIN', chain:3, desc:'별가사리 — CHAIN_DPS 역할의 T2 유닛.' }),
    P({ id:'starmie', name:'아쿠스타', tier:'T5', types:["WATER","PSYCHIC"], role:'CHAIN_DPS', attack:4953, attackSpeed:1.0, range:R.LONG, attackType:'CHAIN', chain:5, evolvesFrom:'staryu', skill:'swiftStar', passive:'legend_starmie', desc:'아쿠스타 — CHAIN_DPS 역할의 T5 유닛.' }),
    P({ id:'golduck', name:'골덕', tier:'T3', types:["WATER","PSYCHIC"], role:'BUFFER', attack:234, attackSpeed:1.0, range:R.MID, auraAttack:0.26, evolvesFrom:'psyduck', desc:'골덕 — BUFFER 역할의 T3 유닛.' }),
    P({ id:'primeape', name:'성원숭', tier:'T3', types:["FIGHTING"], role:'BOSS_KILLER', attack:254, attackSpeed:1.0, range:R.SHORT, targeting:'BOSS', critRate:0.20, critDamage:1.90, evolvesFrom:'mankey', desc:'성원숭 — BOSS_KILLER 역할의 T3 유닛.' }),
    P({ id:'growlithe', name:'가디', summon:true, tier:'T3', types:["FIRE"], role:'DOT', attack:212, attackSpeed:1.0, range:R.MID, burnChance:0.26, desc:'가디 — DOT 역할의 T3 유닛.' }),
    P({ id:'arcanine', name:'윈디', tier:'T5', types:["FIRE"], role:'AOE_DPS', attack:4441, attackSpeed:1.0, range:R.LONG, attackType:'SPLASH', splash:118, evolvesFrom:'growlithe', skill:'flareBlitz', passive:'legend_arcanine', desc:'윈디 — AOE_DPS 역할의 T5 유닛.' }),
    P({ id:'rhyhorn', name:'뿔카노', summon:true, tier:'T3', types:["GROUND","ROCK"], role:'AOE_DPS', attack:230, attackSpeed:1.0, range:R.SHORT, attackType:'SPLASH', splash:78, desc:'뿔카노 — AOE_DPS 역할의 T3 유닛.' }),
    P({ id:'rhydon', name:'코뿌리', tier:'T5', types:["GROUND","ROCK"], role:'CONTROL', attack:3941, attackSpeed:1.0, range:R.SHORT, attackType:'SPLASH', splash:118, evolvesFrom:'rhyhorn', skill:'hornDrill', passive:'legend_rhydon', desc:'코뿌리 — CONTROL 역할의 T5 유닛.' }),
    P({ id:'omanyte', name:'암나이트', summon:true, tier:'T3', types:["ROCK","WATER"], role:'SLOW', attack:216, attackSpeed:1.0, range:R.MID, slowMul:0.72, slowDuration:2.3, desc:'암나이트 — SLOW 역할의 T3 유닛.' }),
    P({ id:'omastar', name:'암스타', tier:'T4', types:["ROCK","WATER"], role:'SLOW', attack:964, attackSpeed:1.0, range:R.LONG, slowMul:0.67, slowDuration:2.7, evolvesFrom:'omanyte', skill:'spikeCannon', desc:'암스타 — SLOW 역할의 T4 유닛.' }),
    P({ id:'kabuto', name:'투구', summon:true, tier:'T3', types:["ROCK","WATER"], role:'SINGLE_DPS', attack:243, attackSpeed:1.0, range:R.MID, desc:'투구 — SINGLE_DPS 역할의 T3 유닛.' }),
    P({ id:'kabutops', name:'투구푸스', tier:'T4', types:["ROCK","WATER"], role:'SINGLE_DPS', attack:1016, attackSpeed:1.0, range:R.LONG, evolvesFrom:'kabuto', skill:'slashCut', desc:'투구푸스 — SINGLE_DPS 역할의 T4 유닛.' }),
    P({ id:'magikarp', name:'잉어킹', hidden:true, tier:'T2', types:["WATER"], role:'UTILITY', attack:31, attackSpeed:1.0, range:R.MID, desc:'잉어킹 — UTILITY 역할의 T2 유닛.' }),
    P({ id:'gyarados', name:'갸라도스', tier:'T5', types:["WATER","FLYING"], role:'AOE_DPS', attack:4211, attackSpeed:1.0, range:R.LONG, attackType:'SPLASH', splash:118, evolvesFrom:'magikarp', skill:'hyperBeam', passive:'legend_gyarados', desc:'갸라도스 — AOE_DPS 역할의 T5 유닛.' }),
    P({ id:'eevee', name:'이브이', hidden:true, tier:'T2', types:["NORMAL"], role:'SINGLE_DPS', attack:52, attackSpeed:1.0, range:R.MID, desc:'이브이 — SINGLE_DPS 역할의 T2 유닛.' }),
    P({ id:'vaporeon', name:'샤미드', tier:'T3', types:["WATER"], role:'SLOW', attack:214, attackSpeed:1.0, range:R.MID, slowMul:0.72, slowDuration:2.3, evolvesFrom:'eevee', desc:'샤미드 — SLOW 역할의 T3 유닛.' }),
    P({ id:'jolteon', name:'쥬피썬더', tier:'T3', types:["ELECTRIC"], role:'CHAIN_DPS', attack:258, attackSpeed:1.0, range:R.LONG, attackType:'CHAIN', chain:3, evolvesFrom:'eevee', desc:'쥬피썬더 — CHAIN_DPS 역할의 T3 유닛.' }),
    P({ id:'flareon', name:'부스터', tier:'T3', types:["FIRE"], role:'AOE_DPS', attack:217, attackSpeed:1.0, range:R.MID, attackType:'SPLASH', splash:78, evolvesFrom:'eevee', desc:'부스터 — AOE_DPS 역할의 T3 유닛.' }),
    P({ id:'farfetchd', name:'파오리', hidden:true, tier:'T3', types:["NORMAL","FLYING"], role:'SINGLE_DPS', attack:247, attackSpeed:1.0, range:R.LONG, desc:'파오리 — SINGLE_DPS 역할의 T3 유닛.' }),
    P({ id:'lickitung', name:'내루미', hidden:true, tier:'T3', types:["NORMAL"], role:'CONTROL', attack:212, attackSpeed:1.0, range:R.MID, attackType:'SPLASH', splash:78, desc:'내루미 — CONTROL 역할의 T3 유닛.' }),
    P({ id:'tangela', name:'덩쿠리', hidden:true, tier:'T3', types:["GRASS"], role:'SLOW', attack:208, attackSpeed:1.0, range:R.MID, slowMul:0.72, slowDuration:2.3, desc:'덩쿠리 — SLOW 역할의 T3 유닛.' }),
    P({ id:'porygon', name:'폴리곤', hidden:true, tier:'T3', types:["NORMAL"], role:'DEBUFFER', attack:212, attackSpeed:1.0, range:R.MID, armorShred:48, desc:'폴리곤 — DEBUFFER 역할의 T3 유닛.' }),
    P({ id:'ditto', name:'메타몽', hidden:true, tier:'T2', types:["NORMAL"], role:'UTILITY', attack:30, attackSpeed:1.0, range:R.MID, desc:'메타몽 — UTILITY 역할의 T2 유닛.' }),
    P({ id:'onix', name:'롱스톤', hidden:true, tier:'T4', types:["ROCK","GROUND"], role:'CONTROL', attack:892, attackSpeed:1.0, range:R.SHORT, attackType:'SPLASH', splash:98, skill:'rockTomb', desc:'롱스톤 — CONTROL 역할의 T4 유닛.' }),
    P({ id:'hitmonlee', name:'시라소몬', hidden:true, tier:'T4', types:["FIGHTING"], role:'BOSS_KILLER', attack:1120, attackSpeed:1.0, range:R.SHORT, targeting:'BOSS', critRate:0.22, critDamage:1.95, skill:'highJumpKick', desc:'시라소몬 — BOSS_KILLER 역할의 T4 유닛.' }),
    P({ id:'hitmonchan', name:'홍수몬', hidden:true, tier:'T4', types:["FIGHTING"], role:'SINGLE_DPS', attack:995, attackSpeed:1.0, range:R.MID, skill:'cometPunch', desc:'홍수몬 — SINGLE_DPS 역할의 T4 유닛.' }),
    P({ id:'chansey', name:'럭키', hidden:true, tier:'T4', types:["NORMAL"], role:'BUFFER', attack:974, attackSpeed:1.0, range:R.MID, auraAttack:0.34, skill:'softBoiled', desc:'럭키 — BUFFER 역할의 T4 유닛.' }),
    P({ id:'kangaskhan', name:'캥카', hidden:true, tier:'T3', types:["NORMAL"], role:'SINGLE_DPS', attack:245, attackSpeed:1.0, range:R.MID, desc:'캥카 — SINGLE_DPS 역할의 T3 유닛.' }),
    P({ id:'mr_mime', name:'마임맨', hidden:true, tier:'T4', types:["PSYCHIC","FAIRY"], role:'BUFFER', attack:948, attackSpeed:1.0, range:R.MID, auraAttack:0.34, skill:'barrier', desc:'마임맨 — BUFFER 역할의 T4 유닛.' }),
    P({ id:'jynx', name:'루주라', hidden:true, tier:'T4', types:["ICE","PSYCHIC"], role:'CONTROL', attack:892, attackSpeed:1.0, range:R.LONG, attackType:'SPLASH', splash:98, skill:'lovelyKiss', desc:'루주라 — CONTROL 역할의 T4 유닛.' }),
    P({ id:'electabuzz', name:'에레브', hidden:true, tier:'T4', types:["ELECTRIC"], role:'CHAIN_DPS', attack:1077, attackSpeed:1.0, range:R.LONG, attackType:'CHAIN', chain:4, skill:'thunderPunch', desc:'에레브 — CHAIN_DPS 역할의 T4 유닛.' }),
    P({ id:'magmar', name:'마그마', hidden:true, tier:'T4', types:["FIRE"], role:'DOT', attack:1025, attackSpeed:1.0, range:R.MID, burnChance:0.3, skill:'flamethrower', desc:'마그마 — DOT 역할의 T4 유닛.' }),
    P({ id:'pinsir', name:'쁘사이저', hidden:true, tier:'T4', types:["BUG"], role:'BOSS_KILLER', attack:1068, attackSpeed:1.0, range:R.MID, targeting:'BOSS', critRate:0.22, critDamage:1.95, skill:'viceGrip', desc:'쁘사이저 — BOSS_KILLER 역할의 T4 유닛.' }),
    P({ id:'tauros', name:'켄타로스', hidden:true, tier:'T3', types:["NORMAL"], role:'SINGLE_DPS', attack:227, attackSpeed:1.0, range:R.MID, desc:'켄타로스 — SINGLE_DPS 역할의 T3 유닛.' }),
    P({ id:'scyther', name:'스라크', tier:'T5', types:["BUG","FLYING"], role:'SINGLE_DPS', attack:4370, attackSpeed:1.0, range:R.LONG, skill:'furyCutter', passive:'legend_scyther', desc:'스라크 — SINGLE_DPS 역할의 T5 유닛.' }),
    P({ id:'lapras', name:'라프라스', hidden:true, tier:'T5', types:["WATER","ICE"], role:'SLOW', attack:4242, attackSpeed:1.0, range:R.LONG, slowMul:0.62, slowDuration:3.1, skill:'iceBeam', passive:'legend_lapras', desc:'라프라스 — SLOW 역할의 T5 유닛.' }),
    P({ id:'aerodactyl', name:'프테라', hidden:true, tier:'T5', types:["ROCK","FLYING"], role:'SINGLE_DPS', attack:4503, attackSpeed:1.0, range:R.LONG, skill:'ancientPower', passive:'legend_aerodactyl', desc:'프테라 — SINGLE_DPS 역할의 T5 유닛.' }),
    P({ id:'snorlax', name:'잠만보', hidden:true, tier:'T5', types:["NORMAL"], role:'CONTROL', attack:3932, attackSpeed:1.0, range:R.LONG, attackType:'SPLASH', splash:118, skill:'bodySlam', passive:'legend_snorlax', desc:'잠만보 — CONTROL 역할의 T5 유닛.' }),
    P({ id:'articuno', name:'프리져', tier:'T6', types:["ICE","FLYING"], role:'SLOW', attack:7858, attackSpeed:1.0, range:R.LONG, slowMul:0.58, slowDuration:3.5, skill:'blizzard', passive:'legend_articuno', desc:'프리져 — SLOW 역할의 T6 유닛.' }),
    P({ id:'zapdos', name:'썬더', tier:'T6', types:["ELECTRIC","FLYING"], role:'CHAIN_DPS', attack:10065, attackSpeed:1.0, range:R.LONG, attackType:'CHAIN', chain:5, skill:'thunderStorm', passive:'legend_zapdos', bossDamage:0.5, desc:'썬더 — CHAIN_DPS 역할의 T6 유닛.' }),
    P({ id:'moltres', name:'파이어', tier:'T6', types:["FIRE","FLYING"], role:'AOE_DPS', attack:8411, attackSpeed:1.0, range:R.LONG, attackType:'SPLASH', splash:130, skill:'skyFire', passive:'legend_moltres', bossDamage:0.5, desc:'파이어 — AOE_DPS 역할의 T6 유닛.' }),
    P({ id:'mewtwo', name:'뮤츠', tier:'T6', types:["PSYCHIC"], role:'BOSS_KILLER', attack:9628, attackSpeed:1.0, range:R.MID, targeting:'BOSS', critRate:0.3, critDamage:2.1, skill:'psystrike', passive:'legend_mewtwo', desc:'뮤츠 — BOSS_KILLER 역할의 T6 유닛.' }),

    /* ---------- 특수 등급 — 채팅 주문으로만 만든다(js/data/spells.js) ---------- */
    P({ id:'politoed', name:'왕구리', hidden:true, tier:'T4', types:["WATER"], role:'SLOW', attack:1004, attackSpeed:1.0, range:R.LONG, slowMul:0.67, slowDuration:2.7, skill:'rainDance', desc:'왕구리 — 개구리들의 왕. 주문으로만 만든다.' }),
    P({ id:'mew', name:'뮤', tier:'T6', types:["PSYCHIC"], role:'BUFFER', attack:9314, attackSpeed:1.0, range:R.LONG, auraAttack:0.5, skill:'ancestorGlow', passive:'immortal_mew', desc:'뮤 — 모든 포켓몬의 조상. 불멸.' }),
    P({ id:'mewtwo_transcend', name:'초월 뮤츠', spriteOf:'mewtwo', form:'transcend', tier:'T7', types:["PSYCHIC"], role:'BOSS_KILLER', attack:16500, attackSpeed:1.0, range:R.LONG, targeting:'BOSS', critRate:0.3, critDamage:2.2, skill:'psychoBreakX', passive:'transcend_mewtwo', desc:'초월 뮤츠 — 자신이 누구인지 깨달은 자.' }),
    P({ id:'charizard_transcend', name:'초월 리자몽', spriteOf:'charizard', form:'transcend', tier:'T7', types:["FIRE","DRAGON"], role:'AOE_DPS', attack:15800, attackSpeed:1.0, range:R.LONG, attackType:'SPLASH', splash:150, skill:'blastBurnX', passive:'transcend_charizard', desc:'초월 리자몽 — 꺼지지 않는 불꽃.' })
  ];
  var byId = {}, byTier = {};
  for (var i=0;i<LIST.length;i++) {
    byId[LIST[i].id]=LIST[i];
    (byTier[LIST[i].tier]=byTier[LIST[i].tier]||[]).push(LIST[i].id);
  }
  var ROLE_LABEL = {
    SINGLE_DPS:'단일 딜러', AOE_DPS:'광역 딜러', CHAIN_DPS:'연쇄 딜러', DOT:'지속 피해',
    SLOW:'감속', CONTROL:'제어', BUFFER:'버퍼', DEBUFFER:'디버퍼',
    BOSS_KILLER:'보스 킬러', ECONOMY:'골드', UTILITY:'특수'
  };
  for (var r=0;r<LIST.length;r++) LIST[r].roleLabel=ROLE_LABEL[LIST[r].role]||LIST[r].role;
  var PokemonData={list:LIST,byId:byId,byTier:byTier,Roles:ROLE_LABEL};
  PokemonData.all=function(){return Object.keys(byId);};
  PokemonData.get=function(id){return byId[id]||null;};
  PokemonData.ofTier=function(tier){return byTier[tier]||[];};
  /* 소환(과 라운드 무료 지급)으로 나오는 종 — summon:true 인 것만 */
  PokemonData.summonPool=function(tier){
    return (byTier[tier]||[]).filter(function(id){ return byId[id].summon; });
  };
  /* 보스 보상처럼 "그 등급 아무거나"를 줄 때 — 히든(주문 전용)은 빼고 */
  PokemonData.rewardPool=function(tier){
    return (byTier[tier]||[]).filter(function(id){ return !byId[id].hidden && !byId[id].form; });
  };
  PokemonData.isHidden=function(id){ return !!(byId[id] && byId[id].hidden); };
  /* 얻는 법 한마디 — 화면용 */
  PokemonData.howLabel=function(id){
    var d=byId[id]; if(!d) return '';
    if(RPD.Tiers[d.tier] && RPD.Tiers[d.tier].special) return '주문';
    if(d.hidden) return '히든 · 주문';
    if(d.summon) return d.tier==='T1' ? '소환' : '소환 · 조합';
    return '조합';
  };
  PokemonData.dps=function(def){
    if(!def) return 0;
    var v=def.attack*(1+def.critRate*(def.critDamage-1))*def.attackSpeed;
    if(def.attackType==='SPLASH') v*=1.6;
    else if(def.attackType==='PIERCE') v*=Math.min(def.pierce,2.2);
    else if(def.attackType==='CHAIN') v*=1+def.chain*0.45;
    return v;
  };
  RPD.PokemonData=PokemonData;
})(typeof window !== 'undefined' ? window : globalThis);
