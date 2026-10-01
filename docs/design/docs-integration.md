# 문서 스킬 연동

| 항목 | 값 |
|---|---|
| 상태 | 제안 |
| 관련 결정 | [그림 문법과 배치를 직접 맡고 D2 호환을 버린다](../decisions/2026-10-01-own-syntax-and-layout.md) |

## 요약

문서 스킬 연동은 repo-docs-figures 스킬의 그림 도구 표에서 D2와 Vega-Lite 두 행을 이 도구 한 행으로 바꾸는 계약이다. 스킬의 그림 종류, 차트 종류, 색표, 글꼴, 변환 명령, 검사가 이 도구의 무엇에 대응하는지 정한다. 터미널 데모(VHS)는 그대로 둔다.

## 동기

지금 문서 스킬은 구조 그림을 D2로, 실험 차트를 Vega-Lite로 그리고, 두 도구에 같은 색을 넣으려고 변환 스크립트가 각 도구의 설정 형식으로 색표를 따로 넣는다. 글꼴은 보는 쪽에 설치되어 있어야 하고, D2 SVG에는 한글 글꼴이 들어가지 않는다. 도구가 하나면 색표, 글꼴, 여백, 움직임이 한 곳에서 정해지고, 스킬 규칙도 짧아진다.

## 예시

### 구성 요소 그림 변환

1. 기여자가 `docs/assets/architecture.flow`를 고친다.
2. 기여자가 저장소 루트에서 `python3 <스킬 폴더>/scripts/render_figures.py docs/assets/architecture.flow`를 실행한다.
3. 스크립트가 `d2-flow render --strict docs/assets/architecture.flow`를 부르고, 같은 폴더에 움직이는 SVG `architecture.svg`가 생긴다.
4. 그림 검사 오류가 있으면 스크립트가 실패하고 결과 파일은 생기지 않는다.

### 실험 차트 변환

1. `03-analyze`가 `results/summary.json`을 쓴다.
2. `results/figures/accuracy.flow`의 `data "../summary.json" at "/accuracy"`가 그 값을 읽는다.
3. 원본에 숫자를 손으로 적지 않는다.

## 상세 설계

### 그림 종류 대응

| 스킬 그림 | 지금 | 이 도구 |
|---|---|---|
| 맥락 그림 | D2 `direction: right`, 그룹 `system` | `flow right`, `person`, `box system`, `external`, `store` |
| 구성 요소 그림 | D2 그룹 `system` 안 구성 요소 | `flow right`, `group system`, 안에 `box`, `store` |
| 순서 그림 | D2 `shape: sequence_diagram` | `sequence` |
| 상태 그림 | D2 `direction: down` | `state down`, `start`, `final` |
| 데이터 그림 | D2 `shape: sql_table` | `data right`, `table`, `fk=` |

| 스킬 도형 규칙 | 이 도구 |
|---|---|
| 사용자: `shape: person` | `person` |
| 이 시스템: 이름이 `system`인 그룹 | 맥락 그림은 `box system`, 구성 요소 그림은 `group system` |
| 구성 요소, 모듈: 기본 사각형 | `box` |
| 외부 프로그램, 외부 서비스: `style.stroke-dash: 4` | `external` |
| 파일, 데이터베이스: `shape: cylinder` | `store` |
| 테이블: `shape: sql_table` | `table` |

- 스킬의 "한 쌍에 선 하나, 방향은 요청이 가는 쪽" 규칙은 [그림 문법](figure-syntax.md)이 오류로 지킨다. 스킬 문장에서 뺀다.
- 스킬의 식별자 규칙(영어 소문자 kebab-case)은 그림 문법의 이름 규칙과 같다. 테이블과 열 이름은 `data.md`와 같게 `_`를 쓴다.
- 스킬의 순서 그림 규칙(참여자는 처음 메시지를 보내는 순서)은 도구가 경고로 알린다([그림 종류](figure-kinds.md)).
- Markdown 표는 이 도구의 대상이 아니다. 글로 된 표는 계속 Markdown 표로 쓴다.

### 차트 종류 대응

| 스킬 Vega-Lite 차트 | 이 도구 |
|---|---|
| `bar`와 `errorbar`, 기준선 `rule` | `chart bar`, `계열.low`, `계열.high`, `rule` |
| 덤벨 | `chart dumbbell` |
| 상자 그림 | `chart box` |
| 산점도 | `chart scatter` |
| 히트맵 | `chart heatmap` |
| 선 | `chart line` |

- 스킬의 "값은 `03-analyze`가 넣고 손 기재 금지" 규칙은 `data` 줄로 지킨다.
- 스킬의 "막대 축 0에서 시작, y축 둘 금지, 계열 둘까지" 규칙은 [차트](charts.md)가 지킨다. 막대 축은 `scale linear`에서 0에서 시작하고, 값 축은 하나뿐이며, 계열이 셋이면 오류다.

### 색표와 글꼴

- 색의 정본은 이 도구의 `src/tokens.json`이다. 스킬의 색표 절은 토큰 이름 표로 바뀌고 값을 적지 않는다. 같은 값을 두 곳에 적어 어긋나는 일을 막기 위해서다.
- 토큰 값은 스킬의 지금 색표 값을 따른다. 핵심 색 1은 `#2a78d6`, 핵심 색 2는 `#eb6834`, 바탕, 글자, 보조 글자, 격자도 스킬 값이다. 이미 문서에 올라간 그림과 색을 맞추기 위해서다.
- 카드 태그 색(`tone`: 파랑, 보라, 초록, 주황, 회색)은 스킬 색표에 `태그` 역할로 더한다. 태그 색은 갈래를 나누는 색이고 판정을 뜻하지 않는다. 스킬의 상태 색 금지는 차트 판정에 대한 규칙이라 태그 색과 부딪치지 않는다.
- 글꼴은 이 도구가 Pretendard와 D2Coding 파일을 함께 배포하고 그림에 잘라 넣는다([배치](layout.md)). 스킬의 글꼴 설치 줄은 지운다.

### 변환과 검사

| 스킬 규칙 | 이 도구 |
|---|---|
| 변환은 `render_figures`로만 | `render_figures`가 `.flow` 원본마다 `d2-flow render --strict`를 부른다. 경고도 실패다 |
| 실험 차트 값 손 기재 금지, 비율에 신뢰구간 | `docs/experiments/` 아래 차트에 `--require-data --require-ci`를 붙인다([차트](charts.md)) |
| 원본과 만든 그림 함께 커밋 | 그대로 |
| 변환 뒤 그림을 열어 겹침, 잘림, 빈 영역 확인 | 겹침과 잘림은 [그림 검사](figure-check.md)가 대신한다. 빈 영역은 검사 항목이 없어 눈 확인으로 남는다 |
| 다시 변환 뒤 `git diff` 없음 | [배치](layout.md)의 결정성 요구사항이 지킨다 |
| 원본에 색, `config`, `sketch` 없음 | 문법에 색 줄이 없어 검사 항목에서 지운다 |

- 결과는 움직이는 SVG `{이름}.svg` 하나다. 무엇이 언제 움직이는지는 [재생](playback.md)을 따른다. HTML 재생기는 문서 저장소에 넣지 않는다. 문서 저장소에 스크립트가 든 파일을 늘리지 않기 위해서다.

### 바꾸는 순서

1. 이 도구가 다섯 그림 종류와 여섯 차트 종류를 구현하고, 모든 예제가 그림 검사를 통과한다.
2. repo-docs-figures 스킬의 도구 표, 색표, D2 절, Vega-Lite 절을 이 도구 기준으로 다시 쓰고, `render_figures`에 `.flow` 변환을 넣는다.
3. 스킬 저장소의 형식 검사가 `total 0`이 된 뒤 skill-sync로 설치한다.
4. 문서 저장소마다 `docs/assets/*.d2`와 `*.vl.json`을 `.flow`로 옮기고 다시 변환한다. 옮긴 뒤 D2와 Vega-Lite 변환 분기를 지운다.

- 1번이 끝나기 전에 스킬을 바꾸지 않는다. 없는 도구를 쓰라고 적는 스킬은 스킬의 정직한 상태 규칙을 어기기 때문이다.

### 요구사항

| 요구사항 | 검증 계획 |
|---|---|
| 스킬의 다섯 그림 템플릿을 새 문법으로 옮긴 원본이 검사를 통과한다. | 템플릿마다 원본을 만들어 `check` 실행 |
| 스킬의 여섯 차트를 `data` 줄로 그린다. | 예시 `summary.json`으로 여섯 원본 변환 |
| 같은 원본을 다시 변환해도 git 차이가 없다. | 두 번 변환 뒤 `git diff` 확인 |

## 단점

- 문서 저장소의 기존 D2, Vega-Lite 원본을 모두 다시 써야 한다.
- 스킬이 이 도구의 배포 방법(npm 패키지나 저장소 경로)에 묶인다.

## 미해결 질문

- GitHub가 README의 SVG 이미지에서 CSS keyframes와 SMIL 움직임을 실행하는가. 공개 저장소에 시험 그림을 올려 확인한다. 실행하지 않으면 README에는 멈춘 SVG를 쓴다.
- 이 도구를 스킬 안 스크립트처럼 스킬 폴더에 넣나, npm 패키지로 배포하나.
