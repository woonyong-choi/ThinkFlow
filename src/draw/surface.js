// 면(surface): 카드가 시작하는 둥근 사각형 하나. 상자, 사람, 큐, 표, API, 클래스, 차트, 격자, 순서 보기 참여자가 모두 이 함수로 그린다.
// 채움은 중립 카드 면이고 경계와 켜짐은 부르는 쪽이 넘기는 stroke(class)가 정한다. 후광과 배경 면(draw/values.js)도 같은 윤곽을 쓴다.
import { bodyOf } from '../measure/decor.js';
import { roundCoord as r } from '../text.js';
import { tokens, values } from '../vendor/theme/tokens.js';

/** 점선 경계의 점선(stroke-dasharray): 외부 도형 면, 점선 그룹 경계, 점선 연결선이 함께 쓴다. */
export const LINE_DASH = `${values.dash.line} ${values.dash.gap}`;

/** 모서리 반지름의 두 역할: 바깥 면(카드)과 그 안에 놓이는 면(내용, 칸 묶음, 메모). 둘 다 토큰이다. */
export const CORNER = Object.freeze({ outer: values.radius.lg, inner: values.radius.md });

/** 사각형 윤곽 여는 글(닫지 않음): 속성이 이어질 자리를 남긴다. */
export function rectOpen({ x, y, w, h }, radius) {
  return `<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" rx="${radius}"`;
}

/** 카드 면의 윤곽. 복제 개수가 있는 상자는 뒤 윤곽 두 겹이 비치는 만큼 작은 앞 상자(bodyOf)다. */
export function surfaceOutline(it) {
  return rectOpen(bodyOf(it), CORNER.outer);
}

/** 도형 면의 채움 속성. 카드와 원통, 갈림길, 원이 같은 중립 카드 면을 쓴다. 고른 옅은 면(filled)은 CSS(draw/paint.js)가 덮는다. */
export const SURFACE_FILL = `fill="${tokens.color["ui-card"]}"`;

/** 카드 면 하나. tail은 stroke 뒤에 붙는 속성(점선 등)이다. */
export function drawSurface(it, stroke, tail = '') {
  return `${surfaceOutline(it)} ${SURFACE_FILL} ${stroke}${tail}/>`;
}

/** 카드 면 모양으로 자르는 clipPath. 안쪽이 직선인 밝힘 면이 바깥 둥근 틀 밖으로 나가지 않게 한다. */
export function surfaceClip(it, id) {
  return `<clipPath id="${id}">${surfaceOutline(it)}/></clipPath>`;
}
