# 외부 스킬·에이전트 출처

`.claude/skills`, `.claude/agents`, `.mcp.json`에 넣은 것들의 원본 기록이다. 모두 2026-11-08에 GitHub 공개 저장소에서 얕게 복제해 가져왔고, **내용은 수정하지 않았다**(폴더 이름만 아래 표처럼 정함).
스킬은 Claude에게 주는 지시문이고 일부는 스크립트를 실행하므로, 새로 넣거나 갱신할 때는 내용과 스크립트를 먼저 읽어 본다.

## 스킬

| 요청 이름 | 설치한 폴더 | 원본 | 커밋 | 라이선스 |
|---|---|---|---|---|
| frontend-design | `frontend-design` | https://github.com/anthropics/skills (skills/frontend-design) | 2c5958e | Apache-2.0 (폴더의 LICENSE.txt) |
| design-taste-frontend | `design-taste-frontend` | https://github.com/Leonxlnx/taste-skill (skills/taste-skill, v2.5.1) | f6b7657 | MIT |
| animate | `impeccable` (`/impeccable animate`) | https://github.com/pbakaus/impeccable (.claude/skills/impeccable, v4.8.1) | 924bbd1 | Apache-2.0 |
| figma | `figma-use`, `figma-design-to-code`, `figma-generate-design`, `figma-code-connect`, `figma-code-workflows`, `figma-implement-motion`, `figma-create-new-file` | https://github.com/figma/mcp-server-guide (skills/) | 19be8d5 | 저장소에 라이선스 파일 없음 (Figma 공식) |
| playwright-mcp | `.mcp.json`의 `playwright` | https://github.com/microsoft/playwright-mcp (npm `@playwright/mcp@0.0.83`) | – | Apache-2.0 |
| brandkit | `brandkit` | https://github.com/Leonxlnx/imagegen-skills (skills/brandkit) | beb16b0 | MIT |
| designer-skills | 아래 22개 | https://github.com/Owl-Listener/designer-skills | 9a6930c | MIT |
| grill-me | `grill-me` | https://github.com/mattpocock/skills (skills/productivity/grill-me) | 4ae2317 | MIT |
| superpowers | 15개 전부 (`using-superpowers`, `brainstorming`, `writing-plans`, `executing-plans`, `systematic-debugging`, `test-driven-development`, `verification-before-completion` 등) | https://github.com/obra/superpowers (skills/) | 22f0b46 | MIT |
| ui-ux-pro-max | `ui-ux-pro-max` | https://github.com/nextlevelbuilder/ui-ux-pro-max-skill (.claude/skills/ui-ux-pro-max) | 4f2dbb6 | MIT |
| unslop | `unslop` | https://github.com/heydamir/unslop (skills/unslop) | a6f121e | CC-BY-4.0 (저작자 표시: Damir Sokolovsky, 폴더의 LICENSE.upstream) |
| emilkowalski/skills | 15개: `animate`, `improve-animations`, `remove-animations`, `review-animations`, `find-animation-opportunities`, `animation-performance`, `animation-vocabulary`, `choreograph`, `apple-design`, `emil-design-eng`, `break-ui`, `prototype`, `pick-ui-library`, `mobile-native`, `ask-sonner` | https://github.com/emilkowalski/skills (skills/) | c8a7962 | MIT |

emilkowalski/skills 17개 중 `write-swift`(Swift 앱용), `animate-expo`(React Native·Expo용)는 웹 프로젝트와 관계없어 넣지 않았다.

### designer-skills에서 고른 22개 (111개 중 웹 UI 관련만)
- ui-design: color-system, responsive-design, spacing-system, typography-scale, visual-hierarchy, layout-grid, platform-conventions
- interaction-design: form-design, error-handling-ux, loading-states, feedback-patterns, navigation-patterns, search-ux, micro-interaction-spec, fitts-law, onboarding-design
- ux-strategy: information-architecture, design-brief, content-strategy
- visual-critique: critique-visual-hierarchy, critique-information-density, critique-affordance

전부 넣으면 세션 시작 때 스킬 설명만으로 토큰을 많이 쓰므로 뺐다. 나머지(리서치·디자인옵스·프로토타이핑 등)가 필요하면 원본에서 같은 방식으로 추가한다.

## 에이전트 (`.claude/agents`)
사용자 저장소 `mistersatan1/closing-d7`의 `.claude/agents`에서 복사했다. 그 원본은 https://github.com/msitarzewski/agency-agents (MIT, `LICENSE.agency-agents`).

| 역할 | 에이전트 |
|---|---|
| UI·UX 디자인 | design-ui-designer, design-ux-architect, design-ux-researcher, design-brand-guardian, design-ui-finish-gate-reviewer |
| 기획 | product-manager, product-sprint-prioritizer, product-feedback-synthesizer |
| 개발·검증 | engineering-frontend-developer, engineering-minimal-change-engineer, testing-accessibility-auditor, testing-evidence-collector |

## 실행·네트워크 관련 확인 사항
- `impeccable`: 처음 실행할 때 `scripts/impeccable`이 GitHub Releases(pbakaus/impeccable)에서 실행 파일을 내려받고 `engine-checksums.txt`의 SHA-256으로 검증한다.
- `design-taste-frontend`: 폴더가 약 40MB(예시 에셋)다. 검사 스크립트(`scripts/*.mjs`)는 브라우저에서 화면을 검사하고, `photos.mjs`·`icons.mjs`는 사진·아이콘을 인터넷에서 내려받는다.
- `ui-ux-pro-max`: Python 스크립트(`scripts/search.py` 등)로 CSV 데이터를 검색한다. Python 3가 필요하다.
- `unslop`: `scripts/snapshot.mjs`는 열린 페이지의 스타일시트를 읽고, `scripts/story.mjs`는 로컬 ffmpeg로 전후 비교 영상을 만든다.
- `figma-*`: Figma MCP 서버(`.mcp.json`의 `figma`)가 연결되고 Figma 로그인이 되어 있어야 동작한다.

## 이 저장소에 적용한 내용 (2026-11-08)
기준 세트는 mistersatan1/Inventory-survey의 `.claude/`와 같다. 이 저장소에 **이미 같은 이름이 있던 것은 덮어쓰지 않았다**(기존 것이 이 프로젝트에 맞춰 고친 버전일 수 있음).

- 새로 넣은 스킬 (64개): animate animation-performance animation-vocabulary apple-design ask-sonner brainstorming brandkit break-ui choreograph color-system content-strategy critique-affordance critique-information-density critique-visual-hierarchy design-brief design-taste-frontend diagnosing-superpowers dispatching-parallel-agents emil-design-eng error-handling-ux executing-plans feedback-patterns figma-code-connect figma-code-workflows figma-create-new-file figma-design-to-code figma-generate-design figma-implement-motion figma-use find-animation-opportunities finishing-a-development-branch fitts-law form-design grill-me impeccable improve-animations information-architecture layout-grid loading-states micro-interaction-spec mobile-native navigation-patterns onboarding-design pick-ui-library platform-conventions prototype receiving-code-review remove-animations requesting-code-review responsive-design review-animations search-ux spacing-system subagent-driven-development test-driven-development typography-scale ui-ux-pro-max unslop using-git-worktrees using-superpowers verification-before-completion visual-hierarchy writing-plans writing-skills
- 같은 이름이 있어 건너뛴 스킬 (2개): frontend-design systematic-debugging
- 새로 넣은 에이전트 (12개): design-brand-guardian design-ui-designer design-ui-finish-gate-reviewer design-ux-architect design-ux-researcher engineering-frontend-developer engineering-minimal-change-engineer product-feedback-synthesizer product-manager product-sprint-prioritizer testing-accessibility-auditor testing-evidence-collector
- 이미 있어 건너뛴 에이전트 (0개): 없음
- `.mcp.json`: 새로 추가(Playwright MCP, Figma MCP)

새 스킬은 이 프로젝트의 CLAUDE.md 규칙(디자인 원칙, 금지 사항)보다 우선하지 않는다. 충돌하면 CLAUDE.md를 따른다.

## 스킬 로딩 정책 (토큰 절약, 2026-11-08)
`.claude/settings.json`의 `skillOverrides`로 정한다. 스킬 파일 자체는 수정하지 않았다.

- **항상 켜짐(`on`, 설명까지 매 세션 로드)**: `claude-coding-rules`, `pokemon-project-context`, `skill-catalog`, `token-efficient-workflow`
- **필요할 때(`name-only`, 이름만 로드)**: 나머지 33개. 작업을 시작할 때 `skill-catalog`가 고를 스킬을 알려준다.
- **끔(`off`)**: 없음
- **이 프로젝트에 맞지 않아 뺀 스킬**: `animation-vocabulary`, `apple-design`, `ask-sonner`, `brandkit`, `choreograph`, `color-system`, `content-strategy`, `critique-affordance`, `design-brief`, `design-taste-frontend`, `diagnosing-superpowers`, `emil-design-eng`, `error-handling-ux`, `figma-code-connect`, `figma-code-workflows`, `figma-create-new-file`, `figma-design-to-code`, `figma-generate-design`, `figma-implement-motion`, `figma-use`, `find-animation-opportunities`, `form-design`, `impeccable`, `improve-animations`, `information-architecture`, `layout-grid`, `loading-states`, `mobile-native`, `navigation-patterns`, `onboarding-design`, `pick-ui-library`, `platform-conventions`, `prototype`, `remove-animations`, `responsive-design`, `search-ux`, `spacing-system`, `typography-scale`, `ui-ux-pro-max`, `unslop`, `using-superpowers`, `visual-hierarchy`, `writing-skills`
- 스킬 목록이 매 세션 차지하는 크기(추정): 정리 전 약 23,053자 → 정리 후 약 1,183자
- `token-efficient-workflow`: mistersatan1/schedule-management의 같은 이름 스킬을 바탕으로 프로젝트 고유 문구(근무 시간 계산)만 일반화하고 "스킬·에이전트" 절을 더했다.
- `skill-catalog`: 이 저장소에 있는 필요 시 스킬의 용도표. 새로 만든 파일이다.

스킬을 다시 켜려면 `skillOverrides`에서 값을 `"on"`으로 바꾸거나 줄을 지운다. 로컬에서만 바꾸려면 Claude Code의 `/skills` 메뉴(저장 위치 `.claude/settings.local.json`)를 쓴다.
이 프로젝트에서 뺀 스킬이 필요하면 mistersatan1/Inventory-survey의 `.claude/skills/`(또는 원본 저장소)에서 폴더를 복사해 온다.
- 겹치거나 맞지 않아 뺀 에이전트: product-feedback-synthesizer, design-brand-guardian, engineering-frontend-developer, design-ux-architect, design-ux-researcher
