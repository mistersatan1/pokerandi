# Claude Code Skills - Pokemon Game Pack

이 패키지는 웹 기반 포켓몬 랜덤 디펜스 개발을 기준으로 만든 커스텀 Claude Code Skills 모음입니다.

## 포함된 Skill

1. game-development-workflow - 기획→구현→테스트→검증
2. systematic-debugging - 재현→원인→수정→회귀검증
3. code-review - 변경 코드 검토
4. pokemon-game-design - 포켓몬 랜덤 디펜스 전용 설계
5. game-balance - 게임 밸런스 검토
6. webgame-testing - 브라우저 게임 테스트
7. asset-pipeline - 게임 에셋 관리
8. feature-implementation - 기능 구현 절차

## 설치

이 폴더의 `.claude` 폴더를 Claude Code로 작업할 게임 프로젝트의 루트에 그대로 복사하세요.

최종 구조:

프로젝트/
└─ .claude/
   └─ skills/
      ├─ 01-game-development-workflow/
      │  └─ SKILL.md
      ├─ 02-systematic-debugging/
      │  └─ SKILL.md
      ├─ 03-code-review/
      │  └─ SKILL.md
      ├─ 04-pokemon-game-design/
      │  └─ SKILL.md
      ├─ 05-game-balance/
      │  └─ SKILL.md
      ├─ 06-webgame-testing/
      │  └─ SKILL.md
      ├─ 07-asset-pipeline/
      │  └─ SKILL.md
      └─ 08-feature-implementation/
         └─ SKILL.md

Claude Code를 다시 시작하면 프로젝트 Skill을 발견할 수 있습니다.

## 사용 예

자동 매칭을 기대할 수 있지만 명시적으로 호출하려면:

/systematic-debugging
/code-review

처럼 Skill 이름을 사용할 수 있습니다.

## 주의

이것은 워프센스 글에 소개된 외부 레포의 원본 코드를 복제한 것이 아니라,
그 글에서 소개된 개념 중 현재 프로젝트에 필요한 작업 흐름을 독립적으로 작성한 커스텀 Skill입니다.
