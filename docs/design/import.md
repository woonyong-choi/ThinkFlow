# 가져오기

| 항목 | 값 |
|---|---|
| 상태 | 구현 |

## 요약

`torso import <mermaid|dbml|d2|drawio|excalidraw>`는 다른 도구의 그림 원본을 `.torso` 원본으로 옮긴다. 다섯 형식의 읽기는 모두 공통 모형 하나를 채우고, 원본 글은 쓰는 곳 한 곳(`src/import/emit.js`)이 쓴다. 그래서 같은 뜻(카드, 그룹, 선, 외래 키, 메시지, 차트 행)은 형식과 상관없이 같은 Torso 문법 하나가 된다. 새 문법은 없다. Torso에 대응 문법이 없는 문장은 원본 줄 번호가 있는 경고와 함께 건너뛰고, 다르게 그리는 문장도 경고한다. 결과 파일은 새로 쓰기만 하고 이미 있는 파일을 바꾸지 않는다.

## 해결하는 문제

문서에 이미 Mermaid 순서도, DBML 스키마, D2 구성도가 있으면 같은 그림을 Torso로 처음부터 다시 적어야 했다. 손으로 옮기면 이름 규칙(소문자와 `-`), 외래 키가 기본 키를 가리켜야 한다는 규칙, 순서 보기의 참여자 순서처럼 Torso가 요구하는 것을 하나씩 맞춰야 하고, 옮기다 빠뜨린 문장은 알 길이 없다. 가져오기는 옮길 수 있는 것은 Torso 문법으로, 옮길 수 없는 것은 그 줄을 가리키는 경고로 남긴다.

## 사용 예

```text
flowchart LR
  client[Client] -->|HTTPS| gw(API Gateway)
  gw --> auth{Signed in?}
  auth -- yes --> db[(Orders DB)]
  auth -. no .-> reject((Reject))
  classDef hot fill:#f00
```

`torso import flow.mmd --out flow.torso`는 `flow.torso`를 쓰고 `flow.mmd:6: warning: style classes ("classDef") are not imported. ...`를 알린다.

```text
torso

box client "Client"
box gw "API Gateway"
decision auth "Signed in?"
store db "Orders DB"
box reject "Reject" shape=circle

client -> gw "HTTPS"
gw -> auth
auth -> db "yes"
auth -> reject "no" dashed
```

## 작동 방식

### 명령과 결과 파일

```text
torso import [mermaid|dbml|d2|drawio|excalidraw] <파일|-> [--out 파일.torso] [--json]
```

- 원본은 하나다. 형식을 적지 않으면 원본 확장자로 정한다(`.mmd`·`.mermaid`는 mermaid, `.dbml`, `.d2`, `.drawio`, `.excalidraw`). 표준 입력(`-`)은 확장자가 없으므로 형식을 적어야 한다. 형식을 모르거나, 원본이 없거나 둘 이상이거나, `--out`이 `.torso` 파일이 아니거나, 받지 않는 선택 사항(`--html`, `--static`, `--scene`, `--title`, `--strict`, `--budget`, `md` 전용 선택 사항)을 주면 사용법 오류(종료 2)다.
- `--out`이 없으면 옮긴 원본 글을 표준 출력에 쓴다(`--json`이면 `{"file":"원본","source":"..."}` 한 줄). `--out`이 있으면 그 파일에 쓰고 쓴 경로를 표준 출력에 알린다.
- 이미 있는 파일(심볼릭 링크 포함)은 바꾸지 않는다. `--out` 경로에 파일이 있으면 `{경로}: already exists. ...` 오류(code `output-exists`)다. 쓰기는 `render`와 같은 쓰기(`commitReported`)라 쓰는 순간에도 그사이 생긴 파일을 덮지 않는다.
- 종료 코드는 성공 0(경고 포함), 원본이나 쓰기 오류 1이다.
- 진단은 `render`와 같은 꼴이다. 원본의 문제는 `원본:줄: warning: 메시지`, `--json`이면 `{ file, line, message, severity, code, column }` 한 줄이다.

### 빌드 확인

옮긴 원본은 쓰기 전에 `buildFigure`로 한 번 만들어 본다.

- 그림 검사(code `check-N`)의 오류와 경고만 나오면 원본은 맞고 배치를 손볼 곳이다. 파일을 쓰고 그 진단을 새 파일의 줄과 함께 경고로 알린다. 예: 한 열로 들어오는 여러 외래 키 선과 다대다 관계선의 다중성 글이 겹치는 그림, 표가 많아 캔버스 폭에서 글이 작아지는 스키마. 고친 뒤 `render --strict`로 확인한다.
- 그 밖의 오류는 그대로 알리고 `the imported source does not build, so it is not written`(code `import`)을 덧붙이며 쓰지 않는다. 글꼴에 없는 글자(예: 한자)가 여기에 든다.

### 공통 모형

| 모형 | Torso |
|---|---|
| 카드 `box`, `circle`, `store`, `person`, `decision`, `queue`, `state`, `table` | `box`, `box ... shape=circle`, `store`, `person`, `decision`, `queue ... slots=N`, `state`, `table { 열 }` |
| 그룹(중첩, 방향) | `group id "이름" [direction=down] { }` |
| 선(라벨, 점선, 화살촉 `end`·`both`·`none`) | `a -> b "라벨" [dashed] [head=both\|none]` |
| 테이블 끝의 관계(다중성) | `a[.열] -> b[.열] relation=association from="..." to="..."` |
| 외래 키(열 하나, 여러 열, 삭제 동작, 다중성) | 열의 `fk=테이블.열 [ondelete=...] [from= to=]`, 테이블 안 `fk (열, ...) -> 테이블 (열, ...)` |
| 여러 열 키 | 테이블 안 `pk (열, ...)`, `unique (열, ...)` |
| 처음·끝 상태 | `start id`, `final id` |
| 메시지, 메모, 활성 구간, 구획 | `view sequence { }`와 장면 하나의 `a -> b "글" [dashed]`, `note`, `activate`, `deactivate`, `fragment alt\|loop\|opt\|par` |
| 원 차트 행 | `chart id "제목" pie { row "이름" value=N }` |
| 그림 방향 `down` | `view graph down`(`right`는 기본이라 적지 않는다) |

쓰는 곳이 Torso 규칙을 한 번에 맞춘다.

- 빈 그룹은 쓰지 않고 경고한다. 그 안의 그룹이 빠지면 카드는 가장 가까운 남은 그룹에 놓인다.
- 열이 없는 테이블은 상자로 쓰고 경고한다(Torso 테이블은 열이 하나 이상이다).
- 같은 방향의 같은 두 끝을 잇는 선은 하나로 합치고 라벨을 쉼표로 잇는다(경고). 자기 자신으로 가는 선(상태와 한 테이블의 서로 다른 두 열은 된다), 그룹과 그 안의 카드를 잇는 선은 건너뛴다(경고).
- 다중성과 관계 종류는 두 끝이 모두 테이블일 때만 쓴다. 한쪽이 상자면 다중성을 빼고 경고하며 화살촉 없는 선(`head=none`)으로 쓴다.
- 외래 키는 가리키는 열 묶음이 그 테이블의 기본 키나 고유 키 전체일 때만 `fk`로 쓴다. 아니면 같은 다중성의 관계선으로 쓰고 경고한다. `set null` 삭제는 참조하는 열을 `nullable`로 쓰고, 그 열이 `not null`이면 삭제 동작을 빼고 경고한다. 열이 자기 자신을 가리키는 참조는 건너뛴다.
- 두 상태를 잇는 전이에 사건 글이 없으면 `…`를 쓰고 경고한다. 메시지 글이 없을 때도 같다. 처음·끝 상태는 상태 카드만 될 수 있고 처음 상태는 하나다.
- 순서 보기의 참여자는 처음 보내는 순서로, 보내지 않는 참여자는 원본 순서대로 뒤에 놓는다(Torso 순서 보기 규칙). 원본 순서와 다르면 경고한다.

### 이름과 글

- 이름(id)은 원본 이름을 [`toId`](../../src/source/mistakes.js)로 고친 것(`OrderService` → `order-service`)이고, 테이블은 `-` 대신 `_`다. 영문자가 없는 이름(`주문`)은 `node`, `table`, `group`, `chart`로 시작한다. 겹치면 `-2`(테이블은 `_2`)를 붙인다. 보이는 이름은 원본 글 그대로다.
- 열 이름은 영문자로 시작하고 영문자, 숫자, `_`만 쓴다. 바꾼 이름은 그림에 보이는 글이 달라지므로 경고한다.
- 글의 줄바꿈과 `<br>`는 공백이다. 따옴표와 역슬래시는 이스케이프한다. 짝이 맞지 않는 백틱은 지우고 경고한다(Torso 글의 백틱 짝은 코드 구간이다). 기호가 든 열 타입은 따옴표 글이다(`"varchar(255)"`).

### Mermaid

머리말(`---` 사이)의 `title`은 그림 제목이고 다른 키는 경고한다. `%%` 주석 줄은 버리고 `%%{...}%%` 설정 줄은 경고한다. 첫 의미 줄이 그림 종류이고, 받지 않는 종류(`classDiagram`, `gantt` 등)는 그 줄의 오류(code `import`)다.

#### 순서도

| Mermaid | Torso | 경고 |
|---|---|---|
| `flowchart`/`graph` `TD`·`TB`, `LR` | 그림 방향 `down`, `right`. 방향이 없으면 `down` | 없음 |
| `RL`, `BT` | `right`, `down` | 바꿔 그림 |
| `a[글]`, `a(글)`, 이름만 | `box` | 없음 |
| `a{글}` | `decision` | 없음 |
| `a[(글)]` | `store` | 없음 |
| `a((글))` | `box shape=circle` | 없음 |
| `a(((글)))`, `a([글])`, `a[[글]]`, `a{{글}}`, `a[/글/]`, `a>글]` 등 | `box`(겹원은 원) | 바꿔 그림 |
| `-->`, `---`, `<-->` | 선, `head=none`, `head=both` | 없음 |
| `-->\|글\|`, `-- 글 -->` | 라벨 | 없음 |
| `-.->`, `-. 글 .->` | `dashed` | 없음 |
| `==>`, `== 글 ==>` | 보통 선 | 굵기 없음 |
| `--o`, `--x` | 화살촉 | 바꿔 그림 |
| `a & b --> c`, `a --> b --> c` | 선 여러 개 | 없음 |
| `subgraph id [제목] ... end`(중첩), 안의 `direction` | `group`(방향을 적지 않으면 바깥 방향) | 없음 |
| subgraph 이름을 선 끝으로 | 그룹으로 가는 선 | 없음 |
| `~~~` | 없음 | 건너뜀 |
| `style id stroke-dasharray: ...`(0이 아닌 간격) | subgraph는 `group ... dashed`, 상자는 `external`(점선 윤곽 카드) | 다른 모양은 모양을 지키고 알림, 같은 줄의 색·굵기는 건너뜀 |
| `classDef`, `class`, `linkStyle`, `click`, `accTitle`, `accDescr`, `:::클래스`, `@{ ... }`, `style`의 색·굵기 | 없음 | 건너뜀 |

#### 순서 그림

| Mermaid | Torso | 경고 |
|---|---|---|
| `participant a [as 이름]`, `actor a`, 메시지에 처음 나온 이름 | `box`, `person` 참여자 | 없음 |
| `participant a@{ "type": "database" }` | `store` | 다른 종류는 상자로 바꿔 그림 |
| `->>`, `->` | 메시지 | 없음 |
| `-->>`, `-->` | `dashed` 메시지 | 없음 |
| `-x`, `-)`, `<<->>` | 메시지(한 방향) | 바꿔 그림 |
| `a->>+b`, `a-->>-b`, `activate`, `deactivate` | 메시지 뒤 `activate b`, `deactivate a` | 메시지 바로 뒤가 아니거나 구획 안, 겹친 활성, 열지 않은 비활성은 건너뜀 |
| `Note right of a`, `left of`, `over a,b` | 바로 앞 메시지의 참여자에 붙는 `note` | 앞 메시지가 없거나 그 참여자가 아니면 건너뜀 |
| `alt` / `else` | `fragment alt "첫 조건" choose="첫 조건" { branch ... }` | 대안이 하나면 `opt` |
| `loop 글` | `fragment loop "글" times=1` | 없음 |
| `opt 글` | `fragment opt "글" run=on` | 없음 |
| `par` / `and` | `fragment par { branch ... }` | 대안이 하나면 구획 없이 |
| `critical`/`option`, `break`, `rect`, `box` | 구획 없이 안의 메시지만 | 바꿔 그림 |
| `create participant`, `destroy` | 다음 메시지의 `create`, `destroy` | 구획 안이거나 보내는 쪽 소멸은 건너뜀 |
| `title` | 그림 제목과 장면 이름 | 없음 |
| `autonumber`, `links`, `properties`, `accTitle` | 없음 | 건너뜀 |

Mermaid `loop`와 `opt`에는 횟수와 재생 여부가 없으므로 한 번 재생(`times=1`, `run=on`)으로 쓴다. 장면은 하나이고 이름은 `title`이나 `sequence`다.

#### 상태 그림

| Mermaid | Torso | 경고 |
|---|---|---|
| `a --> b : 사건` | `a -> b "사건"` | 사건이 없으면 `…` |
| `[*] --> a`, `a --> [*]` | `start a`, `final a` | 둘째 처음 상태, 상태가 아닌 끝, 처음·끝 전이의 사건은 건너뜀 |
| `state "글" as a` | `state a "글"` | 없음 |
| `state a <<choice>>` | `decision` | `fork`, `join`은 상태로 바꿔 그림 |
| `state a { ... }` | `group`(안의 `[*] --> b`는 묶음으로 들어오는 전이가 닿을 상태) | 묶음으로 들어오는 전이는 그 상태로 바꿔 그림, 묶음에서 나가는 전이와 안의 끝은 건너뜀 |
| `direction` | 그림·그룹 방향(기본 `down`) | 없음 |
| `a : 설명`, `note`, `--`, `classDef`, `class`, `style` | 없음 | 건너뜀 |

#### 개체 관계 그림

| Mermaid | Torso | 경고 |
|---|---|---|
| 속성이 있는 개체 `A { 타입 이름 PK }` | `table` | 없음 |
| 속성이 없는 개체 | `box` | 바꿔 그림 |
| `PK`, `UK` | `pk`, `unique` | 없음 |
| `FK`, 속성 설명 | 없음 | 건너뜀(가리키는 열이 원본에 없다) |
| `A \|\|--o{ B : 글` | `a -> b "글" relation=association from="1" to="0..*"` | 없음 |
| 기수 `\|o`, `\|\|`, `}o`, `}\|` | `0..1`, `1`, `0..*`, `1..*` | 없음 |
| `..`(식별하지 않는 관계) | `dashed` | 없음 |

#### 원 차트

`pie [showData] [title 글]`, `title 글`, `"이름" : 값`은 `chart id "제목" pie { row "이름" value=값 }`이다. Torso 원 차트는 값을 늘 적으므로 `showData`는 같은 뜻이다. 0 이하이거나 숫자가 아닌 값은 건너뛴다. 제목이 없으면 `pie`다.

### DBML

| DBML | Torso | 경고 |
|---|---|---|
| `Project 이름 { }` | 그림 제목 | 안의 설정은 건너뜀 |
| `Table [schema.]이름 [as 별칭] { }` | `table`(별칭은 참조에서 푼다) | 표 설정(`[headercolor: ...]`)은 건너뜀 |
| 열 `이름 타입 [설정]` | 열 줄(타입은 원본 글 그대로) | 없음 |
| `pk`, `primary key`, `unique`, `not null`, `null` | `pk`, `unique`, `required`, `nullable` | 없음 |
| `default`, `note`, `increment`, `check` | 없음 | 건너뜀 |
| `indexes { (a, b) [pk] }`, `[unique]` | `pk (a, b)`, `unique (a, b)`(열 하나면 열 표시) | 그 밖의 색인은 건너뜀 |
| `ref: > t.c`, `Ref: a.x > b.y`, 블록 `Ref { }` | `fk=b.y from="*" to="1"` | 없음 |
| `<` | 두 끝을 바꾼 `>` | 없음 |
| `-`(일대일) | 키를 가리키는 쪽에서 `fk=... from="1" to="1"` | 없음 |
| `<>`(다대다) | `relation=association from="*" to="*"` 관계선 | 없음 |
| `a.(x, y) > b.(x, y)` | `fk (x, y) -> b (x, y)` | 없음 |
| `[delete: cascade\|restrict\|set null\|no action]` | `ondelete=cascade\|restrict\|set-null\|no-action` | `update`, `set default`, 색은 건너뜀 |
| `Enum 이름 { 값 }` | `box id "이름" "enum" { text "값" mono }`, 타입이 그 enum인 열에서 카드로 선 | 값 설정은 건너뜀 |
| `TableGroup 이름 { 테이블 }` | `group` | 없는 테이블, 두 번째 묶음은 건너뜀 |
| 표 `Note`, `TablePartial`, `Records` 등 | 없음 | 건너뜀 |

DBML에는 방향이 없어 Torso 기본(`right`)으로 쓴다.

### D2

| D2 | Torso | 경고 |
|---|---|---|
| `a`, `a: 글`, `a.label: 글`, `a: { label: 글 }` | `box a "글"`(라벨이 없으면 키) | 없음 |
| `a.b.c`, `a: { b }`, `_.c` | 중첩 `group`과 그 안 카드(이름은 경로 `a-b-c`) | 없음 |
| `->`, `<-`, `<->`, `--` | `a -> b`, `b -> a`, `head=both`, `head=none` | 없음 |
| `a -> b -> c: 글` | 선마다 같은 라벨 | 없음 |
| `shape: rectangle`, `square` | `box` | 없음 |
| `cylinder`, `person`, `diamond`, `circle` | `store`, `person`, `decision`, `box shape=circle` | 없음 |
| `queue` | `queue ... slots=4` | 칸 수가 없어 4로 바꿔 그림 |
| `sql_table`과 `열: 타입 {constraint: primary_key\|unique}` | `table`과 열 줄 | 없음 |
| `foreign_key` 열에서 다른 열로 가는 라벨 없는 화살표 | `fk=테이블.열`(DBML 참조와 같은 문법) | 화살표가 없는 표시는 건너뜀 |
| 그 밖의 shape | `box` | 바꿔 그림 |
| 컨테이너의 shape | 그룹 | 바꿔 그림 |
| `direction: right\|down` | 그림·그룹 방향(기본 `down`, D2와 같다) | `left`, `up`은 같은 축으로 바꿔 그림 |
| `\|md ...\|` 블록 글 | 한 줄 글 | 바꿔 그림 |
| `style.stroke-dash: n`(n > 0) | 선은 `dashed`, 컨테이너는 `group ... dashed`, 상자는 `external`(점선 윤곽 카드) | 다른 모양은 모양을 지키고 알림 |
| 맨 위의 `title: 글 {shape: text ...}`(D2 그림 제목 관례) | 그림 제목 `title "글"` | 없음 |
| 그 밖의 `style`, `icon`, `tooltip`, `link`, `near`, `width`, `height`, `class`, `vars`, `layers`, `scenarios`, `steps`, `(a -> b)[0]`, `*` 글롭, `...@`, `null` | 없음 | 건너뜀 |

D2 키는 대소문자를 가리지 않아 소문자로 견주고, 보이는 이름은 처음 쓴 꼴이다.

### draw.io

draw.io(diagrams.net)는 좌표가 있는 손 그림이다. 좌표, 색, 글꼴, 꺾은 점은 옮기지 않고 도형과 연결의 뜻만 옮기며 Torso가 다시 배치한다(`src/import/drawio.js`, 셀 읽기는 `drawio-parse.js`). 손 그림 두 형식이 같이 쓰는 판단(흐름 방향, 제목, 글 없는 도형)은 `src/import/drawn.js` 한 곳이다.

| draw.io | Torso | 경고 |
|---|---|---|
| 도형 셀(`vertex="1"`)과 라벨(`value`, `UserObject`·`object`의 `label`) | `box id "글"`. 이름(id)은 라벨에서 만든다(셀 id는 뜻이 없다) | 글 없는 도형은 `…`로 쓰고 알림 |
| `html=1` 라벨 | 태그를 지운 한 줄 글(줄 바꿈 태그는 공백, 문자 참조는 풂) | 없음 |
| `ellipse`, `rhombus`, `shape=cylinder3`, `shape=umlActor` | `box shape=circle`, `decision`, `store`, `person` | 없음 |
| `dashed=1` 상자 | `external`(점선 윤곽 카드) | 없음 |
| 그 밖의 `shape=` | `box` | 바꿔 그림 |
| `swimlane`, `container=1` | `group`(`dashed=1`이면 `dashed`) | 라벨이 없으면 `그룹`으로 쓰고 알림 |
| 보이지 않는 묶음(`group`) | 없음. 안의 셀을 바깥 그룹으로 꺼냄 | 없음 |
| 연결선(`edge="1"`)의 `source`, `target`과 라벨, 선에 붙은 라벨 셀(`edgeLabel`) | `a -> b "글"`(라벨은 이어 씀) | 없음 |
| `endArrow=none`, `startArrow=…` | `head=none`, `head=both`, 시작 쪽에만 있으면 방향을 뒤집는다 | 없음 |
| `dashed=1` 선 | `dashed` | 없음 |
| 모든 도형보다 위의 자유 글(`text`) | 그림 제목 `title "글"` | 없음 |
| 그 밖의 자유 글, 한쪽 끝이 비어 있는 선 | 없음 | 건너뜀 |
| 둘째 쪽부터(`diagram`) | 없음 | 건너뜀(쪽마다 파일로 저장) |

압축한 쪽(deflate, base64, URI 인코딩)은 풀어서 읽고, 그 쪽 셀의 경고 줄은 쪽(`diagram` 태그)의 줄이다. 풀 수 없는 쪽은 오류(code `import`)다. 흐름 방향은 연결된 두 도형 가운데 사이의 가로·세로 거리 합으로 고른다(가로가 길거나 같으면 `right`).

### Excalidraw

Excalidraw(`.excalidraw` JSON)도 손 그림이라 draw.io와 같은 기준으로 뜻만 옮긴다(`src/import/excalidraw.js`).

| Excalidraw | Torso | 경고 |
|---|---|---|
| `rectangle`, `ellipse`, `diamond`와 그 안의 글(`containerId`) | `box`, `box shape=circle`, `decision` | 글 없는 도형은 `…`로 쓰고 알림 |
| 점선(`strokeStyle` `dashed`·`dotted`) 사각형 | `external` | 없음 |
| `frame`과 그 안 요소(`frameId`) | `group`(이름 없는 프레임은 `Frame`) | 없음 |
| 두 끝이 도형에 묶인 `arrow`(`startBinding`, `endBinding`)와 화살표 글 | `a -> b "글"`, 화살촉 유무로 `head`, 점선은 `dashed` | 없음 |
| 모든 도형보다 위의 자유 글 | 그림 제목 | 없음 |
| 그 밖의 자유 글, 묶이지 않은 화살표, `line`, `freedraw`, `image`, 삽입 페이지 | 없음 | 건너뜀 |
| 지운 요소(`isDeleted`), 선택 묶음(`groupIds`) | 없음 | 없음 |

JSON에는 문장 줄이 없어 경고 줄은 그 요소 id가 처음 나오는 줄이다.

### 경고와 오류

| code | 뜻 |
|---|---|
| `import-skip` | 받지 않아 건너뛴 문장. 메시지는 무엇을 건너뛰었는지와 이유다 |
| `import-change` | 받았지만 모양이나 글을 바꿔 옮긴 문장 |
| `import` | 그림 종류를 모르거나 옮길 카드가 없는 원본(오류), 옮긴 원본이 빌드되지 않음(오류) |
| `output-exists` | 결과 파일이 이미 있음(오류) |

줄은 받은 원본의 줄이다. 같은 줄의 같은 메시지는 한 번만 낸다.

### 공개 함수

`importDiagram(format, text)`(`torso` 진입점)는 `{ source, warnings }`를 돌려주고 파일을 다루지 않는다. 그림 종류를 모르거나 옮길 카드가 없으면 `FigureError`(code `import`), 모르는 형식은 `TypeError`다. 빌드 확인은 명령만 한다. 형식 이름 목록은 `IMPORT_FORMATS`다.

### 파서 의존성

외부 파서 패키지를 쓰지 않는다. 파서는 이 저장소의 작은 읽기다(`src/import/`의 `mermaid*.js`, `dbml-parse.js`, `d2-parse.js`, `drawio-parse.js`). Excalidraw는 JSON이라 `JSON.parse`로 읽고, draw.io의 압축한 쪽은 Node 내장 `zlib`으로 푼다.

- Mermaid 공식 패키지(`mermaid`)는 렌더러와 DOM 정리 도구를 함께 설치하고, 문법 읽기(`mermaid.parse`)도 브라우저 환경을 전제한다.
- DBML 공식 파서(`@dbml/core`)는 SQL 방언 변환기까지 포함한 큰 패키지이고, 가져오기에 필요한 것은 Table, Ref, Enum, TableGroup의 문장 모양뿐이다.
- D2 공식 파서는 Go로 작성되어 Node에서는 WASM 묶음으로만 부를 수 있다.

직접 쓴 파서는 위 표의 문장만 알아보고, 모르는 문장은 오류로 멈추지 않고 줄 번호가 있는 경고로 건너뛴다. 공식 문법의 모든 꼴(예: Mermaid의 새 노드 모양 `@{ shape: ... }`, D2의 `vars`와 `layers`)을 읽지 않는다는 한계는 위 표의 경고로 드러난다.

### 요구사항

| 요구사항 | 검증 계획 |
|---|---|
| Mermaid 순서도의 모양, 라벨 선, 점선, 굵은 선, 중첩 subgraph가 표대로 옮겨지고 strict로 빌드된다. 꾸밈 문장은 그 줄의 경고다 | `test/import.test.js`(IM1) |
| Mermaid 순서 그림의 참여자, 메시지, 메모, 활성 구간, 네 구획이 옮겨지고 참여자 순서를 고친 것을 알린다 | `test/import.test.js`(IM2) |
| Mermaid 상태 그림의 처음·끝, 사건, 묶음, 갈림길이 옮겨지고 빠진 사건과 메모를 그 줄에서 알린다 | `test/import.test.js`(IM3) |
| Mermaid 개체 관계 그림의 테이블, 키, 다중성, 점선 관계가 옮겨지고 속성 없는 개체와 설명을 알린다 | `test/import.test.js`(IM4) |
| Mermaid 원 차트가 차트 카드가 되고 0 이하의 조각을 알린다 | `test/import.test.js`(IM5) |
| 모르는 그림 종류는 그 줄의 오류이고, 모르는 문장은 그 줄의 경고다(조용히 버리지 않는다) | `test/import.test.js`(IM6) |
| DBML 테이블, 키, null 규칙, 인라인·별도 참조, 다대다, 여러 열 키와 외래 키, enum, 테이블 묶음이 옮겨지고 건너뛴 설정을 그 줄에서 알린다 | `test/import.test.js`(IM7) |
| D2 노드, 라벨, 화살표 넷, 컨테이너, shape, direction, sql_table과 외래 키가 옮겨지고 꾸밈과 바꾼 모양을 알린다 | `test/import.test.js`(IM8) |
| 명령이 원본 옆이나 `--out`에 새 파일만 쓰고, 표준 입력, `--json`, 겹침, 이미 있는 파일, 사용법 오류가 위 계약대로다. 옮긴 파일은 `render --strict`가 통과한다 | `test/import.test.js`(IM9) |
| 그림 검사 오류만 있는 옮긴 원본은 쓰고 새 파일의 줄로 경고한다 | `test/import.test.js`(IM10) |
| D2·Mermaid의 점선 선·컨테이너·상자와 D2 제목 관례, 한글 이름의 Mermaid namespace가 옮겨진다 | `test/import.test.js`(IM12) |
| draw.io의 도형 모양, 컨테이너, HTML·라벨 셀 글, 점선과 화살촉, 압축한 쪽이 옮겨지고 둘째 쪽과 떨어진 선을 그 줄에서 알린다 | `test/import.test.js`(IM13) |
| Excalidraw의 도형과 글, 프레임, 묶인 화살표와 화살표 글, 맨 위 자유 글 제목이 옮겨지고 옮길 수 없는 요소를 그 줄에서 알린다 | `test/import.test.js`(IM14) |
| 옮긴 그림이 실제 화면에서 읽힌다 | 대표 예(IM1~IM8, IM13, IM14의 원본)를 Chromium으로 렌더해 직접 봤다. 범위는 [예제와 검증 범위](expression-coverage.md#예제와-검증-범위) |

## 단점

- 원본 도구의 배치를 옮기지 않는다. Torso 배치는 elkjs가 다시 하므로 노드 자리, 선 길이(`---->`), 순서도 노드의 등장 순서에 따른 자리가 달라진다.
- 꾸밈(색, 굵기, 아이콘)은 디자인 토큰이 정하므로 모두 건너뛴다. 원본에서 색으로만 구분한 뜻은 경고를 보고 `tone=`이나 라벨로 다시 적어야 한다.
- 큰 스키마나 순서도는 Torso 그림 검사(글 크기, 비율, 라벨 겹침)에 걸릴 수 있다. 파일은 쓰지만 그림을 나누거나 방향을 바꾸는 손질이 필요하다.
- 빠진 필수 글은 `…`로 채운다. 원본에 없는 뜻을 지어내지 않으려는 선택이지만 그대로 두면 그림에 `…`가 보인다.

## 대안

- 공식 파서 패키지를 쓰는 것: 문법을 빠짐없이 읽지만 위 [파서 의존성](#파서-의존성)의 크기와 실행 환경 문제가 있고, 읽은 뒤 Torso로 옮기는 대응 표는 어차피 직접 써야 한다.
- `render`가 Mermaid나 D2를 바로 읽는 것: 읽는 확장자는 `.torso`뿐이라는 원본 규칙과 맞지 않고, 원본을 고칠 곳(경고)을 남길 자리가 없다. 가져오기는 한 번 옮긴 뒤 Torso 원본을 고쳐 쓰는 흐름이다.
