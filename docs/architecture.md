# 아키텍처

이 도구는 `.muto` 원본 하나를 움직이는 문서 그림 하나로 바꾸는 명령이다. 구성 요소는 셋이고, `cli`가 원본을 읽어 배치하고 검사한 장면과 시간표를 `player`(HTML)와 `svg`(움직이는 SVG)에 담는다. 이전의 D2 호환 첫 구현은 git 태그 `d2-compat`에 있다.

## 맥락

| 외부 요소 | 종류 | 주고받는 것 |
|---|---|---|
| `.muto` 원본 | 파일 | 그림 종류, 도형, 선, 시간 흐름, 차트 값 |
| 실험 결과 JSON | 파일 | 차트 `data` 줄이 읽는 값 |
| elkjs | 외부 프로그램 | 도형 크기와 연결점 제약, 도형 좌표와 직교 경로 |
| 글꼴 파일 | 파일 | Inter, Noto Sans KR, JetBrains Mono의 글자 너비 표와 글자 모양 |
| repo-docs-figures 스킬 | 외부 프로그램 | `render_figures`가 부르는 `render` 명령과 그 종료 코드 |
| 브라우저 | 외부 프로그램 | 만든 HTML과 SVG |

## 코드 지도

| 구성 요소 | 하는 일 | 기술 | 위치 |
|---|---|---|---|
| `cli` | 원본을 읽고, 글을 재고, 배치하고, 그림을 검사하고, 시간표를 만들어 결과 파일을 쓰는 명령 | Node.js, elkjs | `src/`에서 `player/`, `svg.js`, `animate/`를 뺀 파일. 마크다운 문서 반영은 `md.js`, `md-run.js` |
| `player` | HTML 안에서 시간표대로 상태를 바꾸고 점을 옮기는 재생기, 전체 화면과 확대 | 브라우저 JavaScript | `src/player/` |
| `svg` | 시간표를 CSS keyframes와 SMIL로 바꾼 움직이는 SVG | SVG, CSS | `src/svg.js`, `src/animate/` |

## 실행 흐름

### 그림 만들기

1. `cli`가 원본을 읽어 머리, 선언, 시간 흐름으로 나누고, 이름과 규칙을 확인한다([그림 문법](design/figure-syntax.md)).
2. `cli`가 글꼴 파일로 모든 글의 폭을 재고 도형 크기와 연결점을 정한다.
3. `cli`가 그룹마다, 그다음 바깥을 elkjs로 배치하고 경로 조각을 잇는다([배치](design/layout.md)).
4. `cli`가 시간표를 만들고(점 이동 시간이 선 길이에 비례해 배치 뒤에 만든다), 모든 선과 가장 큰 카드가 보이는 상태에서 화면 오류를 검사한다([그림 검사](design/figure-check.md)).
5. 오류가 없으면 `cli`가 같은 장면과 시간표로 HTML, 움직이는 SVG, 멈춘 SVG 가운데 요청한 것을 쓴다.

### 재생하기

1. 브라우저가 HTML을 열면 `player`가 첫 단계의 첫 박자 상태를 그린다.
2. `player`가 박자마다 시간표의 상태를 그대로 그리고 점을 경로 위로 옮긴다([재생](design/playback.md)).
3. 브라우저가 SVG를 열면 `svg` 안의 keyframes가 같은 시간표를 반복한다.

## 불변 조건

- 배치에 넘긴 도형 크기와 연결점은 그리는 도형과 같다. 선 끝이 도형에서 떨어지는 일을 막기 위해서다.
- elkjs가 돌려준 좌표와 경로 점은 옮기지 않는다. 경로 후처리끼리 충돌하는 일을 막기 위해서다. 예외는 [배치](design/layout.md) 선 그리기 절의 선 끝 계단 펴기 하나다.
- 글 폭은 그림에 넣는 글꼴과 같은 글꼴 파일로 잰다. 잰 폭과 그려진 폭이 어긋나는 일을 막기 위해서다.
- 오류가 하나라도 있으면 결과 파일을 쓰지 않는다. 깨진 그림이 문서에 올라가는 일을 막기 위해서다.
- 같은 원본과 같은 버전은 바이트까지 같은 결과를 낸다. 다시 변환해도 git 차이가 없게 하기 위해서다.
- `player`와 `svg`는 시간표를 읽기만 하고 상태를 다시 계산하지 않는다. HTML과 SVG가 다르게 움직이는 일을 막기 위해서다.
- 점 이동 곡선, 글 상자 밀어 넣기, 차트 자라기는 HTML과 SVG가 같은 토큰과 같은 규칙을 쓴다. 규칙은 `src/easing.js`, `src/chip.js`, `src/chart/motion.js`에 있고, 브라우저 코드(`player/`)는 불러올 수 없어 같은 계산을 따로 둔다. 글 상자 자리는 예외로, 빌드 때 시간표에 담은 계획을 재생기가 보간만 한다.
- 크기, 간격, 색, 시간 값은 `src/tokens.json` 토큰만 쓴다. `src/tokens.css`, `src/tokens.js`는 생성물이라 손으로 고치지 않는다.
- 변환 중 네트워크에 접근하지 않는다. 글꼴과 배치 엔진을 모두 함께 배포한다.

## 기술 선택

| 영역 | 선택 | 고른 이유 |
|---|---|---|
| 층 배치와 직교 경로 | elkjs(ELK layered) | 도형 크기, 연결점, 선 라벨 크기를 받아 겹치지 않게 배치한다. [결정 기록](decisions/2026-10-01-own-syntax-and-layout.md) |
| 글꼴 | Inter, Noto Sans KR, JetBrains Mono | 본문은 이력서와 같은 구성으로 라틴과 기호는 Inter, 한글은 Noto Sans KR이다. 차트 숫자는 Inter의 자리 폭 같은 숫자(`tnum`)다. 고정폭 JetBrains Mono는 코드(백틱 구간, 테이블 열 타입)에만 쓰고 그 안 한글은 Noto Sans KR로 이어 그린다. 굵기마다 정적 파일이 있는 `@expo-google-fonts/inter`, `@expo-google-fonts/noto-sans-kr` 패키지로 받는다. 가변 글꼴이나 조각 나뉜 패키지보다 fontkit 측정과 subset-font 자르기가 한 파일에서 끝나서 고른다. 모두 SIL Open Font License라 그림에 넣을 수 있다. |
| 결과 형식 | SVG, HTML | SVG는 README와 설계 문서에 이미지로 들어가고, HTML은 미리보기와 목록 쪽에서 열린다. 둘 다 추가 프로그램이 필요 없다. |
| 실행 환경 | Node.js 20 이상 | elkjs와 글꼴 처리를 브라우저 없이 돌린다. |
