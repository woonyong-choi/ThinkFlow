// 흐름(track)의 점에만 있는 움직임: 도형 안에서 숨는 보임 구간, 단계 끝에서 잘리는 점의 사라짐과 이동, 다른 점의 글 상자와 겹칠 때 숨는 글 상자.
// 시간표가 한 번 계산한 값(hop.gaps, hop.cut, hop.chipFade)을 SMIL로 옮기기만 한다.
import { arrivalOffsetMs, MOVE, positionAt, timeAt } from '../easing.js';
import { ratio } from '../format.js';
import { values } from '../tokens.js';

const CUT_FADE_MS = values.duration['cut-fade'];
// 잘리는 점의 이동을 이동 곡선에서 재는 지점 수. 잘린 점은 곡선 일부만 지나 SMIL 곡선 하나로 그릴 수 없어 선형 구간으로 잇는다.
const CUT_SAMPLES = 24;
// 구간별 이동 시간(pace)이 있는 이동에서 구간 경계 사이를 재는 지점 수. 구간 안에서는 길이 비율이 이동 곡선을 따라 휘므로 경계 사이마다 이만큼 잰다.
const PACE_SAMPLES = 16;

// cost: time O(g), heap O(g), stack O(1)
// vars: g = 도형 안을 지나는 구간 수
// basis: estimate
/** 흐름의 점이 보이는 시각 구간(ms). 도형 안을 지나는 구간(경로 길이 비율 gaps)에서는 도착 연결점에서 사라져 출발 연결점에서 다시 나타난다. 그 구간의 시간은 그대로 흐른다. 잘리는 점은 단계 끝(cut)까지만 보인다. */
export function visibleSpans(start, hop) {
  const end = start + (hop.cut ?? hop.ms);
  const at = (fraction) => Math.min(end, start + arrivalOffsetMs(fraction, hop.ms, hop.pace));
  const edges = [start, ...hop.gaps.flatMap(([from, to]) => [at(from), at(to)]), end];
  return edges.reduce((spans, time, i) => (i % 2 === 0 && time < edges[i + 1] ? [...spans, [time, edges[i + 1]]] : spans), []);
}

// cost: time O(k), heap O(k), stack O(1)
// vars: k = 키 수
// basis: estimate
/** 글 상자 숨김 불투명도 SMIL. hop.chipFade(이동 시작 뒤 ms, 값) 키를 그림 전체 시계로 옮긴다. 시계 시각이 늘어나고 한 바퀴(1) 안인 키만 남기고 끝은 마지막 값으로 이어 한 바퀴를 채운다. */
export function chipFadeAnimate(clock, start, keys) {
  const timed = keys.map(([at, shown]) => [clock.keyTime(start + at), shown]).filter(([time], i, all) => i === 0 || (time > all[i - 1][0] && time <= 1));
  const full = [...(timed[0][0] > 0 ? [[0, timed[0][1]]] : []), ...timed, ...(timed.at(-1)[0] < 1 ? [[1, timed.at(-1)[1]]] : [])];
  return `<animate attributeName="opacity" dur="${clock.duration}" repeatCount="indefinite" calcMode="linear" keyTimes="${full.map(([at]) => at).join(';')}" values="${full.map(([, shown]) => ratio(shown)).join(';')}"/>`;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 단계 끝에서 잘리는 점의 사라짐. 바깥 `<g>`의 불투명도를 끝(cut) 앞 CUT_FADE_MS 동안 1에서 0으로 줄이고 한 바퀴 처음에 1로 돌아온다. */
export function cutFadeAnimate(clock, start, hop) {
  const end = start + hop.cut;
  const keys = [[0, 1], [clock.keyTime(end - CUT_FADE_MS), 1], [clock.keyTime(end), 0], [1, 0]].filter(([time], i, all) => i === 0 || time > all[i - 1][0]);
  return `<animate attributeName="opacity" dur="${clock.duration}" repeatCount="indefinite" calcMode="linear" keyTimes="${keys.map(([at]) => at).join(';')}" values="${keys.map(([, shown]) => shown).join(';')}"/>`;
}

// cost: time O(l·PACE_SAMPLES), heap O(l·PACE_SAMPLES), stack O(1)
// vars: l = 구간 수, PACE_SAMPLES = 구간 경계 사이를 재는 지점 수
// basis: estimate
// 구간별 이동 시간이 있는 이동에서 재는 시각(이동 시작 뒤 ms). 구간 경계(꺾은선 꼭짓점이 이동 곡선에서 닿는 시각)와 그 사이 지점, 끝이다.
function paceSamples(hop, end) {
  const edges = [0, ...hop.pace.slice(1, -1).map(([progress]) => timeAt(MOVE, progress) * hop.ms).filter((t) => t > 0 && t < end), end];
  return [...edges.slice(0, -1).flatMap((from, i) => Array.from({ length: PACE_SAMPLES }, (_, k) => from + ((edges[i + 1] - from) * k) / PACE_SAMPLES)), end];
}

// cost: time O(CUT_SAMPLES), heap O(CUT_SAMPLES), stack O(1)
// basis: estimate
/**
 * 곡선 하나로 그릴 수 없는 이동(단계 끝이나 사라짐으로 잘리는 점, 구간별 이동 시간이 있는 점)의 이동 키: [시계 시각, 길 위 비율]. 이동 시작과 끝(cut이 없으면 이동 시간) 사이를 이동 곡선에서 잰 지점으로 선형으로 잇는다.
 * 구간별 이동 시간(hop.pace)이 있으면 구간 경계의 시각을 지점에 넣고 경계 사이마다 PACE_SAMPLES개를 잰다.
 */
export function cutMotionKeys(clock, start, hop) {
  const end = hop.cut ?? hop.ms;
  const points = (hop.pace ? paceSamples(hop, end) : Array.from({ length: CUT_SAMPLES + 1 }, (_, i) => (end * i) / CUT_SAMPLES)).map((local) => [clock.keyTime(start + local), positionAt(local / hop.ms, hop.pace)]);
  const keys = [[0, 0], ...points, [1, points.at(-1)[1]]];
  return keys.filter(([time], i) => i === 0 || time > keys[i - 1][0]);
}
