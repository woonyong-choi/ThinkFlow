// 구조, 상태, 데이터 관계, 순서 그림의 장면을 SVG 조각으로 조립한다. 크기와 자리는 배치와 측정이 정한 그대로 쓰고, 부품은 역할마다 한 곳에서 가져온다.
//   도형 = 윤곽(draw/shape.js: 카드면 draw/card.js와 고유 윤곽) + 머리와 글(draw/card.js drawHead) + 내용(draw/content.js)
//   선 = 연결선과 선 라벨(draw/connector.js), 그룹 = 경계와 제목(여기), 메모와 보기 이름(여기)
import { placeGroupHead } from '../measure/sizes.js';
import { STYLE, textAt } from '../measure/texts.js';
import { escapeXml, plainText, roundCoord as r } from '../text.js';
import { drawHead } from './card.js';
import { drawEdge, drawEdgeLabel } from './connector.js';
import { contentBox, createTones, drawContent } from './content.js';
import { drawDecor, drawGroupTab } from './decor.js';
import { lookClass, lookOf } from './look.js';
import { sceneTag } from './scene-tag.js';
import { drawSequenceFragments } from './sequence-fragments.js';
import { drawSequenceLife } from './sequence-life.js';
import { drawShape } from './shape.js';
import { CORNER, LINE_DASH, rectOpen } from './surface.js';
import { drawText, drawTexts } from './texts.js';
import { drawPlot, drawTime } from './time.js';

// cost: time O(s·k·r·n + e·p), heap O(out), stack O(1)
// vars: s = 도형 수, k = 카드 내용 수, r = 카드 줄 수, n = 글자 수, e = 선 수, p = 경로 점 수, out = 만든 SVG 글자 수
// basis: estimate
/**
 * 장면을 그린다. `scene.flashes`가 있으면(draw/values.js의 drawFlashes) 값이 바뀔 때 켜지는 배경 면을 도형 면과 카드 층 안, 글자 아래에 놓는다. `scene.borders`가 있으면((도형 번호, 도형 글) => 겹침 윤곽 글, 움직이는 SVG의 animate/animator.js) 점이 닿을 때 깜빡이는 테두리 후광을 도형 윤곽 바로 위에 놓는다. body의 순서는 그룹, 생명선, 도형, 선, 메모다. 선 라벨 알약(pills)은 따로 돌려준다. 점과 글 상자가 알약 위로 지나면 알약 글자의 대비가 깨지므로, 호출하는 쪽이 점 층 뒤에 둔다(docs/design/playback.md 점 층).
 * @param decorate (kind, index, extra) => class. 움직이는 SVG가 박자별 class를 넣는다. kind: node, group(경계 강조 `light`), edge, pill, pilltext, quiet, card, layer, part
 * @param glyphs 쓴 글자를 모으는 그릇(createGlyphSet)
 * @returns { body, pills }. pills는 알약이 있는 선마다 `l-번호` 묶음을 담은 `<g class="fl-pills">`이고 알약이 없으면 빈 글이다
 */
export function drawScene(scene, decorate, glyphs) {
  const paint = { toneOf: createTones(scene.tagOrder), decorate, glyphs, scene, flashes: scene.flashes ?? { shape: new Map(), card: new Map() }, borders: scene.borders };
  const parts = [];
  scene.groups.forEach((g, j) => parts.push(drawGroup(g, j, paint)));
  for (const line of scene.lifelines ?? []) parts.push(`<line x1="${r(line.x)}" x2="${r(line.x)}" y1="${r(line.y1)}" y2="${r(line.y2)}" class="lifeline${sceneTag(line, scene.shownSi).off}"${sceneTag(line, scene.shownSi).attr}/>`);
  parts.push(drawSequenceFragments(scene, glyphs));
  if (scene.activations?.length || scene.destructions?.length) parts.push(drawSequenceLife(scene));
  scene.items.forEach((it, i) => parts.push(drawItem(it, i, paint)));
  scene.edges.forEach((e, j) => parts.push(drawEdge(e, j, paint)));
  for (const note of scene.notes ?? []) parts.push(drawNote(note, glyphs, scene.shownSi));
  for (const plot of scene.plots ?? []) parts.push(drawPlot(plot, glyphs));
  for (const time of scene.times ?? []) parts.push(drawTime(time, paint));
  for (const panel of scene.panels ?? []) if (panel.label) parts.push(drawPanelLabel(panel, glyphs));
  const pills = scene.edges.flatMap((e, j) => drawEdgeLabel(e, j, paint) ?? []);
  return { body: parts.join('\n'), pills: pills.length ? `<g class="fl-pills">${pills.join('')}</g>` : '' };
}

// 그리는 데 함께 쓰는 것: toneOf(카드 태그 색), decorate(움직이는 SVG의 class), glyphs(쓴 글자 모음), scene(후광이 바깥 바탕을 찾는 데 쓴다)
function drawGroup(g, j, { decorate, glyphs }) {
  const head = placeGroupHead(g);
  const decor = head.decor ? drawDecor(head.decor, { x: g.x + head.decor.x, y: g.y + head.decor.y, iconData: g.iconData }, glyphs) : '';
  // 그룹은 면이 없다(투명). 경계와 제목만 있고, 중첩 깊이로 면을 바꾸지 않는다. 고른 색은 제목과 아이콘, 표현에 따라 옅은 면이나 경계에만 쓴다(look.js).
  const dashed = g.border === 'dashed';
  return (
    `<g id="g-${j}" class="fl-group${g.iconData ? ' tabbed' : ''}${lookClass(lookOf(g))}" data-id="${escapeXml(g.id)}"><rect x="${r(g.x)}" y="${r(g.y)}" width="${r(g.w)}" height="${r(g.h)}" rx="${CORNER.outer}" class="frame-box fl-stroke${dashed ? ' dashed' : ''} ${decorate('group', j)}"${dashed ? ` stroke-dasharray="${LINE_DASH}"` : ''}/>` +
    `${g.iconData ? drawGroupTab(g, j) : ''}${drawText(head.text, g, glyphs)}${decor}</g>`
  );
}

// cost: time O(k·r·n), heap O(out), stack O(1)
// vars: k = 카드 내용 수, r = 카드 줄 수, n = 글자 수, out = 만든 SVG 글자 수
// basis: estimate
// 도형 하나: 윤곽, 머리와 글, 내용. 원통의 뚜껑은 배치 사각형 바깥 여백에 그린다. 글은 카드가 비어 있어도 같은 자리에 있다. 내용 자리는 가장 큰 내용에 맞춰 늘 예약된다.
function drawItem(it, i, paint) {
  const { decorate, scene } = paint;
  const look = lookOf(it);
  const stroke = `class="fl-stroke${it.shape === 'external' ? ' ext' : ''} ${decorate('node', i)}"`;
  const description = describeNode(it);
  const open = `<g id="n-${i}" class="fl-node fl-shape-${escapeXml(it.shape)}${lookClass(look)}" tabindex="0" role="img" aria-label="${escapeXml(description)}" data-id="${escapeXml(it.id)}">`;
  const shape = drawShape(it, stroke, { ...paint, index: i });
  const content = it.content ? drawContent(it.content, { box: contentBox(it), i, shown: scene.shownCards?.[it.id] }, paint) : '';
  return `${open}${shape}${paint.flashes.shape.get(i) ?? ''}${paint.borders?.(i, shape) ?? ''}${drawHead(it, { ...paint, index: i })}${content}</g>`;
}

// 화면 읽기용 글. 그려진 글(백틱 표시를 뺀 제목)이고, 표·API·클래스는 본문까지 측정이 만든 글이다(머리만 그리는 참여자에는 없다).
function describeNode(it) {
  return it.description ?? plainText(it.label);
}

// 보기 이름. 판 위 제목 줄에 그룹 제목과 같은 글로 쓴다.
function drawPanelLabel(panel, glyphs) {
  const text = textAt('frame', panel.label, STYLE.group, { x: panel.labelAt.x, center: panel.labelAt.y });
  return drawText(text, { x: 0, y: 0 }, glyphs, { attrs: ` data-view="${escapeXml(panel.view)}"` });
}

// cost: time O(l), heap O(out), stack O(1)
// vars: l = 메모 줄 수, out = 만든 SVG 글자 수
// basis: estimate
function drawNote(note, glyphs, shownSi) {
  const tag = sceneTag(note, shownSi);
  return `<g class="fl-note${tag.off}"${tag.attr}>${rectOpen(note, CORNER.inner)} class="note-box"/>${drawTexts(note.texts, note, glyphs)}</g>`;
}
