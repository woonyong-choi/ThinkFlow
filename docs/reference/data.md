# 데이터 관계 그림

`data`는 테이블, 열, 외래 키 관계를 그립니다. 스키마 설명이나 한 요청이 어느 행을 따라가는지 보일 때 씁니다.

## 최소 예제

```dap name=minimal
data right
title "회원과 주문"

table users "users" {
  id bigint pk
  email varchar unique
}
table orders "orders" {
  id bigint pk
  user_id bigint fk=users.id
  total "numeric(10, 2)"
}

step "주문" "주문 행은 주문한 회원 행을 가리킵니다"
  light orders.user_id users.id
  orders -> users "user_id 7"
```

![회원과 주문](data-minimal.svg)<!-- dap -->

테이블 사이 선은 `fk=테이블.열`에서만 생깁니다. 선을 따로 적는 줄은 없습니다.

## 문법

줄 종류와 선택 사항은 [그림 문법](../design/figure-syntax.md#호환-규칙)의 문법 표가 정본이고, 데이터 관계 그림의 줄은 [그림 종류](../design/figure-kinds.md)의 데이터 관계 그림 절에 있습니다.

## 단계와 움직임

이동은 외래 키 선을 적은 방향으로 따라가고, 그 방향에 없으면 반대 방향을 거꾸로 따라갑니다. 같은 방향 외래 키가 둘 이상이면 `payments.order_id -> orders.id`처럼 열까지 적습니다. `light 테이블.열 테이블.열`은 열을 밝히고, `show 테이블 "글"`은 테이블 아래 카드에 예시 행을 보입니다.

## 흔한 오류

| 원인 | 메시지 | code | 고치는 방법 |
|---|---|---|---|
| 외래 키가 없는 열을 가리킴 | `unknown column in "t" "nope". Declared: id` | `syntax` | 열 이름을 고칩니다 |
| 기호가 든 타입 | `write a type with symbols as quoted text: "varchar(255)"` | `syntax` | 타입을 따옴표 글로 적습니다 |
| 열 없는 테이블 | `table "t" has no columns` | `syntax` | 열을 하나 이상 둡니다 |
| 선언하지 않은 테이블 | `unknown node "c". Did you mean "a"? Declared: a, b` | `syntax` | 이름을 고치거나 테이블을 선언합니다 |

`code`는 `daphnis check figure.dap --json`으로 봅니다.
