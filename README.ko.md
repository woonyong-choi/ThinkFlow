<br>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/daphnis-lockup-dark.svg">
    <img src="docs/assets/daphnis-lockup-light.svg" alt="daphnis" width="260">
  </picture>
</p>

[English](README.md) | 한국어

`.dap` 텍스트 원본 하나를 문서용 움직이는 SVG 그림으로 바꿉니다. 비동기 흐름, 순서, 상태, 데이터 관계 그림과 차트를 그립니다.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/showcase/async-orders-ko-dark.svg">
    <img src="docs/assets/showcase/async-orders-ko-light.svg" alt="네 곳의 주문이 이벤트 큐로 들어가 재고, 결제, 알림 소비자로 퍼지고, 큐가 차오르며 메일 하나가 유실되는 그림" width="100%">
  </picture>
</p>

그림 안의 점은 저마다 다른 시각에 출발해 다른 속도로 움직입니다. 그래서 한 장면에 여러 흐름이 동시에 돌고, 점이 닿을 때 값이 바뀌고, 큐가 차오르고, 메시지가 도중에 유실되는 모습이 보입니다. 같은 원본 문법으로 순서, 상태, 데이터 관계 그림과 차트도 그립니다. daphnis는 그림에 넣는 글꼴 파일로 글을 재고, elkjs로 배치하고, 겹침을 검사한 뒤, 움직이는 SVG나 HTML 재생기를 씁니다.

## 작동 방식

```text
flow right
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

step "Chat" "Input goes through the screen to the engine"
  user -> tui "question"
  show tui "why does this test fail?" tag="you"
  tui -> engine
  engine -> codex "turn" time=3s
```

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/how-it-works-dark.svg">
  <img src="docs/assets/how-it-works-light.svg" alt="위 원본으로 그린 그림: 개발자의 질문이 Screen에서 Engine을 거쳐 Codex CLI로 갑니다">
</picture>

1. 첫 줄에 그림 종류를 적고, 도형과 선을 적은 뒤, `step`부터 단계를 적습니다.
2. daphnis가 `system` 안 도형은 위에서 아래로, 나머지는 왼쪽에서 오른쪽으로 놓습니다.
3. 첫 박자에 점이 `user`에서 `tui`로 가고, 점이 닿을 때 `tui` 안 카드가 채워집니다.
4. `engine -> cdex` 같은 오타는 `how-it-works.dap:19: unknown node "cdex". Did you mean "codex"? Declared: codex, engine, system, tui, user`를 내고 멈춥니다.

## 설치

요구 사항: Node.js 20 이상.

```sh
npm install --save-dev daphnis
```

`npx daphnis <명령>`으로 실행합니다.

## 갤러리

<table>
  <tr>
    <td width="50%"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/showcase/order-rush-ko-dark.svg"><img src="docs/assets/showcase/order-rush-ko-light.svg" alt="웹, 앱, 제휴사의 주문이 주문 API에 함께 들어오고 처리 중 개수와 재고가 바뀌는 그림" width="100%"></picture><br>시뮬레이션: 동시에 흐르며 값이 바뀝니다. <a href="docs/reference/flow.md">구조 그림</a></td>
    <td width="50%"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/showcase/shop-schema-ko-dark.svg"><img src="docs/assets/showcase/shop-schema-ko-light.svg" alt="주문이 사용자를, 주문 항목이 주문과 상품을 외래 키로 가리키는 쇼핑몰 테이블 그림" width="100%"></picture><br>데이터 관계: 테이블과 외래 키. <a href="docs/reference/data.md">데이터 관계 그림</a></td>
  </tr>
  <tr>
    <td width="50%"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/showcase/oauth-ko-dark.svg"><img src="docs/assets/showcase/oauth-ko-light.svg" alt="사용자, 앱, 인가 서버, API 사이의 OAuth 인가 코드와 PKCE 순서 그림" width="100%"></picture><br>순서: 메시지가 오가는 차례. <a href="docs/reference/sequence.md">순서 그림</a></td>
    <td width="50%"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/showcase/latency-ko-dark.svg"><img src="docs/assets/showcase/latency-ko-light.svg" alt="엔드포인트별 p95 지연을 캐시를 넣기 전과 뒤로 비교한 덤벨 차트" width="100%"></picture><br>차트: 기준값과 개선 값. <a href="docs/reference/charts.md">차트</a></td>
  </tr>
  <tr>
    <td width="50%"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/showcase/cloud-architecture-ko-dark.svg"><img src="docs/assets/showcase/cloud-architecture-ko-light.svg" alt="클라우드 구성도: 웹 요청이 DNS, CDN, 로드 밸런서, 웹 서버를 거쳐 앱 서버로 가고, 관리자는 VPN과 바스천을 거쳐 앱 서버에 닿습니다" width="100%"></picture><br>구성도: 그룹, 아이콘, 번호 붙은 선. <a href="docs/reference/architecture.md">구성도</a></td>
    <td width="50%"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/showcase/order-state-ko-dark.svg"><img src="docs/assets/showcase/order-state-ko-light.svg" alt="주문이 생성됨에서 결제됨, 배송 중, 배송 완료로 가고 취소됨이 다른 끝 상태인 상태 그림" width="100%"></picture><br>상태: 상태와 그 사이의 이동. <a href="docs/reference/state.md">상태 그림</a></td>
  </tr>
</table>

## 사용법

### 그림 하나 만들기

[작동 방식](#작동-방식)의 원본을 `how-it-works.dap`으로 저장하고 실행합니다.

```sh
npx daphnis render how-it-works.dap --html
```

```text
how-it-works.svg
how-it-works.html
```

SVG는 스크립트 없이 움직입니다. HTML에는 단계 탭, 일시정지, 배속, 전체 화면, 확대가 더해집니다. `--static`은 멈춘 SVG를 씁니다. 모든 선과 도형을 한꺼번에 보이고, 카드는 비우고, 점은 그리지 않고, 차트는 다 자란 모습이라 한 단계가 아니라 그림 전체의 구조가 읽힙니다.

### 그림 검사하기

```sh
npx daphnis check how-it-works.dap --strict --json
```

오류, 경고, 폐기된 형식이 없으면 아무것도 출력하지 않고 0으로 끝납니다. `--strict`는 경고도, `--no-deprecated`는 폐기된 형식도 실패로 칩니다. `--json`은 진단마다 `{ file, severity, code, line, column, message, fix? }` 한 줄을 출력합니다. 그림이 예산보다 많은 양(예를 들어 수십만 칸의 격자)을 만들어야 하면 파일을 쓰기 전에 `budget-exceeded` 오류로 실패하고, `--budget grid-elements=2000000`으로 올립니다. `render`, `check`, `gallery`, `md`가 모두 `--budget 이름=값`을 받습니다.

### 마크다운 문서에 그림 넣기

원본을 `dap` 코드 블록으로 쓰고 `daphnis md`를 실행합니다.

````text
```dap name=request
flow right
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

### 옛 파일 고치기

```sh
npx daphnis migrate how-it-works.dap
npx daphnis migrate how-it-works.dap --write
```

옛 문법으로 쓴 파일도 계속 동작합니다. `migrate`는 바뀔 줄을 diff로 보여 주고 `--write`일 때만 파일을 고칩니다. 고친 뒤에도 오류나 폐기된 형식이 남으면 쓰지 않습니다. 첫 줄에 `daphnis 1`로 문법 판을 적을 수 있고, 없으면 판 1로 읽습니다.

## 기능

- 비동기 장면: 저마다 다른 시각과 속도로 출발하는 흐름, 점이 닿을 때 바뀌는 값, 차오르는 큐, 도중에 유실되는 점.
- 그림 종류: 구조, 구성도, 순서, 상태, 데이터 관계 그림, 칸 격자, 차트.
- 구성도: `no=`는 선 번호라 정지 그림에서도 순서가 읽히고, `badge=`는 흑백에서도 남는 짧은 글자 배지, `count=`는 같은 역할 복제 N개를 겹쳐 그립니다. `icon=`은 내장 아이콘이나 `icons 이름 "폴더"`로 등록한 내 세트를 씁니다.
- 칸 격자: 비트 필드, 배열, 스택, 행렬을 칸 단위로 그리고, 선이 칸 하나에서 나가고 들어옵니다.
- 차트: 막대, 덤벨, 상자, 산점도, 선, 히트맵, 차이 차트. 값은 원본이나 JSON 파일에서 읽습니다.
- 배치: 그룹마다 방향을 정하는 elkjs 배치. 도형 크기는 그림에 넣는 글꼴로 잽니다.
- 색과 글꼴: 대부분 무채색 회색이고 브랜드 파랑은 핵심 자리에만 씁니다. 모든 외곽선은 대비 3, 모든 글자는 4.5를 라이트와 다크에서 지킵니다. 글자는 그림에 넣는 Pretendard와 JetBrains Mono 파일로 그립니다.
- 그림 검사: 겹침, 도형을 지나는 선, 붙은 선, 비율, 읽힘.
- 재생: 같은 시간표로 만드는 HTML 재생기와 움직이는 SVG.
- 마크다운: `daphnis md`가 문서의 `dap` 코드 블록을 그리고 블록 아래 이미지 줄을 맞춥니다. GitHub Action이 CI에서 이를 검사합니다.

## 비교

- D2: 더 풍부한 문법과 자체 배치로 그림을 그립니다(2026-10-01 확인). D2 도형이나 테마가 필요하면 이쪽이 맞습니다.
- Vega-Lite: 훨씬 많은 차트 종류를 그립니다(2026-10-01 확인). 누적 막대, 면적, 지도가 필요하면 이쪽이 맞습니다.

## 문서

설계 문서와 종류별 레퍼런스는 한국어로 씁니다.

- [아키텍처](docs/architecture.md): 구성 요소, 실행 흐름, 불변 조건
- [그림 문법](docs/design/figure-syntax.md): 줄 규칙, 파일 구조, 구조 그림, 시간 흐름, 오류
- [그림 종류](docs/design/figure-kinds.md): 순서 그림, 상태 그림, 데이터 관계 그림
- [칸 격자](docs/design/grid.md): 칸 격자 문법, 크기, 칸 밝히기, 칸 단위 선
- [차트](docs/design/charts.md): 일곱 차트 종류, 값 출처, 계열 드러내기
- [배치](docs/design/layout.md): 글 재기, 도형 크기와 연결점, 그룹 배치, 그림 비율
- [그림 검사](docs/design/figure-check.md): 화면 오류 검사 항목과 메시지
- [재생](docs/design/playback.md): 시간표, 박자 상태, HTML 재생기, 움직이는 SVG
- [마크다운과 배포](docs/design/markdown.md): `md` 명령, GitHub Action, 배포
- [문서 스킬 연동](docs/design/docs-integration.md): 문서 스킬의 D2와 Vega-Lite를 대신하는 계약
- [구조 그림](docs/reference/flow.md), [구성도](docs/reference/architecture.md), [순서 그림](docs/reference/sequence.md), [상태 그림](docs/reference/state.md), [데이터 관계 그림](docs/reference/data.md), [칸 격자](docs/reference/grid.md), [차트](docs/reference/charts.md): 종류마다 최소 예제, 단계, 흔한 오류

전체 문서는 [docs/README.md](docs/README.md)에 있습니다.

## 개발

```sh
git clone https://github.com/woonyong-choi/daphnis.git
cd daphnis
npm install
npm test
npm run check
```

공통 화면 값(색 역할, 간격, 글자 크기)은 [design-tokens](https://github.com/woonyong-choi/design-tokens) 패키지에서 받습니다. `npm install`이 GitHub에서 태그로 받아 오므로 `git`이 있어야 합니다. `src/tokens.json`에는 그림 전용 토큰만 있고, design-tokens에 새 태그가 나오면 워크플로가 PR을 엽니다. 복제한 저장소에서는 `daphnis` 대신 `node src/cli.js`를 실행하고, `npm run examples`로 모든 예제를 `examples/out/index.html`에 만듭니다.

브랜치, 커밋, PR 규칙은 [CONTRIBUTING](.github/CONTRIBUTING.md)에 있습니다.

## 라이선스

[MIT](LICENSE)
