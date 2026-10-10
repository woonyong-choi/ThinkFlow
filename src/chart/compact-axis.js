// 좁은 그림의 가로축: 양 끝 눈금을 유지하고 중간 눈금은 글자 폭에 맞춰 표시한다.
import { measure, wrap } from '../measure/fonts.js';
import { renderRich, roundCoord as r } from '../text.js';
import { SPACE, TEXT } from './metrics.js';

// cost: time O(t), heap O(1), stack O(1)
// vars: t = 눈금 수
// basis: estimate
// 눈금 목록의 이웃 글자 사이에 한 칸이 남는지 본다.
function fits(list) {
  return list.every((tick, i) => i === 0 || list[i - 1].x + list[i - 1].width / 2 + SPACE["3"] <= tick.x - tick.width / 2);
}

// cost: time O(t·d + n²), heap O(t + n), stack O(1)
// vars: t = 눈금 수, d = t-1의 약수 수(t 이하), n = 축 제목 글자 수
// basis: estimate
export function compactAxis(scale, y, title) {
  const size = TEXT['11'];
  const lineHeight = size + SPACE["3"];
  const ticks = scale.ticks.map((value, i) => ({ x: scale.at(value), label: scale.labels[i], width: measure(scale.labels[i], size, 'num') }));
  const first = ticks[0], last = ticks.at(-1);
  const start = first.x, end = last.x;
  // 첫 글자는 눈금에서 시작해 세로 축 맨 아래 글자와 모서리에서 닿지 않게 하고, 나머지는 눈금 가운데에 둔다. 마지막 글자의 오른쪽 절반은 축 길이를 잴 때 이미 비워 둔다.
  first.x += first.width / 2;
  // 양 끝을 지키며 같은 걸음으로 건너뛴 눈금 중 가장 촘촘히 들어가는 것을 쓴다. 눈금 수가 달라도 간격이 고르다.
  const stride = Array.from({ length: ticks.length - 1 }, (_, i) => i + 1).find((k) => (ticks.length - 1) % k === 0 && fits(ticks.filter((_, i) => i % k === 0)));
  const stagger = stride === undefined;
  const baseline = y + size + SPACE["1-5"];
  const visible = stagger ? [first, last] : ticks.filter((_, i) => i % stride === 0);
  const parts = visible.map((tick) => `<text x="${r(tick.x)}" y="${r(baseline + (stagger && tick === last ? lineHeight : 0))}" class="chart-tick">${tick.label}</text>`);
  let bottom = baseline + (stagger ? lineHeight : 0);
  if (title) for (const line of wrap(title, end - start, { size })) {
    bottom += lineHeight;
    parts.push(`<text x="${r(end)}" y="${r(bottom)}" class="chart-unit">${renderRich(line)}</text>`);
  }
  return { svg: parts.join(''), bottom: bottom + SPACE["0-75"] };
}
