// 화살촉 부품. 모양은 `arrowMarker` 하나이고, 색은 마커 정의를 품은 요소(소유자)의 `color`를 상속한다. 마커는 자기를 쓰는 선이 아니라 정의된 자리에서 색을 받는다(context-stroke에 기대지 않는다).
// 소유자는 둘이다. 연결선은 선 묶음 자신이 소유자라 묶음 안에 정의를 두고(`edgeMarker`, 상태색이 묶음의 color를 따른다), 차트 방향선은 역할(`CHART_ARROW`)이 소유자라 역할마다 정의 하나를 문서에 한 번 둔다(`roleArrowDefs`).
// 어느 쪽이든 먼저 나온 차트가 색을 정하지 않는다. 마커 크기는 `markerUnits=strokeWidth`라 몸통 굵기에 비례해 커진다. 그러면 마커 안 선도 같은 비율로 굵어져 이중으로 굵어지므로, 마커 안 선 굵기를 `VIEW / size`로 정규화해 어떤 몸통 굵기에서도 실제 굵기가 몸통과 같게 한다.
import { tokens, values } from '../vendor/theme/tokens.js';

// 마커 좌표계 한 변
const VIEW = 5;
// 삼각형의 꼭지 x(몸통 끝과 만나는 자리), 팔 끝 x, 팔 끝의 중심선 기준 반높이(마커 좌표)
const TIP_X = 4;
const ARM_X = 1.1;
const ARM_HALF = 2.25;

/** 마커 안 선의 마커 좌표 굵기. 몸통 굵기 w에서 실제 굵기가 w가 되게 하는 값이다. */
const markStroke = (size) => VIEW / size;

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/**
 * 채운 삼각형 화살촉 마커 정의.
 * @param id 마커 id
 * @param size 마커 한 변이 몸통 굵기의 몇 배인지(토큰 `size.arrow.head`)
 */
function arrowMarker(id, size = values.spacing.figure.arrow.head) {
  const c = VIEW / 2;
  const d = `M ${ARM_X} ${c - ARM_HALF} L ${TIP_X} ${c} L ${ARM_X} ${c + ARM_HALF} Z`;
  return `<marker id="${id}" viewBox="0 0 ${VIEW} ${VIEW}" refX="${TIP_X}" refY="${c}" markerWidth="${size}" markerHeight="${size}" orient="auto-start-reverse" overflow="visible"><path class="fl-arrowhead" d="${d}" stroke-width="${markStroke(size)}"/></marker>`;
}

/** 방향선을 가진 차트 종류가 쓰는 색 역할. 종류가 역할을 고르고, 역할의 색은 chart.css의 `.arrow-<역할>`이 한 번 정한다(몸통과 화살촉이 함께 읽는다). */
export const CHART_ARROW = Object.freeze({ dumbbell: 'main', scatter: 'muted' });

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 역할이 소유한 차트 방향선의 속성: 몸통 class(역할의 색을 읽는다)와 끝 표식. 표식 정의는 `roleArrowDefs`가 문서에 한 번 둔다. */
export function roleArrow(role) {
  return { cls: `arrow-${role}`, end: ` marker-end="url(#fl-arrow-${role})"` };
}

// cost: time O(r log r), heap O(r), stack O(1)
// vars: r = 역할 수
// basis: estimate
/** 쓰인 역할마다 하나인 마커 정의. 역할 class의 묶음 안에 있어 화살촉이 그 역할의 색을 상속한다. 역할 이름순이라 선언 순서와 상관없이 같은 글이다. */
export function roleArrowDefs(roles) {
  return [...new Set(roles)].sort().map((role) => `<g class="arrow-${role}">${arrowMarker(`fl-arrow-${role}`)}</g>`).join('');
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 관계선 묶음 안의 화살촉. 각 선의 색을 상속하므로 context-stroke 지원 여부에 의존하지 않는다. */
export function edgeMarker(edge, index) {
  if (edge.head === 'none' && !edge.relation) return { defs: '', attributes: '' };
  const relation = edge.relation;
  const shape = relation === 'inheritance' || relation === 'realization' ? 'triangle' : relation === 'aggregation' ? 'diamond-open' : relation === 'composition' ? 'diamond-filled' : 'arrow';
  if (relation === 'association') return { defs: '', attributes: '' };
  const id = `fl-${shape}-${index}`;
  const defs = shape === 'arrow' ? arrowMarker(id) : relationMarker(id, shape);
  const start = shape.startsWith('diamond') || edge.head === 'both';
  const end = !shape.startsWith('diamond') && edge.head !== 'none';
  return { defs: `<defs>${defs}</defs>`, attributes: `${start ? ` marker-start="url(#${id})"` : ''}${end ? ` marker-end="url(#${id})"` : ''}` };
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 클래스 관계 기호. 빈 삼각형과 빈 마름모는 바탕색을 유지하고 테두리만 선의 색을 따른다.
function relationMarker(id, shape) {
  const size = values.spacing.figure.arrow.head;
  const c = VIEW / 2;
  const triangle = `M ${TIP_X} ${c} L ${ARM_X} ${c - ARM_HALF} L ${ARM_X} ${c + ARM_HALF} Z`;
  const diamond = `M ${TIP_X} ${c} L ${VIEW / 2} ${c - ARM_HALF} L 0 ${c} L ${VIEW / 2} ${c + ARM_HALF} Z`;
  const fill = shape === 'diamond-filled' ? 'currentColor' : tokens.color["prose-pre-background"];
  return `<marker id="${id}" viewBox="0 0 ${VIEW} ${VIEW}" refX="${TIP_X}" refY="${c}" markerWidth="${size}" markerHeight="${size}" orient="auto-start-reverse" overflow="visible"><path d="${shape === 'triangle' ? triangle : diamond}" fill="${fill}" stroke="currentColor" stroke-width="${markStroke(size)}" stroke-linejoin="round"/></marker>`;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/**
 * 몸통 굵기 width의 선 끝에 붙은 화살촉이 실제로 차지하는 크기(px). 꼭지(몸통 끝)에서 뒤로 length, 중심선에서 양옆으로 half, 몸통 끝 너머로 둥근 끝이 cap만큼 나온다.
 */
export function headReach(width, size = values.spacing.figure.arrow.head) {
  const unit = (width * size) / VIEW;
  const cap = markStroke(size) / 2;
  return { length: (TIP_X + cap - (ARM_X - cap)) * unit, half: (ARM_HALF + cap) * unit, cap: cap * unit };
}
