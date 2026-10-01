# d2-flow

[English](README.md) | 한국어

D2 그림을 Hindsight 문서 그림 모양의 움직이는 흐름 그림으로 바꾸는 명령입니다.

D2로 구조를 그리는 개발자는 요청 하나가 어느 상자를 거쳐 가는지 보여 줄 수 없습니다. d2-flow는 같은 D2 파일 안에 적은 흐름 줄을 읽어, 점이 선을 따라 움직이는 그림으로 재생합니다. 보드 전체를 넘기는 D2 애니메이션과 달리 요청 하나를 선마다 따라가고, 원본은 `d2` 명령에서도 그대로 그려집니다.

> [!NOTE]
> 개발 중입니다. 배포판은 없고 소스에서 빌드해 실행합니다.

## 작동 방식

```d2
direction: right
agent: Your AI Agent
api: Hindsight API {
  retain: "Retain\nLLM extraction"
}
facts: "Facts\nworld · experience" {shape: cylinder}
agent -> api.retain: retain()
api.retain -> facts

#@ step "retain()": The agent sends the conversation
#@   agent -> retain "the conversation"
#@   show agent [user/gray] “Alice joined Google in March.”
#@   retain -> facts +3s : An LLM extracts facts
#@   show facts [world] Alice joined Google · Mar 2026 (new)
#@   retain -> agent "✓ stored"
```

1. 평소처럼 D2 그림을 적고 `#@`로 시작하는 흐름 줄을 더합니다.
2. d2-flow가 D2로 배치한 그림을 Hindsight 그림 모양으로 그립니다.
3. 그림에 `retain()` 탭과 설명이 보입니다.
4. 점이 `the conversation`을 싣고 `agent`에서 `retain`으로 가고, `agent` 안 카드가 채워집니다.
5. 마지막 점은 같은 선을 거꾸로 따라 `agent`로 돌아갑니다.

이 버전의 전체 문법은 `d2-compat` 태그의 `docs/design/flow-syntax.md`에 있습니다.

## 설치

Node.js 20 이상이 필요합니다. `d2` 명령은 없어도 되고, 이를 쓰는 테스트 하나는 없으면 건너뜁니다. 프로젝트 폴더에서 다음 명령을 실행하세요.

```sh
npm install
```

## 사용법

### 그림 하나 만들기

```sh
node src/cli.js examples/memory.d2 --out examples/out
```

```text
examples/out/memory.html
examples/out/memory.svg
```

탭, 일시정지, 배속이 있는 재생기는 HTML 파일을 열어 봅니다. 스크립트 없이 움직이는 그림은 SVG 파일을 README에 넣어 씁니다.

### 예제 전부와 목록 쪽 만들기

```sh
npm run examples
```

```text
> d2-flow@0.0.0 examples
> node src/cli.js examples/*.d2 --out examples/out --gallery

examples/out/browser.html
examples/out/browser.svg
examples/out/ci-pipeline.html
examples/out/ci-pipeline.svg
examples/out/classes.html
examples/out/classes.svg
examples/out/dashboard.html
examples/out/dashboard.svg
examples/out/hindsight.html
examples/out/hindsight.svg
examples/out/k8s.html
examples/out/k8s.svg
examples/out/kafka.html
examples/out/kafka.svg
examples/out/memory.html
examples/out/memory.svg
examples/out/multi-agent.html
...
```

`examples/out/index.html`을 열면 모든 예제를 한 쪽에서 봅니다. `npm run examples:bigtech`는 큰 구조 데모를, `npm run examples:showcase`는 표, 관계 그래프, 조용한 선, 차트 데모를 만듭니다. 옵션은 `--out`, `--layout elk|dagre`(기본 `elk`), `--html-only`, `--svg-only`, `--gallery`입니다.

## 기능

- 흐름 문법: `#@` 줄로 D2 파일에 단계, 움직이는 점, 카드, 설명을 더합니다.
- 그리기: D2가 배치한 도형을 점 격자 바탕, 둥근 container, 알약 라벨, 카드로 그립니다.
- 재생: 탭과 배속이 있는 HTML 재생기와, 스크립트 없이 움직이는 SVG를 만듭니다.
- 조용한 선과 관계 그래프: 쓰는 단계에서만 보이는 선과, 카드 안의 작은 관계 그래프를 그립니다.
- 차트: `#@ chart` 줄로 쌍 막대 차트와 이전에서 이후로 가는 화살표 차트를 그립니다.

## 상태

명령과 예제가 소스에서 동작하고 테스트가 통과합니다. 배포판과 npm 패키지는 없습니다. `design-own-layout` 브랜치에 D2 호환을 대신하는 자체 그림 문법과 배치 설계를 제안했습니다. 그 브랜치의 코드는 아직 D2 호환 구현이고, 같은 구현이 `d2-compat` 태그에도 있습니다.

## 비교

- D2 애니메이션: D2는 정해진 간격으로 보드를 넘기고 점선이 흐르게 할 수 있습니다(2026-09-30 확인). 단계마다 그림이 다르면 이쪽이 맞습니다.
- hindsight-interfig: Hindsight 그림 컴포넌트는 행과 열을 JavaScript로 손수 배치합니다(2026-09-30 확인). 행과 열을 정확히 정해야 하면 이쪽이 맞습니다.

## 문서

설계 문서는 한국어로 씁니다.

- [아키텍처](docs/architecture.md): 제안된 설계의 구성 요소, 실행 흐름, 불변 조건
- [그림 문법](docs/design/figure-syntax.md): 줄 규칙, 파일 구조, 구조 그림, 시간 흐름, 오류
- [그림 종류](docs/design/figure-kinds.md): 순서 그림, 상태 그림, 데이터 관계 그림
- [차트](docs/design/charts.md): 여섯 차트 종류, 값 출처, 계열 드러내기
- [배치](docs/design/layout.md): 글 재기, 도형 크기와 연결점, 묶음 배치, 그림 비율
- [그림 검사](docs/design/figure-check.md): 화면 오류 검사 항목과 메시지
- [재생](docs/design/playback.md): 시간표, 박자 상태, HTML 재생기, 움직이는 SVG
- [문서 스킬 연동](docs/design/docs-integration.md): 문서 스킬의 D2와 Vega-Lite를 대신하는 계약

전체 문서는 [docs/README.md](docs/README.md)에 있습니다.

## 개발

```sh
npm test
npm run check
```
