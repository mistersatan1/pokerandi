/* recipes.js — 조합식 (조합식 개편 v2).
 *
 * ┌─ 직접 바꾸는 법 ───────────────────────────────────────────────┐
 * │ 한 줄이 조합식 하나다.                                          │
 * │   { id: '결과', materials: ['재료1', '재료2', ...] }             │
 * │ 재료를 두 가지 중 아무거나로 만들 수 있게 하려면(OR-조합식)          │
 * │   { id: '결과', recipes: [['재료1', '재료2'], ['재료3', '재료4']] } │
 * │ id 와 재료는 js/data/pokemon.js 의 영어 id 를 쓴다(오른쪽 주석이   │
 * │ 한글 이름, 🔒 는 주문으로만 얻는 히든 재료다). 저장하고 새로고침하면  │
 * │ 바로 반영된다. 바꾼 뒤에는 node tools/redesigncheck.js 로 확인한다. │
 * └──────────────────────────────────────────────────────────────┘
 *
 * 규칙 (검사가 잡아 준다)
 *   1. 결과는 재료보다 높은 등급이다.
 *   2. 재료는 전부 특정 포켓몬이다 — "아무거나(타입·등급)" 칸은 없다.
 *      판마다 계열을 추첨하던 시절에는 특정 포켓몬이 이번 판에 안 나와 막힐 수 있었다.
 *      지금은 152종이 항상 전부 나오므로 이름으로 못박는다.
 *   3. 진화 순서보다 "연관성"으로 묶는다. 진화 전 ×2 가 기본이지만
 *      중간 진화를 건너뛰거나(잉어킹 → 갸라도스) 다른 계열을 섞어도 된다.
 *   4. 같은 재료 묶음으로 서로 다른 결과가 나오면 안 된다(경로가 둘인 결과도 마찬가지).
 *   5. 재료는 2~4마리.
 *   6. 한 결과에 경로는 최대 둘이다(OR-조합식). 둘 다 같은 흔함 환산이 되게 맞춘다 —
 *      싸고 비싼 길이 나란히 있으면 비싼 길은 아무도 안 쓴다.
 *   7. 메타몽은 조합에서 모자란 흔함 한 마리를 대신한다(조합식에는 적지 않는다).
 *
 * 히든(🔒)·불멸은 여기 없다 — js/data/spells.js 의 채팅 주문으로 만든다.
 * 히든은 여기서 **재료**로는 쓰인다(이브이 🔒 + 쥬쥬 → 샤미드).
 *
 * unlockRound(목록에 보이기 시작하는 라운드)는 생략하면 1 이다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  var RECIPES = [

    /* ---------- 안흔함 (36) ---------- */
    { id: 'ivysaur', materials: ['bulbasaur', 'bulbasaur'] },                               // 이상해풀 = 이상해씨 + 이상해씨  (진화 — 진화 전 ×2)
    { id: 'charmeleon', materials: ['charmander', 'charmander'] },                          // 리자드 = 파이리 + 파이리  (진화 — 진화 전 ×2)
    { id: 'wartortle', materials: ['squirtle', 'squirtle'] },                               // 어니부기 = 꼬부기 + 꼬부기  (진화 — 진화 전 ×2)
    { id: 'metapod', materials: ['caterpie', 'caterpie'] },                                 // 단데기 = 캐터피 + 캐터피  (진화 — 진화 전 ×2)
    { id: 'kakuna', materials: ['weedle', 'weedle'] },                                      // 딱충이 = 뿔충이 + 뿔충이  (진화 — 진화 전 ×2)
    { id: 'pidgeotto', materials: ['pidgey', 'pidgey'] },                                   // 피죤 = 구구 + 구구  (진화 — 진화 전 ×2)
    { id: 'nidorina', materials: ['nidoran_f', 'nidoran_f'] },                              // 니드리나 = 니드런♀ + 니드런♀  (진화 — 진화 전 ×2)
    { id: 'nidorino', materials: ['nidoran_m', 'nidoran_m'] },                              // 니드리노 = 니드런♂ + 니드런♂  (진화 — 진화 전 ×2)
    { id: 'gloom', materials: ['oddish', 'oddish'] },                                       // 냄새꼬 = 뚜벅쵸 + 뚜벅쵸  (진화 — 진화 전 ×2)
    { id: 'poliwhirl', materials: ['poliwag', 'poliwag'] },                                 // 슈륙챙이 = 발챙이 + 발챙이  (진화 — 진화 전 ×2)
    { id: 'kadabra', materials: ['abra', 'abra'] },                                         // 윤겔라 = 캐이시 + 캐이시  (진화 — 진화 전 ×2)
    { id: 'machoke', recipes: [['machop', 'machop'], ['bellsprout', 'bulbasaur']] },        // 근육몬 = 알통몬 + 알통몬  또는  모다피 + 이상해씨  (진화 — 진화 전 ×2)
    { id: 'weepinbell', materials: ['bellsprout', 'bellsprout'] },                          // 우츠동 = 모다피 + 모다피  (진화 — 진화 전 ×2)
    { id: 'graveler', materials: ['geodude', 'geodude'] },                                  // 데구리 = 꼬마돌 + 꼬마돌  (진화 — 진화 전 ×2)
    { id: 'haunter', materials: ['gastly', 'gastly'] },                                     // 고우스트 = 고오스 + 고오스  (진화 — 진화 전 ×2)
    { id: 'rattata', materials: ['pidgey', 'nidoran_m'] },                                  // 꼬렛 = 구구 + 니드런♂  (작은 짐승 · 소환으로도 나온다)
    { id: 'spearow', materials: ['pidgey', 'caterpie'] },                                   // 깨비참 = 구구 + 캐터피  (벌레 먹는 새 · 소환으로도 나온다)
    { id: 'ekans', materials: ['weedle', 'nidoran_f'] },                                    // 아보 = 뿔충이 + 니드런♀  (독 뱀 · 소환으로도 나온다)
    { id: 'sandshrew', materials: ['geodude', 'nidoran_m'] },                               // 모래두지 = 꼬마돌 + 니드런♂  (땅 파는 짐승 · 소환으로도 나온다)
    { id: 'vulpix', materials: ['charmander', 'abra'] },                                    // 식스테일 = 파이리 + 캐이시  (신비한 불꽃 여우 · 소환으로도 나온다)
    { id: 'zubat', materials: ['gastly', 'pidgey'] },                                       // 주뱃 = 고오스 + 구구  (밤의 박쥐 · 소환으로도 나온다)
    { id: 'paras', materials: ['caterpie', 'oddish'] },                                     // 파라스 = 캐터피 + 뚜벅쵸  (버섯 벌레 · 소환으로도 나온다)
    { id: 'venonat', materials: ['weedle', 'caterpie'] },                                   // 콘팡 = 뿔충이 + 캐터피  (벌레 둘 · 소환으로도 나온다)
    { id: 'mankey', materials: ['machop', 'nidoran_m'] },                                   // 망키 = 알통몬 + 니드런♂  (싸움꾼 · 소환으로도 나온다)
    { id: 'tentacool', materials: ['poliwag', 'weedle'] },                                  // 왕눈해 = 발챙이 + 뿔충이  (물 + 독침 · 소환으로도 나온다)
    { id: 'doduo', materials: ['pidgey', 'machop'] },                                       // 두두 = 구구 + 알통몬  (달리는 새 · 소환으로도 나온다)
    { id: 'seel', materials: ['squirtle', 'poliwag'] },                                     // 쥬쥬 = 꼬부기 + 발챙이  (바다 · 소환으로도 나온다)
    { id: 'grimer', materials: ['gastly', 'bellsprout'] },                                  // 질퍽이 = 고오스 + 모다피  (끈적한 독 · 소환으로도 나온다)
    { id: 'drowzee', materials: ['abra', 'gastly'] },                                       // 슬리프 = 캐이시 + 고오스  (꿈 · 소환으로도 나온다)
    { id: 'krabby', materials: ['squirtle', 'geodude'] },                                   // 크랩 = 꼬부기 + 꼬마돌  (딱딱한 껍데기 · 소환으로도 나온다)
    { id: 'voltorb', materials: ['geodude', 'charmander'] },                                // 찌리리공 = 꼬마돌 + 파이리  (터지는 돌 · 소환으로도 나온다)
    { id: 'exeggcute', materials: ['bulbasaur', 'abra'] },                                  // 아라리 = 이상해씨 + 캐이시  (씨앗 · 알 · 소환으로도 나온다)
    { id: 'koffing', materials: ['gastly', 'nidoran_m'] },                                  // 또가스 = 고오스 + 니드런♂  (독가스 · 소환으로도 나온다)
    { id: 'goldeen', materials: ['poliwag', 'nidoran_f'] },                                 // 콘치 = 발챙이 + 니드런♀  (뿔 물고기 · 소환으로도 나온다)
    { id: 'horsea', materials: ['squirtle', 'nidoran_m'] },                                 // 쏘드라 = 꼬부기 + 니드런♂  (바다의 새끼 용 · 소환으로도 나온다)
    { id: 'staryu', materials: ['squirtle', 'abra'] },                                      // 별가사리 = 꼬부기 + 캐이시  (바다의 별 · 소환으로도 나온다)

    /* ---------- 특별함 (27) ---------- */
    { id: 'growlithe', materials: ['vulpix', 'machop'] },                                   // 가디 = 식스테일 + 알통몬  (충성스러운 불꽃 개 · 소환으로도 나온다)
    { id: 'ponyta', materials: ['vulpix', 'doduo'] },                                       // 포니타 = 식스테일 + 두두  (달리는 불꽃 · 소환으로도 나온다)
    { id: 'magnemite', materials: ['voltorb', 'geodude'] },                                 // 코일 = 찌리리공 + 꼬마돌  (자석 돌 · 소환으로도 나온다)
    { id: 'shellder', materials: ['seel', 'squirtle'] },                                    // 셀러 = 쥬쥬 + 꼬부기  (조개 · 소환으로도 나온다)
    { id: 'rhyhorn', materials: ['sandshrew', 'geodude'] },                                 // 뿔카노 = 모래두지 + 꼬마돌  (뿔 · 바위 · 소환으로도 나온다)
    { id: 'omanyte', materials: ['staryu', 'geodude'] },                                    // 암나이트 = 별가사리 + 꼬마돌  (바다 화석 · 소환으로도 나온다)
    { id: 'kabuto', materials: ['krabby', 'geodude'] },                                     // 투구 = 크랩 + 꼬마돌  (껍질 화석 · 소환으로도 나온다)
    { id: 'raticate', materials: ['rattata', 'mankey'] },                                   // 레트라 = 꼬렛 + 망키  (싸움 쥐)
    { id: 'fearow', materials: ['spearow', 'doduo'] },                                      // 깨비드릴조 = 깨비참 + 두두  (날쌘 부리)
    { id: 'arbok', materials: ['ekans', 'koffing'] },                                       // 아보크 = 아보 + 또가스  (독 코브라)
    { id: 'golbat', materials: ['zubat', 'drowzee'] },                                      // 골뱃 = 주뱃 + 슬리프  (밤의 흡혈)
    { id: 'parasect', materials: ['paras', 'venonat'] },                                    // 파라섹트 = 파라스 + 콘팡  (버섯 벌레)
    { id: 'venomoth', materials: ['venonat', 'zubat'] },                                    // 도나리 = 콘팡 + 주뱃  (독 날개)
    { id: 'primeape', recipes: [['mankey', 'machoke'], ['mankey', 'nidorino']] },           // 성원숭 = 망키 + 근육몬  또는  망키 + 니드리노  (분노의 주먹)
    { id: 'dodrio', materials: ['doduo', 'pidgeotto'] },                                    // 두트리오 = 두두 + 피죤  (세 머리 새)
    { id: 'muk', materials: ['grimer', 'koffing'] },                                        // 질뻐기 = 질퍽이 + 또가스  (오물)
    { id: 'electrode', materials: ['voltorb', 'voltorb', 'charmander'] },                   // 붐볼 = 찌리리공 + 찌리리공 + 파이리  (대폭발)
    { id: 'weezing', materials: ['koffing', 'koffing', 'gastly'] },                         // 또도가스 = 또가스 + 또가스 + 고오스  (독가스 구름)
    { id: 'seaking', materials: ['goldeen', 'seel'] },                                      // 왕콘치 = 콘치 + 쥬쥬  (왕 물고기)
    { id: 'seadra', materials: ['horsea', 'tentacool'] },                                   // 시드라 = 쏘드라 + 왕눈해  (독 먹물)
    { id: 'vaporeon', materials: ['eevee', 'seel'] },                                       // 샤미드 = 이브이🔒 + 쥬쥬  (이브이 + 물)
    { id: 'jolteon', materials: ['eevee', 'voltorb'] },                                     // 쥬피썬더 = 이브이🔒 + 찌리리공  (이브이 + 전기)
    { id: 'flareon', materials: ['eevee', 'vulpix'] },                                      // 부스터 = 이브이🔒 + 식스테일  (이브이 + 불꽃)
    { id: 'golduck', materials: ['psyduck', 'drowzee'] },                                   // 골덕 = 고라파덕🔒 + 슬리프  (초능력 오리)
    { id: 'persian', materials: ['meowth', 'rattata'] },                                    // 페르시온 = 나옹🔒 + 꼬렛  (고양이)
    { id: 'dugtrio', materials: ['diglett', 'sandshrew'] },                                 // 닥트리오 = 디그다🔒 + 모래두지  (땅굴 셋)
    { id: 'marowak', materials: ['cubone', 'sandshrew'] },                                  // 텅구리 = 탕구리🔒 + 모래두지  (뼈 · 땅)

    /* ---------- 희귀함 (17) ---------- */
    { id: 'sandslash', materials: ['sandshrew', 'dugtrio', 'graveler'] },                   // 고지 = 모래두지 + 닥트리오 + 데구리  (모래 가시)
    { id: 'tentacruel', materials: ['tentacool', 'seadra', 'koffing'] },                    // 독파리 = 왕눈해 + 시드라 + 또가스  (바다 독)
    { id: 'dewgong', materials: ['seel', 'seaking', 'shellder'] },                          // 쥬레곤 = 쥬쥬 + 왕콘치 + 셀러  (얼음 바다)
    { id: 'exeggutor', materials: ['exeggcute', 'ivysaur', 'abra', 'abra'] },               // 나시 = 아라리 + 이상해풀 + 캐이시 + 캐이시  (야자 · 초능력)
    { id: 'kingler', materials: ['krabby', 'kabuto', 'primeape'] },                         // 킹크랩 = 크랩 + 투구 + 성원숭  (거대 집게)
    { id: 'hypno', materials: ['drowzee', 'kadabra', 'jigglypuff'] },                       // 슬리퍼 = 슬리프 + 윤겔라 + 푸린🔒  (최면 · 노래)
    { id: 'slowbro', materials: ['slowpoke', 'shellder', 'golduck'] },                      // 야도란 = 야돈🔒 + 셀러 + 골덕  (셀러가 꼬리를 물다(원작))
    { id: 'wigglytuff', materials: ['jigglypuff', 'clefairy', 'abra', 'abra'] },            // 푸크린 = 푸린🔒 + 삐삐🔒 + 캐이시 + 캐이시  (노래 · 요정)
    { id: 'dragonair', materials: ['dratini', 'seadra', 'arbok'] },                         // 신뇽 = 미뇽🔒 + 시드라 + 아보크  (용 · 뱀)
    { id: 'magneton', materials: ['magnemite', 'electrode', 'voltorb'] },                   // 레어코일 = 코일 + 붐볼 + 찌리리공  (자석 셋)
    { id: 'omastar', materials: ['omanyte', 'seaking', 'kabuto'] },                         // 암스타 = 암나이트 + 왕콘치 + 투구  (바다 화석)
    { id: 'kabutops', materials: ['kabuto', 'primeape', 'fearow'] },                        // 투구푸스 = 투구 + 성원숭 + 깨비드릴조  (칼날 화석)
    { id: 'butterfree', materials: ['metapod', 'venomoth', 'kakuna'] },                     // 버터플 = 단데기 + 도나리 + 딱충이  (날개 벌레)
    { id: 'beedrill', materials: ['kakuna', 'seaking', 'fearow'] },                         // 독침붕 = 딱충이 + 왕콘치 + 깨비드릴조  (독침)
    { id: 'rapidash', materials: ['ponyta', 'flareon', 'doduo'] },                          // 날쌩마 = 포니타 + 부스터 + 두두  (불꽃 말)
    { id: 'vileplume', materials: ['gloom', 'parasect', 'exeggcute'] },                     // 라플레시아 = 냄새꼬 + 파라섹트 + 아라리  (꽃)
    { id: 'victreebel', materials: ['weepinbell', 'muk', 'ivysaur'] },                      // 우츠보트 = 우츠동 + 질뻐기 + 이상해풀  (식충 · 독)

    /* ---------- 전설 (21) ---------- */
    { id: 'venusaur', materials: ['ivysaur', 'vileplume', 'victreebel'] },                  // 이상해꽃 = 이상해풀 + 라플레시아 + 우츠보트  (풀 (요청 예시))
    { id: 'charizard', materials: ['charmeleon', 'rapidash', 'dodrio'] },                   // 리자몽 = 리자드 + 날쌩마 + 두트리오  (불꽃 · 비행)
    { id: 'blastoise', materials: ['wartortle', 'slowbro', 'dewgong'] },                    // 거북왕 = 어니부기 + 야도란 + 쥬레곤  (물)
    { id: 'pidgeot', materials: ['pidgeotto', 'butterfree', 'dodrio'] },                    // 피죤투 = 피죤 + 버터플 + 두트리오  (새)
    { id: 'nidoqueen', materials: ['nidorina', 'sandslash', 'omastar'] },                   // 니드퀸 = 니드리나 + 고지 + 암스타  (여왕)
    { id: 'nidoking', materials: ['nidorino', 'beedrill', 'sandslash'] },                   // 니드킹 = 니드리노 + 독침붕 + 고지  (왕 · 뿔)
    { id: 'poliwrath', materials: ['poliwhirl', 'politoed', 'primeape'] },                  // 강챙이 = 슈륙챙이 + 왕구리🔒 + 성원숭  (격투 개구리 (히든 재료))
    { id: 'alakazam', materials: ['kadabra', 'hypno', 'mr_mime'] },                         // 후딘 = 윤겔라 + 슬리퍼 + 마임맨🔒  (에스퍼 (히든 재료))
    { id: 'machamp', materials: ['machoke', 'hitmonlee', 'hitmonchan'] },                   // 괴력몬 = 근육몬 + 시라소몬🔒 + 홍수몬🔒  (격투 (히든 재료 둘))
    { id: 'golem', materials: ['graveler', 'onix', 'sandslash'] },                          // 딱구리 = 데구리 + 롱스톤🔒 + 고지  (바위 (히든 재료))
    { id: 'gengar', materials: ['haunter', 'weezing', 'hypno'] },                           // 팬텀 = 고우스트 + 또도가스 + 슬리퍼  (고스트 · 독)
    { id: 'ninetales', materials: ['vulpix', 'rapidash', 'magmar'] },                       // 나인테일 = 식스테일 + 날쌩마 + 마그마🔒  (아홉 꼬리 (히든 재료))
    { id: 'raichu', materials: ['pikachu', 'magneton', 'electabuzz'] },                     // 라이츄 = 피카츄🔒 + 레어코일 + 에레브🔒  (전기 (히든 재료))
    { id: 'gyarados', materials: ['nidorina', 'magikarp', 'dragonair'] },                   // 갸라도스 = 니드리나 + 잉어킹🔒 + 신뇽  (잉어의 분노 (요청 예시 + 신뇽))
    { id: 'clefable', materials: ['clefairy', 'wigglytuff', 'chansey'] },                   // 픽시 = 삐삐🔒 + 푸크린 + 럭키🔒  (요정 (히든 재료))
    { id: 'dragonite', materials: ['dragonair', 'tentacruel', 'golbat'] },                  // 망나뇽 = 신뇽 + 독파리 + 골뱃  (바다와 하늘의 용)
    { id: 'arcanine', materials: ['growlithe', 'beedrill', 'magmar'] },                     // 윈디 = 가디 + 독침붕 + 마그마🔒  (전설의 개 (히든 재료))
    { id: 'cloyster', materials: ['shellder', 'dewgong', 'jynx'] },                         // 파르셀 = 셀러 + 쥬레곤 + 루주라🔒  (얼음 조개 (히든 재료))
    { id: 'rhydon', materials: ['rhyhorn', 'onix', 'marowak'] },                            // 코뿌리 = 뿔카노 + 롱스톤🔒 + 텅구리  (드릴 뿔 (히든 재료))
    { id: 'starmie', materials: ['staryu', 'magneton', 'mr_mime'] },                        // 아쿠스타 = 별가사리 + 레어코일 + 마임맨🔒  (별 · 에스퍼 (히든 재료))
    { id: 'scyther', materials: ['beedrill', 'butterfree', 'kabutops'] }  // 스라크 = 독침붕 + 버터플 + 투구푸스  (벌레 · 칼날)
  ];

  /* 경로를 하나씩 펼친다. list 의 한 줄 = 경로 하나.
   *   key    경로를 가리키는 이름. 첫 경로는 결과 id, 둘째부터 'id#2'
   *   route  0 부터. 1 이상이면 대체 경로다 */
  var LIST = [];
  for (var i = 0; i < RECIPES.length; i++) {
    var src = RECIPES[i];
    var routes = src.recipes || [src.materials];
    for (var k = 0; k < routes.length; k++) {
      LIST.push({
        id: src.id, materials: routes[k], route: k, routeCount: routes.length,
        key: k === 0 ? src.id : src.id + '#' + (k + 1),
        unlockRound: src.unlockRound == null ? 1 : src.unlockRound
      });
    }
  }

  var RecipeData = { list: LIST, byResult: {}, byKey: {}, byMaterial: {} };
  for (var j = 0; j < LIST.length; j++) {
    var r = LIST[j];
    (RecipeData.byResult[r.id] = RecipeData.byResult[r.id] || []).push(r);
    RecipeData.byKey[r.key] = r;
    var seen = {};
    for (var m = 0; m < r.materials.length; m++) {
      var mat = r.materials[m];
      if (seen[mat]) continue;              // 같은 재료가 두 번 들어가도 "쓰이는 곳"엔 한 번만
      seen[mat] = true;
      if (!RecipeData.byMaterial[mat]) RecipeData.byMaterial[mat] = [];
      RecipeData.byMaterial[mat].push(r);
    }
  }

  /* 결과의 첫(기본) 경로. 흔함 환산·사전 전개는 이걸 쓴다 — 경로끼리 환산이 같게 맞춰 두었다. */
  RecipeData.get = function (id) { return (this.byResult[id] || [])[0] || null; };
  /* 결과를 만드는 모든 경로 */
  RecipeData.routesOf = function (id) { return this.byResult[id] || []; };
  /* 'machoke#2' 같은 경로 이름으로 */
  RecipeData.byRouteKey = function (key) { return this.byKey[key] || null; };
  RecipeData.tierOf = function (mat) {
    var d = RPD.PokemonData.get(mat);
    return d ? d.tier : null;
  };
  RecipeData.labelOf = function (mat) {
    var d = RPD.PokemonData.get(mat);
    return d ? d.name : mat;
  };
  RecipeData.availableAt = function (round) {
    return this.list.filter(function (r) { return round >= r.unlockRound; });
  };
  RecipeData.usedIn = function (id) { return this.byMaterial[id] || []; };
  /* 재료 하나를 몇 마리 요구하는가 — 같은 흔함 2마리 조합식에서 2 */
  RecipeData.needOf = function (recipe, id) {
    var n = 0;
    for (var i = 0; i < recipe.materials.length; i++) if (recipe.materials[i] === id) n += 1;
    return n;
  };

  RPD.RecipeData = RecipeData;
})(typeof window !== 'undefined' ? window : globalThis);
