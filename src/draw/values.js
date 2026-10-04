// 값 카드 줄의 값 글자와 바뀔 때 밝히는 테두리. 줄의 이름은 카드 층이 그리고, 값은 시간표(timeline.values)의 변화 목록대로 글자 요소를 값마다 하나씩 두고 불투명도로 바꾼다(docs/design/playback.md 값 변화).
import { filledSlots, queueSlots } from '../measure/queue.js';
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
      if (row.slots !== undefined) return drawQueueValue(row, { item, vi }, windows);
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

// cost: time O(c·s), heap O(c·s), stack O(1)
// vars: c = 값이 바뀌는 횟수, s = 칸 수
// basis: estimate
// 큐 값 줄. 값 글자마다 그 찬 칸 수만큼 칸을 얹은 묶음을 하나씩 두고 불투명도로 바꾸며(글자와 같은 data-v, data-t), 바뀔 때는 큐 테두리를 밝힌다.
function drawQueueValue(row, { item, vi }, windows) {
  const texts = [...new Set(row.periods.map(([, , text]) => text))].map((text) => {
    const spans = row.periods.filter(([, , t]) => t === text).map(([start, end]) => [start, end]);
    return `<g class="queue-fill" opacity="0" data-v="${vi}" data-t="${escapeXml(text)}">${filledRects(item, filledSlots(text, row.slots))}${windows(spans)}</g>`;
  });
  const flash = `<rect x="${r(item.x)}" y="${r(item.y)}" width="${r(item.w)}" height="${r(item.h)}" rx="${values.radius['2xl']}" fill="none" stroke="${tokens.color.state.active}" stroke-width="${values.border.edge}" opacity="0" data-vf="${vi}">${windows(row.flashes)}</rect>`;
  return `<g class="fl-value">${flash}${texts.join('')}</g>`;
}

// cost: time O(s), heap O(s), stack O(1)
// vars: s = 칸 수
// basis: estimate
// 왼쪽부터 count칸의 찬 칸. 빈 칸의 외곽선을 같은 두께의 같은 색으로 덮는다.
function filledRects(item, count) {
  return queueSlots(item)
    .slice(0, count)
    .map((s) => `<rect x="${r(s.x)}" y="${r(s.y)}" width="${r(s.w)}" height="${r(s.h)}" rx="${values.radius.sm}" fill="${tokens.color.figure['queue-fill']}" stroke="${tokens.color.figure['queue-fill']}" stroke-width="${values.border.thin}"/>`)
    .join('');
}

// cost: time O(q·s), heap O(q·s), stack O(1)
// vars: q = 큐 수, s = 칸 수
// basis: estimate
/** 멈춘 SVG의 큐 찬 칸. 값 변화가 없는 그림이므로 처음 찬 칸 수(from)로 그린다. */
export function drawQueueStart(scene) {
  return scene.items
    .filter((it) => it.shape === 'queue')
    .map((it) => `<g class="queue-fill">${filledRects(it, filledSlots(it.from, it.slots))}</g>`)
    .join('');
}
