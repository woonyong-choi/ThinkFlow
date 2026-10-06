# daphnis

`.dap` 원본 하나를 움직이는 문서 그림 하나(구조, 순서, 상태, 데이터 관계 그림과 차트)로 바꾸는 명령. 마크다운 문서 안의 ` ```dap ` 블록도 그림으로 반영한다(`daphnis md`).

설계 문서는 [docs/README.md](docs/README.md)에 있다.

## 구성

| 경로 | 내용 |
|---|---|
| `src/source/` | 원본 읽기: 낱말 나누기, 문장 해석, 이름과 규칙 확인 |
| `src/measure/` | 글꼴 파일로 글 폭 재기, 도형과 카드 크기, 글꼴 조각 넣기 |
| `src/layout/` | elkjs 배치(구조, 상태, 데이터 관계)와 순서 그림 격자 배치 |
| `src/chart/` | 차트 눈금, 숫자 표기, 일곱 종류 그리기 |
| `src/draw/` | 도형, 선, 카드 그리기 |
| `src/timeline.js`, `src/chip.js`, `src/build.js` | 시간표, 글 상자 크기와 밀어 넣기, 단계 잇기 |
| `src/check.js`, `src/check/` | 그림 검사. 항목 목록(`items.js`)과 항목별 판정 파일 |
| `src/svg.js`, `src/html.js`, `src/html/`, `src/href.js`, `src/cli.js` | 움직이는 SVG, HTML 재생기 문서와 목록, 파일 이름을 링크 주소로 바꾸기, 명령 |
| `src/build-reported.js`, `src/md.js`, `src/md-run.js`, `src/md-owner.js`, `src/md-lock.js`, `src/md-write.js`, `src/md-fold.js`, `src/md-tags.js`, `src/md-blocks.js` | 원본 만들기와 진단 알림, 마크다운 블록 찾기와 이미지 줄 넣기(`md.js`는 파일을 다루지 않음), `md` 명령 실행, 원본 접기 배치(`md-fold.js`), 접기에 필요한 `<details>` 태그 세기와 그 블록 판별(`md-tags.js`, `md-blocks.js`), 만든 SVG의 소유 표시와 판정, 출력 폴더 잠금, `md` 파일 쓰기(임시 파일과 rename, 실패 때 되돌리기) |
| `action.yml`, `.github/workflows/` | GitHub Action(composite), CI, `v*` 태그 배포, design-tokens 새 버전 감지(`design-tokens-update.yml`) |
| `src/player/` | 브라우저에서 도는 재생기(`play.js`, `controls.js`, `stage.js`, `curve.js`)와 전체 화면·확대(`view.js`) |
| `examples/` | 예제 원본, `out/` 결과 |
| `scripts/` | 화면 확인 도구(`shoot.mjs`), 첫 화면과 갤러리 그림 생성(`build-showcase.mjs`), 토큰 생성과 낡음 검사(`build-tokens.mjs`), 팔레트 값 계산(`build-palette.mjs`), design-tokens 새 버전 판정, PR 본문, 이슈와 PR 올리기와 프로젝트 등록(`update-design-tokens.mjs`, `lib/design-tokens-board.mjs`), 하드코딩, 비용 주석, 수치 기준 검사(`check-tokens.mjs`, `check-cost-comments.mjs`, `check-size.mjs`), 배치 무작위 시험(`fuzz-layout.mjs`), 빌드 시간 기준 검사(`perf-chips.mjs`, 로컬 전용), 문서 표 생성(`build-grammar-doc.mjs`, `build-check-doc.mjs`) |
| `docs/` | 설계 문서, 그림 종류별 레퍼런스(`reference/`), README 그림(`assets/showcase/`) |

## 명령

```sh
npm test
npm run check
```

`npm run check`는 토큰 생성물이 낡았거나 `src/tokens.json`이 design-tokens와 같은 이름을 다시 정의하면 실패한다. 토큰이나 design-tokens 버전을 바꾼 뒤에는 `npm run palette`, `npm run tokens`, `npm run figures` 순서로 생성물을 다시 만든다.

## 규칙

- 태그를 만들거나 `npm publish`를 하지 않는다. 배포는 `release.yml`이 `v*` 태그에서 한다(`NPM_TOKEN` 등록 뒤 사용자가 태그)
- `package.json`의 `files`는 `src`, 로고 SVG(`docs/assets/daphnis-*.svg`), `LICENSE`, `NOTICE`만. 바꾸면 `test/package.test.js`가 지킨다
- 배포 전에는 README에 npm 설치를 사용 가능으로 쓰지 않는다
- 기존 명령의 옵션과 출력은 바꾸지 않고 추가만(`daphnis md`는 새 명령). 옛 이름(`mutoscope` 명령, `.muto`, ` ```muto `)은 한 판 동안 받고 폐기 안내만 낸다
- 커밋 전 명령 절의 명령 모두 통과
- 동작, 계약, 설정 변경은 같은 PR에서 설계 문서 갱신
- 새 문서는 `docs/README.md` 문서 목록 안에서만 추가
- 배치에 넘긴 도형 크기와 연결점은 그리는 도형과 동일
- elkjs 경로 점 수정 금지. 예외는 `docs/design/layout.md` 선 그리기 절의 선 끝 계단 펴기 하나
- 오류가 있으면 결과 파일을 쓰지 않음
- `src/player/`는 시간표를 읽기만 하고 상태를 다시 계산하지 않음
- 화면 값은 토큰만 사용. 공통 토큰(색 역할, 기본 색 단계, 간격, 반지름, 글자 크기)은 `@woonyong-choi/design-tokens`가 정본이고 `src/tokens.json`은 base 테마의 그림 전용 토큰을 가져온 사본이다. 공통 정본은 design-tokens의 themes/base에서 수정한다. 같은 이름을 다시 정의하지 않는다
- design-tokens 버전은 `package.json`의 `devDependencies` 태그로 고정하고, 올릴 때는 `design-tokens-update` 워크플로가 만드는 PR을 쓴다. 손으로 올리면 `npm run palette`, `npm run tokens`, `npm run figures`를 같은 PR에서 돌린다
- `tokens.css`, `tokens.js` 직접 수정 금지
