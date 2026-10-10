// 카드 안에 보이는 내용(`show`와 값 줄)을 그린다. 내용마다 층을 하나씩 두고 박자가 보일 층을 고른다. 크기와 글 자리는 measure/content.js가 정한 그대로고, 글은 카드 머리와 같은 drawTexts가 그린다.
// 카드 면과 머리는 draw/card.js가 그리고, 이 파일은 그 면 안쪽에 놓이는 내용 면 하나와 그 위의 줄(태그 알약, 관계 그래프의 선과 알약)만 맡는다.
import { bodyOf } from '../measure/decor.js';
import { CONTENT } from '../measure/content.js';
import { autoTone, toneColors } from '../tone.js';
import { roundCoord as r } from '../text.js';
import { tokens, values } from '../vendor/theme/tokens.js';
import { faceOf, lookClass } from './look.js';
import { CORNER, rectOpen } from './surface.js';
import { drawTexts } from './texts.js';
import { hiddenAttr } from './visible.js';
import { drawChartBody } from './chart.js';

const RADIUS = values.radius;
const contentLook = (layout) => layout.rows.map(({ row }) => faceOf(row)).find(({ tone }) => tone !== undefined) ?? faceOf({});

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 태그 종류 수
// basis: estimate
/**
 * 그림 하나에서 태그 색을 고정하는 그릇. tone 없는 태그는 원본에 처음 나온 순서대로 범주 색 순서(tone.js autoTone)로 색을 받는다.
 * @param tagOrder 원본 시간 흐름에 처음 나온 순서의 tone 없는 태그 목록
 */
export function createTones(tagOrder = []) {
  const tones = new Map();
  const next = (tag) => tones.has(tag) || tones.set(tag, autoTone(tones.size));
  for (const tag of tagOrder) next(tag);
  return (row) => {
    if (row.tone) return toneColors(row.tone).fill;
    next(row.tag);
    return toneColors(tones.get(row.tag)).fill;
  };
}

/** 내용 면 자리. 카드 면 아래쪽 안이다(표와 API는 열 아래, 상자와 사람은 이름 아래). */
export function contentBox(it) {
  const { w, h } = it.content;
  const body = bodyOf(it);
  return { x: it.x + CONTENT.margin, y: body.y + body.h - CONTENT.margin - h, w, h };
}

// cost: time O(k·r·n), heap O(out), stack O(1)
// vars: k = 내용 수, r = 줄 수, n = 줄 글자 수, out = 만든 SVG 글자 수
// basis: estimate
/**
 * 내용 면과 내용 층을 그린다. 면은 내용이 들어온 박자에만 보이고, 내용이 없는 카드는 아무것도 그리지 않는다.
 * @param place { box, i, shown? }. box는 { x, y, w, h } 내용 면 자리, i는 도형 번호, shown은 처음부터 보이는 내용 번호다(재생기가 그리지 않는 장면 없는 문서, html/content.js)
 * @param paint { toneOf, decorate, glyphs, flashes }. decorate는 움직이는 SVG가 박자별 class를 넣는 함수
 */
export function drawContent(content, { box, i, shown }, { toneOf, decorate, glyphs, flashes }) {
  const layers = content.layouts
    .map((layout, k) => `<g id="n-${i}-c${k}" opacity="${k === shown ? 1 : 0}"${hiddenAttr(k === shown)} class="fl-layer${lookClass(contentLook(layout))} ${decorate('layer', i, k)}">${drawFace(layout, box)}${flashes?.card.get(`${i}:${k}`) ?? ''}${drawRows(layout, box, { toneOf, glyphs })}</g>`)
    .join('');
  return (
    `${rectOpen(box, CORNER.inner)} fill="${tokens.color["ui-card"]}" opacity="0" class="fl-card${shown === undefined ? '' : ' filled'} ${decorate('card', i)}"/>` +
    layers
  );
}

// cost: time O(r), heap O(1), stack O(1)
// vars: r = 줄 수
// basis: estimate
// 내용이 고른 모습(look.js faceOf). 그 내용의 줄 가운데 처음 고른 모습이 이 내용의 면이다. 칠하는 일은 CSS(draw/paint.js)가 하고, 윤곽 표현의 경계 선이 내용 면 밖으로 나가지 않게 반 선 굵기 안쪽에 그린다. 고르지 않았으면 빈 글이다.
function drawFace(layout, box) {
  const look = contentLook(layout);
  if (look.tone === undefined) return '';
  const inset = values["border-width"].thin / 2;
  return `${rectOpen({ x: box.x + inset, y: box.y + inset, w: box.w - inset * 2, h: box.h - inset * 2 }, CORNER.inner - inset)} class="face${lookClass(look)}"/>`;
}

/** 내용의 줄 하나가 차지한 자리: 맨 위 y와 높이. 값 글자(draw/values.js)가 줄 오른쪽 끝에 얹힐 자리를 찾는 데 쓴다. 자리는 sizeContent가 정한 그대로다. */
export function rowSpan(layout, box, index) {
  return { y: box.y + layout.rows[index].top, h: layout.rows[index].height };
}

// cost: time O(r·n), heap O(out), stack O(1)
// vars: r = 줄 수, n = 줄 글자 수, out = 만든 SVG 글자 수
// basis: estimate
// 줄마다 태그 알약(있으면), 관계 그래프의 선과 알약(있으면), 그 줄의 글. 글(태그, 표시, 본문, 그래프 이름)은 모두 측정이 놓은 text다.
function drawRows(layout, box, { toneOf, glyphs }) {
  return layout.rows.map((laid) => {
    if (laid.chart) return drawChartBody(laid.chart, { id: laid.id, x: box.x + (box.w - laid.chart.width) / 2, y: box.y + laid.top }, glyphs);
    return `${laid.tag ? drawTag(laid, box, toneOf(laid.row)) : ''}${laid.graph ? drawMiniGraph(laid.graph, box) : ''}${drawTexts(laid.texts, box, glyphs)}`;
  }).join('');
}

// 태그 알약. 알약은 줄 첫 줄의 세로 가운데에 놓이고 자리는 측정이 정했다.
function drawTag({ tag }, box, tone) {
  return `<rect x="${r(box.x + tag.x)}" y="${r(box.y + tag.center - tag.h / 2)}" width="${r(tag.w)}" height="${tag.h}" rx="${RADIUS.sm}" fill="${tone}" fill-opacity="${values.opacity.tag}"/>`;
}

// cost: time O(n + e), heap O(out), stack O(1)
// vars: n = 이름 수, e = 관계 수, out = 만든 SVG 글자 수
// basis: estimate
// 관계 그래프의 선과 이름 알약. 밝힌 이름과, 밝힌 두 이름 사이 선은 강조 색이다. 열을 건너뛰는 관계는 위로 휜다. 이름 글은 text다.
function drawMiniGraph(laid, box) {
  const [x, y] = [box.x + laid.at.x, box.y + laid.at.y];
  // 관계선은 바깥 연결선과 같은 부품이다: 묶음 `fl-edge`와 선 `fl-path`가 굵기, 모서리, 평소 색을 정하고, 강조는 같은 켜짐 색(`--fx-edge`)을 선 묶음 색으로 읽을 뿐이다.
  const lines = laid.edges.map(({ from, to, isLit, isSkip }) => {
    let d;
    if (isSkip) {
      const [x1, x2] = [from.x + from.w / 2, to.x + to.w / 2];
      d = `M ${r(x + x1)} ${r(y + from.y)} Q ${r(x + (x1 + x2) / 2)} ${r(y - Math.min(from.y, to.y))} ${r(x + x2)} ${r(y + to.y)}`;
    } else {
      const isSameColumn = Math.abs(from.x - to.x) < 1;
      const [x1, y1] = isSameColumn ? [from.x + from.w / 2, from.y + from.h] : [from.x + from.w, from.y + from.h / 2];
      const [x2, y2] = isSameColumn ? [to.x + to.w / 2, to.y] : [to.x, to.y + to.h / 2];
      d = `M ${r(x + x1)} ${r(y + y1)} L ${r(x + x2)} ${r(y + y2)}`;
    }
    return `<g class="fl-edge"${isLit ? ' style="color: var(--fx-edge)"' : ''}><path d="${d}" class="fl-path"/></g>`;
  });
  const pills = laid.nodes.map((n) => {
    // 밝힌 이름은 선택 행과 같은 옅은 면이고 윤곽은 그대로다. 칩의 식별은 실루엣이 맡고 파랑은 면적을 차지하지 않는다.
    const fill = n.isLit ? 'style="fill: var(--fx-row)"' : `fill="${tokens.color["ui-card"]}"`;
    // 칩 윤곽은 도형과 표 구획과 같은 경계선 역할(border.thin, color.help-border)이다.
    const stroke = tokens.color["help-border"];
    return `<rect x="${r(x + n.x)}" y="${r(y + n.y)}" width="${r(n.w)}" height="${r(n.h)}" rx="${r(n.h / 2)}" ${fill} stroke="${stroke}" stroke-width="${values["border-width"].thin}"/>`;
  });
  return lines.join('') + pills.join('');
}
