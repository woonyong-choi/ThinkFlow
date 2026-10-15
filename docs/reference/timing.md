# 타이밍 그림

타이밍 그림은 값과 카드를 타이밍 보기(`view timing`)로 보이는 그림입니다. 가로축이 장면 시간이고, 줄마다 값의 상태 띠, 0과 1의 높낮이 선, 카드 사이를 오가는 이동이 놓입니다. WaveDrom과 PlantUML 타이밍 그림이 그리는 잠금 유지 시간, 요청과 응답 핸드셰이크 같은 그림에 씁니다.

## 최소 예제

```thinkflow name=minimal
thinkflow
title "잠금을 쥔 시간"
pace 500ms

box worker "작업"
box lock "잠금"
value holder "잠금 보유" from=none

view sequence {
  worker lock
}
view timing {
  worker lock
  holder
  note holder=worker "잠금 유지"
}

scene "쥐고 풀기"
  worker -> lock "잠금" set="holder=worker"
  wait 600ms
  worker -> lock "해제" set="holder=none"
```

![잠금을 쥔 시간](timing-minimal.svg)<!-- thinkflow -->

보기 블록의 이름은 줄입니다. 값 이름은 값 줄이고 카드 이름은 카드 줄입니다. 값이 모든 장면에서 `0`과 `1`만 가지면 높낮이 선이고, 그 밖에는 값 글을 담은 띠입니다.

## 문법

| 줄 | 뜻 |
|---|---|
| `view timing ["라벨"] {`, `}` | 타이밍 보기. 블록 안에 줄 이름을 적는다 |
| 값 이름, 카드 이름 | 줄 하나. 카드는 순서 보기 참여자가 될 수 있는 카드다 |
| `note 값=상태 "글"` | 값이 그 상태를 가진 구간마다 양쪽 화살표와 글을 값 줄 아래에 둔다 |

줄 종류와 선택 사항은 [그림 문법](../design/figure-syntax.md#문법-표)의 문법 표가 정본이고, 보기 규칙은 [카드와 보기](../design/figure-kinds.md#타이밍-보기)에 있습니다.

## 장면과 움직임

타이밍 보기는 따로 사건을 적지 않습니다. 같은 원본의 이동(`a -> b`)과 값 바꾸기(`set=`, `on`)가 그리는 시간표를 읽으므로, 순서 보기나 그래프 보기의 점이 닿는 순간에 띠가 바뀝니다. 장면 탭은 그 장면의 시간 축으로 바꾸고, 재생 중에는 재생 막대가 지나간 만큼 드러납니다. 장면 상태(`status=`)는 카드 줄 이름 옆 알약입니다. 잠금과 시간 초과는 [timing 예제](../../examples/timing.thinkflow), 요청·응답 핸드셰이크는 [handshake 예제](../../examples/handshake.thinkflow)가 보입니다.

## 흔한 오류

| 원인 | 메시지 | code | 고치는 방법 |
|---|---|---|---|
| 값도 카드도 아닌 이름 | `unknown value or card "m". ...` | `syntax` | 선언한 값이나 카드 이름을 적습니다 |
| 이동하지 않는 카드(격자, 차트 등) | `a timing row is a value or a card that sends and receives moves (...). "g" is a grid` | `syntax` | 그 카드의 값을 줄로 적습니다 |
| 카드 줄을 가리키는 구간 표시 | `"a" is a card row. A timing note marks the times a value holds a state` | `syntax` | 값 줄을 가리킵니다 |
| 블록 없는 보기 | `a timing view lists its rows in a block: view timing {` | `syntax` | 블록에 줄을 적습니다 |

`code`는 `thinkflow check figure.thinkflow --json`으로 봅니다.
