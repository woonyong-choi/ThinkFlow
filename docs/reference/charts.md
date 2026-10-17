# 차트

차트는 차트 카드(`chart 이름 "제목" 종류 { ... }`)와 `plot` 보기로 그린다. 값은 카드 안의 `row`, `point`, `cell`, `sample` 줄이나 JSON 파일에서 읽고, 장면의 `reveal`로 계열을 차례로 드러낸다. 차트 종류는 열여섯 가지이고, 종류마다 예제가 하나씩 있다.

| 종류 | 보여 줄 것 | 계열 수 | 행 줄 | 예제 |
|---|---|---|---|---|
| `bar` | 조건별 값과 신뢰구간 | 1 이상 | `row "항목" 계열=값` | [bar](../../examples/bar.torso) |
| `stacked` | 구성값과 합계. 음수는 0 왼쪽에 쌓인다 | 1 이상 | `row "항목" 계열=값` | [stacked](../../examples/stacked.torso) |
| `percent` | 행마다 합을 100%로 놓은 몫 | 2 이상 | `row "항목" 계열=값` | [percent](../../examples/percent.torso) |
| `dumbbell` | 같은 입력에서 두 방식 비교 | 정확히 2 | `row "항목" 계열=값 계열=값` | [dumbbell](../../examples/dumbbell.torso) |
| `difference` | 음수일 수 있는 차이와 신뢰구간 | 정확히 1 | `row "항목" 계열=값` | [difference](../../examples/difference.torso) |
| `line` | 순서나 시간에 따른 변화 | 1 이상 | `point x=값 계열=값` | [line](../../examples/line.torso) |
| `step` | 값이 바뀔 때만 움직이는 계단 변화 | 1 이상 | `point x=값 계열=값` | [step](../../examples/step.torso) |
| `area` | 0 기준선까지 채운 변화. 계열은 겹쳐 그린다 | 1 이상 | `point x=값 계열=값` | [area](../../examples/area.torso) |
| `scatter` | 두 변수의 관계 | 0 이상 | `point "이름" x=값 y=값 [series=계열]`, `link "이름" -> "이름"` | [scatter](../../examples/scatter.torso) |
| `histogram` | 원시 관측값의 구간별 건수 | 0 | `sample 값`, `bins 최솟값 최댓값 구간수` 또는 `bins auto` | [histogram](../../examples/histogram.torso) |
| `box` | 연속값 분포 | 0 | `row "항목" min=값 q1=값 median=값 q3=값 max=값` | [box](../../examples/box.torso) |
| `ecdf` | 표본의 누적분포 | 0 이상 | `sample 값 [series=계열]` | [ecdf](../../examples/ecdf.torso) |
| `heatmap` | 교차표의 값 크기 | 0 | `cell "행" "열" 값` | [heatmap](../../examples/heatmap.torso) |
| `donut`, `pie` | 전체에서 차지하는 몫 | 0 | `row "항목" value=값` | [donut](../../examples/donut.torso), [pie](../../examples/pie.torso) |
| `waterfall` | 증감과 중간·최종 합계 | 0 | `row "항목" value=값`, `total "이름"` | [waterfall](../../examples/waterfall.torso) |

## 최소 예제

```torso name=minimal
torso
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

![분기별 매출](charts-minimal.svg)<!-- torso -->

계열은 `series 이름 "표시 이름" [role=main|compare|reference]`로 선언하고, 값 축 제목에는 괄호 단위를 붙인다. 카드 제목과 부제는 카드 줄(`chart` 줄)에 적고, `plot` 보기는 카드 하나를 문서 폭으로 표시한다. 보기에 아직 배치하지 않은 카드가 차트와 추적뿐이고 그룹에 속한 카드나 명시한 `graph` 보기가 없으면, 각 차트에 `plot` 보기가 기본으로 생긴다. 연결선 유무는 기준이 아니다. 아직 어느 보기에 배치하지 않은 일반 카드와 섞이면 그래프에 놓이므로 독립 차트로 보이려면 `view plot`에 명시한다. 라벨을 붙이거나 순서를 정하려면 `view plot "라벨" {`로 적는다.

## 문법

줄 종류와 선택 사항은 [그림 문법](../design/figure-syntax.md#문법-표)의 문법 표가 정본이고, 종류별 행 줄, 머리 줄, 값 출처, 시간 흐름은 [차트](../design/charts.md)에 있다.

- **역할.** `main`과 `compare`는 각각 하나 이하이다. 하나뿐인 계열은 생략한 역할이 `main`이다. 두 계열이면 아직 쓰지 않은 `main`, `compare`를 선언 순서대로 받으며, 덤벨은 시작점인 `compare`를 먼저 받는다. 계열이 셋 이상이면 역할을 생략한 계열 모두 역할 없이 남는다. `reference`는 계획이나 목표처럼 x마다 값이 있는 기대값 계열이고, 막대 차트는 행을 가로지르는 세로 눈금, 선은 점선으로 그려 실제값과 구분한다. `stacked`, `percent`, `dumbbell`, `donut`, `pie`에서는 쓸 수 없다.
- **색.** 계열 색은 범주 번호로 정한다. 일곱 색(`blue`, `yellow`, `red`, `green`, `orange`, `purple`, `cyan`)을 넘으면 같은 색에 무늬가 더해진다. 측정점은 원으로 그린다. 막대와 산점도 계열은 범례로, 선·계단·면적은 계열이 둘 이상이면 끝 이름으로 구분한다. 누적분포는 끝 안내선 없이 범례를 쓴다. 색이 비슷한 산점도와 누적분포 계열의 식별성은 별도 검수가 필요하다. 원과 도넛의 조각은 바깥에 이름과 값·비율을 직접 적고 안내선으로 잇는다. 누적, 퍼센트, 원, 도넛에서 몫이 5% 미만인 항목이 둘 이상이거나 항목이 일곱 색을 넘으면 작은 쪽을 회색 `기타` 하나로 묶어 적는다(값에 묶인 차트는 묶지 않는다). 색만으로 구분하지 않는다. 무늬 정의는 SVG마다 한 번만 들어간다.
- **빠진 값과 0.** `-`는 측정이 없다는 뜻이고 0과 다르다. 막대는 `missing "글"` 문구를 보이고, 선과 계단은 그 점에서 끊기며, 누적과 퍼센트의 행은 그 행을 정하지 않는다. 퍼센트는 합이 0인 행도 `합계 0 · 비율 정의 불가`로 알리고 0%로 그리지 않는다. 값이 모두 0이거나 모두 빠져도 오류가 아니다. 0은 길이 0의 값으로 그리고, 모두 빠졌으면 틀과 축만 그리며 어떤 표식에도 0을 주지 않는다. 히스토그램의 `sample -`는 관측에서 빼고 `결측 k개 제외`로 알리며 비율의 분모에도 넣지 않는다. 워터폴의 `value=-`는 막대 없이 `값 없음`으로 쓰고 그 뒤의 누계는 알 수 없다. 상자는 다섯 값 가운데 하나라도 빠진 행에 모양 없이 적힌 숫자만 보인다. 면(`area`)은 빠진 값을 받지 않는다.
- **신뢰구간과 기준선.** 막대, 덤벨, 선, 차이 차트는 `계열.low=값 계열.high=값`을 받는다. `rule 값 "라벨"`은 모든 행의 기준선이고, 막대 행의 `rule=값`은 그 행에만 겹친다.
- **값 묶기.** 행의 숫자 자리에 값 이름(`ms=p95`)을 쓰면 그 값이 바뀔 때 차트가 바뀐다. 바뀐 표식만 강조하고 축은 움직이지 않는다. [metric 예제](../../examples/metric.torso)와 [donut 예제](../../examples/donut.torso)가 카드의 값과 차트를 함께 움직인다.

metric 예제의 `API 1 CPU 기록(%)`은 급증 장면의 마지막 도착 때 `snapshot:=cpu1`로 복사한 값이다. 기록 전에는 `미기록`을 표시하고 다음 장면에서도 `keep`으로 마지막 기록을 유지한다. 이는 현재 CPU나 기간 중 최댓값의 자동 집계가 아니며, 기록 뒤 API 1의 CPU가 바뀌어도 함께 바뀌지 않는다. `ref=p95`로 묶은 대시보드 값과 차트는 원천 값의 변화를 계속 따른다.

## 장면과 움직임

`reveal 차트.계열`이 계열을 드러낸다. 막대는 값 축 시작에서 자라고, 덤벨은 compare 값에서 화살표가 자라며, 선은 왼쪽부터 그어진다. `light 차트 "행"`은 행이나 점을 밝히고 나머지를 흐리게 하고(히트맵은 흐리지 않고 밝힌 칸의 숫자만 굵게 한다), 선과 계단은 `light 차트 x=값`을 쓴다. 남은 `light`는 정지 장면과 멈춘 SVG의 마지막 모습에도 그대로 표시된다. 한 장면의 `reveal`에 나온 계열만 그 장면이 시작할 때 숨고, 나오지 않은 계열은 처음부터 보인다. 장면의 `mode=static`은 마지막 상태 하나를 보여 준다.

## 히스토그램: 지연이 몰리는 구간

```text
torso
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

각 구간의 건수는 2·2·1이다. 100ms는 두 번째 구간에, 300ms는 마지막 구간에 포함된다. 범위를 벗어난 값은 오류이며 버리지 않는다. 범위를 직접 정하지 않으려면 `bins auto`(Sturges 방식)를 쓰고, 자동 구간은 경계를 알 수 없어 `light`로 고를 수 없다. `measure=count|probability|density`로 건수, 비율, 확률밀도를 고른다. [histogram 예제](../../examples/histogram.torso)는 같은 표본을 두 방식으로 나란히 보여 준다.

## 워터폴: 무엇이 최종 값을 바꿨는가

```text
torso
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

개선 전 합계는 200ms이고, 캐시 적용 뒤 최종 응답은 150ms이다. `total`은 값을 다시 입력하지 않고, 중간 합계를 추가해도 이후 누계가 바뀌지 않는다.

## 흔한 오류

| 원인 | 메시지 | code | 고치는 방법 |
|---|---|---|---|
| 계열 수가 종류의 한도를 벗어남 | `a dumbbell chart takes 2 series. Found 3` | `syntax` | 차트를 나눈다 |
| 기대값 계열을 쓸 수 없는 종류 | `a stacked chart has no expected-value series, so role=reference is not allowed. It stacks, divides, or pairs its series` | `syntax` | 선, 막대, 계단에서 쓴다 |
| 퍼센트에 음수 | `a percent chart shares a whole, so values cannot be negative` | `syntax` | 음수가 있는 구성은 `stacked`를 쓴다 |
| 행이 없음 | `a chart needs at least one row` | `syntax` | 종류의 행 줄을 적는다 |
| 없는 행을 밝힘 | `light target "q" is not in the chart` | `syntax` | 차트에 있는 행 이름을 적는다 |
| 숫자가 아닌 값과의 연결 | `chart "c" reads "v", which holds "none" at the start. A chart value is a number` | `value-type` | 값의 시작 값을 숫자로 둔다 |
| 묶은 값이 장면 중에 차트의 값 범위를 어김 | `chart "c" reads v=-5: values cannot be negative` | `value-type` | 같은 숫자를 행에 적어도 거절되는 값이면 묶어도 거절된다. 값이 범위 안에 머물게 한다. 오류는 묶은 행의 줄에 붙는다 |
| `data` 파일 읽기 실패 | `cannot read data "a.json" at "/rows": ENOENT` 또는 `not valid JSON at position 12` | `syntax` | 경로와 JSON을 고친다. 메시지에 파일의 내용은 싣지 않는다 |
| 값 축 제목에 단위 없음 | `the value axis title needs a unit in parentheses, such as x "latency(ms)"` | `syntax` | 제목에 `(단위)`를 붙인다(경고, `--strict`에서 실패) |

`code`는 `torso check figure.torso --json`으로 본다.
