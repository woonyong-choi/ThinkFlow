// 같은 톤 팔레트 계산. 이력서 파랑(라이트 #2b96ed, 다크 palette.blue.400)의 OKLCH 밝기와 채도는 두고 색상만 돌려 색마다 세 단계를 만든다.
// fill은 옅은 면, stroke는 그래픽(3 이상), ink는 글자(4.5 이상)다. sRGB 밖이면 채도만 줄인다(oklch.mjs).
// 대비 기준 수치는 WCAG 규칙값이고 색 취향이 아니라 토큰이 아닌 상수다. 면의 값은 토큰 정본에서 읽은 것을 받는다.
import { contrast } from '../../src/contrast.js';
import { valueNames } from '../../src/source/grammar.js';
import { VISION, distanceOf, seenBy } from './color-vision.mjs';
import { oklchOf, oklchToHex } from './oklch.mjs';

/** 이력서(woon-resume) `--manta-accent` 라이트 값. 라이트 기준 밝기와 채도를 이 색에서 읽는다. */
export const RESUME_ACCENT = '#2b96ed';
const TEXT = 4.5;
const GRAPHIC = 3;
const STEP = 0.002;
const MAX_STEPS = 400;
// 팔레트 색 이름 → OKLCH 색상(도). gray는 파랑 색상에서 채도만 줄인다(slate 원색 층).
export const HUES = { red: 18, amber: 86, green: 163, teal: 198, navy: 281, purple: 313, pink: 345, slate: undefined };
// 면 단계의 목표 밝기와 채도. 대비 기준에 걸리면 밝기를 옮긴다.
const FILL = { light: { L: 0.955, C: 0.03, step: STEP }, dark: { L: 0.31, C: 0.04, step: -STEP } };
// gray(slate)의 채도. 면은 거의 무채색이고 그래픽과 글자는 채도가 낮은 청회색이다.
const GRAY = { fill: 0.006, mark: 0.02 };
// 갈래색 이름(grammar의 tone 값 목록) → 팔레트 색. gray만 원색 층 이름이 slate다.
const PALETTE_OF = { gray: 'slate' };
// 점 단계가 고르는 밝기의 간격과 범위
const DOT_STEP = 0.02;
const DOT_RANGE = { light: [0.3, 0.62], dark: [0.55, 0.97] };

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

// cost: time O(f), heap O(1), stack O(1)
// vars: f = 면 수
// basis: estimate
const reaches = (hex, faces, floor) => faces.every((face) => contrast(hex, face) >= floor);

// cost: time O(h·f·s), heap O(h), stack O(1)
// vars: h = 색 수, f = 면 수, s = 찾는 걸음 수
// basis: estimate
/**
 * 한 테마의 색마다 { fill, stroke, ink }를 만든다.
 * @param theme 'light' | 'dark'
 * @param faces { surfaces, fg, muted, border, onActive, references, base }. surfaces는 그림 면 `#rrggbb` 목록, references는 지금과 비교 색, base는 { L, C, hue }로 파랑 기준이다
 * @returns { 색이름: { fill, stroke, ink, dot? } }. dot은 갈래색 이름에만 있다
 */
export function generateTheme(theme, faces) {
  const { surfaces, fg, muted, border, onActive, base } = faces;
  const fills = {};
  for (const [name, hue] of Object.entries(HUES)) {
    const isGray = hue === undefined;
    const chroma = isGray ? GRAY.fill : FILL[theme].C;
    const spec = { start: FILL[theme].L, step: FILL[theme].step, chroma, hue: hue ?? base.hue };
    fills[name] = search(spec, (hex) => reaches(hex, [fg, muted], TEXT) && contrast(hex, border) >= GRAPHIC);
  }
  const allFills = Object.values(fills);
  const out = {};
  for (const [name, hue] of Object.entries(HUES)) {
    const isGray = hue === undefined;
    const spec = { start: base.L, chroma: isGray ? GRAY.mark : base.C, hue: hue ?? base.hue };
    const down = theme === 'light' ? -STEP : STEP;
    const stroke = search({ ...spec, step: down }, (hex) => reaches(hex, [...surfaces, ...allFills], GRAPHIC));
    const ink = search({ ...spec, step: down }, (hex) => reaches(hex, [...surfaces, ...allFills, onActive], TEXT));
    out[name] = { fill: fills[name], stroke, ink };
  }
  return addDots(out, theme, { ...faces, fills: allFills });
}

// cost: time O(c^k·k²·v), heap O(c·k), stack O(k)
// vars: c = 후보 밝기 수, k = 갈래색 수, v = 시각 수
// basis: estimate
/**
 * 갈래색(tone) 이름마다 점 단계(dot)를 더한다. ink와 같은 색상과 채도이고 밝기만 다르다.
 * 이름끼리, 그리고 지금(state.active)과 비교(data.compare)와 가장 가까울 때의 OKLab 거리가 flowMin 이상인 조합 가운데 ink 밝기에서 가장 덜 벗어난 조합을 고른다.
 * 후보는 그림 면 위 3, 이동 글 상자 글자(onActive)와 4.5 이상인 밝기만이다. 같은 값이면 먼저 찾은 조합이다.
 */
function addDots(out, theme, { surfaces, fills, onActive, base, references, flowMin }) {
  const names = valueNames('tone').map((tone) => PALETTE_OF[tone] ?? tone);
  const [low, high] = DOT_RANGE[theme];
  const options = names.map((name) => {
    const hue = HUES[name] ?? base.hue;
    const chroma = HUES[name] === undefined ? GRAY.mark : base.C;
    const found = [];
    for (let L = low; L <= high + 1e-9; L += DOT_STEP) {
      const hex = oklchToHex(L, chroma, hue);
      if (reaches(hex, [...surfaces, ...fills], GRAPHIC) && contrast(hex, onActive) >= TEXT) found.push({ hex, shift: Math.abs(L - oklchOf(out[name].ink)[0]), coords: Object.values(VISION).map((matrix) => seenBy(matrix, hex)) });
    }
    return found;
  });
  const reference = references.map((hex) => seenBy(VISION.normal, hex));
  let best = { shift: Infinity, picks: [] };
  const choose = (k, picks, shift) => {
    if (shift >= best.shift) return;
    if (k === names.length) {
      const pairs = picks.flatMap((p, i) => picks.slice(i + 1).map((q) => Math.min(...p.coords.map((c, v) => distanceOf(c, q.coords[v])))));
      const nearest = Math.min(...pairs, ...picks.flatMap((p) => reference.map((r) => distanceOf(p.coords[0], r))));
      if (nearest >= flowMin) best = { shift, picks };
      return;
    }
    for (const option of options[k]) choose(k + 1, [...picks, option], shift + option.shift);
  };
  choose(0, [], 0);
  if (!best.picks.length) throw new Error(`no lightness set keeps the flow colors ${flowMin} apart (${theme})`);
  names.forEach((name, k) => {
    out[name].dot = best.picks[k].hex;
  });
  return out;
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

// 그림 면. 그래픽 3과 글자 4.5를 이 면들 위에서 맞춘다.
const SURFACES = ['bg', 'node', 'group', 'card', 'card-on', 'page', 'surface'];

// cost: time O(h·f·s), heap O(h), stack O(1)
// vars: h = 색 수, f = 면 수, s = 찾는 걸음 수
// basis: estimate
/**
 * 토큰 정본(tokens.json, tokens.dark.json을 읽은 Map)에서 테마별 색 단계를 만든다.
 * 다크 표는 라이트 표 위에 덮어 쓴 것이다. 기준 밝기와 채도는 라이트가 RESUME_ACCENT, 다크가 `color.palette.blue.400`에서 온다.
 * @returns { 색이름: { 'light-fill', 'light-stroke', 'light-ink', 'dark-fill', 'dark-stroke', 'dark-ink' } }
 */
export function generatePalette(light, dark) {
  const lightTable = flatten(light, [], new Map());
  const darkTable = new Map([...lightTable, ...flatten(dark, [], new Map())]);
  const result = Object.fromEntries(Object.keys(HUES).map((name) => [name, {}]));
  for (const [theme, table, accent] of [['light', lightTable, RESUME_ACCENT], ['dark', darkTable, resolve(lightTable, 'color.palette.blue.400')]]) {
    const [L, C, hue] = oklchOf(accent);
    const faces = {
      surfaces: SURFACES.map((name) => resolve(table, `color.${name}`)),
      fg: resolve(table, 'color.fg'),
      muted: resolve(table, 'color.muted'),
      border: resolve(table, 'color.border'),
      onActive: resolve(table, 'color.state.on-active'),
      references: [resolve(table, 'color.state.active'), resolve(table, 'color.data.compare')],
      flowMin: table.get('distance.flow'),
      base: { L, C, hue },
    };
    for (const [name, steps] of Object.entries(generateTheme(theme, faces))) {
      for (const [stage, hex] of Object.entries(steps)) result[name][`${theme}-${stage}`] = hex;
    }
  }
  return result;
}
