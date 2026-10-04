// 점 하나가 한 박자 동안 선을 건너고, 실어 보내는 글은 점 위의 상자로 따라간다.
// 점의 보임과 이동과 글 상자 옮김과 흐려짐은 모두 SMIL이라 한 시계로 돈다. 보임을 CSS에 두면 시계 둘이 따로 반복해, 한 바퀴가 돌아올 때 점이 끝 지점에 잠깐 보였다가 시작 지점으로 뛴다.
import { CHIP_GAP, sizeChip } from '../chip.js';
import { curveOf, keySpline, timeAt } from '../easing.js';
import { discreteWindows } from './discrete.js';
import { chipFadeAnimate, cutFadeAnimate, cutMotionKeys, visibleSpans } from './flow-packet.js';
import { STYLE } from '../measure/sizes.js';
import { renderRich, roundCoord as r } from '../text.js';
import { tokens, values } from '../tokens.js';

// 점이 선을 지나는 곡선. HTML 재생기와 같다
const MOVE = curveOf('move');
const MOVE_SPLINE = keySpline(MOVE);
const LINEAR = '0 0 1 1';

// cost: time O(k), heap O(out), stack O(1)
// vars: k = 재는 지점 수(21), out = 만든 SVG 글자 수
// basis: estimate
/**
 * 점 요소 하나. 후광, 점, 글 상자와 SMIL 움직임(보임, 이동, 글 상자 옮김과 흐려짐)을 담는다.
 * @param clock createClock 결과
 * @param move { seg, hop, name }. 박자, 그 박자의 이동, class 이름. 흐름의 점은 hop.at(박자 시작 뒤 출발 ms)에 출발하고 hop.track이 있으면 이어 붙인 길(`tp-번호`)을 따르며, hop.tone이 있으면 그 갈래색이다
 * @param glyphs 쓴 글자를 모으는 그릇
 */
export function drawPacket(clock, { seg, hop, name }, glyphs) {
  const start = seg.t0 + (hop.at ?? 0);
  // 단계 끝에서 잘리는 점(cut)은 끝에서 숨고, 나머지는 이동이 끝나면 숨는다.
  const [from, to] = [clock.keyTime(start), clock.keyTime(start + (hop.cut ?? hop.ms))];
  const color = hop.tone ? tokens.color.flow[hop.tone] : tokens.color.state.active;
  const chip = hop.data ? drawChip(hop.data, { glyphs, color: hop.tone ? color : undefined }) + pushChip(clock, start, hop) : '';
  const chipMarkup = hop.chipFade ? `<g>${chipFadeAnimate(clock, start, hop.chipFade)}<g>${chip}</g></g>` : `<g>${chip}</g>`;
  const body =
    `<g class="${name}" opacity="0"><circle r="${values.size.packet.halo}" fill="${color}" opacity="${values.opacity.halo}"/><circle r="${values.size.packet.radius}" fill="${color}"/>${chip ? chipMarkup : ''}` +
    (hop.gaps?.length ? discreteWindows(clock, visibleSpans(start, hop)) : showWindow(clock, from, to)) +
    moveMotion(clock, [from, to], { hop, start }) +
    `</g>`;
  return hop.cut === undefined ? body : `<g>${cutFadeAnimate(clock, start, hop)}${body}</g>`;
}

// cost: time O(l·n), heap O(out), stack O(1)
// vars: l = 줄 수, n = 글자 수, out = 만든 SVG 글자 수
// basis: estimate
// 점 위에 뜨는 글 상자. 줄은 시간표가 이미 나눴다. tone 색이 있는 점은 면과 테두리가 그 색이다.
function drawChip(lines, { glyphs, color }) {
  for (const line of lines) glyphs.add(line, STYLE.chip.face);
  const { w, h } = sizeChip(lines);
  const top = -h - CHIP_GAP;
  return (
    `<rect x="${r(-w / 2)}" y="${r(top)}" width="${r(w)}" height="${r(h)}" rx="${values.radius.lg}" fill="${color ?? tokens.color.state['active-fill']}"${color ? ` stroke="${color}" stroke-width="${values.border.edge}"` : ''}/>` +
    lines.map((line, li) => `<text x="0" y="${r(top + STYLE.chip.line * (li + 1))}" class="chip">${renderRich(line)}</text>`).join('')
  );
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 보임 창. 이산 값이라 구간 끝에서 바로 바뀌고, 시작과 끝이 0이나 1이면 겹치는 keyTime을 만들지 않는다.
function showWindow(clock, from, to) {
  const keys = [[0, 0], [from, 1], [to, 0]].filter(([at], i, all) => i === 0 || at > all[i - 1][0]);
  if (from === 0) keys.splice(0, 1, [0, 1]);
  return `<animate attributeName="opacity" dur="${clock.duration}" repeatCount="indefinite" calcMode="discrete" keyTimes="${keys.map(([at]) => at).join(';')}" values="${keys.map(([, on]) => on).join(';')}"/>`;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 선을 따라 이동. 이동 전과 후에는 선의 시작과 끝에 머물고, 이동 구간만 이동 곡선을 쓴다. keyTimes는 줄지 않는다.
function moveMotion(clock, [from, to], { hop, start: departure }) {
  const [start, end] = hop.isBack ? [1, 0] : [0, 1];
  const pathId = hop.track === undefined ? `p-${hop.edge}` : `tp-${hop.track}`;
  if (hop.cut !== undefined) return linearMotion(clock, pathId, cutMotionKeys(clock, departure, hop));
  const keys = [[0, start, LINEAR], [from, start, MOVE_SPLINE], [to, end, LINEAR], [1, end]].filter(([at], i, all) => i === 0 || at > all[i - 1][0]);
  // 앞 키가 같은 시각이라 지워졌으면 이동 구간의 곡선이 첫 키로 옮겨 가야 한다.
  if (from === 0) keys[0][2] = MOVE_SPLINE;
  const last = keys.length - 1;
  const splines = keys.slice(0, last).map(([, , spline]) => spline);
  return (
    `<animateMotion dur="${clock.duration}" repeatCount="indefinite" calcMode="spline" keyTimes="${keys.map(([at]) => at).join(';')}" keySplines="${splines.join(';')}" keyPoints="${keys.map(([, point]) => point).join(';')}">` +
    `<mpath href="#${pathId}" xlink:href="#${pathId}"/></animateMotion>`
  );
}

// cost: time O(k), heap O(k), stack O(1)
// vars: k = 키 수
// basis: estimate
// 키 사이를 선형으로 잇는 이동(단계 끝에서 잘리는 점). 곡선 일부만 지나서 곡선 하나로 그릴 수 없다.
function linearMotion(clock, pathId, keys) {
  return (
    `<animateMotion dur="${clock.duration}" repeatCount="indefinite" calcMode="linear" keyTimes="${keys.map(([at]) => at).join(';')}" keyPoints="${keys.map(([, point]) => point).join(';')}">` +
    `<mpath href="#${pathId}" xlink:href="#${pathId}"/></animateMotion>`
  );
}

// cost: time O(k), heap O(k), stack O(1)
// vars: k = 경로 지점 수
// basis: estimate
// 글 상자가 점 위 기본 자리에서 벗어나거나 흐려지는 선이면, 시간표가 정해 둔 경로 지점별 옮김과 불투명도를 SMIL로 건다. 점이 그 지점에 닿는 시각은 이동 곡선을 거꾸로 풀어 구한다.
function pushChip(clock, start, hop) {
  const path = hop.chipPath;
  const at = (f) => clock.keyTime(start + timeAt(MOVE, f) * hop.ms);
  const keys = [[0, path[0]], ...path.map((p) => [at(p[0]), p]), [1, path.at(-1)]].filter(([time], i, all) => i === 0 || (time > all[i - 1][0] && time <= 1));
  const keyTimes = keys.map(([time]) => time).join(';');
  const moves = path.some(([, dx, dy]) => dx !== 0 || dy !== 0) ? animateOf(clock, { name: 'transform', type: 'translate' }, { keyTimes, values: keys.map(([, [, dx, dy]]) => `${r(dx)} ${r(dy)}`) }) : '';
  const fades = path.some(([, , , opacity]) => opacity !== 1) ? animateOf(clock, { name: 'opacity' }, { keyTimes, values: keys.map(([, p]) => r(p[3])) }) : '';
  return moves + fades;
}

// cost: time O(k), heap O(k), stack O(1)
// vars: k = 경로 지점 수
// basis: estimate
// 지점 사이를 시간에 선형으로 잇는 SMIL 값 하나. 글 상자 옮김(transform)과 흐려짐(opacity)이 같은 키 시각을 쓴다.
function animateOf(clock, { name, type }, { keyTimes, values: levels }) {
  const tag = type ? 'animateTransform' : 'animate';
  return `<${tag} attributeName="${name}"${type ? ` type="${type}"` : ''} dur="${clock.duration}" repeatCount="indefinite" calcMode="linear" keyTimes="${keyTimes}" values="${levels.join(';')}"/>`;
}
