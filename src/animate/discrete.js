// 이산 불투명도 SMIL. 한 바퀴 시계에서 켜지는 시각 구간 목록을 보임 창 하나로 바꾼다. 값 글자와 값 줄 밝힘이 쓴다.

// cost: time O(s), heap O(s), stack O(1)
// vars: s = 구간 수
// basis: estimate
/**
 * 시각 구간(ms, 시작 순서, 겹치지 않음)에서만 불투명도 1인 SMIL 요소. 구간 끝과 다음 구간 시작이 같은 시각이면 켜진 채로 이어진다.
 * @param clock createClock 결과
 * @param spans [시작, 끝][]
 */
export function discreteWindows(clock, spans) {
  const keys = [[0, 0]];
  const add = ([at, on]) => {
    const last = keys.at(-1);
    if (at === last[0]) last[1] = on;
    else keys.push([at, on]);
  };
  spans.flatMap(([start, end]) => [[clock.keyTime(start), 1], [clock.keyTime(end), 0]]).forEach(add);
  return `<animate attributeName="opacity" dur="${clock.duration}" repeatCount="indefinite" calcMode="discrete" keyTimes="${keys.map(([at]) => at).join(';')}" values="${keys.map(([, on]) => on).join(';')}"/>`;
}
