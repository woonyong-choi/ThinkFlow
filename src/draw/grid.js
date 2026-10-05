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

// cost: time O(c·l + e), heap O(out), stack O(1)
// vars: c = 칸 수, l = 칸 글 줄 수, e = 빈 자리 구간 수, out = 만든 SVG 글자 수
// basis: estimate
/**
 * 격자 하나. item은 밝히기 대상(`fl-part`)이라 사각형과 글을 한 묶음으로 둔다.
 * @param stroke 틀의 윤곽 속성(밝히면 파랑이 되는 class)
 * @param paint { decorate, glyphs, index }. index는 장면 도형 번호이고 빈 자리 무늬의 이름(`ge-번호`)을 만든다
 */
export function drawGrid(it, stroke, { decorate, glyphs, index }) {
  const frame = `<rect x="${r(it.x)}" y="${r(it.y)}" width="${r(it.w)}" height="${r(it.h)}" rx="${RADIUS.xl}" fill="${tokens.color.node}" ${stroke}/>`;
  const title = titleRows(it).map((row) => drawText(row, glyphs));
  const empties = drawEmpties(it, index);
  const cells = it.cells.map((cell) => {
    const texts = cellRows(it, cell).map((row) => drawText(row, glyphs)).join('');
    if (cell.kind === 'gap') return `<g><rect ${boxOf(it, cell)} class="grid-cell gap"/>${texts}</g>`;
    const key = `${it.id}.${cell.id}`;
    return `<g class="fl-part" data-part="${escapeXml(key)}"><rect ${boxOf(it, cell)} class="grid-cell ${decorate('cell', 0, key)}"/>${texts}</g>`;
  });
  return frame + title.join('') + empties + cells.join('') + rings(it, decorate);
}

// cost: time O(e), heap O(e), stack O(1)
// vars: e = 빈 자리 구간 수
// basis: estimate
/**
 * 빈 자리. 단위 칸 하나의 점선 윤곽을 담은 반복 무늬(pattern)와, 빈 자리 구간을 모두 이은 경로 하나를 그린다. 경로 하나가 무늬로 칠해지므로 요소 수와 경로 명령 수는 빈 칸 수가 아니라 구간 수에 비례한다.
 * 무늬 칸은 단위 칸에 행 사이 통로 높이를 더한 크기이고, 칸 경계선(윗변과 왼쪽 변, 통로가 있으면 아랫변)을 굵기 절반만큼 비켜 그려 선이 무늬 칸 안에 온전히 들어간다.
 * 구간 경로는 굵기 절반만큼 사방으로 넓혀 구간 바깥 경계선도 온전히 보인다. 옛 그림처럼 칸마다 사각형을 그린 것과 같은 선 굵기와 자리다.
 */
export function drawEmpties(it, index) {
  if (!it.empties.length) return '';
  const { unit } = it;
  const stroke = values.border.thin;
  const half = stroke / 2;
  const id = `ge-${index}`;
  const lines = [`M0 ${r(half)}h${r(unit.w)}`, `M${r(half)} 0v${r(unit.h + half)}`, ...(unit.gutter ? [`M0 ${r(unit.h + half)}h${r(unit.w)}`] : [])].join('');
  const pattern = `<pattern id="${id}" patternUnits="userSpaceOnUse" x="${r(it.x + unit.x - half)}" y="${r(it.y + unit.y - half)}" width="${r(unit.w)}" height="${r(unit.h + unit.gutter)}"><path d="${lines}" class="grid-cell empty"/></pattern>`;
  const path = it.empties.map((e) => `M${r(it.x + e.x - half)} ${r(it.y + e.y - half)}h${r(e.w + stroke)}v${r(e.h + stroke)}h${r(-e.w - stroke)}z`).join('');
  return `${pattern}<path d="${path}" fill="url(#${id})" class="grid-empty"/>`;
}

// cost: time O(c), heap O(c), stack O(1)
// vars: c = 칸 수
// basis: estimate
// 밝힌 칸의 테두리 고리. 모든 칸을 그린 뒤 맨 위에 그려 뒤에 그린 이웃 칸의 선이 덮지 못하고, 굵기 절반만큼 칸 안쪽으로 들여 그려 틀 바깥으로 잘리지 않는다. 밝히기 전에는 보이지 않는다.
function rings(it, decorate) {
  const inset = values.border.edge / 2;
  return it.cells
    .filter((cell) => cell.kind !== 'gap')
    .map((cell) => {
      const key = `${it.id}.${cell.id}`;
      const ring = { x: cell.x + inset, y: cell.y + inset, w: cell.w - inset * 2, h: cell.h - inset * 2 };
      return `<g class="fl-part" data-part="${escapeXml(key)}"><rect ${boxOf(it, ring)} class="grid-ring ${decorate('ring', 0, key)}"/></g>`;
    })
    .join('');
}
