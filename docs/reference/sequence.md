# 순서 그림

순서 그림은 같은 카드를 순서 보기(`view sequence`)로 보이는 그림이다. 참여자 사이에 메시지가 오가는 순서를 그린다. 인증 절차, API 호출 순서처럼 위에서 아래로 읽는 그림에 쓴다.

## 최소 예제

```torso name=minimal
torso
title "로그인"

person user "사용자"
box app "앱"
box server "서버"

view sequence {
  user app server
}

scene "요청과 응답"
  user -> app "로그인 누름"
  app -> server "POST /login"
  note server "비밀번호 해시를 비교합니다"
  server -> app "토큰" dashed
  app -> user "홈 화면"
```

![로그인](sequence-minimal.svg)<!-- torso -->

참여자 카드를 먼저 선언하고, 순서 보기 블록에 참여자 순서를 적는다. 메시지는 장면 안에만 적고, 메시지 순서가 곧 그림의 위아래 순서이다. 순서 보기는 문서 안 모든 장면의 메시지를 한 열에 놓는다. 탭은 그 가운데 어느 장면을 재생할지 고른다.

## 문법

줄 종류와 선택 사항은 [그림 문법](../design/figure-syntax.md#문법-표)의 문법 표가 정본이고, 순서 보기의 줄은 [카드와 보기](../design/figure-kinds.md#순서-보기)에 있다. 순서 보기의 참여자는 `person`, `box`, `external`, `store`, `queue`이고, 테이블, API, 클래스는 칸과 멤버 없이 카드 머리만 참여자로 표시된다.

## 장면과 움직임

한 줄이 한 박자이고 한 행이다. 점이 화살표를 따라 한 번 지나가며, `dashed`는 응답을 뜻하는 점선이다. `a -> a`는 자기 자신에게 보내는 메시지로 오른쪽으로 돌아 나온다. `note`는 바로 앞 메시지의 보내는 쪽이나 받는 쪽 참여자 옆에 붙는 메모이고 박자를 만들지 않는다. 메시지 글은 필수이고, 같은 두 참여자 사이 같은 방향 메시지를 여러 번 적어도 된다. `activate`, `deactivate`는 메시지 바로 뒤에서 활성 구간을 열고 닫으며, `create`와 `destroy`를 메시지에 붙이면 받는 참여자의 생명선이 시작되거나 끝난다.

## 조건·반복·병렬 구획

`fragment alt "재고" choose="있음" {`으로 재생할 대안을 고르고, 그 안에 `branch "있음" {`과 `branch "없음" {` 블록을 적는다. 모든 대안을 그리지만 선택한 대안만 움직인다. `choose`는 실제 조건식 평가가 아니라 재생 경로를 정하는 값이다.

`fragment loop "재시도" times=3 {` 안의 메시지는 같은 선에서 세 번 재생한다. `fragment par "조회" {`의 여러 `branch`는 동시에 시작해 각자 진행하고 모두 끝나면 다음 메시지로 넘어간다. `fragment opt "추가 인증" run=on {`은 본문을 한 번 재생하고 `run=off`는 대기까지 모두 생략하며 제목에 표시한다. 각 블록은 `{`로 열고 별도 줄의 `}`로 닫는다. 구획을 중첩할 수 있고, 본문에는 메시지, 메모, 대기를 넣는다. 생성, 소멸, 활성 구간은 구획 밖에 적는다. 생성과 소멸은 장면마다 따로 효력이 있어서, 한 장면의 소멸이 다른 장면의 생명선을 자르지 않고 같은 참여자를 둘 이상의 장면이 만들 수도 있다. 네 구획과 생명주기를 모두 담은 [sequence 예제](../../examples/sequence.torso)를 장면별로 재생해 볼 수 있다. 전체 계약과 제한은 [시퀀스 제어 구획](../design/figure-kinds.md#시퀀스-제어-구획)에 있다.

## 흔한 오류

| 원인 | 메시지 | code | 고치는 방법 |
|---|---|---|---|
| 메시지 글 없음 | `a sequence message needs text: a -> b "message"` | `syntax` | 따옴표 글을 붙인다 |
| 메시지와 관계없는 참여자의 메모 | `a note points at "a" or "b", the participants of the message above` | `syntax` | 바로 앞 메시지의 참여자를 가리킨다 |
| 참여자 순서가 처음 보내는 순서와 다름 | `declare participants in the order they first send: a, b` | `syntax` | 보기 블록의 순서를 바꾼다(경고, `--strict`에서 실패. 경고는 순서가 처음 어긋난 참여자를 적은 보기 블록의 줄에 붙는다) |
| 선언하지 않은 참여자 | `unknown card "c". Did you mean "a"? Declared: a, b` | `syntax` | 이름을 고치거나 선언한다 |
| 순서 보기에만 있는 카드에 값 `on=`, `show`, `clear` | `show "s" needs a card, and no graph view shows "s". A sequence view draws only the head. Put "s" in a graph view` | `syntax` | 같은 카드를 `view graph` 블록에도 넣는다 |
| 순서 보기에 없는 카드에 `activate` | `"activate api" needs "api" in a sequence view` | `syntax` | 카드를 순서 보기 블록에 넣는다 |
| 메모가 화살표나 라벨을 가림 | 번호 12 검사의 메시지 | `check-12` | 메모 글을 줄이거나 자리를 옮긴다 |

`code`는 `torso check figure.torso --json`으로 본다. 그림 검사 항목은 [그림 검사](../design/figure-check.md)에 있다.
