// OKLab 보간. 히트맵 칸 색의 CSS(`color-mix(in oklab, ...)`)와 CSS를 모르는 뷰어용 대체 색(fill 속성)이 같은 보간을 쓰게 한다.
// 변환은 Björn Ottosson의 OKLab 정의(2020)를 그대로 따른다.

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// sRGB 채널(0~255)의 선형 값
const toLinear = (channel) => {
  const v = channel / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 선형 값의 sRGB 채널(0~255). 색 영역 밖은 가장자리로 자른다.
const fromLinear = (value) => {
  const v = Math.min(1, Math.max(0, value));
  return 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
};

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** `#rrggbb`의 OKLab [L, a, b] */
function hexToOklab(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** OKLab [L, a, b]의 `#rrggbb`. 색 영역 밖은 sRGB 가장자리로 자른다. */
function oklabToHex([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const channels = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  return `#${channels.map((v) => Math.round(fromLinear(v)).toString(16).padStart(2, '0')).join('')}`;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** from에서 to로 amount(0~1)만큼 OKLab 보간한 `#rrggbb`. amount 0은 from, 1은 to다. */
export function mixOklab(from, to, amount) {
  const [a, b] = [hexToOklab(from), hexToOklab(to)];
  return oklabToHex(a.map((v, i) => v + (b[i] - v) * amount));
}
