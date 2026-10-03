// 값 카드 줄의 값 글자와 바뀔 때 밝히는 테두리. 줄의 이름은 카드 층이 그리고, 값은 시간표(timeline.values)의 변화 목록대로 글자 요소를 값마다 하나씩 두고 불투명도로 바꾼다(docs/design/playback.md 값 변화).
import { CARD, STYLE } from '../measure/sizes.js';
import { escapeXml, roundCoord as r } from '../text.js';
import { tokens, values } from '../tokens.js';
import { rowSlot } from './card.js';
import { cardBox } from './figure.js';

// cost: time O(v·(c + n)), heap O(out), stack O(1)
// vars: v = 값 줄 수, c = 값이 바뀌는 횟수, n = 값 글자 수, out = 만든 SVG 글자 수
// basis: estimate
/**
 * 시간표의 값 줄을 모두 그린다. 값 글자와 밝힘 테두리는 모두 처음에 안 보이고, 보이는 때를 움직임이 정한다.
 * @param deps { glyphs, windows }. windows(구간 목록)은 움직이는 SVG의 SMIL 요소를 돌려주고, 재생기는 빈 글을 돌려주는 함수를 넘겨 요소만 그리게 한다(재생기가 불투명도를 바꾼다)
 */
export function drawValues(scene, timeline, { glyphs, windows }) {
  return (timeline.values ?? [])
    .map((row, vi) => {
      const item = scene.items.find((it) => it.id === row.node);
      const box = cardBox(item);
      const layout = item.card.layouts[row.card];
      const slot = rowSlot(layout, box, layout.rows.findIndex((laid) => laid.row.valueId === row.id));
      const texts = [...new Set(row.periods.map(([, , text]) => text))].map((text) => {
        glyphs.add(text, STYLE.mark.face);
        const spans = row.periods.filter(([, , t]) => t === text).map(([start, end]) => [start, end]);
        return `<text x="${r(box.x + box.w - CARD.side)}" y="${r(slot.y + STYLE.row.size)}" class="value" opacity="0" data-v="${vi}" data-t="${escapeXml(text)}">${escapeXml(text)}${windows(spans)}</text>`;
      });
      return `<g class="fl-value">${flashFrame(row, { box, slot, vi }, windows)}${texts.join('')}</g>`;
    })
    .join('\n');
}

// cost: time O(c), heap O(c), stack O(1)
// vars: c = 값이 바뀌는 횟수
// basis: estimate
// 값이 바뀔 때 그 카드 줄을 둘러싸는 테두리(면 칠 없음). 바뀐 줄이 눈에 들어오도록 밝힘 색(지금)을 쓴다.
function flashFrame(row, { box, slot, vi }, windows) {
  const inset = CARD.side / 2;
  return `<rect x="${r(box.x + inset)}" y="${r(slot.y - CARD.gap / 2)}" width="${r(box.w - inset * 2)}" height="${r(slot.h + CARD.gap)}" rx="${values.radius.sm}" fill="none" stroke="${tokens.color.state.active}" stroke-width="${values.border.edge}" opacity="0" data-vf="${vi}">${windows(row.flashes)}</rect>`;
}
