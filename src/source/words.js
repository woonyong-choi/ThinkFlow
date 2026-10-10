// 이름과 값의 글자 규칙. 낱말과 값 목록은 grammar.js가 정본이다(docs/design/figure-syntax.md의 이름 절).

// 이름 규칙. 테이블은 `-` 대신 `_`를 쓰고, 열은 대문자도 받는다.
// kebab-case. `-`는 낱말 사이에 하나씩만 온다(`a-`, `a--b`는 틀림).
export const ID_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
export const TABLE_PATTERN = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;
export const COLUMN_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;
export const FK_PATTERN = /^[a-z][a-z0-9]*(_[a-z0-9]+)*\.[A-Za-z][A-Za-z0-9_]*$/;
export const TIME_PATTERN = /^(\d+(?:\.\d+)?)(ms|s)$/;
export const NUMBER_PATTERN = /^-?\d+(?:\.\d+)?$/;
export const INTEGER_PATTERN = /^\d+$/;
