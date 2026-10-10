// 도형 하나의 윤곽을 그린다. 원통, 갈림길, 원, 상태 점은 모양 자체가 뜻이라 여기서 따로 그리고, 나머지는 모두 카드(draw/card.js)다.
// 이름과 내용은 draw/figure.js가 그린다.
import { roundCoord as r } from '../text.js';
import { tokens } from '../vendor/theme/tokens.js';
import { drawCard } from './card.js';
import { SURFACE_FILL, surfaceOutline } from './surface.js';

// 윤곽 모양. 채우기와 선은 부르는 쪽이 정한다. 카드 종류는 모두 카드 면(surfaceOutline)이다.
const geometry = {
  store: (it) => `<path d="M${r(it.x)} ${r(it.y)} a ${r(it.w / 2)} ${it.marginTop} 0 0 1 ${r(it.w)} 0 v ${r(it.h)} a ${r(it.w / 2)} ${it.marginTop} 0 0 1 ${r(-it.w)} 0 z"`,
  circle: (it) => `<circle cx="${r(it.x + it.w / 2)}" cy="${r(it.y + it.h / 2)}" r="${r(it.w / 2)}"`,
};

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
  const fill = SURFACE_FILL;
  switch (it.shape) {
    case 'store':
      return `${geometry.store(it)} ${fill} ${stroke}/><path d="M${r(x)} ${r(y)} a ${r(w / 2)} ${it.marginTop} 0 0 0 ${r(w)} 0" fill="none" ${stroke}/>`;
    case 'decision':
      return `<polygon points="${r(cx)},${r(y)} ${r(x + w)},${r(y + h / 2)} ${r(cx)},${r(y + h)} ${r(x)},${r(y + h / 2)}" ${fill} ${stroke}/>`;
    case 'circle':
      return `${geometry.circle(it)} ${fill} ${stroke}/>`;
    case 'start':
      return `<circle cx="${r(cx)}" cy="${r(y + h / 2)}" r="${r(w / 2)}" fill="${tokens.color.fg}" ${stroke}/>`;
    case 'final':
      return `<circle cx="${r(cx)}" cy="${r(y + h / 2)}" r="${r(w / 2)}" fill="none" ${stroke}/><circle cx="${r(cx)}" cy="${r(y + h / 2)}" r="${r(w / 4)}" fill="${tokens.color.fg}"/>`;
    default:
      return drawCard(it, stroke, paint);
  }
}
