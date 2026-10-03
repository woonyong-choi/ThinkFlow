# mutoscope

[English](README.md) | 한국어

`.muto` 원본 하나를 움직이는 문서 그림 하나로 바꾸는 명령입니다. 구조, 순서, 상태, 데이터 관계 그림과 차트를 그립니다.

설계 문서에는 요청이 어떤 길로 가는지 보이는 그림과, 기준값 뒤에 개선 값을 보이는 차트가 필요합니다. 그림은 D2로, 차트는 Vega-Lite로 그리면 한 문서 안의 그림이 두 모양이 되고, D2 배치는 다른 그리기 모양과 맞지 않습니다. mutoscope는 그림에 넣는 글꼴 파일로 모든 도형을 재고, elkjs로 배치하고, 겹침을 검사한 뒤, HTML 재생기나 움직이는 SVG로 단계를 재생합니다.

> [!NOTE]
> 개발 중입니다. 아직 npm 배포판이 없으니 GitHub에서 바로 실행하거나 복제해서 쓰세요.

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

![위 원본으로 그린 그림: 개발자의 질문이 Screen에서 Engine을 거쳐 Codex CLI로 갑니다](docs/assets/how-it-works.svg)

1. 첫 줄에 그림 종류를 적고, 도형과 선을 적은 뒤, `step`부터 단계를 적습니다.
2. mutoscope가 `system` 안 도형은 위에서 아래로, 나머지는 왼쪽에서 오른쪽으로 놓습니다.
3. 첫 박자에 점이 `user`에서 `tui`로 가고, 점이 닿을 때 `tui` 안 카드가 채워집니다.
4. `engine -> cdex` 같은 오타는 `how-it-works.muto:19: unknown node "cdex". Did you mean "codex"? Declared: codex, engine, system, tui, user`를 내고 멈춥니다.

## 설치

요구 사항: Node.js 20 이상.

아직 npm에 올라가 있지 않아 `npm install mutoscope`는 되지 않습니다. GitHub에서 바로 실행합니다.

```sh
npx github:woonyong-choi/mutoscope render figure.muto
```

복제해서 쓸 수도 있습니다.

```sh
git clone https://github.com/woonyong-choi/mutoscope.git
cd mutoscope
npm install
```

첫 npm 배포 뒤에는 `npm install --save-dev mutoscope`로 프로젝트에 `mutoscope` 명령을 더하고 `npx mutoscope`로 실행합니다. 아래 예시는 복제한 저장소에서 `node src/cli.js`로 실행합니다.

## 사용법

### 그림 하나 만들기

```sh
node src/cli.js render examples/memory.muto --html
```

```text
examples/memory.svg
examples/memory.html
```

SVG는 스크립트 없이 움직입니다. HTML에는 단계 탭, 일시정지, 배속, 전체 화면, 확대가 더해집니다. `--static`은 멈춘 SVG를 씁니다.

### 그림 검사하기

```sh
node src/cli.js check examples/memory.muto --strict --json
```

오류, 경고, 폐기된 형식이 없으면 아무것도 출력하지 않고 0으로 끝납니다. `--strict`는 경고도, `--no-deprecated`는 폐기된 형식도 실패로 칩니다. `--json`은 진단마다 `{ file, severity, code, line, column, message, fix? }` 한 줄을 출력합니다.

### 옛 파일 고치기

```sh
node src/cli.js migrate examples/memory.muto
node src/cli.js migrate examples/memory.muto --write
```

옛 문법으로 쓴 파일도 계속 동작합니다. `migrate`는 바뀔 줄을 diff로 보여 주고 `--write`일 때만 파일을 고칩니다. 고친 뒤에도 오류나 폐기된 형식이 남으면 쓰지 않습니다. 첫 줄에 `mutoscope 1`로 문법 판을 적을 수 있고, 없으면 판 1로 읽습니다.

### 예제 전부와 목록 쪽 만들기

```sh
npm run examples
```

`examples/out/index.html`을 열면 모든 예제를 한 쪽에서 봅니다.

### 마크다운 문서에 그림 넣기

원본을 `muto` 코드 블록으로 씁니다. 이름을 붙이면 블록 순서가 바뀌어도 이미지 파일 이름이 그대로입니다.

````text
```muto name=flow
flow right
box client "Client"
box server "Server"
client -> server "GET"
```
````

```sh
node src/cli.js md docs/guide.md
```

명령은 문서 옆에 `docs/guide-flow.svg`를 쓰고 블록 바로 아래에 `![Client, Server](guide-flow.svg)<!-- muto -->`를 넣습니다(대체 글은 그림의 `title`). 다시 돌려도 아무것도 바뀌지 않습니다. 블록 이름을 바꾸면 옛 SVG가 지워지고, `--out-dir images`는 SVG 위치를 바꾸며, `--check`는 쓰지 않고 문서나 SVG가 낡았으면 종료 코드 1로 끝납니다. 어느 블록이든 오류가 있으면 아무 파일도 쓰기 전에 멈춥니다. 규칙은 [마크다운](docs/design/markdown.md)에 있습니다.

### CI에서 그림 검사하기

저장소 루트에 composite GitHub Action이 있습니다. 아래 단계는 원본에 경고가 있거나 마크다운 그림이 낡았을 때 PR을 실패시킵니다.

```yaml
- uses: actions/checkout@v4
- uses: woonyong-choi/mutoscope@main
  with:
    paths: "docs/**/*.muto docs/**/*.md README.md"
    mode: check   # check(기본) 또는 render
    strict: true  # 경고도 실패
```

`paths`는 추적 중인 파일에 쓰는 git 글롭입니다. `mode: render`는 SVG와 이미지 줄을 쓰지만 커밋하지는 않습니다. 맞는 파일이 하나도 없으면 단계가 실패합니다.

## 기능

- 그림 문법: 한 줄에 문장 하나, 따옴표 글, 겹치지 않는 이름, 줄 번호와 제안이 붙은 오류.
- 그림 종류: 구조, 순서, 상태, 데이터 관계 그림.
- 구성도: `no=`는 선 번호라 정지 그림에서도 순서가 읽히고, `badge=`는 흑백에서도 남는 짧은 글자 배지, `count=`는 같은 역할 복제 N개를 겹쳐 그립니다. `icon=`은 내장 아이콘(IBM Carbon 개념 아이콘과 기술 브랜드 마크, 단색 파랑)이나 `icons 이름 "폴더"`로 등록한 내 세트를 씁니다.
- 칸 격자: 비트 필드, 배열, 스택, 행렬을 칸 단위로 그립니다. 합친 칸, 빈 칸, 생략한 칸과 칸 밝히기를 지원합니다. 선은 칸 하나에서 나가고 들어오며(`a -> 격자.칸`), 행 사이 통로로 돌아가 이웃 칸 글을 가리지 않습니다. 선 양끝 화살촉이나 무방향(`head=`)과 합류 연산 같은 작은 원(`shape=circle`)도 그릴 수 있습니다.
- 차트: 막대, 덤벨, 상자, 산점도, 선, 히트맵, 차이 차트. 값은 원본이나 JSON 파일에서 읽습니다.
- 배치: 그룹마다 방향을 정하는 elkjs 배치. 도형 크기는 그림에 넣는 글꼴로 잽니다.
- 그림 검사: 겹침, 도형을 지나는 선, 붙은 선, 비율, 읽힘.
- 재생: 같은 시간표로 만드는 HTML 재생기와 움직이는 SVG.
- 마크다운: `mutoscope md`가 문서의 `muto` 코드 블록을 그리고 블록 아래 이미지 줄을 맞춥니다. GitHub Action이 CI에서 이를 검사합니다.

## 상태

`main`의 코드는 새 설계를 구현했고 테스트가 통과합니다. 문법, 그림 종류, 차트, 배치, 그림 검사, 재생 설계 문서는 구현 상태이고, 문서 스킬 연동은 아직 제안 상태입니다. 이전 D2 호환 버전은 `d2-compat` 태그에 있습니다.

## 비교

- D2: 더 풍부한 문법과 자체 배치로 그림을 그립니다(2026-10-01 확인). D2 도형이나 테마가 필요하면 이쪽이 맞습니다.
- Vega-Lite: 훨씬 많은 차트 종류를 그립니다(2026-10-01 확인). 누적 막대, 면적, 지도가 필요하면 이쪽이 맞습니다.

## 문서

설계 문서는 한국어로 씁니다.

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

전체 문서는 [docs/README.md](docs/README.md)에 있습니다.

## 개발

```sh
npm test
npm run check
```

브랜치, 커밋, PR 규칙은 [CONTRIBUTING](.github/CONTRIBUTING.md)에 있습니다.

## 라이선스

[MIT](LICENSE)
