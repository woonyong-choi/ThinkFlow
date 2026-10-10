// 갱신 효과: 원자료가 바뀐 표식을 같은 모양으로 덮는 겹침. 표식 자신의 칠과 테두리는 건드리지 않고(앵커 칠 보존) 겹침만 켜졌다 꺼진다.
// 색은 표식이 싣고 온 계열의 effect 단계(`data-effect`, 그 계열 테두리를 같은 색상에서 밝힌 값) 하나뿐이다. 상태 파랑, 회색, 다른 계열의 색은 없다. 그래서 노랑 표식은 갱신 중에도 더 밝은 노랑이고 갈색이나 회색이나 파랑이 되지 않는다.
// 고리는 표식 자신의 테두리 굵기와 같은 굵기로 같은 경로를 따라 그려 자라지 않고, 면은 effect를 `opacity.halo`로 덮어 면이 밝아진다. 표식 자신의 칠은 건드리지 않는다.
// 움직이는 SVG(animate/frames.js)는 이 겹침에 SMIL을 걸고, HTML 재생기는 문서를 만들 때 같은 겹침을 넣어 두고 불투명도만 쓴다. 두 쪽이 같은 함수로 만들므로 모양 규칙(원, 사각형, 마름모, 삼각형 경로, 선, 글자)이 같다.
import { tokenize } from '../chart-tokens.js';
import { escapeXml } from '../text.js';
import { values } from '../vendor/theme/tokens.js';

/** 겹침이 표식에서 따라가는 속성. 위치와 모양만이고 칠, 움직임 class, 이름은 따라가지 않는다. 재생기가 프레임이 바뀐 표식을 따라 같은 이름들을 옮긴다. */
export const GEOMETRY_ATTRS = Object.freeze(['x', 'y', 'width', 'height', 'rx', 'cx', 'cy', 'r', 'd', 'x1', 'x2', 'y1', 'y2', 'points', 'transform', 'visibility', 'fill-rule', 'text-anchor', 'dy', 'stroke-linecap', 'stroke-linejoin']);

// 나타나는 움직임 class. 불투명도로 나타나는 것(late, pop, dot)은 겹침의 불투명도를 펄스가 쥐고 있어 따라가지 않고, 크기로 자라는 것(grow, rise, wipe)은 모양 겹침이 따라가야 한다.
// 막대가 자라는 동안 값이 바뀌어도 겹침이 막대보다 길어지지 않는다. 재생기가 붙이고 떼는 class(play, hidden, dim)는 겹침의 부모 묶음에 있어 겹침이 따로 갖지 않는다.
const GROWING_CLASSES = new Set(['grow', 'rise', 'wipe']);
// 불투명도로 나타나는 표식의 class. 겹침은 이 class와 `data-at`를 가진 묶음 안에 놓여 표식과 같은 나타남(같은 CSS 움직임)을 곱해 받는다. 그래서 아직 나타나지 않은 점이나 값 글자 자리에 효과가 먼저 번쩍이지 않는다.
const APPEARING_CLASSES = new Set(['late', 'pop', 'dot']);
// 글 겹침이 표식에서 가져가면 안 되는 class: 나타나는 움직임과 재생기 class. 글 겹침은 글꼴 class만 갖는다.
const MOTION_CLASSES = new Set(['late', 'pop', 'grow', 'draw', 'wipe', 'rise', 'play', 'dot', 'hidden', 'dim']);
// 갱신 효과를 받을 수 있는 요소. 표식이 이 밖의 요소이면 효과 없이 그대로 둔다.
const SHAPES = new Set(['rect', 'circle', 'ellipse', 'path', 'line', 'polygon', 'polyline']);

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 표식 요소가 갱신 효과를 받을 수 있는가: 원자료와 계열 효과 색(data-effect)이 있는 모양 또는 글. */
export const hasPulse = (tag, attrs) => attrs['data-effect'] !== undefined && (tag === 'text' || SHAPES.has(tag));

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/**
 * 겹침의 칠. 모양 표식은 계열 effect 면(`opacity.halo`)과 같은 색의 고리이고, 고리는 표식 자신의 테두리 굵기를 쓴다. 면이 없는 선과 속이 빈 모양은 선만 effect로 덮는다(굵기는 표식 자신의 굵기다).
 * 글은 글자 모양을 따라 effect 윤곽이 번지는 후광이다(글자 뒤에 놓이고 윤곽은 `opacity.halo`로 옅다).
 * @param attrs 표식 요소의 속성 { 이름: 값 }
 */
function lookOf(tag, attrs) {
  const effect = attrs['data-effect'];
  const own = attrs['stroke-width'] ?? values["border-width"].tag;
  if (tag === 'text') return `fill:none;stroke:${effect};stroke-opacity:${values.opacity.halo};stroke-width:${values["border-width"].casing};stroke-linejoin:round`;
  if (tag === 'line' || attrs.fill === 'none') return `fill:none;stroke:${effect};stroke-width:${attrs['stroke-width'] ?? values["border-width"].edge}`;
  const hasRing = attrs.stroke !== undefined && attrs.stroke !== 'none';
  return `fill:${effect};fill-opacity:${values.opacity.halo};stroke:${hasRing ? effect : 'none'};stroke-width:${own}`;
}

// cost: time O(a), heap O(a), stack O(1)
// vars: a = 속성 수
// basis: estimate
/**
 * 표식 하나를 덮는 겹침 요소 글. 처음 불투명도는 0이고 표식 이름(`data-pulse-of`)을 달아 재생기가 찾는다.
 * @param spec { tag, attrs, inner?, id, children? }. attrs는 표식 요소의 속성 { 이름: 값 }, inner는 글 표식의 안쪽 글, children은 겹침 안에 넣을 요소(움직이는 SVG의 SMIL)다
 */
export function pulseOverlay({ tag, attrs, inner = '', id, children = '' }) {
  const copied = GEOMETRY_ATTRS.filter((name) => attrs[name] !== undefined).map((name) => ` ${name}="${attrs[name]}"`).join('');
  const classes = (attrs.class ?? '').split(/\s+/).filter(Boolean);
  const kept = tag === 'text' ? classes.filter((name) => !MOTION_CLASSES.has(name)) : classes.filter((name) => GROWING_CLASSES.has(name));
  const className = ['fl-mark-pulse', ...kept].join(' ');
  const overlay = `<${tag}${copied} class="${className}" style="${lookOf(tag, attrs)}" opacity="0" pointer-events="none" aria-hidden="true" data-pulse-of="${escapeXml(id)}">${inner}${children}</${tag}>`;
  const appearing = classes.filter((name) => APPEARING_CLASSES.has(name));
  if (!appearing.length) return overlay;
  return `<g class="${appearing.join(' ')} fl-mark-pulse-wrap"${attrs['data-at'] === undefined ? '' : ` data-at="${attrs['data-at']}"`}>${overlay}</g>`;
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = SVG 글자 수
// basis: estimate
/**
 * 표식 id가 붙은 차트 그림에 갱신 효과 겹침을 넣는다(HTML 재생기용, 모두 불투명도 0). 모양 표식은 바로 뒤에, 글 표식은 바로 앞에 놓인다.
 */
export function withPulseOverlays(body) {
  const tokens = tokenize(body);
  let out = '';
  let at = 0;
  tokens.forEach((token) => {
    if (token.type !== 'open' && token.type !== 'self') return;
    const attrs = Object.fromEntries(token.attrs);
    const id = attrs['data-mark'] ?? attrs['data-mark-text'];
    if (id === undefined || !hasPulse(token.tag, attrs)) return;
    const isText = token.tag === 'text';
    const end = token.type === 'open' ? tokens[token.close].end : token.end;
    const inner = isText && token.type === 'open' ? body.slice(token.end, tokens[token.close].start) : '';
    const overlay = pulseOverlay({ tag: token.tag, attrs, inner, id });
    out += body.slice(at, isText ? token.start : end) + overlay;
    at = isText ? token.start : end;
  });
  return out + body.slice(at);
}
