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

1. 기여자가 `docs/assets/architecture.dap`를 고친다.
2. 기여자가 저장소 루트에서 `python3 <스킬 폴더>/scripts/render_figures.py docs/assets/architecture.dap`를 실행한다.
3. 스크립트가 `daphnis render --strict docs/assets/architecture.dap`를 부르고, 같은 폴더에 움직이는 SVG `architecture.svg`가 생긴다.
4. 그림 검사 오류가 있으면 스크립트가 실패하고 결과 파일은 생기지 않는다.

### 실험 차트 변환

1. `03-analyze`가 `results/summary.json`을 쓴다.
2. `results/figures/accuracy.dap`의 `data "../summary.json" at "/accuracy"`가 그 값을 읽는다.
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
| `state.active` | 지금 일어나는 것: 밝힌 선, 점, 켜진 도형과 그룹과 카드 테두리, 후광. 브랜드 파랑 | `#125de6` | `#70a3ff` | 그림 바탕, 그룹 셋, 카드 바탕, 노드, 문서 바탕 | 3.87 / 4.26 |
| `state.active-fill`, `state.on-active` | 지금의 면(밝힌 알약, 이동 글 상자)과 그 위 글자 | `#0151d9` / `#ffffff` | `#70a3ff` / `#111111` | 서로 | 6.60 / 7.53 |
| `state.active-text`, `ui.link` | 지금을 가리키는 글자(카드 표시 ✓), 링크 | `#0151d9` | `#78a9ff` | 그림 바탕, 노드, 그룹 셋, 카드 바탕 | 4.54 / 4.54 |
| `ui.focus`, `ui.progress` | 초점 고리, 재생기 진행 고리 | `#125de6` | `#70a3ff` | 그림 바탕, 그룹 셋, 카드 바탕, 노드, 문서 바탕 | 3.87 / 4.26 |
| `figure.icon` | 도형과 그룹의 아이콘(브랜드 파랑 단색, NHN 컬러 아이콘처럼). 켜져도 바뀌지 않는다 | `#125de6` | `#70a3ff` | 그림 바탕, 그룹 셋, 카드 바탕, 노드, 문서 바탕 | 3.87 / 4.26 |
| `data.main` | 차트에서 그림이 주장하는 계열(새 것, 개선) | `#125de6` | `#70a3ff` | 그림 바탕, 그룹 셋, 카드 바탕, 노드 | 3.87 / 4.26 |
| `data.compare` | 비교 기준 계열(기존). 주황은 비교와 주의에만 쓴다 | `#d44b00` | `#fa7a49` | 같음 | 3.01 / 4.05 |
| `flow.brand`, `flow.purple`, `flow.green`, `flow.gray`, `flow.red` | 흐름 점과 이동 글 상자의 갈래색(`tone=`). 이름이 곧 색이다(brand는 브랜드 파랑, red는 오류). 팔레트 점 단계(`paint.*.dot`) | `#125de6` / `#704f8c` / `#006d12` / `#747474` / `#6c0001` | `#70a3ff` / `#9c7abb` / `#62c963` / `#c7c7c7` / `#e25971` | 그림 면, 글 상자 글자 | 글 상자 글자 4.5 / 면 3 이상 |
| `state.error`, `state.success`, `state.warning` | 오류, 성공, 주의. 그래픽에 쓰고 글자에는 쓰지 않는다 | `#c70005` / `#008c1a` / `#d44b00` | `#fc7182` / `#58bf5a` / `#fa7a49` | 그림 바탕, 그룹 셋, 카드 바탕, 노드 | 3 이상 |
| `color.bg`, `color.node`, `color.page` | 그림 바탕(판), 도형 바탕, 문서 바탕 | `#f8f8f8` / `#ffffff` / `#ffffff` | `#171717` / `#3e3e3e` / `#121212` | - | - |
| `group-1`, `group-2`, `group-3` | 그룹 깊이 1, 2, 3 이상 면(무채색, 깊이마다 한 단계씩 진하게, 다크는 밝게) | `#ededed` / `#e1e1e1` / `#d6d6d6` | `#202020` / `#2a2a2a` / `#343434` | - | - |
| `group-title` | 그룹 제목 글자 | `#595959` | `#aaaaaa` | 그룹 셋 | 4.82 / 5.36 |
| `outline` | 도형 외곽선(상자, 원통, 사람, 갈림길, 원, 테이블, 격자 칸, 카드, 알약). 1px, 외부는 점선 | `#787878` | `#888888` | 판, 그룹 셋, 도형, 카드 바탕 | 3.04 / 3.02 |
| `border`, `plate-border`, `line` | 머리카락 테두리(조작부, 카드), 판 바깥 선, 선과 점선 경계(꾸밈) | `#e4e4e4` / `#dadada` / `#b7b7b7` | `#393939` / `#363636` / `#595959` | - | 꾸밈 기준 |
| `card`, `card-on` | 카드 기본 바탕(도형 바탕과 OKLab 거리 `distance.card.min`~`max`)과 켜진 카드 바탕 | `#f4f4f4` / `#edf4ff` | `#363636` / `#1c2a43` | - | 글자 `fg`, `muted` 4.5 이상 |
| `tag.purple`, `tag.green`, `tag.gray`, `tag.red`, `tag.brand` | 카드 태그 범주색. 글자는 `fg`, 색은 옅은 띠(`opacity.tag`)로만. 팔레트 선 단계(`paint.*.stroke`). 자동 배정은 purple, green, gray 순이고 brand와 red는 `tone`으로 고를 때만 쓴다 | 팔레트 선 단계 | 팔레트 선 단계 | 노드, 카드 바탕 위 띠와 글자 `fg` | 4.5 이상 |
| `paint.<색>.fill`, `.stroke`, `.ink`, `.outline` | 원본이 `fill=`, `stroke=`, `card=`로 고르는 색. 이름은 `red`, `amber`, `green`, `teal`, `navy`, `purple`, `pink`, `gray`, `sky`(그룹 강조). `teal`은 초록, `pink`는 보라, `navy`와 `sky`는 브랜드 파랑, `amber`는 주의 주황을 쓴다. 아래 팔레트 표 | 팔레트 표 | 팔레트 표 | 면은 `fg`, `muted` 글자, 선과 글자는 그림 면, 외곽선은 자기 면과 판, 도형 바탕 | 4.5 이상(글자), 3 이상(그래픽) |
| `paint.sky.group-1..3`, `paint.purple.group-1..3` | 강조 그룹의 틴트 면(깊이마다 한 단계씩). 회색 그룹 면과 같은 밝기에 색상각만 얹는다 | 팔레트 틴트 | 팔레트 틴트 | 그룹 제목, 외곽선 | 4.5 / 3 이상 |

- `flow.*`는 점이 한눈에 갈리도록 이름끼리 OKLab 거리 0.10 이상이고 적록 색각 이상(protanopia, deuteranopia) 시뮬레이션에서도 같다. 파랑(지금)과 주황(비교)과도 OKLab 거리 0.10 이상이다. `test/contrast.test.js`의 `flow_tone_colors_stay_apart_from_each_other_for_normal_protan_and_deutan_sight_and_from_blue_and_orange_for_normal_sight`가 잰다. 이름은 카드 태그 `tone`과 같은 집합이고 이름을 늘리면 `flow.*` 색도 같은 기준으로 더한다.
- 표 열의 PK, FK 표시는 항상 있는 스키마 표시라 파랑이 아니라 `color.muted`다.
- 칸 격자의 칸([칸 격자](grid.md))은 새 색 역할이 없다. 칸 면 `node`와 윤곽 `border`, 글 `fg`, 생략 칸 면 `surface`와 글 `muted`, 밝힌 칸 면 `card-on`과 윤곽 `state.active`가 위 기준의 기존 짝이다.
- 파랑은 "지금"(`state`)과 "주장하는 계열"(`data.main`)을 뜻하고, 조작부(`ui`)도 같은 파랑을 쓴다. 그 밖의 뜻으로는 쓰지 않는다. 아이콘 색 `figure.icon`도 같은 브랜드 파랑이다(NHN 컬러 아이콘처럼, 색상각 차이 1도 이내, `test/contrast.test.js`의 `palette_figure_icon_is_the_brand_blue_of_the_active_blue_in_both_themes`). 지금은 색이 아니라 켜진 도형과 그룹의 테두리 두께(`border.thin`에서 `border.strong`)와 후광이 알리고 아이콘은 그대로다. 카드 태그는 파랑과 주황을 쓰지 않는다. 태그 색상이 `state.active`, `data.compare`와 40도 이상 떨어진다는 것을 `test/contrast.test.js`의 `tagColors_keep_their_hue_away_from_the_active_blue_and_the_compare_orange`가 잰다.
- `data.main`, `data.compare`는 선언 순서가 아니라 계열의 `role`이 정한다([차트](charts.md)). 같은 계열 이름은 모든 예제에서 같은 역할이다. `test/chart.test.js`의 `examples_same_series_label_and_id_have_the_same_role_in_every_source`가 잰다.
- 색 사용은 NHN Cloud 아키텍처 자료(github.com/nhn-cloud/Icons)를 따른다. 그림은 무채색 회색이 대부분이고, 브랜드 파랑 `#125DE6`은 핵심 자리(지금 밝힘, 흐르는 선과 점과 글 상자, 차트 주 계열, 구성도 아이콘, 재생기 진행 고리)에만 쓴다. 다크는 같은 색상각에서 다크 면 위 대비를 넘는 밝은 단계(선 `#70a3ff`, 글자 `#78a9ff`)다. 보라 `#B28FD1`, 빨강 `#EF0F0F`(오류), 초록 `#09C72C`(정상)는 드문 강조이고, 주황은 NHN에 없어 비교(`data.compare`)와 주의(`state.warning`)에만 남는다. 흐름 색은 첫째가 브랜드 파랑, 둘째가 보라, 셋째 이후가 진한 회색, 오류가 빨강이다. `tone=brand`가 파랑, `tone=purple`이 보라, `tone=green`이 초록, `tone=gray`가 진한 회색, `tone=red`가 빨강을 그린다. 옛 `blue`는 `brand`로, 옛 `teal`과 `orange`는 `purple`로 읽는 폐기 별칭이다.
- 주황은 NHN 자료에 없어 비교(`data.compare`)와 주의(`state.warning`)에만 남고 `ANCHORS`에서 같은 방식으로 계산한다. 원색은 라이트 `#e65200`이다. 색상 50도는 red(26도)와 amber(85도 근처)의 가운데이고 채도는 파랑(0.153) 수준이라 톤이 같다. 다크는 amber와 OKLab 거리 0.06을 넘기려고 밝기와 채도를 정했다. 라이트는 3을 넘는 가장 가까운 값(`#d36f2b`)이다. 파랑과 주황은 적록 색각 이상(protanopia, deuteranopia) 시뮬레이션에서도 OKLab 거리 0.1 이상으로 구분된다. 글자, 보조 글자는 스킬 값이다.
- 라이트 모드 그림 바탕(`color.bg`)은 흰 문서 안에서 그림 경계가 보이도록 아주 옅은 회색(`palette.gray.25`)이고, 판 테두리(`color.plate-border`)가 경계를 더한다. 재생기와 목록 카드의 바깥 선, 조작 막대 선도 같은 `plate-border`다(예전 `color.frame`을 합쳤다. 라이트 `palette.gray.200`, 다크 `palette.neutral.800`). 상자, 원통, 사람, 테이블 채우기(`color.node`)는 라이트에서 흰색이라 바탕 위에 떠 보이고, 다크에서는 바탕(`palette.neutral.900`)보다 한 단계 밝은 `palette.neutral.850`이다. 구조 그림의 그룹은 중첩 깊이로 무채색 회색 면을 한 단계씩 진하게 고르고, 일반 그룹은 외곽선 없이 면 밝기 차이로만 구분한다. 깊이 1(판 바로 위)은 `color.group-1`(라이트 `#ededed`, 다크 `#202020`), 깊이 2는 `color.group-2`(라이트 `#e1e1e1`, 다크 `#2a2a2a`), 깊이 3 이상은 `color.group-3`(라이트 `#d6d6d6`, 다크 `#343434`)이다. 판은 라이트 `#f8f8f8`, 다크 `#171717`이고 도형 바탕은 라이트 `#ffffff`, 다크 `#3e3e3e`다. 점선 경계 그룹만 점선을 그리고 면은 같은 규칙이다. 강조 그룹은 `fill=sky`(브랜드 파랑과 같은 색상각의 하늘색)나 `fill=purple`(보라)로 고르고, 그 그룹은 면을 그 색의 옅은 틴트로 칠한다(`paint.<색>.group-1`). 강조 그룹 안의 그룹은 같은 색상각 틴트를 깊이마다 한 단계씩 진하게(다크는 밝게, `group-2`, `group-3`) 칠한다. 틴트 단계의 밝기(OKLCH L)는 회색 그룹 면과 같고 채도만 0.022, 0.028, 0.034로 얹는다. 강조 그룹 밖은 위의 회색 위계 그대로다. 강조 그룹의 테두리(1.5px, `border.tag`)와 제목 글자는 그 색의 진한 단계(`paint.<색>.ink`, 틴트 위 제목 4.5, 테두리 3 이상)다. 빨강과 초록은 상태 도형 면 전용이라 그룹 강조로 쓰지 않고, 그 밖의 이름을 그룹에 적으면 테두리와 제목만 그 색이고 면은 회색이다. 그룹 제목은 `color.group-title`로 세 회색 면 위에서 4.5 이상이다. 면을 칠한 도형(`fill=`, `stroke=`)의 외곽선은 그 색의 `paint.<색>.outline`이다. 면과 진한 선을 OKLab에서 반씩 섞은 값에서 같은 색상으로 밝기만 옮겨 그 면, 판, 도형 바탕 위 대비 3을 맞춘다. 이 회색 판은 문서에 넣는 SVG 파일에만 있다. 재생기와 목록 쪽 카드 안에서는 카드 전체가 같은 `color.bg` 한 톤이다.
- 9px 태그 글자는 범주색으로 쓰면 대비가 1.7~3.4라 읽기 어려워서, 글자는 `color.fg`로 쓰고 범주색은 글자 뒤의 옅은 바탕 띠로만 전한다. 태그 색은 갈래를 나누는 색이고 판정을 뜻하지 않는다. 스킬의 상태 색 금지는 차트 판정에 대한 규칙이라 태그 색과 부딪치지 않는다.


#### 팔레트

팔레트는 색마다 사람이 정한 원색 하나에서 대비 규칙으로 단계를 계산한 값이다. 원색 표는 `scripts/lib/palette.mjs`의 `ANCHORS` 한 곳이고 NHN 자료의 색(파랑 `#125DE6`, 보라 `#B28FD1`, 빨강 `#EF0F0F`, 초록 `#09C72C`)과 주황(비교, 주의용) 다섯이다. 다크 원색은 라이트와 같은 색상각에서 밝기를 올린 값이다. 단계는 fill(옅은 면), stroke(그래픽, 면 위 대비 3), ink(글자와 켜진 면, 대비 4.5), dot(흐름 점), outline(외곽선, 대비 3)이고, 파랑은 히트맵 두 끝과 아이콘 단계가 더 있다. 범주 이름 `navy`는 파랑, `pink`는 보라, `teal`은 초록, `amber`는 주황(주의), `sky`는 파랑 강조용 옅은 면을 쓴다.

| 색 | 라이트 fill, stroke, ink | 다크 fill, stroke, ink |
|---|---|---|
| `red` | `#ffefed`, `#da1e28`, `#d71925` | `#482123`, `#ff8389`, `#ff8389` |
| `amber` | `#fbf3e1`, `#8e6a00`, `#8b6800` | `#3a2b01`, `#d2a106`, `#d2a106` |
| `green` | `#e9f8ea`, `#219f46`, `#007f31` | `#12331a`, `#42be65`, `#42be65` |
| `teal` | `#e1f9f8`, `#009a97`, `#007a78` | `#003333`, `#08bdba`, `#08bdba` |
| `navy` | `#eef4ff`, `#0043ce`, `#0043ce` | `#1c2d4b`, `#1f6bff`, `#5791ff` |
| `purple` | `#f5f1ff`, `#a36cfd`, `#864cdb` | `#332748`, `#be95ff`, `#be95ff` |
| `pink` | `#ffeff3`, `#d02670`, `#cd226e` | `#462131`, `#ff7eb6`, `#ff7eb6` |
| `gray` | `#ecf5fd`, `#697077`, `#676e75` | `#282e33`, `#a2a9b0`, `#a2a9b0` |

갈래색의 `dot` 단계(라이트, 다크)는 `green` `#008634`, `#42be65`, `teal` `#007a78`, `#009d9b`, `purple` `#864cdb`, `#be95ff`, `gray` `#474e54`, `#aeb5bc`다. 파랑 묶음(`blue`)에는 `fill`, `stroke`, `ink`와 함께 카드 바탕(`card-on`)이 되는 `fill`, 히트맵 두 끝(`heat-low`, `heat-high`), 아이콘(`icon`)이 있고, 주황 묶음(`orange`)은 `data.compare`가 쓰는 세 단계다.

- 이웃한 색(색상 순서 `red`, `amber`, `green`, `teal`, `navy`, `purple`, `pink`)의 `stroke`는 OKLab 거리가 보통 시각에서 `distance.neighbor`(0.06) 이상, 적록 색각 이상(protanopia, deuteranopia) 시뮬레이션에서 `distance.neighbor-cvd`(0.025) 이상이다. 색각 이상에서는 파랑 계열 이웃이 가까워지므로 값이 보통 시각보다 낮다. 그림은 색 하나로 뜻을 전하지 않는다. 이름과 글이 함께 간다. 팔레트 색은 모두 파랑(지금)과 주황(비교)에서도 보통 시각 0.06 이상 떨어진다.
- 갈래색(`flow.*`)끼리와 파랑, 주황은 `distance.flow`(0.10) 이상이다. 위 이웃 기준과 달리 색각 이상에서도 이 값이다.
- 색을 고른 도형이 켜지면 테두리는 그 색을 유지하고 굵기가 `border.thin`에서 `border.strong`으로 바뀌며 후광이 보인다. 파랑으로 바꾸지 않는 이유는 `stroke`가 "오류", "정상" 같은 범주를 나르고 있어 켜질 때 그 뜻이 사라지면 안 되기 때문이다. 파랑(지금)은 `stroke`를 고르지 않은 도형에만 쓴다.

### 색표와 글꼴

- 색의 정본은 이 도구의 `src/tokens.json`이다. 스킬의 색표 절은 토큰 이름 표로 바뀌고 값을 적지 않는다. 같은 값을 두 곳에 적어 어긋나는 일을 막기 위해서다.
- 모든 그림의 SVG `width`는 같은 표준 캔버스 폭(`size.figure-canvas`, 960)이다. 그림 머리 `width wide`를 쓴 그림만 넓은 폭(`size.figure-canvas-wide`)이고, 문서에서는 본문 폭에 맞춰 줄어든다. GitHub README는 이미지를 원래 크기보다 키우지 않고 본문 폭에 맞춰 줄이므로 모든 그림이 같은 폭으로 보인다. 가운데 정렬은 SVG 파일이 아니라 문서 쪽 몫이다. GitHub README는 `<img>` 하나만 두면 왼쪽에 붙으므로 `<p align="center"><img src="docs/assets/그림.svg" alt="설명"></p>` 형식으로 넣어야 가운데에 선다(Markdown 이미지 문법 `![]()`로는 정렬할 수 없다).
- 글꼴은 이 도구가 Pretendard, JetBrains Mono 파일(수학 기호용 Noto Sans, Noto Sans Math 포함)을 함께 배포하고 그림에 잘라 넣는다. 본문 글자 간격은 `tracking.text`(-0.3px)다([배치](layout.md)). 스킬의 글꼴 설치 줄은 지운다.

### 대비 기준

화면 값은 라이트와 다크 모두 아래 기준을 넘는다. 기준은 `test/contrast.test.js`가 토큰 정본에서 풀어 매번 잰다.

| 쌍 | 기준 | 근거 |
|---|---|---|
| 본문 글자(`fg`), 보조 글자(`muted`)와 모든 면(`bg`, `node`, `surface`, `card-on`, `group-1`, `group-2`, `group-3`, `page`) | 4.5 이상 | WCAG 글자 기준 |
| 강조 글자(`state.active-text`: 링크, 카드 표시 ✓)와 그림 바탕, 노드, 카드 바탕, 문서 바탕 | 4.5 이상 | 같음 |
| 강조 그래픽(`state.active`: 밝힌 선, 점, 테두리, 진행 고리, 초점 고리)과 그림 바탕, 그룹 바탕, 카드 바탕, 노드, 문서 바탕 | 3 이상 | WCAG 그래픽 기준, 예외 없음. 브랜드 파랑 `#125DE6`이 그대로 넘는다(`palette.blue.light-stroke`, 가장 낮은 면 3.87) |
| `state.on-active` 글자와 `state.active-fill` 면 | 4.5 이상 | 같음 |
| `state.on-active` 글자와 갈래색 면(`flow.*`) | 4.5 이상 | 같음. 갈래색 점은 모든 그림 면과 3 이상이다 |
| 카드 태그 글자(`fg`)와 어느 톤 띠 | 4.5 이상 | 같음 |
| 밝히지 않은 행(`ink.dim`, `opacity.dim-ink` 0.9)의 `fg`, `muted` 글자와 `bg` | 4.5 이상 | 같음. 흐린 `muted`는 라이트 4.87, 다크 6.45이다 |
| 도형 외곽선(`outline`, `paint.<색>.outline`)과 판, 그룹 셋, 도형, 카드 바탕, 자기 면 | 3 이상 | 사용자 결정(외곽선 대비 3). `test/outline-contrast.test.js`가 잰다 |
| 그룹 제목(`group-title`)과 회색 그룹 셋, 강조 그룹의 제목(`paint.<색>.ink`)과 틴트 첫 단계 | 4.5 이상 | 같음. 강조 그룹의 테두리는 틴트 세 단계 위에서 3 이상이다 |
| 히트맵 칸 숫자와 그 칸 색 | 4.5 이상 | 칸마다 어두운 글자와 밝은 글자 중 대비가 큰 쪽을 빌드 때 고르고, 어느 강도에서나 4.5를 넘게 칸 색 범위를 정했다 |
| 경계(`border`)와 그림 바탕, 노드, 그룹, 카드 바탕, 문서 바탕 | 3 이상 | WCAG 그래픽 기준, 예외 없음. 같은 색상에서 3을 넘는 가장 약한 값이다. 라이트 `palette.gray.500`, 다크 `palette.neutral.500` |
| 켜진 탭 표시(`border` 색 고리)와 탭 묶음 바탕 | 3 이상 | UI 상태 표시도 그래픽 기준이다. 알약 면(`ui.control-on`)은 글자 대비 4.5만 맡는다 |
| 팔레트 `fill` 위 글자(`fg`, `muted`)와 카드 태그 띠 위 `fg` | 4.5 이상 | 같음. 모든 색, 두 테마 |
| 다크 팔레트 `fill`과 그림 바탕(`bg`), 도형 바탕(`node`) | OKLab 거리 0.07, 0.03 이상(`distance.fill-dark`) | 어두운 면이 판에 묻혀 사람 도형이 비어 보이지 않게 한다. 글자 4.5가 밝기를 막아 채도(C 0.06)로 거리를 낸다. 가장 가까운 `gray`가 한계다 |
| 팔레트 `stroke`와 그림 면, 모든 색의 `fill`. `state.error`, `state.success`, `state.warning` | 3 이상 | WCAG 그래픽 기준 |
| 팔레트 `ink`와 그림 면, 모든 색의 `fill`, 이동 글 상자 글자(`state.on-active`) | 4.5 이상 | 같음 |
| 계열 막대와 점(`data.main`, `data.compare`)과 그림 바탕, 노드, 그룹, 카드 바탕 | 3 이상 | 데이터 표시라 그래픽 기준이다. 라이트 주황은 `palette.orange.light-stroke`이다 |
| 차이 차트의 0선, 행 기준 점선, 잘린 축의 지그재그(`muted`)와 그림 바탕 | 4.5 이상 | 값 차이를 전하는 그래픽이라 `muted`가 이미 맞추는 글자 기준을 쓴다. 꾸밈 요소가 아니다 |
| 꾸밈 요소: 격자와 축, 히트맵 값 0 칸, 신뢰구간 띠와 덤벨 범위 막대기 | 1.5 이상 | WCAG 적용 대상 밖이다. 값은 숫자로도 적히고 이 요소는 구조만 돕는다 |
| 꾸밈 요소: 판 테두리(`plate-border`: 문서용 그림 판, 재생기와 목록 카드 바깥 선, 조작 막대 선)와 문서 바탕(`page`) | 1.3 이상 | WCAG 적용 대상 밖이다. 판 모양만 잡고 판 안 도형은 각자 3을 맞춘다. 라이트 1.39, 다크 1.36 |

### 변환과 검사

| 스킬 규칙 | 이 도구 |
|---|---|
| 변환은 `render_figures`로만 | `render_figures`가 `.dap` 원본마다 `daphnis render --strict`를 부른다. 경고도 실패다 |
| 실험 차트 값 손 기재 금지, 비율에 신뢰구간 | `docs/experiments/` 아래 차트에 `--require-data --require-ci`를 붙인다([차트](charts.md)) |
| 원본과 만든 그림 함께 커밋 | 그대로 |
| 변환 뒤 그림을 열어 겹침, 잘림, 빈 영역 확인 | 겹침과 잘림은 [그림 검사](figure-check.md)가 대신한다. 빈 영역은 검사 항목이 없어 눈 확인으로 남는다 |
| 다시 변환 뒤 `git diff` 없음 | [배치](layout.md)의 결정성 요구사항이 지킨다 |
| 원본에 색, `config`, `sketch` 없음 | 색 줄과 hex는 문법에 없다. 도형 색은 팔레트 이름 `fill=`, `stroke=`, `card=`만 받아 검사 항목에서 지운다 |

- 결과는 움직이는 SVG `{이름}.svg` 하나다. 무엇이 언제 움직이는지는 [재생](playback.md)을 따른다. HTML 재생기는 문서 저장소에 넣지 않는다. 문서 저장소에 스크립트가 든 파일을 늘리지 않기 위해서다.

### 바꾸는 순서

1. 이 도구가 스킬의 다섯 그림(맥락, 구성 요소, 순서, 상태, 데이터)과 여섯 차트 종류를 구현하고, 모든 예제가 그림 검사를 통과한다.
2. repo-docs-figures 스킬의 도구 표, 색표, D2 절, Vega-Lite 절을 이 도구 기준으로 다시 쓰고, `render_figures`에 `.dap` 변환을 넣는다.
3. 스킬 저장소의 형식 검사가 `total 0`이 된 뒤 skill-sync로 설치한다.
4. 문서 저장소마다 `docs/assets/*.d2`와 `*.vl.json`을 `.dap`로 옮기고 다시 변환한다. 옮긴 뒤 D2와 Vega-Lite 변환 분기를 지운다.

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
