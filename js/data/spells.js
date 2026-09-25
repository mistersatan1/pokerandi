/* spells.js — 주문 조합 (히든 · 불멸 · 초월).
 *
 * 조합식 목록에 나오지 않는다. 재료를 필드나 창고에 모아 두고 **채팅으로 주문을 외치면** 만들어진다.
 *
 * ┌─ 주문 추가·수정하는 법 ───────────────────────────────────────────┐
 * │ 한 덩어리가 주문 하나다.                                             │
 * │   kind      'hidden'(히든) · 'immortal'(불멸) · 'transcend'(초월)     │
 * │   phrase    외칠 주문. 띄어쓰기·대소문자는 무시하고 비교한다.         │
 * │   result    만들어지는 포켓몬 id (js/data/pokemon.js 에 있어야 한다)  │
 * │   materials 재료 포켓몬 id. 같은 것을 두 번 쓰면 두 마리가 든다.       │
 * │   lines     조합될 때 나오는 대사. 한 줄씩 순서대로 뜬다.             │
 * │   speaker   대사 위에 뜨는 이름(생략하면 결과 포켓몬 이름)            │
 * │ 저장하고 새로고침하면 반영. 확인: node tools/uicheck.js               │
 * └─────────────────────────────────────────────────────────────┘
 *
 * 종류별 규칙 (검사가 잡아 준다)
 *   히든  — 결과는 hidden:true 포켓몬. **히든은 등급이 아니라 얻는 법이다** —
 *           안흔함(흔함 4마리)부터 전설(희귀함 3마리)까지 강함이 다양하다.
 *           결과가 재료보다 높은 등급이어야 하는 것은 조합식과 같다.
 *   불멸  — 재료에 전설이 3마리. 결과는 파이어·썬더·프리져·뮤츠·뮤 원본 종(불멸 등급).
 *   초월  — 재료에 전설 이상이 1마리 이상 + 초월의 조각 1개(40라운드 보스 보상). 판당 하나.
 *           초월은 조합식 개편 v2 범위 밖이라 예전 그대로 두었다(나중에 다시 설계).
 * 주문 문구는 서로 겹치면 안 된다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  var SPELLS = [
    /* ---------- 히든 · 안흔함 (12) ---------- */
    { // 피카츄 (안흔함) = 이상해씨 + 파이리 + 꼬부기 + 캐터피
      id: 'pikachu', kind: 'hidden', result: 'pikachu',
      phrase: '너로 정했다',
      materials: ['bulbasaur', 'charmander', 'squirtle', 'caterpie'],
      lines: [
        '풀숲이 바스락거린다.',
        '"피카—!"',
        '볼에서 불꽃이 튀는 작은 쥐가 뛰어나왔다!'
      ]
    },
    { // 이브이 (안흔함) = 뿔충이 + 구구 + 니드런♀ + 니드런♂
      id: 'eevee', kind: 'hidden', result: 'eevee',
      phrase: '여러 갈래의 진화',
      materials: ['weedle', 'pidgey', 'nidoran_f', 'nidoran_m'],
      lines: [
        '네 갈래 길 한가운데, 작은 발자국이 멈춰 섰다.',
        '"브이?"',
        '어느 쪽으로든 자랄 수 있는 포켓몬이 나타났다!'
      ]
    },
    { // 잉어킹 (안흔함) = 뚜벅쵸 + 발챙이 + 캐이시 + 알통몬
      id: 'magikarp', kind: 'hidden', result: 'magikarp',
      phrase: '튀어오르기',
      materials: ['oddish', 'poliwag', 'abra', 'machop'],
      lines: [
        '수면이 요란하게 튄다.',
        '"……잉어."',
        '잉어킹이 힘차게 튀어올랐다! (아무 일도 일어나지 않았다)'
      ]
    },
    { // 야돈 (안흔함) = 모다피 + 꼬마돌 + 고오스 + 이상해씨
      id: 'slowpoke', kind: 'hidden', result: 'slowpoke',
      phrase: '느긋한 하품',
      materials: ['bellsprout', 'geodude', 'gastly', 'bulbasaur'],
      lines: [
        '한참 뒤에야 누군가 하품을 했다.',
        '"…야아아…돈?"',
        '느긋한 포켓몬이 자리를 잡았다.'
      ]
    },
    { // 고라파덕 (안흔함) = 파이리 + 꼬부기 + 캐터피 + 뿔충이
      id: 'psyduck', kind: 'hidden', result: 'psyduck',
      phrase: '두통이 심해',
      materials: ['charmander', 'squirtle', 'caterpie', 'weedle'],
      lines: [
        '누군가 머리를 감싸 쥐고 있다.',
        '"고라… 파덕…"',
        '두통이 심한 오리가 나타났다!'
      ]
    },
    { // 나옹 (안흔함) = 구구 + 니드런♀ + 니드런♂ + 뚜벅쵸
      id: 'meowth', kind: 'hidden', result: 'meowth',
      phrase: '그렇다옹',
      materials: ['pidgey', 'nidoran_f', 'nidoran_m', 'oddish'],
      lines: [
        '동전 떨어지는 소리가 들렸다.',
        '"그렇다옹!"',
        '반짝이는 걸 좋아하는 고양이가 나타났다!'
      ]
    },
    { // 푸린 (안흔함) = 발챙이 + 캐이시 + 알통몬 + 모다피
      id: 'jigglypuff', kind: 'hidden', result: 'jigglypuff',
      phrase: '노래를 불러줄게',
      materials: ['poliwag', 'abra', 'machop', 'bellsprout'],
      lines: [
        '어디선가 자장가가 들려온다.',
        '"푸~ 린~ 푸~"',
        '노래하는 풍선이 둥실 떠올랐다!'
      ]
    },
    { // 삐삐 (안흔함) = 꼬마돌 + 고오스 + 이상해씨 + 파이리
      id: 'clefairy', kind: 'hidden', result: 'clefairy',
      phrase: '달맞이',
      materials: ['geodude', 'gastly', 'bulbasaur', 'charmander'],
      lines: [
        '보름달 아래 작은 그림자들이 춤을 춘다.',
        '"삐삐!"',
        '달에서 온 요정이 나타났다!'
      ]
    },
    { // 디그다 (안흔함) = 꼬부기 + 캐터피 + 뿔충이 + 구구
      id: 'diglett', kind: 'hidden', result: 'diglett',
      phrase: '땅속에서 쏙',
      materials: ['squirtle', 'caterpie', 'weedle', 'pidgey'],
      lines: [
        '땅이 봉긋 솟는다.',
        '"디그 디그."',
        '땅속에서 디그다가 쏙 나왔다!'
      ]
    },
    { // 탕구리 (안흔함) = 니드런♀ + 니드런♂ + 뚜벅쵸 + 발챙이
      id: 'cubone', kind: 'hidden', result: 'cubone',
      phrase: '엄마의 뼈',
      materials: ['nidoran_f', 'nidoran_m', 'oddish', 'poliwag'],
      lines: [
        '뼈 하나를 꼭 끌어안은 작은 그림자.',
        '"……탕."',
        '엄마의 뼈를 쓴 포켓몬이 나타났다.'
      ]
    },
    { // 메타몽 (안흔함) = 캐이시 + 알통몬 + 모다피 + 꼬마돌
      id: 'ditto', kind: 'hidden', result: 'ditto',
      phrase: '무엇이든 될 수 있어',
      materials: ['abra', 'machop', 'bellsprout', 'geodude'],
      lines: [
        '분홍빛 덩어리가 꿈틀거린다.',
        '"…메타."',
        '무엇이든 될 수 있는 포켓몬이 나타났다!'
      ]
    },
    { // 미뇽 (안흔함) = 고오스 + 이상해씨 + 파이리 + 꼬부기
      id: 'dratini', kind: 'hidden', result: 'dratini',
      phrase: '환상의 용',
      materials: ['gastly', 'bulbasaur', 'charmander', 'squirtle'],
      lines: [
        '물안개 속에 푸른 비늘이 반짝인다.',
        '"……."',
        '환상의 용이 모습을 드러냈다!'
      ]
    },
    /* ---------- 히든 · 특별함 (6) ---------- */
    { // 파오리 (특별함) = 깨비참 + 우츠동
      id: 'farfetchd', kind: 'hidden', result: 'farfetchd',
      phrase: '대파를 든 오리',
      materials: ['spearow', 'weepinbell'],
      lines: [
        '어디선가 대파 냄새가 난다.',
        '"파오리!"',
        '대파를 든 오리가 날아들었다!'
      ]
    },
    { // 내루미 (특별함) = 꼬렛 + 아보
      id: 'lickitung', kind: 'hidden', result: 'lickitung',
      phrase: '날름날름',
      materials: ['rattata', 'ekans'],
      lines: [
        '기다란 혀가 허공을 휘젓는다.',
        '"날름—"',
        '내루미가 나타났다!'
      ]
    },
    { // 덩쿠리 (특별함) = 파라스 + 냄새꼬
      id: 'tangela', kind: 'hidden', result: 'tangela',
      phrase: '덩굴 뭉치',
      materials: ['paras', 'gloom'],
      lines: [
        '덩굴이 뭉쳐 굴러온다.',
        '"덩쿠?"',
        '덩굴 뭉치가 자리를 잡았다!'
      ]
    },
    { // 폴리곤 (특별함) = 메타몽🔒 + 찌리리공
      id: 'porygon', kind: 'hidden', result: 'porygon',
      phrase: '디지털 세계',
      materials: ['ditto', 'voltorb'],
      lines: [
        '화면이 잠깐 깜빡인다.',
        '"삐—비비빅."',
        '디지털 세계에서 폴리곤이 넘어왔다!'
      ]
    },
    { // 캥카 (특별함) = 탕구리🔒 + 꼬렛 + 근육몬
      id: 'kangaskhan', kind: 'hidden', result: 'kangaskhan',
      phrase: '엄마를 찾아서',
      materials: ['cubone', 'rattata', 'machoke'],
      lines: [
        '주머니 속에서 작은 머리가 빼꼼 나온다.',
        '"캥!"',
        '엄마를 찾은 아기와 함께 캥카가 나타났다!'
      ]
    },
    { // 켄타로스 (특별함) = 두두 + 망키 + 니드리노
      id: 'tauros', kind: 'hidden', result: 'tauros',
      phrase: '성난 황소',
      materials: ['doduo', 'mankey', 'nidorino'],
      lines: [
        '흙먼지가 일고, 땅이 울린다.',
        '"우오오—!"',
        '성난 황소가 돌진해 왔다!'
      ]
    },
    /* ---------- 히든 · 희귀함 (10) ---------- */
    { // 시라소몬 (희귀함) = 근육몬 + 알통몬
      id: 'hitmonlee', kind: 'hidden', result: 'hitmonlee',
      phrase: '발차기의 달인',
      materials: ['machoke', 'machop'],
      lines: [
        '바람을 가르는 발차기 소리.',
        '"시라!"',
        '발차기의 달인이 나타났다!'
      ]
    },
    { // 홍수몬 (희귀함) = 근육몬 + 레트라
      id: 'hitmonchan', kind: 'hidden', result: 'hitmonchan',
      phrase: '주먹의 달인',
      materials: ['machoke', 'raticate'],
      lines: [
        '샌드백이 터져 나갔다.',
        '"홍수!"',
        '주먹의 달인이 나타났다!'
      ]
    },
    { // 마임맨 (희귀함) = 윤겔라 + 삐삐🔒 + 슬리프
      id: 'mr_mime', kind: 'hidden', result: 'mr_mime',
      phrase: '보이지 않는 벽',
      materials: ['kadabra', 'clefairy', 'drowzee'],
      lines: [
        '허공에 보이지 않는 벽이 생겼다.',
        '"마임, 마임."',
        '마임맨이 벽을 두드리며 나타났다.'
      ]
    },
    { // 루주라 (희귀함) = 쥬쥬 + 슬리프 + 푸린🔒
      id: 'jynx', kind: 'hidden', result: 'jynx',
      phrase: '얼음 입맞춤',
      materials: ['seel', 'drowzee', 'jigglypuff'],
      lines: [
        '차가운 입맞춤이 공기를 얼린다.',
        '"루~주~"',
        '얼음의 춤꾼이 나타났다!'
      ]
    },
    { // 에레브 (희귀함) = 쥬피썬더 + 니드리노
      id: 'electabuzz', kind: 'hidden', result: 'electabuzz',
      phrase: '번개 주먹',
      materials: ['jolteon', 'nidorino'],
      lines: [
        '주먹에 번개가 모인다.',
        '"에레브!"',
        '번개 주먹을 쥔 포켓몬이 나타났다!'
      ]
    },
    { // 마그마 (희귀함) = 부스터 + 리자드
      id: 'magmar', kind: 'hidden', result: 'magmar',
      phrase: '화산의 불꽃',
      materials: ['flareon', 'charmeleon'],
      lines: [
        '땅속 깊은 곳에서 불꽃이 끓어오른다.',
        '"마그마—!"',
        '화산의 불꽃이 모습을 드러냈다!'
      ]
    },
    { // 쁘사이저 (희귀함) = 딱충이 + 크랩 + 뿔충이
      id: 'pinsir', kind: 'hidden', result: 'pinsir',
      phrase: '집게 뿔',
      materials: ['kakuna', 'krabby', 'weedle'],
      lines: [
        '나무껍질이 쩍 갈라졌다.',
        '"쁘사!"',
        '집게 뿔을 가진 포켓몬이 나타났다!'
      ]
    },
    { // 롱스톤 (희귀함) = 데구리 + 닥트리오 + 아보크
      id: 'onix', kind: 'hidden', result: 'onix',
      phrase: '바위 뱀',
      materials: ['graveler', 'dugtrio', 'arbok'],
      lines: [
        '땅 밑에서 거대한 바위가 꿈틀거린다.',
        '"……크르르."',
        '바위 뱀이 몸을 일으켰다!'
      ]
    },
    { // 럭키 (희귀함) = 삐삐🔒 + 이브이🔒
      id: 'chansey', kind: 'hidden', result: 'chansey',
      phrase: '행복의 알',
      materials: ['clefairy', 'eevee'],
      lines: [
        '따뜻한 기운이 필드를 감싼다.',
        '"럭키~"',
        '행복의 알을 품은 포켓몬이 나타났다!'
      ]
    },
    { // 왕구리 (희귀함) = 슈륙챙이 + 발챙이 + 메타몽🔒
      id: 'frog_king', kind: 'hidden', result: 'politoed',
      phrase: '개구리의 왕',
      materials: ['poliwhirl', 'poliwag', 'ditto'],
      lines: [
        '연못의 물결이 멈췄다…',
        '"개굴. 이 연못의 왕은 누구인가."',
        '왕관을 쓴 개구리가 모습을 드러냈다!'
      ]
    },
    /* ---------- 히든 · 전설 (3) ---------- */
    { // 라프라스 (전설) = 쥬레곤 + 야도란 + 레어코일
      id: 'lapras', kind: 'hidden', result: 'lapras',
      phrase: '바다를 건너는 노래',
      materials: ['dewgong', 'slowbro', 'magneton'],
      lines: [
        '안개 낀 바다 위로 노랫소리가 번진다.',
        '"라—프라—"',
        '바다를 건너는 노래가 필드에 닿았다.'
      ]
    },
    { // 프테라 (전설) = 암스타 + 투구푸스 + 깨비드릴조
      id: 'aerodactyl', kind: 'hidden', result: 'aerodactyl',
      phrase: '호박 속 유전자',
      materials: ['omastar', 'kabutops', 'fearow'],
      lines: [
        '호박 속에 갇힌 유전자가 빛을 낸다.',
        '"끼아아아—!"',
        '태고의 하늘이 되살아났다!'
      ]
    },
    { // 잠만보 (전설) = 야도란 + 럭키🔒 + 푸크린
      id: 'snorlax', kind: 'hidden', result: 'snorlax',
      phrase: '잠이 쏟아진다',
      materials: ['slowbro', 'chansey', 'wigglytuff'],
      lines: [
        '필드 한가운데 거대한 그림자가 드러눕는다.',
        '"……쿠울."',
        '잠만보가 길을 막고 잠들었다.'
      ]
    },

    /* ---------- 불멸 — 전설 3마리 + 주문 (5) ---------- */
    { // 파이어 (불멸) = 리자몽 + 윈디 + 피죤투
      id: 'moltres', kind: 'immortal', result: 'moltres',
      phrase: '불꽃의 날개',
      materials: ['charizard', 'arcanine', 'pidgeot'],
      lines: [
        '세 전설의 불꽃이 하늘에서 하나로 겹쳐진다.',
        '"재가 되어도, 나는 다시 타오른다."',
        '불멸의 불새가 날개를 펼쳤다.'
      ]
    },
    { // 썬더 (불멸) = 라이츄 + 피죤투 + 스라크
      id: 'zapdos', kind: 'immortal', result: 'zapdos',
      phrase: '번개의 날개',
      materials: ['raichu', 'pidgeot', 'scyther'],
      lines: [
        '먹구름이 몰려오고, 하늘이 갈라진다.',
        '"번개는 같은 곳에 두 번 떨어진다."',
        '불멸의 번개새가 날개를 펼쳤다.'
      ]
    },
    { // 프리져 (불멸) = 파르셀 + 라프라스🔒 + 거북왕
      id: 'articuno', kind: 'immortal', result: 'articuno',
      phrase: '얼음의 날개',
      materials: ['cloyster', 'lapras', 'blastoise'],
      lines: [
        '눈보라가 멈추고, 모든 것이 고요해진다.',
        '"얼음은 녹지 않는다. 영원히."',
        '불멸의 얼음새가 날개를 펼쳤다.'
      ]
    },
    { // 뮤츠 (불멸) = 후딘 + 팬텀 + 괴력몬
      id: 'mewtwo', kind: 'immortal', result: 'mewtwo',
      phrase: '나는 누구인가',
      materials: ['alakazam', 'gengar', 'machamp'],
      lines: [
        '"나는 누구인가. 누가 나를 만들었는가."',
        '세 개의 힘이 하나로 모여, 한 존재를 빚어낸다.',
        '뮤츠가 눈을 떴다.'
      ]
    },
    { // 뮤 (불멸) = 픽시 + 후딘 + 이상해꽃
      id: 'ancestor', kind: 'immortal', result: 'mew',
      phrase: '모든 포켓몬의 조상',
      materials: ['clefable', 'alakazam', 'venusaur'],
      lines: [
        '세 전설의 기운이 한 점으로 모여, 분홍빛으로 물든다.',
        '"뮤우—?"',
        '모든 포켓몬의 유전자를 품은 존재가 깨어났다.'
      ]
    },

    /* ---------- 초월 (v2 범위 밖 — 예전 그대로) ---------- */
    {
      // 주문을 「나는 누구인가」에서 바꿨다 — v2 에서 그 문구는 불멸 뮤츠의 주문이 됐다
      id: 'who_am_i', kind: 'transcend', result: 'mewtwo_transcend',
      phrase: '나는 나다',
      materials: ['mewtwo', 'mew'],
      speaker: '뮤츠',
      lines: [
        '"나는 누구인가. 어디서 태어났고, 무엇을 위해 존재하는가."',
        '뮤의 빛이 뮤츠를 감싼다. 초월의 조각이 부서진다.',
        '"…이제 알겠다. 나는, 나다."',
        '뮤츠가 한계를 넘어섰다.'
      ]
    },
    {
      id: 'undying_flame', kind: 'transcend', result: 'charizard_transcend',
      phrase: '꺼지지 않는 불꽃',
      materials: ['charizard', 'arcanine', 'rapidash'],
      speaker: '리자몽',
      lines: [
        '꼬리의 불꽃이 하늘까지 치솟는다.',
        '"이 불꽃이 꺼지는 날은, 오지 않는다."',
        '초월의 조각이 불길 속에 녹아든다.',
        '리자몽이 한계를 넘어섰다.'
      ]
    }
  ];

  function normalize(text) {
    return String(text || '').replace(/[\s.,!?~…'"·]/g, '').toLowerCase();
  }

  RPD.SpellData = {
    list: SPELLS,
    normalize: normalize,
    byPhrase: function (text) {
      var n = normalize(text);
      if (!n) return null;
      for (var i = 0; i < SPELLS.length; i++) if (normalize(SPELLS[i].phrase) === n) return SPELLS[i];
      return null;
    },
    get: function (id) {
      for (var i = 0; i < SPELLS.length; i++) if (SPELLS[i].id === id) return SPELLS[i];
      return null;
    },
    /* 이 포켓몬을 만드는 주문 (없으면 null) */
    forResult: function (pokemonId) {
      for (var i = 0; i < SPELLS.length; i++) if (SPELLS[i].result === pokemonId) return SPELLS[i];
      return null;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
