// 텍스트, 주소, 식별자와 명시적으로 신뢰한 HTML 슬롯의 경계다.
const ID = /^[\w-]+$/;

export const escape = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

export function safeUrl(value) {
  if (typeof value !== 'string' || /[\u0000- \\]/u.test(value) || !/^(?:https?:\/\/|mailto:|\/(?!\/)|#)/.test(value)) throw new Error(`Unsupported URL: ${value}`);
  return escape(value);
}

class Trusted {
  constructor(html) { this.html = String(html); }
  toString() { return this.html; }
}
/** 이미 안전하게 만든 HTML을 슬롯으로 넘긴다. 이스케이프하지 않는다. */
export const trusted = (html) => new Trusted(html);
export const isTrusted = (value) => value instanceof Trusted;

export function slot(value, name) {
  if (!isTrusted(value)) throw new TypeError(`${name} must be trusted(html)`);
  return value.html;
}
export function id(value) {
  if (typeof value !== 'string' || !ID.test(value)) throw new TypeError(`Invalid id: ${value}`);
  return value;
}
export const out = (html) => trusted(html);
