// OKLCH와 sRGB `#rrggbb` 사이 변환. 팔레트 생성(build-palette.mjs)이 쓴다.
// sRGB 밖의 색은 밝기와 색상을 두고 채도만 줄여 안으로 넣는다.

const GAMUT_EPSILON = 1e-6;
const BISECT_STEPS = 24;

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// sRGB 채널 값(0~1)을 선형 값으로
const decode = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 선형 값을 sRGB 채널 값(0~1)으로
const encode = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// OKLCH를 선형 sRGB [r, g, b]로. 범위 밖일 수 있다.
function toLinear(L, C, hue) {
  const a = C * Math.cos((hue * Math.PI) / 180);
  const b = C * Math.sin((hue * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
const isInGamut = (rgb) => rgb.every((v) => v >= -GAMUT_EPSILON && v <= 1 + GAMUT_EPSILON);

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** OKLCH를 `#rrggbb`로. sRGB 밖이면 같은 L과 h에서 채도만 줄여 가장 큰 채도를 고른다. */
export function oklchToHex(L, C, hue) {
  let chroma = C;
  if (!isInGamut(toLinear(L, C, hue))) {
    let [low, high] = [0, C];
    for (let i = 0; i < BISECT_STEPS; i++) {
      const mid = (low + high) / 2;
      if (isInGamut(toLinear(L, mid, hue))) low = mid;
      else high = mid;
    }
    chroma = low;
  }
  const bytes = toLinear(L, chroma, hue).map((v) => Math.round(Math.min(1, Math.max(0, encode(Math.min(1, Math.max(0, v))))) * 255));
  return `#${bytes.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** `#rrggbb`의 OKLCH [L, C, h(도)] */
export function oklchOf(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => decode(Number.parseInt(hex.slice(i, i + 2), 16) / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const [lightness, a, c] = [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
  return [lightness, Math.hypot(a, c), ((Math.atan2(c, a) * 180) / Math.PI + 360) % 360];
}
