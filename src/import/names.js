// 가져오기가 쓰는 이름과 글. 다른 도구의 이름을 Torso 이름(id) 규칙에 맞추고, 글을 따옴표 낱말로 옮긴다(docs/design/import.md 이름과 글).
import { toId } from '../source/mistakes.js';

/** 빠진 필수 글(사건 글, 메시지 글, 열 타입)의 자리에 넣는 글. 원본에 없는 뜻을 지어내지 않으려고 내용 없는 표시 하나만 쓴다. */
export const MISSING_TEXT = '…';

// 칸(열) 이름 규칙. src/source/declare.js의 열 이름 규칙과 같다.
const COLUMN_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;

// cost: time O(1) 평균, heap O(n), stack O(1)
// vars: n = 이미 쓴 이름 수
// basis: estimate
/**
 * 이름 공간 하나를 만든다. take(원래 이름, joiner)는 겹치지 않는 Torso 이름을 돌려준다.
 * joiner는 낱말 사이 글자다(카드 `-`, 테이블 `_`). 원래 이름에서 이름을 만들 수 없으면 fallback 낱말로 시작한다.
 */
export function createNames() {
  const used = new Set();
  return {
    take(raw, { joiner = '-', fallback = 'node' } = {}) {
      const ascii = /[A-Za-z]/.test(String(raw)) ? toId(raw) : '';
      const base = (ascii || fallback).replaceAll('-', joiner);
      let id = base;
      for (let n = 2; used.has(id); n++) id = `${base}${joiner}${n}`;
      used.add(id);
      return id;
    },
  };
}

// cost: time O(c), heap O(c), stack O(1)
// vars: c = 카드 안 칸 수
// basis: estimate
/** 카드 하나의 칸 이름 공간. take(원래 이름)는 { name, isChanged }다. 바뀐 이름은 그림에 보이는 글이 달라지므로 부르는 쪽이 경고한다. */
export function createColumnNames() {
  const used = new Set();
  return {
    take(raw) {
      const text = String(raw);
      let base = text.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
      if (!COLUMN_NAME.test(base)) base = `c_${base}`.replace(/_+$/, '') || 'c';
      let name = base;
      for (let n = 2; used.has(name); n++) name = `${base}_${n}`;
      used.add(name);
      return { name, isChanged: name !== text };
    },
  };
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 글자 수
// basis: estimate
/**
 * 다른 도구의 글을 Torso 글 한 줄로 고친다. 줄바꿈과 `<br>`는 공백, 앞뒤 공백은 지운다.
 * 백틱이 홀수 개면 Torso가 코드 구간으로 읽지 못하므로 모두 지운다. 고친 글과 백틱을 지웠는지를 돌려준다.
 */
export function cleanText(raw) {
  let text = String(raw ?? '').replace(/<br\s*\/?>/gi, ' ').replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim();
  const ticks = (text.match(/`/g) ?? []).length;
  const isTickDropped = ticks % 2 === 1;
  if (isTickDropped) text = text.replaceAll('`', '').trim();
  return { text, isTickDropped };
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 글자 수
// basis: estimate
/** 따옴표 낱말. 따옴표와 역슬래시만 이스케이프한다(docs/design/figure-syntax.md 줄과 낱말). */
export const quote = (text) => `"${String(text).replace(/[\\"]/g, (c) => `\\${c}`)}"`;

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 글자 수
// basis: estimate
/** 테이블 열 타입. 영문자로 시작하는 낱말이면 그대로, 기호가 들면 따옴표 글이다(declare.js의 타입 규칙). */
export const typeWord = (type) => (/^[a-z][a-z0-9_]*$/i.test(type) ? type : quote(type));

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** Torso 숫자 꼴(`-`와 소수점만 쓰는 십진수). 지수 표기가 되는 아주 크거나 작은 수는 소수로 풀어 쓴다. 숫자가 아니면 undefined다. */
export function decimal(raw) {
  const value = Number(String(raw).trim());
  if (!Number.isFinite(String(raw).trim() === '' ? NaN : value)) return undefined;
  const text = String(value);
  if (!/e/i.test(text)) return text;
  return value.toFixed(20).replace(/\.?0+$/, '');
}
