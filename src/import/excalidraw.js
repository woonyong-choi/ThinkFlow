// Excalidraw 원본 읽기: 사각형·타원·마름모 도형과 그 안의 글, 도형에 묶인 화살표와 화살표 글, 프레임(docs/design/import.md Excalidraw).
// 좌표, 색, 손글씨 획은 옮기지 않고 뜻(카드, 그룹, 선)만 옮긴다. Torso가 다시 배치한다.
import { flowDirection, shapeLabel, titleText } from './drawn.js';
import { FAIL, skip, textOf } from './model.js';

// 도형 종류 → 카드 종류
const SHAPES = { rectangle: 'box', ellipse: 'circle', diamond: 'decision' };
// 옮기지 않는 요소와 그 이유
const IGNORED = { freedraw: 'a freehand stroke', image: 'an image', line: 'a line that is not an arrow', embeddable: 'an embedded page', iframe: 'an embedded page', magicframe: 'a generated frame' };

// cost: time O(n), heap O(1), stack O(1)
// vars: n = 원본 글자 수
// basis: estimate
// 요소의 원본 줄: 그 요소 id가 처음 나오는 줄. 찾지 못하면 1이다.
function lineOfId(text, id) {
  const at = text.indexOf(`"${id}"`);
  return at === -1 ? 1 : text.slice(0, at).split('\n').length;
}

const boxOf = (element) => ({ x: element.x, y: element.y, w: element.width ?? 0, h: element.height ?? 0 });
const isDashed = (element) => element.strokeStyle === 'dashed' || element.strokeStyle === 'dotted';

// cost: time O(n + e), heap O(e), stack O(1)
// vars: n = 원본 글자 수, e = 요소 수
// basis: estimate
/** Excalidraw 원본(.excalidraw JSON) 하나를 모형에 읽는다. */
export function readExcalidraw(text, model) {
  let scene;
  try {
    scene = JSON.parse(text);
  } catch (error) {
    model.problems.error(1, `the Excalidraw file is not JSON: ${error.message}`, { code: FAIL });
    return;
  }
  if (!Array.isArray(scene?.elements)) {
    model.problems.error(1, 'the Excalidraw file has no "elements" list. Export it with File > Save to (.excalidraw)', { code: FAIL });
    return;
  }
  const elements = scene.elements.filter((element) => element && !element.isDeleted).map((element) => ({ ...element, line: lineOfId(text, element.id) }));
  const byId = new Map(elements.map((element) => [element.id, element]));
  const bound = boundTexts(elements, byId, model);
  const frames = readFrames(elements, model);
  const nodes = new Set();
  const free = [];
  for (const element of elements) {
    if (Object.hasOwn(SHAPES, element.type)) {
      nodes.add(element.id);
      const label = bound.get(element.id) ?? '';
      model.nodes.push({ key: element.id, name: label, kind: element.type === 'rectangle' && isDashed(element) ? 'external' : SHAPES[element.type], label: shapeLabel(label, element.line, model), parent: frames.has(element.frameId) ? element.frameId : undefined, line: element.line });
    } else if (element.type === 'text' && !element.containerId) free.push({ text: textOf(model, element.text, element.line), box: boxOf(element), line: element.line });
    else if (Object.hasOwn(IGNORED, element.type)) skip(model, element.line, `${IGNORED[element.type]} is not imported`);
  }
  readTitle(free, elements.filter((e) => nodes.has(e.id)).map(boxOf), model);
  readArrows(elements, { byId, nodes, bound }, model);
  model.direction = flowDirection(model.edges.map((edge) => ({ from: boxOf(byId.get(edge.from.key)), to: boxOf(byId.get(edge.to.key)) })));
}

// cost: time O(e), heap O(e), stack O(1)
// vars: e = 요소 수
// basis: estimate
// 도형과 화살표에 묶인 글(containerId). 담는 요소 id → 한 줄 글이다.
function boundTexts(elements, byId, model) {
  const texts = new Map();
  for (const element of elements) {
    if (element.type !== 'text' || !element.containerId || !byId.has(element.containerId)) continue;
    texts.set(element.containerId, textOf(model, element.originalText ?? element.text, element.line));
  }
  return texts;
}

// cost: time O(e), heap O(f), stack O(1)
// vars: e = 요소 수, f = 프레임 수
// basis: estimate
// 프레임은 그룹이다. 이름 없는 프레임은 Excalidraw가 보여 주는 이름(Frame)을 쓴다.
function readFrames(elements, model) {
  const frames = new Set();
  for (const element of elements.filter((e) => e.type === 'frame')) {
    frames.add(element.id);
    const label = textOf(model, element.name ?? 'Frame', element.line);
    model.groups.push({ key: element.id, name: label, label, dashed: false, line: element.line });
  }
  return frames;
}

// cost: time O(t), heap O(1), stack O(1)
// vars: t = 자유 글 수
// basis: estimate
// 맨 위의 자유 글은 그림 제목이고, 나머지 자유 글은 Torso에 붙일 자리가 없어 알린다.
function readTitle(texts, boxes, model) {
  const title = titleText(texts, boxes);
  if (title) model.title = title.text;
  for (const text of texts) if (text !== title && text.text) skip(model, text.line, `the free text "${text.text}" is not imported. Put it in a shape or on an arrow`);
}

// cost: time O(a), heap O(a), stack O(1)
// vars: a = 화살표 수
// basis: estimate
// 두 끝이 도형에 묶인 화살표만 선이다. 시작 쪽에만 화살촉이 있으면 방향을 뒤집는다.
function readArrows(elements, { nodes, bound }, model) {
  for (const arrow of elements.filter((e) => e.type === 'arrow')) {
    const [start, end] = [arrow.startBinding?.elementId, arrow.endBinding?.elementId];
    if (!nodes.has(start) || !nodes.has(end)) {
      skip(model, arrow.line, 'an arrow that is not bound to two shapes is not imported. Attach both ends to a shape in Excalidraw');
      continue;
    }
    const hasEnd = Boolean(arrow.endArrowhead);
    const hasStart = Boolean(arrow.startArrowhead);
    const [from, to] = hasStart && !hasEnd ? [end, start] : [start, end];
    model.edges.push({ from: { key: from }, to: { key: to }, label: bound.get(arrow.id) || undefined, dashed: isDashed(arrow), head: hasStart && hasEnd ? 'both' : hasStart || hasEnd ? 'end' : 'none', line: arrow.line });
  }
}
