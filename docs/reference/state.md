# 상태 그림

`state`는 상태와 사건에 따른 전이를 그립니다. 주문, 작업, 연결처럼 생애 주기가 있는 대상에 씁니다.

## 최소 예제

```dap name=minimal
state down
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

step "정상" "대기하던 작업이 실행되어 끝납니다"
  queued -> running
  running -> done
step "재시도" "실패한 작업이 다시 대기합니다"
  queued -> running
  running -> failed
  failed -> queued
```

![작업 상태](state-minimal.svg)<!-- dap -->

`start`는 처음 상태, `final`은 끝 상태입니다. 전이마다 사건 글이 필수입니다.

## 문법

줄 종류와 선택 사항은 [그림 문법](../design/figure-syntax.md#호환-규칙)의 문법 표가 정본이고, 상태 그림의 줄은 [그림 종류](../design/figure-kinds.md)의 상태 그림 절에 있습니다.

## 단계와 움직임

단계의 이동은 전이를 따라가며 `light`로 상태나 그룹을 밝힐 수 있습니다. 자기 전이(`a -> a "재시도"`)는 상태 위의 고리로 그립니다. `start`는 없거나 하나이고, 채운 점과 겹원으로 가는 선은 이동 대상이 아닙니다. 상태 그림에서는 `show`와 `clear`를 쓸 수 없습니다.

## 흔한 오류

| 원인 | 메시지 | code | 고치는 방법 |
|---|---|---|---|
| 사건 글 없는 전이 | `a transition needs an event label: a -> b "event"` | `syntax` | 사건 글을 붙입니다 |
| 선언하지 않은 상태 | `unknown state "z". Did you mean "a"? Declared: a, b` | `syntax` | 이름을 고치거나 상태를 선언합니다 |
| 시작 상태 둘 | `there is already a start state "a" (line 4)` | `syntax` | `start`를 하나만 둡니다 |
| 같은 방향 전이 두 개 | `there is already an edge a -> b (line 4). Merge the labels into one` | `syntax` | 사건을 `"시작, 재개"`처럼 한 글에 적습니다 |
| 선언하지 않은 전이로 이동 | `there is no edge between "a" and "b". Declare "a -> b" first` | `syntax` | 전이를 먼저 선언합니다 |

`code`는 `daphnis check figure.dap --json`으로 봅니다.
