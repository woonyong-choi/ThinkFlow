// 아이콘 SVG 파일을 그림에 넣어도 안전한 모양만 남긴다. 허용한 요소와 속성만 다시 쓰고, 색은 모두 currentColor로 바꾼다(색은 그림이 역할 토큰으로 칠한다).
// 허용 밖의 요소(script, image, style, use, 그라디언트 같은 것)나 글자는 오류다. 사용자가 등록한 세트의 파일이 그림 안에서 코드나 외부 자원을 부르지 못하게 하기 위해서다.

const SHAPE_ATTRS = {
  g: [],
  path: ['d'],
  circle: ['cx', 'cy', 'r'],
  ellipse: ['cx', 'cy', 'rx', 'ry'],
  rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
  line: ['x1', 'y1', 'x2', 'y2'],
  polyline: ['points'],
  polygon: ['points'],
};
// 색은 값을 옮기지 않고 none인지 아닌지만 본다.
const PAINT_ATTRS = ['fill', 'stroke'];
const NUMBER_ATTRS = ['stroke-width', 'stroke-miterlimit', 'opacity', 'fill-opacity', 'stroke-opacity'];
const WORD_ATTRS = { 'stroke-linecap': ['butt', 'round', 'square'], 'stroke-linejoin': ['miter', 'round', 'bevel'], 'fill-rule': ['nonzero', 'evenodd'], 'clip-rule': ['nonzero', 'evenodd'] };
const NUMBER_PATTERN = /^-?(\d+\.?\d*|\.\d+)(e-?\d+)?(px)?$/i;
const SAFE_PATTERNS = { d: /^[MmLlHhVvCcSsQqTtAaZz\d\s.,+\-eE]*$/, points: /^[\d\s.,+\-eE]*$/, transform: /^[a-z\d\s.,()+\-]*$/i };
const SIZE_MAX = 65536;
const ELEMENT_MAX = 600;
const TAG_PATTERN = /<(\/?)([A-Za-z][\w:-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/?)>/g;
const ATTR_PATTERN = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g;
// 안쪽 글이 있어도 그리지 않는 요소와 머리말은 먼저 지운다.
const SKIPPED = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<(title|desc|metadata)\b[\s\S]*?<\/\1>/gi;

// cost: time O(n), heap O(n), stack O(d)
// vars: n = 파일 글자 수, d = 요소 깊이
// basis: estimate
/**
 * SVG 글을 { viewBox: [x, y, w, h], body }로 줄인다. body는 허용한 요소만 다시 쓴 `<g>` 하나다.
 * @throws Error 허용 밖의 요소, 속성, 글자가 있거나 크기를 알 수 없을 때. 메시지는 고칠 방법을 말한다
 */
export function sanitizeIcon(text) {
  if (text.length > SIZE_MAX) throw new Error(`the icon file is over ${SIZE_MAX} characters`);
  const rest = text.replace(SKIPPED, '');
  const tags = [...rest.matchAll(TAG_PATTERN)];
  const outside = rest.replace(TAG_PATTERN, '').trim();
  if (outside) throw new Error(`the icon file has text outside tags: "${outside.slice(0, 20)}"`);
  if (tags.length > ELEMENT_MAX) throw new Error(`the icon file has more than ${ELEMENT_MAX} elements`);
  const [root, ...inner] = tags;
  if (root?.[2] !== 'svg' || root[1]) throw new Error('the icon file must start with an <svg> element');
  const rootAttrs = readAttrs(root[3]);
  return { viewBox: viewBoxOf(rootAttrs), body: `<g${paintOf(rootAttrs, { isRoot: true })}>${shapes(inner)}</g>` };
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 요소 수
// basis: estimate
// 요소 목록(여는 태그와 닫는 태그)을 허용한 모양만 다시 쓴 글로.
function shapes(tags) {
  const out = [];
  const open = [];
  for (const [, closing, name, rawAttrs, selfClosing] of tags) {
    if (name === 'svg' && closing) continue;
    if (!(name in SHAPE_ATTRS)) throw new Error(`the icon uses <${name}>, which is not supported. Use ${Object.keys(SHAPE_ATTRS).join(', ')}`);
    if (closing) {
      if (open.pop() !== name) throw new Error(`the icon has a closing </${name}> without its opening tag`);
      out.push(`</${name}>`);
      continue;
    }
    const attrs = readAttrs(rawAttrs);
    out.push(`<${name}${shapeAttrs(name, attrs)}${paintOf(attrs, { isRoot: false })}${selfClosing ? '/>' : '>'}`);
    if (!selfClosing) open.push(name);
  }
  if (open.length) throw new Error(`the icon does not close <${open.at(-1)}>`);
  return out.join('');
}

// cost: time O(a), heap O(a), stack O(1)
// vars: a = 속성 수
// basis: estimate
// 속성 글을 { 이름: 값 }으로. 값이 없는 속성은 빈 글이다.
function readAttrs(raw) {
  return Object.fromEntries([...raw.matchAll(ATTR_PATTERN)].map((m) => [m[1], m[2] ?? m[3] ?? '']));
}

// cost: time O(a), heap O(a), stack O(1)
// vars: a = 속성 수
// basis: estimate
// 도형 모양 속성(좌표)과 변환. 허용 밖의 속성은 건너뛰지 않고 오류로 알린다(style이나 on* 같은 것이 몰래 들어오지 못하게 한다).
function shapeAttrs(name, attrs) {
  const known = new Set([...SHAPE_ATTRS[name], 'transform', ...PAINT_ATTRS, ...NUMBER_ATTRS, ...Object.keys(WORD_ATTRS)]);
  const bad = Object.keys(attrs).find((key) => !known.has(key) && key !== 'id' && key !== 'class');
  if (bad) throw new Error(`the icon sets "${bad}" on <${name}>, which is not supported`);
  return [...SHAPE_ATTRS[name], 'transform'].filter((key) => key in attrs).map((key) => ` ${key}="${safe(key, attrs[key])}"`).join('');
}

// 좌표 값 하나. 종류별 글자 규칙을 어기면 오류다.
function safe(key, value) {
  const pattern = SAFE_PATTERNS[key] ?? NUMBER_PATTERN;
  if (!pattern.test(value.trim())) throw new Error(`the icon has an unsupported ${key} value "${value.slice(0, 20)}"`);
  return value.trim();
}

// cost: time O(a), heap O(a), stack O(1)
// vars: a = 속성 수
// basis: estimate
// 칠하기 속성. 색은 none이 아니면 currentColor다. 뿌리 요소(isRoot)는 fill이 없으면 currentColor로 칠하고, 안쪽 요소는 적은 것만 쓴다.
function paintOf(attrs, { isRoot }) {
  const paints = PAINT_ATTRS.filter((key) => key in attrs || (isRoot && key === 'fill')).map((key) => {
    const value = (attrs[key] ?? 'currentColor').trim().toLowerCase();
    return ` ${key}="${value === 'none' || value === 'transparent' ? 'none' : 'currentColor'}"`;
  });
  const numbers = NUMBER_ATTRS.filter((key) => key in attrs).map((key) => ` ${key}="${safe(key, attrs[key])}"`);
  const words = Object.entries(WORD_ATTRS).filter(([key, list]) => key in attrs && list.includes(attrs[key])).map(([key]) => ` ${key}="${attrs[key]}"`);
  return `${paints.join('')}${numbers.join('')}${words.join('')}`;
}

// cost: time O(1), heap O(1), stack O(1)
// vars: viewBox 값 4개
// basis: estimate
// 뿌리 요소의 viewBox. 없으면 width, height로 만든다.
function viewBoxOf(attrs) {
  const box = (attrs.viewBox ?? '').trim().split(/[\s,]+/).map(Number);
  if (box.length === 4 && box.every(Number.isFinite) && box[2] > 0 && box[3] > 0) return box;
  const [w, h] = [Number.parseFloat(attrs.width), Number.parseFloat(attrs.height)];
  if (w > 0 && h > 0) return [0, 0, w, h];
  throw new Error('the icon needs a viewBox or a width and height on <svg>');
}
