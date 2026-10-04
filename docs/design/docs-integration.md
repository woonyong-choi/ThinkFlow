# 문서 스킬 연동

| 항목 | 값 |
|---|---|
| 상태 | 제안 |
| 관련 결정 | [그림 문법과 배치를 직접 맡고 D2 호환을 버린다](../decisions/2026-10-01-own-syntax-and-layout.md) |

## 요약

문서 스킬 연동은 repo-docs-figures 스킬의 그림 도구 표에서 D2와 Vega-Lite 두 행을 이 도구 한 행으로 바꾸는 계약이다. 스킬의 그림 종류, 차트 종류, 색표, 글꼴, 변환 명령, 검사가 이 도구의 무엇에 대응하는지 정한다. 터미널 데모(VHS)는 그대로 둔다.

## 동기

지금 문서 스킬은 구조 그림을 D2로, 실험 차트를 Vega-Lite로 그리고, 두 도구에 같은 색을 넣으려고 변환 스크립트가 각 도구의 설정 형식으로 색표를 따로 넣는다. 글꼴은 보는 쪽에 설치되어 있어야 하고, D2 SVG에는 한글 글꼴이 들어가지 않는다. 도구가 하나면 색표, 글꼴, 여백, 움직임이 한 곳에서 정해지고, 스킬 규칙도 짧아진다.

## 예시

### 구성 요소 그림 변환

1. 기여자가 `docs/assets/architecture.muto`를 고친다.
2. 기여자가 저장소 루트에서 `python3 <스킬 폴더>/scripts/render_figures.py docs/assets/architecture.muto`를 실행한다.
3. 스크립트가 `mutoscope render --strict docs/assets/architecture.muto`를 부르고, 같은 폴더에 움직이는 SVG `architecture.svg`가 생긴다.
4. 그림 검사 오류가 있으면 스크립트가 실패하고 결과 파일은 생기지 않는다.

### 실험 차트 변환

1. `03-analyze`가 `results/summary.json`을 쓴다.
2. `results/figures/accuracy.muto`의 `data "../summary.json" at "/accuracy"`가 그 값을 읽는다.
3. 원본에 숫자를 손으로 적지 않는다.

## 상세 설계

### 그림 종류 대응

| 스킬 그림 | 지금 | 이 도구 |
|---|---|---|
| 맥락 그림 | D2 `direction: right`, 그룹 `system` | `flow right`, `person`, `box system`, `external`, `store` |
| 구성 요소 그림 | D2 그룹 `system` 안 구성 요소 | `flow right`, `group system`, 안에 `box`, `store` |
| 순서 그림 | D2 `shape: sequence_diagram` | `sequence` |
| 상태 그림 | D2 `direction: down` | `state down`, `start`, `final` |
| 데이터 그림 | D2 `shape: sql_table` | `data right`, `table`, `fk=` |

| 스킬 도형 규칙 | 이 도구 |
|---|---|
| 사용자: `shape: person` | `person` |
| 이 시스템: 이름이 `system`인 그룹 | 맥락 그림은 `box system`, 구성 요소 그림은 `group system` |
| 구성 요소, 모듈: 기본 사각형 | `box` |
| 외부 프로그램, 외부 서비스: `style.stroke-dash: 4` | `external` |
| 파일, 데이터베이스: `shape: cylinder` | `store` |
| 테이블: `shape: sql_table` | `table` |

- 스킬의 "한 쌍에 선 하나, 방향은 요청이 가는 쪽" 규칙은 [그림 문법](figure-syntax.md)이 오류로 지킨다. 스킬 문장에서 뺀다.
- 스킬의 식별자 규칙(영어 소문자 kebab-case)은 그림 문법의 이름 규칙과 같다. 테이블 이름은 `_`를 쓰고, 열 이름은 대문자도 쓴다([그림 종류](figure-kinds.md)).
- 스킬의 순서 그림 규칙(참여자는 처음 메시지를 보내는 순서)은 도구가 경고로 알린다([그림 종류](figure-kinds.md)).
- Markdown 표는 이 도구의 대상이 아니다. 글로 된 표는 계속 Markdown 표로 쓴다.

### 차트 종류 대응

| 스킬 Vega-Lite 차트 | 이 도구 |
|---|---|
| `bar`와 `errorbar`, 기준선 `rule` | `chart bar`, `계열.low`, `계열.high`, `rule` |
| 덤벨 | `chart dumbbell` |
| 상자 그림 | `chart box` |
| 산점도 | `chart scatter` |
| 히트맵 | `chart heatmap` |
| 선 | `chart line` |

- 스킬의 "값은 `03-analyze`가 넣고 손 기재 금지" 규칙은 `data` 줄로 지킨다.
- 스킬의 "막대 축 0에서 시작, y축 둘 금지, 계열 둘까지" 규칙은 [차트](charts.md)가 지킨다. 막대는 `scale log`가 오류라 늘 0에서 시작하고, 값 축은 하나뿐이며, 계열이 셋이면 오류다.

### 색 역할

색은 두 층이다. 원색(`color.palette.*`)이 값(hex)을 갖고, 역할 토큰이 원색을 가리킨다. 코드와 CSS는 역할 토큰만 쓰고 원색을 직접 쓰지 않는다(`test/contrast.test.js`의 `tokens_color_literals_live_only_in_the_palette_layer_and_code_never_names_it`가 막는다). 역할 표는 이 문서에만 있고 다른 문서는 이 표를 링크한다.

| 역할 | 뜻 | 라이트 | 다크 | 맞닿는 면 | 대비 |
|---|---|---|---|---|---|
| `state.active` | 지금 일어나는 것: 밝힌 선, 점, 켜진 도형과 그룹과 카드 테두리 | `#218fe5` | `#79c0ff` | 그림 바탕, 그룹, 카드 바탕, 노드, 문서 바탕 | 3.00 / 7.62 |
| `state.active-fill`, `state.on-active` | 지금 일어나는 것의 면(밝힌 알약, 이동 글 상자)과 그 위 글자 | `#1072c2` / `#ffffff` | `#79c0ff` / `#0d1117` | 서로 | 4.99 / 9.73 |
| `state.active-text` | 지금 일어나는 것을 가리키는 글자(카드 표시 ✓) | `#1072c2` | `#79c0ff` | 그림 바탕, 노드, 카드 바탕, 문서 바탕 | 4.53 / 7.62 |
| `ui.link` | 링크 글자 | `#1072c2` | `#79c0ff` | 그림 바탕, 노드, 카드 바탕, 문서 바탕 | 4.53 / 7.62 |
| `ui.focus`, `ui.progress` | 초점 고리, 재생기 진행 고리 | `#218fe5` | `#79c0ff` | 그림 바탕, 그룹, 카드 바탕, 노드, 문서 바탕 | 3.00 / 7.62 |
| `figure.icon` | 도형과 그룹의 아이콘(단색 파랑, NHN Cloud 아이콘 파랑 `#125DE6` 계열). 켜져도 바뀌지 않는다 | `#125de6` | `#6f9cf5` | 그림 바탕, 그룹, 카드 바탕, 노드, 문서 바탕 | 4.93 / 5.47 |
| `ui.control-on` | 켜진 탭 알약 면. 켜짐 표시는 `border` 색 고리가 맡는다 | `#ffffff` | `#3c3e42` | 글자 `fg` | 4.5 이상 |
| `data.main` | 차트에서 그림이 주장하는 계열(새 것, 개선) | `#218fe5` | `#79c0ff` | 그림 바탕, 그룹, 카드 바탕, 노드 | 3.00 / 7.62 |
| `data.compare` | 비교 기준 계열(기존) | `#d96c1f` | `#f5a374` | 같음 | 3.01 / 7.32 |
| `data.grid`, `data.heat-low` | 격자와 축, 히트맵 값 0 칸(꾸밈) | `#c6cacf` / `#a9cdea` | `#3c3e42` / `#2b4254` | 그림 바탕 | 1.54, 1.55 / 1.60, 1.65 |
| `flow.purple`, `flow.green`, `flow.teal`, `flow.gray` | 흐름 점과 이동 글 상자의 갈래색(`tone=`). 점, 글 상자 면과 테두리. 팔레트 점 단계(`paint.*.dot`) | `#483c95`, `#517000`, `#008084`, `#57494d` | `#9b90ff`, `#b6da70`, `#87f3f6`, `#b0a0a4` | 그림 바탕, 그룹, 카드 바탕, 노드, 문서 바탕. 글 상자 글자는 `state.on-active` | 4.16 / 5.13 이상 |
| `tag.purple`, `tag.green`, `tag.teal`, `tag.gray` | 카드 태그 범주색. 글자는 `fg`, 색은 옅은 띠(`opacity.tag`)로만. 팔레트 테두리 단계(`paint.*.stroke`) | `#b16fd4`, `#009d6e`, `#00999d`, `#818b96` | `#d3a3ee`, `#6cd0a4`, `#47d0d4`, `#afbbc6` | 노드, 카드 바탕 위 띠와 글자 `fg` | 8.46 이상 |
| `state.error`, `state.success`, `state.warning` | 오류, 성공, 경고. 테두리, 점, 표시 같은 그래픽에 쓰고 글자에는 쓰지 않는다. 팔레트 `red`, `green`, `amber`의 테두리 단계 | `#e0606a`, `#009d6e`, `#ad8300` | `#fa9a9d`, `#6cd0a4`, `#dab45c` | 그림 바탕, 그룹, 카드 바탕, 노드, 문서 바탕 | 3 이상 |
| `card` | 카드 기본 바탕. 도형 바탕(`node`)과 OKLab 거리가 `distance.card.min`~`max`(0.015~0.04) | `#f6f7f9` | `#2c2d30` | 글자 `fg`, `muted` | 4.5 이상 |
| `paint.<색>.fill`, `.stroke`, `.ink` | 원본이 `fill=`, `stroke=`, `card=`로 고르는 색. 이름은 `red`, `amber`, `green`, `teal`, `navy`, `purple`, `pink`, `gray`. 아래 팔레트 표 | 팔레트 표 | 팔레트 표 | 면 단계는 `fg`, `muted` 글자, 나머지 단계는 그림 면과 모든 색의 면 | 4.5 이상(글자), 3 이상(그래픽) |
| `border` | 노드, 그룹, 카드, 조작부 윤곽(그룹 테두리도 같은 색) | `#818b99` | `#72767a` | 그림 바탕, 그룹, 카드 바탕, 노드, 문서 바탕 | 3.02 / 3.01 |

- `flow.*`는 점이 한눈에 갈리도록 이름끼리 OKLab 거리 0.10 이상이고 적록 색각 이상(protanopia, deuteranopia) 시뮬레이션에서도 같다. 파랑(지금)과 주황(비교)과도 OKLab 거리 0.10 이상이다. `test/contrast.test.js`의 `flow_tone_colors_stay_apart_from_each_other_for_normal_protan_and_deutan_sight_and_from_blue_and_orange_for_normal_sight`가 잰다. 이름은 카드 태그 `tone`과 같은 집합이고 이름을 늘리면 `flow.*` 색도 같은 기준으로 더한다.
- 표 열의 PK, FK 표시는 항상 있는 스키마 표시라 파랑이 아니라 `color.muted`다.
- 칸 격자의 칸([칸 격자](grid.md))은 새 색 역할이 없다. 칸 면 `node`와 윤곽 `border`, 글 `fg`, 생략 칸 면 `surface`와 글 `muted`, 밝힌 칸 면 `card-on`과 윤곽 `state.active`가 위 기준의 기존 짝이다.
- 파랑은 "지금"(`state`)과 "주장하는 계열"(`data.main`)을 뜻하고, 조작부(`ui`)도 같은 파랑을 쓴다. 그 밖의 뜻으로는 쓰지 않는다. 한 가지 예외가 아이콘 색 `figure.icon`이다. 아이콘은 모든 그림에서 늘 파랑으로 칠해 구성 요소의 종류를 알리는 장식 단색이다(브랜드 고유색은 쓰지 않는다). 지금과 섞이지 않게 둘을 두 방법으로 가른다. 색상이 달라(라이트 `#125de6` 대 `#218fe5`, 다크 `#6f9cf5` 대 `#79c0ff`, `test/contrast.test.js`의 `palette_figure_icon_blue_differs_in_hue_from_the_active_blue_in_both_themes`) 아이콘은 짙고 보랏빛이다. 켜진 도형과 그룹은 테두리 색뿐 아니라 두께도 `border.thin`에서 `border.strong`으로 바뀌고 아이콘은 그대로다. 카드 태그는 파랑과 주황을 쓰지 않는다. 태그 색상이 `state.active`, `data.compare`와 40도 이상 떨어진다는 것을 `test/contrast.test.js`의 `tagColors_keep_their_hue_away_from_the_active_blue_and_the_compare_orange`가 잰다.
- `data.main`, `data.compare`는 선언 순서가 아니라 계열의 `role`이 정한다([차트](charts.md)). 같은 계열 이름은 모든 예제에서 같은 역할이다. `test/chart.test.js`의 `examples_same_series_label_and_id_have_the_same_role_in_every_source`가 잰다.
- 라이트 파랑은 이력서 저장소(woon-resume)의 `--manta-accent`에서 왔고 다크는 그대로다. 라이트 이력서 색은 회색 그림 바탕, 그룹 바탕, 카드 바탕 위에서 2.75~2.93이라 3에 못 미친다. 대비 규칙이 색 선택보다 우선이므로 그래픽 자리에는 같은 색상과 채도에서 3을 넘는 가장 밝은 `palette.blue.550`을 쓴다. 글자와 글자가 놓이는 면은 같은 색상에서 4.5를 넘는 가장 밝은 `palette.blue.600`이다.
- 주황은 파랑에서 만든다. 파랑을 OKLCH로 바꿔 L(밝기)과 C(채도)는 그대로 두고 색상만 h 50(주황)으로 돌렸다. 두 기준 색은 토큰이 아니라 `test/helpers.js`의 상수(`RESUME_ACCENT`, `RESUME_ORANGE`)다. 같은 규칙으로 그래픽 자리에는 3을 넘는 가장 밝은 `palette.orange.550`을 쓴다. 파랑과 주황은 적록 색각 이상(protanopia, deuteranopia) 시뮬레이션에서도 OKLab 거리 0.1 이상으로 구분된다. 글자, 보조 글자는 스킬 값이다.
- 라이트 모드 그림 바탕(`color.bg`)은 흰 문서 안에서 그림 경계가 보이도록 아주 옅은 회색(`palette.gray.25`)이고, 판 테두리(`color.plate-border`)가 경계를 더한다. 재생기와 목록 카드의 바깥 선, 조작 막대 선도 같은 `plate-border`다(예전 `color.frame`을 합쳤다. 라이트 `palette.gray.200`, 다크 `palette.neutral.800`). 상자, 원통, 사람, 테이블 채우기(`color.node`)는 라이트에서 흰색이라 바탕 위에 떠 보이고, 다크에서는 바탕(`palette.neutral.900`)보다 한 단계 밝은 `palette.neutral.850`이다. 구조 그림의 그룹은 `color.group`(바탕, 라이트 `palette.gray.40`, 다크 `palette.neutral.875`로 노드 `neutral.850`과 한 톤 갈라 안쪽일수록 밝아지는 쌓임이 이어진다)과 `color.border`로 경계를 잡는다. 이 회색 판은 문서에 넣는 SVG 파일에만 있다. 재생기와 목록 쪽 카드 안에서는 카드 전체가 같은 `color.bg` 한 톤이다.
- 9px 태그 글자는 범주색으로 쓰면 대비가 1.7~3.4라 읽기 어려워서, 글자는 `color.fg`로 쓰고 범주색은 글자 뒤의 옅은 바탕 띠로만 전한다. 태그 색은 갈래를 나누는 색이고 판정을 뜻하지 않는다. 스킬의 상태 색 금지는 차트 판정에 대한 규칙이라 태그 색과 부딪치지 않는다.


#### 팔레트

팔레트는 이력서 파랑의 OKLCH 밝기와 채도에서 색상만 돌린 색이다. 라이트는 이력서 `#2b96ed`(L 0.656, C 0.160), 다크는 `palette.blue.400`에서 읽는다. sRGB 밖이면 채도만 줄인다. `gray`는 같은 색상에서 채도를 낮췄다. 값은 `scripts/build-palette.mjs`가 토큰 정본의 면 값에서 계산해 `color.palette.*`에 쓰고(`npm run palette`, 이어 `npm run tokens`), `test/palette.test.js`가 다시 계산한 값과 같은지 본다. 색마다 단계는 셋이다. `fill`은 옅은 면(`fg`, `muted` 글자 4.5, `border` 3 이상), `stroke`는 같은 색상에서 모든 그림 면과 모든 색의 `fill` 위 3을 넘는 가장 밝은(다크는 가장 어두운) 값, `ink`는 같은 조건에서 4.5를 넘는 값이다. 갈래색(`flow.*`)은 `ink`와 같은 색상에 밝기만 달리한 `dot` 단계다. 같은 밝기의 색은 색각 이상 시뮬레이션에서 가까워지기 때문이다.

| 색 | 라이트 fill, stroke, ink | 다크 fill, stroke, ink |
|---|---|---|
| `red` | `#ffebea`, `#e0606a`, `#be414e` | `#402627`, `#fa9a9d`, `#fa9a9d` |
| `amber` | `#f9efda`, `#ad8300`, `#8a6800` | `#362c15`, `#dab45c`, `#dab45c` |
| `green` | `#dff7ea`, `#009d6e`, `#007c55` | `#173226`, `#6cd0a4`, `#6cd0a4` |
| `teal` | `#daf7f7`, `#00999d`, `#00797c` | `#0f3233`, `#47d0d4`, `#47d0d4` |
| `navy` | `#edefff`, `#7e7eeb`, `#6360ca` | `#2a2b42`, `#acb1ff`, `#acb1ff` |
| `purple` | `#f7ebff`, `#b16fd4`, `#9250b3` | `#35283d`, `#d3a3ee`, `#d3a3ee` |
| `pink` | `#ffeaf5`, `#d263a7`, `#b04488` | `#3d2633`, `#ee9bca`, `#ee9bca` |
| `gray` | `#edf0f4`, `#818b96`, `#646e78` | `#2a2d30`, `#afbbc6`, `#afbbc6` |

- 이웃한 색(색상 순서 `red`, `amber`, `green`, `teal`, `navy`, `purple`, `pink`)의 `stroke`는 OKLab 거리가 보통 시각에서 `distance.neighbor`(0.06) 이상, 적록 색각 이상(protanopia, deuteranopia) 시뮬레이션에서 `distance.neighbor-cvd`(0.025) 이상이다. 같은 밝기와 채도에서 색상만 다른 열 가지 색은 이보다 벌리기 어렵고, 색각 이상에서는 파랑 계열 이웃이 가까워진다. 그림은 색 하나로 뜻을 전하지 않는다. 이름과 글이 함께 간다. 팔레트 색은 모두 파랑(지금)과 주황(비교)에서도 보통 시각 0.06 이상 떨어진다.
- 갈래색(`flow.*`)끼리와 파랑, 주황은 `distance.flow`(0.10) 이상이다. 위 이웃 기준과 달리 색각 이상에서도 이 값이다.
- 색을 고른 도형이 켜지면 테두리는 그 색을 유지하고 굵기가 `border.thin`에서 `border.strong`으로 바뀌며 후광이 보인다. 파랑으로 바꾸지 않는 이유는 `stroke`가 "오류", "정상" 같은 범주를 나르고 있어 켜질 때 그 뜻이 사라지면 안 되기 때문이다. 파랑(지금)은 `stroke`를 고르지 않은 도형에만 쓴다.

### 색표와 글꼴

- 색의 정본은 이 도구의 `src/tokens.json`이다. 스킬의 색표 절은 토큰 이름 표로 바뀌고 값을 적지 않는다. 같은 값을 두 곳에 적어 어긋나는 일을 막기 위해서다.
- 모든 그림의 SVG `width`는 같은 표준 캔버스 폭(`size.figure-canvas`, 960)이다. 그림 머리 `width wide`를 쓴 그림만 넓은 폭(`size.figure-canvas-wide`)이고, 문서에서는 본문 폭에 맞춰 줄어든다. GitHub README는 이미지를 원래 크기보다 키우지 않고 본문 폭에 맞춰 줄이므로 모든 그림이 같은 폭으로 보인다. 가운데 정렬은 SVG 파일이 아니라 문서 쪽 몫이다. GitHub README는 `<img>` 하나만 두면 왼쪽에 붙으므로 `<p align="center"><img src="docs/assets/그림.svg" alt="설명"></p>` 형식으로 넣어야 가운데에 선다(Markdown 이미지 문법 `![]()`로는 정렬할 수 없다).
- 글꼴은 이 도구가 Inter, Noto Sans KR, JetBrains Mono 파일을 함께 배포하고 그림에 잘라 넣는다([배치](layout.md)). 스킬의 글꼴 설치 줄은 지운다.

### 대비 기준

화면 값은 라이트와 다크 모두 아래 기준을 넘는다. 기준은 `test/contrast.test.js`가 토큰 정본에서 풀어 매번 잰다.

| 쌍 | 기준 | 근거 |
|---|---|---|
| 본문 글자(`fg`), 보조 글자(`muted`)와 모든 면(`bg`, `node`, `surface`, `card-on`, `group`, `page`) | 4.5 이상 | WCAG 글자 기준 |
| 강조 글자(`state.active-text`: 링크, 카드 표시 ✓)와 그림 바탕, 노드, 카드 바탕, 문서 바탕 | 4.5 이상 | 같음 |
| 강조 그래픽(`state.active`: 밝힌 선, 점, 테두리, 진행 고리, 초점 고리)과 그림 바탕, 그룹 바탕, 카드 바탕, 노드, 문서 바탕 | 3 이상 | WCAG 그래픽 기준, 예외 없음. 라이트는 이력서 파랑과 같은 색상에서 3을 넘는 가장 밝은 `palette.blue.550`(가장 낮은 면 3.00)이다 |
| `state.on-active` 글자와 `state.active-fill` 면 | 4.5 이상 | 같음 |
| `state.on-active` 글자와 갈래색 면(`flow.*`) | 4.5 이상 | 같음. 갈래색 점은 모든 그림 면과 3 이상이다 |
| 카드 태그 글자(`fg`)와 어느 톤 띠 | 4.5 이상 | 같음 |
| 밝히지 않은 행(`ink.dim`, `opacity.dim-ink` 0.82)의 `fg`, `muted` 글자와 `bg` | 4.5 이상 | 같음. 흐린 `muted`는 라이트 4.68, 다크 4.81이다. 예전 0.65는 3.18, 3.51이라 규칙을 어겼다 |
| 히트맵 칸 숫자와 그 칸 색 | 4.5 이상 | 칸마다 어두운 글자와 밝은 글자 중 대비가 큰 쪽을 빌드 때 고르고, 어느 강도에서나 4.5를 넘게 칸 색 범위를 정했다 |
| 경계(`border`)와 그림 바탕, 노드, 그룹, 카드 바탕, 문서 바탕 | 3 이상 | WCAG 그래픽 기준, 예외 없음. 같은 색상에서 3을 넘는 가장 약한 값이다. 라이트 `palette.gray.500`, 다크 `palette.neutral.500` |
| 켜진 탭 표시(`border` 색 고리)와 탭 묶음 바탕 | 3 이상 | UI 상태 표시도 그래픽 기준이다. 알약 면(`ui.control-on`)은 글자 대비 4.5만 맡는다 |
| 팔레트 `fill` 위 글자(`fg`, `muted`)와 카드 태그 띠 위 `fg` | 4.5 이상 | 같음. 모든 색, 두 테마 |
| 팔레트 `stroke`와 그림 면, 모든 색의 `fill`. `state.error`, `state.success`, `state.warning` | 3 이상 | WCAG 그래픽 기준 |
| 팔레트 `ink`와 그림 면, 모든 색의 `fill`, 이동 글 상자 글자(`state.on-active`) | 4.5 이상 | 같음 |
| 계열 막대와 점(`data.main`, `data.compare`)과 그림 바탕, 노드, 그룹, 카드 바탕 | 3 이상 | 데이터 표시라 그래픽 기준이다. 라이트 주황은 `palette.orange.550`이다 |
| 차이 차트의 0선, 행 기준 점선, 잘린 축의 지그재그(`muted`)와 그림 바탕 | 4.5 이상 | 값 차이를 전하는 그래픽이라 `muted`가 이미 맞추는 글자 기준을 쓴다. 꾸밈 요소가 아니다 |
| 꾸밈 요소: 격자와 축, 히트맵 값 0 칸, 신뢰구간 띠와 덤벨 범위 막대기 | 1.5 이상 | WCAG 적용 대상 밖이다. 값은 숫자로도 적히고 이 요소는 구조만 돕는다 |
| 꾸밈 요소: 판 테두리(`plate-border`: 문서용 그림 판, 재생기와 목록 카드 바깥 선, 조작 막대 선)와 문서 바탕(`page`) | 1.3 이상 | WCAG 적용 대상 밖이다. 판 모양만 잡고 판 안 도형은 각자 3을 맞춘다. 라이트 1.39, 다크 1.36 |

### 변환과 검사

| 스킬 규칙 | 이 도구 |
|---|---|
| 변환은 `render_figures`로만 | `render_figures`가 `.muto` 원본마다 `mutoscope render --strict`를 부른다. 경고도 실패다 |
| 실험 차트 값 손 기재 금지, 비율에 신뢰구간 | `docs/experiments/` 아래 차트에 `--require-data --require-ci`를 붙인다([차트](charts.md)) |
| 원본과 만든 그림 함께 커밋 | 그대로 |
| 변환 뒤 그림을 열어 겹침, 잘림, 빈 영역 확인 | 겹침과 잘림은 [그림 검사](figure-check.md)가 대신한다. 빈 영역은 검사 항목이 없어 눈 확인으로 남는다 |
| 다시 변환 뒤 `git diff` 없음 | [배치](layout.md)의 결정성 요구사항이 지킨다 |
| 원본에 색, `config`, `sketch` 없음 | 색 줄과 hex는 문법에 없다. 도형 색은 팔레트 이름 `fill=`, `stroke=`, `card=`만 받아 검사 항목에서 지운다 |

- 결과는 움직이는 SVG `{이름}.svg` 하나다. 무엇이 언제 움직이는지는 [재생](playback.md)을 따른다. HTML 재생기는 문서 저장소에 넣지 않는다. 문서 저장소에 스크립트가 든 파일을 늘리지 않기 위해서다.

### 바꾸는 순서

1. 이 도구가 스킬의 다섯 그림(맥락, 구성 요소, 순서, 상태, 데이터)과 여섯 차트 종류를 구현하고, 모든 예제가 그림 검사를 통과한다.
2. repo-docs-figures 스킬의 도구 표, 색표, D2 절, Vega-Lite 절을 이 도구 기준으로 다시 쓰고, `render_figures`에 `.muto` 변환을 넣는다.
3. 스킬 저장소의 형식 검사가 `total 0`이 된 뒤 skill-sync로 설치한다.
4. 문서 저장소마다 `docs/assets/*.d2`와 `*.vl.json`을 `.muto`로 옮기고 다시 변환한다. 옮긴 뒤 D2와 Vega-Lite 변환 분기를 지운다.

- 1번이 끝나기 전에 스킬을 바꾸지 않는다. 없는 도구를 쓰라고 적는 스킬은 스킬의 정직한 상태 규칙을 어기기 때문이다.

### 요구사항

| 요구사항 | 검증 계획 |
|---|---|
| 스킬의 다섯 그림 템플릿을 새 문법으로 옮긴 원본이 검사를 통과한다. | 템플릿마다 원본을 만들어 `check` 실행 |
| 스킬의 여섯 차트를 `data` 줄로 그린다. | 예시 `summary.json`으로 여섯 원본 변환 |
| 같은 원본을 다시 변환해도 git 차이가 없다. | 두 번 변환 뒤 `git diff` 확인 |

## 단점

- 문서 저장소의 기존 D2, Vega-Lite 원본을 모두 다시 써야 한다.
- 스킬이 이 도구의 배포 방법(npm 패키지나 저장소 경로)에 묶인다.

## 미해결 질문

- 이 도구를 스킬 안 스크립트처럼 스킬 폴더에 넣나, npm 패키지로 배포하나.
