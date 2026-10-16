# 칸 격자

`grid`는 비트 필드, 배열, 스택, 행렬을 칸 단위로 그립니다. 그래프 보기 안에서 카드 하나로 놓이고, 선은 칸 하나에서 나가고 들어옵니다.

## 최소 예제

```thinkflow name=minimal
thinkflow
title "주소를 둘로 나누기"

grid addr "주소 (8비트)" cols=8 {
  item page "페이지 번호 (5비트)" col=0 cols=5
  item offset "오프셋 (3비트)" col=5 cols=3
}
box table "페이지 표"

addr.page -> table "조회"

view graph down

scene "나누기" mode=static
  light addr.page addr.offset

scene "조회"
  addr.page -> table time=700ms
```

![주소를 둘로 나누기](grid-minimal.svg)<!-- thinkflow -->
<!-- thinkflow scenes v1 name=minimal -->
<details>
<summary>조회</summary>

![주소를 둘로 나누기 (조회)](grid-minimal.scene-2.svg)<!-- thinkflow -->

</details>
<!-- /thinkflow scenes v1 name=minimal -->

칸은 `item`으로 적고, 위치는 0부터 세는 `row`, `col`, 크기는 `rows`, `cols`입니다. 칸 이름은 격자 밖에서 `격자.칸`으로 부릅니다.

## 바이트 배치

패킷 헤더와 구조체 배치는 격자에 `unit=`(단위 이름, `bit`나 `byte` 등)을 적습니다. 한 행이 `cols`개 단위이고, 칸 위에 단위 눈금, 왼쪽에 같은 단위의 행 오프셋이 붙습니다. 칸 폭은 차지한 단위 수에 비례하고, 칸 아래 흐린 글은 크기(`16 bit`)나 둘째 글(`item flags "Flags" "CWR ECE"`)입니다.

```thinkflow name=bytes
thinkflow
title "UDP 헤더"

grid udp "UDP 헤더" rows=3 cols=32 unit=bit {
  item sport "Source Port" cols=16
  item dport "Destination Port" cols=16
  item len "Length" cols=16
  item sum "Checksum" cols=16
  item data "Data" cols=32 open
  region "헤더 8바이트" rows=2
  region "데이터"
}
```

![UDP 헤더](grid-bytes.svg)<!-- thinkflow -->

- `row`와 `col`을 둘 다 생략한 칸은 앞 칸 바로 뒤에 놓이고, 그 행에 자리가 없으면 다음 행 맨 앞입니다.
- `open`은 길이가 정해지지 않은 마지막 필드입니다. 바깥 틀의 그 아랫변이 점선입니다.
- `region "이름" [row=N] [rows=N]`은 오른쪽에 행 구간 괄호와 이름을 둡니다. `row`를 생략하면 앞 구간이 끝난 행부터입니다.
- `value`를 칸에 놓으면 값이 칸 글 자리에 나오고 필드 이름은 흐린 둘째 줄로 내려갑니다. TCP, IPv4, 구조체 예제는 [tcp-header](../../examples/tcp-header.thinkflow), [ipv4-header](../../examples/ipv4-header.thinkflow), [struct-layout](../../examples/struct-layout.thinkflow)입니다.

## 문법

줄 종류와 선택 사항은 [그림 문법](../design/figure-syntax.md#문법-표)의 문법 표가 정본이고, 칸 격자의 줄과 크기와 배치는 [칸 격자](../design/grid.md)에 있습니다.

## 장면과 움직임

`light 격자.칸`은 칸 하나를 밝히고 `light 격자`는 틀을 밝힙니다. 칸에서 칸으로, 칸에서 카드로 점이 가는 이동은 `격자.칸 -> 카드`처럼 적습니다. 생략한 칸은 `gap 이름 "글" count=N`으로 적고, 선이나 이동의 끝이나 밝힘 대상이 될 수 없습니다. 주소 변환은 [memory 예제](../../examples/memory.thinkflow), 호출 스택은 [stack 예제](../../examples/stack.thinkflow), 노드와 포인터는 [pointer 예제](../../examples/pointer.thinkflow)가 보입니다.

격자 칸의 글과 구조 연결은 장면 중 교체하지 않는다. 포인터 예제의 A에 적힌 두 next 칸은 같은 필드의 삽입 전후를 비교한 것이며, 실제 노드에 next 필드가 둘 있다는 뜻이 아니다. 이전 연결은 `전: next 0x28`에서 B로, 이후 연결은 `후: next 0x58`에서 새 노드로 이어진다. 삽입 장면은 새 노드의 next를 B에 연결한 뒤 A의 next를 새 노드에 연결하는 순서를 보여 준다. `quiet` 선은 처음 통과한 뒤 드러나며 기존 선을 지우지 않으므로, 전후 주소와 선을 함께 표시할 때는 각 시점을 구분한다.

## 흔한 오류

| 원인 | 메시지 | code | 고치는 방법 |
|---|---|---|---|
| 격자 폭을 넘는 칸 | `item "b" ends at column 6 but grid "g" has cols=2. Raise cols= on the grid or move the item` | `syntax` | `cols`를 늘리거나 칸을 옮깁니다 |
| 겹치는 칸 | `item "b" overlaps item "a" (line 3). Move one of them or change row, col, rows, cols` | `syntax` | 위치나 크기를 바꿉니다 |
| 선언하지 않은 칸을 선 끝으로 씀 | 가까운 이름을 제안하는 `syntax` 메시지 | `syntax` | `격자.칸` 이름을 고칩니다 |
| `unit=` 없는 격자의 구간 | `region brackets rows of a byte layout. Add unit=bit or unit=byte to grid "g"` | `syntax` | 격자에 `unit=`을 적습니다 |
| 마지막 행에 닿지 않는 `open` 칸 | `open marks a field whose length varies, so it ends the layout. ...` | `syntax` | 칸을 마지막 행으로 옮기거나 `open`을 뺍니다 |
| `col=0`이 아닌 칸의 `key=` | `key= labels a row from the left, so it goes on an item at col=0` | `syntax` | 행 맨 앞 칸에 적습니다 |

`code`는 `thinkflow check figure.thinkflow --json`으로 봅니다.
