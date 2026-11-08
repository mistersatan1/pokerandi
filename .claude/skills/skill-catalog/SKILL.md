---
name: skill-catalog
description: 평소엔 이름만 보이는 스킬들의 용도표. 디자인·UI·애니메이션·Figma·기획·테스트·디버깅·코드 리뷰 작업을 시작할 때 먼저 읽고 맞는 스킬 1~2개를 고른다.
---

# 필요 시 스킬 목록 (pokerandi)

이 저장소는 토큰을 아끼려고 대부분의 스킬을 **이름만 보이게**(`.claude/settings.json`의 `skillOverrides: name-only`) 두었다.
작업이 아래에 해당할 때만 그 스킬을 Skill 도구로 불러 쓴다. 불러지지 않으면 `.claude/skills/<이름>/SKILL.md`를 직접 읽고 따른다.

- 한 작업에 1~2개만 고른다. 같은 칸에 여러 개가 있으면 이 프로젝트 전용 스킬(프로젝트 이름이 들어간 것, CLAUDE.md가 지목한 것)을 먼저 쓴다.
- CLAUDE.md의 규칙이 스킬 내용보다 우선한다.

## 세션 공통·기획
- `grill-me` — 계획·설계를 질문으로 끝까지 검증
- `brainstorming` — 새 기능 아이디어를 설계로 다듬기
- `writing-plans` — 여러 단계 작업의 구현 계획 작성
- `executing-plans` — 작성된 계획을 직접 실행
- `subagent-driven-development` — 계획을 서브에이전트로 나눠 실행
- `dispatching-parallel-agents` — 독립 작업 2개 이상 병렬 처리
- `game-development-workflow` — 웹게임 기능을 기획, 구현, 테스트, 검증하는 전체 개발 절차를 적용한다. 새 기능 추가나 큰 변경 작업을 시작할 때 사용한다
- `feature-implementation` — 사용자가 요청한 웹게임 기능을 기존 코드 구조에 맞춰 최소 변경으로 구현한다. 기능 개발 요청마다 사용한다.
- `pokemon-game-design` — 포켓몬 랜덤 디펜스의 유닛, 조합식, 등급, 시너지, 보스, 라운드, 경제 시스템을 설계하거나 변경할 때 사용한다.
- `game-balance` — 포켓몬 랜덤 디펜스의 소환 확률, 조합식, 성장, 경제, 시너지와 라운드 난이도를 수치적으로 검토한다. 밸런스 변경에 사용한다

## 디버깅·테스트·검증
- `systematic-debugging` — 버그를 재현→원인→최소 수정 순서로
- `test-driven-development` — 테스트 먼저 쓰고 구현
- `verification-before-completion` — 완료 보고 전 실제 검증
- `webgame-testing` — 브라우저 기반 게임의 기능, 게임 상태, UI, 저장/불러오기와 주요 플레이 흐름을 검증한다. 기능 추가 후 테스트에 사용한다
- `break-ui` — 극단 데이터로 UI 깨뜨려 보기

## 코드 리뷰·브랜치 마무리
- `requesting-code-review` — 리뷰어 에이전트에 리뷰 요청
- `receiving-code-review` — 받은 리뷰를 검증하며 반영
- `pokerandi-code-review` — Claude가 수정하거나 새로 만든 코드를 버그, 회귀, 유지보수성 관점에서 검토한다. 기능 구현 직후와 대규모 수정 후 사용
- `using-git-worktrees` — 격리된 작업 공간 만들기
- `finishing-a-development-branch` — 작업 브랜치 병합·PR 마무리

## 화면 디자인·다듬기
- `frontend-design` — 틀에 박히지 않은 시각 방향 잡기
- `game-ui-frontend` — 포랜디의 브라우저 게임 HUD, 전투 화면, 조합식, 시너지, 상점, 유닛 정보와 오버레이를 게임 UI 관점에서 설계한다.
- `pokemon-game-art-direction` — 포랜디만의 게임 비주얼과 아트 디렉션을 유지한다. UI, 등급 연출, 조합, 시너지, 보스, 도감, 이펙트와 신규 콘텐츠의 시
- `asset-pipeline` — 웹게임용 이미지와 스프라이트를 추가하거나 교체할 때 파일 구조, 크기, 투명 배경, 경로, 로딩 오류를 점검한다.

## UI 원칙(필요한 항목만)
- `feedback-patterns` — 저장·완료 피드백
- `micro-interaction-spec` — 작은 상호작용 명세
- `fitts-law` — 버튼 크기·위치(터치)
- `critique-visual-hierarchy` — 기존 화면 시선 흐름 비평
- `critique-information-density` — 기존 화면 정보 밀도 비평

## 애니메이션·모션
- `animate` — 애니메이션을 처음부터 설계·구현
- `review-animations` — 모션 코드 리뷰
- `animation-performance` — 애니메이션 끊김·프레임 문제
- `game-motion-design` — 포랜디의 전투, 조합, 소환, 등급 상승, 시너지, 보스와 보상에 짧고 의미 있는 모션과 이펙트를 설계한다. 브라우저 성능과 
