# 그림 문법

| 항목 | 값 |
|---|---|
| 상태 | 구현 |
| 관련 결정 | [그림 문법과 배치를 직접 맡고 D2 호환을 버린다](../decisions/2026-10-01-own-syntax-and-layout.md) |

## 요약

그림 문법은 `.muto` 파일 하나에 그림 하나를 적는 줄 단위 문법이다. 첫 문장에 그림 종류를 적고, 도형과 선을 선언한 뒤, `step` 줄부터 움직임을 적는다. 사람이 쓰는 글은 모두 따옴표 안에, 이름과 낱말은 모두 따옴표 밖에 둔다. 같은 일을 적는 방법은 하나뿐이다.

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

1. 사용자가 `mutoscope render saturn.muto`를 실행한다.
2. `system` 안 도형은 위에서 아래로, 바깥 도형은 왼쪽에서 오른쪽으로 놓인다.
3. 첫 박자에 점이 `user`에서 `tui`로 가고, 점이 닿을 때 `tui` 카드에 `YOU` 태그 줄이 나타난다.
4. `engine -> db` 선은 `quiet`라서 그 선을 처음 지나는 박자부터 보인다.

### 오타 알아채기

1. AI가 위 원본의 24번째 줄을 `engine -> cdex "turn" time=3s`로 적는다.
2. 명령이 `saturn.muto:24: unknown node "cdex". Did you mean "codex"? Declared: cli, codex, db, engine, system, tui, user`를 내고 실패한다.
3. AI가 이름을 고친다.

## 상세 설계

### 줄과 낱말

- 한 줄에 문장 하나다. 빈 줄은 무시한다. 들여쓰기는 읽기용이다.
- `#`부터 줄 끝까지는 주석이다. 따옴표 안의 `#`는 글자다.
- 따옴표 밖의 공백, 탭, 줄 끝 CR(Windows 줄바꿈), 파일 앞 BOM, 유니코드 공백은 모두 공백으로 읽는다. 편집기 설정과 상관없이 같은 원본이 같은 그림이 되게 하기 위해서다.
- 낱말은 공백 하나 이상으로 나눈다. `->`, `&`, `{`, `}`는 앞뒤에 공백이 있어야 하는 낱말이다. `a->b`는 오류다.
- `{`는 그룹과 테이블 줄의 마지막 낱말이고, `}`는 혼자 한 줄이다. 안에 아무것도 없는 그룹과 테이블은 오류다.
- 글은 큰따옴표 안에 쓴다. 빈 글(`""`, 공백만 있는 글)은 오류다. 이름 없는 도형이나 빈 항목을 막기 위해서다. 따옴표 안의 `\"`는 따옴표, `\\`는 역슬래시다. 그 밖의 역슬래시와 줄바꿈은 오류다.
- 글 안에서 백틱(`` ` ``)으로 감싼 부분은 코드다. 마크다운처럼 백틱은 그리지 않고 그 구간만 고정폭 글꼴로 그린다(예: ``"`session/start` 요청"``). 코드 안 한글은 Noto Sans KR로 그린다. 도형 이름, 부제, 그룹 제목, 카드 글, 선 라벨, 노트, 단계 이름, 설명, 차트 글에 쓸 수 있다. 백틱 짝이 맞지 않으면 그 줄의 오류다. 백틱 글자 자체를 그릴 방법은 없다.
- 선택 사항은 `키=값` 한 낱말이다. `=` 앞뒤 공백은 오류다. 선택 사항의 순서는 자유다. 같은 키를 두 번 쓰면 오류다.
- 값이 없는 선택 사항(`quiet`, `dashed`, `mono`, `pk`, `unique`)은 정해진 낱말만 쓴다. 이름 자리의 `quiet` 같은 낱말은 이름이다.

### 이름

- 이름(id)은 영어 소문자로 시작하고 영어 소문자, 숫자, `-`만 쓴다. `-`는 낱말 사이에 하나씩만 온다(`a-`, `a--b`는 오류). 테이블 이름은 `-` 대신 `_`를 같은 규칙으로 쓴다. 열 이름은 영문자로 시작하고 영문자(대소문자), 숫자, `_`를 쓴다([그림 종류](figure-kinds.md)). 이름 오류 메시지는 그 이름이 따를 규칙의 이음 글자(`-` 또는 `_`)를 적는다.
- 이름 오류로 버린 선언의 이름을 가리키는 줄에는 `unknown node` 오류를 덧붙이지 않는다. 그 선언이 있던 그룹에도 `group is empty` 오류를 덧붙이지 않는다. 원인이 이름 오류 하나이기 때문이다.
- 파일 안에서 도형, 그룹, 상태, 테이블, 계열 이름은 서로 겹치지 않는다.
- 차트가 아닌 그림에 도형(순서 그림은 참여자)이 하나도 없으면 오류다.
- `테이블.열` 꼴 이름은 데이터 관계 그림에서만 쓴다.
- 이름 자리에서는 예약어 검사를 하지 않는다. `box data "데이터"`, `box step "단계"`, `box q1 "1분기"`, `table row "행" {`처럼 문장 낱말, 선택 사항 키, 값 없는 선택 사항 낱말(`quiet`, `dashed`, `mono`, `pk`, `unique`)을 모두 이름으로 쓸 수 있다. 이름 자리는 도형, 그룹, 상태, 테이블, 계열 선언의 이름, 선과 이동 줄의 양 끝, `show`, `clear`, `note`, `light`, `start`, `final`, `reveal`의 대상이다.
- 문장 종류는 첫 낱말로 정하고, 둘째 낱말이 `->`인 줄은 첫 낱말이 문장 낱말이어도 선 줄(시간 흐름 안에서는 이동 줄)로 읽는다. 그래서 `step -> c`는 `step`이라는 이름에서 `c`로 가는 선이다. 이름이 낱말마다 정해진 자리에만 오고, 값 없는 선택 사항은 그 자리 뒤에 오므로 해석이 갈리는 자리가 없다. 막은 자리는 하나다. 선 차트의 행은 `x=`를 가로 값에 쓰므로 계열 이름을 `x`로 지을 수 없다.
- 테이블 `{`, `}` 안의 줄은 첫 낱말을 늘 열 이름으로 읽는다(`state varchar`도 열이다). 위치로 뜻이 정해지는 낱말(`graph`, `at`, `right`, `down`, `linear`, `log`, `bar` 같은 종류 이름)도 이름으로 쓸 수 있다.

### 값 형식

선택 사항의 키와 값 목록은 [문법 표](#호환-규칙)가 정본이다. 차트 행의 값은 아래와 같다.

| 키 | 값 |
|---|---|
| 계열 이름, `x`, `y`, `min`, `q1`, `median`, `q3`, `max`, `계열.low`, `계열.high` | 숫자. 막대 계열 값만 빠진 값 `-`도 된다 |

- 시간은 `900ms`나 `2s`이고 0보다 크다. 단위 없는 숫자는 시간이 아니다.
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
| `mutoscope 1` | 문법 판. 파일의 첫 문장일 때만 쓰고 그림 종류 문장 앞에 둔다([호환 규칙](#호환-규칙)) | 판 1 |
| `title "글"` | 그림 제목. SVG `<title>`, 차트는 그림 안 제목, 그 밖 그림은 목록 쪽 머리 제목 | 파일 이름 |
| `subtitle "글"` | 그림 아래 한 줄 설명 | 없음 |
| `speed 3s` | 점이 기준 길이 `size.packet.hop-ref`의 선을 지나는 시간. 선 길이에 비례해 이동 시간이 정해져 모든 이동이 같은 속도로 보인다(아래 이동 시간). 차트에서는 계열이 자라는 시간([차트](charts.md)) | 토큰 `duration.hop`과 `size.packet.hop-ref`, 차트는 `duration.reveal` |
| `aspect 1.6` | 목표 가로세로 비율. `flow`, `state`, `data`에서만, 그룹이 있어도 된다. [배치](layout.md) | 없음(캔버스 폭보다 넓으면 도구가 자동으로 접는다) |

### 구조 그림 선언

| 줄 | 뜻 |
|---|---|
| `person id "이름"` | 사람 |
| `box id "이름" ["부제"]` | 구성 요소, 모듈 |
| `external id "이름" ["부제"]` | 외부 프로그램, 외부 서비스. 점선 테두리 |
| `store id "이름" ["부제"]` | 파일, 데이터베이스. 원통 |
| `decision id "질문"` | 갈림길. 마름모 |
| `group id "이름" [direction=right\|down] {`, `}` | 그룹. 두 줄 사이에 도형과 그룹을 둔다 |
| `a -> b ["라벨"] [quiet] [dashed]` | 선 |

- 도형 크기, 색, 굵기, 아이콘은 적지 않는다. 크기는 글과 카드 내용으로, 모양과 색은 토큰으로 정한다.
- 선의 양 끝은 선언된 도형이나 그룹이다. 선은 도형 선언보다 앞에 와도 된다. 파일을 다 읽은 뒤 이름을 확인한다.
- 같은 방향의 두 끝 사이 선은 하나다. `a -> b`가 둘이면 오류다. `a -> b`와 `b -> a`는 함께 둘 수 있다.
- 거꾸로 적는 `<-`는 없다. 요청이 가는 쪽으로 적는다.
- 자기 자신으로 가는 선과, 그룹과 그 안 모든 하위 도형과 그룹 사이의 선은 오류다. 예외로 상태 그림의 자기 전이는 쓸 수 있다([그림 종류](figure-kinds.md)).
- 그룹 안의 도형을 바깥에서 부를 때도 이름만 쓴다. 이름이 파일 전체에서 하나이기 때문이다.
- `dashed` 선은 비동기 흐름이나 선택적 흐름이다. 점선 테두리 도형(`external`)과 뜻이 다르다.
- `quiet` 선은 그 선을 처음 지나는 박자부터 그 단계 끝까지만 보인다. 시간 흐름이 없거나, 시간 흐름에서 한 번도 지나지 않는 `quiet` 선은 [그림 검사](figure-check.md) 11번 경고가 난다.

### 시간 흐름

시간 흐름은 단계(step)의 목록이고, 단계는 박자(beat)의 목록이다. 탭 하나가 단계 하나다.

| 줄 | 뜻 |
|---|---|
| `step "이름" ["설명"]` | 단계 시작 |
| `a -> b ["실어 보낼 글"] [time=3s]` | 이동 박자. 점 하나가 선 하나를 지난다 |
| `a -> b "글" & c -> d time=2s` | 한 박자 안의 여러 이동 |
| `show id "글" [tag="태그"] [tone=teal] [meta="덧붙임"] [mark="표시"] [mono]` | 카드 줄 하나를 바로 앞 박자에 더한다 |
| `show id graph "가 -> 나; 가 -> 다" [lit="가, 나"]` | 카드에 작은 관계 그래프 줄 하나를 더한다 |
| `clear id` | 바로 앞 박자에서 카드를 비운다 |
| `light id id` | 점 없이 도형과 그룹을 밝히는 박자. 이름은 하나 이상 |
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
- 내용이 없는 카드는 점선 틀만 보이고 글자는 없다. 정보 없는 표시가 카드마다 반복되면 화면이 어수선해지기 때문이다. 카드에 읽을 글이 없으므로 대체 글도 두지 않는다.
- 도착 규칙: 그 박자에 점이 도착하는 도형의 카드는 그 도형에 도착하는 이동 가운데 가장 늦은 도착 때 바뀐다. 나머지 도형의 카드는 박자 시작에 바뀐다.
- 태그는 대문자로 그린다. `tone`이 있는 줄은 그 색이다. `tone`이 없는 줄은, `tone` 없이 처음 나온 태그 순서대로 보라, 초록, 청록을 돌아가며 붙인 색을 그림 전체에서 같은 태그에 쓴다. 파랑은 "지금", 주황은 비교 계열을 뜻해서 태그 색이 아니다. 옛 값 `tone=blue`는 청록(`teal`), `tone=orange`는 보라(`purple`)로 그리고 폐기 진단으로 새 이름을 알린다([호환 규칙](#호환-규칙)). 색은 [색 역할 표](docs-integration.md#색-역할)를 따른다. `tag` 없이 `tone`만 쓰면 오류다.
- `mark`는 8자 이하다. 카드 오른쪽 끝에 들어갈 자리가 정해져 있기 때문이다.
- 관계 그래프 글은 `;`로 관계를 나누고, 관계는 `이름 -> 이름` 또는 이름 하나다. 이름은 앞뒤 공백을 빼고 `;`, `,`, `->`를 쓰지 않는다. 관계가 돌아 제자리로 오거나, `lit`의 이름이 그래프에 없으면 오류다.
- 구조 그림에서 카드를 쓰는 도형은 `box`, `external`, `store`, `person`이다. `decision`과 그룹에 `show`를 쓰면 오류다. 다른 그림 종류는 [그림 종류](figure-kinds.md)를 따른다.

단계:

- 박자 줄이 하나도 없는 단계는 오류다.
- 한 단계 안에서 지나간 선, 밝힌 도형, 카드 내용은 남는다. 다음 단계가 시작하면 모두 꺼진다. 차트의 단계 규칙은 [차트](charts.md)에 있다.

### 글 줄 나누기

- 도형 이름, 부제, 카드 글은 도형 너비 상한(토큰 `size.node.max-width`)에서 띄어쓰기 자리로 줄을 나눈다. 띄어쓰기 없는 긴 낱말은 글자 단위로 나눈다. 그래서 글이 도형을 넘는 일은 원본 오류가 아니다.

### 오류와 경고

- 형식: `{파일}:{줄}: {무엇이 틀렸나}. {고치는 방법}`. 경고는 `{파일}:{줄}: warning: {메시지}`, 폐기는 `{파일}:{줄}: deprecated: {메시지}`다. 영어로 쓴다(code-style 메시지 규칙). 진단의 종류와 모양은 [호환 규칙](#호환-규칙)이 정한다.
- 이름 오류에는 선언된 이름 목록을 알파벳순으로 붙이고, 편집 거리가 2 이하인 이름이 있으면 `Did you mean "{이름}"?`을 붙인다.
- 오류가 하나라도 있으면 파일을 쓰지 않는다. 문법 오류, 글꼴에 없는 글자, `data` 읽기 오류는 한 번에 모두 알린다. 파일이 비었거나 첫 줄의 그림 종류를 모르면 거기서 멈춘다. 다음 줄을 읽을 규칙이 없기 때문이다.
- [그림 검사](figure-check.md)는 배치가 끝나야 돌므로, 원본 오류가 없을 때만 그 오류를 알린다.
- 경고와 폐기는 파일을 쓰고 표준 오류에 남긴다. `--strict`면 경고도 실패이고, `--no-deprecated`면 폐기도 실패다.
- 문법 밖의 화면 오류(겹침, 넘침)는 [그림 검사](figure-check.md)가 같은 형식으로 알린다.

### 호환 규칙

이미 쓴 `.muto`는 기능이 늘어 문법이 바뀌어도 깨지지 않는다. 낱말, 선택 사항, 값 목록, 기본값, 판, 폐기 정보는 문법 표(`src/source/grammar.js`) 한 곳에만 있다. 파서, 검증, 오류 메시지, `migrate`, 이 절의 표가 모두 그 표를 읽는다.

- 판: 첫 문장에 `mutoscope 1`을 쓰면 그 판으로 읽고, 없으면 판 1이다. 이 도구가 모르는 판 번호는 오류(`unsupported-version`)이고 지원하는 판을 알린다. 판 번호는 옛 원본을 깨는 변경에만 올리고, 같은 판 안에서는 추가만 한다. 파일의 판보다 높은 `since`의 항목을 쓰면 오류(`version-required`)다.
- 추가만: 새 낱말과 새 선택 사항은 생략할 수 있고, 생략한 기본값이 옛 뜻을 그대로 지킨다. `series`의 `role`이 그 예다. 생략하면 선언 순서대로 역할을 받고(첫 계열 main, 둘째 compare, 덤벨은 시작점이 compare라 첫 계열 compare), 하나만 적으면 다른 계열이 남은 역할을 받는다. 둘 다 적었을 때만 main 하나, compare 하나인지 본다.
- 폐기: 옛 형식은 오류로 바꾸지 않는다. 표의 `deprecated: { since, replace }`가 새 이름이고, 낱말, 선택 사항 키, 값, 그림 종류 어디에 있든 같은 규칙으로 새 이름으로 바꿔 읽어 그림이 같다. `deprecated` 진단과 `fix`를 내고, 값 없는 낱말(flag)은 이름 자리의 낱말과 가를 수 없어 별칭을 두지 않는다.
- 진단은 세 종류다.

| 종류 | 뜻 | 파일 | 실패 조건 |
|---|---|---|---|
| `error` | 그릴 수 없다 | 쓰지 않음 | 늘 |
| `warning` | 품질 문제 | 씀 | `--strict` |
| `deprecated` | 옛 형식이고 계속 동작한다 | 씀 | `--no-deprecated` |

- 진단 하나의 모양은 `{ severity, code, line, column, message, fix? }`이고 모든 진단이 쓴다. `--json`은 여기에 `file`을 더하고, 옛 필드 `lines`, `check`, `level`도 함께 내(폐기, 다음 판까지) 진단마다 한 줄을 표준 출력에 쓴다. `code`는 `syntax`(문법), `check-1`~`check-12`([그림 검사](figure-check.md) 번호), `deprecated-statement`, `deprecated-option`, `deprecated-value`, `deprecated-kind`, `unsupported-version`, `invalid-version`, `version-required`, `layout`(배치 실패, [배치](layout.md#배치-실패)), `io`, `internal`이다. `column`은 줄 안 1부터 센 자리다. `fix`는 `{ line, column, length, text }`로, 그 줄의 `column`부터 `length`글자를 `text`로 바꾼다.
- `mutoscope migrate 원본... [--write]`는 진단의 `fix`를 그대로 적용한다. 기본은 바뀔 줄만 `-`, `+`로 보여 주고, `--write`일 때만 파일을 고친다. 원본에 오류가 있거나 고친 글에 오류나 폐기가 남으면 아무것도 쓰지 않는다. 새 폐기 항목은 표에 `replace`만 적으면 된다.

- CLI 출력과 옵션도 같은 규칙이다. 명령과 옵션 이름, 종료 코드, `--json` 필드는 추가만 하고, 옛 `--json` 필드(`lines`, `check`, `level`)는 `src/diagnostics.js` 표에 deprecated로 표시해 다음 판까지 함께 낸다.
- 고정 묶음: `test/fixtures/compat/v1/`는 판 1 원본의 고정 묶음이다. 폐기 전 예제 원본(`main-*`), 옛 형식 사례(`old-*`), 모든 낱말과 선택 사항을 한 번씩 쓰는 파일(`all-*`)이 들어 있고, 앞으로 고치지 않는다. `test/compat.test.js`는 모든 파일이 오류 없이 읽히고 구조 요약(도형, 선, 박자, 계열 수)이 스냅샷과 같은지, 문법 표의 모든 항목이 묶음에 쓰였는지 본다. 새 판이 생기면 `v2` 폴더를 더한다.
- 기능 추가 체크리스트: 표에 항목을 더한다(`since`는 현재 판). 생략했을 때의 기본값이 옛 뜻을 지키는지 확인한다. 항목을 쓰는 `all-*` 파일을 묶음에 더한다(있는 파일은 고치지 않는다). 옛 형식을 없애면 표에 `deprecated.replace`를 적는다. `npm run grammar`로 아래 문법 표를 다시 쓴다.

다음 표는 문법 표에서 만든다. 손으로 고치지 않고 `npm run grammar`로 다시 쓰며, 문법 표와 어긋나면 테스트가 실패한다. 선택 사항의 앞 이름은 쓰이는 문장이다(`graph`는 `show id graph`, `column`은 테이블 열 줄).

<!-- grammar-table:start -->
| 부분 | 낱말 | 그림 종류 | 판 | 폐기 |
|---|---|---|---|---|
| 판 표기 | `mutoscope` | 모든 그림 | 판 1 |  |
| 머리 | `title`, `subtitle`, `speed` | 모든 그림 | 판 1 |  |
| 머리 | `aspect` | flow, state, data | 판 1 |  |
| 머리 | `x`, `y`, `scale`, `decimals` | chart | 판 1 |  |
| 선언 | `person`, `box`, `external`, `store` | flow, sequence | 판 1 |  |
| 선언 | `decision` | flow | 판 1 |  |
| 선언 | `state`, `start`, `final` | state | 판 1 |  |
| 선언 | `group`, `a -> b` | flow, state | 판 1 |  |
| 선언 | `table` | data | 판 1 |  |
| 선언 | `series`, `rule`, `missing`, `data`, `row`, `point`, `cell`, `link` | chart | 판 1 |  |
| 시간 흐름 | `a -> b` | flow, sequence, state, data | 판 1 |  |
| 시간 흐름 | `step`, `say`, `wait` | 모든 그림 | 판 1 |  |
| 시간 흐름 | `show`, `clear` | flow, data | 판 1 |  |
| 시간 흐름 | `light` | flow, state, data, chart | 판 1 |  |
| 시간 흐름 | `note` | sequence | 판 1 |  |
| 시간 흐름 | `reveal` | chart | 판 1 |  |

| 선택 사항 | 값 | 판 | 폐기 |
|---|---|---|---|
| `group.direction` | `right`, `down` | 판 1 |  |
| `hop.time` | 시간 | 판 1 |  |
| `hop.dashed` | 값 없음(낱말만) | 판 1 |  |
| `edge.quiet` | 값 없음(낱말만) | 판 1 |  |
| `edge.dashed` | 값 없음(낱말만) | 판 1 |  |
| `show.tag` | 글 | 판 1 |  |
| `show.tone` | `purple`, `green`, `teal`, `gray` | 판 1 |  |
| `show.meta` | 글 | 판 1 |  |
| `show.mark` | 글, 최대 8자 | 판 1 |  |
| `show.mono` | 값 없음(낱말만) | 판 1 |  |
| `graph.lit` | 글 | 판 1 |  |
| `series.role` | `main`, `compare` | 판 1 |  |
| `series.key` | 글 | 판 1 |  |
| `point.series` | 계열 이름 | 판 1 |  |
| `light.x` | 숫자 | 판 1 |  |
| `column.pk` | 값 없음(낱말만) | 판 1 |  |
| `column.unique` | 값 없음(낱말만) | 판 1 |  |
| `column.fk` | 테이블.열 | 판 1 |  |

| 값 목록 | 쓰는 곳 | 값 | 기본값 | 옛 값 → 읽는 값 |
|---|---|---|---|---|
| `direction` | `group.direction`, `flow 뒤`, `state 뒤`, `data 뒤` | `right`, `down` | `right` | 없음 |
| `scale` | `scale 값` | `linear`, `log` | `linear` | 없음 |
| `chartType` | `chart 뒤` | `bar`, `dumbbell`, `box`, `scatter`, `line`, `heatmap` | 없음 | 없음 |
| `tone` | `show.tone` | `purple`, `green`, `teal`, `gray` | 없음 | `blue` → `teal`, `orange` → `purple` |
| `role` | `series.role` | `main`, `compare` | 선언 순서대로 main, compare(`dumbbell`은 compare, main) | 없음 |
<!-- grammar-table:end -->

### 요구사항

| 요구사항 | 검증 계획 |
|---|---|
| 문서의 모든 예시 원본이 오류와 경고 없이 읽힌다. | `test/grammar.test.js`의 `docExamples_every_design_doc_example_builds_without_errors_or_warnings`. 문서의 예시 원본을 뽑아 strict로 읽는다 |
| 세 부분 순서, 낱말 공백, 이름 형식, 값 형식을 어긴 줄을 줄 번호와 함께 알린다. | `test/grammar.test.js`의 `parseFigure_malformed_source_reports_the_line_and_the_rule`. 규칙마다 원본 하나로 줄 번호와 오류 확인 |
| 선언하지 않은 이름과 비슷한 이름을 함께 알린다. | `test/grammar.test.js`의 `parseFigure_unknown_name_suggests_the_nearest_declared_name`. `cdex`를 쓴 원본이 `codex`를 제안하는지 확인 |
| 같은 방향 선 두 개, 자기 자신으로 가는 선, 그룹과 안 도형 사이 선을 막는다. | `test/grammar.test.js`의 `parseFigure_malformed_source_reports_the_line_and_the_rule`(선 행). 원본마다 오류 확인 |
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
