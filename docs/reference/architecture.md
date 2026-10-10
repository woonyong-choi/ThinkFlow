# 구성도

구성도는 [구조 그림](flow.md)에 그룹, 아이콘, 번호 선, 배지, 복제 개수를 더한 그림입니다. 클라우드 구성, 서비스 개요, 배포 경로처럼 구성 요소가 많은 그림에 씁니다. 문법은 구조 그림과 같고, 아래 선택 사항만 더합니다.

## 최소 예제

```dap name=minimal
daphnis 2
title "웹 서비스 구성"

group edge "엣지" border=dashed {
  box cdn "CDN" shape=tile icon=cdn
}
group app "애플리케이션" icon=region direction=down {
  group web "웹 계층" direction=down {
    box lb "로드 밸런서" shape=tile icon=lb
    box server "웹 서버" shape=tile icon=server count=3
  }
  store db "주 DB" icon=db badge="RW"
}

cdn -> lb "요청" no=1
lb -> server no=2
server -> db "조회" no=3

view graph down

scene "요청"
  cdn -> lb time=700ms
  lb -> server time=700ms
  server -> db time=700ms
```

![웹 서비스 구성](architecture-minimal.svg)<!-- dap -->

`group`이 중첩 구역을 만들고 깊이마다 면이 한 단계 진해집니다. `shape=tile`은 아이콘 카드이고 `icon=`은 내장 아이콘 이름입니다.

## 문법

선택 사항의 값 목록은 [그림 문법](../design/figure-syntax.md#문법-표)의 문법 표가 정본이고, 번호, 배지, 아이콘, 복제 개수와 도형 색의 규칙은 [그림 문법](../design/figure-syntax.md#번호-배지-아이콘-복제-개수)에 있습니다. 넓은 캔버스(`width wide`)와 배치는 [배치](../design/layout.md)에 있습니다.

| 더하는 것 | 쓰는 자리 | 뜻 |
|---|---|---|
| `no=N` | 선 | 선 번호. 정지 그림에서도 순서가 읽힙니다 |
| `badge="글"` | 카드, 그룹 | 8자 이하 글자 알약. 흑백에서도 남습니다 |
| `icon=이름` | 카드, 그룹 | 내장 아이콘. 등록한 세트는 `icons 이름 "폴더"` 뒤 `icon=세트:이름` |
| `count=N` | `box` | 같은 역할 복제 N개를 겹쳐 그립니다 |
| `border=dashed` | 그룹 | 논리 경계의 점선 테두리 |
| `tone=색` | 카드, 그룹 | 색 이름. `blue`, `yellow`, `red`, `green`, `orange`, `purple`, `cyan`, `gray` 가운데 하나입니다 |
| `appearance=plain\|filled\|outline` | 카드, 그룹 | 색을 쓰는 방식. `plain`(기본)은 중립 면에 색 아이콘과 작은 표식, `filled`는 같은 계열의 옅은 면, `outline`은 같은 계열의 경계와 중립 면입니다. `filled`와 `outline`은 `tone`이 있어야 합니다 |
| `quiet` | 선 | 그 선을 처음 지나는 박자부터 그 장면 끝까지만 보입니다 |
| `width wide` | 머리 | 넓은 캔버스. 열이 많은 구성도에 씁니다 |

그룹은 자기 `direction`으로 안쪽 카드를 쌓습니다. 안쪽 카드 사이에 선이 있어야 `down`이 세로로 쌓이고, 선이 없는 카드는 한 줄에 나란히 놓입니다. 가로로 너무 넓어져 글자가 12px보다 작아질 만하면 `at canvas width the smallest text is 6.1px. Make the figure narrower with group directions, or write the flow as down` 오류가 나므로 그룹 방향을 바꾸거나 `view graph down`으로 씁니다. 글자를 줄여 맞추지 않습니다.

## 장면과 움직임

구조 그림과 같은 박자와 흐름을 씁니다. 번호는 읽는 순서일 뿐 재생 장면과 따로입니다. 대표 예는 [architecture 예제](../../examples/architecture.dap)이고, 복제본으로 넘어가는 `quiet` 선과 `status="db=fail, replica=ok"` 장면도 거기 있습니다. 동시에 들어오는 흐름과 값 변화는 [구조 그림](flow.md)의 `track`을 봅니다.

## 흔한 오류

| 원인 | 메시지 | code | 고치는 방법 |
|---|---|---|---|
| 없는 아이콘 이름 | `unknown icon "nope". Declared: admin, ansible, apigw, ...` | `syntax` | 목록의 이름을 고르거나 `icon=`을 빼고 `badge=`를 씁니다 |
| 선언하지 않은 이름 | `unknown card "c". Did you mean "a"? Declared: a, b` | `syntax` | 이름을 고칩니다 |
| 쓸 수 없는 색 이름 | `tone is one of blue, yellow, red, green, orange, purple, cyan, gray. Colors are names, not hex, so the contrast rules hold` | `syntax` | 목록의 이름을 고릅니다 |
| 색 없이 `filled`, `outline` | `appearance=filled needs tone. Add tone=name or use appearance=plain` | `syntax` | `tone=`을 더하거나 `appearance=plain`으로 둡니다 |
| 받지 않는 선택 사항(`fill=`, `stroke=`) | `a box takes count=, shape=, badge=, icon=, tone=, appearance=. Found "fill"` | `syntax` | 메시지가 알리는 선택 사항을 씁니다 |
| 카드가 하나도 없음 | `a figure needs at least one card` | `syntax` | 그룹 안에 카드를 둡니다 |
| 선이 그룹 제목 줄을 지남 | 번호 13 검사의 메시지 | `check-13` | 그룹 `direction`을 바꾸거나 도형 순서를 바꿉니다 |
| 글이 도형 안에 들지 않음 | 번호 1 검사의 메시지 | `check-1` | 이름을 줄입니다 |
| 문서 폭에서 글이 너무 작음 | 번호 10 검사의 메시지 | `check-10` | 도형을 줄이거나 그림을 나눕니다(경고) |

`code`는 `daphnis check figure.dap --json`으로 봅니다. 항목 전체는 [그림 검사](../design/figure-check.md)에 있습니다.
