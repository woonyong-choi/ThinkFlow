// daphnis 그림 전용 팔레트 계산. 파랑, 보라, 빨강, 초록, 주황의 단계는 design-tokens가 원색에서 계산해 갖고 있고, 여기서는 그 저장소에 없는 두 이름만 계산한다.
// sky(파랑 강조 그룹용 옅은 면)와 slate(gray 범주의 회색)의 면과 외곽선이다. 대비 기준 수치는 WCAG 규칙값이고 색 취향이 아니라 토큰이 아닌 상수다. 면의 값은 토큰 정본에서 읽은 것을 받는다.
import { contrast } from '../../src/contrast.js';
import { oklchOf, oklchToHex } from './oklch.mjs';

const OUTLINE_FLOOR = 3;
const STEP = 0.002;
const MAX_STEPS = 400;
// 외곽선 단계: 면(fill)과 진한 선(stroke)을 OKLab에서 반씩 섞은 값에서 시작한다.
const OUTLINE_MIX = 0.5;
// 하늘 면(그룹 강조): 파랑과 같은 색상각의 옅은 면(밝기 L과 채도 상한 C)
const SKY_FILL = { light: { L: 0.955, C: 0.02 }, dark: { L: 0.285, C: 0.05 } };
// 다크 원색: 라이트 원색과 같은 색상각에서 밝기를 DARK_MIN_L 이상으로 올리고 채도 상한을 둔다(design-tokens와 같은 규칙).
const DARK_MIN_L = 0.72;
const DARK_MAX_C = 0.17;
// 회색(slate)의 옅은 면. 무채색 정적 값이다. 중지 상태 도형의 면이다. 다크 면과 선, 글자, 점은 design-tokens의 회색 단계를 가리킨다.
const SLATE_LIGHT_FILL = '#e7e7e7';
const THEMES = ['light', 'dark'];

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 라이트 원색에서 다크 원색을 만든다. 색상각은 그대로, 밝기는 DARK_MIN_L 이상, 채도는 DARK_MAX_C 이하다. */
export function darkOf(hex) {
  const [L, C, hue] = oklchOf(hex);
  return oklchToHex(Math.max(L, DARK_MIN_L), Math.min(C, DARK_MAX_C), hue);
}

// cost: time O(s), heap O(1), stack O(1)
// vars: s = 찾는 걸음 수
// basis: estimate
// start에서 step씩 밝기를 옮기며 처음으로 ok를 만족하는 `#rrggbb`. 걸음이 MAX_STEPS를 넘으면 오류다.
function search({ start, step, chroma, hue }, ok) {
  for (let i = 0; i < MAX_STEPS; i++) {
    const hex = oklchToHex(start + step * i, chroma, hue);
    if (ok(hex)) return hex;
  }
  throw new Error(`no lightness reaches the floor (hue ${hue}, chroma ${chroma})`);
}

// cost: time O(t), heap O(t), stack O(d)
// vars: t = 토큰 수, d = 묶음 깊이
// basis: estimate
// 정본(Map)의 토큰을 점 이름 경로 → $value 표로 편다.
function flatten(node, path, out) {
  if (node instanceof Map && node.has('$value')) out.set(path.join('.'), node.get('$value'));
  else if (node instanceof Map) for (const [key, child] of node) if (!key.startsWith('$')) flatten(child, [...path, key], out);
  return out;
}

// cost: time O(c), heap O(1), stack O(1)
// vars: c = 참조 사슬 길이
// basis: estimate
// 이름 `color.x`의 `#rrggbb`. 참조 `{...}`를 끝까지 따라간다.
function resolve(table, name) {
  let value = table.get(name);
  while (typeof value === 'string' && value.startsWith('{')) value = table.get(value.slice(1, -1));
  if (!/^#[0-9a-f]{6}$/.test(value ?? '')) throw new Error(`${name} is not a color: ${value}`);
  return value;
}

// cost: time O(s), heap O(1), stack O(1)
// vars: s = 찾는 걸음 수
// basis: estimate
// 외곽선 단계. 면과 진한 선 사이 OKLab 값에서 시작해 밝기만 옮겨 면, 판(bg), 도형 바탕(node) 위 대비 OUTLINE_FLOOR를 맞춘다.
function outlineOf({ theme, fill, stroke, plate, node }) {
  const [fromL, fromC, fromHue] = oklchOf(fill);
  const [toL, toC, toHue] = oklchOf(stroke);
  const lab = (C, hue) => [C * Math.cos((hue * Math.PI) / 180), C * Math.sin((hue * Math.PI) / 180)];
  const [fromA, fromB] = lab(fromC, fromHue);
  const [toA, toB] = lab(toC, toHue);
  const mix = (from, to) => from + (to - from) * OUTLINE_MIX;
  const a = mix(fromA, toA);
  const b = mix(fromB, toB);
  const hue = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  return search({ start: mix(fromL, toL), step: theme === 'light' ? -STEP : STEP, chroma: Math.hypot(a, b), hue }, (hex) => [fill, plate, node].every((face) => contrast(hex, face) >= OUTLINE_FLOOR));
}

// cost: time O(s), heap O(1), stack O(1)
// vars: s = 찾는 걸음 수
// basis: estimate
// 한 테마의 sky와 slate 단계. 선과 다크 회색 면은 정본의 별칭(design-tokens 단계)을 따라가 읽는다.
function stepsOf(theme, tokens) {
  const color = (name) => resolve(tokens, `color.${name}`);
  const plate = color('bg');
  const node = color('node');
  const [, blueC, blueHue] = oklchOf(theme === 'light' ? color('blue.anchor') : darkOf(color('blue.anchor')));
  const skyFill = oklchToHex(SKY_FILL[theme].L, Math.min(SKY_FILL[theme].C, blueC), blueHue);
  const slateFill = theme === 'light' ? SLATE_LIGHT_FILL : color('palette.slate.dark-fill');
  return {
    sky: { [`${theme}-fill`]: skyFill, [`${theme}-outline`]: outlineOf({ theme, fill: skyFill, stroke: color(`palette.sky.${theme}-stroke`), plate, node }) },
    slate: { ...(theme === 'light' ? { 'light-fill': slateFill } : {}), [`${theme}-outline`]: outlineOf({ theme, fill: slateFill, stroke: color(`palette.slate.${theme}-stroke`), plate, node }) },
  };
}

// cost: time O(t + s), heap O(t), stack O(d)
// vars: t = 토큰 수, s = 찾는 걸음 수, d = 묶음 깊이
// basis: estimate
/**
 * 토큰 정본에서 daphnis가 값을 갖는 팔레트 단계를 만든다.
 * @param sources 정본 묶음 목록. 묶음마다 `{ light, dark }`(정본을 읽은 Map)이고 뒤의 묶음이 앞을 덮는다(공통 토큰, daphnis 순서)
 * @returns { sky: { '<테마>-fill', '<테마>-outline' }, slate: { 'light-fill', '<테마>-outline' } }
 */
export function generatePalette(...sources) {
  const lightTable = new Map(sources.flatMap(({ light }) => [...flatten(light, [], new Map())]));
  const tables = { light: lightTable, dark: new Map([...lightTable, ...sources.flatMap(({ dark }) => [...flatten(dark, [], new Map())])]) };
  const result = { sky: {}, slate: {} };
  for (const theme of THEMES) {
    const steps = stepsOf(theme, tables[theme]);
    Object.assign(result.sky, steps.sky);
    Object.assign(result.slate, steps.slate);
  }
  return result;
}
