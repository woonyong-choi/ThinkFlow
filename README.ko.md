# daphnis

[English](README.md) | 한국어

`.dap` 텍스트 원본 하나를 문서용 움직이는 SVG 그림으로 바꿉니다. 구조, 순서, 상태, 스키마, 클래스, 추적과 차트를 그리고, 점이 닿을 때 값이 바뀌는 모습까지 보입니다.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/daphnis-lockup-dark.svg">
    <img src="docs/assets/daphnis-lockup-light.svg" alt="daphnis" width="260">
  </picture>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/showcase/async-orders-ko-dark.svg">
    <img src="docs/assets/showcase/async-orders-ko-light.svg" alt="네 곳의 주문이 이벤트 큐로 들어가 재고, 결제, 알림 소비자로 퍼지고, 큐가 차오르며 메일 하나가 유실되는 그림" width="100%">
  </picture>
</p>

그림 안의 점은 저마다 다른 시각에 출발해 다른 속도로 움직입니다. 그래서 한 장면에 여러 흐름이 동시에 돌고, 점이 닿을 때 값이 바뀌고, 큐가 차오르고, 메시지가 도중에 유실되는 모습이 보입니다. 원본은 카드(상자, 테이블, API, 클래스, 격자, 차트, 추적)를 선언하고 장면을 차례로 적습니다. `view` 줄이 적지 않은 카드는 기본 보기를 받고(대부분의 카드는 그래프, 선이 없는 차트는 차트 보기, 추적은 시간 보기), 직접 고르려면 `view graph`, `view sequence`, `view plot`, `view time`을 씁니다. 같은 카드가 여러 보기에 놓일 수 있고, 사건 하나가 모든 보기에서 함께 움직입니다. daphnis는 그림에 넣는 글꼴 파일로 글을 재고, elkjs로 배치하고, 겹침을 검사한 뒤, 움직이는 SVG나 HTML 재생기를 씁니다.

## 작동 방식

```text
daphnis 2
title "Saturn"

person user "Developer"
group system "Saturn" direction=down {
  box tui "Screen"
  box engine "Engine"
}
external codex "Codex CLI"

user -> tui "input"
tui -> engine "JSON-RPC"
engine -> codex "app-server request"

scene "Chat"
  user -> tui "question"
  show tui "why does this test fail?" tag="you"
  tui -> engine
  engine -> codex "turn" time=3s
```

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/how-it-works-dark.svg">
  <img src="docs/assets/how-it-works-light.svg" alt="위 원본으로 그린 그림: 개발자의 질문이 Screen에서 Engine을 거쳐 Codex CLI로 갑니다">
</picture>

1. 첫 줄은 문법 판 `daphnis 2`입니다. 그다음 카드와 선, 필요하면 `view` 줄, `scene`부터 장면을 적습니다. 여기에는 보기를 적지 않았습니다. 카드는 왼쪽에서 오른쪽으로 놓이는 그래프 하나에 기본으로 담깁니다. 장면은 이름 하나를 갖고, 재생 방식 `mode`(`static`, `once`, `loop`)는 적지 않으면 줄이 있는 장면은 `once`, 빈 장면은 `static`입니다. 설명은 그림 밖 문서 본문이 맡습니다.
2. daphnis가 `system` 안 카드는 위에서 아래로, 나머지는 왼쪽에서 오른쪽으로 놓습니다.
3. 첫 박자에 점이 `user`에서 `tui`로 가고, 점이 닿을 때 `tui` 안 카드가 채워집니다.
4. `engine -> cdex` 같은 오타는 `how-it-works.dap:19: unknown card "cdex". Did you mean "codex"? Declared: codex, engine, system, tui, user`를 내고 멈춥니다.

## 설치

Node.js 20 이상이 필요합니다. 현재 소스는 `daphnis 2`를 사용합니다. npm 배포판 `0.1.3`은 이전 문법이므로 이 문서의 예제에는 현재 소스를 설치합니다.

```sh
npm install --save-dev github:woonyong-choi/daphnis#main
```

`npx daphnis <명령>`으로 실행합니다. 패키지에는 Node.js용 ESM API와 TypeScript 선언도 포함됩니다.

## 갤러리

<table>
  <tr>
    <td width="50%"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/showcase/order-rush-ko-dark.svg"><img src="docs/assets/showcase/order-rush-ko-light.svg" alt="웹, 앱, 제휴사의 주문이 주문 API에 함께 들어오고 처리 중 개수와 재고가 바뀌는 그림" width="100%"></picture><br>시뮬레이션: 동시에 흐르며 값이 바뀝니다. <a href="docs/reference/flow.md">구조 그림</a></td>
    <td width="50%"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/showcase/shop-schema-ko-dark.svg"><img src="docs/assets/showcase/shop-schema-ko-light.svg" alt="주문이 사용자를, 주문 항목이 주문과 상품을 외래 키로 가리키는 쇼핑몰 테이블 그림" width="100%"></picture><br>스키마: 테이블, 키, 외래 키. <a href="docs/reference/data.md">데이터 관계 그림</a></td>
  </tr>
  <tr>
    <td width="50%"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/showcase/oauth-ko-dark.svg"><img src="docs/assets/showcase/oauth-ko-light.svg" alt="사용자, 앱, 인가 서버, API 사이의 OAuth 인가 코드와 PKCE 순서 그림" width="100%"></picture><br>순서: 메시지가 오가는 차례. <a href="docs/reference/sequence.md">순서 그림</a></td>
    <td width="50%"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/showcase/latency-ko-dark.svg"><img src="docs/assets/showcase/latency-ko-light.svg" alt="엔드포인트별 p95 지연을 캐시를 넣기 전과 뒤로 비교한 덤벨 차트" width="100%"></picture><br>차트: 기준값과 개선 값. <a href="docs/reference/charts.md">차트</a></td>
  </tr>
  <tr>
    <td width="50%"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/showcase/cloud-architecture-ko-dark.svg"><img src="docs/assets/showcase/cloud-architecture-ko-light.svg" alt="클라우드 구성도: 웹 요청이 DNS, CDN, 로드 밸런서, 웹 서버를 거쳐 앱 서버로 가고, 운영자는 VPN과 배스천을 거쳐 앱 서버에 닿습니다" width="100%"></picture><br>구성도: 그룹, 아이콘, 번호 붙은 선. <a href="docs/reference/architecture.md">구성도</a></td>
    <td width="50%"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/showcase/order-state-ko-dark.svg"><img src="docs/assets/showcase/order-state-ko-light.svg" alt="주문이 생성됨에서 결제됨, 배송 중, 배송 완료로 가고 취소됨이 다른 끝 상태인 상태 그림" width="100%"></picture><br>상태: 상태와 그 사이의 이동. <a href="docs/reference/state.md">상태 그림</a></td>
  </tr>
</table>

[예제](examples/) 폴더에는 지원하는 표현마다 예제가 하나씩 있습니다. 차트 열여섯 종류와, 구성도, 흐름, 상태, 스키마, 클래스, API, 순서, 추적, 지표, 메모리, 스택, 큐, 포인터, 그리고 흐름, API, 스키마, 지표, 차트를 한 문서로 잇는 통합 그림입니다. `npm run catalog`가 모든 예제를 원본과 함께 `.local/examples/index.html`에 만듭니다. 예제의 수치는 모두 기능을 설명하려고 만든 예시 데이터입니다.

## 사용법

처음 쓰면 [상세 사용법](docs/usage.md)에서 설치부터 그림 작성, 애니메이션, 본문 삽입과 공개 API까지 순서대로 확인합니다.

### 그림 하나 만들기

[작동 방식](#작동-방식)의 원본을 `how-it-works.dap`으로 저장하고 실행합니다.

```sh
npx daphnis render how-it-works.dap --html
```

```text
how-it-works.svg
how-it-works.html
```

SVG는 스크립트 없이 움직이고 첫 장면을 그 `mode`대로 재생합니다. `--scene 2`나 `--scene "Chat"`으로 다른 장면을 고릅니다. 숫자로만 된 장면 이름은 `--scene`이 장면 번호로 읽으므로 오류입니다. HTML에는 장면 탭과 그림 위 도구막대가 더해지고, 장면은 스스로 다음 장면으로 넘어가지 않습니다. 도구막대는 단독이든 삽입이든 모든 그림이 같고, 왼쪽부터 `.dap` 원본 복사, 독립 실행 HTML 내려받기, 전체 화면(확대 포함) 세 가지입니다. 도구막대는 그림마다 원본에서 정하지 않습니다. 재생, 일시정지, 배속, 반복 단추는 없고 장면의 `mode`가 재생 방식을 정합니다. `--static`은 고른 장면의 마지막 상태를 멈춘 SVG로 씁니다. 점과 펄스는 없고, 값, 카드, 차트는 마지막 상태이며, 그 장면이 켜 둔 `light`는 남습니다. 장면이 없는 문서는 선언한 값을 보이는 정지 그림입니다. `<img>`로 넣은 움직이는 SVG는 Chrome에서 `prefers-reduced-motion`을 따르지 못합니다. 문서에 직접 넣거나 파일을 직접 열거나, `<picture>`의 `media` 소스에 `--static` SVG를 지정합니다.

### 그림 검사하기

```sh
npx daphnis check how-it-works.dap --strict --json
```

오류와 경고가 없으면 아무것도 출력하지 않고 0으로 끝납니다. `--strict`는 경고도 실패로 칩니다. `--json`은 진단마다 `{ file, line, message, severity, code, column }` 한 줄을 출력합니다. 그림이 예산보다 많은 양(예를 들어 수십만 칸의 격자)을 만들어야 하면 파일을 쓰기 전에 `budget-exceeded` 오류로 실패하고, `--budget grid-elements=2000000`으로 올립니다. `render`, `check`, `gallery`, `md`가 모두 `--budget 이름=값`을 받습니다.

### 마크다운 문서에 그림 넣기

원본을 `dap` 코드 블록으로 쓰고 `daphnis md`를 실행합니다.

````text
```dap name=request
daphnis 2
box client "Client"
box server "Server"
client -> server "GET /orders"
```
````

```sh
npx daphnis md guide.md
```

명령은 문서 옆에 `guide-request.svg`를 쓰고 블록 바로 아래에 `![request](guide-request.svg)<!-- dap -->`를 넣습니다. 대체 글은 블록의 `title`이고, `title`이 없으면 이름입니다. 다시 돌려도 아무것도 바뀌지 않습니다.

`dap` 블록 이름을 바꾸면 옛 SVG가 지워지고, `--out-dir images`는 SVG를 그 폴더에 쓰고 이미지 줄이 그곳을 가리키게 하며(이미 문서 옆에 있던 SVG는 그대로 남으므로 직접 지웁니다), `--check`는 쓰지 않고 문서나 SVG가 낡았으면 종료 코드 1로 끝납니다. `--fold`는 그림을 먼저 보이고 `dap` 블록을 `<details>` 안에 접으며(`--fold-title "글"`로 요약 글을 정합니다), `--unfold`는 daphnis가 만든 접기만 되돌리고, 옵션이 없으면 문서의 접힘 상태를 그대로 둡니다. GitHub Action은 `fold`, `fold-title` 입력으로 같은 선택을 받습니다. 문서는 자기가 만든 SVG만 쓰고 지웁니다. 블록이 다른 문서가 만든 SVG나 `daphnis md` 표시가 없는 파일을 덮어쓰려 하면 충돌로 알리고, 같은 출력 폴더에는 두 실행이 동시에 쓰지 못합니다. 어느 블록이든 오류가 있으면 아무 파일도 쓰기 전에 멈춥니다. 규칙은 [마크다운](docs/design/markdown.md)에 있습니다.

### CI에서 최신으로 지키기

아래 GitHub Action 단계는 원본에 경고가 있거나 마크다운 그림이 낡았을 때 PR을 실패시킵니다.

```yaml
- uses: actions/checkout@v4
- uses: woonyong-choi/daphnis@main
  with:
    paths: "docs/**/*.dap docs/**/*.md README.md"
    mode: check   # check(기본) 또는 render
    strict: true  # 경고도 실패
    budget: "grid-elements=2000000"  # 선택: 생성 예산을 올림
```

`paths`는 추적 중인 파일에 쓰는 git 글롭입니다. `mode: render`는 SVG와 이미지 줄을 쓰지만 커밋하지는 않습니다. 맞는 파일이 하나도 없으면 단계가 실패합니다. `budget`은 공백이나 쉼표로 나눈 `이름=값` 목록으로 생성 예산을 올리며(`--budget`과 같습니다), 이름이나 값이 틀리면 그림을 만들기 전에 단계가 실패합니다.

### JavaScript와 TypeScript에서 빌드

```js
import { buildFigure, toSvg, toHtml } from 'daphnis';

const result = await buildFigure('daphnis 2\nbox server "Server"\n', { allowFileAccess: false });
const svg = await toSvg(result);
const html = await toHtml(result, 'Server');
```

세 함수 모두 Promise를 반환합니다. 빌드 결과는 렌더러에 그대로 전달하고 진단은 `result.warnings`에서 읽습니다. 원본이나 배치 오류는 공개된 `FigureError`를 잡아 `problems`에서 읽습니다. [API 사용법](docs/usage.md#javascript에서-조립하기)에 옵션, 진단 필드와 불투명한 `BuiltFigure` 타입이 정의되어 있습니다.

### 문법 판

원본은 `daphnis 2`로 시작해야 하고 `.dap` 파일만 읽습니다. 다른 판으로 시작하거나 판 줄이 없으면 읽지 않습니다. 줄과 자리를 알리는 진단을 내고 파일을 쓰지 않은 채 멈춥니다. 옛 파일을 고쳐 쓰는 명령은 없으므로 현재 문법으로 다시 씁니다. 없어진 문장과 대체 문장은 [그림 문법](docs/design/figure-syntax.md#판과-없앤-형태)의 표에 있습니다.

## 기능

- 장면: 장면은 이름 하나, 재생 방식 `mode`(`static`은 마지막 상태, `once`는 한 번, `loop`는 되풀이), 배속 `speed`를 가집니다. 흐름은 저마다 다른 시각과 속도로 출발하고, 점이 닿을 때 값이 바뀌고, 큐가 차오르고, 점이 도중에 유실됩니다. 조건, 시간 제한이 있는 기다림, 원자적 예약이 점의 출발을 정합니다.
- 카드와 보기: 상자, 사람, 외부 시스템, 저장소, 갈림길, 큐, 상태, 테이블, API 카드, 클래스와 인터페이스, 칸 격자, 차트, 추적. 그래프 보기는 카드를 배치하고, 순서 보기는 메시지를 늘어놓고(대안 선택, 정해진 횟수의 반복, 병렬 대안, 선택 구간, 생성과 소멸, 활성 구간), 차트 보기는 차트 하나를, 시간 보기는 추적 하나를 실제 시간 축에 보입니다.
- 사건과 함께 움직이는 값: 카드가 값을 보이고, 차트 행이 그 값을 읽고, 같은 사건이 둘을 함께 바꿉니다. 바뀐 표식은 잠깐 밝아지고 축은 움직이지 않습니다.
- 구성도: `no=`는 선 번호라 정지 그림에서도 순서가 읽히고, `badge=`는 흑백에서도 남는 짧은 글자 배지, `count=`는 같은 역할 복제 N개를 겹쳐 그립니다. `icon=`은 내장 아이콘이나 `icons 이름 "폴더"`로 등록한 내 세트를 씁니다.
- 칸 격자: 비트 필드, 배열, 스택, 행렬을 칸 단위로 그리고, 선이 칸 하나에서 나가고 들어옵니다.
- 차트: 막대, 누적 막대, 퍼센트 누적, 덤벨, 차이, 선, 계단, 면적, 산점도, 히스토그램, 상자, 누적분포(ECDF), 히트맵, 도넛, 원, 워터폴. 계열은 둘로 제한하지 않습니다. 색만으로 구분하지 않아 점 모양은 계열 번호를 따르고, 선, 계단, 면적, 누적분포는 끝 이름을, 막대, 산점도, 원과 도넛은 번호 키를 쓰며, 색이 일곱을 넘으면 무늬가 더해집니다. 빠진 값은 0이 아닙니다(히스토그램은 빠진 표본을 개수에서 빼고, 워터폴은 빠진 증감 뒤의 누계를 알 수 없으며, 상자는 숫자가 빠지면 상자를 그리지 않습니다). 기대값 계열은 실제값과 다르게 그립니다. 값은 원본이나 JSON 파일에서 읽습니다.
- 색: `tone=`은 이름 여덟 개(`blue`, `yellow`, `red`, `green`, `orange`, `purple`, `cyan`, `gray`)만 받습니다. 카드, 그룹, `show` 줄은 `appearance=plain|filled|outline`을 더해 고릅니다. plain은 중립 면에 색 아이콘과 작은 표식, filled는 같은 계열의 옅은 면, outline은 중립 면에 같은 계열 경계입니다. 글자는 놓이는 면 위에서 대비 4.5, 도형 외곽선은 3을 라이트와 다크에서 지킵니다. 라이트 차트의 노랑 계열 경계는 3에 못 미치므로 직접 라벨, 번호 키, 무늬, 모양이 함께 계열을 구분합니다. 글자는 그림에 넣는 Pretendard와 JetBrains Mono 파일로 그립니다.
- 배치: 그룹마다 방향을 정하는 elkjs 배치. 도형 크기는 그림에 넣는 글꼴로 잽니다. 도형에 맞추려고 글자를 줄이지 않습니다. 좁은 화면에서는 그래프와 차트 판을 컨테이너 폭에 맞춰 다시 그리고, 그래도 들어가지 않는 판은 다른 판과 같은 비율로 함께 줄어듭니다(자연 크기보다 커지지 않습니다). 작은 글자는 전체화면과 확대로 읽습니다. 좁은 배치는 HTML을 쓸 때 만들고 같은 검사를 받으므로, `check`를 통과한 원본도 좁은 폭에 글이 들어가지 않으면 `render --html`이 실패할 수 있습니다.
- 그림 검사: 겹침, 도형을 지나는 선, 붙은 선, 비율, 읽힘.
- 재생: 같은 시간표로 만드는 HTML 재생기와 움직이는 SVG.
- 마크다운: `daphnis md`가 문서의 `dap` 코드 블록을 그리고 블록 아래 이미지 줄을 맞춥니다. GitHub Action이 CI에서 이를 검사합니다.

지원하지 않는 것: 3차원, 지도, CAD, 전체 BPMN, 간트, CPU 시뮬레이션, 실시간 백엔드, API 카드 실행, 클래스 멤버를 선의 끝으로 쓰기. Sankey, 불꽃 그래프, 바이올린은 아직 지원하지 않는 보류 항목이며 검증이 먼저 필요합니다. [표현 범위](docs/design/expression-coverage.md)에 예제마다 무엇을 덮고 무엇을 덮지 않는지, 알려진 한계가 적혀 있습니다.

## 비교

- D2: 더 풍부한 문법과 자체 배치로 그림을 그립니다(2026-10-01 확인). D2 도형이나 테마가 필요하면 이쪽이 맞습니다.
- Vega-Lite: 훨씬 많은 차트 종류를 그립니다(2026-10-01 확인). 지도, 작은 다중 차트, 상호작용 변환이 필요하면 이쪽이 맞습니다.

## 문서

설계 문서와 표현별 레퍼런스는 한국어로 씁니다.

- [아키텍처](docs/architecture.md): 구성 요소, 실행 흐름, 불변 조건
- [그림 문법](docs/design/figure-syntax.md): 줄 규칙, 파일 구조, 카드, 보기, 장면, 오류
- [카드와 보기](docs/design/figure-kinds.md): 순서 보기, 상태, 스키마, 클래스
- [칸 격자](docs/design/grid.md): 칸 격자 문법, 크기, 칸 밝히기, 칸 단위 선
- [차트](docs/design/charts.md): 차트 카드, 값 출처, 계열 드러내기
- [배치](docs/design/layout.md): 글 재기, 도형 크기와 연결점, 그룹 배치, 그림 비율
- [그림 검사](docs/design/figure-check.md): 화면 오류 검사 항목과 메시지
- [재생](docs/design/playback.md): 시간표, 박자 상태, HTML 재생기, 움직이는 SVG
- [마크다운과 배포](docs/design/markdown.md): `md` 명령, GitHub Action, 배포
- [문서 스킬 연동](docs/design/docs-integration.md): 문서 스킬의 D2와 Vega-Lite를 대신하는 계약
- [표현 범위](docs/design/expression-coverage.md): 예제와 시험이 덮는 범위와 한계
- [구조 그림](docs/reference/flow.md), [구성도](docs/reference/architecture.md), [순서 그림](docs/reference/sequence.md), [상태 그림](docs/reference/state.md), [데이터 관계 그림](docs/reference/data.md), [칸 격자](docs/reference/grid.md), [차트](docs/reference/charts.md): 표현마다 최소 예제, 장면, 흔한 오류

전체 문서는 [docs/README.md](docs/README.md)에 있습니다.

## 개발

```sh
git clone https://github.com/woonyong-choi/daphnis.git
cd daphnis
npm install
npm test
npm run check
npm run check:package -- /absolute/new-consumer-path
```

`npm test`는 공개 진입점(빌드 결과, SVG, HTML, 명령, 마크다운)으로 계약을 확인하고 브라우저가 필요 없습니다. 실제 브라우저에서 휴대폰과 데스크톱 크기, 라이트와 다크로 그림을 눈으로 보는 일은 시험이 대신하지 못하는 별도의 수동 검수입니다.

패키지 검사는 저장소 밖의 새 폴더에 실제 tarball과 공개 런타임 의존성을 설치해 CLI·Markdown·API 출력을 확인합니다. 설치된 선언으로 TypeScript 소비자를 컴파일하고 실행하며 잘못된 호출의 거부도 확인합니다. 컴파일러는 개발 작업본에서만 사용합니다. 검사 폴더는 끝나면 지우며 npm 공개 레지스트리 접근이 필요합니다. 새 버전을 발행하는 명령은 아닙니다.

공통 화면 값, CSS, 아이콘, 탭과 도구 막대는 `src/vendor/theme/`의 검증된 디자인 완성본을 사용합니다. 공개된 사본으로 빌드하므로 디자인 정본 저장소의 접근 권한은 필요하지 않습니다. 사본 변경은 전체 해시 검사와 그림 재생성을 통과한 PR로 반영합니다. 복제한 저장소에서는 `daphnis` 대신 `node src/cli.js`를 실행하고, `npm run catalog`로 모든 예제와 원본, 목록을 `.local/examples/`에 만듭니다.

브랜치, 커밋, PR 규칙은 [CONTRIBUTING](.github/CONTRIBUTING.md)에 있습니다.

## 라이선스

[MIT](LICENSE)
