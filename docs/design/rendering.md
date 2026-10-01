# 그리기

| 항목 | 값 |
|---|---|
| 상태 | 구현 |
| 관련 결정 | 없음 |

## 요약

그리기는 D2가 배치한 좌표로 Hindsight 문서 그림 모양의 SVG를 직접 그리는 기능이다. D2 SVG는 쓰지 않고, 점 격자 바탕, 둥근 container, 알약 모양 선 라벨, 점선 카드, 원통 저장소로 그린다.

## 동기

D2 기본 SVG는 도형마다 굵은 테두리와 진한 색을 써서 흐름 애니메이션을 얹으면 밝힌 선이 눈에 덜 띈다. hindsight-interfig 그림은 옅은 바탕 위에서 지나간 선만 파랗게 밝혀 흐름이 잘 보인다. 다만 hindsight-interfig는 행과 열을 손으로 짜야 해서 D2의 자동 배치와 문법을 쓸 수 없다. 그리기 기능은 배치는 D2에 맡기고 모양만 Hindsight 그림에 맞춘다.

## 예시

### 원통과 카드가 있는 도형

1. 사용자가 원본에 `facts: "Facts\nworld · experience" {shape: cylinder}`를 적는다.
2. 흐름에 `show facts`가 있으므로 `cli`가 카드가 들어갈 만큼 도형 높이를 다시 잡는다.
3. 그림에는 윗면이 둥근 원통 안에 굵은 `Facts`, 흐린 `world · experience`, 점선 카드가 보인다.

### 원본에 크기를 적은 도형

1. 사용자가 원본에 `a: {width: 300}`을 적는다.
2. `cli`는 `a`의 크기를 다시 잡지 않는다.
3. 그림의 `a`는 너비 300으로 그려진다.

## 상세 설계

### 두 번 배치

1. `cli`가 원본을 D2.js로 배치해 도형 종류, 라벨, 원본에 적은 속성을 얻는다.
2. `cli`가 다시 잡을 크기를 `{id}.width: {값}`, `{id}.height: {값}` 같은 D2 줄로 만든다.
3. `cli`가 container 라벨은 `style.font-size: 12`, 선 라벨은 `style.font-size: 11` 줄로 줄인다.
4. `cli`가 이 줄들을 원본 끝에 붙여 한 번 더 배치한다. 두 번째 배치가 실패하면 첫 배치를 쓴다.

- 크기를 다시 잡는 도형: `rectangle`, `cylinder`, `page`, `document`, `parallelogram`, `queue`, `package`, `step`, `callout`, `stored_data`, `cloud`
- 다시 잡지 않는 도형: container, 순서 그림 참여자와 그 안 도형, 원본에 `width`나 `height`를 적은 도형
- 라벨 크기를 줄이지 않는 것: 원본에 `font-size`를 적은 container와 선
- 원본에 적은 속성은 D2.js 해석 결과의 `attributes`로 판정한다. 원본 글자를 검색하면 여러 줄 블록을 놓치기 때문이다.

### 도형 크기

| 부분 | 값 |
|---|---|
| 너비 | 라벨 폭에 여백을 더한 값. 토큰 `size.node-min` 이상 `size.node-max` 이하 |
| 카드가 있는 도형 너비 | 토큰 `size.card` 이상 |
| 높이 | 위 여백, 라벨 한 줄, 부제목 줄 수, 카드 높이, 아래 여백의 합 |
| 원통 위 여백 | 토큰 `space.12`. 둥근 윗면 때문 |

- 라벨의 첫 줄은 굵은 라벨, 둘째 줄부터는 흐린 부제목으로 그린다.
- 카드 높이는 그 도형에 보일 모든 카드 내용 중 가장 긴 것에 맞춘다. 내용이 바뀌어도 도형 크기가 흔들리지 않게 하기 위해서다.

### 화면 값

- 색, 글꼴, 글자 크기, 간격, 반지름, 선 두께, 투명도, 시간은 모두 `src/tokens.json` 토큰으로 정한다.
- `src/tokens.css`와 `src/tokens.js`는 `npm run tokens`가 만드는 생성물이다. 손으로 고치지 않는다.
- CSS는 `src/styles/`의 파일에 두고 `var(--토큰)`만 쓴다. SVG를 그리는 코드는 `tokens.js`의 값을 쓴다.
- 어두운 화면 값은 `src/tokens.dark.json`이 의미 색만 바꾼다.
- 글자 기준선 비율과 도형 모양 비율은 글꼴과 모양에서 온 값이라 토큰 대상이 아니다.

### 모양

| D2 대상 | 그리는 모양 |
|---|---|
| container | 옅은 회색 둥근 사각형과 왼쪽 위 작은 대문자 제목 |
| `rectangle` 외 크기를 다시 잡는 도형 | 흰 둥근 사각형 |
| `cylinder` | 원통 |
| `diamond`, `oval`, `circle`, `hexagon`, `person` | 같은 모양의 흰 도형 |
| `sql_table`, `class` | 머리 칸과 줄 칸이 있는 표. 제약은 `PK`, `FK`, `UNQ` 표시 |
| `text` Markdown | 제목과 목록만 살린 글 |
| `code` | 회색 바탕 고정폭 글 |
| `image` | 이미지 |
| 선 | 회색 선과 작은 화살촉, 라벨은 알약 모양 고정폭 글 |
| 순서 그림 생명선 | 회색 점선 |

- 카드의 관계 그래프 줄은 이름을 관계 깊이별 열에 놓는다. 열은 카드 너비를 나눠 쓰고, 같은 열의 이름은 세로 가운데로 모은다. 열을 건너뛰는 관계는 가운데 이름을 가리지 않게 위로 휜 곡선으로 그린다.
- 조용한 선은 class `quiet`를 달고 그린다. 보이고 숨는 시점은 재생이 정한다.
- D2 `style` 가운데 `fill`, `stroke`의 직접 지정 색과 `stroke-dash`만 따른다.
- 테마 색, 그림자, 3D, 손그림은 따르지 않는다.

### 선 경로

- 기본 `d2`: D2가 도형을 피해 잡은 꺾은선을 다듬어 쓰고 모서리를 둥글게 한다. 다듬는 규칙은 아래 항목이다.
- 경로 가운데의 20 미만 짧은 꺾임은 편다. 이때 끝점 앞의 꺾임은 끝점 대신 반대쪽 구간을 옮긴다.
- `curve`: D2가 정한 선의 두 끝을 3차 곡선 하나로 잇는다. 끝에서는 D2 경로의 첫 선분과 끝 선분 방향으로 나가고 들어온다.
- 순서 그림, 자기 자신으로 가는 선, 생명선은 선 모양 설정과 관계없이 D2 경로를 쓴다.
- `--layout dagre`의 경로는 3차 곡선 조절점이라 다듬지 않고 곡선으로 그대로 그린다.
- 선 끝이 도형에서 떨어져 있으면 도형 경계까지 늘이거나 줄인다. D2가 라벨 최소 높이로 배치한 뒤 도형을 작게 그리기 때문이다.
- 순서 그림 메시지, 생명선, 자기 자신으로 가는 선은 선 끝을 옮기지 않는다. D2가 놓은 자리가 곧 순서이기 때문이다.
- 한 면에 닿는 선 끝 하나라도 그 면 밖에 있으면, 그 면의 선 끝을 순서대로 고르게 다시 놓는다. ELK가 선이 많은 면을 늘려 끝점을 벌리기 때문이다.
- 마주 보는 두 면에 선이 하나뿐이고 가로지르는 흔들림이 `space.20`보다 작은 선은 두 도형이 겹치는 구간의 가운데로 옮긴다. 사람 모양이 끼면 사람 쪽은 몸통 높이, 상대 쪽은 상자 가운데에 두고 가운데에서 한 번 꺾는다. 옮긴 선이 다른 도형을 지나면 옮기지 않는다.
- 사람 모양의 선 끝은 몸통 옆면(아래 30%) 안에만 놓는다. 그 위는 어깨 곡선과 머리라 선이 허공에 닿기 때문이다.
- 계단 모양(─┐└─) 선의 가운데 단이 `space.20`보다 짧으면 끝점 하나를 도형 면 안에서 옮겨 일자로 편다. 받는 쪽 끝을 먼저 옮긴다.
- 꺾임을 펴거나 계단을 펴서 다른 선의 나란한 구간과 `space.2-5`보다 가까워지면 펴지 않는다.
- 선 라벨은 선 길이의 가운데에 둔다. 먼저 놓인 라벨과 겹치면 선을 따라 40%, 60%, 30%, 70%, 20%, 80% 자리를 차례로 본다.

### 요구사항

| 요구사항 | 검증 계획 |
|---|---|
| container, 순서 그림, 표, Markdown, 격자를 알맞은 모양으로 그린다. | `test/build.test.js`의 `layoutScene_d2_features_map_to_kinds`, `layoutScene_sequence_diagram_keeps_lifelines` |
| 원본에 적은 크기와 글자 크기를 덮어쓰지 않는다. | `test/build.test.js`의 `buildSizeOverrides_explicit_width_is_kept` |
| 태그 없는 카드 줄은 태그 색 순번을 쓰지 않는다. | `test/render.test.js`의 `renderScene_untagged_row_does_not_take_tag_color` |
| ELK 경로의 짧은 꺾임을 편다. | `test/build.test.js`의 `straighten_short_jog_is_removed` |
| 선 끝을 도형 경계에 붙인다. | `test/build.test.js`의 `layoutScene_resized_node_edge_touches_border` |
| 사람에서 상자로 가는 선은 몸통에서 나와 상자 가운데로 들어간다. | `test/build.test.js`의 `layoutScene_person_line_leaves_body_and_enters_box_center` |
| 순서 그림 메시지는 참여자 아래 제자리에 남는다. | `test/build.test.js`의 `layoutScene_sequence_messages_stay_below_participants` |
| 선이 많은 면에서도 선 끝이 도형 안에 있다. | `test/build.test.js`의 `layoutScene_many_edges_from_one_side_end_on_node` |
| 짧은 계단 선은 끝점을 옮겨 일자로 편다. | `test/build.test.js`의 `layoutScene_short_step_is_flattened_by_moving_end` |
| 관계 그래프의 이름을 깊이별 열에 놓고, 열을 건너뛰는 관계는 위로 휜다. | `test/chart.test.js`의 `layoutMiniGraph_places_columns_by_depth`, `layoutMiniGraph_skip_edge_reserves_arc_space` |
| 펴서 다른 선에 붙는 꺾임은 그대로 둔다. | `test/build.test.js`의 `straighten_jog_that_crowds_other_edge_is_kept` |
| 가까운 선의 라벨끼리 겹치지 않는다. | `test/build.test.js`의 `layoutScene_close_edge_labels_do_not_overlap` |
| 끝점 앞의 짧은 꺾임을 펴도 끝점은 그대로다. | `test/build.test.js`의 `straighten_jog_before_end_keeps_end_point` |

## 단점

- D2.js는 ELK 간격 설정을 받지 않아, container가 깊으면 Hindsight 원본 그림보다 넓어진다.
- D2의 ELK 배치는 container 안의 `direction`을 따르지 않는다.
- 격자 칸으로 들어가는 선은 D2가 칸을 가로질러 곧게 긋는다.
- 글자 폭을 브라우저 없이 어림하므로 카드 줄바꿈이 실제 글꼴과 조금 다를 수 있다.

## 대안

- D2 SVG를 그대로 쓰고 점만 얹기: 굵은 테두리 때문에 밝힌 선이 눈에 덜 띄어 버렸다.
- dagre 배치: 예제에서 선이 ELK보다 넓게 흩어져 버렸다.
