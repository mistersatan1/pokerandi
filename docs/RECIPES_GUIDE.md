# 조합식 직접 바꾸기 (조합식 개편 v2)

조합식은 **`js/data/recipes.js`**, 주문(히든·불멸)은 **`js/data/spells.js`** 에만 있다.
게임 로직은 건드리지 않아도 된다. 저장하고 브라우저를 새로고침하면 바로 반영된다.

> `tools/gen1/` 의 생성 스크립트는 옛 규칙("진화 전 ×2 + 아무거나")용이라 실행하면 멈추게 막아 두었다.
> 돌리면 v2 조합식이 통째로 덮어써진다.

---

## 1. 한 줄 = 조합식 하나

```js
{ id: 'metapod', materials: ['caterpie', 'caterpie'] },   // 단데기 = 캐터피 + 캐터피
```

| 칸 | 뜻 |
|---|---|
| `id` | 만들어지는 포켓몬 |
| `materials` | 재료 2~4마리. 같은 포켓몬을 두 번 쓰면 "2마리 필요"가 된다 |
| 오른쪽 `//` 주석 | 사람이 읽기 위한 한글 이름(🔒 는 히든 재료). 게임은 읽지 않는다 |

재료는 **전부 특정 포켓몬**이다. 예전의 `any:타입:등급`("아무거나") 칸은 없앴다 —
판마다 계열을 추첨하던 시절의 장치였고, 지금은 152종이 항상 전부 나온다.

### 경로가 둘인 조합식 (OR-조합식)

```js
{ id: 'machoke', recipes: [['machop', 'machop'], ['bellsprout', 'bulbasaur']] },
// 근육몬 = 알통몬 + 알통몬  또는  모다피 + 이상해씨
```

`materials` 대신 `recipes` 에 재료 묶음을 둘 적으면 **둘 중 아무거나**로 만들어진다.
병목(여러 결과가 한 재료에 기대는 곳)을 풀 때 쓴다. 지금은 근육몬·성원숭 두 개.

- 조합식 목록에는 경로마다 한 줄씩 **"경로 1 · 경로 2"** 로 따로 보인다. 줄을 누르면 그 경로로 만든다.
- 하단 [조합] 버튼이나 결과 이름으로 부르면 적힌 순서대로 되는 경로를 쓴다.
- **두 경로의 흔함 환산은 같게** 맞춘다(검사가 본다). 한쪽이 싸면 비싼 쪽은 아무도 안 쓴다.
- 경로는 최대 둘.

### 히든(🔒) 재료

히든은 조합식 목록에 없고 **채팅 주문**으로만 만든다. 하지만 **재료로는 쓰인다**
(`이브이🔒 + 쥬쥬 → 샤미드`). 히든은 등급이 아니라 **얻는 법**이다 — 안흔함부터 전설까지 있다.

### 메타몽

메타몽은 조합에서 **모자란 흔함 한 마리를 대신**한다. 조합식에는 적지 않는다.
v2 에서 메타몽 자신이 히든(흔함 4마리 + 주문)이 됐다.

---

## 2. 주문 (히든 · 불멸) — `js/data/spells.js`

```js
{ id: 'pikachu', kind: 'hidden', result: 'pikachu',
  phrase: '너로 정했다',
  materials: ['bulbasaur', 'charmander', 'squirtle', 'caterpie'],
  lines: ['대사 한 줄', '다음 줄', '마지막 줄'] },
```

| 칸 | 뜻 |
|---|---|
| `kind` | `hidden` 히든 · `immortal` 불멸 · `transcend` 초월(v2 범위 밖, 예전 그대로) |
| `phrase` | 외칠 주문. 띄어쓰기·문장부호는 무시한다. **다른 주문과 겹치면 안 된다** |
| `result` | 히든이면 `pokemon.js` 에서 `hidden:true` 인 종이어야 한다 |
| `lines` | 성공 연출 대사 |

불멸은 재료가 **전설 3마리**, 결과는 파이어·썬더·프리져·뮤츠·뮤 원본 종이다.

---

## 3. 지켜야 할 규칙

바꾼 뒤 실행하면 규칙을 어긴 줄을 알려 준다.

```bash
node tools/redesigncheck.js
```

| 규칙 | 이유 |
|---|---|
| 결과가 재료보다 **높은 등급** (주문 포함) | 상위 개체를 갈아 하위를 만들면 앞뒤가 안 맞는다 |
| 재료는 전부 특정 포켓몬 | "아무거나"는 v2 에서 없앴다 |
| **같은 재료로 서로 다른 결과 금지** (경로·주문 포함) | 무엇이 만들어질지 예측할 수 없다 |
| 재료 2~4마리 | 그 이상은 완성까지 너무 멀다 |
| 흔함이 아닌 종은 **조합식 또는 주문 중 정확히 하나** | 얻는 법이 겹치면 사전·추천이 헷갈린다 |
| OR-조합식은 경로 둘까지, **흔함 환산이 같게** | 싼 길만 쓰인다 |
| 순환 없음 — 모든 종이 흔함에서 출발 | 영원히 못 만드는 종이 생긴다 |
| 주문 문구가 겹치지 않는다 | 먼저 적힌 것만 불린다 |

진화 순서는 규칙이 아니다. 진화 전 ×2 가 기본이지만, v2 는 **연관성**으로 묶는다
(잉어킹 → 갸라도스처럼 건너뛰어도, 다른 계열을 섞어도 된다).

규칙을 어기면 이렇게 나온다.

```
  FAIL  같은 재료로 서로 다른 결과가 나오지 않는다  → weedle+weedle→metapod,kakuna
```

---

## 4. 밸런스에 주는 영향

조합식은 **판의 속도**를 정한다. 크게 바꿨다면 한 번 돌려 본다.

```bash
node tools/autoplay.js 20
```

봇은 모든 주문을 안다고 치고, 재료가 모이면 바로 외친다(불멸은 필드가 거의 찼을 때만).

---

## 5. 포켓몬 id 표 (🔒 = 히든, 주문으로만)

| 등급 | 한글 → id |
|---|---|
| 흔함 (15) | 고오스 `gastly` · 구구 `pidgey` · 꼬마돌 `geodude` · 꼬부기 `squirtle` · 니드런♀ `nidoran_f` · 니드런♂ `nidoran_m` · 뚜벅쵸 `oddish` · 모다피 `bellsprout` · 발챙이 `poliwag` · 뿔충이 `weedle` · 알통몬 `machop` · 이상해씨 `bulbasaur` · 캐이시 `abra` · 캐터피 `caterpie` · 파이리 `charmander` |
| 안흔함 (48) | 고라파덕🔒 `psyduck` · 고우스트 `haunter` · 근육몬 `machoke` · 깨비참 `spearow` · 꼬렛 `rattata` · 나옹🔒 `meowth` · 냄새꼬 `gloom` · 니드리나 `nidorina` · 니드리노 `nidorino` · 단데기 `metapod` · 데구리 `graveler` · 두두 `doduo` · 디그다🔒 `diglett` · 딱충이 `kakuna` · 또가스 `koffing` · 리자드 `charmeleon` · 망키 `mankey` · 메타몽🔒 `ditto` · 모래두지 `sandshrew` · 미뇽🔒 `dratini` · 별가사리 `staryu` · 삐삐🔒 `clefairy` · 슈륙챙이 `poliwhirl` · 슬리프 `drowzee` · 식스테일 `vulpix` · 쏘드라 `horsea` · 아라리 `exeggcute` · 아보 `ekans` · 야돈🔒 `slowpoke` · 어니부기 `wartortle` · 왕눈해 `tentacool` · 우츠동 `weepinbell` · 윤겔라 `kadabra` · 이브이🔒 `eevee` · 이상해풀 `ivysaur` · 잉어킹🔒 `magikarp` · 주뱃 `zubat` · 쥬쥬 `seel` · 질퍽이 `grimer` · 찌리리공 `voltorb` · 콘치 `goldeen` · 콘팡 `venonat` · 크랩 `krabby` · 탕구리🔒 `cubone` · 파라스 `paras` · 푸린🔒 `jigglypuff` · 피죤 `pidgeotto` · 피카츄🔒 `pikachu` |
| 특별함 (33) | 가디 `growlithe` · 골덕 `golduck` · 골뱃 `golbat` · 깨비드릴조 `fearow` · 내루미🔒 `lickitung` · 닥트리오 `dugtrio` · 덩쿠리🔒 `tangela` · 도나리 `venomoth` · 두트리오 `dodrio` · 또도가스 `weezing` · 레트라 `raticate` · 부스터 `flareon` · 붐볼 `electrode` · 뿔카노 `rhyhorn` · 샤미드 `vaporeon` · 성원숭 `primeape` · 셀러 `shellder` · 시드라 `seadra` · 아보크 `arbok` · 암나이트 `omanyte` · 왕콘치 `seaking` · 쥬피썬더 `jolteon` · 질뻐기 `muk` · 캥카🔒 `kangaskhan` · 켄타로스🔒 `tauros` · 코일 `magnemite` · 텅구리 `marowak` · 투구 `kabuto` · 파라섹트 `parasect` · 파오리🔒 `farfetchd` · 페르시온 `persian` · 포니타 `ponyta` · 폴리곤🔒 `porygon` |
| 희귀함 (27) | 고지 `sandslash` · 나시 `exeggutor` · 날쌩마 `rapidash` · 독침붕 `beedrill` · 독파리 `tentacruel` · 라플레시아 `vileplume` · 럭키🔒 `chansey` · 레어코일 `magneton` · 롱스톤🔒 `onix` · 루주라🔒 `jynx` · 마그마🔒 `magmar` · 마임맨🔒 `mr_mime` · 버터플 `butterfree` · 쁘사이저🔒 `pinsir` · 슬리퍼 `hypno` · 시라소몬🔒 `hitmonlee` · 신뇽 `dragonair` · 암스타 `omastar` · 야도란 `slowbro` · 에레브🔒 `electabuzz` · 왕구리🔒 `politoed` · 우츠보트 `victreebel` · 쥬레곤 `dewgong` · 킹크랩 `kingler` · 투구푸스 `kabutops` · 푸크린 `wigglytuff` · 홍수몬🔒 `hitmonchan` |
| 전설 (24) | 강챙이 `poliwrath` · 갸라도스 `gyarados` · 거북왕 `blastoise` · 괴력몬 `machamp` · 나인테일 `ninetales` · 니드퀸 `nidoqueen` · 니드킹 `nidoking` · 딱구리 `golem` · 라이츄 `raichu` · 라프라스🔒 `lapras` · 리자몽 `charizard` · 망나뇽 `dragonite` · 스라크 `scyther` · 아쿠스타 `starmie` · 윈디 `arcanine` · 이상해꽃 `venusaur` · 잠만보🔒 `snorlax` · 코뿌리 `rhydon` · 파르셀 `cloyster` · 팬텀 `gengar` · 프테라🔒 `aerodactyl` · 피죤투 `pidgeot` · 픽시 `clefable` · 후딘 `alakazam` |
| 불멸 (5) | 뮤 `mew` · 뮤츠 `mewtwo` · 썬더 `zapdos` · 파이어 `moltres` · 프리져 `articuno` |
