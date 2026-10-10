# 구조 그림

구조 그림은 카드를 선으로 잇고 그래프 보기(`view graph`)로 보이는 그림입니다. 구성 요소와 요청이 가는 길을 그립니다. 카드와 선만 적으면 정지 그림이 됩니다. 배치를 바꿀 때 보기(`view`), 움직임을 넣을 때 장면(`scene`)을 더합니다.

## 최소 예제

```thinkflow name=minimal
thinkflow
title "요청 경로"

box client "클라이언트"
box server "서버" {
  text "주문을 확인하고 저장합니다"
  value pending "처리 중" from=0
}
store db "데이터베이스"

client -> server "GET /orders"
server -> db "SELECT"
```

![요청 경로](flow-minimal.svg)<!-- thinkflow -->

설명과 값은 카드의 `{ }` 안에 놓습니다. 정지 그림에는 `scene`이 필요하지 않습니다.

첫 줄은 언제나 `thinkflow`입니다. 그다음 카드 줄, 선 줄, 필요하면 보기 줄(`view graph down`), 장면 줄 순서로 적습니다. 보기 줄을 생략하면 모든 카드를 담은 왼쪽에서 오른쪽 그래프 보기 하나가 기본으로 생기고, 방향이나 라벨이 필요할 때만 `view graph down "라벨"`처럼 적습니다. 장면의 `mode`는 `static`(마지막 상태 하나), `once`(한 번 재생), `loop`(되풀이)이고, 생략하면 줄이 있는 장면은 `once`, 줄이 없는 장면은 `static`입니다. 장면 안의 이동에 글을 붙이지 않은 것은 선 라벨이 이미 그 글을 보이기 때문입니다.

## 문법

줄 종류, 선택 사항, 값 목록은 [그림 문법](../design/figure-syntax.md#문법-표)의 문법 표가 정본입니다. 카드 선언은 [카드 선언](../design/figure-syntax.md#카드-선언), 칸 격자는 [칸 격자](../design/grid.md), 아이콘과 배치는 [배치](../design/layout.md)에 있습니다. 구성도는 [구성도](architecture.md)를 봅니다.

## 장면과 움직임

장면은 박자의 목록이거나 흐름(`track`)의 목록입니다. 한 박자는 이동 하나(`a -> b`), 이어 붙인 여러 이동(`a -> b & c -> d`), 점 없이 밝히기(`light`), 카드 바꾸기(`show`, `clear`), 멈춤(`wait`) 가운데 하나입니다. 이동은 선언한 선을 따라가며, 선이 없으면 거꾸로 선언한 선을 따라갑니다. 한 장면에 박자 줄과 `track` 줄을 섞을 수 없습니다.

`track`은 박자와 따로 도는 흐름입니다. 출발지마다 점이 선들을 멈춤 없이 이어 지나고, 값 줄(`value`, `on`)은 점이 닿을 때 바뀝니다.

```thinkflow name=motion
thinkflow
title "주문이 몰릴 때"

box web "웹"
box app "앱"
box api "주문 API" {
  text "접수한 주문을 저장소에 보냅니다"
  value pending "처리 중"
  chart traffic "처리량" bar "예시 데이터. 처리 중인 주문 수" {
    x "주문 수(건)"
    series orders "진행 중"
    row "현재" orders=pending
  }
}
store db "재고 DB"

value stock "재고" on=db from=120
on api pending+1
on db pending-1, stock-1

web -> api
app -> api
api -> db

view graph down

scene "동시 주문" mode=loop for=6s
  track web, app -> api -> db "주문" every=1500ms time=2s
```

![주문이 몰릴 때](flow-motion.svg)<!-- thinkflow -->

큐(`queue q "큐" slots=6`)는 칸이 있는 카드이고, 찬 칸 수가 큐 이름으로 부르는 값입니다. `on q q+1`, `set="q-1@q"`처럼 같은 식으로 바꾸면 칸 수가 바뀝니다([그림 문법](../design/figure-syntax.md#큐)). 값, 조건, 대기, 예약, 손실, 장면 사이 값 유지를 한 장면씩 보려면 [flow 예제](../../examples/flow.thinkflow)와 [queue 예제](../../examples/queue.thinkflow)를 엽니다.

## 흔한 오류

진단은 `{파일}:{줄}: {메시지}` 모양이고, 원본 문법 오류의 `code`는 `syntax`, 그림 검사의 `code`는 `check-{번호}`입니다. `thinkflow check figure.thinkflow --json`이 `code`를 줄마다 한 객체로 냅니다. 오류가 하나라도 있으면 결과 파일을 쓰지 않습니다.

| 원인 | 메시지 | code | 고치는 방법 |
|---|---|---|---|
| 첫 문장이 `thinkflow`가 아님 | `the first line must be "thinkflow"` | `missing-preamble` | 첫 줄에 `thinkflow`만 적습니다 |
| 선언하지 않은 이름 | `unknown card "c". Did you mean "a"? Declared: a, b, m` | `syntax` | 이름을 고치거나 카드를 선언합니다 |
| 같은 이름 두 번 | `the name "a" is already used (line 2)` | `syntax` | 이름을 하나로 줄입니다 |
| 같은 방향 선 두 개 | `there is already an edge a -> b (line 4). Merge the labels into one` | `syntax` | 선을 하나로 합치고 라벨을 한 글에 적습니다 |
| 선언하지 않은 선으로 이동 | `there is no edge between "a" and "b". Declare "a -> b" first` | `syntax` | 선을 먼저 선언합니다 |
| 내용 없는 `once`, `loop` 장면 | `scene "s" has no lines. Add a move, show, light, reveal, or wait, or write mode=static for a still composition` | `syntax` | 박자나 `track`을 적거나, 정지 모습이면 `mode=static`을 씁니다 |
| 지원하지 않는 낱말(`step`, `say`) | `unknown statement "step"` | `syntax` | `scene "이름"`처럼 문법 표에 있는 낱말을 씁니다 |
| 이름을 쓴 보기 | `a view is one of graph, sequence, plot, time. Found "main". A view has no name: write view graph ...` | `syntax` | 보기 방식부터 적습니다(`view graph down`) |
| 숫자로만 된 장면 이름 | `scene "2" is only digits, which --scene reads as a scene number. Add a word to the name, such as "step 2"` | `syntax` | 이름에 글자를 더합니다 |
| 장면 이름 뒤 글 | `write a scene as: scene "name" [mode=...] ...` | `syntax` | 장면에는 이름 하나만 적고 설명은 문서 본문에 적습니다 |
| 쓸 수 없는 색 이름 | `tone is one of blue, yellow, red, green, orange, purple, cyan, gray` | `syntax` | 목록의 이름을 고릅니다 |
| 이동 글과 선 라벨이 같음 | `the moving text "label" repeats the edge label. Remove one of them` | `check-8` | 한쪽을 지웁니다(경고, `--strict`에서 실패) |

그림 검사 항목 전체는 [그림 검사](../design/figure-check.md)의 표에 있습니다.
