// 브라우저 글 상자 보간. 이동 수학은 player-script.js가 motion-math.js의 함수 원문으로 넣는다.

// cost: time O(STEPS·k), 프레임마다 O(k), heap O(k), stack O(1)
// vars: STEPS = 공통 이동 수학의 이분 탐색 횟수, k = 경로 지점 수
// basis: estimate
// 글 상자 옮김과 불투명도. 빌드 때 시간표에 담은 경로 지점별 [진행 비율, dx, dy, opacity]를 움직이는 SVG의 SMIL(지점이 점에 닿는 시각 사이를 선형)과 같게 시간 비율 p에서 보간한다. [dx, dy, opacity]를 돌려준다.
function chipSlide(hop, metrics) {
  const path = hop.chipPath ?? [];
  const times = path.map(([at]) => timeAtProgress(metrics.move, at, hop.pace));
  return (p) => {
    if (!path.length) return [0, 0, 1];
    const k = times.findLastIndex((time) => time <= p);
    if (k < 0) return path[0].slice(1);
    if (k === path.length - 1) return path[k].slice(1);
    const ratio = times[k + 1] > times[k] ? (p - times[k]) / (times[k + 1] - times[k]) : 1;
    return [1, 2, 3].map((i) => path[k][i] + (path[k + 1][i] - path[k][i]) * ratio);
  };
}

// cost: time O(k), heap O(1), stack O(1)
// vars: k = 키 수
// basis: estimate
// 이동 시작 뒤 t(ms)의 글 상자 숨김 불투명도. 시간표가 한 번 계산한 키 [시각, 값]을 시간에 선형으로 읽기만 한다(src/chip-clash.js의 fadeAt과 같은 값이다). 키가 없으면 1이다.
function chipFadeAt(keys, t) {
  if (!keys?.length) return 1;
  const k = keys.findLastIndex(([at]) => at <= t);
  if (k < 0) return keys[0][1];
  if (k === keys.length - 1) return keys[k][1];
  const [[a, va], [b, vb]] = [keys[k], keys[k + 1]];
  return va + ((vb - va) * (t - a)) / (b - a);
}
