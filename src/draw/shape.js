// 도형 하나의 윤곽을 그린다. 원통, 갈림길(둥근 마름모), 원, 상태 점은 모양 자체가 뜻이라 여기서 따로 그리고, 나머지는 모두 카드(draw/card.js)다.
// 이름과 내용은 draw/figure.js가 그린다.
import { roundCoord as r } from '../text.js';
import { tokens } from '../vendor/theme/tokens.js';
import { drawCard } from './card.js';
import { CORNER, surfaceOutline } from './surface.js';

// 윤곽 모양. 채우기와 선은 부르는 쪽이 정한다. 카드 종류는 모두 카드 면(surfaceOutline)이다.
const geometry = {
  store: (it) => `<path d="M${r(it.x)} ${r(it.y)} a ${r(it.w / 2)} ${it.marginTop} 0 0 1 ${r(it.w)} 0 v ${r(it.h)} a ${r(it.w / 2)} ${it.marginTop} 0 0 1 ${r(-it.w)} 0 z"`,
  circle: (it) => `<circle cx="${r(it.x + it.w / 2)}" cy="${r(it.y + it.h / 2)}" r="${r(it.w / 2)}"`,
  decision: (it) => `<path d="${roundedDiamond(it, CORNER.tip)}"`,
};

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 갈림길 마름모. 카드 면처럼 꼭짓점을 둥글린다(CORNER.tip).
// 꼭짓점을 둥글리면 끝이 안쪽으로 물러나므로, 둥근 끝이 배치 사각형의 네 변 가운데(연결점)에 그대로 닿도록 뾰족한 마름모를 그만큼 키워 둔다.
function roundedDiamond({ x, y, w, h }, radius) {
  const [cx, cy] = [x + w / 2, y + h / 2];
  const [a, b] = diamondReach(w / 2, h / 2, radius);
  const corners = [[cx, cy - b], [cx + a, cy], [cx, cy + b], [cx - a, cy]];
  const arcs = corners.map((v, i) => cornerArc(v, corners[(i + 3) % 4], corners[(i + 1) % 4], radius));
  const start = arcs.at(-1).to;
  return `M ${r(start[0])} ${r(start[1])} ${arcs.map(({ from, to }) => `L ${r(from[0])} ${r(from[1])} A ${radius} ${radius} 0 0 1 ${r(to[0])} ${r(to[1])}`).join(' ')} Z`;
}

// cost: time O(k), heap O(1), stack O(1)
// vars: k = 고정점 반복 수
// basis: estimate
// 둥근 끝이 반너비 halfW, 반높이 halfH에 닿게 하는 뾰족한 마름모의 반너비와 반높이. 끝이 물러나는 거리는 radius·(1/sin(반각) − 1)이고 반각이 키운 크기에 따라 조금 바뀌므로 고정점으로 맞춘다.
function diamondReach(halfW, halfH, radius) {
  let [a, b] = [halfW, halfH];
  for (let k = 0; k < REACH_STEPS; k += 1) {
    const side = Math.hypot(a, b);
    [a, b] = [halfW + radius * (side / b - 1), halfH + radius * (side / a - 1)];
  }
  return [a, b];
}

const REACH_STEPS = 8;

// 꼭짓점 v의 둥근 모서리: 앞 변 위 시작점 from과 다음 변 위 끝점 to. 두 점은 v에서 radius / tan(반각)만큼 떨어진 접점이다.
function cornerArc(v, prev, next, radius) {
  const unit = ([px, py]) => {
    const len = Math.hypot(px - v[0], py - v[1]);
    return [(px - v[0]) / len, (py - v[1]) / len];
  };
  const [u1, u2] = [unit(prev), unit(next)];
  const half = Math.acos(u1[0] * u2[0] + u1[1] * u2[1]) / 2;
  const t = radius / Math.tan(half);
  return { from: [v[0] + u1[0] * t, v[1] + u1[1] * t], to: [v[0] + u2[0] * t, v[1] + u2[1] * t] };
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 도형 윤곽 조각(닫지 않은 글). 후광과 배경 면이 같은 윤곽을 다시 그린다. 카드는 앞 상자(몸통)의 면 윤곽이다. */
export function outlineOf(it) {
  return (geometry[it.shape] ?? surfaceOutline)(it);
}

// cost: time O(c), heap O(out), stack O(1)
// vars: c = 부분 수, out = 만든 SVG 글자 수
// basis: estimate
export function drawShape(it, stroke, paint) {
  const { x, y, w, h } = it;
  const cx = x + w / 2;
  switch (it.shape) {
    case 'store':
      return `${geometry.store(it)} ${stroke}/><path d="M${r(x)} ${r(y)} a ${r(w / 2)} ${it.marginTop} 0 0 0 ${r(w)} 0" fill="none" ${stroke}/>`;
    case 'decision':
      return `${geometry.decision(it)} ${stroke}/>`;
    case 'circle':
      return `${geometry.circle(it)} ${stroke}/>`;
    case 'start':
      return `<circle cx="${r(cx)}" cy="${r(y + h / 2)}" r="${r(w / 2)}" fill="${tokens.color.ink}" ${stroke}/>`;
    case 'final':
      return `<circle cx="${r(cx)}" cy="${r(y + h / 2)}" r="${r(w / 2)}" fill="none" ${stroke}/><circle cx="${r(cx)}" cy="${r(y + h / 2)}" r="${r(w / 4)}" fill="${tokens.color.ink}"/>`;
    default:
      return drawCard(it, stroke, paint);
  }
}
