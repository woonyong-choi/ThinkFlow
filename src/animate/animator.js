// 박자별 상태를 CSS keyframes class와 SMIL 점으로 바꾼다. 시계, 켜짐 keyframes, 점, 차트는 이 폴더의 파일이 나눠 맡는다.
import { chartSeriesIds, litIds } from '../timeline.js';
import { tokens } from '../tokens.js';
import { animateChart } from './chart.js';
import { drawValues } from '../draw/values.js';
import { createClock } from './clock.js';
import { discreteWindows } from './discrete.js';
import { drawPacket } from './packet.js';
import { createWindows } from './windows.js';

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/**
 * 움직이는 SVG의 움직임 만들기. 한 바퀴 시계 하나를 모든 요소가 나눠 쓴다.
 * @param timeline 시간표({ segs, total, growMs })
 * @returns { css, decorate, packet, windows, chart, values }. values(scene, timeline, glyphs)는 값 글자와 밝힘 테두리 요소다. decorate(scene)은 (kind, i, extra)로 요소의 켜짐 class를 돌려주는 함수를 만든다
 */
export function createAnimator({ segs, total, growMs }) {
  const clock = createClock(total);
  const css = [];
  const { windows, fadeFrames } = createWindows(clock, segs, css);
  const motion = {
    segs,
    toggle: (states, on, off) => windows(states, { on, off }),
    lit: (j) => segs.map((s) => timed(s.edgesAt?.[j], s.edgesOn.includes(j))),
    litNode: (id, scene) => segs.map((s) => timed(s.nodesAt?.[id], litIds(s, scene.edges).has(id))),
    cardState: (n, test) => segs.map((s) => ({ before: test(s.cardsBefore[n]), after: test(s.cards[n]), at: s.cardsAt[n] ?? 0 })),
  };
  const decorate = (scene) => (kind, i, extra) => decorateElement(kind, { id: (kind === 'group' ? scene?.groups[i] : scene?.items[i])?.id, i, extra, scene }, motion);
  const chart = (figure, drawn) => animateChart({ clock, segs, growMs, css, windows, fadeFrames }, chartSeriesIds(figure), drawn);
  const packet = (move, glyphs) => drawPacket(clock, move, glyphs);
  const valueRows = (scene, timeline, glyphs) => drawValues(scene, timeline, { glyphs, windows: (spans) => discreteWindows(clock, spans) });
  return { css, decorate, packet, windows, chart, values: valueRows };
}

// 켜지는 시각이 구간 안에 있는 요소(흐름 단계의 선과 도형)는 그 시각에 꺼짐에서 켜짐으로 바뀐다. 구간 처음부터 켜진 것은 그대로다.
const timed = (at, isOn) => (isOn || at === undefined ? isOn : { before: false, after: true, at });

// 선 양끝 화살촉 스타일. head는 선의 `head=` 값이다(없으면 끝에만).
function arrowheads(head, marker) {
  const end = head === 'none' ? '' : `; marker-end: url(#${marker})`;
  return `${head === 'both' ? `; marker-start: url(#${marker})` : ''}${end}`;
}

// cost: time O(b), heap O(b), stack O(1)
// vars: b = 박자 수
// basis: estimate
// 요소 종류별 켜짐과 꺼짐 스타일. target은 { id, i, extra, scene }(i는 요소 번호, extra는 열 이름이나 카드 층)다.
function decorateElement(kind, { id, i, extra, scene }, { segs, toggle, lit, litNode, cardState }) {
  const c = tokens.color;
  switch (kind) {
    case 'node':
    case 'group': {
      // 아이콘이 있는 그룹의 틀은 꺼졌을 때 아이콘 파랑이다(탭과 같은 색).
      const off = kind === 'group' && scene.groups?.[i]?.iconData ? c.figure.icon : c.border;
      return toggle(litNode(id, scene), `stroke: ${c.state.active}; stroke-width: ${tokens.border.strong}`, `stroke: ${off}; stroke-width: ${tokens.border.thin}`);
    }
    case 'cell':
      return toggle(segs.map((s) => s.partsOn.includes(extra)), `fill: ${c['card-on']}; stroke: ${c.state.active}; stroke-width: ${tokens.border.edge}`, `fill: ${c.node}; stroke: ${c.border}; stroke-width: ${tokens.border.thin}`);
    case 'part':
      return toggle(segs.map((s) => s.partsOn.includes(extra)), `fill: ${c['card-on']}`, 'fill: transparent');
    case 'edge':
      return toggle(lit(i), `stroke: ${c.state.active}; stroke-width: ${tokens.border.strong}${arrowheads(scene?.edges[i]?.head, 'fl-arrow-on')}`, `stroke: ${c.muted}; stroke-width: ${tokens.border.edge}${arrowheads(scene?.edges[i]?.head, 'fl-arrow')}`);
    case 'pill':
      return toggle(lit(i), `fill: ${c.state['active-fill']}; stroke: ${c.state['active-fill']}`, `fill: ${c.bg}; stroke: ${c.border}`);
    case 'pilltext':
      return toggle(lit(i), `fill: ${c.state['on-active']}`, `fill: ${c.muted}`);
    case 'quiet':
      return toggle(lit(i), 'opacity: 1', 'opacity: 0');
    case 'card':
      return toggle(cardState(id, (v) => v !== undefined), `stroke: ${c.state.active}; fill: ${c['card-on']}`, `stroke: ${c.border}; fill: ${c.surface}`);
    case 'layer':
      return toggle(cardState(id, (v) => v === extra), 'opacity: 1', 'opacity: 0');
    default:
      return '';
  }
}
