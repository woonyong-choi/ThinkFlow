// 도형 윗줄과 그룹 제목 줄의 장식(아이콘, 글자 배지, 복제 개수 알약)을 그린다. 크기와 자리는 measure/decor.js가 정한 그대로다.
import { ratio } from '../format.js';
import { BADGE_STYLE } from '../measure/decor.js';
import { centerBaseline, escapeXml, roundCoord as r } from '../text.js';
import { headBox } from '../layout/titles.js';
import { values } from '../vendor/theme/tokens.js';
import { iconBody } from '../vendor/theme/ui/svg.mjs';

const ICON_GRID = values.icon['size-small'];

// cost: time O(k), heap O(out), stack O(1)
// vars: k = 장식 수, out = 만든 SVG 글자 수
// basis: estimate
/**
 * 장식 한 줄을 그린다.
 * @param decor measure/decor.js의 layoutDecor 결과
 * @param place { x, y, iconData, prefix }. x, y는 줄 왼쪽 위이고 prefix는 그린 아이콘의 문서 내 식별자다
 * @param glyphs 쓴 글자를 모으는 그릇
 */
export function drawDecor(decor, place, glyphs) {
  return decor.items
    .filter((item) => item.kind !== 'title')
    .map((item) => (item.kind === 'icon' ? drawIcon(item, place) : drawBadge(item, place, glyphs)))
    .join('');
}

// 아이콘. 24 격자 아이콘을 정사각 칸에 맞춰 넣는다. 내장 아이콘은 공통 도형과 색을 유지하며 사용자 SVG는 currentColor를 쓴다.
function drawIcon(item, { x, y, iconData, prefix }) {
  return drawSymbol(iconData, { x: x + item.x, y: y + item.y, size: item.w, prefix });
}

// 의미 아이콘(등록부 도형)은 자신의 실루엣에 면과 윤곽을 갖는다. 브랜드와 사용자 SVG에는 임의 배경을 붙이지 않는다. 두 가지 모두 같은 틀 맞춤(iconAt)을 쓴다.
function drawSymbol(iconData, { x, y, size, prefix }) {
  return `<g class="fl-symbol fl-symbol-${iconData.role}">${iconAt(iconData, { x, y, size, prefix })}</g>`;
}

// 내장 SVG의 격자 맞춤과 mask ID 분리는 공통 렌더러가 맡고, 사용자 SVG는 검증할 때 맞춘 격자를 쓴다.
function iconAt(iconData, { x, y, size, prefix }) {
  const body = iconData.svg ? iconBody(iconData.svg, { size: ICON_GRID, prefix }) : iconData.body;
  return `<g class="fl-icon" transform="translate(${r(x)} ${r(y)}) scale(${ratio(size / ICON_GRID)})">${body}</g>`;
}

// cost: time O(1), heap O(out), stack O(1)
// vars: out = 만든 SVG 글자 수
// basis: estimate
/**
 * 그룹 제목 줄 왼쪽의 아이콘 타일. 그룹 틀 안쪽 왼쪽 위에 둥근 타일로 놓는다.
 * @param g 그룹(x, y, iconData)
 */
export function drawGroupTab(g, index) {
  const size = values.spacing.figure.group.title - values.spacing["2"];
  // 탭은 제목 덩어리 사각형(layout/titles.js headBox: 선이 탭을 지나면 탭과 제목이 한 덩어리로 비킨다) 왼쪽 위에서 안쪽으로 들인다.
  return drawSymbol(g.iconData, { x: headBox(g, g.titleDx).x + values.spacing["2"], y: g.y + values.spacing["1"], size, prefix: `icon-g-${index}` });
}

// 글자 배지. 배지와 복제 개수가 같은 모양이다(선 라벨 알약과는 다른 역할이다: draw/connector.js).
function drawBadge(item, { x, y }, glyphs) {
  glyphs.add(item.text, BADGE_STYLE.face);
  const [left, top] = [x + item.x, y + item.y];
  return `<g class="fl-badge"><rect x="${r(left)}" y="${r(top)}" width="${r(item.w)}" height="${r(item.h)}" rx="${r(item.h / 2)}" class="badge-pill"/><text x="${r(left + item.w / 2)}" y="${r(centerBaseline(top + item.h / 2, BADGE_STYLE.size))}" class="badge">${escapeXml(item.text)}</text></g>`;
}
