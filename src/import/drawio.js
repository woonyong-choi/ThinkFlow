// draw.io(diagrams.net) 원본 읽기: 도형과 라벨, 연결선, 컨테이너(swimlane, container=1), 점선, 도형 모양(docs/design/import.md draw.io).
// 좌표와 색, 글꼴은 옮기지 않고 뜻(카드, 그룹, 선)만 옮긴다. Torso가 다시 배치한다.
import { decodeEntities, parseDrawio, styleOf } from './drawio-parse.js';
import { flowDirection, shapeLabel, titleText } from './drawn.js';
import { FAIL, change, skip, textOf } from './model.js';

// 도형 모양 → 카드 종류. 스타일 첫 낱말(ellipse, rhombus)이나 shape= 값으로 고른다. 목록 밖 모양은 상자로 그리고 알린다.
const SHAPES = { ellipse: 'circle', doubleEllipse: 'circle', rhombus: 'decision', cylinder: 'store', cylinder3: 'store', datastore: 'store', umlActor: 'person', actor: 'person', rectangle: 'box', rect: 'box', process: 'box', label: 'box' };

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 글자 수
// basis: estimate
// 셀 글. html=1인 라벨은 태그를 지우고(줄 바꿈 태그는 공백) 문자 참조를 푼다.
function labelOf(cell, style, model) {
  const raw = style.html === '1' ? decodeEntities(cell.value.replace(/<br\s*\/?>/gi, ' ').replace(/<\/(div|p|li)>/gi, ' ').replace(/<[^>]+>/g, '')) : cell.value;
  return textOf(model, raw, cell.line);
}

// 셀이 그룹(컨테이너)인가. 보이지 않는 묶음(style=group)은 그룹이 아니라 안의 셀을 바깥으로 꺼낸다.
const isContainer = (style) => 'swimlane' in style || style.container === '1';
const isInvisibleGroup = (style) => 'group' in style && !isContainer(style);
const isText = (style) => 'text' in style || style.shape === 'text';

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 도형 모양 이름. shape= 값이 먼저이고, 없으면 스타일 첫 낱말이다. mxgraph.aws4.lambda처럼 묶음 이름이 붙은 모양은 맨 뒤 마디다.
function shapeName(cell, style) {
  const first = cell.style?.split(';')[0];
  const name = style.shape ?? (first && !first.includes('=') ? first : undefined);
  return name?.split('.').at(-1);
}

// cost: time O(c·d), heap O(c), stack O(d)
// vars: c = 셀 수, d = 컨테이너 깊이
// basis: estimate
/** draw.io 원본 하나를 모형에 읽는다. 첫 쪽만 옮기고 나머지 쪽은 알린다. */
export function readDrawio(text, model) {
  const pages = parseDrawio(text);
  const [page, ...others] = pages;
  for (const other of others) skip(model, other.line, `the page "${other.name ?? ''}" is not imported. Only the first page is imported; save each page as its own file`);
  if (!page || page.isBroken) {
    model.problems.error(page?.line ?? 0, 'the draw.io page cannot be read. Save the file uncompressed (File > Properties > Compressed off) and import again', { code: FAIL });
    return;
  }
  const cells = new Map(page.cells.map((cell) => [cell.id, { ...cell, styles: styleOf(cell.style) }]));
  const roots = new Set(page.cells.filter((cell) => cell.parent === undefined || !cells.has(cell.parent)).map((cell) => cell.id));
  const placed = readShapes(cells, roots, model);
  readEdges(cells, placed, model);
  model.direction = flowDirection(model.edges.flatMap((edge) => (placed.box(edge.from.key) && placed.box(edge.to.key) ? [{ from: placed.box(edge.from.key), to: placed.box(edge.to.key) }] : [])));
}

// cost: time O(c·d), heap O(c), stack O(d)
// vars: c = 셀 수, d = 컨테이너 깊이
// basis: estimate
// 도형과 그룹. 뿌리 셀과 레이어 셀(뿌리 바로 아래의 도형도 선도 아닌 셀)은 그룹이 아니다. 반환은 셀 id로 절대 사각형을 찾는 box와 카드·그룹 id 모음이다.
function readShapes(cells, roots, model) {
  const isLayer = (id) => roots.has(id) || (roots.has(cells.get(id)?.parent) && cells.get(id)?.vertex !== '1' && cells.get(id)?.edge !== '1');
  // 보이지 않는 묶음을 건너뛴 부모 그룹 key. 레이어면 undefined다.
  // cost: time O(d), heap O(1), stack O(1)
  // vars: d = 컨테이너 깊이
  // basis: estimate
  const groupOf = (id) => {
    let parent = cells.get(id)?.parent;
    while (parent && !isLayer(parent) && isInvisibleGroup(cells.get(parent).styles)) parent = cells.get(parent).parent;
    return parent && !isLayer(parent) ? parent : undefined;
  };
  // 셀의 절대 사각형. draw.io 좌표는 부모 컨테이너 안의 상대 좌표다.
  // cost: time O(d), heap O(1), stack O(d)
  // vars: d = 컨테이너 깊이
  // basis: estimate
  const box = (id) => {
    const cell = cells.get(id);
    if (!cell?.geometry) return undefined;
    const outer = cell.parent && !isLayer(cell.parent) ? box(cell.parent) : undefined;
    return { ...cell.geometry, x: cell.geometry.x + (outer?.x ?? 0), y: cell.geometry.y + (outer?.y ?? 0) };
  };
  const texts = [];
  const nodes = new Set();
  for (const cell of cells.values()) {
    if (cell.vertex !== '1' || isLayer(cell.id) || isInvisibleGroup(cell.styles)) continue;
    const label = labelOf(cell, cell.styles, model);
    const parent = groupOf(cell.id);
    if (isContainer(cell.styles)) {
      model.groups.push({ key: cell.id, name: label, label: label || '그룹', parent, dashed: cell.styles.dashed === '1', line: cell.line });
      if (!label) change(model, cell.line, 'a container without a label is written as "그룹". Write the group name');
    } else if (isText(cell.styles) || cell.styles.edgeLabel) {
      if (!cell.styles.edgeLabel) texts.push({ text: label, box: box(cell.id), parent, line: cell.line });
    } else {
      nodes.add(cell.id);
      model.nodes.push({ key: cell.id, name: label, kind: kindOf(cell, model), label: shapeLabel(label, cell.line, model), parent, line: cell.line });
    }
  }
  readTitle(texts, [...nodes].map(box).filter(Boolean), model);
  return { box, nodes };
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 카드 종류. 점선 테두리 상자는 바깥 시스템(external)이다.
function kindOf(cell, model) {
  const name = shapeName(cell, cell.styles);
  const kind = Object.hasOwn(SHAPES, name ?? '') ? SHAPES[name] : 'box';
  if (name && !Object.hasOwn(SHAPES, name)) change(model, cell.line, `the shape "${name}" is drawn as a box`);
  return kind === 'box' && cell.styles.dashed === '1' ? 'external' : kind;
}

// cost: time O(t), heap O(1), stack O(1)
// vars: t = 자유 글 수
// basis: estimate
// 맨 위의 자유 글은 그림 제목이고, 나머지 자유 글은 Torso에 붙일 자리가 없어 알린다.
function readTitle(texts, boxes, model) {
  const title = titleText(texts.filter((t) => t.box && !t.parent), boxes);
  if (title) model.title = title.text;
  for (const text of texts) if (text !== title && text.text) skip(model, text.line, `the free text "${text.text}" is not imported. Put it in a card or on an edge`);
}

// cost: time O(e + c), heap O(e), stack O(1)
// vars: e = 연결선 수, c = 셀 수
// basis: estimate
// 연결선. 선 라벨은 선 자신의 글과 선에 붙은 라벨 셀(edgeLabel)의 글을 잇는다. 시작 쪽에만 화살촉이 있으면 방향을 뒤집는다.
function readEdges(cells, placed, model) {
  const extra = new Map();
  for (const cell of cells.values()) {
    if (cell.vertex === '1' && cell.styles.edgeLabel && cells.get(cell.parent)?.edge === '1') extra.set(cell.parent, [...(extra.get(cell.parent) ?? []), labelOf(cell, cell.styles, model)]);
  }
  for (const cell of cells.values()) {
    if (cell.edge !== '1') continue;
    if (!placed.nodes.has(cell.source) || !placed.nodes.has(cell.target)) {
      skip(model, cell.line, 'an edge that is not attached to two shapes is not imported. Connect both ends to a shape in draw.io');
      continue;
    }
    const label = [labelOf(cell, cell.styles, model), ...(extra.get(cell.id) ?? [])].filter(Boolean).join(' ');
    const hasEnd = cell.styles.endArrow !== 'none';
    const hasStart = Boolean(cell.styles.startArrow) && cell.styles.startArrow !== 'none';
    const [from, to] = hasStart && !hasEnd ? [cell.target, cell.source] : [cell.source, cell.target];
    model.edges.push({ from: { key: from }, to: { key: to }, label: label || undefined, dashed: cell.styles.dashed === '1', head: hasStart && hasEnd ? 'both' : hasStart || hasEnd ? 'end' : 'none', line: cell.line });
  }
}
