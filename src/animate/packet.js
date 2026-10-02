// 점 하나가 한 박자 동안 선을 건너고, 실어 보내는 글은 점 위의 상자로 따라간다.
// 점의 보임과 이동과 글 상자 밀어 넣기는 모두 SMIL이라 한 시계로 돈다. 보임을 CSS에 두면 시계 둘이 따로 반복해, 한 바퀴가 돌아올 때 점이 끝 지점에 잠깐 보였다가 시작 지점으로 뛴다.
import { CHIP_GAP, sizeChip } from '../chip.js';
import { curveOf, keySpline, timeAt } from '../easing.js';
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
 * 점 요소 하나. 후광, 점, 글 상자와 SMIL 움직임 셋(보임, 이동, 글 상자 밀어 넣기)을 담는다.
 * @param clock createClock 결과
 * @param move { seg, hop, name }. 박자, 그 박자의 이동, class 이름
 * @param glyphs 쓴 글자를 모으는 그릇
 */
export function drawPacket(clock, { seg, hop, name }, glyphs) {
  const [from, to] = [clock.keyTime(seg.t0), clock.keyTime(seg.t0 + hop.ms)];
  const chip = hop.data ? drawChip(hop.data, glyphs) + pushChip(clock, seg, hop) : '';
  return (
    `<g class="${name}" opacity="0"><circle r="${values.size.halo}" fill="${tokens.color.state.active}" opacity="${values.opacity.halo}"/><circle r="${values.size.packet}" fill="${tokens.color.state.active}"/>${chip ? `<g>${chip}</g>` : ''}` +
    showWindow(clock, from, to) +
    moveMotion(clock, [from, to], hop) +
    `</g>`
  );
}

// cost: time O(l·n), heap O(out), stack O(1)
// vars: l = 줄 수, n = 글자 수, out = 만든 SVG 글자 수
// basis: estimate
// 점 위에 뜨는 글 상자. 줄은 시간표가 이미 나눴다.
function drawChip(lines, glyphs) {
  for (const line of lines) glyphs.add(line, STYLE.chip.face);
  const { w, h } = sizeChip(lines);
  const top = -h - CHIP_GAP;
  return (
    `<rect x="${r(-w / 2)}" y="${r(top)}" width="${r(w)}" height="${r(h)}" rx="${values.radius.lg}" fill="${tokens.color.state['active-fill']}"/>` +
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
function moveMotion(clock, [from, to], hop) {
  const [start, end] = hop.isBack ? [1, 0] : [0, 1];
  const keys = [[0, start, LINEAR], [from, start, MOVE_SPLINE], [to, end, LINEAR], [1, end]].filter(([at], i, all) => i === 0 || at > all[i - 1][0]);
  // 앞 키가 같은 시각이라 지워졌으면 이동 구간의 곡선이 첫 키로 옮겨 가야 한다.
  if (from === 0) keys[0][2] = MOVE_SPLINE;
  const last = keys.length - 1;
  const splines = keys.slice(0, last).map(([, , spline]) => spline);
  return (
    `<animateMotion dur="${clock.duration}" repeatCount="indefinite" calcMode="spline" keyTimes="${keys.map(([at]) => at).join(';')}" keySplines="${splines.join(';')}" keyPoints="${keys.map(([, point]) => point).join(';')}">` +
    `<mpath href="#p-${hop.edge}" xlink:href="#p-${hop.edge}"/></animateMotion>`
  );
}

// cost: time O(k), heap O(k), stack O(1)
// vars: k = 재는 지점 수(21)
// basis: estimate
// 글 상자가 점 위 기본 자리에서 벗어나는 선이면(그림 밖으로 나가거나 도형 이름을 피할 때), 시간표가 정해 둔 경로 지점별 옮김을 옮김 움직임으로 건다. 점이 그 지점에 닿는 시각은 이동 곡선을 거꾸로 풀어 구한다.
function pushChip(clock, seg, hop) {
  const path = hop.chipPath;
  if (path.every(([, dx, dy]) => dx === 0 && dy === 0)) return '';
  const at = (f) => clock.keyTime(seg.t0 + timeAt(MOVE, f) * hop.ms);
  const keys = [[0, path[0]], ...path.map((p) => [at(p[0]), p]), [1, path.at(-1)]].filter(([time, p], i, all) => i === 0 || time > all[i - 1][0] || (time === all[i - 1][0] && !isSameOffset(p, all[i - 1][1])));
  const moves = keys.map(([, [, dx, dy]]) => `${r(dx)} ${r(dy)}`);
  return `<animateTransform attributeName="transform" type="translate" dur="${clock.duration}" repeatCount="indefinite" calcMode="linear" keyTimes="${keys.map(([time]) => time).join(';')}" values="${moves.join(';')}"/>`;
}

// 두 경로 지점의 옮김이 같은지
function isSameOffset(a, b) {
  return a[1] === b[1] && a[2] === b[2];
}
