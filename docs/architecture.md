# 아키텍처

이 도구는 `.dap` 원본 하나를 움직이는 문서 그림 하나로 바꾸는 명령이다. 구성 요소는 셋이고, `cli`가 원본을 읽어 배치하고 검사한 장면과 시간표를 `player`(HTML)와 `svg`(움직이는 SVG)에 담는다. 이전의 D2 호환 첫 구현은 git 태그 `d2-compat`에 있다.

## 맥락

| 외부 요소 | 종류 | 주고받는 것 |
|---|---|---|
| `.dap` 원본 | 파일 | 첫 문장 `daphnis 2`, 카드, 칸, 선, 값, 보기, 장면, 차트 값 |
| 실험 결과 JSON | 파일 | 차트 `data` 줄이 읽는 값 |
| elkjs | 외부 프로그램 | 도형 크기와 연결점 제약, 도형 좌표와 직교 경로 |
| 글꼴 파일 | 파일 | Pretendard, JetBrains Mono의 글자 너비 표와 글자 모양 |
| 공통 디자인 완성본 | 배포 사본 | 토큰·CSS·아이콘·탭·프레임과 파일 해시 |
| repo-docs-figures 스킬 | 외부 프로그램 | `render_figures`가 부르는 `render` 명령과 그 종료 코드 |
| 브라우저 | 외부 프로그램 | 만든 HTML과 SVG |

## 코드 지도

| 구성 요소 | 하는 일 | 기술 | 위치 |
|---|---|---|---|
| `cli` | 원본을 읽고, 글을 재고, 배치하고, 그림을 검사하고, 시간표를 만들어 결과 파일을 쓰는 명령 | Node.js, elkjs | `src/`에서 `player/`, `svg.js`, `animate/`를 뺀 파일. 마크다운 문서 반영은 `md.js`, `md-run.js` |
| `player` | HTML 안에서 시간표대로 상태를 바꾸고 점을 옮기는 재생기, 전체 화면과 확대 | 브라우저 JavaScript | `src/player/` |
| `svg` | 시간표를 CSS keyframes와 SMIL로 바꾼 움직이는 SVG | SVG, CSS | `src/svg.js`, `src/animate/` |

### 부품 호출 지도

공통 부품이 어느 파일에 있고 누가 부르는지다. 종류별 코드는 데이터와 배치 결과만 넘기고, 같은 모양을 자기 파일에서 다시 만들지 않는다. 화살표는 부르는 쪽에서 부품으로 간다.

| 부품 | 측정(잰 값을 배치에 넘긴다) | 그리기(잰 값을 그대로 그린다) | 시험 |
|---|---|---|---|
| 카드 면과 구분선 | `measure/sizes.js`의 `sizeNode`(상자, 사람, 외부, 원통, 갈림길, 원), `table.js`(표, API), `class.js`(클래스, 인터페이스), `sizeParticipant`(순서 보기 참여자), 큐와 격자. `build-scene.js`가 도형마다 한 번 부른다 | `draw/figure.js`의 `drawScene` → `draw/shape.js` → `draw/card.js`의 `drawCard` → `draw/surface.js`의 `drawSurface`. 원통, 갈림길, 원, 상태 점만 `shape.js`가 모양 자체를 그린다 | `test/components.test.js`(U1) |
| 카드 머리 | `measure/card.js`의 `headerOf`와 `placeHeader`(표, API, 클래스, 순서 보기 참여자가 같은 머리), 상자와 사람은 같은 `headerDecor`. 폭과 안쪽 여백(`PAD`)을 한 곳에서 정한다. 제목은 아이콘과 배지를 뺀 폭(`room`)에서 줄을 나눈다 | `draw/card.js`의 `drawHead` → `draw/decor.js`의 `drawDecor`(아이콘, 배지, 개수)와 `draw/texts.js` | `test/components.test.js`(U2, U3), `test/text.test.js`(T6~T8) |
| 글 한 줄(text) | `measure/texts.js`의 `STYLE`(글 역할의 크기, 굵기, 줄 높이. 카드 라벨은 regular, 그룹 제목은 15 semibold이고 글자 사이 간격은 CSS와 같은 `tracking.text` 하나다), `textAt`(제목, 열 이름, 형식, 제약, 클래스 멤버, 격자 칸이 모두 같은 모양), `stackTexts`, `titleTexts`, `textBlock`(메모와 구획 제목), `textWidth`, `textSpan`, `allTexts`. 글을 읽는 방식은 `text.js`의 `isLiteralFace`가 글꼴로 정한다 | `draw/texts.js`의 `drawTexts`. 이동 글 상자가 피할 사각형(`draw/boxes.js`)과 그림 검사 1번(`check/fit.js`)도 같은 `textSpan`을 읽는다 | `test/components.test.js`(U1, U4, U5, U6), `test/text.test.js`(T1~T3, T5, T13) |
| 카드 본문(`text`, `value`, `graph`, `chart`)과 장면 내용(`show`) | `measure/content.js`의 `sizeContent`가 줄마다 태그, 표시, 본문, 관계 그래프 이름, 값을 text로 재고 `fitValueSlot`, `valueText`가 값 글을 재어 돌려준다 | `draw/content.js`의 `drawContent`와 `draw/values.js`는 잰 text를 `drawTexts`로 그리고 태그 알약, 그래프 도형만 따로 그린다 | `test/cards.test.js`(S8), `test/text.test.js`(T4) |
| 차트와 시간 머리 | `chart/labels.js`의 `drawHeader`가 제목(`label`)과 부제(`sub`)를 `stackTexts`로 쌓고 높이를 정한다. 차트(`chart/draw.js`)와 시간 보기(`layout/time.js`)가 같은 함수다 | 같은 함수가 `textMarkup`으로 그린다. 긴 글은 `chart.layout.width`나 없으면 `WIDTH`에서 줄을 나눈다 | `test/text.test.js`(T10, T11) |
| 연결선과 선 라벨 | 라벨 알약 크기 `measure/sizes.js`의 `sizePill`. 선 경로는 `layout/`이 정하고 건드리지 않는다 | `draw/connector.js`의 `drawEdge`, `drawEdgeLabel` | `test/components.test.js`(U6, U7) |
| 화살촉 | `draw/arrow.js`의 `headReach`(선 끝이 차지하는 크기). 차트 산점도와 덤벨이 읽는다 | 모양은 `arrowMarker` 하나다. 연결선은 `draw/connector.js`가 `edgeMarker`(보통 화살표와 클래스 관계의 머리)로 선 묶음 안에 정의를 두고 묶음의 `color`를 상속한다. 차트 방향선은 종류가 `CHART_ARROW`로 색 역할을 고르고(덤벨 main, 산점도 muted), `chart/dumbbell.js`와 `chart/scatter.js`가 `roleArrow`의 class와 끝 표식을 달며, `styles.js`가 `roleArrowDefs`로 쓰인 역할마다 정의 하나를 문서에 한 번 둔다. 역할 색은 `styles/chart.css`의 `.arrow-<역할>`이 한 번 정한다 | `test/components.test.js`(U7), `test/component-state.test.js` |
| 켜짐과 평소의 모습 | 없음 | `styles/figure.css`의 효과 한 벌(`--fx-*`)이 유일한 정의다. 정지 그림의 평소 규칙, HTML 재생기의 `.on` 규칙(`figure.css`, `styles/player.css`), 움직이는 SVG의 keyframes(`animate/animator.js`, 속성 이름만 쓴다)가 같은 속성을 읽는다. 고른 색(`tone`, `appearance`)은 `draw/paint.js`가 평소 값(`--fx-face`, `--fx-edge-rest`)만 바꾼다. 차트의 글자 바탕과 받침 선은 차트 묶음(`.fl-chart`)의 `color`가 싣는 면의 색(`--chart-ground`, `styles/chart.css`)을 `currentColor`로 읽고, 움직이는 SVG는 켜진 차트 카드에서 이 `color`만 켜짐 구간에 맞춰 바꾼다([차트](design/charts.md#그리기)) | `test/component-state.test.js`, `test/components.test.js`(U10). 둘은 선언을 읽는 시험이고 계산된 색은 Chrome에서 본 범위만 있다([표현 범위](design/expression-coverage.md#예제와-검증-범위)) |
| 아이콘 | `measure/decor.js`의 `layoutDecor`가 아이콘 칸 자리를 정한다 | 공통 SVG 원본과 `icons/index.js`의 `loadIcon`이 `iconData`를 만들고 `draw/decor.js`이 상자 머리, 그룹 탭, 타일에서 같은 도형을 그린다 | `test/components.test.js`(U8), `test/escaping.test.js`(I2, 사용자 SVG의 안전) |
| 장면 탭과 도구 막대 | 없음 | 공통 `DiagramFrame`·`TabList`가 마크업을 만들고 `bindTabs`가 선택·키보드를 연결한다. Daphnis는 장면 재생만 연결한다 | `test/components.test.js`(U9), `test/exports.test.js`(X10, X11) |

카드 본문과 `show`는 `source/content.js`의 글·관계 그래프 해석을 공유한다. `values.js`의 `initialCardRows`가 선언 본문과 값 줄의 순서를 합치고, 각 장면은 이 본문에서 시작한다. 차트는 독립 판, 차트 카드, 카드 본문에서 `draw/chart.js`의 `drawChartBody` 하나로 그리며 `chart-scene.js`가 세 자리의 프레임·효과를 함께 적용한다. 카드 안 차트는 별도 노드가 아니므로 연결과 보기에는 소유 카드를 쓴다.

호출의 방향은 `build-scene.js` → `measure/` → `layout/` → `draw/` → `svg.js`, `html/content.js` → `html.js`다. `measure/`는 `draw/`를 부르지 않고, `draw/`가 `measure/`의 `texts.js`, `content.js`, `decor.js`, `sizes.js`의 값(`STYLE`, `CONTENT`)을 읽어 잰 값과 그린 값이 같은 출처를 갖는다.

## 실행 흐름

### 그림 만들기

1. `cli`가 원본을 읽어 문서 모형 하나(`figure`)로 만든다. 첫 문장이 `daphnis 2`인지 보고(`source/version.js`), 줄을 머리, 선언, 시간 흐름으로 나눠 읽는다. 카드, 칸, 선, 값, 보기, 장면이 모든 카드에 같은 규칙으로 놓이고 그림 종류는 없다. 모형은 받은 원본 글을 그대로(`figure.source`, 줄바꿈과 첫 글자 포함) 간직해, 재생기의 문법 복사가 같은 글을 쓴다. 보기는 이름이 없고, 어느 보기에도 적히지 않은 카드는 기본 보기를 받으며, 보기에는 정해진 순서대로 내부 열쇠 `v1`, `v2`, ...가 붙는다(`views-check.js`). 도형과 그룹, `show` 줄의 색은 `tone`과 `appearance`로 모형에 들어간다. 파일을 다 읽은 뒤 이름 공간, 연결점(`카드.칸`), 보기 구성원, 선의 그릴 수 있음, 차트 묶음, 이동의 보기별 투영을 확인한다(`source/validate.js`, `views-check.js`, `project.js`. [그림 문법](design/figure-syntax.md)).
2. 값 글자 자리는 값이 모든 장면에서 가질 글의 실제 폭이라 시간표에 기대고 시간표는 배치에 기대므로, `build-scene.js`가 배치와 시간표를 되풀이하되 자리가 줄어들지 않고 네 번을 넘지 않는다(`value-slots.js`, 못 맞추면 `layout-unstable`).
3. 한 번의 되풀이 안에서: 글꼴 파일로 모든 글의 폭을 재 카드 크기와 연결점을 정하고(차트 카드는 모든 프레임 가운데 가장 큰 차트 크기), 보기마다 배치한다. 그래프는 그룹마다 그다음 바깥을 elkjs로 배치하고 경로 조각을 잇는다([배치](design/layout.md)). 순서는 격자 배치, 차트는 그림 크기, 시간 보기는 `layout/time.js`다. `layout/panels.js`가 판을 위에서 아래로 쌓아 장면 하나로 합친다.
4. `views.js`가 보기마다 모형을 줄이고(`viewFigure`), 합친 장면에서 시간표를 만든다. 점 이동 시간은 선 길이에 비례해 배치 뒤에 만들고, 이동 하나는 보기마다 hop 하나로 펼치되 시간은 첫 투영이 한 번만 정한다. 값에 묶인 차트는 프레임과 시간표 구간을 만든다(`chart-frames.js`). 모든 선과 가장 큰 카드가 보이는 상태에서 화면 오류를 검사한다([그림 검사](design/figure-check.md)).
5. 오류가 없으면 `cli`가 같은 장면과 시간표로 HTML이나 장면 하나의 움직이는 SVG를 쓴다. SVG는 장면의 `mode`(`static`은 마지막 상태, `once`는 한 번 재생하고 머묾, `loop`는 되풀이)와 `speed`로 재생한다.

### 시간표 모양

`buildFigure`의 결과는 `{ figure, scene, timeline, warnings, valueTexts }`다. 차트만 따로 있는 `chart` 결과와 `figure.kind`는 없다. 재생기와 SVG가 읽는 계약이다.

- `timeline.steps`: 장면마다 정확히 `{ label: string, mode: 'static' | 'once' | 'loop', speed: number }`다. 문자열 형태는 없다.
- `timeline.segs[]`: `{ si, bi, t0, t1, hops, nodesOn, partsOn, cards, cardsBefore, cardsAt, charts?, status?, ... }`. `t0`, `t1`은 논리 시각이다(효과 시간과 박자 뒤 머묾이 없다). 설명 글(`caption`)과 지나간 선을 남기는 목록은 없다. `hops`는 이동마다 보기별 투영 하나씩이고 `edge`는 합친 장면의 선·메시지 번호이며 같은 이동의 투영은 `at`, `ms`, `cut`이 같다. `charts`는 차트 카드 id → `{ series, growing, lights }`로 차트마다 따로 움직인다.
- `timeline.values[]`: 장면마다 값 줄 `{ si, id, node, t0, t1, initial, changes, periods }`. 바뀌는 순간의 밝힘은 `timeline.pulses`의 값 펄스가 맡는다. 같은 시각의 변화는 마지막 글 하나만 남는다. `node`가 없는 값은 카드에 보이지 않는다. 시각 `t`의 글은 `periods.find(([from, to]) => from <= t && t < to) ?? periods.at(-1)`이다. 장면이 없는 문서는 선언한 값마다 `si`가 없고 길이가 0이며 변화와 펄스가 없는 줄을 하나 갖는다(처음 값을 보이기 위한 줄이고 탭이나 시간을 만들지 않는다).
- `timeline.total`: 장면의 논리 길이의 합이다. 장면이 없거나 모두 길이 0이면 0이고 1ms로 올려 쓰지 않는다. 재생기는 이 값을 쓰지 않는다.
- `timeline.charts[카드 id]`: 값에 묶인 차트만. `{ id, rows: [{ si, t0, t1, periods: [[from, to, 프레임 번호, 바뀐 표식 id[]]] }] }`. 같은 규칙으로 보이는 프레임을 정하고, 장면의 첫 구간의 바뀐 표식은 장면이 시작할 때 보이는 값(`set=`과 `keep`을 반영한 시작 값)의 프레임과 견준다.
- `scene.chartFrames[카드 id]`: `{ marks: [{ id, tag }], frames: [{ [표식 id]: { attrs, text? } }] }`. 모든 프레임이 같은 표식을 갖고 `attrs`는 그 표식의 속성 전체다. 그려진 차트의 표식 요소에는 `data-mark`(글은 `data-mark-text`)가 붙고 차트 그림은 `<g data-chart="카드 id">` 안에 있다.
- `timeline.marks`: `{ [키]: [[from, to, si], ...] }`. 조용한 선이 보이는 구간이다(`quiet:번호`). 같은 장면 안에서만 합치고 길이 0 구간도 남기며, 세 번째 값이 구간을 소유한 장면이다. 점이 지나는 동안의 선은 이동 목록(`hops`)에서 구하고, 켜 둔 도형과 부분, 차트 행은 구간(`nodesOn`, `partsOn`, `charts[id].lights`)이 가진다.
- `timeline.pulses`: `[{ key, at, si }]` 시각 순. 키는 `value:값 줄 번호`나 `chart:차트:표식 id`이고 `si`는 출처 장면이다. 펄스 모양은 `src/pulse.js`다(`PULSE`, `PULSE_MS`, `envelopeKeys`).
- `timeline.presentation[si]`: 장면마다 표시 길이(화면 ms). 논리 길이를 `speed`로 나눈 값과 마지막 펄스·선 이탈에 `PULSE_MS`를 더한 값 가운데 큰 것이고, 컴파일러가 한 번 정해(`timeline-marks.js`의 `presentationOf`) 재생기와 SVG가 읽는다([재생](design/playback.md#장면과-재생-방식)).
- `scene`: `{ items, groups, edges, lifelines, notes, activations, destructions, fragments, plots, times, panels, chartFrames, width, height, tagOrder }`. 도형, 그룹, 선에는 `view`(보기의 내부 열쇠 `v1`, `v2`, ...)가 있고 선에는 `strategy`가 있다. 같은 카드가 여러 보기에 그려지면 `items`에 같은 `id`가 여러 번 있다. `panels[]`는 `{ index, view, strategy, box: { x, y, w, h }, label?, labelAt? }`이고 `box.w`는 판의 자연 폭이다. `plots[]`와 `times[]`는 차트 보기와 시간 보기 판이다.
- 재생기가 해야 할 일: 같은 `id`의 요소는 `querySelectorAll`로 모두 찾고, 시각의 상태는 `periods`와 `charts`의 같은 규칙으로 정하고, 펄스는 `timeline.pulses`로 건다. 애니메이션 끝 이벤트는 논리 상태를 정하지 않는다.

장면 생성은 `build-scene.js`가 맡고 최초 빌드와 재배치가 같은 카드 크기·배치·충돌 검사를 사용한다.

### 공통 디자인 가져오기

1. 공통 정본의 완성본을 `src/vendor/theme/`에 가져온다. 토큰 JSON·CSS·JS, 아이콘, 스타일, 탭·프레임과 해시 manifest가 하나의 배포본이다.
2. `npm run design:sync -- <정본 경로>`는 원본과 기존 사본을 검증한 뒤 갱신한다. 소비자가 수정한 사본은 덮어쓰지 않는다.
3. `npm run figures` 뒤 `npm test`, `npm run check`를 실행한다. Daphnis에서 토큰을 합치거나 다시 생성하지 않는다.
4. 자동 수신은 `design-update.yml`에서 전체 CI를 통과한 PR을 병합한다. `sync-homepage.yml`은 같은 디자인과 고정된 렌더러 커밋을 홈페이지로 전달한다.

### 재생하기

1. 브라우저가 HTML을 열면 `player`가 장면을 탭으로만 고른다. `static` 장면은 마지막 상태를 그리고, `once`는 한 번 재생한 뒤 마지막 상태에 머물고, `loop`는 같은 장면을 되풀이한다. 다음 장면으로 저절로 넘어가지 않는다.
2. `player`가 박자마다 시간표의 상태를 그대로 그리고 점을 경로 위로 옮긴다([재생](design/playback.md)).
3. 브라우저가 SVG를 열면 `svg` 안의 keyframes와 SMIL이 장면 하나의 시간표를 `mode`와 `speed`대로 재생한다.

## 불변 조건

- 배치에 넘긴 도형 크기와 연결점은 그리는 도형과 같다. 선 끝이 도형에서 떨어지는 일을 막기 위해서다.
- elkjs가 돌려준 좌표와 경로 점은 옮기지 않는다. 경로 후처리끼리 충돌하는 일을 막기 위해서다. 예외는 [배치](design/layout.md) 선 그리기 절의 선 끝 계단 펴기 하나다.
- 글 폭은 그림에 넣는 글꼴과 같은 글꼴 파일로 잰다. 잰 폭과 그려진 폭이 어긋나는 일을 막기 위해서다.
- 오류가 하나라도 있으면 결과 파일을 쓰지 않는다. 깨진 그림이 문서에 올라가는 일을 막기 위해서다.
- 같은 원본과 같은 버전은 바이트까지 같은 결과를 낸다. 다시 변환해도 git 차이가 없게 하기 위해서다.
- `player`와 `svg`는 시간표를 읽기만 하고 상태를 다시 계산하지 않는다. HTML과 SVG가 다르게 움직이는 일을 막기 위해서다. 보기가 여럿이어도 이동과 값 변화는 시간표에서 한 번만 계산된다.
- 논리 시각(`t0`, `t1`, `at`, `ms`, 값 구간, 프레임 구간)은 재생 속도, 펄스, 화면 길이가 바꾸지 않는다. 펄스의 꼬리는 화면 길이만 늘린다.
- 값 글자와 차트 카드 크기는 실제 글꼴로 잰 글 폭이다. 렌더러가 같은 글꼴로 같은 줄 나눔을 쓴다.
- 점 이동 곡선, 글 상자 밀어 넣기, 차트 자라기는 HTML과 SVG가 같은 토큰과 같은 규칙을 쓴다. 규칙은 `src/easing.js`, `src/chip.js`, `src/chart/motion.js`에 있고, 브라우저 코드(`player/`)는 불러올 수 없어 같은 계산을 따로 둔다. 글 상자 자리는 예외로, 빌드 때 시간표에 담은 계획을 재생기가 보간만 한다.
- 크기·간격·색·시간은 공통 정본의 토큰만 쓴다. 가져온 사본은 직접 수정하지 않는다.
- 그림은 정의된 부품을 가져다 조립한다(React처럼 합성하되 React에 기대지 않는다). 흐름은 원본 문법 → 공통 모형 → 필요한 배치 → 공통 부품 → 조작부 하나다. 카드(머리와 필드 줄), 연결선과 라벨, 화살촉, 아이콘, 장면 탭, 도구 막대는 모양과 상태를 부품 하나가 소유하고, 종류별 렌더러는 데이터와 필요한 배치 결과만 넘긴다. 같은 토큰을 읽는 것만으로 같은 부품이라 하지 않고, 측정과 그리기는 같은 부품의 역할 규약을 쓴다. 같은 모양이 종류마다 복제되는 일과 같은 시험이 종류마다 되풀이되는 일을 막기 위해서다. 부품이 코드의 어느 파일에 있는지는 [부품 호출 지도](#부품-호출-지도)에 있다.
- 변환 중 네트워크에 접근하지 않는다. 글꼴과 배치 엔진을 모두 함께 배포한다.

## 기술 선택

| 영역 | 선택 | 고른 이유 |
|---|---|---|
| 층 배치와 직교 경로 | elkjs(ELK layered) | 도형 크기, 연결점, 선 라벨 크기를 받아 겹치지 않게 배치한다. [결정 기록](decisions/2026-10-01-own-syntax-and-layout.md) |
| 글꼴 | Pretendard, JetBrains Mono | 본문은 한글, 라틴, 기호, 숫자 모두 Pretendard 하나다. 참고 문서 페이지와 같은 글꼴이라 그림이 따로 놀지 않는다. 차트 숫자는 Pretendard의 자리 폭 같은 숫자(`tnum`)다. 고정폭 JetBrains Mono는 코드(백틱 구간, 테이블 열 타입)에만 쓰고 그 안 한글은 Pretendard로 이어 그린다. 굵기마다 정적 파일이 있는 `pretendard` 패키지로 받는다. 가변 글꼴이나 조각 나뉜 패키지보다 fontkit 측정과 subset-font 자르기가 한 파일에서 끝나서 고른다. 모두 SIL Open Font License라 그림에 넣을 수 있다. 글자 간격은 -0.3px다. |
| 결과 형식 | SVG, HTML | SVG는 README와 설계 문서에 이미지로 들어가고, HTML은 미리보기와 목록 쪽에서 열린다. 둘 다 추가 프로그램이 필요 없다. |
| 공통 디자인 | `src/vendor/theme/` | 웹과 도표가 같은 토큰·아이콘·탭을 조립한다. 사본은 해시로 검증하고 정본에서만 수정한다. |
| 실행 환경 | Node.js 20 이상 | elkjs와 글꼴 처리를 브라우저 없이 돌린다. |

## 소비자 API와 좁은 화면

공개 API는 `buildFigure`, `toSvg`, `toHtml`이다. 홈페이지는 빌드 때 `buildFigure(source, { allowFileAccess: false })`로 문서에 포함된 도표를 만들고 `toHtml`의 결과를 저장한다. 이 옵션은 차트 data와 사용자 아이콘 폴더를 읽기 전에 거절한다. 브라우저는 완성된 HTML의 시간표만 재생한다. `daphnis/design-manifest.json`은 소비자가 디자인 해시 일치를 검사하는 공개 계약이다.

`buildFigure`는 원본의 의미와 배치에서 시간표를 만들며, `reflowFigure`는 기존 시간표의 사건을 보존하고 그래프 보기의 새 배치에 경로만 대응하며, `chartWidth`가 있으면 차트를 그 폭 이하로 다시 그린다. `track-geometry.js`는 경로 기하만 계산하고 `reflow-timeline.js`는 중간 도착 시각을 유지하는 거리 비율을 만든다. 브라우저가 새 사건이나 값을 계산하지 않는 규칙은 같다. 자세한 계약은 [좁은 화면 배치](design/layout.md#좁은-화면을-위한-배치-목표-폭)에 있다.

HTML은 `html/responsive.js`가 좁은 배치 후보를 미리 만들고 `player/responsive.js`가 같은 시계에서 그림만 전환한다. 비활성 template을 사용해 표시 SVG와 ID를 중복하지 않는다. 사건을 다시 실행하거나 탭·조작부를 다시 만들지 않는다. 후보는 이동 글 경고(그림 검사 7번)가 원본 배치보다 늘지 않을 때만 싣고, 그래프 후보가 안 되면 차트만 좁힌 후보를 같은 기준으로 본다. 둘 다 안 되면 좁은 배치 없이 원본 배치 하나를 폭에 맞춰 줄인다. 세부 계약과 남은 가로 넘침은 [배치 설계](design/layout.md)에 적는다.

공통 tokens.js는 px·ms 값을 계산용 숫자로 내보내고 em 같은 상대 단위는 단위를 보존한다. 측정기는 글자 크기와 함께 해석한다.
