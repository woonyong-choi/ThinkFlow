// 단계별 도형 상태 알약(docs/design/figure-syntax.md 단계별 도형 상태). 도형 오른쪽 위 모서리에 걸쳐 글자와 기호를 함께 그린다. 도형 크기와 배치는 바꾸지 않는다.
import { BADGE_STYLE, bodyOf } from '../measure/decor.js';
import { measure } from '../measure/fonts.js';
import { centerBaseline, escapeXml, roundCoord as r } from '../text.js';
import { tokens, values } from '../vendor/theme/tokens.js';
import { hiddenAttr } from './visible.js';

const SPACE = values.spacing;
const HEIGHT = values.spacing.figure.pill.height;
// 기호 칸. 알약 높이에서 위아래 안쪽 간격 `space.2`씩을 뺀 정사각이다.
const ICON = HEIGHT - SPACE["1"] * 2;
// 알약이 모서리 바깥으로 나가는 거리(오른쪽, 위쪽 반대로 모서리 아래로 들어오는 거리)
const OVERHANG = SPACE["1-5"];
const INSET = SPACE["1"];
// 기호 선 굵기
const MARK_WIDTH = values["border-width"].edge;
const SQRT_HALF = Math.SQRT1_2;

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 기호 도형 조각. 정사각 칸(한 변 ICON)의 가운데 (cx, cy)에 그린다. 선은 알약 색(color)이다.
const MARKS = {
  ok: (cx, cy, color) => `<path d="M ${r(cx - ICON * 0.35)} ${r(cy)} L ${r(cx - ICON * 0.08)} ${r(cy + ICON * 0.28)} L ${r(cx + ICON * 0.4)} ${r(cy - ICON * 0.3)}" fill="none" stroke="${color}" stroke-width="${MARK_WIDTH}" stroke-linecap="round" stroke-linejoin="round"/>`,
  warn: (cx, cy, color) =>
    `<path d="M ${r(cx)} ${r(cy - ICON * 0.46)} L ${r(cx + ICON * 0.5)} ${r(cy + ICON * 0.4)} L ${r(cx - ICON * 0.5)} ${r(cy + ICON * 0.4)} Z" fill="none" stroke="${color}" stroke-width="${MARK_WIDTH}" stroke-linejoin="round"/>` +
    `<path d="M ${r(cx)} ${r(cy - ICON * 0.12)} L ${r(cx)} ${r(cy + ICON * 0.1)}" fill="none" stroke="${color}" stroke-width="${MARK_WIDTH}" stroke-linecap="round"/>`,
  fail: (cx, cy, color) => `<path d="M ${r(cx - ICON * 0.32)} ${r(cy - ICON * 0.32)} L ${r(cx + ICON * 0.32)} ${r(cy + ICON * 0.32)} M ${r(cx + ICON * 0.32)} ${r(cy - ICON * 0.32)} L ${r(cx - ICON * 0.32)} ${r(cy + ICON * 0.32)}" fill="none" stroke="${color}" stroke-width="${MARK_WIDTH}" stroke-linecap="round"/>`,
  wait: (cx, cy, color) => [-1, 0, 1].map((k) => `<circle cx="${r(cx + k * ICON * 0.32)}" cy="${r(cy)}" r="${r(MARK_WIDTH * 0.75)}" fill="${color}"/>`).join(''),
};

/** 상태 종류마다 알약 글자와 색. 기호와 테두리는 이 색이고 글자는 fg다. 색 하나로만 구분하지 않으려고 글자와 기호를 늘 함께 그린다. wait는 도형 면 위 대비 3을 넘는 중립 윤곽 색이다(border는 1.3 아래라 쓰지 못한다). */
const KINDS = {
  ok: { text: 'OK', color: tokens.color.state.success },
  warn: { text: 'WARN', color: tokens.color.state.warning },
  fail: { text: 'FAIL', color: tokens.color.state.error },
  wait: { text: 'WAIT', color: tokens.color.outline },
};

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 알약 크기. 왼쪽 안쪽 간격, 기호, 간격, 글자, 오른쪽 안쪽 간격이다. */
function sizeStatus(kind) {
  return { w: SPACE["1-5"] + ICON + SPACE["1"] + measure(KINDS[kind].text, BADGE_STYLE.size, BADGE_STYLE.face) + SPACE["1-5"], h: HEIGHT };
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 알약이 걸치는 모서리. 상자류는 몸통의 오른쪽 위 모서리이고, 갈림길(마름모)과 원은 모서리가 도형 밖이라 윤곽 위 점이다.
function cornerOf(it) {
  if (it.shape === 'decision') return { x: it.x + it.w * 0.75, y: it.y + it.h * 0.25 };
  if (it.shape === 'circle') return { x: it.x + (it.w / 2) * (1 + SQRT_HALF), y: it.y + (it.h / 2) * (1 - SQRT_HALF) };
  const body = bodyOf(it);
  return { x: body.x + body.w, y: body.y };
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 도형 it의 상태 알약 사각형. 오른쪽 위 모서리에서 OVERHANG만큼 바깥으로 나가고, 아래 가장자리는 모서리 INSET 안쪽이다. */
function statusBox(it, kind) {
  const { w, h } = sizeStatus(kind);
  const corner = cornerOf(it);
  return { x: corner.x + OVERHANG - w, y: corner.y + INSET - h, w, h };
}

// cost: time O(b), heap O(1), stack O(1)
// vars: b = 구간 수
// basis: estimate
/** 시간표가 단계별 도형 상태를 쓰는지. 쓰는 그림에만 알약 글자 스타일과 재생기 코드가 따라붙는다. */
export const hasStatus = (timeline) => timeline.segs.some((seg) => seg.status);

// cost: time O(b·s), heap O(s), stack O(1)
// vars: b = 구간 수, s = 상태 수
// basis: estimate
/** 시간표가 쓰는 알약마다 { node, kind, spans }. spans는 그 알약이 보이는 시각 구간 [시작, 끝](그림 전체 ms)이고 처음 나온 순서로 모은다. */
function statusPills(timeline) {
  const pills = new Map();
  for (const seg of timeline.segs) {
    for (const { node, kind } of seg.status ?? []) {
      const key = `${node}\u0000${kind}`;
      if (!pills.has(key)) pills.set(key, { node, kind, spans: [] });
      pills.get(key).spans.push([seg.t0, seg.t1]);
    }
  }
  return [...pills.values()];
}

// cost: time O(i), heap O(k), stack O(1)
// vars: i = 도형 수, k = 같은 논리 카드를 그린 도형 수
// basis: estimate
// 논리 카드 id가 그려진 도형 번호들. 카드가 여러 보기에 있으면 보기마다 하나이고 모두 같은 논리 상태를 보인다.
const instancesOf = (scene, node) => scene.items.flatMap((it, index) => (it.id === node ? [index] : []));

// cost: time O(p·i), heap O(p·k), stack O(1)
// vars: p = 알약 수, i = 도형 수, k = 같은 논리 카드를 그린 도형 수
// basis: estimate
/**
 * 상태 알약의 사각형 목록(그림 검사와 글 상자 자리 계산이 피할 대상). 시간표에 쓰인 알약마다, 그 논리 카드가 그려진 모든 도형(보기마다 하나)에 하나씩이다.
 * @returns { x, y, w, h, name, node, kind, item }[]. name은 알약 글자, item은 도형 번호(scene.items 안)
 */
export function statusBoxes(scene, timeline) {
  return statusPills(timeline).flatMap(({ node, kind }) => instancesOf(scene, node).map((item) => ({ ...statusBox(scene.items[item], kind), name: KINDS[kind].text, node, kind, item })));
}

// cost: time O(p·i), heap O(out), stack O(1)
// vars: p = 알약 수, i = 도형 수, out = 만든 SVG 글자 수
// basis: estimate
/**
 * 상태 알약 층. 알약마다, 그 논리 카드를 그린 모든 도형에 묶음 하나씩 있고 `data-st`(이름과 종류)로 재생기가 찾는다. 처음에는 보이지 않는다.
 * 논리 상태는 하나라 같은 알약은 모든 도형에서 같은 시각 구간에 보인다.
 * @param windows (spans) => 보임 SMIL 요소. 움직이는 SVG가 시각 구간으로 이산 불투명도를 만들고, 재생기는 빈 글을 돌려주고 직접 켠다
 * @param name (논리 id, 도형 번호) => `data-st`의 앞부분. 움직이는 SVG는 도형마다 다르게(도형 번호) 쓰고, 재생기는 논리 id를 써서 한 이름의 알약을 한꺼번에 켠다
 * @returns 알약 층 글. 알약이 없으면 빈 글이다
 */
export function drawStatusPills(scene, timeline, { glyphs, windows, name, isStatic = false }) {
  const drawn = statusPills(timeline).flatMap(({ node, kind, spans }) =>
    instancesOf(scene, node).map((item) => {
      const { color, text } = KINDS[kind];
      const { x, y, w, h } = statusBox(scene.items[item], kind);
      glyphs.add(text, BADGE_STYLE.face);
      const markX = x + SPACE["1-5"] + ICON / 2;
      const textX = x + SPACE["1-5"] + ICON + SPACE["1"];
      return (
        `<g class="fl-status" data-st="${escapeXml(`${name(node, item)}-${kind}`)}" opacity="${isStatic ? 1 : 0}"${hiddenAttr(isStatic)}>` +
        `<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" rx="${r(h / 2)}" fill="${tokens.color["ui-card"]}" stroke="${color}" stroke-width="${values["border-width"].edge}"/>` +
        MARKS[kind](markX, y + h / 2, color) +
        `<text x="${r(textX)}" y="${r(centerBaseline(y + h / 2, BADGE_STYLE.size))}" class="status-text">${text}</text>` +
        `${windows(spans)}</g>`
      );
    }),
  );
  return drawn.length ? `<g class="fl-status-pills">${drawn.join('')}</g>` : '';
}
