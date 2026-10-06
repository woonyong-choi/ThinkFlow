# 아키텍처

이 도구는 `.dap` 원본 하나를 움직이는 문서 그림 하나로 바꾸는 명령이다. 구성 요소는 셋이고, `cli`가 원본을 읽어 배치하고 검사한 장면과 시간표를 `player`(HTML)와 `svg`(움직이는 SVG)에 담는다. 이전의 D2 호환 첫 구현은 git 태그 `d2-compat`에 있다.

## 맥락

| 외부 요소 | 종류 | 주고받는 것 |
|---|---|---|
| `.dap` 원본 | 파일 | 그림 종류, 도형, 선, 시간 흐름, 차트 값 |
| 실험 결과 JSON | 파일 | 차트 `data` 줄이 읽는 값 |
| elkjs | 외부 프로그램 | 도형 크기와 연결점 제약, 도형 좌표와 직교 경로 |
| 글꼴 파일 | 파일 | Pretendard, JetBrains Mono의 글자 너비 표와 글자 모양 |
| design-tokens 패키지 | 외부 패키지 | 공통 의미·기본 토큰(색 역할과 색 단계, 간격, 반지름, 글자 크기, 글꼴 대체 목록)의 정본 두 파일 |
| repo-docs-figures 스킬 | 외부 프로그램 | `render_figures`가 부르는 `render` 명령과 그 종료 코드 |
| 브라우저 | 외부 프로그램 | 만든 HTML과 SVG |

## 코드 지도

| 구성 요소 | 하는 일 | 기술 | 위치 |
|---|---|---|---|
| `cli` | 원본을 읽고, 글을 재고, 배치하고, 그림을 검사하고, 시간표를 만들어 결과 파일을 쓰는 명령 | Node.js, elkjs | `src/`에서 `player/`, `svg.js`, `animate/`를 뺀 파일. 마크다운 문서 반영은 `md.js`, `md-run.js` |
| `player` | HTML 안에서 시간표대로 상태를 바꾸고 점을 옮기는 재생기, 전체 화면과 확대 | 브라우저 JavaScript | `src/player/` |
| `svg` | 시간표를 CSS keyframes와 SMIL로 바꾼 움직이는 SVG | SVG, CSS | `src/svg.js`, `src/animate/` |

## 실행 흐름

### 그림 만들기

1. `cli`가 원본을 읽어 머리, 선언, 시간 흐름으로 나누고, 이름과 규칙을 확인한다([그림 문법](design/figure-syntax.md)).
2. `cli`가 글꼴 파일로 모든 글의 폭을 재고 도형 크기와 연결점을 정한다.
3. `cli`가 그룹마다, 그다음 바깥을 elkjs로 배치하고 경로 조각을 잇는다([배치](design/layout.md)).
4. `cli`가 시간표를 만들고(점 이동 시간이 선 길이에 비례해 배치 뒤에 만든다), 모든 선과 가장 큰 카드가 보이는 상태에서 화면 오류를 검사한다([그림 검사](design/figure-check.md)).
5. 오류가 없으면 `cli`가 같은 장면과 시간표로 HTML, 움직이는 SVG, 멈춘 SVG 가운데 요청한 것을 쓴다.

### 토큰 만들기

1. 공통 토큰은 설치된 `@woonyong-choi/design-tokens`의 정본(`source`, `source-dark`)에서 읽는다. 버전은 `package.json` `devDependencies`의 태그(`github:woonyong-choi/design-tokens#v0.1.1`)가 정한다.
2. `scripts/build-tokens.mjs`가 그 정본과 `src/tokens.json`, `src/tokens.dark.json`을 합쳐 `src/tokens.css`, `src/tokens.js`를 만든다. `src/` 정본에는 그림 전용 구성 요소 토큰(`color.figure`, `color.paint`, `color.tag`, `color.palette`의 `amber`, `teal`, `navy`, `pink`, `sky`, `slate`, 그림과 재생기와 차트의 `size`, `duration`, `opacity`, `distance` 같은 값, 내장 글꼴 사슬 `font.figure-sans`, `font.figure-mono`)만 있다.
3. `src/` 정본이 공통 토큰과 같은 이름을 다시 정의하면 `npm run check`(`build-tokens.mjs --check`)가 실패한다. 생성물이 낡았을 때도 같다.
4. `npm run palette`가 이 저장소가 값을 갖는 팔레트 단계(`sky`와 `slate`의 면과 외곽선)를 공통 토큰의 면 위 대비 규칙으로 다시 계산해 `src/tokens.json`에 쓴다. 나머지 팔레트 단계는 공통 토큰을 가리키는 별칭이다.
5. design-tokens에 새 태그가 나오면 `design-tokens-update` 워크플로가 의존성을 올리고 1~4와 `npm run figures`로 생성물을 다시 만든 PR과 이슈를 연다. 알림(`repository_dispatch`)과 매일 한 번의 정기 확인, 수동 실행을 받는다. 같은 버전의 PR이 열려 있으면 새로 만들지 않는다.

새 이슈는 라벨 `build`, `area:repo`, `P3`와 제목 `공통 토큰 v0.1.2 변경`(20자를 넘으면 `토큰 v0.1.2 변경`)으로 만들고, 저장소에 연결된 프로젝트(GraphQL `repository.projectsV2`로 조회)에 등록해 Status를 `대기`로 둔다. 프로젝트 쓰기 권한(Projects)이 있는 `DESIGN_TOKENS_UPDATE_TOKEN`이 필요하다. 성공은 토큰 유무가 아니라 조회, 등록, 상태 설정 호출 결과로 판단하고, 하나라도 실패하면 실행 요약의 "프로젝트 등록 실패" 문단과 `::warning::` 줄에 단계와 이유를 남기되 이슈와 PR 만들기는 계속한다. 같은 버전으로 다시 실행하면 열린 이슈(옛 제목 `design-tokens v0.1.2로 올린다` 포함)와 PR을 찾아 쓰고, 판에 없는 이슈만 등록한다. 이 로직은 `scripts/update-design-tokens.mjs publish`와 `scripts/lib/design-tokens-board.mjs`에 있다.

`GITHUB_TOKEN`으로 만든 PR은 다른 워크플로를 자동 실행하지 않아 `ci.yml`이 돌지 않는다. 그래서 워크플로가 같은 job에서 `npm test`와 `npm run check`를 돌려 결과를 PR 본문에 적고, 실패하면 초안 PR로 연다. 저장소 비밀 `DESIGN_TOKENS_UPDATE_TOKEN`(쓰기 권한 토큰)을 등록하면 그 토큰으로 PR을 만들어 `ci.yml`도 자동으로 돈다. 등록하지 않았다면 PR을 닫았다가 다시 열면 `ci.yml`이 돈다. 워크플로가 PR을 만들려면 저장소 설정(Actions > General)의 "Allow GitHub Actions to create and approve pull requests"가 켜져 있어야 한다. 정기 확인은 저장소에 60일 동안 활동이 없으면 GitHub가 멈춘다.

### 재생하기

1. 브라우저가 HTML을 열면 `player`가 첫 단계의 첫 박자 상태를 그린다.
2. `player`가 박자마다 시간표의 상태를 그대로 그리고 점을 경로 위로 옮긴다([재생](design/playback.md)).
3. 브라우저가 SVG를 열면 `svg` 안의 keyframes가 같은 시간표를 반복한다.

## 불변 조건

- 배치에 넘긴 도형 크기와 연결점은 그리는 도형과 같다. 선 끝이 도형에서 떨어지는 일을 막기 위해서다.
- elkjs가 돌려준 좌표와 경로 점은 옮기지 않는다. 경로 후처리끼리 충돌하는 일을 막기 위해서다. 예외는 [배치](design/layout.md) 선 그리기 절의 선 끝 계단 펴기 하나다.
- 글 폭은 그림에 넣는 글꼴과 같은 글꼴 파일로 잰다. 잰 폭과 그려진 폭이 어긋나는 일을 막기 위해서다.
- 오류가 하나라도 있으면 결과 파일을 쓰지 않는다. 깨진 그림이 문서에 올라가는 일을 막기 위해서다.
- 같은 원본과 같은 버전은 바이트까지 같은 결과를 낸다. 다시 변환해도 git 차이가 없게 하기 위해서다.
- `player`와 `svg`는 시간표를 읽기만 하고 상태를 다시 계산하지 않는다. HTML과 SVG가 다르게 움직이는 일을 막기 위해서다.
- 점 이동 곡선, 글 상자 밀어 넣기, 차트 자라기는 HTML과 SVG가 같은 토큰과 같은 규칙을 쓴다. 규칙은 `src/easing.js`, `src/chip.js`, `src/chart/motion.js`에 있고, 브라우저 코드(`player/`)는 불러올 수 없어 같은 계산을 따로 둔다. 글 상자 자리는 예외로, 빌드 때 시간표에 담은 계획을 재생기가 보간만 한다.
- 크기, 간격, 색, 시간 값은 토큰만 쓴다. 공통 토큰은 design-tokens가, 그림 전용 토큰은 `src/tokens.json`이 정본이고 같은 이름을 두 곳에 두지 않는다. `src/tokens.css`, `src/tokens.js`는 둘을 합친 생성물이라 손으로 고치지 않는다.
- 변환 중 네트워크에 접근하지 않는다. 글꼴과 배치 엔진을 모두 함께 배포한다.

## 기술 선택

| 영역 | 선택 | 고른 이유 |
|---|---|---|
| 층 배치와 직교 경로 | elkjs(ELK layered) | 도형 크기, 연결점, 선 라벨 크기를 받아 겹치지 않게 배치한다. [결정 기록](decisions/2026-10-01-own-syntax-and-layout.md) |
| 글꼴 | Pretendard, JetBrains Mono | 본문은 한글, 라틴, 기호, 숫자 모두 Pretendard 하나다. 참고 문서 페이지와 같은 글꼴이라 그림이 따로 놀지 않는다. 차트 숫자는 Pretendard의 자리 폭 같은 숫자(`tnum`)다. 고정폭 JetBrains Mono는 코드(백틱 구간, 테이블 열 타입)에만 쓰고 그 안 한글은 Pretendard로 이어 그린다. 굵기마다 정적 파일이 있는 `pretendard` 패키지로 받는다. 가변 글꼴이나 조각 나뉜 패키지보다 fontkit 측정과 subset-font 자르기가 한 파일에서 끝나서 고른다. 모두 SIL Open Font License라 그림에 넣을 수 있다. 글자 간격은 -0.3px다. |
| 결과 형식 | SVG, HTML | SVG는 README와 설계 문서에 이미지로 들어가고, HTML은 미리보기와 목록 쪽에서 열린다. 둘 다 추가 프로그램이 필요 없다. |
| 공통 토큰 | `@woonyong-choi/design-tokens`(Git 태그로 설치) | 색 역할, 색 단계, 간격, 반지름, 글자 크기를 여러 프로젝트가 같은 값으로 쓰려고 별도 패키지가 정본을 갖는다. 이 저장소는 그림 전용 값만 두고 같은 이름을 다시 정의하지 못한다. npm 배포 전이라 태그로 설치하고, 배포되면 버전 범위로 바꾼다. |
| 실행 환경 | Node.js 20 이상 | elkjs와 글꼴 처리를 브라우저 없이 돌린다. |

## 선택 테마 가져오기

테마 선택은 루트 theme.config.json의 base이다. design-tokens의 dist/base 완성본을 src/design-theme에 커밋한다. scripts/theme-snapshot.mjs가 모든 파일의 해시를 검사한다. scripts/lib/design-tokens.mjs는 이 사본의 renderer.tokens.json과 renderer.tokens.dark.json을 읽는다. src/tokens.json과 src/tokens.dark.json은 그림 전용 토큰의 호환 사본이다. 계산 알고리즘과 기존 생성 CSS·JS 값은 유지한다.

공통 정본에서 수정한 다음 `npm run theme:sync -- --from <design-tokens-root>`, `npm run tokens`, `npm run check`, `npm test` 순서로 확인한다. theme:sync는 기존 사본의 수동 수정을 발견하면 중단한다. 자동 업데이트 워크플로도 새 패키지 설치 후 같은 명령으로 base을 가져온다. Git 태그 개발 의존성은 업데이트 감지용이며 실행 시에는 커밋된 사본과 생성물을 사용한다.

현재 연결은 base의 두 모드와 기존 글꼴을 보존한다. 다른 테마는 renderer 계약과 그림 전용 값, 실제 측정 글꼴을 갖추고 검사한 뒤 연결한다. npm 사용자에게 테마 원본을 다시 다운로드하도록 요구하지 않는다.
