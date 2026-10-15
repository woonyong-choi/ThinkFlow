// 면(surface): 카드가 시작하는 둥근 사각형 하나. 상자, 사람, 큐, 표, API, 클래스, 차트, 격자, 순서 보기 참여자가 모두 이 함수로 그린다.
// 채움은 중립 카드 면이고 경계와 켜짐은 부르는 쪽이 넘기는 stroke(class)가 정한다. 후광과 배경 면(draw/values.js)도 같은 윤곽을 쓴다.
import { bodyOf } from '../measure/decor.js';
import { roundCoord as r } from '../text.js';
import { values } from '@woonyong-choi/design-tokens/tokens.js';

/** 모서리 반지름의 세 역할: 바깥 면(카드), 그 안에 놓이는 면(내용, 칸 묶음, 메모), 작은 칸(큐 칸). 모두 design-tokens의 곡률 역할 토큰이다. */
export const CORNER = Object.freeze({ outer: values.radius['figure-outer'], inner: values.radius['figure-inner'], cell: values.radius['figure-cell'] });

/** 사각형 윤곽 여는 글(닫지 않음): 속성이 이어질 자리를 남긴다. */
export function rectOpen({ x, y, w, h }, radius) {
  return `<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" rx="${radius}"`;
}

/** 카드 면의 윤곽. 복제 개수가 있는 상자는 뒤 윤곽 두 겹이 비치는 만큼 작은 앞 상자(bodyOf)다. */
export function surfaceOutline(it) {
  if (it.shape === 'grid') {
    const box = gridBounds(it);
    return rectOpen({ x: it.x + box.left, y: it.y + box.top, w: box.right - box.left, h: box.bottom - box.top }, CORNER.inner);
  }
  return rectOpen(bodyOf(it), CORNER.outer);
}

/** 카드 면 하나. 색과 점선은 공통 스타일이 정한다. */
export function drawSurface(it, stroke) {
  return `${surfaceOutline(it)} ${stroke}/>`;
}

/** 카드 면 모양으로 자르는 clipPath. 안쪽이 직선인 밝힘 면이 바깥 둥근 틀 밖으로 나가지 않게 한다. */
export function surfaceClip(it, id) {
  return `<clipPath id="${id}">${surfaceOutline(it)}/></clipPath>`;
}

// cost: time O(c + e), heap O(c + e), stack O(c + e)
// vars: c = 칸 수, e = 빈 자리 구간 수
// basis: estimate
// 칸 묶음 전체의 바깥 사각형(격자 왼쪽 위가 원점). 칸 묶음의 바깥 모서리만 둥글고, 칸 사이 교차는 모두 직선이다.
export function gridBounds(it) {
  const boxes = [...it.cells, ...it.empties];
  const [left, top] = [Math.min(...boxes.map((b) => b.x)), Math.min(...boxes.map((b) => b.y))];
  return { left, top, right: Math.max(...boxes.map((b) => b.x + b.w)), bottom: Math.max(...boxes.map((b) => b.y + b.h)) };
}
