# 칸 격자

`grid`는 비트 필드, 배열, 스택, 행렬을 칸 단위로 그립니다. 구조 그림(`flow`) 안에서 도형 하나로 놓이고, 선은 칸 하나에서 나가고 들어옵니다.

## 최소 예제

```dap name=minimal
flow down
title "주소를 둘로 나누기"

grid addr "주소 (8비트)" cols=8 {
  item page "페이지 번호 (5비트)" col=0 cols=5
  item offset "오프셋 (3비트)" col=5 cols=3
}
box table "페이지 표"

addr.page -> table "조회"

step "나누기" "윗 5비트는 페이지 번호이고 아랫 3비트는 위치입니다"
  light addr.page
  light addr.offset
step "조회" "페이지 번호가 페이지 표로 갑니다"
  addr.page -> table
```

![주소를 둘로 나누기](grid-minimal.svg)<!-- dap -->

칸은 `item`으로 적고, 위치는 0부터 세는 `row`, `col`, 크기는 `rows`, `cols`입니다. 칸 이름은 격자 밖에서 `격자.칸`으로 부릅니다.

## 문법

줄 종류와 선택 사항은 [그림 문법](../design/figure-syntax.md#호환-규칙)의 문법 표가 정본이고, 칸 격자의 줄과 크기와 배치는 [칸 격자](../design/grid.md)에 있습니다.

## 단계와 움직임

`light 격자.칸`은 칸 하나를 밝히고 `light 격자`는 틀을 밝힙니다. 칸에서 칸으로, 칸에서 도형으로 점이 가는 이동은 `격자.칸 -> 도형`처럼 적습니다. 생략한 칸은 `gap 이름 "글" count=N`으로 적고, 선이나 이동의 끝이나 밝힘 대상이 될 수 없습니다.

## 흔한 오류

| 원인 | 메시지 | code | 고치는 방법 |
|---|---|---|---|
| 격자 폭을 넘는 칸 | `item "b" ends at column 6 but grid "g" has cols=2. Raise cols= on the grid or move the item` | `syntax` | `cols`를 늘리거나 칸을 옮깁니다 |
| 겹치는 칸 | `item "b" overlaps item "a" (line 3). Move one of them or change row, col, rows, cols` | `syntax` | 위치나 크기를 바꿉니다 |
| 선언하지 않은 칸을 선 끝으로 씀 | 가까운 이름을 제안하는 `syntax` 메시지 | `syntax` | `격자.칸` 이름을 고칩니다 |

`code`는 `daphnis check figure.dap --json`으로 봅니다.
