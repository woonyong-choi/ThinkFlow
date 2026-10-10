// 도형, 카드, 선 라벨 크기를 정한다. 여기서 정한 크기를 배치에 넘기고 그대로 그린다(docs/design/layout.md 도형 크기와 연결점).
import { plainText } from '../text.js';
import { emptyRegions } from '../source/grid-space.js';
import { tableDescription } from '../table.js';
import { tableLayout } from './table.js';
import { values } from '../vendor/theme/tokens.js';
import { INNER_MAX, PAD, headerDecor, headerOf, placeHeader } from './card.js';
import { BADGE_STYLE, DECOR, STACK_STEP, groupDecor, nodeDecor } from './decor.js';
import { sizeClassifier } from './class.js';
import { CONTENT, contentMinWidth, sizeContent } from './content.js';
import { measure, wrap } from './fonts.js';
import { planGridLinks } from './grid-links.js';
import { sizeQueue } from './queue.js';
import { STYLE, stackTexts, textAt, titleTexts } from './texts.js';

const SPACE = values.spacing;
const SIZE = values.spacing.figure;

/** 칸 격자 안쪽 간격. pad는 칸 묶음과 틀 사이, cellPadX, cellPadY는 칸 안 글 둘레, titlePad는 제목 줄 위아래, textMax는 칸 글 한 줄의 가장 긴 너비다. */
export const GRID = Object.freeze({ pad: SPACE["3"], cellPadX: SPACE["2"], cellPadY: SPACE["1-5"], titlePad: SPACE["1-5"], textMax: INNER_MAX });

// cost: time O(k·r·n²), heap O(k·r), stack O(1)
// vars: k = 카드 내용 수, r = 카드 줄 수, n = 줄 글자 수
// basis: estimate
/**
 * 도형 하나의 크기와 글 자리. box는 배치에 넘기는 사각형, margin은 배치 바깥 여백(위, 아래)이다.
 * 도형의 모든 글은 texts(measure/texts.js)로 한 번 놓여 그리는 쪽과 충돌 검사가 같은 값을 읽는다.
 * @param node 그림 모형의 도형. shape: person, box, external, store, queue, decision, state, table, api, classifier, chart, grid, start, final
 * @param contents 시간 흐름에서 이 도형에 보일 내용 목록. 내용은 줄 목록이다
 * @param lineCounts 격자 칸에 이은 선 끝 cells(grid-links.js의 links)
 * @param drawn 차트 카드가 그린 차트({ body, width, height, ... }). 크기는 모든 프레임 가운데 가장 큰 차트의 크기다
 * @returns { w, h, marginTop, marginBottom, texts?, decor?, description?, content?: { w, h, layouts }, cells?, empties?, unit?, titleH?, chart? }. description은 머리 말고 본문이 있는 표·API·클래스의 화면 읽기용 글이다. 격자의 cells는 { id, kind, x, y, w, h, lines, texts, ... } 칸 목록이고 좌표는 격자 왼쪽 위가 원점이다. empties는 빈 자리를 묶은 구간 { row0, row1, col0, col1, x, y, w, h } 목록이고(행×열이 아니라 칸 수에 비례), unit은 단위 칸 하나의 { w, h, gutter, x, y }다
 */
export function sizeNode(node, contents = [], lineCounts = { out: 0, in: 0 }, drawn = undefined) {
  if (node.shape === 'classifier') return sizeClassifier(node);
  if (node.shape === 'chart') return { w: drawn.width, h: drawn.height, marginTop: 0, marginBottom: 0, chart: drawn };
  if (node.shape === 'table' || node.shape === 'api') return sizeTable(node, contents);
  if (node.shape === 'grid') return sizeGrid(node, lineCounts.cells);
  if (node.shape === 'circle') return sizeCircle(node);
  if (node.shape === 'queue') return sizeQueue(node);
  if (node.shape === 'start' || node.shape === 'final') return { w: SIZE.node['state-dot'], h: SIZE.node['state-dot'], marginTop: 0, marginBottom: 0 };
  if (isHeaded(node)) return sizeHeaded(node, contents);
  const labelLines = wrap(node.label, INNER_MAX, STYLE.label);
  const subLines = node.sub ? wrap(node.sub, INNER_MAX, STYLE.sub) : [];
  const textW = Math.max(...labelLines.map((l) => measure(l, STYLE.label.size, STYLE.label.face)), ...subLines.map((l) => measure(l, STYLE.sub.size)));
  const decor = nodeDecor(node);
  const padX = node.tile ? SIZE.node['tile-pad'] : PAD.x;
  let w = Math.min(SIZE.node['max-width'], Math.max(node.tile ? SIZE.node['tile-width'] : SIZE.node['min-width'], textW + padX * 2, (decor?.w ?? 0) + padX * 2));
  w = Math.max(w, contentMinWidth(contents));
  const textH = labelLines.length * STYLE.label.line + subLines.length * STYLE.sub.line;
  if (node.shape === 'decision') {
    // 마름모 안에 글 사각형이 들어가려면 가로세로가 글의 두 배쯤 필요하다(마름모 내접 사각형 비율).
    const [diamondW, diamondH] = [Math.max(w, (textW + PAD.x) * 2), (textH + PAD.y) * 2];
    return { w: diamondW, h: diamondH, marginTop: 0, marginBottom: 0, texts: titleTexts({ labelLines, subLines }, { x: diamondW / 2, top: (diamondH - textH) / 2 }) };
  }
  const content = contents.length ? sizeContent(contents, w - CONTENT.margin * 2) : undefined;
  const cap = node.shape === 'store' ? SIZE.node['store-cap'] : 0;
  // 윗줄(아이콘, 배지, 개수)은 이름 위에 놓는다. 원통은 뚜껑 곡선 아래에서 시작한다.
  const room = decor ? cap + decor.h + (node.tile ? SIZE.icon['tile-gap'] : DECOR.rowGap) : 0;
  const head = decor ? { ...decor, x: (w - decor.w) / 2, y: PAD.y + cap } : undefined;
  const h = Math.max(SIZE.node['min-height'], PAD.y * 2 + room + textH + (content ? content.h + CONTENT.margin : 0));
  // 이름은 윗줄이나 내용이 있으면 위 안쪽 여백 아래에서 시작하고 아니면 세로 가운데다.
  const top = decor ? PAD.y + room : content ? PAD.y : (h - textH) / 2;
  // 개수 요약 상자는 뒤 윤곽 두 겹이 오른쪽 아래로 비쳐 보이도록 그만큼 크고, 이름과 내용은 앞 상자(몸통) 안에 놓인다.
  const stack = node.count === undefined ? 0 : STACK_STEP * 2;
  return { w: w + stack, h: h + stack, stack, marginTop: cap, marginBottom: cap, content, decor: head, texts: titleTexts({ labelLines, subLines }, { x: w / 2, top }) };
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 아이콘이나 배지가 있는 상자, 외부, 사람(타일, 개수 상자 제외)은 머리를 한 줄로 놓는다: 아이콘, 제목, 배지가 나란하고 아이콘 가운데가 제목 첫 줄 가운데다. 원통, 갈림길, 원은 모양이 뜻이라 따로 둔다.
function isHeaded(node) {
  return (node.shape === 'box' || node.shape === 'external' || node.shape === 'person') && !node.tile && node.count === undefined && Boolean(nodeDecor(node));
}

// cost: time O(n²), heap O(n), stack O(1)
// vars: n = 이름 글자 수
// basis: estimate
/**
 * 머리 한 줄이 있는 카드의 크기. 아이콘과 배지가 쓰고 남은 폭이 제목 열이고, 제목 줄과 부제 줄은 이 열 가운데에 놓인다. 머리 묶음은 카드 가운데에 놓고 내용은 그 아래다.
 * 카드가 비어 있어도 머리 자리는 움직이지 않는다.
 */
function sizeHeaded(node, contents) {
  const titleH = STYLE.label.line;
  const room = INNER_MAX - headerDecor(node, { titleW: 0, titleH }).w;
  const labelLines = wrap(node.label, room, STYLE.label);
  const subLines = node.sub ? wrap(node.sub, room, STYLE.sub) : [];
  const column = Math.max(...labelLines.map((l) => measure(l, STYLE.label.size, STYLE.label.face)), ...subLines.map((l) => measure(l, STYLE.sub.size)));
  const decor = headerDecor(node, { titleW: column, titleH });
  const w = Math.max(contentMinWidth(contents), Math.min(SIZE.node['max-width'], Math.max(SIZE.node['min-width'], decor.w + PAD.x * 2)));
  const first = (decor.h - titleH) / 2;
  const headH = Math.max(decor.h, first + labelLines.length * STYLE.label.line + subLines.length * STYLE.sub.line);
  const content = contents.length ? sizeContent(contents, w - CONTENT.margin * 2) : undefined;
  const h = Math.max(SIZE.node['min-height'], PAD.y * 2 + headH + (content ? content.h + CONTENT.margin : 0));
  const x = (w - decor.w) / 2;
  const title = decor.items.find((item) => item.kind === 'title');
  return { w, h, marginTop: 0, marginBottom: 0, content, decor: { ...decor, x, y: PAD.y }, texts: titleTexts({ labelLines, subLines }, { x: x + title.x + column / 2, top: PAD.y + first }) };
}

// cost: time O(n²), heap O(n), stack O(1)
// vars: n = 이름 글자 수
// basis: estimate
// 원: 이름 한 줄을 담는 지름. 이름이 길면 줄을 나누지 않고 지름이 커진다(합류 연산 기호처럼 짧은 글을 쓴다).
function sizeCircle(node) {
  const textW = measure(node.label, STYLE.label.size, STYLE.label.face);
  const d = Math.max(SIZE.node.circle, textW + PAD.x, STYLE.label.line + PAD.y);
  return { w: d, h: d, marginTop: 0, marginBottom: 0, texts: titleTexts({ labelLines: [node.label] }, { x: d / 2, top: (d - STYLE.label.line) / 2 }) };
}

// cost: time O(c + r·n²), heap O(r·n), stack O(1)
// vars: c = 열 수, r = 카드 줄 수, n = 글자 수
// basis: estimate
// 테이블과 API: 머리 띠, 열 줄, 내용이 모두 배치 사각형 안이다. 카드 폭은 내용이 있으면 내용 폭 이상이고 열의 글은 그 폭에서 놓인다.
function sizeTable(node, contents) {
  const layout = tableLayout(node, { minWidth: contentMinWidth(contents) });
  const { w } = layout;
  const content = contents.length ? sizeContent(contents, w - CONTENT.margin * 2) : undefined;
  const h = layout.height + (content ? content.h + CONTENT.margin * 2 : 0);
  const description = tableDescription({ ...node, label: plainText(node.label) });
  return { w, h, marginTop: 0, marginBottom: 0, content, decor: layout.header.decor, texts: layout.header.texts, dividers: layout.dividers, tableRows: layout.rows, description };
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 이름 글자 수
// basis: estimate
/**
 * 순서 보기 참여자의 크기. 표, API, 클래스는 칸과 멤버를 그리지 않고 같은 카드 머리(measure/card.js: 위 표시, 아이콘과 제목, 아래 표시)만 보이고 칸과 멤버는 같은 카드를 담은 그래프 보기가 보인다. 나머지 도형은 내용 없이 평소 크기다.
 * «interface» 표시가 클래스와 인터페이스를 가르는 뜻이라 머리만 보이는 참여자에서도 빠지지 않는다.
 */
export function sizeParticipant(node) {
  if (!SEQUENCE_HEADERS.includes(node.shape)) return sizeNode(node, []);
  const header = headerOf(node);
  const w = Math.max(SIZE.node['min-width'], header.w + PAD.x * 2);
  const { decor, texts } = placeHeader(header, w);
  return { w, h: header.h, marginTop: 0, marginBottom: 0, decor, texts };
}
const SEQUENCE_HEADERS = ['table', 'api', 'classifier'];

// cost: time O(c·n² + c log c + k·c), heap O(c + k), stack O(1)
// vars: c = 칸 수, n = 칸 글자 수, k = 칸에 이은 선 끝 수
// basis: estimate
// 칸 격자: 제목 줄과 칸 묶음이 모두 배치 사각형 안이다. 칸 단위(가로, 세로)는 모든 칸이 글을 넣을 수 있는 가장 작은 크기이고, 칸은 차지한 단위 수만큼 커진다.
// 칸에 이은 선이 안쪽 칸으로 돌아 나갈 통로가 있으면 행 사이가 벌어진다(grid-links.js).
function sizeGrid(node, links = []) {
  const { titleLines, titleW, unitW, lined } = gridLines(node);
  const titleH = titleLines.length * STYLE.label.line + GRID.titlePad * 2;
  const unitH = lined.reduce((tallest, c) => Math.max(tallest, Math.ceil((c.lines.length * STYLE.item.line + GRID.cellPadY * 2) / c.rows)), SIZE.grid.cell);
  const plan = planGridLinks({ rows: node.rows, cols: node.cols, cells: node.cells, links }, { pad: GRID.pad, unitW, unitH, titleH, titleHalf: titleW / 2 });
  const box = ({ row, col, rows, cols }) => ({ x: GRID.pad + col * unitW, y: plan.rowTop(row), w: cols * unitW, h: rows * unitH + (rows - 1) * plan.gutter });
  const cells = lined.map(({ text, label, ...c }) => {
    const placed = { ...c, ...box(c) };
    const role = c.kind === 'gap' ? 'item gap' : 'item';
    return { ...placed, texts: stackTexts(c.lines.map((line) => ({ role, text: line, style: STYLE.item })), { x: placed.x + placed.w / 2, top: placed.y, height: placed.h }) };
  });
  const empties = emptyRegions(node).map((r) => ({ ...r, ...box({ row: r.row0, col: r.col0, rows: r.row1 - r.row0, cols: r.col1 - r.col0 }) }));
  const unit = { w: unitW, h: unitH, gutter: plan.gutter, x: GRID.pad, y: plan.rowTop(0) };
  return { w: plan.w, h: plan.h, marginTop: 0, marginBottom: 0, texts: titleTexts({ labelLines: titleLines }, { x: plan.w / 2, top: 0, height: titleH }), cells, empties, unit, titleH, cellEnds: plan.ends, cellRoutes: plan.inner };
}

// 같은 격자의 줄 나눔을 크기 계산과 예산 세기가 다시 하지 않도록 담아 둔다. 칸 목록이 키다.
const gridLinesMemo = new WeakMap();

// cost: time O(c·n²), heap O(c·l), stack O(1)
// vars: c = 칸 수, n = 칸 글자 수, l = 칸 글 줄 수
// basis: estimate
/**
 * 칸 격자의 제목과 칸 글 줄 나눔. 칸 단위 너비는 모든 칸이 글을 넣을 수 있는 가장 작은 너비다. 크기를 정하는 쪽과 예산이 쓰는 요소 수가 같은 줄 수를 본다.
 * @returns { titleLines, titleW, unitW, lined }. lined는 칸마다 `lines`를 더한 목록이다
 */
export function gridLines(node) {
  if (gridLinesMemo.has(node.cells)) return gridLinesMemo.get(node.cells);
  const titleLines = wrap(node.label, GRID.textMax, STYLE.label);
  const titleW = Math.max(...titleLines.map((l) => measure(l, STYLE.label.size, STYLE.label.face)));
  const shown = node.cells.map((c) => ({ ...c, text: c.kind === 'gap' ? `${c.label} ×${c.count}` : c.label }));
  const fieldStrip = node.rows === 1 && shown.every((cell) => cell.cols > 1) && shown.reduce((sum, cell) => sum + cell.cols, 0) === node.cols;
  const unitW = gridUnitWidth(shown, { cols: node.cols, titleRoom: titleW + PAD.x * 2 - GRID.pad * 2, fieldStrip });
  const lined = shown.map((c) => ({ ...c, lines: wrap(c.text, c.cols * unitW - GRID.cellPadX * 2, STYLE.item) }));
  const result = { titleLines, titleW, unitW, lined };
  gridLinesMemo.set(node.cells, result);
  return result;
}

// cost: time O(c), heap O(c), stack O(1)
// vars: c = 칸 수
// basis: estimate
// 최소 칸 폭과 제목을 지키며 선호 폭에서 글을 줄 나눈다. 병합 필드만 있는 한 줄은 보이는 필드 기준으로 최소 폭을 정한다.
function gridUnitWidth(cells, { cols, titleRoom, fieldStrip }) {
  const need = cells.map((c) => (Math.min(measure(c.text, STYLE.item.size, STYLE.item.face), GRID.textMax) + GRID.cellPadX * 2) / c.cols);
  const minimum = fieldStrip ? SIZE.grid.cell / cells.reduce((smallest, cell) => Math.min(smallest, cell.cols), Infinity) : SIZE.grid.cell;
  const natural = need.reduce((widest, width) => Math.max(widest, width), Math.max(minimum, titleRoom / cols));
  const preferred = Math.max(minimum, titleRoom / cols, (SIZE.node['max-width'] - GRID.pad * 2) / cols);
  const width = Math.min(natural, preferred);
  return fieldStrip ? width : Math.ceil(width);
}

// cost: time O(n), heap O(1), stack O(1)
// vars: n = 글자 수
// basis: estimate
/**
 * 선 라벨 알약 크기. 선 번호(no)가 있으면 왼쪽에 번호 원이 붙고, 라벨이 없으면 번호 원만 있다.
 * 번호 원은 알약 높이에서 위아래 안쪽 간격을 뺀 지름이고, 두 자리 이상 번호는 숫자 폭만큼 넓어진다.
 */
export function sizePill(label, no) {
  const h = SIZE.pill.height;
  const textW = label === undefined ? 0 : measure(label, STYLE.pill.size, STYLE.pill.face);
  if (no === undefined) return { w: textW + SPACE["3-5"], h };
  const numW = numberBadgeWidth(no);
  return { w: label === undefined ? numW + SPACE["0-5"] * 2 : SPACE["0-5"] + numW + SPACE["1"] + textW + SPACE["3-5"] / 2, h, numW, textW };
}

/** 선 번호 원 너비. 한 자리는 지름과 같은 원이고 두 자리 이상은 숫자 폭에 좌우 간격을 더한다. */
function numberBadgeWidth(no) {
  return Math.max(SIZE.pill.height - SPACE["0-5"] * 2, measure(String(no), BADGE_STYLE.size, BADGE_STYLE.face) + SPACE["2"]);
}

/**
 * 번호만 있는 알약(라벨 없음)을 배치에 자리를 요구하지 않고 선 위에 얹는 선인가. 격자 칸에 이은 선은 끝 구간이 격자 안이라 얹을 자리를 고를 수 없어 배치가 자리를 준다.
 * quiet 선은 선 옆에 두는 자리(besideLabel)를 쓴다.
 */
export const isOnLinePill = (edge) => edge.no !== undefined && edge.label === undefined && !edge.quiet && !edge.fromCell && !edge.toCell;

/** 라벨이나 번호가 있어 알약을 그리는 선인가 */
export const hasPill = (edge) => edge.label !== undefined || edge.no !== undefined;

// cost: time O(g·n), heap O(1), stack O(1)
// vars: g = 그룹 제목 글자 수, n = 1
// basis: estimate
/** 그룹 제목 줄 너비. 그룹이 제목보다 좁아지지 않게 배치에 넘긴다. */
export function groupTitleWidth(group) {
  const head = groupHead(group);
  return head.lead + head.w + PAD.x * 2;
}

// cost: time O(n), heap O(1), stack O(1)
// vars: n = 그룹 제목 글자 수
// basis: estimate
/**
 * 그룹 제목 줄의 한 덩어리: 제목 글, 배지, 개수 알약. 덩어리 왼쪽 끝이 제목 글 기본 자리(titleDx)이고 선이 가리면 덩어리째 비킨다.
 * 아이콘이 있으면 왼쪽 모서리에 정사각 탭(너비 lead)이 붙고 덩어리는 그 오른쪽에서 시작한다. 탭은 비키지 않는다.
 * @returns { w, textDx, decor, lead }. textDx는 덩어리 왼쪽에서 제목 글까지 거리, decor는 장식 자리(없으면 undefined), lead는 탭 너비(없으면 0)다
 */
export function groupHead(group) {
  const titleW = measure(group.label, STYLE.group.size, STYLE.group.face);
  const decor = groupDecor(group, titleW);
  return { w: decor?.w ?? titleW, textDx: decor?.items.find((i) => i.kind === 'title').x ?? 0, decor, lead: group.iconData ? SIZE.group.title : 0 };
}

// cost: time O(n), heap O(1), stack O(1)
// vars: n = 그룹 제목 글자 수
// basis: estimate
/**
 * 배치가 정한 제목 거리(titleDx)에서 그룹 제목 줄의 글과 장식을 놓는다. 그룹 왼쪽 위가 원점이다. 그리는 쪽과 이동 글 상자가 피할 사각형이 같은 값을 읽는다.
 * @returns { text, decor? }. text는 제목 글(카드 안 글과 같은 text), decor는 배지와 개수 알약의 자리다
 */
export function placeGroupHead(group) {
  const head = groupHead(group);
  const text = textAt('frame', group.label, STYLE.group, { x: group.titleDx + head.textDx, center: SIZE.group.title / 2 });
  return { text, decor: head.decor && { ...head.decor, x: group.titleDx, y: (SIZE.group.title - head.decor.h) / 2 } };
}
