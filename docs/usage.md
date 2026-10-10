# Daphnis 사용법

Daphnis는 텍스트로 문서용 그림을 만드는 도구입니다. 구성 요소를 한 번 선언한 뒤 연결, 보기, 장면을 조합합니다. 구조·순서·상태·데이터 관계·차트가 같은 카드와 조작부를 사용하고, 애니메이션은 선언한 구조를 따라 움직입니다.

이 문서는 처음 설치해서 글에 그림을 넣는 과정과 자주 쓰는 조합을 설명합니다. 옵션의 전체 목록은 코드에서 생성하는 [그림 문법](design/figure-syntax.md#문법-표)이 정본입니다. 여기의 수치와 서비스는 설명용 예시이며 실제 시스템의 측정값이 아닙니다.

## 설치와 판 확인

Node.js 20 이상과 npm이 필요합니다. 현재 저장소의 원본 문법은 `daphnis 2`입니다. npm의 `0.1.3` 배포판은 이전 문법이므로 아래 예제에는 현재 저장소를 설치합니다.

```sh
npm install --save-dev github:woonyong-choi/daphnis#main
```

설치한 프로젝트에서 `npx daphnis`로 실행합니다. 설치 전에 `npx daphnis`만 실행하면 npm의 기존 배포판을 가져올 수 있습니다. 팀에서 같은 결과를 만들려면 `package-lock.json`을 함께 커밋하고 `npm ci`를 사용합니다. Git 의존성도 잠금 파일에 해석된 커밋이 기록됩니다. 특정 검증판을 고정할 때는 `#main` 자리에 그 커밋의 전체 SHA를 사용합니다.

패키지 버전은 다음 명령으로 확인할 수 있습니다. 패키지 버전과 원본 첫 줄의 문법 판은 서로 다른 값입니다.

```sh
node --input-type=module -e "import {createRequire} from 'node:module'; console.log(createRequire(import.meta.url)('daphnis/package.json').version)"
```

Daphnis 패키지에는 공통 디자인의 배포 사본, 아이콘, 렌더러와 TypeScript 선언이 포함된다. 소비자가 별도의 비공개 디자인 저장소에 접근할 필요는 없다. 라이브러리 API도 Node.js에서 실행하며 ESM으로 가져온다. 독립 npm 패키지의 구성과 실제 배포 절차는 [마크다운과 배포](design/markdown.md#패키지)를 확인한다.

## 첫 그림 만들기

아래 내용을 `request.dap`에 저장합니다. 카드 세 개와 선 두 개만으로 정적인 구조가 만들어집니다. 좌표, 글꼴, 색, 보기, 장면을 지정할 필요가 없습니다.

```dap name=request
daphnis 2
title "요청을 저장하는 경로"
person client "사용자"
box service "주문 서비스"
store records "저장소"
client -> service "요청"
service -> records "기록"
```

![요청을 저장하는 경로](usage-request.svg)<!-- dap -->

검사하고 SVG와 HTML을 만듭니다.

```sh
npx daphnis check request.dap --strict
npx daphnis render request.dap --html
```

`request.svg`와 `request.html`이 원본 옆에 생깁니다. HTML은 모든 장면을 선택하는 재생기이고 SVG는 선택한 장면 하나입니다. 장면이 없는 위 예제는 두 형식 모두 정지 그림입니다. 그림 제목은 원본의 `title`에 적습니다. `render --title`은 지원하지 않습니다.

### 네 가지 개념

| 개념 | 역할 | 필요한 경우 |
|---|---|---|
| 카드 | 서비스, 저장소, 상태, 테이블, 차트 같은 대상 | 모든 그림 |
| 연결 | 대상 사이의 관계 | 관계나 이동 경로를 보일 때 |
| 보기 `view` | 같은 대상을 그래프·순서·차트·시간 방식으로 배치 | 기본 배치와 다른 표현이 필요할 때 |
| 장면 `scene` | 같은 대상의 상태와 이동을 설명하는 단계 | 강조·움직임·비교가 필요할 때 |

`service`는 다른 줄에서 참조하는 식별자이고 `"주문 서비스"`는 화면의 표시 이름입니다. 표시 이름을 바꿔도 연결 줄은 그대로 쓸 수 있습니다. 카드와 그룹, 값의 식별자는 문서 안에서 겹치면 안 됩니다. 일반 식별자는 영어 소문자로 시작하고 소문자·숫자·낱말 사이의 `-`를 씁니다. 테이블 이름과 열 이름의 세부 규칙은 [이름 규칙](design/figure-syntax.md#이름)을 따릅니다.

원본은 판 선언 → 제목 등 머리말 → 카드·값·연결·보기 → 장면 순서로 씁니다. 장면을 쓰기 시작한 뒤 새 카드를 선언하지 않습니다. 한 문장에 한 줄을 쓰며 표시 글은 큰따옴표로 감쌉니다. 카드 안의 열이나 칸은 `{ ... }` 블록에 두고, 장면 아래의 들여쓰기는 읽기 편하도록 맞춥니다.

## 구조에 장면 추가하기

첫 예제의 마지막에 아래 줄을 붙이면 구조와 요청 이동을 탭으로 비교할 수 있습니다.

```text
scene "구조" mode=static

scene "요청 처리"
  client -> service time=700ms
  service -> records time=700ms
```

카드와 선을 다시 선언하지 않습니다. 장면 밖 `->`는 그래프의 연결을 선언하고, 장면 안 `->`는 그 연결을 따라 이동합니다. 이미 선에 `"요청"`이 쓰여 있으므로 이동에 같은 글을 반복하지 않아도 됩니다. 같은 글을 양쪽에 쓰면 중복 라벨 경고가 발생할 수 있습니다.

| 장면 모드 | 결과 | 주로 쓰는 경우 |
|---|---|---|
| `static` | 장면의 마지막 상태를 처음부터 표시 | 구조, 특정 경로의 강조, 발표용 정지 그림 |
| `once` | 한 번 재생하고 마지막 상태 유지 | 요청 순서와 상태 전이 설명 |
| `loop` | 같은 장면을 반복 | 계속 들어오는 트래픽과 순환 과정 |

`mode`를 생략하면 내용이 있는 장면은 `once`, 빈 장면은 `static`입니다. 장면이 두 개 이상이면 HTML 아래에 탭이 나오고, 한 개 이하면 탭 줄을 숨깁니다. 탭을 눌러도 다음 장면으로 자동 진행하지 않습니다.

장면은 기본적으로 선언한 시작 값에서 출발합니다. 이전 장면의 값을 이어 쓰려면 `keep="값이름"`, 시작 값을 바꾸려면 `set="값이름=숫자"`를 장면에 적습니다. 탭을 임의 순서로 눌러도 빌드할 때 계산한 해당 장면의 시작 상태를 사용합니다.

### 이동, 강조, 설명 바꾸기

- `a -> b`: 경로를 따라 이동합니다. `time=700ms`로 그 이동 시간을 지정할 수 있습니다.
- `a -> b & c -> d`: 한 박자에서 함께 이동합니다.
- `light a b`: 이동하는 점 없이 대상을 강조합니다. 테이블 열은 `light orders.id`처럼 가리킵니다.
- `show a "설명"`: 카드 안에 설명 글을 표시합니다. `clear a`는 표시한 글을 걷습니다.
- `wait 1s`: 다음 박자 전에 기다립니다.
- `reveal chart.series`: 차트의 한 계열을 드러냅니다.

순차적인 박자와 계속 출발하는 `track`은 한 장면에 섞지 않습니다. 단계 설명은 박자 장면으로, 독립적인 트래픽은 `track` 장면으로 나눕니다.

## 동시에 움직이는 트래픽과 큐

다음 예제는 접수량이 처리량보다 많을 때의 큐를 보여 줍니다. `queue` 자체가 찬 칸 수를 나타내는 값이므로 별도의 큐 길이 변수를 만들지 않습니다.

```dap name=queue
daphnis 2
title "접수와 처리가 독립적으로 진행되는 큐"
box producer "접수" icon=apigw
queue jobs "대기 작업" slots=4 from=1
box worker "처리" icon=server
box retry "재시도 보관" icon=db
value done "완료" on=worker from=0
on worker done+1
producer -> jobs
jobs -> worker
producer -> retry quiet
view graph down

scene "구조"

scene "접수가 더 빠를 때" mode=loop for=8s
  track producer -> jobs at=0s every=1s time=700ms wait="jobs<4" timeout=1s else=retry reserve="jobs+1"
  track jobs -> worker at=500ms every=2s time=700ms wait="jobs>0" reserve="jobs-1" tone=green
```

![접수와 처리가 독립적으로 진행되는 큐](usage-queue.svg)<!-- dap -->

`every`는 출발 간격이고 `time`은 한 이동에 걸리는 시간입니다. 이동 시간이 출발 간격보다 길면 여러 점이 같은 경로 위에 동시에 존재합니다. `for=8s`는 장면의 논리 길이이며 실서비스의 실행 시간이 아닙니다. 구간별 속도가 다르면 `legs="500ms, -"`처럼 경로의 각 구간 시간을 나눌 수 있습니다.

| 옵션 | 의미 | 큐 예제에서의 역할 |
|---|---|---|
| `at` | 첫 출발 시각 | 소비자가 500ms 뒤부터 출발 |
| `every` | 반복 출발 간격 | 생산 1초, 소비 2초 |
| `when` | 출발 때 조건을 검사하고 거짓이면 건너뜀 | 대기가 필요 없는 선택적 요청 |
| `wait` | 조건이 참이 될 때까지 출발을 보류 | 빈자리 또는 작업을 기다림 |
| `reserve` | 출발할 때 값을 예약·변경 | 같은 빈자리를 두 요청이 차지하지 않도록 큐 수를 먼저 변경 |
| `timeout`, `else` | 기다림의 제한과 대체 도착지 | 가득 찬 큐 대신 보관함으로 이동 |
| `set` | 도착할 때 값을 변경 | 처리 결과 반영 |
| `lost` | 경로의 지정 비율에서 이동을 끝냄 | `lost=50%`로 중간 유실 표현 |

`on worker done+1`은 점이 `worker`에 도착할 때마다 완료 수를 올립니다. `reserve`로 이미 큐 수를 바꾸었다면 같은 수를 `on`에서 다시 바꾸지 않습니다. `value pending "진행 중" from=0`처럼 값만 선언하거나 카드 안에 선언해 표시할 수도 있습니다. `ref=jobs`는 큐 값의 별도 표시 이름을 만들 때 사용합니다.

장면의 논리 사건은 빌드할 때 계산됩니다. 재생기는 같은 시간표를 표시하며 실제 메시지 브로커를 실행하지 않습니다. `speed=1.5`는 화면의 재생 배속만 바꾸고 `every`, `time`과 사건 사이의 논리 관계는 유지합니다. 의도적으로 영원히 기다리는 모습을 설명할 때만 `stuck`을 사용합니다. 조건·예약·값 유지의 더 큰 조합은 [queue 예제](../examples/queue.dap)와 [재생 계약](design/playback.md)을 확인합니다.

## 목적에 맞는 보기 선택하기

### 아키텍처와 경계

구성도는 `box`, `person`, `store`, `external` 같은 카드를 선으로 연결합니다. 그룹은 관련 카드를 감싸는 경계이며 중첩할 수 있습니다. 다음은 첫 예제의 서비스와 저장소를 묶는 선언 조각입니다. 기존 선언을 이 블록으로 옮기며 같은 카드를 중복 선언하지 않습니다.

```text
group backend "주문 시스템" direction=down {
  box service "주문 서비스" icon=server
  store records "저장소" icon=db
}
```

전체 방향은 `view graph down`, 그룹 안 방향은 `direction=down`으로 정합니다. 좌표를 직접 배치하지 않습니다. `icon=server`는 내장 아이콘 이름이고 `tone=blue`는 색 역할입니다. 기본 중성 카드로 충분하면 둘 다 생략합니다. `appearance=filled|outline`을 쓰려면 함께 사용할 `tone`을 지정합니다. 지원되는 색은 문법 표를 따르며 임의의 HEX 색을 원본에 쓰지 않습니다.

[구성도 레퍼런스](reference/architecture.md)는 그룹, 아이콘과 번호 선을 설명합니다. [API 예제](../examples/api.dap)는 요청·응답의 이름 붙은 칸을 연결하고, [클래스 예제](../examples/class.dap)는 필드·메서드·상속·구현·합성 관계를 표현합니다. 클래스 멤버는 연결점이 아니므로 관계는 클래스 카드끼리 연결합니다.

### 메시지 순서

순서 그림도 카드를 먼저 선언하지만 연결을 별도로 선언하지 않습니다. 보기 안에 참여자의 가로 순서를 놓고, 메시지를 장면 안에 적습니다.

```dap name=sequence
daphnis 2
title "저장 완료 뒤에 응답하기"
person client "사용자"
box service "주문 서비스"
store records "저장소"
view sequence {
  client service records
}
scene "주문 접수" mode=static
  client -> service "주문"
  service -> records "저장"
  records -> service "저장 완료" dashed
  service -> client "주문 번호" dashed
```

![저장 완료 뒤에 응답하기](usage-sequence.svg)<!-- dap -->

`mode=static`은 메시지 전체를 한 번에 보여 줍니다. `once`로 바꾸면 같은 메시지를 순서대로 설명합니다. 한 장면에 여러 가능성을 나누려면 `fragment alt`와 `branch`, 반복에는 `fragment loop`, 병렬에는 `fragment par`, 선택적 실행에는 `fragment opt`를 씁니다. `activate`·`deactivate`는 활성 구간, `note`는 주석, `create`·`destroy`는 참여자의 생명주기입니다. 상세 예제는 [순서 그림](reference/sequence.md)을 확인합니다.

### 상태와 재시도

상태 그림은 같은 그래프 보기와 장면 문법을 사용합니다. 카드가 서비스 대신 상태를 뜻하고 `start`, `final`로 시작과 끝을 표시합니다.

```dap name=state
daphnis 2
title "작업의 정상 처리와 재시도"
state queued "대기"
state running "처리 중"
state done "완료"
start queued
final done
queued -> running "시작"
running -> done "성공"
running -> queued "재시도"
view graph down
scene "정상 처리"
  queued -> running
  running -> done
scene "재시도"
  queued -> running
  running -> queued
```

![작업의 정상 처리와 재시도](usage-state.svg)<!-- dap -->

같은 구조 위에서 경로만 바꿉니다. 실패 횟수, 재시도 정책, 트랜잭션 보장까지 이 그림이 자동으로 정의하지는 않습니다. 필요한 정책은 본문에 설명하거나 값과 조건을 추가해 표현합니다. 자세한 내용은 [상태 그림](reference/state.md)을 확인합니다.

### 테이블, 관계와 일반 표

테이블 카드는 열과 키, 외래 키 관계를 설명합니다. 일반적인 속성 비교나 목록 표는 문서의 Markdown 표를 사용하고, 열 사이의 참조를 설명할 때 Daphnis 테이블을 사용합니다.

```dap name=tables
daphnis 2
title "주문이 사용자를 참조하는 관계"
table users "users" {
  id bigint pk
  name text required
}
table orders "orders" {
  id bigint pk
  user_id bigint fk=users.id required
}
view graph down
scene "관계"
scene "사용자 찾기"
  orders.user_id -> users.id time=800ms
```

![주문이 사용자를 참조하는 관계](usage-tables.svg)<!-- dap -->

외래 키 선언이 연결을 만든다. `from="0..*" to="1"`을 같은 열에 붙이면 각 끝의 다중성을 표시한다. 외래 키 없이 직접 적는 선은 설명용 관계다. 같은 관계를 `orders.user_id -> users.id`로 장면 밖에 다시 선언하지 않는다. 열의 자료형은 표시할 계약이고, SQL을 실행하거나 DB 스키마를 자동으로 변경하지 않는다. `unique`와 참조 동작은 [데이터 관계 그림](reference/data.md)에 있다.

### 배열, 비트와 포인터

`grid`는 카드 안의 칸을 구성합니다. `item`의 `row`, `col`은 0부터 세며 `rows`, `cols`는 차지하는 칸 수입니다. 이 숫자는 데이터 구조의 의미이며 화면의 픽셀 좌표가 아닙니다. `light address.page`로 칸을 강조하고 `address.page -> page-table`처럼 특정 칸을 연결합니다.

[칸 격자](reference/grid.md)에서 최소 문법을 익힌 뒤 [메모리](../examples/memory.dap), [스택](../examples/stack.dap), [포인터](../examples/pointer.dap)를 확인합니다. 생략 구간 `gap`은 설명용 표시이므로 이동이나 강조의 대상이 아닙니다.

### 차트와 측정값

차트는 계열을 먼저 선언하고 행에 값을 적습니다. 단위는 축 제목에 붙입니다. 다른 카드와 연결되지 않은 차트는 `view plot`을 쓰지 않아도 차트 보기를 받습니다.

```dap name=chart
daphnis 2
title "대기와 처리 시간을 구분하기"
chart latency "요청별 시간" bar "예시 데이터. 단위는 ms" {
  x "시간(ms)"
  series work "처리"
  series wait "대기"
  row "요청 A" work=80 wait=20
  row "요청 B" work=85 wait=90
}
scene "전체 값"
scene "계열 비교"
  reveal latency.work
  wait 700ms
  reveal latency.wait
```

![대기와 처리 시간을 구분하기](usage-chart.svg)<!-- dap -->

`reveal`에 나온 계열만 장면 시작 때 숨었다가 드러납니다. `light latency "요청 B"`는 특정 행을 강조합니다. 값 이름을 행의 숫자 자리에 넣으면 값이 바뀔 때 차트도 따라 바뀝니다. 계열 색·무늬·번호와 범례는 렌더러가 정하므로 차트마다 별도 CSS를 만들지 않습니다.

| 설명할 질문 | 후보 |
|---|---|
| 항목별 크기, 두 조건 비교 | `bar`, `dumbbell`, `difference` |
| 구성값의 합계와 비율 | `stacked`, `percent`, `pie`, `donut` |
| 시간이나 순서에 따른 변화 | `line`, `step`, `area` |
| 분포와 누적 확률 | `histogram`, `box`, `ecdf` |
| 두 변수의 관계, 교차표 | `scatter`, `heatmap` |
| 증감이 최종 합계에 미치는 영향 | `waterfall` |

종류마다 입력과 계열 수의 제약이 다릅니다. [차트 레퍼런스](reference/charts.md)의 표에서 해당 종류의 행 문법을 먼저 고릅니다. 빠진 값 `-`와 0은 다릅니다. 결측 지원 여부도 그 표를 따릅니다. 모든 차트에 같은 형식의 행을 복사하면 안 됩니다.

실측값은 `data "results.json" at "/rows"`로 JSON 배열을 읽을 수 있습니다. 경로는 CLI에서는 원본 파일의 폴더, API에서는 `baseDir` 기준입니다. 내장 행과 외부 자료를 구분하고 단위·표본·측정 조건을 본문에 설명합니다. `--require-data`는 외부 자료를 요구하며 부제가 `예시 데이터.`로 시작하는 설명용 값만 예외로 인정합니다. `--require-ci`는 지원되는 종류의 측정값에 신뢰구간을 요구하므로 모든 그림에 무조건 붙이지 않습니다. 자세한 키 대응은 [차트의 값 출처](design/charts.md)를 확인합니다.

### 실제 시간의 추적과 여러 보기

`trace`에는 `span id "표시 이름" lane=카드 at=시작 dur=길이`를 적습니다. `unit=ms|us|s`는 측정값의 단위이고 `at`, `dur`는 그 단위의 숫자입니다. 이는 `track time=700ms` 같은 애니메이션 시간과 다릅니다. 같은 레인에서 겹치는 구간은 다른 줄에 배치합니다.

[추적 예제](../examples/trace.dap)는 호출 관계를 `graph`, 측정 구간을 `time` 보기로 나란히 설명합니다. 같은 카드를 그래프와 순서 보기 양쪽에 배치할 수도 있습니다. 보기는 위에서 아래로 쌓이며 같은 논리 사건이 여러 보기에 함께 표시됩니다. 이를 위해 카드를 복제하거나 사건을 두 번 적지 않습니다. [통합 예제](../examples/integration.dap)에서 여러 보기의 조합을 확인합니다.

## Markdown과 홈페이지에 넣기

### GitHub에서 읽는 Markdown

문서 안에 다음 형식으로 원본을 둡니다. 블록 이름은 소문자·숫자·`-`를 사용하고 같은 문서 안에서 중복하지 않습니다.

````text
```dap name=request
daphnis 2
box client "사용자"
box service "주문 서비스"
client -> service
```
````

```sh
npx daphnis md guide.md --strict
npx daphnis md guide.md --check --strict
```

첫 명령은 SVG를 만들고 블록 아래에 관리 표식이 있는 이미지 줄을 넣습니다. 둘째 명령은 파일을 바꾸지 않고 낡은 결과가 있는지 검사합니다. 생성된 SVG와 수정된 Markdown을 함께 커밋합니다. 원본을 고친 뒤 SVG를 손으로 고치지 않습니다.

`--fold`는 그림을 먼저 보여 주고 원본을 접습니다. `--unfold`로 되돌립니다. `--out-dir`은 SVG를 둘 폴더입니다. 블록 이름을 바꾸거나 지우면 도구가 소유한 옛 SVG와 이미지 줄을 정리합니다. 사용자가 만든 표식 없는 이미지나 파일을 가져가거나 지우지 않습니다. 인용·목록·접기와 쓰기 실패의 상세 계약은 [마크다운과 배포](design/markdown.md)를 따릅니다.

### 홈페이지에서 읽는 본문

홈페이지는 `dap` 블록을 빌드할 때 HTML 그림으로 컴파일하고 본문에 삽입합니다. 원본의 `title`이 그림의 이름이 됩니다. 같은 원본은 빌드에서 재사용하고 읽는 브라우저에서 파서나 배치 엔진을 실행하지 않습니다.

홈페이지의 블로그와 문서는 같은 삽입 부품을 사용합니다. 장면 탭, 문법 복사, HTML 다운로드, 전체화면을 그림마다 따로 구현하지 않습니다. 정적인 설명으로 충분한 곳에는 장면 없이 넣고, 순서나 변화의 이해를 돕는 곳에만 장면을 추가합니다.

홈페이지의 삽입 빌드는 `allowFileAccess: false`를 사용합니다. `data` 파일과 파일 기반 아이콘 세트는 이 경로에서 읽지 못하므로 승인된 원본 안의 값과 내장 아이콘을 사용합니다. CLI의 외부 자료 읽기와 같은 권한이라고 가정하지 않습니다. 콘텐츠 발행은 홈페이지의 승인·동기화 절차를 따릅니다.

## CLI 출력과 검사

| 목적 | 명령 |
|---|---|
| 원본만 검사 | `npx daphnis check request.dap --strict` |
| SVG 만들기 | `npx daphnis render request.dap` |
| SVG와 모든 장면의 HTML | `npx daphnis render request.dap --html` |
| 선택한 장면의 정지 SVG | `npx daphnis render request.dap --static --scene "요청 처리"` |
| 별도 폴더에 결과 쓰기 | `npx daphnis render request.dap --html --out figures` |
| 폴더의 원본을 갤러리로 만들기 | `npx daphnis gallery figures --out preview --title "설계 그림"` |
| 진단을 JSON으로 받기 | `npx daphnis check request.dap --json` |

SVG의 `--scene` 번호는 1부터입니다. 생략하면 첫 장면이고 장면이 없는 그림에는 지정하지 않습니다. HTML은 모든 장면을 포함하므로 `--static`이나 SVG의 선택 장면이 HTML의 장면 목록을 줄이지 않습니다. `gallery`는 지정한 폴더의 `.dap`를 읽고 목록·문서 미리보기·각 그림의 HTML과 SVG를 만듭니다. 하위 폴더를 재귀적으로 찾는 명령은 아닙니다.

`--strict`는 경고도 실패로 취급합니다. `--json`은 진단마다 JSON 한 줄을 출력하며, 일반 진단은 파일·줄·메시지로 나옵니다. CLI의 종료 코드는 성공 0, 원본·검사·입출력 실패 또는 낡은 결과 1, 사용법 오류 2입니다. 여러 원본의 `render`에서는 실패한 원본의 결과를 쓰지 않지만 성공한 다른 원본의 결과는 쓸 수 있습니다. 출력 경로 충돌은 쓰기 전에 전체를 거절합니다.

대규모 원본의 안전 한도는 `--budget 이름=값`으로 조정합니다. 무조건 한도를 높이기 전에 그림을 설명 단위로 나눕니다. 시간 값에는 `ms` 또는 `s`를 붙이고 시작 시각 `at=0s`는 허용합니다. 이동 시간·반복 간격·대기 길이는 양수여야 합니다. 한 시간의 상한과 조건부 사건의 정밀도는 [재생 계약](design/playback.md#시간-상한)을 따릅니다.

## JavaScript에서 조립하기

공개 함수는 `buildFigure`, `toSvg`, `toHtml`이다. 원본을 한 번 빌드하고 그 결과로 두 출력을 만든다. 오류 클래스 `FigureError`도 같은 진입점에서 가져온다. 아래 코드는 `.mjs` 파일이나 `package.json`에 `"type": "module"`이 있는 프로젝트에서 실행한다.

```js
import { readFile, writeFile } from 'node:fs/promises';
import { buildFigure, FigureError, toSvg, toHtml } from 'daphnis';

const source = await readFile('request.dap', 'utf8');
try {
  const result = await buildFigure(source, {
    strict: true,
    allowFileAccess: false,
  });
  await writeFile('request.svg', await toSvg(result));
  await writeFile('request.html', await toHtml(result, '요청 경로'));
} catch (error) {
  if (!(error instanceof FigureError)) throw error;
  for (const problem of error.problems) {
    console.error(`${problem.line}:${problem.column} ${problem.code}: ${problem.message}`);
  }
}
```

세 함수 모두 Promise를 반환하며 파일을 쓰지 않는다. `buildFigure(source, options?)`의 결과는 `BuiltFigure`이고 두 렌더러에 그대로 전달한다. 공개 경고 목록은 `result.warnings`다. 내부 그림·장면·시간표의 필드와 JSON 직렬화 형식은 공개 계약이 아니므로 직접 수정하거나 저장해서 복원하지 않는다.

| 빌드 옵션 | 기본값 | 계약 |
|---|---|---|
| `baseDir` | 현재 작업 폴더 | 외부 JSON과 사용자 아이콘 경로의 기준 폴더 |
| `strict` | `false` | 경고를 오류로 승격해 `FigureError`로 전달 |
| `budget` | 이름별 기본 한도 | `grid-elements`, `grid-path-commands`, `events`, `chain`, `chip-index`의 한도를 양의 안전한 정수로 지정 |
| `layoutWidth` | 기본 배치 폭 | 그래프 보기의 배치 목표 폭(px). 양의 유한수이며 그래프 보기가 있는 문서에서만 사용 |
| `allowFileAccess` | `true` | `false`이면 원본에 외부 JSON이나 파일 기반 아이콘 세트가 있을 때 거부 |

외부 JSON이나 사용자 아이콘 세트를 허용하는 서버 도구는 읽을 범위와 경로 정책을 정하고 `baseDir`를 명시한다. `baseDir`는 접근 가능한 경로를 제한하는 보안 경계가 아니다. 검증되지 않은 문서 입력을 받는 곳에서는 `allowFileAccess: false`를 유지한다. 내장 글꼴과 아이콘을 읽는 동작은 이 옵션과 무관하다.

`toSvg(result, { scene: 0, isStatic: true, name: 'request' })`는 첫 장면의 마지막 상태를 담은 SVG 문자열을 반환한다. API의 장면 번호는 0부터이며 CLI는 1부터다. `scene`은 장면 이름도 받으며 생략하면 첫 장면이다. `isStatic`의 기본값은 `false`다. `name`은 원본에 `title`이 없을 때 쓸 제목이며 기본값은 빈 문자열이다. 장면이 있는 그림에서 존재하지 않는 번호나 이름을 선택하면 `RangeError`다.

`toHtml(result, '제목')`은 모든 장면과 필요한 글꼴·스타일·재생 코드를 포함한 HTML 문자열을 반환한다. 두 번째 인자는 원본에 `title`이 없을 때 쓸 제목이며 생략하면 빈 문자열이다. 좁은 폭의 배치도 검사하므로 빌드가 성공한 뒤라도 이 단계에서 `FigureError`가 발생할 수 있다.

`FigureError.name`은 `FigureError`이며 `problems`는 `FigureDiagnostic` 목록이다. 각 진단은 `severity`(`error` 또는 `warning`), `code`, `line`, `column`, `message`를 가진다. 줄과 열은 1부터 시작하며 원본 위치를 모르면 0이다. `warnings`도 같은 형식을 사용한다. `code`는 문자열이므로 연동 코드는 모르는 코드도 표시해야 한다. 진단을 분류할 때 사람이 읽는 `message`를 파싱하지 않는다. 잘못된 예산 옵션은 `TypeError`이고 그 밖의 실행 오류는 예시처럼 다시 던진다.

TypeScript에서는 `import type { BuildOptions, BuiltFigure, FigureDiagnostic, SvgOptions } from 'daphnis'`로 타입을 가져온다. Node.js 프로젝트는 `module: "NodeNext"` 설정으로 같은 ESM 진입점을 사용한다. 타입의 정본은 [공개 선언](../src/index.d.ts)이다. 내부 모듈 경로 대신 공개 진입점을 가져오고, 디자인을 맞추기 위해 결과 SVG나 HTML을 정규식으로 덮어쓰지 않는다.

## 읽는 화면의 동작

도표의 막대·범례·트래픽 표식은 같은 Things 기준 범주 팔레트를 사용하며 그림 종류나 면적에 따라 색을 따로 지정하지 않습니다.

장면 탭은 클릭 또는 방향키·Home·End로 고릅니다. 선택한 탭만 Tab 순서에 들어갑니다. 그림 하나에 장면이 하나뿐이면 탭 줄이 없습니다. 코드 블록과 같은 조작부가 그림 면 안쪽에 놓입니다. 복사는 원본 문법을 복사하고 다운로드는 모든 장면을 담은 HTML을 저장합니다. 다운로드한 파일은 현재 시각이나 확대 배율을 저장한 화면 캡처가 아닙니다.

전체화면에서는 확대·축소·전체 보기가 나타납니다. 브라우저 전체화면을 허용하지 않는 삽입 환경에서는 부모 페이지가 대체 전체화면 메시지를 처리해야 합니다. 닫아도 선택한 장면과 재생 상태를 새로 만들지 않습니다. 좁은 화면용 배치는 빌드할 때 함께 만들며 화면에서 보기만 전환합니다.

라이트·다크와 움직임 줄이기는 공통 디자인과 재생 계약을 따릅니다. 반복 장면에는 일시정지 조작이 없으므로 본문에 정적인 구조 장면을 함께 제공하면 내용을 읽는 데 도움이 됩니다. 모든 브라우저·실제 기기의 검증을 마쳤다는 뜻은 아닙니다. 확인한 범위는 [표현 범위](design/expression-coverage.md#예제와-검증-범위)에 구분되어 있습니다.

## 문제가 있을 때

| 증상 | 먼저 확인할 것 |
|---|---|
| 첫 줄에서 문법 오류 | 설치판과 `daphnis 2`가 맞는지, 판 줄이 첫 의미 줄인지 |
| 이름을 찾지 못함 | 표시 이름 대신 식별자를 썼는지, 철자와 대소문자, 선언 순서 |
| 이동 경로를 찾지 못함 | 그래프에서는 연결을 먼저 선언했는지, 순서 보기에는 참여자가 있는지 |
| 움직이지 않음 | 장면이 `static`인지, SVG가 첫 정지 장면인지, 움직임 줄이기가 켜졌는지 |
| 이동 글이 겹침 | 같은 글을 연결과 이동 양쪽에 썼는지 |
| 큐 수가 두 번 변함 | 같은 사건을 `reserve`, `set`, `on`에서 중복 적용했는지 |
| 그림을 바꿨는데 SVG가 그대로 | `md` 또는 `render`를 다시 실행했는지, `--check`가 통과하는지 |
| 홈페이지에서만 `data`가 거절됨 | 삽입 빌드의 파일 읽기 금지 계약인지 |
| 차트 값이 거절됨 | 종류별 행 문법·계열 수·부호·결측·단위를 지켰는지 |
| 모바일에서 읽기 어려움 | 한 그림에 너무 많은 대상을 넣었는지, 세로 방향이나 보기 분리가 적절한지 |

자동 검사 통과는 읽기 쉬움의 전부가 아닙니다. 원본을 고친 뒤 본문 폭과 모바일 폭에서 라벨·선·탭·움직임을 직접 확인합니다. 개별 그림의 CSS나 좌표를 덧대기 전에 공통 배치와 부품의 문제인지 먼저 판단합니다.
