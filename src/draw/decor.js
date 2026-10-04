// 도형 윗줄과 그룹 제목 줄의 장식(아이콘, 글자 배지, 복제 개수 알약)을 그린다. 크기와 자리는 measure/decor.js가 정한 그대로다.
import { BADGE_STYLE } from '../measure/decor.js';
import { centerBaseline, escapeXml, roundCoord as r } from '../text.js';
import { values } from '../tokens.js';

// cost: time O(k), heap O(out), stack O(1)
// vars: k = 장식 수, out = 만든 SVG 글자 수
// basis: estimate
/**
 * 장식 한 줄을 그린다.
 * @param decor measure/decor.js의 layoutDecor 결과
 * @param place { x, y, iconData }. x, y는 줄 왼쪽 위(그림 좌표), iconData는 아이콘 { viewBox, body }
 * @param glyphs 쓴 글자를 모으는 그릇
 */
export function drawDecor(decor, place, glyphs) {
  return decor.items
    .filter((item) => item.kind !== 'title')
    .map((item) => (item.kind === 'icon' ? drawIcon(item, place) : drawPill(item, place, glyphs)))
    .join('');
}

// 아이콘. 파일의 viewBox를 정사각 칸 안에 가운데로 맞춰 넣는다. 색은 class의 currentColor가 정한다.
function drawIcon(item, { x, y, iconData }) {
  return tileIcon(iconData, { x: x + item.x, y: y + item.y, size: item.w });
}

// 옅은 파랑 바탕 둥근 타일 위에 아이콘을 얹는다. 타일은 칸 전체이고 글자 모양은 칸의 ICON_SHARE만 쓴다.
const ICON_SHARE = 0.62;
function tileIcon(iconData, { x, y, size }) {
  const inner = size * ICON_SHARE;
  return `<rect x="${r(x)}" y="${r(y)}" width="${r(size)}" height="${r(size)}" rx="${r(size * 0.3)}" class="icon-tile"/>${iconAt(iconData, { x: x + (size - inner) / 2, y: y + (size - inner) / 2, size: inner, className: 'fl-icon in-tile' })}`;
}

// 정사각 칸(왼쪽 위 x, y, 한 변 size) 안에 아이콘을 가운데 맞춰 그린다.
function iconAt(iconData, { x, y, size, className = 'fl-icon' }) {
  const [vx, vy, vw, vh] = iconData.viewBox;
  const scale = size / Math.max(vw, vh);
  const tx = x + (size - vw * scale) / 2 - vx * scale;
  const ty = y + (size - vh * scale) / 2 - vy * scale;
  return `<g class="${className}" transform="translate(${r(tx)} ${r(ty)}) scale(${r(scale * 1000) / 1000})">${iconData.body}</g>`;
}

// cost: time O(1), heap O(out), stack O(1)
// vars: out = 만든 SVG 글자 수
// basis: estimate
/**
 * 그룹 제목 줄 왼쪽의 아이콘 타일. 그룹 틀 안쪽 왼쪽 위에 둥근 타일로 놓는다.
 * @param g 그룹(x, y, iconData)
 */
export function drawGroupTab(g) {
  const size = values.size.group.title - values.space['4'];
  return tileIcon(g.iconData, { x: g.x + values.space['4'], y: g.y + values.space['2'], size });
}

// 글자 알약. 배지와 복제 개수가 같은 모양이다.
function drawPill(item, { x, y }, glyphs) {
  glyphs.add(item.text, BADGE_STYLE.face);
  const [left, top] = [x + item.x, y + item.y];
  return `<g class="fl-badge"><rect x="${r(left)}" y="${r(top)}" width="${r(item.w)}" height="${r(item.h)}" rx="${r(item.h / 2)}" class="badge-pill"/><text x="${r(left + item.w / 2)}" y="${r(centerBaseline(top + item.h / 2, BADGE_STYLE.size))}" class="badge">${escapeXml(item.text)}</text></g>`;
}
