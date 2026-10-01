# 차트

| 항목 | 값 |
|---|---|
| 상태 | 구현 |
| 관련 결정 | 없음 |

## 요약

차트는 흐름 그림과 같은 원본 형식으로 숫자 비교를 그리는 기능이다. `#@ chart bars`는 항목마다 우리 값과 비교 값 막대를 나란히 그리고, `#@ chart arrows`는 항목마다 이전 값에서 이후 값으로 가는 화살표를 그린다.

## 동기

설계 문서는 구조 그림 옆에 성능 비교를 함께 싣는 일이 많다. 차트를 다른 도구로 그리면 글꼴, 색, 간격이 흐름 그림과 달라진다. 차트 기능은 흐름 그림과 같은 토큰과 같은 결과 파일 형식으로 숫자를 그린다.

## 예시

### 막대 두 개로 비교하기

```text
#@ chart bars
#@ title 장기 기억 정확도 (예시 데이터)
#@ unit %
#@ series 기억 붙임, 기억 없음
#@ bar 단일 세션 사실: 91.4 60.2
#@ bar 시간 추론: 85.0 -
```

1. 사용자가 `d2-flow memory-accuracy.d2`를 실행한다.
2. 항목마다 파란 막대와 회색 막대가 왼쪽에서 자란다.
3. 비교 값이 `-`인 줄은 회색 막대 대신 `공개 비교 없음`이 보인다.

### 줄어든 값을 화살표로 보이기

```text
#@ chart arrows
#@ unit 토큰
#@ scale log
#@ arrow 코딩 에이전트 A: 120000 -> 31000
```

1. 이전 값 자리에 빈 점이, 이후 값 자리에 화살촉이 보인다.
2. 오른쪽 끝에 바뀐 비율 `−74%`가 보인다. 늘어난 항목은 `+14%`처럼 보인다.

## 상세 설계

### 줄 종류

| 줄 | 뜻 |
|---|---|
| `#@ chart bars` 또는 `#@ chart arrows` | 차트 종류. 이 줄이 있으면 원본을 D2로 배치하지 않는다 |
| `#@ title 글` | 차트 제목 |
| `#@ unit 글` | 값 뒤에 붙는 단위. 화살표 차트는 축 아래에 적는다 |
| `#@ series 이름, 이름` | 막대 계열 이름. 첫 계열은 파랑, 나머지는 회색 |
| `#@ bar 이름: 값 값` | 막대 항목 하나. 값이 없으면 `-` |
| `#@ missing 글` | 값이 `-`인 막대 자리의 글. 없으면 `공개 비교 없음` |
| `#@ scale log` | 화살표 차트의 축. `linear`가 기본이다 |
| `#@ arrow 이름: 이전 -> 이후` | 화살표 항목 하나 |

- 이름 안에 `:`가 있으면 마지막 `:`에서 나눈다.
- 항목이 하나도 없거나 값이 숫자가 아니면 `{줄 번호}번째 줄: {이유}` 오류다.

### 그리기

- 차트 너비는 토큰 `size.chart-width`이고, 왼쪽 `size.chart-label` 칸에 항목 이름을 쓴다.
- 막대 길이는 모든 값 가운데 최댓값에 대한 비율이다.
- 화살표 차트의 log 축 눈금은 10의 거듭제곱이고, linear 축 눈금은 1, 2, 5 단위로 나눈다.
- 값 글자는 화살표 양 끝 바깥쪽에 둔다. 두 값이 가까워도 글자가 겹치지 않게 하기 위해서다.
- 막대와 화살표는 `duration.chart-cycle` 한 바퀴마다 앞 13% 동안 자라고 나머지 동안 머문다. README 이미지에서도 움직임이 보이게 되풀이한다. 줄마다 `duration.stagger`만큼 늦게 시작한다.
- `prefers-reduced-motion`이 켜져 있으면 움직이지 않고 다 자란 상태로 그린다.

### 요구사항

| 요구사항 | 검증 계획 |
|---|---|
| `#@ chart`가 없는 원본은 차트로 읽지 않는다. | `test/chart.test.js`의 `parseChart_without_chart_line_returns_undefined` |
| 막대 항목과 빠진 값을 읽고, 빠진 값은 `공개 비교 없음`으로 그린다. | `test/chart.test.js`의 `parseChart_bars_reads_rows_and_missing_values`, `toChartSvg_bars_missing_value_shows_no_comparison` |
| 잘못된 차트 줄은 줄 번호와 함께 알린다. | `test/chart.test.js`의 `parseChart_unknown_kind_throws_with_line`, `parseChart_arrow_needs_two_values` |
| 화살표 차트는 바뀐 비율과 log 눈금을 그린다. | `test/chart.test.js`의 `toChartSvg_arrows_shows_change_ratio_and_log_ticks` |

## 단점

- 차트 원본도 `.d2` 확장자를 쓰지만 D2 그림은 들어가지 않는다.
- 막대 차트는 0에서 시작하는 가로 막대만 그린다. 음수와 세로 막대는 그리지 않는다.
