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
  user_id bigint fk=users.id required ondelete=restrict from="0..*" to="1"
  total "numeric(10, 2)"
}

scene "주문"
  light orders.user_id users.id
  orders -> users time=900ms
  show users "id 7 · kim@example.com" tag="행"
```

![회원과 주문](data-minimal.svg)<!-- dap -->

외래 키 선은 `fk=테이블.열`에서 생긴다. 열 줄은 `이름 타입`에 `pk`, `unique`, `nullable`, `required`, `fk=`, `ondelete=`를 이어 적는다. 외래 키 열의 `from="0..*" to="1"`은 각각 출발 테이블과 참조 대상 쪽 다중성이다. 값은 음이 아닌 정수, `*`, `0..1`이나 `1..*`처럼 순서가 맞는 범위이며 생략하면 표시하지 않는다.

`orders -> users "주문자" relation=association from="0..*" to="1"`처럼 직접 적는 선은 설명을 위한 관계다. `테이블.열`도 끝으로 쓸 수 있지만 외래 키 제약은 만들지 않는다. `relation=association`은 화살촉 없는 연관이고, 생략하면 일반 연결선의 화살촉 규칙을 따른다. 이미 `fk=`로 연결한 같은 열 쌍을 직접 연결하면 중복 오류다. 상속·합성 같은 클래스 전용 관계는 테이블에 쓰지 않는다.

## 문법

줄 종류와 선택 사항은 [그림 문법](../design/figure-syntax.md#문법-표)의 문법 표가 정본이고, 테이블 카드의 규칙은 [카드와 보기](../design/figure-kinds.md#스키마)에 있습니다.

## 단일 키와 복합 키

한 열의 키는 위 예제처럼 열 옆에 적는다. 여러 열을 묶는 키는 테이블 안에서 `pk (열, ...)`, `unique (열, ...)`, `fk (열, ...) -> 테이블 (열, ...)`로 적는다. 괄호 문법은 열 하나에도 쓸 수 있으며 두 표기는 같은 키 모형으로 처리된다.

```dap name=composite
daphnis 2
title "조직 안에서 사용자를 찾는 주문"

table users "users" {
  tenant_id bigint
  id bigint
  email text required
  pk (tenant_id, id)
  unique (tenant_id, email)
}
table orders "orders" {
  id bigint pk
  tenant_id bigint required
  user_id bigint required
  fk (tenant_id, user_id) -> users (tenant_id, id) ondelete=restrict from="0..*" to="1"
}

scene "관계"
scene "주문자 찾기"
  light orders.tenant_id orders.user_id users.tenant_id users.id
  orders -> users time=900ms
  show users "tenant_id 3 · id 7" tag="행"
```

![조직 안에서 사용자를 찾는 주문](data-composite.svg)<!-- dap -->

기본 키는 테이블에 하나다. 여러 열에 `pk`를 붙이면 그 열들을 묶은 기본 키 하나가 되고, 각각이 독립적인 고유 키가 되지는 않는다. `unique (tenant_id, email)`도 두 값의 조합이 고유하다는 뜻이다. 복합 키 일부를 참조하려면 그 일부에 별도의 고유 키가 있어야 한다.

외래 키 양쪽의 열 개수는 같아야 하고 작성 순서대로 짝을 이룬다. 위 예제에서는 `orders.tenant_id`가 `users.tenant_id`에, `orders.user_id`가 `users.id`에 대응한다. 참조 대상은 기본 키 또는 고유 키의 전체 열 집합이어야 한다. 열 목록의 순서를 바꿀 수 있지만 양쪽 대응도 함께 확인해야 한다. `ondelete=set-null`이면 참조하는 모든 열에 `nullable`을 적는다.

복합 외래 키 하나는 선 하나로 그린다. 같은 `FK1` 표식이 붙은 열들이 한 참조를 이루고 선에도 그 표식이 나온다. 복합 고유 키는 `UNQ1`, `UNQ2`처럼 구분하며 기본 키는 `PK`다. 번호는 테이블 안에서 같은 종류의 복합 키를 선언한 순서로 정해진다. 접근성 설명에는 각 키의 전체 열 목록과 참조 대상이 포함된다.

여러 외래 키가 같은 두 테이블을 잇는 경우 장면의 이동에 `orders.user_id -> users.id`처럼 대응하는 열 쌍을 적어 한 선을 고른다. 선택한 열 쌍도 두 외래 키에 공통이면 모호한 이동으로 거부한다. 열 타입은 표시할 텍스트이며 SQL 방언별 타입 호환성, 실제 행의 고유성이나 참조 무결성을 실행해서 검사하지 않는다.

## 장면과 움직임

이동은 외래 키 선을 적은 방향으로 따라가고, 그 방향에 없으면 반대 방향을 거꾸로 따라갑니다. 같은 방향 외래 키가 둘 이상이면 `payments.order_id -> orders.id`처럼 열까지 적습니다. `light 테이블.열 테이블.열`은 열을 밝히고, `show 테이블 "글"`은 테이블 아래 카드에 예시 행을 보입니다. `nullable`과 `required`는 NULL 허용 여부를, `ondelete=cascade`와 `set-null`은 삭제 정책을 열 아래 줄에 보입니다. 같은 테이블의 서로 다른 두 열을 잇는 자기 참조 외래 키(`referrer_id bigint fk=users.id nullable`)는 카드 오른쪽 면을 도는 고리로 그립니다. 같은 열이나 카드 전체를 자기 자신에 잇는 선은 오류입니다(`an edge cannot go from "users.id" to itself`). [schema 예제](../../examples/schema.dap)가 키, 제약, 삭제 정책, 자기 참조 외래 키를 모두 씁니다.

## 흔한 오류

| 원인 | 메시지 | code | 고치는 방법 |
|---|---|---|---|
| 키가 아니거나 복합 키 일부만 가리키는 외래 키 | `fk must point to a pk or unique column tuple: reference a whole key of "a"` | `syntax` | 기본 키 또는 고유 키의 전체 열을 참조한다 |
| 외래 키 양쪽 열 개수가 다름 | `both sides of a foreign key need the same number of columns` | `syntax` | 같은 위치의 열끼리 대응하도록 양쪽 목록을 맞춘다 |
| 칸 이름에 점이 둘 | `write a part as card.part. Found "a.id.z"` | `syntax` | `테이블.열`로 적습니다 |
| 기호가 든 타입 | `write a type with symbols as quoted text: "varchar(255)"` | `syntax` | 타입을 따옴표 글로 적습니다 |
| 열 없는 테이블 | `table "t" has no columns` | `syntax` | 열을 하나 이상 둡니다 |
| 선언하지 않은 테이블 | `unknown card "c". Did you mean "a"? Declared: a, b` | `syntax` | 이름을 고치거나 테이블을 선언합니다 |

`code`는 `daphnis check figure.dap --json`으로 봅니다.
