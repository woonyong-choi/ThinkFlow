# 구조 그림

`flow`는 구성 요소와 요청이 가는 길을 그립니다. 도형과 선을 적고, 단계마다 점이 어느 선을 지나는지 적습니다. 그룹, 아이콘, 번호 선, 값, 칸 격자를 쓰면 구성도와 시스템 개요도 같은 문법으로 그립니다.

## 최소 예제

```dap name=minimal
flow right
title "요청 경로"

box client "클라이언트"
box server "서버"
store db "데이터베이스"

client -> server "GET /orders"
server -> db "SELECT"

step "요청" "클라이언트가 서버를 부르고 서버가 데이터베이스를 읽습니다"
  client -> server
  server -> db
```

![요청 경로](flow-minimal.svg)<!-- dap -->

첫 줄이 그림 종류와 방향(`right` 또는 `down`)입니다. 도형 줄, 선 줄, `step` 순서로 적습니다.

## 문법

줄 종류, 선택 사항, 값 목록은 [그림 문법](../design/figure-syntax.md#호환-규칙)의 문법 표가 정본입니다. 구조 그림 선언은 [그림 문법](../design/figure-syntax.md#구조-그림-선언), 칸 격자는 [칸 격자](../design/grid.md), 아이콘과 배치는 [배치](../design/layout.md)에 있습니다. 구성도는 [구성도](architecture.md)를 봅니다.

## 단계와 움직임

단계는 박자의 목록입니다. 한 박자는 이동 하나(`a -> b`), 값 없이 밝히기(`light`), 설명 바꾸기(`say`), 멈춤(`wait`) 가운데 하나입니다. 이동은 선언한 선을 따라가며, 선이 없으면 거꾸로 선언한 선을 따라갑니다.

`track`은 박자와 따로 도는 흐름입니다. 출발지마다 점이 선들을 멈춤 없이 이어 지나고, 값 줄(`value`, `on`)은 점이 닿을 때 바뀝니다.

```dap name=motion
flow right
title "주문이 몰릴 때"

box web "웹"
box app "앱"
box api "주문 API"
store db "재고 DB"

value stock "재고" on=db from=120
value pending "처리 중" on=api
on api pending+1
on db pending-1, stock-1

web -> api
app -> api
api -> db

step "동시 주문" "웹과 앱의 주문이 겹쳐 들어오면 값이 연달아 바뀝니다" for=6s
  track web, app -> api -> db "주문" every=1.5s
```

![주문이 몰릴 때](flow-motion.svg)<!-- dap -->

한 단계에 박자 줄과 `track` 줄을 섞을 수 없습니다. 자세한 규칙은 [그림 문법](../design/figure-syntax.md)의 시간 흐름 절에 있습니다.

## 흔한 오류

진단은 `{파일}:{줄}: {메시지}` 모양이고, 원본 문법 오류의 `code`는 `syntax`, 그림 검사의 `code`는 `check-{번호}`입니다. `daphnis check figure.dap --json`이 `code`를 줄마다 한 객체로 냅니다. 오류가 하나라도 있으면 결과 파일을 쓰지 않습니다.

| 원인 | 메시지 | code | 고치는 방법 |
|---|---|---|---|
| 선언하지 않은 이름 | `unknown node "c". Did you mean "a"? Declared: a, b` | `syntax` | 이름을 고치거나 도형을 선언합니다 |
| 같은 이름 두 번 | `the name "a" is already used (line 2)` | `syntax` | 이름을 하나로 줄입니다 |
| 같은 방향 선 두 개 | `there is already an edge a -> b (line 4). Merge the labels into one` | `syntax` | 선을 하나로 합치고 라벨을 한 글에 적습니다 |
| 선언하지 않은 선으로 이동 | `there is no edge between "a" and "b". Declare "a -> b" first` | `syntax` | 선을 먼저 선언합니다 |
| 오타 낸 줄 종류 | `unknown statement "bax"` | `syntax` | 줄 첫 낱말을 고칩니다 |
| 이동 글과 선 라벨이 같음 | `the moving text "label" repeats the edge label. Remove one of them` | `check-8` | 한쪽을 지웁니다(경고, `--strict`에서 실패) |

그림 검사 항목 전체는 [그림 검사](../design/figure-check.md)의 표에 있습니다.
