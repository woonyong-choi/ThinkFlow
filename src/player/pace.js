// 브라우저에서 돈다(play.js와 한 스크립트로 이어 붙는다). 구간별 이동 시간(hop.pace)을 쓰는 그림에만 뒤에 붙는다(html.js).
// 점의 위치와 글 상자가 지점에 닿는 시각을 이동 곡선 뒤에 구간 꺾은선(pace)을 한 번 더 걸어 읽는다. 시간표가 정한 꺾은선을 읽기만 하고 다시 계산하지 않는다.
// 앞 파일의 함수를 감싸므로 pace가 없는 이동은 앞 파일 그대로 돈다.

// cost: time O(l), heap O(1), stack O(1)
// vars: l = 구간 수
// basis: estimate
// 꺾은선 pace(`[시간 비율, 길이 비율]` 목록)에서 이동 곡선을 건 진행 비율 progress의 경로 길이 비율. src/easing.js의 paceLength와 같다.
function paceLength(pace, progress) {
  const k = Math.min(pace.length - 2, Math.max(0, pace.findLastIndex(([at]) => at <= progress)));
  const [[t0, l0], [t1, l1]] = [pace[k], pace[k + 1]];
  return t1 > t0 ? l0 + ((l1 - l0) * (Math.min(1, Math.max(0, progress)) - t0)) / (t1 - t0) : l1;
}

// cost: time O(l), heap O(1), stack O(1)
// vars: l = 구간 수
// basis: estimate
// paceLength의 반대. 경로 길이 비율 length에 닿는 진행 비율. src/easing.js의 paceProgress와 같다.
function paceProgress(pace, length) {
  const reached = pace.findIndex(([, l]) => l >= length);
  const k = reached < 0 ? pace.length - 2 : Math.max(0, reached - 1);
  const [[t0, l0], [t1, l1]] = [pace[k], pace[k + 1]];
  return l1 > l0 ? t0 + ((t1 - t0) * (Math.min(1, Math.max(0, length)) - l0)) / (l1 - l0) : t0;
}

// 이동 곡선 배열(metrics.move)에 pace를 실어 보내면 곡선을 푸는 두 함수가 pace를 거친다. 점은 길이 비율로 놓이고(progressAt), 글 상자 지점의 시각은 그 반대로 풀린다(timeAtProgress).
{
  const [progressBase, timeAtBase, packetBase] = [progressAt, timeAtProgress, createPacket];
  progressAt = (curve, p) => (curve.pace ? paceLength(curve.pace, progressBase(curve, p)) : progressBase(curve, p));
  timeAtProgress = (curve, f) => timeAtBase(curve, curve.pace ? paceProgress(curve.pace, f) : f);
  createPacket = (hop, stage) => packetBase(hop, hop.pace ? { ...stage, metrics: { ...stage.metrics, move: Object.assign([...stage.metrics.move], { pace: hop.pace }) } } : stage);
}
