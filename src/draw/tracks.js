// 흐름(track)이 지나는 길. 한 점이 여러 선을 멈춤 없이 지나도록 선 경로를 이어 붙인 보이지 않는 path를 `<defs>`에 둔다. 점(animateMotion의 mpath)과 재생기가 이 path를 따라간다.
import { routePolyline } from '../route.js';
import { values } from '../vendor/theme/tokens.js';

// cost: time O(p), heap O(p), stack O(1)
// vars: p = 이어 붙인 경로 점 수
// basis: estimate
// 구간마다 둥근 모서리 경로를 잇고, 구간 사이(도형 안)는 직선으로 잇는다.
function pathOf(parts) {
  return parts.map((part, i) => routePolyline(part, values.radius.route).d.replace(/^M/, i ? 'L' : 'M')).join(' ');
}

// cost: time O(t·p), heap O(out), stack O(1)
// vars: t = 흐름 수, p = 이어 붙인 경로 점 수, out = 만든 SVG 글자 수
// basis: estimate
/** 흐름마다 이어 붙인 길(`tp-번호`)을 담은 `<defs>`. 흐름이 없으면 빈 글이다. */
export function drawTrackPaths(timeline) {
  const paths = (timeline.tracks ?? []).map((track, k) => `<path id="tp-${k}" class="fl-track-path" d="${pathOf(track.parts)}" fill="none"/>`);
  return paths.length ? `<defs>${paths.join('')}</defs>` : '';
}
