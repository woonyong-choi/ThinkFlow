# daphnis

`.dap` 원본 하나를 움직이는 문서 그림 하나(구조, 순서, 상태, 데이터 관계 그림과 차트)로 바꾸는 명령. 마크다운 문서 안의 ` ```dap ` 블록도 그림으로 반영한다(`daphnis md`).

설계 문서는 [docs/README.md](docs/README.md)에 있다.

## 필수 디자인 제약

- 목적은 기술 블로그와 문서의 아키텍처·순서·흐름·상태·자료구조·표·다양한 그래프와 데이터를 같은 시각 언어로 설명하는 것이다. 이 표현들은 핵심 범위다. 기능은 구체적인 문서 표현 용도와 공통 모형·부품의 재사용 여부로 판단하고, 기능 수만을 이유로 핵심 범위를 축소하지 않는다.
- 표현은 풍부하게 유지하면서 작성은 단순해야 한다. 기본값으로 가능한 그림에 불필요한 옵션·보기·장면 선언을 요구하지 않고, 같은 의미는 같은 문법을 사용한다. D2 같은 문서 그림 도구와 비교할 때 기능 개수보다 실제 글에 넣는 최소 예제의 작성량·읽기 쉬움·수정 범위를 대조한다.
- 애니메이션과 트래픽 효과는 필수 기능이다. 장면별 재생·반복, 동시 이동, 값 변화와 강조를 기능 축소 후보로 취급하지 않는다. 공통 시간표·문법·부품으로 자연스럽게 표현되는지 검수한다.
- Daphnis와 homepage는 design-tokens의 같은 토큰·CSS·아이콘·공통 구성 요소·동작을 상속한다. 화면 표현값의 하드코딩과 요소별 마크업·CSS·상태 처리의 재구현은 금지다. 같은 토큰을 읽는 복사 구현도 허용하지 않는다.
- 공통 표현은 design-tokens에서 한 번 구현하고 Daphnis는 그림 모형과 배치 결과를 넘겨 조립한다. 차이는 공통 역할의 속성·변형으로 필요한 부분만 재정의한다. 그림 종류나 예제별 CSS·좌표·여백 보정으로 결함을 숨기지 않는다.
- 같은 의미의 선언·참조·장면·트래픽·효과는 하나의 문법과 모형을 사용한다. 그림 종류마다 문법 별칭·파서·상태 전이를 따로 만들지 않는다. 문법의 정본은 `src/source/grammar.js`이며 문서 표는 여기서 생성한다.
- 장면 탭은 홈페이지 문서 탭과 선택·호버·초점·키보드 이동·전환·움직임 줄이기 계약을 공유한다. 장면 재생은 컴파일된 시간표를 읽고 종류마다 별도 재생기를 만들지 않는다.
- Things의 대응 요소와 홈페이지에 삽입한 결과를 실제 크기로 비교한다. 글자·아이콘·정렬·간격, 탭 전환과 애니메이션의 연속성, 라벨 겹침·잘림을 확인한다. 의도된 제품 차이 외의 불일치는 공통 소유 지점에서 수정한다.
- 하드코딩 검사나 공통 소유 검사를 우회하지 않는다. 실제 화면·동작·문법의 일관성을 검수하지 않고 테스트 통과만으로 품질 완료를 선언하지 않는다.

## 구성

| 경로 | 내용 |
|---|---|
| `src/source/` | 원본 읽기: 낱말 나누기, 문장 해석, 이름과 규칙 확인, 보기 정하기(이름 없는 보기와 기본 보기, `views-check.js`). 모형은 받은 원본 글을 `figure.source`로 간직한다 |
| `src/measure/` | 글꼴 파일로 글 폭 재기(`fonts.js`), 카드의 안쪽 여백과 머리(`card.js`), 글 역할과 카드 안 글 한 줄 text의 자리와 폭(`texts.js`), 카드 내용 줄의 text 자리(`content.js`), 아이콘·배지·개수 장식 자리(`decor.js`), 도형·표·API·클래스·큐·격자 크기(`sizes.js`, `table.js`, `class.js`, `queue.js`), 글꼴 조각 넣기 |
| `src/layout/` | elkjs 배치(구조, 상태, 데이터 관계)와 순서 그림 격자 배치 |
| `src/chart/` | 차트 눈금, 숫자 표기, 차트 종류별 그리기(종류 목록은 `src/source/grammar.js`의 문법 표가 정본이다), 프레임 범위(`extent.js`)와 프레임(`frames.js`), 바뀐 표식의 겹침 효과(`pulse-overlay.js`) |
| `src/draw/` | 장면 조립(`figure.js`), 카드(`card.js`)와 카드 면(`surface.js`), 카드 안 글(`texts.js`), 장식과 아이콘(`decor.js`), 카드 내용(`content.js`), 연결선과 선 라벨(`connector.js`), 화살촉(`arrow.js`), 색 이름과 표현을 읽는 곳(`look.js`) |
| `src/icons/` | 공통 카탈로그 읽기와 사용자 SVG 검증. 내장 도형과 조작 아이콘은 vendor 정본 |
| `src/tone.js`, `src/chart-palette.js` | 정식 색 이름(팔레트 계열 일곱과 회색)과 범주 색 순서 |
| `src/timeline.js`, `src/chip.js`, `src/build.js`, `src/build-scene.js` | 시간표, 글 상자 크기와 밀어 넣기, 장면 잇기와 장면 검사 |
| `src/track-geometry.js`, `src/reflow-timeline.js` | 흐름 경로 기하와 기존 사건 시각을 보존하는 재배치 |
| `src/check.js`, `src/check/` | 그림 검사. 항목 목록(`items.js`)과 항목별 판정 파일 |
| `src/styles.js`, `src/animate/` | 공통 CSS 가져오기와 시간표 기반 SVG 효과. 스타일은 `src/vendor/theme/styles/diagram/`에서 읽음 |
| `src/svg.js`, `src/html.js`, `src/html/`, `src/href.js`, `src/cli.js` | 움직이는 SVG, HTML 재생기 문서와 목록, 그림 틀(도구 막대 하나와 탭 줄 하나, `html/player-script.js`), 파일 이름을 링크 주소로 바꾸기, 명령 |
| `src/build-reported.js`, `src/md.js`, `src/md-run.js`, `src/md-owner.js`, `src/md-lock.js`, `src/md-write.js`, `src/md-fold.js`, `src/md-tags.js`, `src/md-blocks.js` | 원본 읽기·만들기와 진단 알림, 쓸 파일 겹침 판정, 결과 파일 쓰기와 그 오류 알림(`render`, `gallery`, `md`가 같은 것을 쓴다), 마크다운 블록 찾기와 이미지 줄 넣기(`md.js`는 파일을 다루지 않음), `md` 명령 실행, 원본 접기 배치(`md-fold.js`), 문서 줄을 CommonMark 블록 구조로 한 번 따라가며 울타리(코드 블록)와 `<details>` 태그를 함께 읽는 걸음(`md-tags.js`)과 그 블록 판별(`md-blocks.js`), 만든 SVG의 소유 표시(`daphnis md v2`)와 판정, 출력 폴더 잠금, `md` 파일 쓰기(임시 파일과 rename, 실패 때 되돌리기) |
| `action.yml`, `.github/workflows/` | GitHub Action(composite), CI, `v*` 태그 배포, 검증된 디자인 수신·홈페이지 전달 |
| `src/player/` | 브라우저에서 도는 재생기: 시각의 순수 표본 추출(`sample.js`), 시계와 장면 들어가기(`play.js`), 모습 쓰기(`stage.js`, `effects.js`, `values.js`), 탭과 모든 그림이 같은 도구 막대(문법 복사, HTML 다운로드, 전체화면. `controls.js`), 전체 화면·확대(`view.js`), 폭에 따른 배치 바꾸기(`responsive.js`), HTML 다운로드(`export.js`), 이동 곡선(`curve.js`) |
| `examples/` | 표현마다 하나인 예제 원본(`icons/`, `data/`는 예제가 읽는 자료). 결과는 `npm run catalog`가 `.local/examples/`에 생성 |
| `scripts/` | 문법·검사 문서, 예제·그림 생성, 사본 검사, 홈페이지 동기화, 크기·비용 참고 검사 |
| `docs/` | 설계 문서, 그림 종류별 레퍼런스(`reference/`), README 그림(`assets/showcase/`) |

## 명령

```sh
npm test
npm run check
npm run check:sources
npm run check:figures
npm run check:advisory
npm run check:package -- /absolute/new-consumer-path
```

`npm test`는 공개 진입점(`buildFigure`, `toSvg`, `toHtml`, 명령, 마크다운)과 실제 공통 부품의 진입점으로 계약을 확인하는 시험이고 브라우저를 열지 않는다. 같은 요소(카드, 필드, 선, 화살촉, 라벨, 아이콘, 탭, 도구 막대)는 한 부품이 모양과 상태를 소유하므로 그 부품의 시험도 한 곳에 한 번만 두고, 종류마다 같은 색, 두께, 모양 시험을 되풀이하지 않는다. 부품 시험은 둘이다. `test/components.test.js`는 부품의 기하와 구조(잰 값과 그린 값이 같다)를, `test/component-state.test.js`는 움직이는 SVG와 HTML 같은 출력 어댑터가 같은 상태 정의(`--fx-*`)와 표식을 읽는지를 본다. 같은 계약을 두 파일이 되풀이하지 않는다. `test/text.test.js`는 글 읽기와 글 자리(측정이 놓은 자리를 그리는 쪽과 검사가 그대로 읽는가, 긴 제목의 줄바꿈)를, `test/sampler.test.js`는 순수 표본 추출기(`player/sample.js`)를 바뀌지 않은 `curve.js`와 함께 Node의 격리 컨텍스트(`node:vm`)에서 돌려 본다. 브라우저 시계와 DOM에 쓰는 일은 이 시험이 보지 않는다. 종류별 시험은 그 종류만의 수학, 의미, 배치 계산을 보고, 조합 시험은 부품 사이의 데이터 전달과 연결만 본다. 시험이 부르는 부품 진입점은 코드가 실제로 쓰는 것이어야 하고, 시험만을 위한 내보내기나 훅을 만들지 않는다. 시험 개수를 목표로 삼지 않는다. 실제 Chrome에서 폭과 테마를 바꿔 가며 그림을 눈으로 보는 화면 검수는 자동 시험이 대신하지 않는 별도의 일이고, 통과한 시험을 화면 검수의 완료로 쓰지 않는다. CI(`ubuntu-latest`, Node 20과 22)는 `npm ci` 뒤 `npm test`, `npm run check`, `npm run check:sources`, `npm run check:figures`와 저장소 밖 tarball 설치 검사(`npm run check:package`)를 돌고, `action` 작업이 추적하는 모든 `.dap`와 `.md`에 저장소 Action을 한 번 돈다. 실행 결과와 날짜는 GitHub Actions 기록과 이슈에 있다.

`npm run check:sources`는 예제, 문서 그림, showcase 원본(`examples`, `docs/assets`, `docs/assets/showcase`의 `.dap`)을 `--strict`로 확인하고, `npm run check:figures`는 폴더를 걸어 찾은 모든 마크다운 문서(`scripts/run-md.mjs`, 울타리 모양과 상관없고 블록을 모두 지운 문서도 포함)의 `md --check --strict`와 showcase·how-it-works SVG가 원본에서 다시 만든 결과와 같은지(`build-showcase.mjs --check`) 본다. 고칠 때는 `npm run figures`다.

`npm run check`는 가져온 디자인 전체 파일의 해시와 소스의 하드코딩을 검사한다. 공통 정본 변경 후 `npm run design:sync -- <정본 경로>`, `npm run figures`, `npm test`, `npm run check` 순서로 확인한다.

`npm run check:advisory`는 유지보수 힌트를 알린다. 파일 300줄, 함수 40줄, 매개변수 3개(`check-size.mjs`)와 비용 주석 누락(`check-cost-comments.mjs`)을 찾고 항목이 있어도 0으로 끝난다. 두 검사는 줄 시작 모양을 정규식으로 읽어서 여러 줄 매개변수, 블록 주석 안의 중괄호, 메서드 호출 이름이 같은 재귀 판정 등을 틀리게 읽는다. 설계나 정확성의 증거가 아니므로 항목을 없애려고 일관된 코드를 쪼개거나 근거 없는 점근 표기를 적지 않는다. 실행 오류(없는 경로, 잘못된 옵션)는 이 명령도 2로 실패한다. 알고리즘의 실제 복잡도를 설명하는 비용 주석은 계속 쓴다.

## 규칙

- 디자인 기준은 Things 공식 사이트 [culturedcode.com/things](https://culturedcode.com/things/), [기능 페이지](https://culturedcode.com/things/features/)다. 색의 기준점은 공식 사이트의 solid 2024 기능 아이콘이다. 역할 위계(카드, 판, 선택, 글자 단계)는 공식 2017년 사이트 영상 스틸과 라이트·다크가 함께 있는 2018년 Things 3.7 화면 쌍을 보조로 읽는다. 역할이 같은 요소끼리 비교하고 직접 대응이 없는 그림 요소는 Daphnis의 확장으로 구분한다. 사이트 기능 아이콘의 면색은 사이트의 값이지 네이티브 앱 모든 역할의 같은 색이라는 근거가 아니다. 2017·2018년 이미지는 역할 비교용 보조 참고이고 현재 네이티브 버전이라는 근거가 아니며, 2018년 쌍이 다크의 유일한 보조 참고다. 예전 Refero 화면은 정규화한 측정값과 재구성 예제라 보조 참고일 뿐 기준이 아니다.
- 진행 기록, 감사 영수증(검수 날짜, 배포 식별자, 통과 개수), 이전에 남긴 검증 근거는 GitHub 이슈 요약에 둔다. `docs/`는 현재 계약과 실제로 확인한 증거 표만 적고 시간순 일지를 쌓지 않는다. 화면으로 확인한 범위(예제, 폭, 라이트·다크, 직접 본 화면, 공식 Things 역할 비교)는 [표현 범위](docs/design/expression-coverage.md#예제와-검증-범위)의 표가 정하고, 개수와 날짜는 적지 않는다. 가능한 모든 조합, 모든 네이티브 Things 화면, 실제 iPhone이나 기기의 Safari를 확인했다고 쓰지 않는다. 자동 시험은 실제 기기를 대신하지 않는다. 확인하지 않은 항목은 "검증 요구사항, 미완료"로 표시하고 확인한 범위 밖을 주장하지 않으며, 이미 고쳐진 결함을 미완료로 남기지 않는다. 자동으로 반복하는 장면에 일시정지 조작이 없으므로 접근성 기준을 모두 충족한다고 쓰지 않는다.
- 색: 핵심 넷(파랑 `#1e6bd6`, 노랑 `#f2d024`, 빨강 `#fa1955`, 초록 `#269c6e`)의 값과 순서는 바꾸지 않고, 대비를 맞추려고 핵심 RGB를 바꾸지 않는다. 확장 색은 후보를 실제 크기 라이트·다크 화면으로 검수한 뒤 고르고, 고른 순서는 한 번 기록한 뒤 뒤에만 더한다. 빌드마다 순서를 다시 찾지 않고 고른 값 밖으로 색상·밝기를 자동으로 옮기지 않는다. 색 수를 넘는 계열은 무늬·모양·직접 라벨로 구분하며 색만으로 구분하지 않는다. 대비는 그 요소가 실제로 그려지는 면(카드, 판, 라이트·다크 테마의 면)과 역할(글자, 선, 면)마다 그 면 위에서 잰다. 검은색·흰색 바탕 위의 계산은 보조 확인일 뿐 기준이 아니다. 노랑처럼 면 위 대비가 낮은 그래픽은 색을 바꾸지 않고 라벨, 번호 키, 모양으로 보완하며, 그 낮은 그래픽 대비를 접근성 기준 충족이라고 쓰지 않는다. 범주 번호가 정하는 점 모양, 면적 끝 이름, 산점도 번호 접두와 범례, 원·도넛의 조각 안 번호 키(조각에 들어갈 때만 보이고 아니면 숨는다)가 그 보완이다.
- 디자인 수용은 자동 검사가 아니라 화면 비교로 한다. 모바일 320·390·430px와 데스크톱 실제 크기에서 공식 기준과 나란히 보고, 라이트·다크, 정지·재생 중 상태를 확인한다. 화면 비교는 실제 Chrome에서 사람이 직접 한다. 테스트 통과만으로 일관성이나 디자인 완료를 선언하지 않고 검수하지 않은 변경은 공개하지 않는다.
- 결함을 덮어쓰기 CSS나 예제별 CSS·좌표 보정으로 숨기지 않는다. 공통 규칙을 고친다.
- 그림은 정의된 부품을 가져다 조립한다(React처럼 합성하되 React 의존성은 없다). 흐름은 원본 문법 → 공통 모형 → 필요한 배치 → 공통 부품 → 조작부 하나다. 카드, 필드, 선, 화살촉, 라벨, 아이콘, 탭, 도구 막대의 모양과 상태는 각자 한 부품이 소유하고, 종류별 렌더러는 데이터와 배치 결과만 넘긴다. 같은 토큰을 읽는다는 이유로 같은 부품이라 하지 않고, 종류마다 새 카드, 새 컨트롤, 개별 보정을 만들지 않는다. 측정과 그리기는 같은 부품의 역할 규약을 쓴다. 실제 호출 지도는 [아키텍처](docs/architecture.md#부품-호출-지도)에 있다: 카드는 `build-scene.js`가 `measure/sizes.js`로 재고(머리는 `measure/card.js`, 글은 `measure/texts.js`) `draw/figure.js`가 `draw/shape.js` → `draw/card.js` → `draw/surface.js`와 `draw/texts.js`로 그리고, 선은 `draw/connector.js` → `draw/arrow.js`, 아이콘은 `icons/` 등록부 → `draw/decor.js`, 도구 막대와 탭 줄은 `html/player-script.js`의 `figureFrame` 하나, 켜짐과 평소의 모습은 `src/vendor/theme/styles/diagram/figure.css`의 `--fx-*` 하나다.
- 뷰어는 사람이 보기만 하는 순수 시각화기다. 자동 스크롤, 화면 안 가시성 대기, 그림 위에 겹쳐 뜨는 고정 탭, 수동 복사 팝업 같은 뷰어 동작을 더하지 않는다. 사용자 조작은 장면 탭, 문법 복사, HTML 다운로드, 전체화면뿐이고 새 재생 설정을 만들지 않는다.
- 태그를 만들거나 `npm publish`를 하지 않는다. 배포는 `release.yml`이 `v*` 태그에서 한다(`NPM_TOKEN` 등록 뒤 사용자가 태그)
- `package.json`의 `files`는 `src`, 로고 SVG(`docs/assets/daphnis-*.svg`), `LICENSE`, `NOTICE`만. 바꾸면 `npm pack --dry-run`으로 올라가는 파일을 직접 확인한다
- 배포 전에는 README에 npm 설치를 사용 가능으로 쓰지 않는다
- 다음 판은 `daphnis` 2로 올리는 단절 변경이다. 원본의 첫 비주석 의미 줄은 `daphnis 2`여야 하고, 판 1이거나 판 줄이 없으면 줄 위치와 함께 오류다. 옛 이름(`mutoscope` 명령, `.muto`, ` ```muto `, 옛 소유 표시)을 읽거나 옮기거나 안내하는 어댑터, 별칭, 폐기 안내 경로를 두지 않는다. 읽는 확장자는 `.dap`뿐이고 다른 확장자는 일반 오류다. `md`는 `daphnis md v2` 표시와 `<!-- dap -->` 이미지 줄만 이 도구의 것으로 보고, 그 밖의 표시가 붙은 파일과 줄은 사용자 것으로 두어 가져가지도 덮어쓰지도 지우지도 않는다. 호환을 위해 기존 출력과 옵션을 그대로 두는 제약은 없다
- 렌더러나 그림 CSS를 바꾼 뒤에는 `npm run figures`가 끝난 다음 `npm test`를 실행한다. 생성 그림을 검사하는 테스트와 그림 재생성을 병렬로 돌리지 않는다.
- 커밋 전 `npm test`와 `npm run check` 통과. `npm run check:advisory`는 항목을 읽어 보되 0건을 요구하지 않는다
- 동작, 계약, 설정 변경은 같은 PR에서 설계 문서 갱신
- 문법 표(`figure-syntax.md`)와 검사 표(`figure-check.md`)는 생성물이다. `src/source/grammar.js`나 `src/check/items.js`를 고친 뒤 `npm run grammar`, `npm run checkdoc`으로 다시 만들고 표를 손으로 고치지 않는다.
- 새 문서는 `docs/README.md` 문서 목록 안에서만 추가
- 배치에 넘긴 도형 크기와 연결점은 그리는 도형과 동일
- elkjs 경로 점 수정 금지. 예외는 `docs/design/layout.md` 선 그리기 절의 선 끝 계단 펴기 하나
- 오류가 있으면 결과 파일을 쓰지 않음
- `src/player/`는 시간표를 읽기만 하고 상태를 다시 계산하지 않음
- 화면 값·공통 스타일·아이콘·탭·도구 막대는 design-tokens의 단일 정본에서 가져온다. `src/vendor/theme`를 직접 수정하거나 Daphnis 토큰 사본을 따로 만들지 않는다. 제품 차이만 공통 역할 속성으로 재정의한다.
- `design-update.yml`이 공통 사본과 생성 그림을 검증한 PR로 반영한다. `sync-homepage.yml`은 같은 사본과 렌더러 커밋을 홈페이지에 전달한다.
- 생성 토큰과 가져온 `src/vendor/theme/`는 직접 수정하지 않는다. 사본 manifest 해시가 배포본과 같아야 한다.
