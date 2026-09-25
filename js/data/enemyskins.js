/* enemyskins.js — 적의 겉모습.
 *
 * 적의 "성질"(질풍·육중·철갑·군집·재생·분열·보막)은 enemies.js 가 정한다.
 * 여기서는 그 성질을 라운드 구간마다 어떤 몬스터 그림으로 보여 줄지만 정한다.
 * 이 파일을 통째로 지워도 전투 결과는 한 자리도 바뀌지 않는다 — 그림과 이름만 달라진다.
 *
 * 디자인 시트의 구조를 그대로 따른다.
 *   10라운드 단위로 몬스터 계열이 바뀐다.
 *   일반 5종: 기본 · 강화형 · 군체 · 날개(비행)형 · 변이(돌연변이·속성)형
 *   정예 4종: 해당 구간에 섞여 나오는 강한 몬스터
 *   보스   : 10 · 20 · 30 · 40 · 70 라운드(최종형)
 *
 * 성질 → 그림 규칙 (구간이 바뀌어도 같다)
 *   grunt    기본         swift    날개형        tank     강화형
 *   swarm    군체         splitter 변이형        splitling 변이형
 *   armored  정예 기본    regen    정예 강화형   shielded 정예 특수형
 * 정예가 없는 구간(21~29 · 41~49)은 바로 앞 구간의 정예를 이어 쓴다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  var DIR = 'assets/enemies/digimon/';

  function set(prefix, names) {
    var out = {};
    for (var k in names) out[k] = { file: prefix + names[k][0], name: names[k][1] };
    return out;
  }

  var BANDS = [
    { until: 10, label: '1~9 라운드',
      normal: set('', {
        grunt: ['koromon', '코로몬'], tank: ['koromon_strong', '코로몬(강화형)'],
        swarm: ['koromon_swarm', '코로몬(군체)'], swift: ['koromon_wing', '코로몬(날개형)'],
        splitter: ['koromon_mutant', '코로몬(돌연변이)'], splitling: ['koromon_mutant', '코로몬(돌연변이)']
      }),
      elite: set('', {
        armored: ['agumon_elite', '아구몬'], regen: ['agumon_elite_strong', '아구몬(강화형)'],
        shielded: ['agumon_elite_attack', '아구몬(공격형)']
      })
    },
    { until: 20, label: '11~19 라운드',
      normal: set('', {
        grunt: ['tsunomon', '뿔몬'], tank: ['tsunomon_strong', '뿔몬(강화형)'],
        swarm: ['tsunomon_swarm', '뿔몬(군체)'], swift: ['tsunomon_wing', '뿔몬(비행형)'],
        splitter: ['tsunomon_mutant', '뿔몬(돌연변이)'], splitling: ['tsunomon_mutant', '뿔몬(돌연변이)']
      }),
      elite: set('', {
        armored: ['palmon_elite', '파피몬'], regen: ['palmon_elite_strong', '파피몬(강화형)'],
        shielded: ['palmon_elite_special', '파피몬(특수형)']
      })
    },
    { until: 30, label: '21~29 라운드',
      normal: set('', {
        grunt: ['bagumon', '아구몬'], tank: ['bagumon_strong', '아구몬(강화형)'],
        swarm: ['bagumon_swarm', '아구몬(군체)'], swift: ['bagumon_wing', '아구몬(비행형)'],
        splitter: ['bagumon_water', '아구몬(물속성)'], splitling: ['bagumon_water', '아구몬(물속성)']
      }),
      elite: null
    },
    { until: 40, label: '31~39 라운드',
      normal: set('', {
        grunt: ['yagumon', '아그몬'], tank: ['yagumon_strong', '아그몬(강화형)'],
        swarm: ['yagumon_swarm', '아그몬(군체)'], swift: ['yagumon_wing', '아그몬(비행형)'],
        splitter: ['yagumon_dark', '아그몬(어둠형)'], splitling: ['yagumon_dark', '아그몬(어둠형)']
      }),
      elite: set('', {
        armored: ['devimon_elite', '데블몬'], regen: ['devimon_elite_strong', '데블몬(강화형)'],
        shielded: ['devimon_elite_dark', '데블몬(다크형)']
      })
    },
    { until: Infinity, label: '41~49 라운드',
      normal: set('', {
        grunt: ['gatomon', '테일몬'], tank: ['gatomon_strong', '테일몬(강화형)'],
        swarm: ['gatomon_swarm', '테일몬(군체)'], swift: ['gatomon_wing', '테일몬(비행형)'],
        splitter: ['gatomon_light', '테일몬(빛속성)'], splitling: ['gatomon_light', '테일몬(빛속성)']
      }),
      elite: null
    }
  ];

  /* 보스는 라운드로 정한다. 같은 라운드에 보스 성질(돌격·방해·파괴)이 다르면 변형을 고른다. */
  var BOSSES = [
    { until: 10, any: ['boss_greymon', '그레이몬'] },
    { until: 20, any: ['boss_garurumon', '가루몬'] },
    { until: 30, byType: {
        boss_charger: ['boss_metalgreymon', '메탈그레이몬'],
        boss_breaker: ['boss_metalgreymon_strong', '메탈그레이몬(강화형)'],
        boss_warden:  ['boss_metalgreymon_special', '메탈그레이몬(특수형)']
      } },
    { until: 40, any: ['boss_piemon', '피에몬'] },
    // 노멀·챌린지가 70라운드로 늘면서(세션 33) 최종형의 자리도 50 → 70 으로 옮겼다.
    { until: 70, any: ['boss_omegamon_final', '오메가몬(최종형)'] },
    // 엔드리스가 70라운드를 넘어가면 — 오메가몬 변형을 돌려 가며
    { until: Infinity, cycle: [
        ['boss_omegamon', '오메가몬'], ['boss_omegamon_strong', '오메가몬(강화형)'],
        ['boss_omegamon_special', '오메가몬(특수형)'], ['boss_omegamon_swarm', '오메가몬(군체)']
      ] }
  ];

  function bandFor(wave) {
    for (var i = 0; i < BANDS.length; i++) if (wave < BANDS[i].until) return i;
    return BANDS.length - 1;
  }

  function eliteFor(index) {
    for (var i = index; i >= 0; i--) if (BANDS[i].elite) return BANDS[i].elite;
    return null;
  }

  var Skins = { bands: BANDS, bosses: BOSSES, dir: DIR };

  /* 적 하나의 겉모습. { sprite, name, scale } 또는 null(원래 그림 그대로). */
  Skins.resolve = function (def, wave) {
    if (!def) return null;
    wave = Math.max(1, wave || 1);

    if (def.isBoss) {
      for (var b = 0; b < BOSSES.length; b++) {
        var row = BOSSES[b];
        if (wave > row.until) continue;
        var pick = row.any || (row.byType && row.byType[def.id]) ||
          (row.cycle && row.cycle[Math.floor(wave / 10) % row.cycle.length]) ||
          (row.byType && row.byType.boss_charger);
        return { sprite: DIR + pick[0] + '.png', name: pick[1], scale: 1.55 };
      }
      return null;
    }

    var i = bandFor(wave);
    var band = BANDS[i];
    var entry = band.normal[def.id];
    if (!entry) {
      var elite = eliteFor(i);
      entry = elite && elite[def.id];
    }
    if (!entry) return null;
    return {
      sprite: DIR + entry.file + '.png',
      name: entry.name,
      // 그림에 여백이 있고 몸이 작아 보여서 판정 크기보다 조금 크게 그린다
      scale: def.id === 'swarm' ? 1.9 : 1.6,
      elite: !band.normal[def.id]
    };
  };

  Skins.allFiles = function () {
    var files = {};
    BANDS.forEach(function (b) {
      [b.normal, b.elite].forEach(function (group) {
        if (!group) return;
        for (var k in group) files[group[k].file] = true;
      });
    });
    BOSSES.forEach(function (b) {
      if (b.any) files[b.any[0]] = true;
      if (b.byType) for (var t in b.byType) files[b.byType[t][0]] = true;
      if (b.cycle) b.cycle.forEach(function (c) { files[c[0]] = true; });
    });
    return Object.keys(files).map(function (f) { return DIR + f + '.png'; });
  };

  RPD.EnemySkins = Skins;
})(typeof window !== 'undefined' ? window : globalThis);
