// 칸 격자의 몸통을 그린다: 칸 묶음 바탕, 빈 자리, 칸. 면과 제목은 카드(draw/card.js)가 그리고, 칸 자리와 칸 글은 measure/sizes.js의 sizeGrid가 정한 그대로다.
import { roundCoord as r, escapeXml } from '../text.js';
import { values } from '../vendor/theme/tokens.js';
import { CORNER, rectOpen } from './surface.js';
import { drawTexts } from './texts.js';

// 칸 사각형 속성. 격자 왼쪽 위가 원점인 칸 자리에 도형 자리를 더한다.
function boxOf(it, { x, y, w, h }) {
  return `x="${r(it.x + x)}" y="${r(it.y + y)}" width="${r(w)}" height="${r(h)}"`;
}

// cost: time O(c + e), heap O(1), stack O(1)
// vars: c = 칸 수, e = 빈 자리 구간 수
// basis: estimate
// 칸 묶음 전체의 바깥 사각형(격자 왼쪽 위가 원점). 칸 묶음의 바깥 모서리만 둥글고, 칸 사이 교차는 모두 직선이다.
function blockOf(it) {
  const boxes = [...it.cells, ...it.empties];
  const [left, top] = [Math.min(...boxes.map((b) => b.x)), Math.min(...boxes.map((b) => b.y))];
  return { left, top, right: Math.max(...boxes.map((b) => b.x + b.w)), bottom: Math.max(...boxes.map((b) => b.y + b.h)) };
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 행 사이 통로(gutter)가 있는 격자의 칸 묶음 바탕. 통로가 비어 보여 행이 따로 떨어진 카드처럼 읽히지 않도록, 칸 묶음 전체를 바깥 모서리만 둥근 한 판으로 깔고 통로는 그 판의 면으로 보인다. 선은 이 판 위로 지나간다.
function drawTray(it, block) {
  const box = { x: it.x + block.left, y: it.y + block.top, w: block.right - block.left, h: block.bottom - block.top };
  return `${rectOpen(box, CORNER.inner)} class="grid-tray"/>`;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 칸 하나의 윤곽 여는 글. 칸 묶음의 바깥 모서리와 맞닿은 모서리만 반지름을 갖고, 안쪽 칸은 직각 사각형이다. 면, 선택 선이 같은 윤곽을 쓴다.
function cellShape(it, cell, block) {
  const radius = CORNER.inner;
  const [x, y] = [it.x + cell.x, it.y + cell.y];
  const [right, bottom] = [x + cell.w, y + cell.h];
  const corner = { tl: cell.x === block.left && cell.y === block.top, tr: cell.x + cell.w === block.right && cell.y === block.top, br: cell.x + cell.w === block.right && cell.y + cell.h === block.bottom, bl: cell.x === block.left && cell.y + cell.h === block.bottom };
  if (!Object.values(corner).some(Boolean)) return `<rect ${boxOf(it, cell)}`;
  const [tl, tr, br, bl] = [corner.tl, corner.tr, corner.br, corner.bl].map((on) => (on ? radius : 0));
  const arc = (rad, dx, dy) => (rad ? `a${rad} ${rad} 0 0 1 ${dx * rad} ${dy * rad}` : '');
  return `<path d="M${r(x + tl)} ${r(y)}H${r(right - tr)}${arc(tr, 1, 1)}V${r(bottom - br)}${arc(br, -1, 1)}H${r(x + bl)}${arc(bl, -1, -1)}V${r(y + tl)}${arc(tl, 1, -1)}Z"`;
}

// cost: time O(c·l + e), heap O(out), stack O(1)
// vars: c = 칸 수, l = 칸 글 줄 수, e = 빈 자리 구간 수, out = 만든 SVG 글자 수
// basis: estimate
/**
 * 격자 몸통. 칸은 밝히기 대상(`fl-part`)이라 사각형과 글을 한 묶음으로 둔다.
 * @param paint { decorate, glyphs, index }. index는 장면 도형 번호이고 빈 자리 무늬의 이름(`ge-번호`)을 만든다
 */
export function drawGridBody(it, { decorate, glyphs, index }) {
  const empties = drawEmpties(it, index);
  const block = blockOf(it);
  const tray = it.unit.gutter > 0 ? drawTray(it, block) : '';
  const cells = it.cells.map((cell) => {
    const texts = drawTexts(cell.texts, it, glyphs);
    if (cell.kind === 'gap') return `<g>${cellShape(it, cell, block)} class="grid-cell gap"/>${texts}</g>`;
    const key = `${it.id}.${cell.id}`;
    return `<g class="fl-part" data-part="${escapeXml(key)}">${cellShape(it, cell, block)} class="grid-cell ${decorate('cell', 0, key)}"/>${texts}</g>`;
  });
  return tray + empties + cells.join('');
}

// cost: time O(e), heap O(e), stack O(1)
// vars: e = 빈 자리 구간 수
// basis: estimate
/**
 * 빈 자리. 단위 칸 하나의 점선 윤곽을 담은 반복 무늬(pattern)와, 빈 자리 구간을 모두 이은 경로 하나를 그린다. 경로 하나가 무늬로 칠해지므로 요소 수와 경로 명령 수는 빈 칸 수가 아니라 구간 수에 비례한다.
 * 무늬 칸은 단위 칸에 행 사이 통로 높이를 더한 크기이고, 칸 경계선(윗변과 왼쪽 변, 통로가 있으면 아랫변)을 굵기 절반만큼 비켜 그려 선이 무늬 칸 안에 온전히 들어간다.
 * 구간 경로는 굵기 절반만큼 사방으로 넓혀 구간 바깥 경계선도 온전히 보인다. 옛 그림처럼 칸마다 사각형을 그린 것과 같은 선 굵기와 자리다.
 */
function drawEmpties(it, index) {
  if (!it.empties.length) return '';
  const { unit } = it;
  const stroke = values["border-width"].thin;
  const half = stroke / 2;
  const id = `ge-${index}`;
  const lines = [`M0 ${r(half)}h${r(unit.w)}`, `M${r(half)} 0v${r(unit.h + half)}`, ...(unit.gutter ? [`M0 ${r(unit.h + half)}h${r(unit.w)}`] : [])].join('');
  const pattern = `<pattern id="${id}" patternUnits="userSpaceOnUse" x="${r(it.x + unit.x - half)}" y="${r(it.y + unit.y - half)}" width="${r(unit.w)}" height="${r(unit.h + unit.gutter)}"><path d="${lines}" class="grid-cell empty"/></pattern>`;
  const path = it.empties.map((e) => `M${r(it.x + e.x - half)} ${r(it.y + e.y - half)}h${r(e.w + stroke)}v${r(e.h + stroke)}h${r(-e.w - stroke)}z`).join('');
  return `${pattern}<path d="${path}" fill="url(#${id})" class="grid-empty"/>`;
}
