# 그림 문법

| 항목 | 값 |
|---|---|
| 상태 | 구현 |
| 관련 결정 | [그림 문법과 배치를 직접 맡고 D2 호환을 버린다](../decisions/2026-10-01-own-syntax-and-layout.md), [조건과 대기를 빌드 때 계산해 같은 시간표에 담는다](../decisions/2026-10-04-flow-conditions-in-timetable.md) |

## 요약

그림 문법은 `.dap` 파일 하나에 그림 하나를 적는 줄 단위 문법이다. 첫 문장에 그림 종류를 적고, 도형과 선을 선언한 뒤, `step` 줄부터 움직임을 적는다. 사람이 쓰는 글은 모두 따옴표 안에, 이름과 낱말은 모두 따옴표 밖에 둔다. 같은 일을 적는 방법은 하나뿐이다.

## 동기

D2와 Mermaid는 같은 뜻을 여러 모양으로 적을 수 있다. D2는 오타 난 이름을 새 도형으로 만들고, 점 경로(`a.b.c`)와 화살표 방향(`->`, `<-`)을 섞어 쓸 수 있다. 사람은 그림을 보고 실수를 알아채지만, AI는 그림을 보지 않고 원본을 만든다. 적는 방법이 하나이고 모든 실수가 줄 번호가 붙은 오류로 나와야 AI가 고칠 수 있다.

## 예시

### 구성 요소 그림에 요청 흐름 입히기

```text
flow right
title "Saturn 구성"

person user "개발자"
group system "Saturn" direction=down {
  box cli "명령"
  box tui "화면" "하나의 대화"
  box engine "엔진" "사용자당 하나"
  store db "기록 저장소" "sqlite"
}
external codex "Codex CLI"

user -> cli "명령"
user -> tui "입력"
cli -> engine "엔진 시작"
tui -> engine "JSON-RPC"
engine -> db "기록" quiet
engine -> codex "app-server 요청"

step "대화" "입력은 화면을 거쳐 엔진이 에이전트로 보낸다"
  user -> tui "질문"
  show tui "이 테스트 왜 깨져?" tag="you"
  tui -> engine
  engine -> codex "turn" time=3s
  engine -> db
  say "대화를 기록한다"
```

1. 사용자가 `daphnis render saturn.dap`를 실행한다.
2. `system` 안 도형은 위에서 아래로, 바깥 도형은 왼쪽에서 오른쪽으로 놓인다.
3. 첫 박자에 점이 `user`에서 `tui`로 가고, 점이 닿을 때 `tui` 카드에 `YOU` 태그 줄이 나타난다.
4. `engine -> db` 선은 `quiet`라서 그 선을 처음 지나는 박자부터 보인다.

### 오타 알아채기

1. AI가 위 원본의 24번째 줄을 `engine -> cdex "turn" time=3s`로 적는다.
2. 명령이 `saturn.dap:24: unknown node "cdex". Did you mean "codex"? Declared: cli, codex, db, engine, system, tui, user`를 내고 실패한다.
3. AI가 이름을 고친다.

### 단계 사이에 값을 이어 가기

```text
flow right
title "값 유지와 읽기"
box web "웹"
box api "API"
store db "DB"
value sent "보낸 수" on=web
value saved "저장한 수" on=db
value mirror "복사본" on=api
queue jobs "대기열" slots=4
web -> api
api -> db
on api sent+1
on db saved+1

step "첫 요청" "모든 값이 from에서 시작한다"
  web -> api "요청" set="mirror:=sent"
  api -> db "저장" set="jobs+1"

step "이어서" "keep한 값은 앞 단계가 끝난 값에서 시작한다" keep="sent, jobs" set="saved=10"
  web -> api "요청" set="mirror:=saved"
  api -> db "저장" set="jobs+1"

step "맞바꿈" "읽기는 갱신을 시작할 때 값을 읽는다" keep="saved, mirror" set="sent=20"
  web -> api "요청"
  api -> db "바꿈" set="sent:=saved, saved:=sent"
```

1. 첫 단계는 모든 값이 `from`에서 시작한다. `web -> api`의 점이 `api`에 닿으면 `on` 줄로 `sent`가 1이 되고, 그 뒤에 `set=`의 `mirror:=sent`가 바뀐 `sent`를 읽어 `mirror`도 1이 된다.
2. 둘째 단계는 `keep` 때문에 `sent`와 `jobs`가 1인 채로 시작한다. `mirror`는 `keep`하지 않아 `from`인 0에서 시작하고, `saved`는 단계 `set=`의 재설정이 정한 10에서 시작한다.
3. 셋째 단계의 `saved`는 11, `mirror`는 10으로 이어지고 `sent`는 재설정으로 20에서 시작한다. `api -> db`의 점이 `db`에 닿는 순간 `on` 줄이 `saved`를 12로 올린 다음 `set="sent:=saved, saved:=sent"`가 두 값을 읽고 맞바꿔 `sent`는 12, `saved`는 21이 된다.
4. 단계를 탭으로 바로 골라도 앞 단계를 다시 재생하지 않는다. 시간표가 단계마다 시작 값을 담고 있어서다.

### 잠금이 풀릴 때까지 기다리기

```text
flow right
title "잠금으로 막기"

box a "작업 A"
box b "작업 B"
box lock "잠금"
value holder "쥔 쪽" on=lock from=none
a -> lock
b -> lock

step "A가 잠금을 쥔다"
  a -> lock "요청" set="holder=A"
step "풀리면 B가 들어간다" keep="holder"
  a -> lock "풀기" set="holder=none" & b -> lock "요청" wait="holder='none'" set="holder=B"
```

1. 첫 단계에서 A의 점이 `lock`에 닿아 `holder`가 `A`가 된다.
2. 둘째 단계는 `keep` 때문에 `holder`가 `A`인 채로 시작한다.
3. 같은 박자에 두 이동이 시작하지만 B의 `wait` 조건 `holder='none'`이 거짓이라 B의 점은 출발하지 않는다.
4. A의 점이 `lock`에 닿으면 `holder`가 `none`이 되고, 그 시각에 B의 대기가 풀려 B의 점이 출발한다.
5. B의 점이 `lock`에 닿으면 `holder`가 `B`가 된다. 이 순서는 빌드 때 한 번 정해져 SVG와 재생기가 같게 보인다.

### 풀리지 않는 대기 남기기

```text
flow right
title "교착"

box t1 "작업 1"
box t2 "작업 2"
box l1 "잠금 가"
box l2 "잠금 나"
value h1 "가를 쥔 쪽" on=l1 from=none
value h2 "나를 쥔 쪽" on=l2 from=none
t1 -> l1
t1 -> l2
t2 -> l2
t2 -> l1

step "각자 하나씩 쥔다"
  t1 -> l1 "쥠" set="h1=t1" & t2 -> l2 "쥠" set="h2=t2"
step "서로 상대 것을 요청한다" keep="h1, h2" status="t1=wait, t2=wait"
  t1 -> l2 "요청" wait="h2='none'" stuck & t2 -> l1 "요청" wait="h1='none'" stuck
```

1. 둘째 단계가 시작하면 `h1`은 `t1`, `h2`는 `t2`다.
2. 두 대기 조건이 모두 거짓이고 그 박자에 예정된 이벤트가 없어서 두 대기의 계산이 그 자리에서 멈춘다. 점이 하나도 남지 않은 박자는 점 없이 멈추는 박자가 된다.
3. `stuck`이 있어 경고는 나지 않고, 대기 중인 도형과 조건이 시간표에 남는다. `stuck`이 없으면 같은 내용이 `wait-stalled` 경고로 나온다.

### 느려진 소비자만 표시하기

```text
flow right
title "느려진 소비자"

box prod "생산자"
box hub "브로커"
box fast "빠른 소비자"
box slow "느린 소비자"
prod -> hub
hub -> fast
hub -> slow

step "평상시" for=6s
  track prod -> hub -> fast "주문" every=1s time=2s
  track prod -> hub -> slow "주문" at=500ms every=1s time=2s
step "소비자 하나가 느려진다" for=6s status="slow=warn"
  track prod -> hub -> fast "주문" every=1s time=2s
  track prod -> hub -> slow "주문" at=500ms every=1s time=4s legs="500ms, -"
```

1. 둘째 단계에서만 `slow`에 `WARN` 알약이 붙는다. 이름과 기호가 있어 색을 구별하지 못해도 읽힌다.
2. `slow`로 가는 점은 첫 구간 500ms에 지나고, 남은 3.5초가 둘째 구간의 시간이다.
3. 다음 단계가 시작하면 `slow`는 선언 상태로 돌아간다.

## 상세 설계

### 줄과 낱말

- 한 줄에 문장 하나다. 빈 줄은 무시한다. 들여쓰기는 읽기용이다.
- `#`부터 줄 끝까지는 주석이다. 따옴표 안의 `#`는 글자다.
- 따옴표 밖의 공백, 탭, 줄 끝 CR(Windows 줄바꿈), 파일 앞 BOM, 유니코드 공백은 모두 공백으로 읽는다. 편집기 설정과 상관없이 같은 원본이 같은 그림이 되게 하기 위해서다.
- 낱말은 공백 하나 이상으로 나눈다. `->`, `&`, `{`, `}`는 앞뒤에 공백이 있어야 하는 낱말이다. `a->b`는 오류다.
- `{`는 그룹, 테이블, 격자 줄의 마지막 낱말이고, `}`는 혼자 한 줄이다. 안에 아무것도 없는 그룹, 테이블, 격자는 오류다.
- 글은 큰따옴표 안에 쓴다. 빈 글(`""`, 공백만 있는 글)은 오류다. 이름 없는 도형이나 빈 항목을 막기 위해서다. 따옴표 안의 `\"`는 따옴표, `\\`는 역슬래시다. 그 밖의 역슬래시와 줄바꿈은 오류다.
- 글 안에서 백틱(`` ` ``)으로 감싼 부분은 코드다. 마크다운처럼 백틱은 그리지 않고 그 구간만 고정폭 글꼴로 그린다(예: ``"`session/start` 요청"``). 코드 안 한글은 Pretendard로 그린다. 도형 이름, 부제, 그룹 제목, 카드 글, 선 라벨, 노트, 단계 이름, 설명, 차트 글에 쓸 수 있다. 백틱 짝이 맞지 않으면 그 줄의 오류다. 백틱 글자 자체를 그릴 방법은 없다.
- 선택 사항은 `키=값` 한 낱말이다. `=` 앞뒤 공백은 오류다. 선택 사항의 순서는 자유다. 같은 키를 두 번 쓰면 오류다.
- 값이 없는 선택 사항(`quiet`, `dashed`, `mono`, `pk`, `unique`)은 정해진 낱말만 쓴다. 이름 자리의 `quiet` 같은 낱말은 이름이다.

### 이름

- 이름(id)은 영어 소문자로 시작하고 영어 소문자, 숫자, `-`만 쓴다. `-`는 낱말 사이에 하나씩만 온다(`a-`, `a--b`는 오류). 테이블 이름은 `-` 대신 `_`를 같은 규칙으로 쓴다. 열 이름은 영문자로 시작하고 영문자(대소문자), 숫자, `_`를 쓴다([그림 종류](figure-kinds.md)). 이름 오류 메시지는 그 이름이 따를 규칙의 이음 글자(`-` 또는 `_`)를 적는다.
- 이름 오류로 버린 선언의 이름을 가리키는 줄에는 `unknown node` 오류를 덧붙이지 않는다. 그 선언이 있던 그룹에도 `group is empty` 오류를 덧붙이지 않는다. 원인이 이름 오류 하나이기 때문이다.
- 파일 안에서 도형, 그룹, 상태, 테이블, 계열 이름은 서로 겹치지 않는다.
- 이름이 겹치면 `the name "g" is already used (line N)` 오류(코드 `syntax`)를 겹친 선언의 줄에 내고, 이름을 가리키는 선과 이동, 그룹 포함 관계 확인은 하지 않는다. 열린 그룹과 같은 이름의 선언은 그 그룹 안에 두지 않아 부모 관계가 순환하지 않는다. 부모 사슬을 따라가는 곳(그룹 포함 확인, 그룹 깊이, 방향 상속)은 순환을 만나면 `parent cycle` 오류로 끝낸다.
- 차트가 아닌 그림에 도형(순서 그림은 참여자)이 하나도 없으면 오류다.
- `테이블.열` 꼴 이름은 데이터 관계 그림에서만 쓴다. `격자.칸` 꼴 이름은 구조 그림의 `light`, 선 끝, 이동 끝에서 쓴다([칸 격자](grid.md)).
- 이름 자리에서는 예약어 검사를 하지 않는다. `box data "데이터"`, `box step "단계"`, `box q1 "1분기"`, `table row "행" {`처럼 문장 낱말, 선택 사항 키, 값 없는 선택 사항 낱말(`quiet`, `dashed`, `mono`, `pk`, `unique`)을 모두 이름으로 쓸 수 있다. 이름 자리는 도형, 그룹, 상태, 테이블, 계열 선언의 이름, 선과 이동 줄의 양 끝, `show`, `clear`, `note`, `light`, `start`, `final`, `reveal`의 대상이다.
- 문장 종류는 첫 낱말로 정하고, 둘째 낱말이 `->`인 줄은 첫 낱말이 문장 낱말이어도 선 줄(시간 흐름 안에서는 이동 줄)로 읽는다. 그래서 `step -> c`는 `step`이라는 이름에서 `c`로 가는 선이다. 이름이 낱말마다 정해진 자리에만 오고, 값 없는 선택 사항은 그 자리 뒤에 오므로 해석이 갈리는 자리가 없다. 막은 자리는 하나다. 선 차트의 행은 `x=`를 가로 값에 쓰므로 계열 이름을 `x`로 지을 수 없다.
- 테이블 `{`, `}` 안의 줄은 첫 낱말을 늘 열 이름으로 읽는다(`state varchar`도 열이다). 위치로 뜻이 정해지는 낱말(`graph`, `at`, `right`, `down`, `linear`, `log`, `bar` 같은 종류 이름)도 이름으로 쓸 수 있다.

### 값 형식

선택 사항의 키와 값 목록은 [문법 표](#호환-규칙)가 정본이다. 차트 행의 값은 아래와 같다.

| 키 | 값 |
|---|---|
| 계열 이름, `x`, `y`, `min`, `q1`, `median`, `q3`, `max`, `계열.low`, `계열.high` | 숫자. 막대 계열 값만 빠진 값 `-`도 된다 |

- 시간은 `900ms`나 `2s`이고 0보다 크다. 단위 없는 숫자는 시간이 아니다. 시간 값 하나는 1시간(`3600s`, 3600000ms)을 넘을 수 없고, 넘으면 그 줄의 오류다(`code`는 `time-limit`). `speed`, `for`, `wait`, `time=`, `at=`, `every=`, `timeout=`, `legs=`의 항목 모두 같다. 단계 하나의 길이와 그림 전체 시간에도 같은 상한이 있다([재생](playback.md#시간-상한)).
- 숫자는 `-`와 소수점만 쓰는 십진수다(`-3`, `91.4`). 천 단위 쉼표와 지수 표기는 오류다. 음수를 쓸 수 있는 자리는 [차트](charts.md)의 값 축 표가 정한다.
- 글 값은 늘 따옴표 안에 쓴다. `tag=you`는 오류다.

### 파일 구조

파일은 세 부분이 이 순서로 온다. 앞 부분으로 돌아가는 줄은 오류다.

| 순서 | 부분 | 줄 |
|---|---|---|
| 1 | 머리 | 그림 종류 문장, 그 뒤 `title`, `subtitle`, `speed`, `aspect`. 차트는 [차트](charts.md)의 머리 줄을 더한다 |
| 2 | 선언 | 도형, 그룹, 선, 상태, 테이블, 계열, 값 |
| 3 | 시간 흐름 | `step`과 그 아래 박자 줄 |

- 같은 머리 줄을 두 번 쓰면 오류다.
- 그림 종류 문장은 주석과 빈 줄을 뺀 첫 문장이다. 그 밖의 자리에 오는 `state`는 테이블 안 열 줄을 빼고 모두 상태 선언이다.

| 그림 종류 문장 | 그림 |
|---|---|
| `flow right`, `flow down` | 구조 그림. 이 문서 |
| `sequence` | 순서 그림. [그림 종류](figure-kinds.md) |
| `state right`, `state down` | 상태 그림. [그림 종류](figure-kinds.md) |
| `data right`, `data down` | 데이터 관계 그림. [그림 종류](figure-kinds.md) |
| `chart bar` 외 | 차트. [차트](charts.md) |

| 머리 줄 | 뜻 | 기본값 |
|---|---|---|
| `daphnis 1` | 문법 판. 파일의 첫 문장일 때만 쓰고 그림 종류 문장 앞에 둔다([호환 규칙](#호환-규칙)) | 판 1 |
| `title "글"` | 그림 제목. SVG `<title>`, 차트는 그림 안 제목, 그 밖 그림은 목록 쪽 머리 제목 | 파일 이름 |
| `subtitle "글"` | 그림 아래 한 줄 설명 | 없음 |
| `speed 3s` | 점이 기준 길이 `size.packet.hop-ref`의 선을 지나는 시간. 선 길이에 비례해 이동 시간이 정해져 모든 이동이 같은 속도로 보인다(아래 이동 시간). 차트에서는 계열이 자라는 시간([차트](charts.md)) | 토큰 `duration.hop`과 `size.packet.hop-ref`, 차트는 `duration.reveal` |
| `width wide` | 캔버스 폭. `wide`는 `size.figure-canvas-wide`(1440)이고 `standard`는 표준 폭(960)이다. `flow`, `state`, `data`에서만. 구성도처럼 열이 많은 그림이 글자를 줄이지 않고 한 줄로 퍼지게 한다. [배치](layout.md) | 생략하면 표준 폭 |
| `aspect 1.6` | 목표 가로세로 비율. `flow`, `state`, `data`에서만, 그룹이 있어도 된다. [배치](layout.md) | 없음(캔버스 폭보다 넓으면 도구가 자동으로 접는다) |

### 구조 그림 선언

| 줄 | 뜻 |
|---|---|
| `person id "이름" [fill=색] [stroke=색]` | 사람 |
| `box id "이름" ["부제"] [shape=rect\|circle] [badge="글"] [icon=이름] [count=N] [fill=색] [stroke=색]` | 구성 요소, 모듈. `shape=circle`은 합류 연산(⊕)처럼 짧은 이름을 담는 작은 원이고 부제가 없다 |
| `external id "이름" ["부제"] [fill=색] [stroke=색]` | 외부 프로그램, 외부 서비스. 점선 테두리 |
| `store id "이름" ["부제"] [fill=색] [stroke=색]` | 파일, 데이터베이스. 원통 |
| `decision id "질문"` | 갈림길. 마름모 |
| `group id "이름" [direction=right\|down] [badge="글"] [icon=이름] [fill=색] [stroke=색] {`, `}` | 그룹. 두 줄 사이에 도형과 그룹을 둔다. 제목 줄에 배지와 아이콘을 달 수 있다 |
| `icons 이름 "폴더"` | 사용자 아이콘 세트 등록. 폴더의 `<이름>.svg`를 `icon=세트:이름`으로 쓴다 |
| `grid id "제목" [rows=N] [cols=N] {`, `}` | 칸 격자. 두 줄 사이에 `item`과 `gap` 칸을 둔다. 도형 하나로 배치된다([칸 격자](grid.md)) |
| `queue id "이름" slots=N [from=K]` | 큐. 이름 아래에 칸 N개가 한 줄로 든 둥근 사각형이고, 찬 칸 수가 이 큐의 값이다 |
| `value id "이름" on=도형 [from=값 \| ref=값id]` | 값. 도형 카드에 `이름  값` 줄로 늘 보인다. 값은 숫자나 공백 없는 낱말(8자 이하)이다 |
| `on 도형 id+N, id-N, id=낱말` | 어떤 점이든 그 도형에 닿을 때 값을 바꾼다. 값 선언 뒤에 둔다 |
| `a -> b ["라벨"] [quiet] [dashed] [head=end\|both\|none] [no=N]` | 선. 끝은 격자 칸 `격자.칸`도 된다 |

- 도형 크기와 굵기는 적지 않는다. 크기는 글과 카드 내용으로, 모양은 토큰으로 정한다. 색은 기본이 칠하지 않음이고, 고르려면 아래 도형 색의 `fill`, `stroke`, `card`만 쓴다. 아이콘은 `icon=`으로 고르되 모양과 색은 정하지 않는다([배치](layout.md#아이콘)).
- 선의 양 끝은 선언된 도형이나 그룹이다. 선은 도형 선언보다 앞에 와도 된다. 파일을 다 읽은 뒤 이름을 확인한다.
- 같은 방향의 두 끝 사이 선은 하나다. `a -> b`가 둘이면 오류다. `a -> b`와 `b -> a`는 함께 둘 수 있다.
- 거꾸로 적는 `<-`는 없다. 요청이 가는 쪽으로 적는다.
- 자기 자신으로 가는 선과, 그룹과 그 안 모든 하위 도형과 그룹 사이의 선은 오류다. 예외는 상태 그림의 자기 전이([그림 종류](figure-kinds.md))와, 한 격자의 서로 다른 두 칸을 잇는 선(`g.a -> g.b`, 라벨 없음)이다.
- `head`는 화살촉 자리다. `end`(기본값, 생략하면 이 값)는 도착 끝, `both`는 양 끝, `none`은 없는 무방향 선이다. 이동 점은 `head`와 상관없이 적은 방향(`a -> b`)으로 가고 거꾸로 이동도 선을 따라간다.
- 선 끝 `격자.칸`은 `item`만 된다. `gap`과 없는 칸은 오류다. 같은 두 도형 사이에 칸이 다른 선이 여럿이면 같은 방향 선 중복이 아니고, 이동은 `격자.칸 -> 격자.칸`으로 선을 고른다. 도형 이름만 적은 이동(`a -> b`)은 가능한 선이 하나일 때만 쓴다.
- 그룹 안의 도형을 바깥에서 부를 때도 이름만 쓴다. 이름이 파일 전체에서 하나이기 때문이다.
- `dashed` 선은 비동기 흐름이나 선택적 흐름이다. 점선 테두리 도형(`external`)과 뜻이 다르다.
- `quiet` 선은 그 선을 처음 지나는 박자부터 그 단계 끝까지만 보인다. 시간 흐름이 없거나, 시간 흐름에서 한 번도 지나지 않는 `quiet` 선은 [그림 검사](figure-check.md) 11번 경고가 난다.

#### 번호, 배지, 아이콘, 복제 개수

- `no=N`(1 이상 정수)은 선 번호다. 라벨 알약 왼쪽에 번호 원이 붙고(라벨이 없으면 번호 원만), 정지 SVG와 문서에서도 순서가 읽힌다. 재생 단계 번호와 독립이고 같은 번호를 여러 선에 써도 된다.
- `badge="글"`(8자 이하)은 도형 윗줄과 그룹 제목 줄에 글자 알약을 단다. 흑백에서도 구성 요소의 종류가 글자로 남는다. 배지는 면과 테두리 색을 바꾸지 않는다. 범주를 색으로 나누려면 아래 도형 색을 쓴다. 원(`shape=circle`)은 배지와 아이콘이 오류다.
- `shape=tile`(`box`만, `icon=` 필수)은 아이콘 카드다. 같은 흰 카드에 아이콘을 크게(`size.icon.tile`) 위에 놓고 이름을 아래에 두며, 최소 너비와 이름 양옆 간격이 작아(`size.node.tile-width`, `size.node.tile-pad`) 가로로 퍼진 구성도가 캔버스 폭 안에 든다.
- 그룹 `border=dashed`는 경계 그룹의 점선 테두리다. 실선(기본)은 서브넷 같은 안쪽 구역, 점선은 VPC, 스케일링 그룹, 외부 묶음 같은 논리 경계에 쓴다. 그룹 아이콘은 틀 왼쪽 위 모서리에 딱 붙는 정사각 탭(`size.group.title`)이다. 탭 면은 `color.figure.icon`, 아이콘은 `color.node`이고, 아이콘이 있는 그룹의 틀도 같은 파랑이다. 그룹 면은 `fill`을 적지 않으면 중첩 깊이에 따른 무채색 회색(깊이 1, 2, 3 이상 세 단계)이다. `fill=sky`나 `fill=purple`로 고르는 강조 그룹은 그 색의 옅은 틴트 면과 1.5px 테두리, 같은 색 제목을 쓰고, 그 안의 그룹은 같은 색상각 틴트를 깊이마다 한 단계씩 진하게(다크는 밝게) 칠한다. 일반 그룹은 외곽선이 없고 점선 경계 그룹만 점선이다. 빨강과 초록은 상태 도형 면 전용이라 그룹 강조로 쓰지 않는다.
- `icon=이름`은 기본 세트의 이름이다. 범용 개념(`server`, `db`)과 기술 브랜드(`git`, `postgresql`)가 한 표에 있다. 등록한 세트는 `icon=세트:이름`이다. 아이콘은 단색 파랑(`color.figure.icon`)이고 브랜드 고유색은 쓰지 않는다. 이름이 없거나 파일이 없으면 오류이고, 아이콘 없이 배지로 같은 뜻을 낸다.
- `count=N`(2 이상, `box`만)은 같은 역할 복제 개수다. 상자 뒤에 윤곽 두 겹이 겹쳐 보이고 윗줄에 `(N)` 알약이 붙는다. 복제는 이름으로 가리킬 수 없고 선은 상자 하나에 닿는다.
- `badge`, `icon`, `count`는 흐름 그림에서만 쓴다.

#### 도형 색

- `fill=색`은 도형과 그룹의 면, `stroke=색`은 테두리, `show`의 `card=색`은 그 내용이 보일 때의 카드 바탕이다. 모두 생략할 수 있고 생략하면 면을 칠하지 않은 지금 그림과 같다(카드 기본 바탕은 `color.card`).
- 색 이름은 문법 표의 `paint` 값 목록이 정한다: `red`, `amber`, `green`, `teal`, `navy`, `purple`, `pink`, `gray`, `sky`. hex와 따옴표 글은 오류다. 대비 규칙(글자 4.5, 그래픽 3)을 원본이 깨지 못하게 하기 위해서다. `blue`는 지금, `orange`는 비교를 뜻해 고를 수 없다. 값 없이 `fill=#ff0000`처럼 쓰면 `#`부터 주석이라는 안내가 붙는다.
- `box`, `external`, `store`, `person`, `group`에 쓴다. `decision`, `queue`, 상태, 테이블, 격자에는 없다. 사람과 원통도 같은 윤곽을 칠한다.
- 색은 팔레트 단계다. 면은 옅은 단계 `fill`이라 이름과 부제 글자(`fg`, `muted`)가 그대로 4.5 이상이고, 테두리는 그림 면과 모든 색의 면 위에서 3 이상인 `stroke`다. 카드 바탕도 같은 `fill`이라 카드 줄 글자와 태그 띠가 4.5 이상이다. 한 내용의 줄 가운데 처음 `card=`를 쓴 줄이 그 내용의 바탕이다.
- 밝힘은 색이 아니라 굵은 테두리(`border.strong`)와 후광으로 알린다. `stroke`를 고른 도형은 켜져도 그 색을 유지하고 후광도 그 색이다. 후광은 테두리 바깥으로 틈을 두고 두른 고리 한 겹이며 그 도형이 놓인 바탕(그룹 안이면 그 그룹 면) 위에서 3 이상이다. `stroke`를 고르지 않은 도형은 지금처럼 `state.active` 파랑 굵은 테두리이고 후광이 없다. 색 선택이 파랑(지금)을 쓰지 못하므로 켜진 도형과 같은 색인 테두리가 생기지 않는다.
- 색 단계의 값과 대비는 [색 역할](docs-integration.md#색-역할)이 정한다.

#### 값

- `value id "이름" on=도형 [from=값]`은 `on` 도형 카드에 `이름  값` 줄을 만든다. `from`은 처음 값이고 생략하면 `0`이다. `on`은 카드를 쓰는 도형(`box`, `external`, `store`, `person`)이다. 큐는 같은 이름의 값을 스스로 가진다([큐](#큐)). 값 이름은 파일 전체에서 도형, 그룹 이름과 겹치지 못한다.
- 선언한 값은 모든 단계의 카드에 단계 시작부터 늘 보인다. 값을 바꾸는 식이 있든 없든 같다. 바뀌는 순간에만 그 줄이 밝아진다.
- `value id "이름" on=도형 ref=다른값id`는 참조다. 가리키는 값이 바뀌면 참조 값 줄도 같은 순간 같은 값으로 바뀌고 둘 다 밝아진다. 참조의 참조는 된다. 순환과 없는 값을 가리키는 것은 오류이고, `from`과 `ref`를 함께 쓰는 것도 오류다. 참조 값에 식으로 직접 쓰면 오류다. 값을 나눠 쓰는 방법은 `ref`이고, 한 값을 다른 값으로 한 번 복사하는 식은 읽기 식(`:=`)뿐이다.
- 값은 단계가 시작할 때 `from`으로 돌아간다. 카드가 단계마다 꺼지는 규칙과 같다. 단계의 `keep`에 적은 값만 앞 단계가 끝난 값에서 시작한다([값 유지와 읽기](#값-유지와-읽기)).
- `on 도형 식, 식`은 어떤 점이든 그 도형에 닿을 때 식을 적용한다. 박자의 이동과 흐름 모두에 적용되고, 출발 도형은 닿는 것이 아니라 뺀다. 이동과 흐름의 `set=`은 그 이동에만 덧붙는다. 식은 `id+N`, `id-N`, `id=N`, `id=낱말`이다. `=` 뒤는 언제나 값 글자이고 다른 값의 이름과 같아도 그 글자다. 공백이 든 낱말은 오류다. `+`, `-` 뒤 숫자는 차트 숫자([charts.md](charts.md) 값 범위)와 같이 유한하고 절댓값이 1e15 미만이어야 하고, 아니면 그 줄의 오류다(309자리가 넘는 수가 `Infinity` 글자로 그려지던 것을 막는다). `on`에는 `@도형`을 쓰지 않는다.
- 값 글자는 `VALUE_MAX`(8)자 이하다. 계산으로 이보다 길어지면 [그림 검사](figure-check.md) 14번이 오류로 알린다.

#### 큐

- `queue id "이름" slots=N [from=K]`는 이름 아래에 칸 N개를 한 줄로 놓은 둥근 사각형이다. 찬 칸은 왼쪽부터 채운다. 흐름 그림(`flow`)에서만 쓴다.
- `slots`는 1 이상 32 이하 정수이고 꼭 적는다. 0, 33 이상, 소수, 음수는 오류다. 상한 32의 근거는 칸 폭(`size.queue.slot-width`)과 칸 사이(`size.queue.slot-gap`)로 32칸이 약 636px라 표준 캔버스 폭(960) 안에 들고, 그보다 많으면 칸 수를 세어 읽기 어렵기 때문이다.
- `from`은 처음 찬 칸 수다. 0 이상 `slots` 이하 정수이고 생략하면 0(빈 큐)이다. `slots`보다 크면 오류다. 부제, 배지, 아이콘, `fill`, `stroke`, 카드는 없다.
- 큐는 자기 이름으로 부르는 값 하나(찬 칸 수)를 스스로 가진다. 따로 `value` 줄을 쓰지 않고, 위 값과 같은 식으로 바꾼다. 식의 값 이름 자리에 큐 이름을 쓴다: `on q q+1`(점이 `q`에 닿을 때 한 칸 채움), `set="q-1@q"`(나갈 때 한 칸 비움), `set="q=0"`. 적용 순서, 단계가 시작할 때 `from`으로 돌아가는 것, 출발 도형은 닿는 것이 아니라 빼는 것도 값과 같다. 이 값의 식은 정수만 받는다(`q+1.5`, `q=낱말`은 오류).
- 큐의 값에는 카드 줄이 없다(`value`의 `on=큐`는 오류). 찬 칸 수를 숫자로도 보이려면 다른 도형에 참조를 단다: `value len "큐 길이" on=prod ref=q`.
- 값 범위: 값 자체는 자르지 않고 식대로 계산하지만 그림은 음수를 0칸(빈 큐), `slots`를 넘는 값을 가득 찬 칸으로 그린다. 그래서 `0`에서 `q-1`을 하면 값은 -1이고 그림은 빈 큐이며, 이어서 `q+1`을 하면 값이 0이라 여전히 빈 큐다. 이렇게 값이 범위를 벗어나면 [그림 검사](figure-check.md) 14번이 큐마다 아래쪽과 위쪽 한 번씩 경고한다. 정확히 0과 `slots`는 범위 안이라 경고가 없다.
- 정지 SVG는 값 변화를 그리지 않으므로 `from` 칸 수를 그린다. 움직이는 SVG와 재생기는 단계가 시작할 때 `from`을 그리고, 값이 바뀌는 순간 찬 칸 수가 바뀌며 큐 테두리가 `duration.value-flash` 동안 밝은 테두리로 보인다([재생](playback.md#값-변화)).
- 크기와 연결점은 상자(`box`)와 같다. 너비는 이름 폭과 칸 줄 폭(칸 폭 `size.queue.slot-width`, 칸 사이 `size.queue.slot-gap`) 가운데 큰 쪽이고 최소 `size.node.min-width`이다. 칸이 많으면 `size.node.max-width`를 넘을 수 있다. 높이는 이름 줄과 칸 높이(`size.queue.slot-height`)로 정한다([배치](layout.md)). 선은 네 면 어디에나 닿는다.
- 색은 토큰이다. 도형 면과 1px 외곽선은 다른 도형과 같다(`color.node`, `color.outline`, 대비 3). 찬 칸은 브랜드 파랑 `color.figure.queue-fill`, 빈 칸은 무채색 면 `color.figure.queue-empty`에 `color.outline` 외곽선이다. 라이트와 다크 모두 찬 칸은 도형 면과 빈 칸 위에서 대비 3 이상이다. 칸 수는 색만이 아니라 칸 개수로도 읽힌다.

### 시간 흐름

시간 흐름은 단계(step)의 목록이다. 단계는 박자(beat)의 목록이거나 흐름(track)의 목록이고, 한 단계가 둘을 섞지는 못한다. 탭 하나가 단계 하나다.

| 줄 | 뜻 |
|---|---|
| `step "이름" ["설명"] [for=12s] [keep="값, 값"] [set="식, 식"] [status="도형=종류, 도형=종류"]` | 단계 시작. `for`는 흐름 단계의 길이이고 생략하면 토큰 `duration.flow-step`이다. `keep`, `set`, `status`는 이 단계의 시작 값과 도형 상태를 정한다([값 유지와 읽기](#값-유지와-읽기), [단계별 도형 상태](#단계별-도형-상태)) |
| `a -> b ["실어 보낼 글"] [time=3s] [tone=purple] [set="식, 식"] [lost=60%] [when="조건"] [wait="조건"] [timeout=2s] [else=도형] [stuck]` | 이동 박자. 점 하나가 선 하나를 지난다. `lost`, `when`, `wait`, `timeout`, `else`, `stuck`은 [조건과 대기](#조건과-대기), [사라짐과 구간 시간](#사라짐과-구간-시간) |
| `track a, b -> c -> d ["글"] [at=0s] [every=2s] [time=6s] [legs="1s, -"] [tone=brand] [set="식"] [lost=60%] [when="조건"] [wait="조건"] [timeout=2s] [else=도형] [stuck]` | 흐름. 출발지마다 점이 선언된 선들을 멈춤 없이 잇는다. `legs`는 구간마다 이동 시간을 정한다 |
| `a -> b "글" & c -> d time=2s` | 한 박자 안의 여러 이동 |
| `show id "글" [tag="태그"] [tone=purple] [card=색] [meta="덧붙임"] [mark="표시"] [mono]` | 카드 줄 하나를 바로 앞 박자에 더한다 |
| `show id graph "가 -> 나; 가 -> 다" [lit="가, 나"]` | 카드에 작은 관계 그래프 줄 하나를 더한다 |
| `clear id` | 바로 앞 박자에서 카드를 비운다 |
| `light id id` | 점 없이 도형과 그룹을 밝히는 박자. 이름은 하나 이상이고, 격자 칸은 `격자.칸`으로 적는다 |
| `say "설명"` | 점 없이 설명만 바꾸는 박자 |
| `wait 2s` | 멈추는 박자 |

이동:

- `a -> b`는 선언된 선 `a -> b`를 따라간다. 없으면 `b -> a`를 거꾸로 따라간다. 둘 다 없으면 오류다. 같은 방향 선은 하나라서 고를 선이 언제나 하나다.
- 이동의 글과 `time=`은 바로 앞 `a -> b`에 붙는다. `&`로 이은 이동마다 따로 적는다.
- 박자의 이동 시간은 그 박자 이동 가운데 가장 긴 시간이다.
- 이동 시간: `time=`이 있으면 그 이동의 절대 시간이다. 없으면 `선 길이 / 토큰 size.packet.hop-ref × speed`이다. 길이가 두 배인 선은 시간도 두 배라 점이 같은 속도로 움직인다. 아주 짧은 선이 너무 빨리 끝나지 않게 토큰 `duration.hop-min`보다 짧지 않다. 최대 시간은 없어 긴 선도 같은 속도로 지난다. `speed`를 기본값(`duration.hop`)에서 바꾸면 최소도 같은 비율로 바뀐다. 선 길이는 배치가 끝난 선 경로의 길이이고, 점이 따라가는 둥근 모서리 경로(그려지는 선)를 기준으로 잰다. 거꾸로 이동도 같다. 순서 그림 메시지도 같은 규칙이다. 출발과 도착이 느린 곡선(`easing.move`)은 그대로다.
- 이동 글이 그 선의 라벨과 같으면 [그림 검사](figure-check.md) 8번 경고가 난다. 같은 글이 두 번 보이기 때문이다.
- 그룹이 끝인 선을 지나는 점은 그룹 경계의 연결점에서 멈춘다.

카드:

- `show`, `clear`는 바로 앞 박자에 붙고, 적은 순서대로 적용한다. 단계의 첫 줄이 `show`면 멈추는 박자를 하나 만든다. 단계의 첫 줄이 `clear`면 오류다. 비울 카드가 없기 때문이다.
- 내용이 없는 카드는 틀도 글자도 그리지 않는다. 읽을 내용이 없는데 점선 틀이 도형마다 남으면 정보 없는 표시가 반복돼 화면이 어수선하기 때문이다. 틀은 카드에 내용이 들어오는 박자에 내용과 함께 나타나고 `clear`로 비우면 함께 사라진다. 카드 자리는 배치에 그대로 잡혀 도형 크기는 변하지 않는다. 카드에 읽을 글이 없으므로 대체 글도 두지 않는다. 정지 SVG는 카드를 비워 그리므로 틀도 없다.
- 도착 규칙: 그 박자에 점이 도착하는 도형의 카드는 그 도형에 도착하는 이동 가운데 가장 늦은 도착 때 바뀐다. 나머지 도형의 카드는 박자 시작에 바뀐다.
- 태그는 대문자로 그린다. `tone`이 있는 줄은 그 색이다. `tone`이 없는 줄은, `tone` 없이 처음 나온 태그 순서대로 보라, 초록, 진한 회색을 돌아가며 붙인 색을 그림 전체에서 같은 태그에 쓴다. 파랑(`brand`, 지금)과 빨강(`red`, 오류)은 `tone`으로 고를 때만 쓰고, 주황은 비교 계열을 뜻해서 태그 색이 아니다. 옛 값 `tone=blue`는 브랜드 파랑(`brand`)으로, `tone=teal`과 `tone=orange`는 보라(`purple`)로 읽고 폐기 진단으로 새 이름을 알린다([호환 규칙](#호환-규칙)).
- `mark`는 8자 이하다. 카드 오른쪽 끝에 들어갈 자리가 정해져 있기 때문이다.
- 관계 그래프 글은 `;`로 관계를 나누고, 관계는 `이름 -> 이름` 또는 이름 하나다. 이름은 앞뒤 공백을 빼고 `;`, `,`, `->`를 쓰지 않는다. 관계가 돌아 제자리로 오거나, `lit`의 이름이 그래프에 없으면 오류다.
- 구조 그림에서 카드를 쓰는 도형은 `box`, `external`, `store`, `person`이다. `decision`, 격자, 그룹에 `show`를 쓰면 오류다. 다른 그림 종류는 [그림 종류](figure-kinds.md)를 따른다.

단계:

- 박자 줄도 흐름 줄도 하나도 없는 단계는 오류다.
- 한 단계 안에서 지나간 선, 밝힌 도형, 카드 내용은 남는다. 다음 단계가 시작하면 모두 꺼진다. 차트의 단계 규칙은 [차트](charts.md)에 있다.

흐름 단계:

- 흐름은 박자와 따로 돈다. 한 단계에 `track` 줄을 두면 그 단계는 길이가 `for`인 구간 하나이고, 흐름끼리 서로 기다리지 않는다. 한 단계에 박자 줄(이동, `show`, `clear`, `light`, `say`, `wait`)과 `track` 줄을 섞으면 오류다. 한 그림에는 두 종류의 단계가 함께 있어도 된다. 구조 그림에서만 쓴다.
- `track a, b, c -> x -> y`는 출발지마다 흐름 하나로 펼친다. `at`을 적지 않으면 출발지 i의 첫 출발은 `every × i / n`(n은 출발지 수)이라 출발이 엇갈린다. `tone`을 적지 않으면 출발지 이름마다 브랜드 파랑(`brand`), 보라(`purple`) 순으로 색이 하나씩 배정되고 셋째 출발지부터는 모두 진한 회색(`gray`)이며, 같은 출발지 이름은 그림 전체에서 같은 색이다. 적으면 그 값이다.
- 구간마다 이동과 같은 규칙으로 선을 고른다(같은 방향 선, 없으면 거꾸로, 둘 다 없으면 오류). 점은 구간 사이에서 멈추지 않고 이어 붙인 경로를 지나며, 도형 안을 지나는 동안은 보이지 않는다. 이동 시간은 구간 시간(선 길이 비례)의 합이고 `time=`은 경로 전체의 시간이다. 구간마다 시간을 정하려면 `legs=`를 쓴다([사라짐과 구간 시간](#사라짐과-구간-시간)). 출발과 도착이 느린 곡선(`easing.move`)은 경로 전체에 한 번 건다.
- `at`은 처음 출발 시각이다(`0s`도 된다). `every`가 있으면 단계 끝 전까지 그 간격으로 되풀이해 출발한다. `at + every`가 `at`과 같아지는 것처럼 출발 시각이 엄격히 늘지 않는 시간 정밀도는 지원하지 않고 그 `track` 줄의 오류다(`code`는 `time-precision`. `every=`를 늘리거나 `at=`을 줄인다). 단계 끝까지 도착하지 못하는 점은 단계 끝에서 서서히 사라지게 그리고(`duration.cut-fade`), 그 점이 닿지 못한 도형의 값은 바뀌지 않는다. 출발 수와 잘린 점 수는 배치가 정하는 이동 시간에 따라 달라지므로 횟수가 중요한 그림은 `time=`을 적는다. `when`, `wait`, `lost`가 없는 흐름에서 점이 하나도 그려지지 않으면 [그림 검사](figure-check.md) 14번 오류다. 이 셋이 있는 흐름은 조건과 사라짐 때문에 점이 없을 수 있어서 오류가 아니다.
- `for`는 `track`이 없는 단계에 쓰면 오류다.
- 글은 이동 글 상자처럼 점과 함께 간다. 흐름이 지나는 선은 점이 처음 닿는 시각에 밝아지고 단계 끝까지 남는다. 도형은 켜 두지 않고, 점이 닿을 때마다 후광만 `duration.pulse` 동안 한 번 깜빡인다.

점 색과 값 바꾸기:

- `tone=`은 점과 글 상자의 색이다. tone 이름은 그 색을 그린다. 값 목록은 카드 태그의 `tone`과 같아서(`brand`는 브랜드 파랑, `purple`, `green`, `gray`, `red`는 오류) 문법 표의 값 목록 한 곳이 이름을 정한다. 생략한 이동은 지금 색(`state.active`)이고, 생략한 흐름은 위 자동 배정 색이다. 색은 토큰 `color.flow.*`이고 글 상자 면과 테두리가 같은 색이다([색 역할](docs-integration.md#색-역할)).
- `set="식, 식"`은 이동이나 흐름의 점이 도형에 닿을 때 값을 바꾼다. `@도형`을 붙이면 점이 그 도형에 닿을 때, 없으면 이동이나 흐름의 도착 도형에 닿을 때 적용한다. `@도형`은 경로 위 도형이어야 하고, 경로가 그 도형을 두 번 지나면 어느 쪽인지 알 수 없어 오류다(방문 순번은 없다. 그 도형의 변화는 `on` 줄로 쓴다). 낱말을 담는 값에 `+`, `-`를 쓰면 오류다.
- 같은 순간에 적용할 식의 순서: 시각이 앞선 것, 같은 시각이면 `on` 줄이 모두 `set=`보다 앞, 같은 종류면 이동과 흐름의 선언 순서, 같은 줄이면 적은 순서다.
- 값이 바뀌는 순간 그 카드 줄과 그 값을 참조하는 줄이 `duration.value-flash` 동안 밝은 테두리(면 칠 없음)로 보이고, 값 글자는 새 글로 바뀐다. 글이 그대로면 바뀐 것이 아니다.
- 박자 단계에서도 `a -> b set=`와 `on`은 같은 규칙으로 동작해, 단계별 설명과 상태 변화를 함께 쓴다.

### 값 유지와 읽기

- 단계의 `keep="값, 값"`은 목록의 값이 단계 시작 때 앞 단계가 끝난 값에서 시작하게 한다. 목록은 쉼표로 나눈 값 이름(`value`의 id나 큐 이름)이다. 목록에 없는 값은 지금처럼 `from`으로 돌아간다. 값 이름은 안정적인 식별자라서 줄 순서와 카드 자리가 바뀌어도 같은 값을 가리킨다. 없는 이름, 참조 값(`ref`), 같은 이름의 중복은 그 줄의 오류다. 참조 값은 가리키는 값을 따르기 때문이다. 앞 단계가 없는 첫 단계의 `keep`도 오류다.
- 단계의 `set="식, 식"`은 단계가 시작할 때 값을 정하는 재설정이다. 식 꼴은 이동의 `set=`과 같고 `@도형`만 쓸 수 없다. `keep`한 값에 적으면 재설정이 앞 단계의 값보다 우선하고, `keep`하지 않은 값에 적으면 `from` 대신 그 식의 결과에서 시작한다.
- `keep`과 단계 `set=`은 값이 있는 흐름 그림(`flow`)에서만 쓴다. `keep`의 항목은 값 이름 꼴이 아니면 그 줄의 오류다.
- `keep`이 넘기는 것은 값 글자뿐이다. 카드 내용, 밝힌 도형과 선, 도형 상태, 값 줄의 밝힘은 넘기지 않는다.
- 읽기 식 `대상:=원천`은 값 `대상`을 이벤트를 처리하는 시점의 값 `원천`으로 바꾼다. 이동과 흐름의 `set=`, `on` 줄, 단계의 `set=`에 쓴다. `원천`은 값 이름이고 참조 값과 큐도 된다. `대상`은 참조 값일 수 없다. 큐는 정수만 받아서, 정수가 아닌 글을 읽어 큐에 넣으면 실행 때 `value-type` 오류다. 읽기와 쓰기의 순서는 [재생](playback.md#이벤트-순서)이 정한다.
- 읽기 식의 `원천`이 선언하지 않은 값이면 그 줄의 오류다. 단계 `set=`의 읽기는 `keep`을 반영한 시작 값을 읽는다. 낱말을 담은 값을 읽는 값도 낱말을 담는 값으로 세므로, 그 값에 `+`, `-`를 쓰면 오류다.
- `id=낱말`의 `=` 뒤는 어떤 낱말이든 값 글자로 읽어 온 원본이 있다. 그래서 읽기는 지금까지 오류였던 `:=`로 적고, 옛 원본의 값 글자는 바뀌지 않는다.

### 조건과 대기

조건은 따옴표 글 안에 쓰고, 문법은 아래와 같다.

```text
조건     = 항 { "||" 항 }
항       = 요소 { "&&" 요소 }
요소     = "!" 요소 | "(" 조건 ")" | 피연산자 비교 피연산자
비교     = "=" | "!=" | "<" | "<=" | ">" | ">="
피연산자 = 값 이름 | 숫자 | '낱말'
```

- 값 이름은 선언된 `value`나 큐이고, 숫자는 [값 형식](#값-형식)의 숫자이며, 낱말은 작은따옴표 안에 쓴 8자 이하의 공백 없는 글자(`'none'`)다. 값 이름과 같은 글자여도 따옴표가 있으면 낱말이다. 토큰 사이 공백은 있어도 없어도 된다. 조건은 200자 이하다. 평가 비용에 상한을 두기 위해서다.
- 함수 호출, 산술, 대입, 임의의 JavaScript는 문법에 없다.
- 비교의 한쪽 이상은 값 이름이어야 한다(`1=1`은 오류). `<`, `<=`, `>`, `>=`에 낱말을 쓰면 그 줄의 오류다.
- 없는 값 이름과 조건 문법 오류는 줄 번호가 붙은 오류(`syntax`)이고, 이름 오타에는 비슷한 이름을 제안한다. 값의 현재 글이 숫자인지 낱말인지는 평가할 때 정해진다. 숫자와 낱말을 비교하거나 `<` 계열에 낱말이 오면 그 조건 줄의 오류(`value-type`)다. 조용히 거짓이 되지 않는다.

| 선택 사항 | 쓰는 줄 | 뜻 |
|---|---|---|
| `when="조건"` | 이동, 흐름 | 실행 직전에 한 번 평가한다. 거짓이면 그 이동(흐름이면 그 출발)을 건너뛴다 |
| `wait="조건"` | 이동, 흐름 | 조건이 참이 될 때까지 출발을 미룬다 |
| `timeout=시간` | `wait`와 함께 | 대기를 시작한 뒤 이 시간이 지나도 풀리지 않으면 대기를 끝낸다 |
| `else=도형` | `timeout`과 함께 | 시간 초과로 끝난 점이 출발 도형에서 이 도형으로 가는 선을 지난다. 없으면 그 점은 만들지 않는다 |
| `stuck` | `wait`와 함께 | 이 대기가 끝나지 않는 것이 의도임을 알린다. `wait-stalled` 경고를 내지 않고 결과에는 그대로 남는다 |

- 구조 그림(`flow`)의 박자 이동과 흐름에서만 쓴다. `&`로 이은 이동은 각자 조건을 가진다.
- 한 줄에 `wait`와 `when`이 함께 있으면 `wait`가 풀린 뒤에 `when`을 평가한다.
- 자동 재시도는 없다. 건너뛴 이동은 다시 시도하지 않고, 기다리려면 `wait`를 쓴다.
- `timeout`, `else`, `stuck`을 `wait` 없이 쓰거나 `else`를 `timeout` 없이 쓰면 오류다.
- `else` 이동은 이동 규칙대로 선을 고르고(같은 방향 선, 없으면 거꾸로, 둘 다 없으면 오류) 글과 `tone`을 이어받는다. 시간은 선 길이로 정하고 `set`, `lost`, `when`, `wait`, `legs`는 이어받지 않는다. 흐름 줄이면 출발지마다 그 출발지에서 `else` 도형으로 가는 선을 고른다.
- 평가 시점, 해제 순서, 대기가 끝나는 때는 [재생](playback.md#조건과-대기)이 정한다.

### 사라짐과 구간 시간

- `lost=퍼센트`는 이동과 흐름 줄에서 점이 경로 전체 길이의 그 비율에서 사라지게 한다. 값은 숫자와 `%`(`0%`, `60%`, `62.5%`, `100%`)이고 0 이상 100 이하다. `%`가 없거나 범위 밖이면 오류다. 사라지는 지점의 효과는 [재생](playback.md#사라짐)이 정한다. 구조 그림에서만 쓴다.
- `legs="시간, 시간, -"`은 `track` 줄에서 경로의 선마다 이동 시간을 정한다. 항목 수는 경로의 선 수와 같고 둘 이상이어야 한다. 선이 하나인 흐름은 `time=`으로 적는다. 같은 일을 적는 방법을 하나로 두기 위해서다. 항목은 0보다 큰 시간이거나 시간을 정하지 않은 구간을 뜻하는 `-`다. `time=`과 함께 쓸 수 있고, 시간을 정하는 순서는 [재생](playback.md#구간별-이동-시간)이 정한다.
- 항목 수가 다르면 `syntax`, 지정한 시간의 합이 `time=`을 넘거나 시간이 남지 않는데 정하지 않은 구간이 있으면 `leg-time` 오류다. 박자 이동은 선이 하나라서 `legs`를 쓸 수 없다.

### 단계별 도형 상태

- 단계의 `status="도형=종류, 도형=종류"`는 그 단계 동안만 도형에 상태 알약을 붙인다. 구조 그림의 박자 단계와 흐름 단계 모두에 쓴다.

| 종류 | 알약 글자 | 기호 | 색 역할 |
|---|---|---|---|
| `ok` | `OK` | 체크 | `state.success` |
| `warn` | `WARN` | 느낌표가 든 삼각형 | `state.warning` |
| `fail` | `FAIL` | 가위표 | `state.error` |
| `wait` | `WAIT` | 점 셋 | `outline` |

- 알약은 글자와 기호를 늘 함께 그린다. 색을 구별하지 못해도 상태가 읽히게 하기 위해서다. 알약 면은 도형 면(`node`)이고 기호와 테두리는 종류의 색, 글자는 `fg`다. 기호와 테두리는 도형 면과 그림 바탕, 그룹 면 위에서 그래픽 대비 3, 글자는 `fg` 4.5 이상이다([색 역할](docs-integration.md#색-역할)). `wait`는 구분을 위해 중립색을 쓰는데 `border`는 `node` 위 대비가 라이트 1.27, 다크 1.08이라 기준에 못 미쳐 대비 3을 보장하는 `outline`을 쓴다.
- 알약은 도형 이름과 글자, 다른 도형, 선 라벨, 그룹 제목을 가리지 않는다. 가리면 [그림 검사](figure-check.md) 2번이 상태를 적은 단계 줄의 오류로 알린다. 이동 글 상자도 상태 알약을 가리지 않는 자리를 고른다.
- 알약은 도형 오른쪽 위 모서리에 걸쳐 그려서 도형 크기와 배치를 바꾸지 않는다.
- 도형 상자는 그 도형이 어느 단계에서든 보일 가장 큰 카드(`show`, `value`)에 맞춰 늘 같은 크기이므로, 카드를 한 단계에만 넣은 도형은 카드 없는 같은 종류의 도형보다 커 보인다. 대기 중 같은 일시 표시를 카드로 적으면 이 크기 차이가 생기므로, 크기를 같게 두려면 상태 알약(`status`)으로 적는다.
- 도형은 `box`, `external`, `store`, `person`, `queue`, `decision`이다. 그룹, 격자, 없는 이름, 한 단계 안에서 같은 도형의 중복, 모르는 종류는 오류다.
- 상태는 그 단계에서만 적용하고 다음 단계는 도형의 선언 상태로 돌아간다. `keep`은 상태를 넘기지 않는다. 멈춘 SVG는 한 단계의 상태를 보이지 않으므로 알약을 그리지 않는다.

### 새 기능의 호환과 진단 code

- 값 유지와 읽기, 사라짐과 구간 시간, 조건과 대기의 문장, 선택 사항, 낱말은 모두 판 1이고 문법 표(`src/source/grammar.js`)가 정본이다. [호환 규칙](#호환-규칙)의 생성 표에 모든 항목이 있다.
- 새 기능을 하나도 쓰지 않는 원본은 값 초기화, 이벤트 순서, 출력, 비용이 그대로다([재생](playback.md#기존-원본과의-호환)).
- 새 낱말은 지금까지 오류였던 꼴(`:=`, 새 선택 사항 키)뿐이라 옛 원본이 새 뜻으로 바뀌지 않는다.
- 새 진단 `code`는 `value-type`(실행 때 값 종류가 맞지 않음), `leg-time`(구간 시간이 맞지 않음), `wait-stalled`(끝나지 않는 대기, 경고), `budget-exceeded`(이벤트 예산 초과)다. 나머지 오류는 `syntax`와 `time-limit`을 쓴다.

### 글 줄 나누기

- 도형 이름, 부제, 카드 글은 도형 너비 상한(토큰 `size.node.max-width`)에서 띄어쓰기 자리로 줄을 나눈다. 띄어쓰기 없는 긴 낱말은 글자 단위로 나눈다. 그래서 글이 도형을 넘는 일은 원본 오류가 아니다.

### 오류와 경고

- 형식: `{파일}:{줄}: {무엇이 틀렸나}. {고치는 방법}`. 경고는 `{파일}:{줄}: warning: {메시지}`, 폐기는 `{파일}:{줄}: deprecated: {메시지}`다. 영어로 쓴다(code-style 메시지 규칙). 진단의 종류와 모양은 [호환 규칙](#호환-규칙)이 정한다.
- 이름 오류에는 선언된 이름 목록을 알파벳순으로 붙이고, 편집 거리가 2 이하인 이름이 있으면 `Did you mean "{이름}"?`을 붙인다.
- 오류가 하나라도 있으면 파일을 쓰지 않는다. 문법 오류, 글꼴에 없는 글자, `data` 읽기 오류는 한 번에 모두 알린다. 파일이 비었거나 첫 줄의 그림 종류를 모르면 거기서 멈춘다. 다음 줄을 읽을 규칙이 없기 때문이다.
- [그림 검사](figure-check.md)는 배치가 끝나야 돌므로, 원본 오류가 없을 때만 그 오류를 알린다.
- 생성 예산을 넘으면 `budget-exceeded` 오류다. 필요한 양, 지금 한도, 올리는 방법(`--budget 이름=값`, Action 입력 `budget`)을 적고 파일을 쓰기 전에 끝난다. 격자 예산의 이름과 기본 한도는 [칸 격자](grid.md#예산)가, 이벤트 예산(`events`, `chain`)은 [재생](playback.md#이벤트-예산)이 정한다. `--budget` 값이 틀리면 그림을 만들기 전에 사용법 오류(종료 2)다.
- 경고와 폐기는 파일을 쓰고 표준 오류에 남긴다. `--strict`면 경고도 실패이고, `--no-deprecated`면 폐기도 실패다.
- 문법 밖의 화면 오류(겹침, 넘침)는 [그림 검사](figure-check.md)가 같은 형식으로 알린다.

### 호환 규칙

이미 쓴 `.dap`는 기능이 늘어 문법이 바뀌어도 깨지지 않는다. 낱말, 선택 사항, 값 목록, 기본값, 판, 폐기 정보는 문법 표(`src/source/grammar.js`) 한 곳에만 있다. 파서, 검증, 오류 메시지, `migrate`, 이 절의 표가 모두 그 표를 읽는다.

- 판: 첫 문장에 `daphnis 1`을 쓰면 그 판으로 읽고, 없으면 판 1이다. 이 도구가 모르는 판 번호는 오류(`unsupported-version`)이고 지원하는 판을 알린다. 판 번호는 옛 원본을 깨는 변경에만 올리고, 같은 판 안에서는 추가만 한다. 파일의 판보다 높은 `since`의 항목을 쓰면 오류(`version-required`)다.
- 추가만: 새 낱말과 새 선택 사항은 생략할 수 있고, 생략한 기본값이 옛 뜻을 그대로 지킨다. `series`의 `role`이 그 예다. 생략하면 선언 순서대로 역할을 받고(첫 계열 main, 둘째 compare, 덤벨은 시작점이 compare라 첫 계열 compare), 하나만 적으면 다른 계열이 남은 역할을 받는다. 둘 다 적었을 때만 main 하나, compare 하나인지 본다.
- 폐기: 옛 형식은 오류로 바꾸지 않는다. 표의 `deprecated: { since, replace }`가 새 이름이고, 낱말, 선택 사항 키, 값, 그림 종류 어디에 있든 같은 규칙으로 새 이름으로 바꿔 읽어 그림이 같다. `deprecated` 진단과 `fix`를 내고, 값 없는 낱말(flag)은 이름 자리의 낱말과 가를 수 없어 별칭을 두지 않는다.
- 진단은 세 종류다.

| 종류 | 뜻 | 파일 | 실패 조건 |
|---|---|---|---|
| `error` | 그릴 수 없다 | 쓰지 않음 | 늘 |
| `warning` | 품질 문제 | 씀 | `--strict` |
| `deprecated` | 옛 형식이고 계속 동작한다 | 씀 | `--no-deprecated` |

- 진단 하나의 모양은 `{ severity, code, line, column, message, fix? }`이고 모든 진단이 쓴다. `--json`은 여기에 `file`을 더하고, 옛 필드 `lines`, `check`, `level`도 함께 내(폐기, 다음 판까지) 진단마다 한 줄을 표준 출력에 쓴다. `code`는 `syntax`(문법), `check-1`~`check-14`([그림 검사](figure-check.md) 번호), `time-limit`(시간 상한 초과), `time-precision`(출발 시각이 늘지 않는 시간 정밀도), `value-type`, `leg-time`, `wait-stalled`, `budget-exceeded`(생성 예산 초과, [새 기능의 호환과 진단 code](#새-기능의-호환과-진단-code), [칸 격자](grid.md#예산), [이벤트 예산](playback.md#이벤트-예산)), `deprecated-statement`, `deprecated-option`, `deprecated-value`, `deprecated-kind`, `deprecated-extension`(옛 확장자 파일), `deprecated-fence`(마크다운 옛 울타리), `unsupported-version`, `invalid-version`, `version-required`, `layout`(배치 실패, [배치](layout.md#배치-실패)), `io`, `internal`이다. `column`은 줄 안 1부터 센 자리다. `fix`는 `{ line, column, length, text }`로, 그 줄의 `column`부터 `length`글자를 `text`로 바꾼다.
- `daphnis migrate 원본... [--write]`는 진단의 `fix`를 그대로 적용한다. 기본은 바뀔 줄만 `-`, `+`로 보여 주고, `--write`일 때만 파일을 고친다. 원본에 오류가 있거나 고친 글에 오류나 폐기가 남으면 아무것도 쓰지 않는다. 새 폐기 항목은 표에 `replace`만 적으면 된다.

- CLI 출력과 옵션도 같은 규칙이다. 명령과 옵션 이름, 종료 코드, `--json` 필드는 추가만 하고, 옛 `--json` 필드(`lines`, `check`, `level`)는 `src/diagnostics.js` 표에 deprecated로 표시해 다음 판까지 함께 낸다.
- 옛 이름: 이 도구의 옛 이름 `mutoscope`로 쓴 것은 한 판 동안 계속 받고 폐기 안내를 낸다. 안내는 `deprecated` 진단이라 종료 코드를 바꾸지 않는다. 옛 명령 `mutoscope`는 `daphnis`와 같은 진입점의 별칭 bin이고 실행할 때마다 표준 오류에 안내를 쓴다(표준 출력과 `--json`은 그대로). 첫 문장의 `mutoscope 1`은 `daphnis 1`로 읽고 `fix`를 낸다(`migrate`가 고친다). 옛 확장자 `.muto` 파일은 읽고 `deprecated-extension`을 입력 파일마다 한 번 낸다(`render`, `check`, `migrate` 모두 같다. 새 확장자 파일에는 내지 않는다). 마크다운의 ` ```muto ` 울타리는 읽고 `deprecated-fence`를 내며, 이미지 줄의 옛 표시 `<!-- muto -->`와 SVG의 옛 표시 `<!-- mutoscope md … -->`는 이 도구가 만든 것으로 알아보고 새 표시로 다시 쓴다. 목록 쪽 테마 저장 키 `mutoscope-theme`은 새 키 `daphnis-theme`이 없을 때만 읽는다.
- 고정 묶음: `test/fixtures/compat/v1/`는 판 1 원본의 고정 묶음이다. 폐기 전 예제 원본(`main-*`), 옛 형식 사례(`old-*`), 모든 낱말과 선택 사항을 한 번씩 쓰는 파일(`all-*`)이 들어 있고, 앞으로 고치지 않는다. `test/compat.test.js`는 모든 파일이 오류 없이 읽히고 구조 요약(도형, 선, 박자, 계열 수)이 스냅샷과 같은지, 문법 표의 모든 항목이 묶음에 쓰였는지 본다. 새 판이 생기면 `v2` 폴더를 더한다.
- 기능 추가 체크리스트: 표에 항목을 더한다(`since`는 현재 판). 생략했을 때의 기본값이 옛 뜻을 지키는지 확인한다. 항목을 쓰는 `all-*` 파일을 묶음에 더한다(있는 파일은 고치지 않는다). 옛 형식을 없애면 표에 `deprecated.replace`를 적는다. `npm run grammar`로 아래 문법 표를 다시 쓴다.

다음 표는 문법 표에서 만든다. 손으로 고치지 않고 `npm run grammar`로 다시 쓰며, 문법 표와 어긋나면 테스트가 실패한다. 선택 사항의 앞 이름은 쓰이는 문장이다(`graph`는 `show id graph`, `column`은 테이블 열 줄).

<!-- grammar-table:start -->
| 부분 | 낱말 | 그림 종류 | 판 | 폐기 |
|---|---|---|---|---|
| 판 표기 | `daphnis` | 모든 그림 | 판 1 |  |
| 판 표기 | `mutoscope` | 모든 그림 | 판 1 | 폐기(판 1), `daphnis`로 읽는다 |
| 머리 | `title`, `subtitle`, `speed` | 모든 그림 | 판 1 |  |
| 머리 | `aspect`, `width` | flow, state, data | 판 1 |  |
| 머리 | `x`, `y`, `scale`, `zero`, `decimals` | chart | 판 1 |  |
| 선언 | `person`, `box`, `external`, `store` | flow, sequence | 판 1 |  |
| 선언 | `decision`, `queue`, `grid`, `icons`, `item`, `value`, `on node id+N`, `gap` | flow | 판 1 |  |
| 선언 | `state`, `start`, `final` | state | 판 1 |  |
| 선언 | `group`, `a -> b` | flow, state | 판 1 |  |
| 선언 | `table` | data | 판 1 |  |
| 선언 | `series`, `rule`, `missing`, `data`, `row`, `point`, `cell`, `link` | chart | 판 1 |  |
| 시간 흐름 | `a -> b` | flow, sequence, state, data | 판 1 |  |
| 시간 흐름 | `track a, b -> c -> d`, `대상:=원천` | flow | 판 1 |  |
| 시간 흐름 | `step`, `say`, `wait` | 모든 그림 | 판 1 |  |
| 시간 흐름 | `show`, `clear` | flow, data | 판 1 |  |
| 시간 흐름 | `light` | flow, state, data, chart | 판 1 |  |
| 시간 흐름 | `note` | sequence | 판 1 |  |
| 시간 흐름 | `reveal` | chart | 판 1 |  |

| 선택 사항 | 값 | 판 | 폐기 |
|---|---|---|---|
| `group.direction` | `right`, `down` | 판 1 |  |
| `group.border` | `solid`, `dashed` | 판 1 |  |
| `group.badge` | 글, 최대 8자 | 판 1 |  |
| `group.icon` | 이름 또는 세트:이름 | 판 1 |  |
| `group.fill` | `red`, `amber`, `green`, `teal`, `navy`, `purple`, `pink`, `gray`, `sky` | 판 1 |  |
| `group.stroke` | `red`, `amber`, `green`, `teal`, `navy`, `purple`, `pink`, `gray`, `sky` | 판 1 |  |
| `node.badge` | 글, 최대 8자 | 판 1 |  |
| `node.icon` | 이름 또는 세트:이름 | 판 1 |  |
| `node.fill` | `red`, `amber`, `green`, `teal`, `navy`, `purple`, `pink`, `gray`, `sky` | 판 1 |  |
| `node.stroke` | `red`, `amber`, `green`, `teal`, `navy`, `purple`, `pink`, `gray`, `sky` | 판 1 |  |
| `box.count` | 2 이상 정수 | 판 1 |  |
| `queue.slots` | 1 이상 32 이하 정수 | 판 1 |  |
| `queue.from` | 0 이상 slots 이하 정수 | 판 1 |  |
| `edge.no` | 양의 정수 | 판 1 |  |
| `step.for` | 시간 | 판 1 |  |
| `step.status` | `ok`, `warn`, `fail`, `wait` | 판 1 |  |
| `step.keep` | 값 이름 목록 | 판 1 |  |
| `step.set` | 글 | 판 1 |  |
| `hop.time` | 시간 | 판 1 |  |
| `hop.tone` | `brand`, `purple`, `green`, `gray`, `red` | 판 1 |  |
| `hop.set` | 글 | 판 1 |  |
| `hop.lost` | 0 이상 100 이하 퍼센트 | 판 1 |  |
| `hop.when` | 조건 글 | 판 1 |  |
| `hop.wait` | 조건 글 | 판 1 |  |
| `hop.timeout` | 시간 | 판 1 |  |
| `hop.else` | 도형 이름 | 판 1 |  |
| `hop.stuck` | 값 없음(낱말만) | 판 1 |  |
| `track.at` | 시간(0 가능) | 판 1 |  |
| `track.every` | 시간 | 판 1 |  |
| `track.time` | 시간 | 판 1 |  |
| `track.tone` | `brand`, `purple`, `green`, `gray`, `red` | 판 1 |  |
| `track.set` | 글 | 판 1 |  |
| `track.lost` | 0 이상 100 이하 퍼센트 | 판 1 |  |
| `track.when` | 조건 글 | 판 1 |  |
| `track.wait` | 조건 글 | 판 1 |  |
| `track.timeout` | 시간 | 판 1 |  |
| `track.else` | 도형 이름 | 판 1 |  |
| `track.stuck` | 값 없음(낱말만) | 판 1 |  |
| `track.legs` | 시간 또는 -의 목록 | 판 1 |  |
| `value.on` | 도형 이름 | 판 1 |  |
| `value.from` | 숫자 또는 낱말 | 판 1 |  |
| `value.ref` | 값 이름 | 판 1 |  |
| `hop.dashed` | 값 없음(낱말만) | 판 1 |  |
| `edge.quiet` | 값 없음(낱말만) | 판 1 |  |
| `edge.dashed` | 값 없음(낱말만) | 판 1 |  |
| `edge.head` | `end`, `both`, `none` | 판 1 |  |
| `box.shape` | `rect`, `circle`, `tile` | 판 1 |  |
| `show.tag` | 글 | 판 1 |  |
| `show.tone` | `brand`, `purple`, `green`, `gray`, `red` | 판 1 |  |
| `show.card` | `red`, `amber`, `green`, `teal`, `navy`, `purple`, `pink`, `gray`, `sky` | 판 1 |  |
| `show.meta` | 글 | 판 1 |  |
| `show.mark` | 글, 최대 8자 | 판 1 |  |
| `show.mono` | 값 없음(낱말만) | 판 1 |  |
| `graph.lit` | 글 | 판 1 |  |
| `series.role` | `main`, `compare` | 판 1 |  |
| `series.key` | 글 | 판 1 |  |
| `point.series` | 계열 이름 | 판 1 |  |
| `grid.rows` | 양의 정수 | 판 1 |  |
| `grid.cols` | 양의 정수 | 판 1 |  |
| `item.row` | 0 이상 정수 | 판 1 |  |
| `item.col` | 0 이상 정수 | 판 1 |  |
| `item.rows` | 양의 정수 | 판 1 |  |
| `item.cols` | 양의 정수 | 판 1 |  |
| `gap.count` | 양의 정수 | 판 1 |  |
| `light.x` | 숫자 | 판 1 |  |
| `column.pk` | 값 없음(낱말만) | 판 1 |  |
| `column.unique` | 값 없음(낱말만) | 판 1 |  |
| `column.fk` | 테이블.열 | 판 1 |  |

| 값 목록 | 쓰는 곳 | 값 | 기본값 | 옛 값 → 읽는 값 |
|---|---|---|---|---|
| `direction` | `group.direction`, `flow 뒤`, `state 뒤`, `data 뒤` | `right`, `down` | `right` | 없음 |
| `scale` | `scale 값` | `linear`, `log` | `linear` | 없음 |
| `zero` | `zero 값` | `on`, `off` | `on` | 없음 |
| `chartType` | `chart 뒤` | `bar`, `dumbbell`, `box`, `scatter`, `line`, `difference`, `heatmap` | 없음 | 없음 |
| `tone` | `hop.tone`, `track.tone`, `show.tone` | `brand`, `purple`, `green`, `gray`, `red` | 없음 | `teal` → `purple`, `blue` → `brand`, `orange` → `purple` |
| `role` | `series.role` | `main`, `compare` | 선언 순서대로 main, compare(`dumbbell`은 compare, main) | 없음 |
| `paint` | `group.fill`, `group.stroke`, `node.fill`, `node.stroke`, `show.card` | `red`, `amber`, `green`, `teal`, `navy`, `purple`, `pink`, `gray`, `sky` | 없음 | 없음 |
| `head` | `edge.head` | `end`, `both`, `none` | `end` | 없음 |
| `shape` | `box.shape` | `rect`, `circle`, `tile` | `rect` | 없음 |
| `width` | `width 값` | `standard`, `wide` | `standard` | 없음 |
| `border` | `group.border` | `solid`, `dashed` | `solid` | 없음 |
| `status` | `step.status` | `ok`, `warn`, `fail`, `wait` | 없음 | 없음 |
<!-- grammar-table:end -->

### 요구사항

| 요구사항 | 검증 계획 |
|---|---|
| 문서의 모든 예시 원본이 오류와 경고 없이 읽힌다. | `test/grammar.test.js`의 `docExamples_every_design_doc_example_builds_without_errors_or_warnings`. 문서의 예시 원본을 뽑아 strict로 읽는다. 값 유지와 읽기, 잠금, 교착 예시도 같은 시험 대상이다 |
| 조건식, `keep`, `lost`, `legs`, `status`, `else`의 틀린 값과 짝이 맞지 않는 선택 사항을 줄 번호와 함께 알린다. | 규칙마다 원본 하나로 줄 번호와 `code`(`syntax`, `value-type`, `leg-time`) 확인. 없는 값과 `1=1`, 낱말에 `<`, 첫 단계 `keep`, 항목 수가 다른 `legs`, 범위 밖 `lost`를 포함. 담당: [#118](https://github.com/woonyong-choi/daphnis/issues/118), [#119](https://github.com/woonyong-choi/daphnis/issues/119), [#120](https://github.com/woonyong-choi/daphnis/issues/120) #119 몫은 `test/when-wait.test.js`의 `buildFigure_reports_condition_syntax_errors_with_the_line_and_the_runtime_type_error_as_value_type`(`syntax`와 `value-type`, 줄 번호), `buildFigure_conditions_belong_to_flow_figures_only`와 `test/condition.test.js`(조건식 문법)가 확인한다. #120 몫은 `test/lost-status-legs.test.js`의 `parseFigure_lost_accepts_0_to_100_percent_and_rejects_a_missing_percent_sign_or_a_value_out_of_range`, `parseFigure_lost_and_status_belong_to_flow_figures_only`, `parseFigure_legs_needs_one_entry_per_line_and_at_least_two_lines`, `parseFigure_legs_sum_against_time_reports_leg_time_on_the_track_line_at_the_boundaries`, `parseFigure_legs_entries_and_their_sum_over_one_hour_report_time_limit`, `buildFigure_legs_distance_times_over_one_hour_end_with_time_limit_on_the_track_line`, `parseFigure_status_rejects_unknown_kinds_duplicates_unknown_names_and_non_shape_targets`. #118 몫(`keep`, `:=`, 단계 `set=`)은 `test/value-keep.test.js`의 `buildFigure_each_value_keep_and_read_mistake_is_a_syntax_error_on_its_own_line`, `buildFigure_keep_and_step_set_in_a_figure_without_values_are_errors`, `buildFigure_reading_a_non_integer_text_into_a_queue_is_a_value_type_error_at_run_time_on_that_line`, `main_render_with_a_keep_or_read_error_exits_1_with_the_line_and_code_and_writes_no_file`가 확인한다 |
| 새 기능을 쓰지 않는 원본의 시간표와 출력이 바뀌지 않는다. | 모든 예제와 `test/fixtures/compat/v1/`의 기존 파일을 이 설계 이전 출력과 바이트 비교. 새 낱말을 한 번씩 쓰는 `all-*` 파일을 묶음에 더해 읽힘 확인. 담당: [#118](https://github.com/woonyong-choi/daphnis/issues/118), [#119](https://github.com/woonyong-choi/daphnis/issues/119), [#120](https://github.com/woonyong-choi/daphnis/issues/120) #120은 `all-lost-status-legs.dap`를 묶음에 더해 `compat_v1_every_fixture_builds_without_errors_and_matches_the_structure_snapshot`와 `compat_v1_covers_every_word_option_and_value_in_the_grammar_table`가 읽힘과 문법 표 사용을 본다. #118 몫은 `test/compat.test.js`의 `compat_v1_every_fixture_builds_without_errors_and_matches_the_structure_snapshot`(`all-value-keep.dap`)와 `compat_v1_covers_every_word_option_and_value_in_the_grammar_table`이 확인한다 |
| 세 부분 순서, 낱말 공백, 이름 형식, 값 형식을 어긴 줄을 줄 번호와 함께 알린다. | `test/grammar.test.js`의 `parseFigure_malformed_source_reports_the_line_and_the_rule`. 규칙마다 원본 하나로 줄 번호와 오류 확인 |
| 선언하지 않은 이름과 비슷한 이름을 함께 알린다. | `test/grammar.test.js`의 `parseFigure_unknown_name_suggests_the_nearest_declared_name`. `cdex`를 쓴 원본이 `codex`를 제안하는지 확인 |
| 같은 방향 선 두 개, 자기 자신으로 가는 선, 그룹과 안 도형 사이 선을 막는다. | `test/grammar.test.js`의 `parseFigure_malformed_source_reports_the_line_and_the_rule`(선 행). 원본마다 오류 확인 |
| 칸 선 끝, `head`, `shape`의 틀린 값(gap, 없는 칸, 같은 칸, 라벨 있는 두 칸 선, 값 목록 밖)을 줄 번호와 함께 알린다. | `test/grammar.test.js`의 `parseFigure_malformed_source_reports_the_line_and_the_rule`(격자, 선, 도형 행)과 `parseFigure_valid_forms_read_without_errors`(칸 선, 양끝 표식 행) |
| 번호, 배지, 아이콘, 복제 개수의 틀린 값을 줄 번호와 함께 알린다. | `test/grammar.test.js`의 `parseFigure_malformed_source_reports_the_line_and_the_rule`(번호, 배지, 아이콘, 개수 행)과 `parseFigure_valid_forms_read_without_errors` |
| 이동은 같은 방향 선을 먼저, 없으면 반대 방향 선을 거꾸로 따라간다. | `test/grammar.test.js`의 `parseFigure_hop_follows_the_same_direction_edge_first_then_the_reverse_one`. 두 경우의 이동 방향 확인 |
| 카드는 도착 규칙대로 바뀐다. | `test/motion.test.js`의 `buildTimeline_card_changes_at_the_latest_arrival_and_the_source_card_at_beat_start`. `&`로 다른 시간에 도착하는 두 이동의 카드 바뀌는 시점 확인 |
| 오류를 모두 모아 알리고 파일을 쓰지 않는다. | `test/grammar.test.js`의 `parseFigure_all_errors_are_reported_together`(오류 세 개 원본에서 메시지 세 줄), `test/cli.test.js`의 `main_render_with_an_error_writes_no_file_and_reports_the_line`(결과 파일 없음) |
| 옛 형식 원본이 오류 없이 읽히고 폐기 진단과 fix를 낸다. | `test/compat.test.js`의 `compat_v1_every_fixture_builds_without_errors_and_matches_the_structure_snapshot`, `compat_v1_old_forms_report_only_deprecated_never_errors_or_warnings`. `test/fixtures/compat/v1/`의 원본으로 오류 0, 구조 요약 스냅샷, 폐기 진단 확인 |
| 문법 표와 이 문서의 표가 같다. | `test/grammar.test.js`의 `grammarDoc_figure_syntax_tables_equal_the_tables_made_from_the_grammar`. 표에서 만든 글과 문서 구간을 비교 |
| `migrate`가 고친 원본에 오류와 폐기가 남지 않는다. | `test/compat.test.js`의 `cli_migrate_previews_a_diff_and_write_fixes_the_file_so_check_reports_nothing`. 옛 형식 원본에 `migrate --write` 뒤 `check --strict --no-deprecated` |

## 단점

- D2 원본을 그대로 쓸 수 없다. 기존 그림은 새 문법으로 다시 쓴다.
- 도형 크기와 색을 원본에서 정할 수 없다. 특별한 강조가 필요한 그림은 표현할 수 없다.

## 대안

- D2 문법 유지: 배치 모델이 어긋나 버렸다. [결정 기록](../decisions/2026-10-01-own-syntax-and-layout.md)
- 들여쓰기로 그룹 표시: 복사해 붙일 때 들여쓰기가 깨지면 뜻이 바뀌어 버렸다.
- 따옴표 없는 글 값 허용(`tag=you`): 같은 값을 두 방식으로 적게 되어 버렸다.
