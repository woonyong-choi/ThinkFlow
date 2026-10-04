# 구성도

구성도는 구조 그림(`flow`)에 그룹, 아이콘, 번호 선, 배지, 복제 개수를 더한 그림입니다. 클라우드 구성, 서비스 개요, 배포 경로처럼 구성 요소가 많은 그림에 씁니다. 문법은 [구조 그림](flow.md)과 같고, 아래 선택 사항만 더합니다.

## 최소 예제

```dap name=minimal
flow right
title "웹 서비스 구성"

group edge "엣지" border=dashed {
  box cdn "CDN" shape=tile icon=cdn
}
group app "애플리케이션" icon=region {
  group web "웹 계층" {
    box lb "로드 밸런서" shape=tile icon=lb
    box server "웹 서버" shape=tile icon=server count=3
  }
  store db "주 DB" icon=db badge="RW"
}

cdn -> lb "요청" no=1
lb -> server no=2
server -> db "조회" no=3

step "요청" "CDN이 요청을 로드 밸런서로 넘깁니다"
  cdn -> lb
step "처리" "웹 서버가 데이터베이스를 읽습니다"
  lb -> server
  server -> db
```

![웹 서비스 구성](architecture-minimal.svg)<!-- dap -->

`group`이 중첩 구역을 만들고 깊이마다 면이 한 단계 진해집니다. `shape=tile`은 아이콘 카드이고 `icon=`은 내장 아이콘 이름입니다.

## 문법

선택 사항의 값 목록은 [그림 문법](../design/figure-syntax.md#호환-규칙)의 문법 표가 정본이고, 번호, 배지, 아이콘, 복제 개수와 도형 색의 규칙은 [그림 문법](../design/figure-syntax.md#번호-배지-아이콘-복제-개수)에 있습니다. 넓은 캔버스(`width wide`)와 배치는 [배치](../design/layout.md)에 있습니다.

| 더하는 것 | 쓰는 자리 | 뜻 |
|---|---|---|
| `no=N` | 선 | 선 번호. 정지 그림에서도 순서가 읽힙니다 |
| `badge="글"` | 도형, 그룹 | 8자 이하 글자 알약. 흑백에서도 남습니다 |
| `icon=이름` | 도형, 그룹 | 내장 아이콘. 등록한 세트는 `icon=세트:이름` |
| `count=N` | `box` | 같은 역할 복제 N개를 겹쳐 그립니다 |
| `border=dashed` | 그룹 | 논리 경계의 점선 테두리 |
| `width wide` | 머리 | 넓은 캔버스. 열이 많은 구성도에 씁니다 |

## 단계와 움직임

구조 그림과 같은 박자와 흐름을 씁니다. 번호는 읽는 순서일 뿐 재생 단계와 따로입니다. 구성도의 대표 예는 README 첫 그림이고 원본은 [cloud-architecture-ko.dap](../assets/showcase/cloud-architecture-ko.dap)입니다. 동시에 들어오는 흐름과 값 변화는 [구조 그림](flow.md)의 `track`을 봅니다.

## 흔한 오류

| 원인 | 메시지 | code | 고치는 방법 |
|---|---|---|---|
| 없는 아이콘 이름 | `unknown icon "nope". Declared: admin, ansible, apigw, ...` | `syntax` | 목록의 이름을 고르거나 `icon=`을 빼고 `badge=`를 씁니다 |
| 선언하지 않은 이름 | `unknown node "c". Did you mean "a"? Declared: a, b` | `syntax` | 이름을 고칩니다 |
| 선이 그룹 제목 줄을 지남 | 번호 13 검사의 메시지 | `check-13` | 그룹 `direction`을 바꾸거나 도형 순서를 바꿉니다 |
| 글이 도형 안에 들지 않음 | 번호 1 검사의 메시지 | `check-1` | 이름을 줄입니다 |
| 문서 폭에서 글이 너무 작음 | 번호 10 검사의 메시지 | `check-10` | 도형을 줄이거나 그림을 나눕니다(경고) |

`code`는 `daphnis check figure.dap --json`으로 봅니다. 항목 전체는 [그림 검사](../design/figure-check.md)에 있습니다.
