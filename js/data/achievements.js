/* achievements.js — 업적과 칭호(세션 98).
 *
 * 업적을 이루면 그 업적의 칭호를 얻는다. 얻은 칭호 하나를 골라 달 수 있다(모드 선택 · 판 시작 화면 · 결과 화면에 보인다).
 * **보상은 칭호뿐이다** — 전투 · 경제 보너스는 클리어 칭호(titles.js)와 도감 보상(dexbonus.js)이 이미 준다.
 * 업적까지 보너스를 주면 밸런스 측정(봇은 업적을 거의 못 이룬다)과 실제 플레이가 갈라진다.
 *
 * ┌─ 고치는 법 ─────────────────────────────────────────────────────────────┐
 * │ id: 저장 키(바꾸면 이미 이룬 기록이 사라진다) · cat: 묶음 · icon: 이모지 하나    │
 * │ name: 업적 이름 · title: 칭호 · desc: 조건(화면에 그대로) · secret: 이루기 전엔 ??? │
 * │ kind: 판정 종류 — AchievementManager 의 CHECK 표. goal 은 그 종류의 목표 수      │
 * │   crafts(누적 조합) · craftTier(tier · scope run=한 판 / life=누적) · spellKind  │
 * │   spellAll(그 종류 주문 전부 발견) · holdTier(tier 종 수 동시 보유)            │
 * │   synMax(type 없으면 아무 타입) · synMaxCount(최대 단계 동시 개수) · cheerFull   │
 * │   bosses · elites(누적) · wave(modes · wave · noImmortal) · clear(modes · noImmortal · noLeak) · dex │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  var CATS = [
    { id: 'craft', label: '조합' },
    { id: 'spell', label: '주문' },
    { id: 'synergy', label: '시너지' },
    { id: 'battle', label: '전투 · 도전' },
    { id: 'collect', label: '수집' }
  ];

  var LIST = [
    { id: 'craft_first',    cat: 'craft',   icon: '🔧', name: '첫 조합',              title: '견습 조합사',     kind: 'crafts', goal: 1,   desc: '조합을 처음 성공한다' },
    { id: 'craft_100',      cat: 'craft',   icon: '⚒️', name: '조합 100번',           title: '숙련 조합사',     kind: 'crafts', goal: 100, desc: '조합을 모두 합쳐 100번 성공한다' },
    { id: 'legend_first',   cat: 'craft',   icon: '🌟', name: '전설의 시작',          title: '전설을 빚은 자',  kind: 'craftTier', tier: 'T5', scope: 'life', goal: 1, desc: '처음으로 전설 포켓몬을 조합한다' },
    { id: 'legend_run5',    cat: 'craft',   icon: '👑', name: '전설 다섯',            title: '전설 수집가',     kind: 'craftTier', tier: 'T5', scope: 'run', goal: 5, desc: '한 판에서 전설을 5마리 조합한다' },

    { id: 'hidden_first',   cat: 'spell',   icon: '🔮', name: '숨은 포켓몬',          title: '비밀을 아는 자',  kind: 'spellKind', spellKind: 'hidden',    desc: '히든 주문을 처음 성공한다' },
    { id: 'hidden_all',     cat: 'spell',   icon: '📜', name: '주문 사전 완성',       title: '주문 박사',       kind: 'spellAll',  spellKind: 'hidden',    desc: '히든 주문을 전부 발견한다' },
    { id: 'immortal_first', cat: 'spell',   icon: '💠', name: '불멸과의 계약',        title: '불멸의 계약자',   kind: 'spellKind', spellKind: 'immortal',  desc: '불멸 주문을 처음 성공한다' },
    { id: 'immortal_3',     cat: 'spell',   icon: '🔱', name: '세 불멸',              title: '삼신의 주인',     kind: 'holdTier', tier: 'T6', goal: 3,  desc: '서로 다른 불멸 3종을 동시에 갖는다' },
    { id: 'transcend_first',cat: 'spell',   icon: '☀️', name: '초월',                 title: '초월자',          kind: 'spellKind', spellKind: 'transcend', desc: '초월 주문을 처음 성공한다', secret: true },

    { id: 'syn_any_max',    cat: 'synergy', icon: '🔗', name: '시너지 완성',          title: '타입 연구가',     kind: 'synMax',                  desc: '아무 타입이나 시너지를 최대 단계까지 켠다' },
    { id: 'syn_water_max',  cat: 'synergy', icon: '🌊', name: '바다의 힘',            title: '바다의 지배자',   kind: 'synMax', type: 'WATER',   desc: '물 시너지를 최대 단계까지 켠다' },
    { id: 'syn_fire_max',   cat: 'synergy', icon: '🔥', name: '불꽃의 힘',            title: '불꽃의 지배자',   kind: 'synMax', type: 'FIRE',    desc: '불꽃 시너지를 최대 단계까지 켠다' },
    { id: 'syn_triple_max', cat: 'synergy', icon: '🌈', name: '세 갈래 시너지',       title: '시너지 마스터',   kind: 'synMaxCount', goal: 3,    desc: '최대 단계 시너지 3개를 동시에 켠다' },
    { id: 'cheer_full',     cat: 'synergy', icon: '📣', name: '응원단',               title: '응원단장',        kind: 'cheerFull',               desc: '응원 칸을 모두 열고 전부 채운다' },

    { id: 'boss_first',     cat: 'battle',  icon: '⚔️', name: '첫 보스',              title: '보스 사냥 입문',  kind: 'bosses', goal: 1,   desc: '보스를 처음 잡는다' },
    { id: 'boss_100',       cat: 'battle',  icon: '🗡️', name: '보스 100',             title: '보스 사냥꾼',     kind: 'bosses', goal: 100, desc: '보스를 모두 합쳐 100마리 잡는다' },
    { id: 'elite_10',       cat: 'battle',  icon: '🎖️', name: '정예 열 번',           title: '정예 조련사',     kind: 'elites', goal: 10,  desc: '정예 소환을 모두 합쳐 10번 성공한다' },
    { id: 'wall_noimm',     cat: 'battle',  icon: '🧱', name: '맨손으로 벽 넘기',     title: '벽을 넘은 자',    kind: 'wave', modes: ['NORMAL', 'CHALLENGE'], wave: 61, noImmortal: true,
      desc: '노멀 · 챌린지에서 불멸 · 초월 없이 60라운드를 넘긴다' },
    { id: 'clear_noimm',    cat: 'battle',  icon: '🌿', name: '순수한 승리',          title: '순수한 트레이너', kind: 'clear', modes: ['NORMAL', 'CHALLENGE'], noImmortal: true,
      desc: '노멀 · 챌린지를 불멸 · 초월 없이 클리어한다' },
    { id: 'clear_noleak',   cat: 'battle',  icon: '🛡️', name: '완벽한 방어',          title: '철벽',            kind: 'clear', modes: ['NORMAL', 'CHALLENGE'], noLeak: true,
      desc: '노멀 · 챌린지를 적 하나도 안 놓치고 클리어한다' },
    { id: 'bossrush_clear', cat: 'battle',  icon: '🏆', name: '보스 러시 정복',       title: '보스 러시 정복자', kind: 'clear', modes: ['BOSS_RUSH'], desc: '보스 러시를 클리어한다' },
    { id: 'endless_100',    cat: 'battle',  icon: '♾️', name: '끝없는 길',            title: '끝없는 도전자',   kind: 'wave', modes: ['ENDLESS'], wave: 100, desc: '엔드리스에서 100라운드에 닿는다' },

    { id: 'dex_50',         cat: 'collect', icon: '📗', name: '도감 50',              title: '도감 수집가',     kind: 'dex', goal: 50,  desc: '도감에 50종을 올린다' },
    { id: 'dex_all',        cat: 'collect', icon: '📕', name: '도감 완성',            title: '오박사의 제자',   kind: 'dex', goal: 0,   desc: '도감을 전부 채운다' }   // goal 0 = 도감 전체(SaveManager.dexTotal)
  ];

  var byId = {};
  LIST.forEach(function (a) { byId[a.id] = a; });

  RPD.AchievementData = {
    cats: CATS,
    list: LIST,
    get: function (id) { return byId[id] || null; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
