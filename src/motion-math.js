// 빌드와 단일 HTML 재생기가 공유하는 순수 이동 수학. 함수 원문을 HTML에 넣으므로 바깥 모듈 값을 참조하지 않는다.
// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
export function motionMath() {
  const STEPS = 30;
  function axis(a, b, t) {
    return 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  }

  // cost: time O(STEPS), heap O(1), stack O(1)
  // vars: STEPS = 이분 탐색 횟수
  // basis: estimate
  function solve(a, b, target) {
    let [low, high] = [0, 1];
    for (let i = 0; i < STEPS; i++) {
      const mid = (low + high) / 2;
      if (axis(a, b, mid) < target) low = mid;
      else high = mid;
    }
    return (low + high) / 2;
  }

  // cost: time O(l), heap O(1), stack O(1)
  // vars: l = 구간 수
  // basis: estimate
  /** 구간별 이동 시간의 꺾은선 pace(`[시간 비율, 길이 비율]` 목록)에서 이동 곡선을 건 진행 비율 progress의 경로 길이 비율. pace가 없으면 progress 그대로다. */
  function paceLength(pace, progress) {
    if (!pace) return progress;
    const k = Math.min(pace.length - 2, Math.max(0, pace.findLastIndex(([at]) => at <= progress)));
    const [[t0, l0], [t1, l1]] = [pace[k], pace[k + 1]];
    return t1 > t0 ? l0 + ((l1 - l0) * (Math.min(1, Math.max(0, progress)) - t0)) / (t1 - t0) : l1;
  }

  // cost: time O(l), heap O(1), stack O(1)
  // vars: l = 구간 수
  // basis: estimate
  /** paceLength의 반대. 경로 길이 비율 length에 닿는 진행 비율. 길이가 늘지 않는 구간은 구간이 시작하는 진행 비율이다. pace가 없으면 length 그대로다. */
  function paceProgress(pace, length) {
    if (!pace) return length;
    const reached = pace.findIndex(([, l]) => l >= length);
    const k = reached < 0 ? pace.length - 2 : Math.max(0, reached - 1);
    const [[t0, l0], [t1, l1]] = [pace[k], pace[k + 1]];
    return l1 > l0 ? t0 + ((t1 - t0) * (Math.min(1, Math.max(0, length)) - l0)) / (l1 - l0) : t0;
  }

  // cost: time O(STEPS + l), heap O(1), stack O(1)
  // vars: STEPS = 이분 탐색 횟수, l = pace 구간 수
  // basis: estimate
  function progressAt([x1, y1, x2, y2], time, pace) {
    return paceLength(pace, axis(y1, y2, solve(x1, x2, time)));
  }

  // cost: time O(STEPS + l), heap O(1), stack O(1)
  // vars: STEPS = 이분 탐색 횟수, l = pace 구간 수
  // basis: estimate
  function timeAt([x1, y1, x2, y2], progress, pace) {
    return axis(x1, x2, solve(y1, y2, paceProgress(pace, progress)));
  }

  return { progressAt, timeAt, paceLength, paceProgress };
}
