// 차트 데이터 계산: 그리기 좌표와 무관한 순수 함수. 그리기, 시간표, 시험이 같은 계산을 쓴다.
// 값이 없는 칸(`-`)은 null이고 0과 다르다. 0은 길이 0인 값이고 null은 값이 없다는 뜻이다. 어느 함수도 null을 0으로 바꾸지 않는다.
import { roundCoord as r } from '../text.js';

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 그릴 수 있는 값인가: 유한한 숫자. null(결측)과 undefined는 값이 아니다. */
export const isValue = (value) => typeof value === 'number' && Number.isFinite(value);

// cost: time O(p log p), heap O(p), stack O(1)
// vars: p = 점 수
// basis: estimate
/**
 * x 순으로 정렬한 점 가운데 계열 id의 값이 있는 점의 이어진 묶음들. 값이 null인 점에서 묶음이 끊긴다.
 * 선, 계단, 띠, 도착 시각이 모두 이 묶음을 쓴다.
 * @param points { values: { x, [id]: 숫자 | null } }[]. 정렬하지 않은 점이어도 된다
 */
export function definedRuns(points, id) {
  const runs = [];
  let run = [];
  for (const point of [...points].sort((a, b) => a.values.x - b.values.x)) {
    if (isValue(point.values[id])) run.push(point);
    else if (run.length) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length) runs.push(run);
  return runs;
}

// cost: time O(p), heap O(p), stack O(1)
// vars: p = 묶음의 점 수
// basis: estimate
/**
 * 계단(post)의 꼭짓점. 점 k의 값은 x(k)에서 x(k+1)까지 이어지므로 꼭짓점은 (x0,y0), (x1,y0), (x1,y1), (x2,y1), ...이다.
 * 묶음의 마지막 점에서 수평선을 늘이지 않는다. 다음 x의 값이 결측이면 그 구간에 값이 있다고 주장하지 않기 위해서다.
 * @param run { x, y }[] 화면 좌표의 점
 */
export function stepVertices(run) {
  return run.flatMap((point, k) => (k ? [{ x: point.x, y: run[k - 1].y }, { x: point.x, y: point.y }] : [{ x: point.x, y: point.y }]));
}

// cost: time O(v), heap O(v), stack O(1)
// vars: v = 꼭짓점 수
// basis: estimate
/** 수평으로 시작해 수평과 수직이 번갈아 가는 꼭짓점을 `M`, `H`, `V`만으로 잇는 경로. 꼭짓점이 둘보다 적으면 선분이 없어 빈 글이다. */
export function hvPath(vertices) {
  if (vertices.length < 2) return '';
  return vertices.slice(1).reduce((d, v, k) => `${d} ${k % 2 ? 'V' : 'H'} ${r(k % 2 ? v.y : v.x)}`, `M ${r(vertices[0].x)} ${r(vertices[0].y)}`);
}

// cost: time O(p), heap O(p), stack O(1)
// vars: p = 묶음의 점 수
// basis: estimate
/** 묶음들을 직선으로 잇는 경로. 묶음마다 `M`으로 다시 시작하고, 점이 하나뿐인 묶음은 선분이 없어 표식만 그린다. */
export function linePath(runs) {
  return runs
    .filter((run) => run.length > 1)
    .map((run) => run.map((point, k) => `${k ? 'L' : 'M'} ${r(point.x)} ${r(point.y)}`).join(' '))
    .join(' ');
}

// cost: time O(v), heap O(v), stack O(1)
// vars: v = 꼭짓점 수
// basis: estimate
/**
 * 꼭짓점 목록을 따라 그릴 때 꼭짓점마다 닿은 길이 비율(0~1). 묶음 사이를 건너뛰는 이동의 길이는 0이다.
 * @param lists 꼭짓점 목록(묶음)의 목록. 꼭짓점은 { x, y }다
 * @returns 목록마다 꼭짓점별 비율. 전체 길이가 0이면 모두 0이다
 */
export function lengthFractions(lists) {
  const lengths = lists.map((list) => {
    let sum = 0;
    return list.map((v, k) => (sum += k ? Math.hypot(v.x - list[k - 1].x, v.y - list[k - 1].y) : 0));
  });
  const total = lengths.reduce((sum, list) => sum + (list.at(-1) ?? 0), 0);
  let before = 0;
  return lengths.map((list) => {
    const out = list.map((length) => (total ? (before + length) / total : 0));
    before += list.at(-1) ?? 0;
    return out;
  });
}

// cost: time O(v), heap O(v), stack O(1)
// vars: v = 꼭짓점 수
// basis: estimate
/** 왼쪽에서 오른쪽으로 닦아 내며 드러낼 때 x 위치가 닿은 비율(0~1). 점선처럼 길이로 드러낼 수 없는 선이 쓴다. 모든 x가 같으면 0이다. */
export function spanFractions(lists) {
  const xs = lists.flat().map((v) => v.x);
  const [low, high] = [Math.min(...xs), Math.max(...xs)];
  return lists.map((list) => list.map((v) => (high > low ? (v.x - low) / (high - low) : 0)));
}

// cost: time O(r·s), heap O(r·s), stack O(1)
// vars: r = 행 수, s = 계열 수
// basis: estimate
/**
 * 퍼센트 누적 막대의 행별 몫. 몫은 값 ÷ 행 합 × 100이고 행 합은 그대로 더한다.
 * 행에 결측이 하나라도 있거나 합이 0이면 비율이 정의되지 않아 막대가 없다(`state`가 'missing' 또는 'zero'). 0%로 그리지 않는다.
 * 마지막으로 값이 있는 계열의 누적 끝은 정확히 100이다. 반올림한 퍼센트 글자의 합을 100으로 맞추지 않는다.
 * @throws RangeError 음수 값이 있을 때
 * @returns { state: 'ok' | 'missing' | 'zero', sum, parts: { id, value, share, from, to }[] }[]. from과 to는 0~100 위의 누적 시작과 끝이다
 */
export function percentRows(rows, ids) {
  return rows.map((row) => {
    const list = ids.map((id) => row.values[id]);
    const flat = (state, sum) => ({ state, sum, parts: ids.map((id, i) => ({ id, value: list[i], share: undefined, from: 0, to: 0 })) });
    if (list.some((value) => !isValue(value))) return flat('missing', undefined);
    if (list.some((value) => value < 0)) throw new RangeError('a percent chart takes no negative value');
    const sum = list.reduce((total, value) => total + value, 0);
    if (sum === 0) return flat('zero', 0);
    const last = list.findLastIndex((value) => value > 0);
    let at = 0;
    const parts = ids.map((id, i) => {
      const share = (list[i] / sum) * 100;
      const from = i > last ? 100 : at;
      const to = i >= last ? 100 : at + share;
      at = to;
      return { id, value: list[i], share, from, to };
    });
    return { state: 'ok', sum, parts };
  });
}

// cost: time O(r·s), heap O(r·s), stack O(1)
// vars: r = 행 수, s = 계열 수
// basis: estimate
/**
 * 부호가 있는 누적 막대의 행별 조각. 양수는 0에서 위쪽으로, 음수는 0에서 아래쪽으로 각각 계열 순서대로 쌓는다.
 * 결측이 있는 행은 막대가 없다(`state`가 'missing'). 0인 조각은 길이 0이다.
 * @returns { state: 'ok' | 'missing', total, positive, negative, parts: { id, value, from, to }[] }[]. total은 부호를 합한 값, positive와 negative는 양쪽 끝이다
 */
export function stackRows(rows, ids) {
  return rows.map((row) => {
    const list = ids.map((id) => row.values[id]);
    if (list.some((value) => !isValue(value))) return { state: 'missing', total: undefined, positive: 0, negative: 0, parts: ids.map((id, i) => ({ id, value: list[i], from: 0, to: 0 })) };
    let [positive, negative] = [0, 0];
    const parts = ids.map((id, i) => {
      const value = list[i];
      if (value >= 0) return { id, value, from: positive, to: (positive += value) };
      return { id, value, from: negative, to: (negative += value) };
    });
    return { state: 'ok', total: list.reduce((sum, value) => sum + value, 0), positive, negative, parts };
  });
}

// cost: time O(r·s), heap O(r·s), stack O(1)
// vars: r = 행 수, s = 계열 수
// basis: estimate
/** 누적 막대 값 축이 덮어야 하는 범위. 행마다 양수 합의 최댓값과 음수 합의 최솟값이고 0을 늘 포함한다. 결측 행은 세지 않는다. */
export function stackExtent(rows, ids) {
  const stacks = stackRows(rows, ids).filter((row) => row.state === 'ok');
  return { min: Math.min(0, ...stacks.map((row) => row.negative)), max: Math.max(0, ...stacks.map((row) => row.positive)) };
}

// cost: time O(n log n), heap O(n), stack O(1)
// vars: n = 표본 수
// basis: estimate
/**
 * 경험적 누적분포. 결측과 유한하지 않은 값은 빼고 센다. 오름차순으로 정렬해 같은 값을 묶고, 고유값마다 `count(≤v) / n`이다.
 * 개수는 정수로 세고 마지막에 나눈다. `[1,1,3,4]`는 (1, .5), (3, .75), (4, 1)이다.
 * @returns { n, missing, points: { value, count, p }[] }. n은 쓴 표본 수, missing은 뺀 수. n이 0이면 points가 비어 곡선이 없다
 */
export function ecdfPoints(samples) {
  const finite = samples.filter(isValue).sort((a, b) => a - b);
  const n = finite.length;
  const points = [];
  finite.forEach((value, i) => {
    if (finite[i + 1] === value) return;
    points.push({ value, count: i + 1, p: (i + 1) / n });
  });
  return { n, missing: samples.length - n, points };
}

// cost: time O(r·s), heap O(r), stack O(1)
// vars: r = 표본 수, s = 계열 수
// basis: estimate
/** 누적분포의 계열별 결과. 계열이 없으면 표본 전체가 하나다(id가 undefined). 표본이 계열에 속하는지는 행의 `series=`로 정한다. */
export function ecdfGroups(chart) {
  const ids = chart.series.length ? chart.series.map((s) => s.id) : [undefined];
  return ids.map((id) => ({ id, ...ecdfPoints(chart.rows.filter((row) => id === undefined || row.values.series === id).map((row) => row.values.value)) }));
}

// cost: time O(p), heap O(p), stack O(1)
// vars: p = 고유값 수
// basis: estimate
/**
 * 누적분포 곡선의 꼭짓점. 그림 영역 왼쪽 끝 0에서 시작해 고유값마다 수평으로 가서 수직으로 오르고, 마지막 값에서 1에 닿은 뒤 오른쪽 끝까지 이어진다.
 * 점 k의 꼭대기 꼭짓점은 `2k + 2`번이다.
 * @param at { left, right, x, y }. left와 right는 그림 영역 가로 끝, x(value)와 y(p)는 화면 좌표 함수다
 */
export function ecdfVertices(points, { left, right, x, y }) {
  if (!points.length) return [];
  const vertices = [{ x: left, y: y(0) }];
  points.forEach((point, k) => {
    vertices.push({ x: x(point.value), y: y(k ? points[k - 1].p : 0) }, { x: x(point.value), y: y(point.p) });
  });
  vertices.push({ x: right, y: y(1) });
  return vertices;
}
