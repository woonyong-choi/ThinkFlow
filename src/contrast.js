// WCAG 명도 대비 계산. 칸 색에 맞는 글자색을 빌드 때 고르고, 테스트가 글자와 그래픽 쌍의 기준을 잰다.

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// sRGB 채널(0~255)의 선형 값
function linear(channel) {
  const v = channel / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** `#rrggbb`의 채널 셋 */
function channels(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** `#rrggbb`의 상대 휘도(0~1) */
function luminance(hex) {
  const [r, g, b] = channels(hex).map(linear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 두 `#rrggbb` 색의 대비(1~21). 순서와 상관없다. */
export function contrast(a, b) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** from에서 to로 amount(0~1)만큼 sRGB 보간한 `#rrggbb` */
export function mixHex(from, to, amount) {
  const [a, b] = [channels(from), channels(to)];
  return `#${a.map((v, i) => Math.round(v + (b[i] - v) * amount).toString(16).padStart(2, '0')).join('')}`;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 바탕 위에 색을 불투명도 alpha로 얹은 `#rrggbb` */
export function over(background, color, alpha) {
  return mixHex(background, color, alpha);
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 바탕 위 글자로 어두운 글자(dark)와 밝은 글자(light) 중 대비가 큰 쪽을 고른다. 같으면 어두운 글자다. */
export function pickInk(background, dark, light) {
  return contrast(light, background) > contrast(dark, background) ? light : dark;
}
