# 차트

차트는 차트 카드(`chart 이름 "제목" 종류 { ... }`)와 `plot` 보기로 그립니다. 값은 카드 안의 `row`, `point`, `cell`, `sample` 줄이나 JSON 파일에서 읽고, 장면의 `reveal`로 계열을 차례로 드러냅니다. 차트 종류는 열여섯 가지이고, 종류마다 예제가 하나씩 있습니다.

| 종류 | 보여 줄 것 | 계열 수 | 행 줄 | 예제 |
|---|---|---|---|---|
| `bar` | 조건별 값과 신뢰구간 | 1 이상 | `row "항목" 계열=값` | [bar](../../examples/bar.thinkflow) |
| `stacked` | 구성값과 합계. 음수는 0 왼쪽에 쌓입니다 | 1 이상 | `row "항목" 계열=값` | [stacked](../../examples/stacked.thinkflow) |
| `percent` | 행마다 합을 100%로 놓은 몫 | 2 이상 | `row "항목" 계열=값` | [percent](../../examples/percent.thinkflow) |
| `dumbbell` | 같은 입력에서 두 방식 비교 | 정확히 2 | `row "항목" 계열=값 계열=값` | [dumbbell](../../examples/dumbbell.thinkflow) |
| `difference` | 음수일 수 있는 차이와 신뢰구간 | 정확히 1 | `row "항목" 계열=값` | [difference](../../examples/difference.thinkflow) |
| `line` | 순서나 시간에 따른 변화 | 1 이상 | `point x=값 계열=값` | [line](../../examples/line.thinkflow) |
| `step` | 값이 바뀔 때만 움직이는 계단 변화 | 1 이상 | `point x=값 계열=값` | [step](../../examples/step.thinkflow) |
| `area` | 0 기준선까지 채운 변화. 계열은 겹쳐 그립니다 | 1 이상 | `point x=값 계열=값` | [area](../../examples/area.thinkflow) |
| `scatter` | 두 변수의 관계 | 0 이상 | `point "이름" x=값 y=값 [series=계열]`, `link "이름" -> "이름"` | [scatter](../../examples/scatter.thinkflow) |
| `histogram` | 원시 관측값의 구간별 건수 | 0 | `sample 값`, `bins 최솟값 최댓값 구간수` 또는 `bins auto` | [histogram](../../examples/histogram.thinkflow) |
| `box` | 연속값 분포 | 0 | `row "항목" min=값 q1=값 median=값 q3=값 max=값` | [box](../../examples/box.thinkflow) |
| `ecdf` | 표본의 누적분포 | 0 이상 | `sample 값 [series=계열]` | [ecdf](../../examples/ecdf.thinkflow) |
| `heatmap` | 교차표의 값 크기 | 0 | `cell "행" "열" 값` | [heatmap](../../examples/heatmap.thinkflow) |
| `donut`, `pie` | 전체에서 차지하는 몫 | 0 | `row "항목" value=값` | [donut](../../examples/donut.thinkflow), [pie](../../examples/pie.thinkflow) |
| `waterfall` | 증감과 중간·최종 합계 | 0 | `row "항목" value=값`, `total "이름"` | [waterfall](../../examples/waterfall.thinkflow) |

## 최소 예제

```thinkflow name=minimal
thinkflow
title "분기별 매출"

chart sales "분기별 매출" bar "예시 데이터. 점선은 목표 100" {
  x "매출(백만 원)"
  series now "올해" role=main
  series prev "작년" role=compare
  rule 100 "목표"
  row "1분기" now=92 prev=80
  row "2분기" now=108 prev=95
  row "3분기" now=121 prev=99
}

scene "작년에서 올해로"
  reveal sales.prev
  wait 1s
  reveal sales.now
  light sales "2분기"
```

![분기별 매출](charts-minimal.svg)<!-- thinkflow -->

계열은 `series 이름 "표시 이름" [role=main|compare|reference]`로 선언하고, 값 축 제목에는 괄호 단위를 붙입니다. 카드 제목과 부제는 카드 줄(`chart` 줄)에 적고, `plot` 보기는 카드 하나를 문서 폭으로 보입니다. 보기에 아직 배치하지 않은 카드가 차트와 추적뿐이고 그룹에 속한 카드나 명시한 `graph` 보기가 없으면, 각 차트에 `plot` 보기가 기본으로 생깁니다. 연결선 유무는 기준이 아닙니다. 아직 어느 보기에 배치하지 않은 일반 카드와 섞이면 그래프에 놓이므로 독립 차트로 보이려면 `view plot`에 명시합니다. 라벨을 붙이거나 순서를 정하려면 `view plot "라벨" {`로 적습니다.

## 문법

줄 종류와 선택 사항은 [그림 문법](../design/figure-syntax.md#문법-표)의 문법 표가 정본이고, 종류별 행 줄, 머리 줄, 값 출처, 시간 흐름은 [차트](../design/charts.md)에 있습니다.

- **역할.** `main`과 `compare`는 각각 하나 이하입니다. 하나뿐인 계열은 생략한 역할이 `main`입니다. 두 계열이면 아직 쓰지 않은 `main`, `compare`를 선언 순서대로 받으며, 덤벨은 시작점인 `compare`를 먼저 받습니다. 계열이 셋 이상이면 역할을 생략한 계열 모두 역할 없이 남습니다. `reference`는 계획이나 목표처럼 x마다 값이 있는 기대값 계열이고, 막대는 속이 빈 테두리, 선은 점선으로 그려 실제값과 구분합니다. `stacked`, `percent`, `dumbbell`, `donut`, `pie`에서는 쓸 수 없습니다.
- **색.** 계열 색은 범주 번호로 정합니다. 일곱 색(`blue`, `yellow`, `red`, `green`, `orange`, `purple`, `cyan`)을 넘으면 같은 색에 무늬가 더해집니다. 점 모양(원, 사각형, 마름모, 삼각형)은 색 수와 상관없이 범주 번호를 따라 돌므로 파랑과 주황처럼 모양이 같은 쌍도 있습니다. 막대 계열은 범례의 번호 키와 조각 안 번호로, 산점도 계열은 범례의 번호 키와 점 이름 앞 번호로, 선, 계단, 면적, 누적분포가 둘 이상이면 끝 이름으로 구분합니다. 원과 도넛의 조각은 목록 번호를 조각 안에 적고(12시에서 시계 방향) 번호가 조각의 고리에 들어갈 때만 보입니다. 들어가지 않는 얇은 조각은 목록 순서와 비율로 읽습니다. 색만으로 구분하지 않습니다. 무늬 정의는 SVG마다 한 번만 들어갑니다.
- **빠진 값과 0.** `-`는 측정이 없다는 뜻이고 0과 다릅니다. 막대는 `missing "글"` 문구를 보이고, 선과 계단은 그 점에서 끊기며, 누적과 퍼센트의 행은 그 행을 정하지 않습니다. 퍼센트는 합이 0인 행도 `합계 0 · 비율 정의 불가`로 알리고 0%로 그리지 않습니다. 값이 모두 0이거나 모두 빠져도 오류가 아닙니다. 0은 길이 0의 값으로 그리고, 모두 빠졌으면 틀과 축만 그리며 어떤 표식에도 0을 주지 않습니다. 히스토그램의 `sample -`는 관측에서 빼고 `결측 k개 제외`로 알리며 비율의 분모에도 넣지 않습니다. 워터폴의 `value=-`는 막대 없이 `값 없음`으로 쓰고 그 뒤의 누계는 알 수 없습니다. 상자는 다섯 값 가운데 하나라도 빠진 행에 모양 없이 적힌 숫자만 보입니다. 면(`area`)은 빠진 값을 받지 않습니다.
- **신뢰구간과 기준선.** 막대, 덤벨, 선, 차이 차트는 `계열.low=값 계열.high=값`을 받습니다. `rule 값 "라벨"`은 모든 행의 기준선이고, 막대 행의 `rule=값`은 그 행에만 겹칩니다.
- **값 묶기.** 행의 숫자 자리에 값 이름(`ms=p95`)을 쓰면 그 값이 바뀔 때 차트가 바뀝니다. 바뀐 표식만 강조하고 축은 움직이지 않습니다. [metric 예제](../../examples/metric.thinkflow)와 [donut 예제](../../examples/donut.thinkflow)가 카드의 값과 차트를 함께 움직입니다.

## 장면과 움직임

`reveal 차트.계열`이 계열을 드러냅니다. 막대는 값 축 시작에서 자라고, 덤벨은 compare 값에서 화살표가 자라며, 선은 왼쪽부터 그어집니다. `light 차트 "행"`은 행이나 점을 밝히고 나머지를 흐리게 하고(히트맵은 흐리지 않고 밝힌 칸의 숫자만 굵게 합니다), 선과 계단은 `light 차트 x=값`을 씁니다. 남은 `light`는 정지 장면과 멈춘 SVG의 마지막 모습에도 그대로 보입니다. 한 장면의 `reveal`에 나온 계열만 그 장면이 시작할 때 숨고, 나오지 않은 계열은 처음부터 보입니다. 장면의 `mode=static`은 마지막 상태 하나를 보여 줍니다.

## 히스토그램: 지연이 몰리는 구간

```text
thinkflow
chart latency "응답 지연 분포" histogram {
  x "응답 지연(ms)"
  y "요청(건)"
  bins 0 300 3
  sample 20
  sample 80
  sample 100
  sample 150
  sample 300
}
scene "가장 많은 구간" mode=static
  light latency x=0
```

각 구간의 건수는 2·2·1입니다. 100ms는 두 번째 구간에, 300ms는 마지막 구간에 포함됩니다. 범위를 벗어난 값은 오류이며 버리지 않습니다. 범위를 직접 정하지 않으려면 `bins auto`(Sturges 방식)를 쓰고, 자동 구간은 경계를 알 수 없어 `light`로 고를 수 없습니다. `measure=count|probability|density`로 건수, 비율, 확률밀도를 고릅니다. [histogram 예제](../../examples/histogram.thinkflow)는 같은 표본을 두 방식으로 나란히 보입니다.

## 워터폴: 무엇이 최종 값을 바꿨는가

```text
thinkflow
chart cost "응답 시간 개선" waterfall {
  x "시간(ms)"
  row "기본 처리" value=120
  row "데이터 조회" value=80
  total "개선 전"
  row "캐시 적용" value=-50
  total "최종 응답"
}
scene "캐시 효과" mode=static
  light cost "캐시 적용"
```

개선 전 합계는 200ms이고, 캐시 적용 뒤 최종 응답은 150ms입니다. `total`은 값을 다시 입력하지 않고, 중간 합계를 추가해도 이후 누계가 바뀌지 않습니다.

## 흔한 오류

| 원인 | 메시지 | code | 고치는 방법 |
|---|---|---|---|
| 계열 수가 종류의 한도를 벗어남 | `a dumbbell chart takes 2 series. Found 3` | `syntax` | 차트를 나눕니다 |
| 기대값 계열을 쓸 수 없는 종류 | `a stacked chart has no expected-value series, so role=reference is not allowed. It stacks, divides, or pairs its series` | `syntax` | 선, 막대, 계단에서 씁니다 |
| 퍼센트에 음수 | `a percent chart shares a whole, so values cannot be negative` | `syntax` | 음수가 있는 구성은 `stacked`를 씁니다 |
| 행이 없음 | `a chart needs at least one row` | `syntax` | 종류의 행 줄을 적습니다 |
| 없는 행을 밝힘 | `light target "q" is not in the chart` | `syntax` | 차트에 있는 행 이름을 적습니다 |
| 숫자가 아닌 값에 묶음 | `chart "c" reads "v", which holds "none" at the start. A chart value is a number` | `value-type` | 값의 시작 값을 숫자로 둡니다 |
| 묶은 값이 장면 중에 차트의 값 범위를 어김 | `chart "c" reads v=-5: values cannot be negative` | `value-type` | 같은 숫자를 행에 적어도 거절되는 값이면 묶어도 거절됩니다. 값이 범위 안에 머물게 합니다. 오류는 묶은 행의 줄에 붙습니다 |
| `data` 파일을 읽지 못함 | `cannot read data "a.json" at "/rows": ENOENT` 또는 `not valid JSON at position 12` | `syntax` | 경로와 JSON을 고칩니다. 메시지에 파일의 내용은 싣지 않습니다 |
| 값 축 제목에 단위 없음 | `the value axis title needs a unit in parentheses, such as x "latency(ms)"` | `syntax` | 제목에 `(단위)`를 붙입니다(경고, `--strict`에서 실패) |

`code`는 `thinkflow check figure.thinkflow --json`으로 봅니다.
