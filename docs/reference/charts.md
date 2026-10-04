# 차트

`chart`는 일곱 종류의 차트를 그립니다. 값은 원본의 `row`, `point`, `cell` 줄이나 JSON 파일에서 읽고, 계열을 단계마다 드러냅니다.

| 첫 문장 | 보여 줄 것 |
|---|---|
| `chart bar` | 조건별 값과 신뢰구간 |
| `chart dumbbell` | 같은 입력에서 두 방식 비교 |
| `chart box` | 연속값 분포 |
| `chart scatter` | 두 변수의 관계 |
| `chart line` | 순서나 시간에 따른 변화 |
| `chart heatmap` | 판정 교차표 |
| `chart difference` | 음수일 수 있는 차이와 신뢰구간 |

## 최소 예제

```dap name=minimal
chart bar
title "분기별 매출"
subtitle "예시 데이터. 점선은 목표 100"
x "매출(백만 원)"

series now "올해" role=main
series prev "작년" role=compare
rule 100 "목표"

row "1분기" now=92 prev=80
row "2분기" now=108 prev=95
row "3분기" now=121 prev=99

step "작년" "작년 매출은 모두 목표에 못 미칩니다"
  reveal prev
step "올해" "올해는 2분기부터 목표를 넘습니다"
  reveal now
  light "2분기"
```

![분기별 매출](charts-minimal.svg)<!-- dap -->

계열은 `series`로 선언하고, 값 축 제목에는 괄호 단위를 붙입니다.

## 문법

줄 종류와 선택 사항은 [그림 문법](../design/figure-syntax.md#호환-규칙)의 문법 표가 정본이고, 종류별 행 줄, 머리 줄, 값 출처, 시간 흐름은 [차트](../design/charts.md)에 있습니다.

## 단계와 움직임

`reveal 계열`이 계열을 드러냅니다. 막대는 값 축 시작에서 자라고, 덤벨은 compare 값에서 화살표가 자라며, 선은 왼쪽부터 그어집니다. `light "항목"`은 행이나 점을 밝히고 나머지를 흐리게 합니다. 드러낸 계열은 단계가 바뀌어도 남습니다. `reveal`이 하나도 없으면 모든 계열이 처음부터 보이고 같은 움직임을 되풀이합니다. HTML 재생기는 이 차트에도 재생·일시정지 단추를 두고, 움직임 줄이기를 켠 채로 열면 다 자란 모습으로 멈춰 시작합니다.

## 흔한 오류

| 원인 | 메시지 | code | 고치는 방법 |
|---|---|---|---|
| 계열 수가 종류의 한도를 넘음 | `a bar chart takes 1 to 2 series. Found 3` | `syntax` | 차트를 나눕니다 |
| 막대에 음수 | `values cannot be negative` | `syntax` | 음수 차이는 `chart difference`를 씁니다 |
| 드러내지 않은 계열 | `series "b" is never revealed. Add "reveal b" or remove the series` | `syntax` | `reveal`을 더하거나 계열을 지웁니다 |
| 종류에 맞지 않는 행 줄 | `a line chart uses "point" lines, not "row"` | `syntax` | 종류의 행 줄로 바꿉니다 |
| 값 축 제목에 단위 없음 | `the value axis title needs a unit in parentheses, such as x "latency(ms)"` | `syntax` | 제목에 `(단위)`를 붙입니다(경고, `--strict`에서 실패) |

`code`는 `daphnis check figure.dap --json`으로 봅니다.
