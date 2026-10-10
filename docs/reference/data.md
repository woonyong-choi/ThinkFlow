# 데이터 관계 그림

테이블 카드(`table`)의 열과 외래 키를 그래프 보기로 보이는 그림입니다. 스키마 설명이나 한 요청이 어느 행을 따라가는지 보일 때 씁니다.

## 최소 예제

```dap name=minimal
daphnis 2
title "회원과 주문"

table users "users" {
  id bigint pk
  email varchar unique required
}
table orders "orders" {
  id bigint pk
  user_id bigint fk=users.id required ondelete=restrict
  total "numeric(10, 2)"
}

scene "주문"
  light orders.user_id users.id
  orders -> users time=900ms
  show users "id 7 · kim@example.com" tag="행"
```

![회원과 주문](data-minimal.svg)<!-- dap -->

테이블 사이 선은 `fk=테이블.열`에서만 생깁니다. 선을 따로 적는 줄은 없습니다. 열 줄은 `이름 타입`에 `pk`, `unique`, `nullable`, `required`, `fk=`, `ondelete=`를 이어 적습니다.

## 문법

줄 종류와 선택 사항은 [그림 문법](../design/figure-syntax.md#문법-표)의 문법 표가 정본이고, 테이블 카드의 규칙은 [카드와 보기](../design/figure-kinds.md#스키마)에 있습니다.

## 장면과 움직임

이동은 외래 키 선을 적은 방향으로 따라가고, 그 방향에 없으면 반대 방향을 거꾸로 따라갑니다. 같은 방향 외래 키가 둘 이상이면 `payments.order_id -> orders.id`처럼 열까지 적습니다. `light 테이블.열 테이블.열`은 열을 밝히고, `show 테이블 "글"`은 테이블 아래 카드에 예시 행을 보입니다. `nullable`과 `required`는 NULL 허용 여부를, `ondelete=cascade`와 `set-null`은 삭제 정책을 열 아래 줄에 보입니다. 같은 테이블의 서로 다른 두 열을 잇는 자기 참조 외래 키(`referrer_id bigint fk=users.id nullable`)는 카드 오른쪽 면을 도는 고리로 그립니다. 같은 열이나 카드 전체를 자기 자신에 잇는 선은 오류입니다(`an edge cannot go from "users.id" to itself`). [schema 예제](../../examples/schema.dap)가 키, 제약, 삭제 정책, 자기 참조 외래 키를 모두 씁니다.

## 흔한 오류

| 원인 | 메시지 | code | 고치는 방법 |
|---|---|---|---|
| `pk`나 `unique`가 아닌 열을 가리키는 외래 키 | `fk must point to a pk or unique column. "a.id" is neither` | `syntax` | 가리키는 열에 `pk`나 `unique`를 적습니다 |
| 칸 이름에 점이 둘 | `write a part as card.part. Found "a.id.z"` | `syntax` | `테이블.열`로 적습니다 |
| 기호가 든 타입 | `write a type with symbols as quoted text: "varchar(255)"` | `syntax` | 타입을 따옴표 글로 적습니다 |
| 열 없는 테이블 | `table "t" has no columns` | `syntax` | 열을 하나 이상 둡니다 |
| 선언하지 않은 테이블 | `unknown card "c". Did you mean "a"? Declared: a, b` | `syntax` | 이름을 고치거나 테이블을 선언합니다 |

`code`는 `daphnis check figure.dap --json`으로 봅니다.
