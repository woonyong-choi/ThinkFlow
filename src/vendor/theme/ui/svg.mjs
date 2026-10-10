// 정적 아이콘의 도형과 내부 mask 참조만 읽는다. 원본 좌표는 유지하고 삽입할 때 ID를 분리한다.
import { escape } from './html.mjs';

const SHAPES = Object.freeze({
  svg: ['viewBox', 'width', 'height', 'xmlns', 'version', 'role', 'aria-hidden', 'focusable'],
  g: [], defs: [],
  mask: ['x', 'y', 'width', 'height', 'maskUnits', 'maskContentUnits', 'mask-type'],
  path: ['d'], rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
  circle: ['cx', 'cy', 'r'], ellipse: ['cx', 'cy', 'rx', 'ry'],
  line: ['x1', 'y1', 'x2', 'y2'], polyline: ['points'], polygon: ['points'],
  title: [], desc: [],
});
const COMMON = Object.freeze(['id', 'color', 'fill', 'stroke', 'transform', 'mask', 'opacity', 'fill-opacity', 'stroke-opacity', 'stroke-width', 'stroke-miterlimit', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset', 'fill-rule', 'clip-rule', 'data-name']);
const WORDS = Object.freeze({
  'stroke-linecap': ['butt', 'round', 'square'], 'stroke-linejoin': ['miter', 'round', 'bevel'],
  'fill-rule': ['nonzero', 'evenodd'], 'clip-rule': ['nonzero', 'evenodd'],
  maskUnits: ['userSpaceOnUse', 'objectBoundingBox'], maskContentUnits: ['userSpaceOnUse', 'objectBoundingBox'],
  'mask-type': ['alpha', 'luminance'], role: ['img', 'presentation'],
  'aria-hidden': ['true', 'false'], focusable: ['true', 'false'], version: ['1.0', '1.1', '2.0'],
});
const NUMBER = String.raw`[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?`;
const FINITE = new RegExp(`^${NUMBER}$`);
const LENGTH = new RegExp(`^(${NUMBER})(?:px|%)?$`);
const NUMBERS = new RegExp(String.raw`^${NUMBER}(?:[\s,]+${NUMBER})*$`);
const VARIABLE = /^var\(--[a-zA-Z_][\w-]*\)$/;
const ID = /^[a-zA-Z_][\w.-]*$/;
const TAG = /<(\/?)([a-zA-Z][\w:-]*)([^<>]*?)(\/?)>/g;
const ATTRIBUTE = /\s+([a-zA-Z_:][\w:.-]*)\s*=\s*(?:"([^"<>&]*)"|'([^'<>&]*)')/gy;
const OMITTED = new Set(['viewBox', 'width', 'height', 'xmlns', 'version', 'role', 'aria-hidden', 'focusable', 'data-name']);
const MAX_LENGTH = 262144;
const MAX_ELEMENTS = 4096;
let nextIconId = 0;

/** @returns {{viewBox: number[], body: string}} @throws {Error} 정적 도형·내부 mask 참조 밖의 SVG일 때 */
export function parseIconSvg(text) {
  const parsed = parseSvg(text);
  return { viewBox: parsed.viewBox, body: svgBody(parsed) };
}

/** 주어진 정사각 격자로 원본을 맞춘다. 같은 문서의 각 삽입에는 서로 다른 prefix를 쓴다. */
export function iconBody(text, { size, prefix, monochrome = false } = {}) {
  if (!Number.isFinite(size) || size <= 0) throw new TypeError('icon size must be finite and positive');
  const parsed = parseSvg(text);
  const [x, y, width, height] = parsed.viewBox;
  const scale = size / Math.max(width, height);
  const tx = (size - width * scale) / 2 - x * scale;
  const ty = (size - height * scale) / 2 - y * scale;
  if (!(scale > 0) || ![scale, tx, ty].every(Number.isFinite)) throw new Error('icon viewBox cannot fit the requested size');
  const body = svgBody(parsed, { prefix: iconPrefix(prefix), monochrome });
  return scale === 1 && tx === 0 && ty === 0 ? body : `<g transform="translate(${tx} ${ty}) scale(${scale})">${body}</g>`;
}

/** 검증한 원본 좌표로 장식용 SVG를 만든다. 크기는 사용하는 구성 요소가 정한다. */
export function renderSvgIcon(text, { className = '', prefix, monochrome = false } = {}) {
  if (typeof className !== 'string' || !/^[\w -]*$/.test(className)) throw new TypeError('invalid icon class');
  const parsed = parseSvg(text);
  const body = svgBody(parsed, { prefix: iconPrefix(prefix), monochrome });
  return `<svg xmlns="http://www.w3.org/2000/svg"${className ? ` class="${escape(className)}"` : ''} viewBox="${parsed.viewBox.join(' ')}" aria-hidden="true" focusable="false">${body}</svg>`;
}

function parseSvg(text) {
  if (typeof text !== 'string' || text.length > MAX_LENGTH) throw new TypeError('invalid icon SVG size');
  const source = text.replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*<\?xml\s[^?]*\?>/, '');
  const state = { stack: [], elements: [], ids: new Map(), references: [], root: null };
  let end = 0;
  let count = 0;
  for (const match of source.matchAll(TAG)) {
    if (++count > MAX_ELEMENTS) throw new Error('icon SVG has too many elements');
    if (source.slice(end, match.index).trim() && !state.stack.at(-1)?.hidden) throw new Error('icon SVG contains text outside title or desc');
    readElement(match, state);
    end = match.index + match[0].length;
  }
  if (!state.root || state.stack.length || source.slice(end).trim()) throw new Error('icon SVG must contain one closed svg element');
  for (const target of state.references) {
    if (state.ids.get(target) !== 'mask') throw new Error(`icon mask does not exist: ${target}`);
  }
  return { viewBox: viewBoxOf(state.root.attrs), root: state.root, elements: state.elements };
}

function readElement([, closing, tag, raw, selfClosing], state) {
  if (!Object.hasOwn(SHAPES, tag)) throw new Error(`unsupported icon element: ${tag}`);
  if (closing) {
    const opened = state.stack.pop();
    if (raw.trim() || selfClosing || opened?.tag !== tag) throw new Error(`unmatched icon closing element: ${tag}`);
    if (tag !== 'svg' && !opened.hidden) state.elements.push({ tag, closing: true });
    return;
  }
  const parent = state.stack.at(-1);
  if (tag === 'svg' ? state.root || parent : !parent) throw new Error('icon SVG must have one svg root');
  const attrs = readAttributes(raw, tag);
  const hidden = Boolean(parent?.hidden || tag === 'title' || tag === 'desc');
  const isMask = Boolean(parent?.isMask || tag === 'mask');
  const paint = { ...parent?.paint, fill: attrs.fill ?? parent?.paint.fill ?? 'black', stroke: attrs.stroke ?? parent?.paint.stroke ?? 'none' };
  if (attrs.color) paint.color = attrs.color;
  const element = { tag, attrs, hidden, isMask, paint, selfClosing: Boolean(selfClosing) };
  if (tag === 'svg') state.root = element;
  else if (!hidden) state.elements.push(element);
  if (!hidden && attrs.id) {
    if (state.ids.has(attrs.id)) throw new Error(`duplicate icon id: ${attrs.id}`);
    state.ids.set(attrs.id, tag);
  }
  if (!hidden && attrs.mask && attrs.mask !== 'none') state.references.push(attrs.mask.slice(5, -1));
  if (!selfClosing) state.stack.push(element);
}

function readAttributes(raw, tag) {
  const attrs = {};
  ATTRIBUTE.lastIndex = 0;
  let match;
  let end = 0;
  while ((match = ATTRIBUTE.exec(raw))) {
    const [, name, double, single] = match;
    if (Object.hasOwn(attrs, name)) throw new Error(`duplicate icon attribute: ${name}`);
    const value = (double ?? single).trim();
    validateAttribute(tag, name, value);
    attrs[name] = value;
    end = ATTRIBUTE.lastIndex;
  }
  if (raw.slice(end).trim()) throw new Error('invalid icon attributes');
  return attrs;
}

function validateAttribute(tag, name, value) {
  if (!COMMON.includes(name) && !SHAPES[tag].includes(name)) throw new Error(`unsupported icon attribute: ${name}`);
  if (name === 'id') return requireValue(ID.test(value), name);
  if (name === 'data-name') return;
  if (name === 'xmlns') return requireValue(value === 'http://www.w3.org/2000/svg', name);
  if (name === 'viewBox') return;
  if (Object.hasOwn(WORDS, name)) return requireValue(WORDS[name].includes(value), name);
  if (name === 'mask') return requireValue(value === 'none' || /^url\(#[a-zA-Z_][\w.-]*\)$/.test(value), name);
  if (['color', 'fill', 'stroke'].includes(name)) return requireValue(/^(?:none|transparent|currentColor|black|white)$/i.test(value) || /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(value) || VARIABLE.test(value), name);
  if (name === 'transform') return validateTransform(value);
  if (name === 'd') return requireValue(/^[MmLlHhVvCcSsQqTtAaZz\d\s.,+\-eE]*$/.test(value) && finiteGeometry(value), name);
  if (name === 'points' || name === 'stroke-dasharray') return requireValue(name === 'stroke-dasharray' && value === 'none' || numberList(value).length > 0, name);
  const number = value.match(LENGTH)?.[1];
  requireValue(VARIABLE.test(value) || number !== undefined && Number.isFinite(Number(number)), name);
}

function requireValue(valid, name) {
  if (!valid) throw new Error(`invalid icon ${name} value`);
}

function numberList(value) {
  if (!NUMBERS.test(value)) return [];
  const numbers = value.split(/[\s,]+/).map(Number);
  return numbers.every(Number.isFinite) ? numbers : [];
}

function finiteGeometry(value) {
  return [...value.matchAll(new RegExp(NUMBER, 'g'))].every(match => Number.isFinite(Number(match[0])));
}

function validateTransform(value) {
  const arity = { matrix: [6], translate: [1, 2], scale: [1, 2], rotate: [1, 3], skewX: [1], skewY: [1] };
  const pattern = /([a-zA-Z]+)\(([^)]*)\)/g;
  let end = 0;
  for (const match of value.matchAll(pattern)) {
    if (value.slice(end, match.index).replace(/[\s,]/g, '')) throw new Error('invalid icon transform');
    if (!arity[match[1]]?.includes(numberList(match[2].trim()).length)) throw new Error('invalid icon transform');
    end = match.index + match[0].length;
  }
  requireValue(end > 0 && !value.slice(end).trim(), 'transform');
}

function viewBoxOf(attrs) {
  const box = attrs.viewBox === undefined ? [0, 0, dimension(attrs.width), dimension(attrs.height)] : numberList(attrs.viewBox);
  if (box.length !== 4 || !box.every(Number.isFinite) || box[2] <= 0 || box[3] <= 0) throw new Error('icon viewBox needs four finite numbers and a positive width and height');
  return box;
}

function dimension(value = '') {
  const raw = value.replace(/px$/, '');
  return FINITE.test(raw) ? Number(raw) : Number.NaN;
}

function iconPrefix(prefix) {
  const value = prefix ?? `icon-${++nextIconId}`;
  if (typeof value !== 'string' || !ID.test(value)) throw new TypeError('invalid icon prefix');
  return value;
}

function svgBody({ root, elements }, options = {}) {
  const rootAttrs = { ...root.attrs };
  for (const name of OMITTED) delete rootAttrs[name];
  if (options.monochrome && rootAttrs.fill === undefined) rootAttrs.fill = 'currentColor';
  return `<g${attributes({ ...root, attrs: rootAttrs }, options)}>${elements.map(element => {
    if (element.closing) return `</${element.tag}>`;
    return `<${element.tag}${attributes(element, options)}${element.selfClosing ? '/>' : '>'}`;
  }).join('')}</g>`;
}

function attributes(element, { prefix, monochrome = false }) {
  const attrs = { ...element.attrs };
  delete attrs['data-name'];
  if (monochrome && !element.isMask) delete attrs.color;
  // mask의 상속 색도 고정해야 바깥 visible paint를 단색으로 바꿀 때 의미가 바뀌지 않는다.
  if (monochrome && element.tag === 'mask') Object.assign(attrs, element.paint);
  return Object.entries(attrs).map(([name, original]) => {
    let value = original;
    if (prefix && name === 'id') value = `${prefix}-${value}`;
    if (prefix && name === 'mask' && value !== 'none') value = `url(#${prefix}-${value.slice(5, -1)})`;
    if (monochrome && !element.isMask && ['fill', 'stroke'].includes(name) && !/^(none|transparent)$/i.test(value)) value = 'currentColor';
    return ` ${name}="${escape(value)}"`;
  }).join('');
}
