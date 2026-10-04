# 순서 그림

`sequence`는 참여자 사이에 메시지가 오가는 순서를 그립니다. 인증 절차, API 호출 순서처럼 위에서 아래로 읽는 그림에 씁니다.

## 최소 예제

```dap name=minimal
sequence
title "로그인"

person user "사용자"
box app "앱"
box server "서버"

step "요청" "앱이 서버에 로그인을 요청합니다"
  user -> app "로그인 누름"
  app -> server "POST /login"
  note server "비밀번호 해시를 비교합니다"
step "응답" "서버가 토큰을 돌려줍니다"
  server -> app "토큰" dashed
  app -> user "홈 화면"
```

![로그인](sequence-minimal.svg)<!-- dap -->

참여자를 먼저 선언하고, 메시지는 `step` 아래에만 적습니다. 메시지 순서가 곧 그림의 위아래 순서입니다.

## 문법

줄 종류와 선택 사항은 [그림 문법](../design/figure-syntax.md#호환-규칙)의 문법 표가 정본이고, 순서 그림의 줄은 [그림 종류](../design/figure-kinds.md)의 순서 그림 절에 있습니다. 구조 그림의 `group`, `value` 같은 줄은 쓸 수 없습니다.

## 단계와 움직임

한 줄이 한 박자이고 한 행입니다. 점이 화살표를 따라 한 번 지나가며, 지난 메시지는 단계가 끝날 때까지 남습니다. `dashed`는 응답을 뜻하는 점선이고, `a -> a`는 자기 자신에게 보내는 메시지로 오른쪽으로 돌아 나옵니다. `note`는 바로 앞 메시지의 보내는 쪽이나 받는 쪽 참여자 옆에 붙는 메모이고 박자를 만들지 않습니다.

메시지 글은 필수이고 화살표 위 라벨로 늘 보입니다. 같은 두 참여자 사이 같은 방향 메시지를 여러 번 적어도 됩니다.

## 흔한 오류

| 원인 | 메시지 | code | 고치는 방법 |
|---|---|---|---|
| 첫 `step` 앞의 메시지 | `"a -> b" is not allowed in a sequence figure. Remove the line or change the kind statement` | `syntax` | 메시지를 `step` 아래로 옮깁니다 |
| 메시지 글 없음 | `a sequence message needs text: a -> b "message"` | `syntax` | 따옴표 글을 붙입니다 |
| 메시지와 관계없는 참여자의 메모 | `a note points at "a" or "b", the participants of the message above` | `syntax` | 바로 앞 메시지의 참여자를 가리킵니다 |
| 선언하지 않은 참여자 | `unknown node "c". Did you mean "a"? Declared: a, b` | `syntax` | 이름을 고치거나 선언합니다 |
| 메모가 화살표나 라벨을 가림 | 번호 12 검사의 메시지 | `check-12` | 메모 글을 줄이거나 자리를 옮깁니다 |

`code`는 `daphnis check figure.dap --json`으로 봅니다. 그림 검사 항목은 [그림 검사](../design/figure-check.md)에 있습니다.
