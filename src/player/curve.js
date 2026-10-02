// 브라우저에서 돈다(play.js와 한 스크립트로 이어 붙는다). 점 이동 곡선(베지어)과 글 상자 미끄러짐.

const BISECT_STEPS = 30;

// ---- 이동 곡선 ----

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 베지어 곡선의 한 축 값. 매개변수 t의 제어점 a, b로 구한다.
function bezierAxis(a, b, t) {
  return 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
}

// cost: time O(STEPS), heap O(1), stack O(1)
// vars: STEPS = BISECT_STEPS
// basis: estimate
// 곡선의 한 축 값이 target이 되는 매개변수 t를 이분 탐색으로 구한다.
function solveBezier(a, b, target) {
  let [low, high] = [0, 1];
  for (let i = 0; i < BISECT_STEPS; i++) {
    const mid = (low + high) / 2;
    if (bezierAxis(a, b, mid) < target) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

// cost: time O(STEPS), heap O(1), stack O(1)
// vars: STEPS = BISECT_STEPS
// basis: estimate
// 시간 비율 p에서 이동 곡선의 진행 비율. easing.js의 timeAt과 같은 곡선을 반대 방향으로 푼다.
function progressAt([x1, y1, x2, y2], p) {
  return bezierAxis(y1, y2, solveBezier(x1, x2, p));
}

// cost: time O(STEPS), heap O(1), stack O(1)
// vars: STEPS = BISECT_STEPS
// basis: estimate
// 진행 비율 f에 닿는 시간 비율. easing.js의 timeAt과 같다.
function timeAtProgress([x1, y1, x2, y2], f) {
  return bezierAxis(x1, x2, solveBezier(y1, y2, f));
}

// cost: time O(STEPS·k), 프레임마다 O(k), heap O(k), stack O(1)
// vars: STEPS = BISECT_STEPS, k = 경로 지점 수(21)
// basis: estimate
// 글 상자 옮김. 빌드 때 시간표에 담은 경로 지점별 옮김 [진행 비율, dx, dy]를 움직이는 SVG의 옮김 움직임(SMIL, 지점이 점에 닿는 시각 사이를 선형)과 같게 시간 비율 p에서 보간한다.
function chipSlide(hop, metrics) {
  const path = hop.chipPath ?? [];
  const times = path.map(([at]) => timeAtProgress(metrics.move, at));
  return (p) => {
    if (!path.length) return '0 0';
    const k = times.findLastIndex((time) => time <= p);
    if (k < 0) return `${path[0][1]} ${path[0][2]}`;
    if (k === path.length - 1) return `${path[k][1]} ${path[k][2]}`;
    const ratio = times[k + 1] > times[k] ? (p - times[k]) / (times[k + 1] - times[k]) : 1;
    return `${path[k][1] + (path[k + 1][1] - path[k][1]) * ratio} ${path[k][2] + (path[k + 1][2] - path[k][2]) * ratio}`;
  };
}
