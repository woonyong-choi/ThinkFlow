// 색각 이상 시뮬레이션과 OKLab 거리. 팔레트 생성(palette.mjs)과 테스트가 같은 계산을 쓴다.
/** 색각 이상 시뮬레이션 행렬(Machado 2009, 심한 정도 1.0). 선형 sRGB에 곱한다. normal은 그대로다. */
export const VISION = {
  normal: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
};

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
const toLinear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 선형 sRGB [r, g, b]를 OKLab [L, a, b]로
function linearToOklab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 시각 `matrix`(VISION의 값)로 본 `#rrggbb`의 OKLab 좌표 */
export function seenBy(matrix, hex) {
  const linear = [1, 3, 5].map((i) => toLinear(Number.parseInt(hex.slice(i, i + 2), 16) / 255));
  return linearToOklab(matrix.map((row) => row.reduce((sum, weight, i) => sum + weight * linear[i], 0)));
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 두 OKLab 좌표의 거리 */
export const distanceOf = (p, q) => Math.hypot(...p.map((v, i) => v - q[i]));

// cost: time O(v)
// vars: v = 시각 수
// basis: estimate
/** 두 `#rrggbb`가 모든 시각(기본 normal, protanopia, deuteranopia)에서 가장 가까울 때의 OKLab 거리 */
export function closestDistance(a, b, kinds = Object.keys(VISION)) {
  return Math.min(...kinds.map((kind) => distanceOf(seenBy(VISION[kind], a), seenBy(VISION[kind], b))));
}
