// 표와 API의 열을 한 번 배치해 그리기, 연결점, 충돌 검사에 넘긴다. 열 줄의 글은 카드가 쓰는 text(measure/texts.js)다.
import { columnKeyLabel, columnRules } from '../table.js';
import { values } from '../vendor/theme/tokens.js';
import { INNER_MAX, PAD, headerOf, placeHeader } from './card.js';
import { STYLE, textAt, textWidth } from './texts.js';

const SPACE = values.spacing;
/** 열 이름(키 표시 포함)과 같은 줄 오른쪽 끝 형식 사이의 가장 작은 간격 */
export const TYPE_GAP = SPACE["4"];

// cost: time O(c·r), heap O(c·r), stack O(1)
// vars: c = 열 수, r = 열의 제약 줄 수
// basis: estimate
// 열 줄 자리. top은 첫 열 줄의 윗변이다. 줄 높이는 형식 열 높이에 제약 줄 수를 더한 값이다.
function placeRows(table, top) {
  const rowH = values.spacing.figure.node["table-row"];
  let y = top;
  return table.columns.map((column) => {
    const rules = columnRules(column, table).map((text, i) => ({ text, center: y + rowH + STYLE.rule.line * (i + 0.5) }));
    const row = { id: column.name, y, center: y + rowH / 2, h: rowH + rules.length * STYLE.rule.line, rules };
    y += row.h;
    return row;
  });
}

// cost: time O(c·n), heap O(c·n), stack O(1)
// vars: c = 열 수, n = 열 표시 글자 수
// basis: estimate
/**
 * 열 줄: 이름(키 표시가 뒤에 붙는다)과 오른쪽 끝의 형식, 그 아래 제약 줄.
 * @param w 카드 폭. 형식 text가 오른쪽 안쪽 여백에 붙는다
 */
function columnTexts(column, row, w, table) {
  const key = columnKeyLabel(column, table);
  return [
    textAt('cell', column.name, STYLE.cell, { x: PAD.x, center: row.center }, key ? { key: { text: key, style: STYLE.key } } : {}),
    textAt('cell type', column.type, STYLE.type, { x: w - PAD.x, center: row.center, anchor: 'end' }),
    ...row.rules.map(({ text, center }) => textAt('cell rule', text, STYLE.rule, { x: PAD.x, center })),
  ];
}

// cost: time O(c·n), heap O(c·n), stack O(1)
// vars: c = 열 수, n = 열 표시 글자 수
// basis: estimate
/**
 * 표와 API 크기와 열 자리. 열마다 { id, y, center, h, texts }이고 y는 카드 위에서 그 줄의 윗변까지, center는 줄의 세로 가운데다(연결점과 충돌 검사가 쓴다).
 * 폭은 본문(가장 긴 이름과 형식 한 줄, 제약 줄)이 먼저 정하고, 머리 제목은 그 본문 폭과 카드 기본 안쪽 폭 가운데 넓은 쪽에서 줄을 나눈다.
 * 머리(아이콘과 제목)와 열의 글은 카드 폭이 정해진 뒤 놓이고(minWidth는 내용 때문에 넓어지는 하한) 구분선은 열 줄 윗변마다 있다.
 * @returns { w, height, rows, header: { decor?, texts }, dividers }
 */
export function tableLayout(node, { minWidth = 0 } = {}) {
  const draftRows = placeRows(node, 0);
  const drafts = node.columns.flatMap((column, k) => columnTexts(column, draftRows[k], 0, node));
  const widest = (texts, role) => Math.max(0, ...texts.filter((t) => t.role === role).map(textWidth));
  const body = Math.max(widest(drafts, 'cell') + widest(drafts, 'cell type') + TYPE_GAP, widest(drafts, 'cell rule'));
  const header = headerOf(node, { room: Math.max(body, INNER_MAX) });
  const w = Math.max(values.spacing.figure.node["min-width"], Math.max(body, header.w) + PAD.x * 2, minWidth);
  const rows = placeRows(node, header.h);
  const parts = rows.map(({ id, y, center, h }, k) => ({ id, y, center, h, texts: columnTexts(node.columns[k], rows[k], w, node) }));
  return { w, height: header.h + rows.reduce((sum, row) => sum + row.h, 0), rows: parts, header: placeHeader(header, w), dividers: rows.map((row) => row.y) };
}
