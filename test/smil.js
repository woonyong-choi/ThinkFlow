// SMIL 값 풀기: 움직이는 SVG의 점 요소에서 속성을 읽고 한 바퀴 비율 x에서 값을 푼다. 움직임 시험이 시간표와 견줄 때 쓴다.

// cost: time O(n), heap O(n), stack O(1)
// vars: n = SVG 글자 수
// basis: estimate
// 점 요소 하나씩 읽은 속성. 박자 순서와 이동 순서가 같아 시간표의 이동과 차례로 짝이 된다.
export function packetsOf(svg) {
  return svg
    .split('<g class="p')
    .slice(1)
    .map((chunk) => {
      // 점 보임 창은 calcMode="discrete", 글 상자 흐려짐은 linear다. 둘 다 animate 요소라 모양으로 가른다.
      const attr = (tag, name, mode = '') => chunk.match(new RegExp(`<${tag}(?=[^>]*${mode})[^>]*?\\b${name}="([^"]*)"`))?.[1];
      const list = (tag, name, mode = '', sep = ';') => attr(tag, name, mode)?.split(sep).map((v) => (name === 'keySplines' ? v.split(' ').map(Number) : Number(v)));
      return {
        opacity: { dur: attr('animate', 'dur', 'discrete'), times: list('animate', 'keyTimes', 'discrete'), values: list('animate', 'values', 'discrete') },
        motion: { dur: attr('animateMotion', 'dur'), times: list('animateMotion', 'keyTimes'), splines: list('animateMotion', 'keySplines'), points: list('animateMotion', 'keyPoints') },
        slide: { dur: attr('animateTransform', 'dur'), times: list('animateTransform', 'keyTimes'), values: attr('animateTransform', 'values')?.split(';') },
        href: attr('mpath', 'href'),
      };
    });
}

export function bezier(a, b, t) {
  return 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 3차 곡선에서 시간 비율 x의 진행 비율. SMIL keySplines와 같은 정의다.
export function ease([x1, y1, x2, y2], x) {
  let [low, high] = [0, 1];
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    if (bezier(x1, x2, mid) < x) low = mid;
    else high = mid;
  }
  return bezier(y1, y2, (low + high) / 2);
}

// SMIL calcMode=spline(곡선) 또는 linear(단계 끝에서 잘리는 점, keySplines 없음) keyPoints의 경로 비율을 한 바퀴 비율 x에서 푼다.
export function pathFractionAt({ times, splines, points }, x) {
  const i = Math.min(times.length - 2, times.findLastIndex((time) => time <= x));
  const u = (x - times[i]) / (times[i + 1] - times[i]);
  return points[i] + (points[i + 1] - points[i]) * (splines ? ease(splines[i], u) : u);
}

// cost: time O(k), heap O(1), stack O(1)
// vars: k = 키 수
// basis: estimate
// 글 상자 옮김(animateTransform translate, linear) 값 [dx, dy]를 한 바퀴 비율 x에서 푼다.
export function slideAt({ times, values: levels }, x) {
  const i = Math.min(times.length - 2, times.findLastIndex((time) => time <= x));
  const u = times[i + 1] > times[i] ? (x - times[i]) / (times[i + 1] - times[i]) : 1;
  const [a, b] = [levels[i], levels[i + 1]].map((pair) => pair.split(' ').map(Number));
  return a.map((v, k) => v + (b[k] - v) * u);
}

// SMIL calcMode=discrete 값을 한 바퀴 비율 x에서 푼다.
export function discreteAt({ times, values }, x) {
  return values[times.findLastIndex((time) => time <= x)];
}
