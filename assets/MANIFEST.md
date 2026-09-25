# 이미지 에셋 목록

`node tools/assets.js` 로 현황을 다시 확인할 수 있다.

## 규격

| 항목 | 값 |
|---|---|
| 포맷 | PNG (투명 배경) |
| 포켓몬 | 96×96 권장 |
| 적 | 64×64 권장 |
| 보스 | 128×128 권장 |

렌더러가 `imageSmoothingEnabled = false` 로 그리므로 픽셀 아트가 뭉개지지 않는다.
정사각형이 아니어도 동작하지만, 중심을 기준으로 정사각형에 맞춰 늘어난다.

파일이 없으면 타입 색상 원 + 이름 첫 글자로 대체된다. **없어도 게임은 끝까지 돌아간다.**

## 필요한 파일 (68개)


### 커먼

| 파일 | 이름 | 비고 |
|---|---|---|
| `assets/pokemon/beedrill.png` | 독침붕 | 3단계 · 벌레/독 · 지속 피해 |
| `assets/pokemon/clefable.png` | 픽시 | 3단계 · 페어리 · 버퍼 |
| `assets/pokemon/clefairy.png` | 삐삐 | 2단계 · 페어리 · 버퍼 |
| `assets/pokemon/cleffa.png` | 삐 | 1단계 · 페어리 · 버퍼 |
| `assets/pokemon/diglett.png` | 디그다 | 1단계 · 땅 · 단일 딜러 |
| `assets/pokemon/dugtrio.png` | 닥트리오 | 2단계 · 땅 · 단일 딜러 |
| `assets/pokemon/geodude.png` | 꼬마돌 | 1단계 · 바위/땅 · 제어 |
| `assets/pokemon/golem.png` | 딱구리 | 3단계 · 바위/땅 · 제어 |
| `assets/pokemon/graveler.png` | 데구리 | 2단계 · 바위/땅 · 제어 |
| `assets/pokemon/kakuna.png` | 딱충이 | 2단계 · 벌레/독 · 지속 피해 |
| `assets/pokemon/magnemite.png` | 코일 | 1단계 · 전기/강철 · 광역 딜러 |
| `assets/pokemon/magneton.png` | 레어코일 | 2단계 · 전기/강철 · 광역 딜러 |
| `assets/pokemon/pidgeot.png` | 피죤투 | 3단계 · 비행 · 단일 딜러 |
| `assets/pokemon/pidgeotto.png` | 피죤 | 2단계 · 비행 · 단일 딜러 |
| `assets/pokemon/pidgey.png` | 구구 | 1단계 · 비행 · 단일 딜러 |
| `assets/pokemon/weedle.png` | 뿔충이 | 1단계 · 벌레/독 · 지속 피해 |

### 레어

| 파일 | 이름 | 비고 |
|---|---|---|
| `assets/pokemon/blastoise.png` | 거북왕 | 3단계 · 물 · 감속 |
| `assets/pokemon/bulbasaur.png` | 이상해씨 | 1단계 · 풀 · 골드 |
| `assets/pokemon/charizard.png` | 리자몽 | 3단계 · 불꽃/비행 · 광역 딜러 |
| `assets/pokemon/charmander.png` | 파이리 | 1단계 · 불꽃 · 광역 딜러 |
| `assets/pokemon/charmeleon.png` | 리자드 | 2단계 · 불꽃 · 광역 딜러 |
| `assets/pokemon/eevee.png` | 이브이 | 1단계 · 노말 · 단일 딜러 |
| `assets/pokemon/flareon.png` | 부스터 | 2단계 · 불꽃 · 단일 딜러 |
| `assets/pokemon/golduck.png` | 골덕 | 2단계 · 물/에스퍼 · 버퍼 |
| `assets/pokemon/ivysaur.png` | 이상해풀 | 2단계 · 풀 · 골드 |
| `assets/pokemon/jolteon.png` | 쥬피썬더 | 2단계 · 전기 · 광역 딜러 |
| `assets/pokemon/machamp.png` | 괴력몬 | 3단계 · 격투 · 보스 킬러 |
| `assets/pokemon/machoke.png` | 근육몬 | 2단계 · 격투 · 보스 킬러 |
| `assets/pokemon/machop.png` | 알통몬 | 1단계 · 격투 · 보스 킬러 |
| `assets/pokemon/pikachu.png` | 피카츄 | 1단계 · 전기 · 광역 딜러 |
| `assets/pokemon/psyduck.png` | 고라파덕 | 1단계 · 물/에스퍼 · 버퍼 |
| `assets/pokemon/raichu.png` | 라이츄 | 2단계 · 전기 · 광역 딜러 |
| `assets/pokemon/squirtle.png` | 꼬부기 | 1단계 · 물 · 감속 |
| `assets/pokemon/vaporeon.png` | 샤미드 | 2단계 · 물 · 감속 |
| `assets/pokemon/venusaur.png` | 이상해꽃 | 3단계 · 풀 · 골드 |
| `assets/pokemon/wartortle.png` | 어니부기 | 2단계 · 물 · 감속 |

### 에픽

| 파일 | 이름 | 비고 |
|---|---|---|
| `assets/pokemon/bagon.png` | 아공이 | 1단계 · 드래곤 · 단일 딜러 |
| `assets/pokemon/gabite.png` | 한바이트 | 2단계 · 드래곤/땅 · 광역 딜러 |
| `assets/pokemon/garchomp.png` | 한카리아스 | 3단계 · 드래곤/땅 · 광역 딜러 |
| `assets/pokemon/gastly.png` | 고오스 | 1단계 · 고스트 · 디버퍼 |
| `assets/pokemon/gengar.png` | 팬텀 | 3단계 · 고스트 · 디버퍼 |
| `assets/pokemon/gible.png` | 딥상어동 | 1단계 · 드래곤/땅 · 광역 딜러 |
| `assets/pokemon/haunter.png` | 고우스트 | 2단계 · 고스트/독 · 디버퍼 |
| `assets/pokemon/houndoom.png` | 헬가 | 2단계 · 악/불꽃 · 지속 피해 |
| `assets/pokemon/houndour.png` | 델빌 | 1단계 · 악/불꽃 · 지속 피해 |
| `assets/pokemon/lucario.png` | 루카리오 | 2단계 · 격투/강철 · 보스 킬러 |
| `assets/pokemon/riolu.png` | 리올 | 1단계 · 격투 · 보스 킬러 |
| `assets/pokemon/salamence.png` | 보만다 | 3단계 · 드래곤/비행 · 단일 딜러 |
| `assets/pokemon/shelgon.png` | 쉘곤 | 2단계 · 드래곤 · 단일 딜러 |

### 전설

| 파일 | 이름 | 비고 |
|---|---|---|
| `assets/pokemon/articuno.png` | 프리져 | 1단계 · 얼음/비행 · 제어 |
| `assets/pokemon/groudon.png` | 그란돈 | 1단계 · 땅 · 광역 딜러 |
| `assets/pokemon/mewtwo.png` | 뮤츠 | 1단계 · 에스퍼 · 보스 킬러 |
| `assets/pokemon/rayquaza.png` | 레쿠쟈 | 1단계 · 드래곤/비행 · 단일 딜러 |
| `assets/pokemon/zapdos.png` | 썬더 | 1단계 · 전기/비행 · 광역 딜러 |

### 신화

| 파일 | 이름 | 비고 |
|---|---|---|
| `assets/pokemon/jirachi.png` | 지라치 | 1단계 · 강철/에스퍼 · 특수 |
| `assets/pokemon/mew.png` | 뮤 | 1단계 · 에스퍼 · 특수 |

### 적

| 파일 | 이름 | 비고 |
|---|---|---|
| `assets/enemies/armored.png` | 철갑 | 방어형 |
| `assets/enemies/grunt.png` | 잡졸 | 기본 |
| `assets/enemies/regen.png` | 재생체 | 재생 |
| `assets/enemies/shielded.png` | 보막 | 보호막 |
| `assets/enemies/splitling.png` | 파편 | 분열 잔해 |
| `assets/enemies/splitter.png` | 분열체 | 분열 |
| `assets/enemies/swarm.png` | 무리 | 군집 |
| `assets/enemies/swift.png` | 질풍 | 고속 |
| `assets/enemies/tank.png` | 육중 | 탱커 |

### 보스

| 파일 | 이름 | 비고 |
|---|---|---|
| `assets/enemies/boss_breaker.png` | 파괴자 | 보스 |
| `assets/enemies/boss_charger.png` | 폭주대장 | 보스 |
| `assets/enemies/boss_warden.png` | 방해자 | 보스 |


## 55-slot original monster asset pack

All 55 `assets/pokemon/*.png` files are 96×96 transparent PNGs and match the game's current Pokémon IDs. These are original replacement creatures, not official Pokémon artwork.


## 55종 스프라이트 시트 적용
- 업로드된 55종 스프라이트 시트에서 각 캐릭터를 개별 PNG로 분리했습니다.
- `assets/pokemon/`에는 게임 데이터 ID와 일치하는 55개의 96×96 RGBA PNG가 들어 있습니다.
