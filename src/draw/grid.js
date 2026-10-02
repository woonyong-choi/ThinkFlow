// 칸 격자 그리기. 틀, 제목, 빈 자리, 칸을 그린다. 칸 자리와 글 줄은 measure/sizes.js의 sizeGrid가 정한 그대로다.
import { STYLE } from '../measure/sizes.js';
import { centerBaseline, escapeXml, renderRich, roundCoord as r } from '../text.js';
import { tokens, values } from '../tokens.js';

const RADIUS = values.radius;

// cost: time O(l), heap O(l), stack O(1)
// vars: l = 글 줄 수
// basis: estimate
// 줄들을 가운데 x에 위에서 아래로 쌓은 자리. 줄 묶음은 높이 height 안에서 세로 가운데에 놓인다.
function stackRows({ lines, cls, style, face }, { cx, top, height }) {
  let lineTop = top + (height - lines.length * style.line) / 2;
  return lines.map((text) => {
    const center = lineTop + style.line / 2;
    lineTop += style.line;
    return { cls, text, style, face, cx, center, baseline: centerBaseline(center, style.size) };
  });
}

// 칸 하나의 글 줄 자리
function cellRows(it, cell) {
  const cls = cell.kind === 'gap' ? 'item gap' : 'item';
  return stackRows({ lines: cell.lines, cls, style: STYLE.item, face: 'regular' }, { cx: it.x + cell.x + cell.w / 2, top: it.y + cell.y, height: cell.h });
}

// 제목 줄 자리
function titleRows(it) {
  return stackRows({ lines: it.labelLines, cls: 'label', style: STYLE.label, face: 'medium' }, { cx: it.x + it.w / 2, top: it.y, height: it.titleH });
}

// cost: time O(c·l), heap O(c·l), stack O(1)
// vars: c = 칸 수, l = 칸 글 줄 수
// basis: estimate
/**
 * 격자의 글 줄 자리: 제목 줄과 모든 칸의 글 줄. 그리는 쪽과 글 상자 자리 계산(draw/boxes.js)이 같은 값을 쓴다.
 * @returns { cls, text, style, face, cx, center, baseline }[]. center는 줄의 세로 가운데다
 */
export function gridRows(it) {
  return [...titleRows(it), ...it.cells.flatMap((cell) => cellRows(it, cell))];
}

function drawText({ cls, text, face, cx, baseline }, glyphs) {
  glyphs.add(text, face);
  return `<text x="${r(cx)}" y="${r(baseline)}" class="${cls}">${renderRich(text)}</text>`;
}

// 칸 사각형 속성. 격자 왼쪽 위가 원점인 칸 자리에 도형 자리를 더한다.
function boxOf(it, { x, y, w, h }) {
  return `x="${r(it.x + x)}" y="${r(it.y + y)}" width="${r(w)}" height="${r(h)}"`;
}

// cost: time O(c·l), heap O(out), stack O(1)
// vars: c = 칸 수, l = 칸 글 줄 수, out = 만든 SVG 글자 수
// basis: estimate
/**
 * 격자 하나. item은 밝히기 대상(`fl-part`)이라 사각형과 글을 한 묶음으로 둔다.
 * @param stroke 틀의 윤곽 속성(밝히면 파랑이 되는 class)
 */
export function drawGrid(it, stroke, { decorate, glyphs }) {
  const frame = `<rect x="${r(it.x)}" y="${r(it.y)}" width="${r(it.w)}" height="${r(it.h)}" rx="${RADIUS.xl}" fill="${tokens.color.node}" ${stroke}/>`;
  const title = titleRows(it).map((row) => drawText(row, glyphs));
  const empties = it.empties.map((slot) => `<rect ${boxOf(it, slot)} class="grid-cell empty"/>`);
  const cells = it.cells.map((cell) => {
    const texts = cellRows(it, cell).map((row) => drawText(row, glyphs)).join('');
    if (cell.kind === 'gap') return `<g><rect ${boxOf(it, cell)} class="grid-cell gap"/>${texts}</g>`;
    const key = `${it.id}.${cell.id}`;
    return `<g class="fl-part" data-part="${escapeXml(key)}"><rect ${boxOf(it, cell)} class="grid-cell ${decorate('cell', 0, key)}"/>${texts}</g>`;
  });
  return frame + title.join('') + empties.join('') + cells.join('');
}
