// 칸 격자의 몸통을 그린다: 칸 묶음 바탕, 빈 자리, 칸. 면과 제목은 카드(draw/card.js)가 그리고, 칸 자리와 칸 글은 measure/sizes.js의 sizeGrid가 정한 그대로다.
import { roundCoord as r, escapeXml } from '../text.js';
import { values } from '@woonyong-choi/design-tokens/tokens.js';
import { CORNER, rectOpen, gridBounds as blockOf } from './surface.js';
import { drawTexts } from './texts.js';
import { BRACE_W } from '../measure/sizes.js';

// 칸 사각형 속성. 격자 왼쪽 위가 원점인 칸 자리에 도형 자리를 더한다.
function boxOf(it, { x, y, w, h }) {
  return `x="${r(it.x + x)}" y="${r(it.y + y)}" width="${r(w)}" height="${r(h)}"`;
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
    const texts = cell.valueId ? '' : drawTexts(cell.texts, it, glyphs);
    if (cell.kind === 'gap') return `<g>${cellShape(it, cell, block)} class="grid-cell gap"/>${texts}</g>`;
    const key = `${it.id}.${cell.id}`;
    const shape = cell.isOpen ? openShape(it, cell) : cellShape(it, cell, block);
    return `<g class="fl-part" data-part="${escapeXml(key)}">${shape} class="grid-cell ${decorate('cell', 0, key)}"/>${texts}</g>`;
  });
  return tray + empties + cells.join('') + (it.rulerUnit === undefined ? '' : drawFrame(it, block) + (it.braces ?? []).map((b) => drawBrace(it, b)).join(''));
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 길이가 정해지지 않은 칸(`open`)의 윤곽: 아랫변이 없다. 면은 닫힌 칸과 같고 아랫변은 바이트 배치의 틀(drawFrame)이 점선으로 그린다.
function openShape(it, cell) {
  const [x, y] = [it.x + cell.x, it.y + cell.y];
  return `<path d="M${r(x)} ${r(y + cell.h)}V${r(y)}H${r(x + cell.w)}V${r(y + cell.h)}"`;
}

// cost: time O(c), heap O(c), stack O(1)
// vars: c = 칸 수
// basis: estimate
/**
 * 바이트 배치(`unit=`)의 바깥 틀. 칸 사이 선보다 진한 선으로 배치 전체의 경계를 그려, 칸 구분과 배치의 끝을 다른 위계로 읽게 한다.
 * 길이가 정해지지 않은 칸(`open`) 아래는 틀을 닫지 않고 점선으로 남겨 뒤로 이어진다는 표시로 쓴다.
 */
function drawFrame(it, block) {
  const [left, top, right, bottom] = [it.x + block.left, it.y + block.top, it.x + block.right, it.y + block.bottom];
  const radius = CORNER.inner;
  const open = it.cells.filter((c) => c.isOpen && it.y + c.y + c.h >= bottom - 0.5).map((c) => [it.x + c.x, it.x + c.x + c.w]).sort((a, b) => a[0] - b[0]);
  if (!open.length) return `${rectOpen({ x: left, y: top, w: right - left, h: bottom - top }, radius)} fill="none" class="chart-whisker"/>`;
  // 위, 오른쪽, 왼쪽 변은 둥근 모서리로 잇고, 아랫변은 열린 칸을 뺀 구간만 실선이다.
  const sides = `M${r(left)} ${r(bottom)}V${r(top + radius)}a${radius} ${radius} 0 0 1 ${radius} ${-radius}H${r(right - radius)}a${radius} ${radius} 0 0 1 ${radius} ${radius}V${r(bottom)}`;
  const solid = [];
  let from = left;
  for (const [a, b] of open) {
    if (a > from) solid.push(`M${r(from)} ${r(bottom)}H${r(a)}`);
    from = Math.max(from, b);
  }
  if (from < right) solid.push(`M${r(from)} ${r(bottom)}H${r(right)}`);
  const dashed = open.map(([a, b]) => `<line x1="${r(a)}" x2="${r(b)}" y1="${r(bottom)}" y2="${r(bottom)}" class="grid-cell empty"/>`).join('');
  return `<path d="${sides}${solid.join('')}" fill="none" class="chart-whisker"/>${dashed}`;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 구간 괄호 하나(measure/sizes.js rulerParts가 정한 자리). 칸 묶음 오른쪽에서 구간의 위아래 끝을 잇고 가운데가 오른쪽으로 나온 중괄호다.
function drawBrace(it, { x, y0, y1 }) {
  const half = BRACE_W / 2;
  const curl = Math.min(half, (y1 - y0) / 4);
  const [left, mid] = [it.x + x, it.y + (y0 + y1) / 2];
  const d = `M${r(left)} ${r(it.y + y0)}q${half} 0 ${half} ${curl}V${r(mid - curl)}q0 ${curl} ${half} ${curl}q${-half} 0 ${-half} ${curl}V${r(it.y + y1 - curl)}q0 ${curl} ${-half} ${curl}`;
  return `<path d="${d}" fill="none" class="chart-whisker"/>`;
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


// cost: time O(c), heap O(1), stack O(1)
// vars: c = 격자 칸 수
// basis: estimate
// 값 갱신 면은 칸 본체와 같은 윤곽을 쓰고 경계선을 겹치지 않는다.
export function drawCellFlash(it, cell, attrs, animation) {
  const shape = cellShape(it, cell, blockOf(it));
  return `${shape} class="fl-flash fl-flash-face" opacity="0" ${attrs}>${animation}</${shape.startsWith('<rect') ? 'rect' : 'path'}>`;
}
