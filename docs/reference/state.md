# 상태 그림

상태 그림은 상태 카드(`state`)와 사건 글이 붙은 전이를 그래프 보기로 보이는 그림입니다. 주문, 작업, 연결처럼 생애 주기가 있는 대상에 씁니다.

## 최소 예제

```dap name=minimal
daphnis 2
title "작업 상태"

state queued "대기"
state running "실행 중"
state done "완료"
state failed "실패"
start queued
final done
final failed

queued -> running "시작"
running -> done "성공"
running -> failed "오류"
failed -> queued "재시도" dashed

view graph down

scene "정상"
  queued -> running time=700ms
  running -> done time=700ms

scene "재시도"
  queued -> running time=700ms
  running -> failed time=700ms
  failed -> queued time=700ms
```

![작업 상태](state-minimal.svg)<!-- dap -->

`start`는 처음 상태, `final`은 끝 상태입니다. 전이마다 사건 글이 필수입니다. 같은 이동 글을 따로 적으면 선 라벨과 겹치므로 이동에는 글을 붙이지 않았습니다.

## 문법

줄 종류와 선택 사항은 [그림 문법](../design/figure-syntax.md#문법-표)의 문법 표가 정본이고, 상태 카드의 규칙은 [카드와 보기](../design/figure-kinds.md#상태)에 있습니다.

## 장면과 움직임

장면의 이동은 전이를 따라가며 `light`로 상태나 그룹을 밝힐 수 있습니다. 자기 전이(`a -> a "재시도"`)는 상태 위의 고리로 그립니다. `start`는 없거나 하나이고, 채운 점과 겹원으로 가는 선은 이동 대상이 아닙니다. 상태에는 `show`, `clear`, `status`를 쓸 수 없습니다. 상태를 `group`으로 묶어 단계 구분을 보일 수 있고, 그룹은 전이의 끝이 될 수 없습니다. 여러 갈래 전이와 자기 전이, 그룹, 점선 전이는 [state 예제](../../examples/state.dap)에 있습니다.

## 흔한 오류

| 원인 | 메시지 | code | 고치는 방법 |
|---|---|---|---|
| 사건 글 없는 전이 | `a transition needs an event label: a -> b "event"` | `syntax` | 사건 글을 붙입니다 |
| 선언하지 않은 상태 | `unknown card "z". Did you mean "a"? Declared: a, b` | `syntax` | 이름을 고치거나 상태를 선언합니다 |
| 시작 상태 둘 | `there is already a start state "a" (line 4)` | `syntax` | `start`를 하나만 둡니다 |
| 같은 방향 전이 두 개 | `there is already an edge a -> b (line 4). Merge the labels into one` | `syntax` | 사건을 `"시작, 재개"`처럼 한 글에 적습니다 |
| 선언하지 않은 전이로 이동 | `there is no edge between "a" and "b". Declare "a -> b" first` | `syntax` | 전이를 먼저 선언합니다 |
| 상태에 `status` | `a state takes no status. Use status on box, circle, external, store, person, queue, decision` | `syntax` | 상자 같은 카드에 씁니다 |

`code`는 `daphnis check figure.dap --json`으로 봅니다.
