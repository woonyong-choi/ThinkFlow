// 카드(도형의 바깥 면 하나)를 그린다. 상자, 사람, 큐, 표, API, 클래스, 차트, 격자, 순서 보기 참여자가 모두 이 구성을 거친다.
//   Card = Surface(draw/surface.js) + 구분선 + 부분(표 열, 격자 칸) + 종류별 몸통(차트, 큐 칸, 격자 칸 묶음)
//   Head = 장식(아이콘, 배지, 개수: draw/decor.js) + 글(draw/texts.js). 머리 제목, 부제, 열 이름, 형식, 제약, 클래스 멤버, 격자 칸 글이 모두 같은 text다.
// 글과 구분선의 자리는 측정(measure/sizes.js)이 한 번 정한 값이고, 이동 글 상자가 피할 사각형(draw/boxes.js)도 같은 값을 읽는다. 종류별 코드는 어떤 글을 어디에 놓을지만 측정에 넘긴다.
import { drawChartBody } from './chart.js';
import { STACK_STEP } from '../measure/decor.js';
import { queueSlots } from '../measure/queue.js';
import { roundCoord as r, escapeXml } from '../text.js';
import { tokens, values } from '../vendor/theme/tokens.js';
import { drawDecor } from './decor.js';
import { drawGridBody } from './grid.js';
import { LINE_DASH, drawSurface, surfaceClip } from './surface.js';
import { drawTexts } from './texts.js';

// cost: time O(c + t), heap O(out), stack O(1)
// vars: c = 부분 수, t = text 수, out = 만든 SVG 글자 수
// basis: estimate
/**
 * 카드의 면과 몸통. 머리(drawHead)는 후광과 배경 면이 면 위에 얹힌 뒤 글자 층에 그려지므로 따로 부른다.
 * @param it 배치가 끝난 도형 { x, y, w, h, shape, ... }
 * @param stroke 면의 윤곽 속성(class="fl-stroke ..."), animator가 이 class로 후광을 만든다
 * @param paint { decorate, glyphs, index }
 */
export function drawCard(it, stroke, paint) {
  if (it.shape === 'chart') return drawChart(it, stroke, paint);
  const surface = drawStack(it, stroke);
  if (it.shape === 'grid') return surface + drawGridBody(it, paint);
  if (it.shape === 'queue') return surface + drawQueueSlots(it);
  return surface + drawParts(it, paint) + drawDividers(it);
}

// cost: time O(t), heap O(out), stack O(1)
// vars: t = text 수, out = 만든 SVG 글자 수
// basis: estimate
/** 카드 머리와 본문 글: 장식(아이콘, 배지, 개수) 뒤에 도형의 text 전부. 열과 칸의 글은 그 부분이 그린다. */
export function drawHead(it, { glyphs, index }) {
  const decor = it.decor ? drawDecor(it.decor, { x: it.x + it.decor.x, y: it.y + it.decor.y, iconData: it.iconData, prefix: `icon-n-${index}` }, glyphs) : '';
  return decor + drawTexts(it.texts ?? [], it, glyphs);
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 복제 개수(count)가 있으면 뒤 윤곽 두 겹이 오른쪽 아래로 비쳐 보인다. 앞 상자(몸통)는 surfaceOutline이 bodyOf로 정한다. 외부 도형은 점선 경계다.
function drawStack(it, stroke) {
  const dash = it.shape === 'external' ? ` stroke-dasharray="${LINE_DASH}"` : '';
  const steps = Array.from({ length: (it.stack ?? 0) / STACK_STEP }, (_, k) => it.stack / STACK_STEP - k);
  return [...steps, 0].map((k) => drawSurface({ ...it, x: it.x + k * STACK_STEP, y: it.y + k * STACK_STEP }, stroke, dash)).join('');
}

// cost: time O(d), heap O(out), stack O(1)
// vars: d = 구분선 수, out = 만든 SVG 글자 수
// basis: estimate
// 구분선: 머리와 줄, 구획과 구획, 열과 열을 가른다. 선은 카드 폭 전체에 걸친다.
function drawDividers(it) {
  return (it.dividers ?? []).map((y) => `<line x1="${r(it.x)}" x2="${r(it.x + it.w)}" y1="${r(it.y + y)}" y2="${r(it.y + y)}" class="col-line"/>`).join('');
}

// cost: time O(c + t), heap O(out), stack O(1)
// vars: c = 열 수, t = text 수, out = 만든 SVG 글자 수
// basis: estimate
// 표와 API의 열 줄. 열은 밝히기 대상(`fl-part`)이라 밝힘 면과 글을 한 묶음으로 둔다. 밝힘 면은 안쪽이 직선이므로 마지막 줄이 바깥 둥근 틀 밖으로 나가지 않게 면 모양으로 자른다.
function drawParts(it, { decorate, glyphs, index }) {
  if (!it.tableRows) return '';
  const clip = `tc-${index}`;
  const rows = it.tableRows.map((row) => {
    const key = `${it.id}.${row.id}`;
    const edge = values["border-width"].thin;
    const face = `<rect x="${r(it.x + edge)}" y="${r(it.y + row.y)}" width="${r(it.w - edge * 2)}" height="${r(row.h)}" class="part-bg ${decorate('part', 0, key)}"/>`;
    return `<g class="fl-part" data-part="${escapeXml(key)}">${face}${drawTexts(row.texts, it, glyphs)}</g>`;
  });
  return `${surfaceClip(it, clip)}<g clip-path="url(#${clip})">${rows.join('')}</g>`;
}

// cost: time O(1), heap O(out), stack O(1)
// vars: out = 만든 SVG 글자 수
// basis: estimate
// 차트 카드: 카드 면 안에 차트 그림을 그대로 놓는다. 차트의 id는 data-chart로 가려 같은 차트가 여러 곳에 그려져도 움직임이 모두 찾는다.
// 면은 윤곽 요소가, 차트는 그 형제 묶음이 가지므로 켜진 카드의 글자 바탕과 받침 선(묶음의 color가 싣는 바탕 색, chart.css)이 켜진 면을 따르게 묶음에도 같은 켜짐 구간을 건다(HTML 재생기는 `.fl-node.on`이 맡아 class가 없다).
function drawChart(it, stroke, { decorate, glyphs, index }) {
  const ground = decorate('node', index, 'ground');
  return drawSurface(it, stroke) + drawChartBody(it.chart, { ...it, className: ground }, glyphs);
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 큐 칸 하나(측정이 놓은 칸 사각형). 빈 칸과 찬 칸(draw/values.js)이 같은 칸 윤곽을 쓰고 면과 선 색만 다르다. */
export function drawSlot(s, { fill, stroke }) {
  return `<rect x="${r(s.x)}" y="${r(s.y)}" width="${r(s.w)}" height="${r(s.h)}" rx="${values.radius.sm}" fill="${fill}" stroke="${stroke}" stroke-width="${values["border-width"].thin}"/>`;
}

// cost: time O(s), heap O(s), stack O(1)
// vars: s = 칸 수
// basis: estimate
// 큐의 빈 칸: 무채색 면에 외곽선(도형 면 위 대비 3). 찬 칸은 그 위에 값 층(draw/values.js)이 같은 자리에 얹는다.
function drawQueueSlots(it) {
  return queueSlots(it).map((s) => drawSlot(s, { fill: tokens.color.figure['queue-empty'], stroke: tokens.color.outline })).join('');
}
