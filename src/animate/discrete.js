// 이산 보임 SMIL. 한 바퀴 시계에서 켜지는 시각 구간 목록을 보임 창 하나로 바꾼다. 값 글자, 큐 찬 칸, 상태 알약, 차트 글 변형, 점의 보임이 쓴다.
// 불투명도와 함께 `visibility`도 같은 키 시각으로 바꾼다. 불투명도 0인 요소는 화면에서만 사라지고 접근성 트리에는 남으므로 보이지 않는 변형은 hidden이어야 한다.
// 변형 안에 다른 변형이 들어 있거나 안쪽 요소가 visibility를 정하면 안 된다(안쪽 visible이 바깥 hidden을 이긴다).

// cost: time O(s), heap O(s), stack O(1)
// vars: s = 구간 수
// basis: estimate
/**
 * 시각 구간(ms, 시작 순서, 겹치지 않음)에서만 보이는(불투명도 1, visible) SMIL 요소. 구간 끝과 다음 구간 시작이 같은 시각이면 켜진 채로 이어진다.
 * @param clock createClock 결과
 * @param spans [시작, 끝][]
 * @param options { holdEnd }. holdEnd면 장면 끝까지 이어지는 구간은 끝에서 꺼지지 않고 한 바퀴 끝(마지막 펄스까지 보여 주는 꼬리 포함)까지 켜져 있다. 장면이 끝난 뒤에도 보이는 상태(값 글자, 상태 알약)에 쓰고, 점처럼 끝나면 사라지는 것에는 쓰지 않는다
 */
export function discreteWindows(clock, spans, { holdEnd = false } = {}) {
  const keys = [[0, 0]];
  const add = ([at, on]) => {
    const last = keys.at(-1);
    if (at === last[0]) last[1] = on;
    else keys.push([at, on]);
  };
  spans.flatMap(([start, end]) => [[clock.keyTime(start), 1], ...(holdEnd && end >= clock.total ? [] : [[clock.keyTime(end), 0]])]).forEach(add);
  // 키가 하나뿐인 이산 애니메이션은 WebKit이 적용하지 않아 속성이 정적 값에 머문다. 같은 값을 한 바퀴 끝(1)에 한 번 더 적어 키를 둘로 한다.
  if (keys.length === 1) keys.push([1, keys[0][1]]);
  const times = keys.map(([at]) => at).join(';');
  const common = `dur="${clock.duration}" ${clock.smil} calcMode="discrete" keyTimes="${times}"`;
  const hidden = `<animate attributeName="visibility" ${common} values="${keys.map(([, on]) => (on ? 'visible' : 'hidden')).join(';')}"/>`;
  return `${hidden}<animate attributeName="opacity" ${common} values="${keys.map(([, on]) => on).join(';')}"/>`;
}
