// 팔레트 계산. NHN Cloud 아키텍처 자료의 색 사용을 따른다(github.com/nhn-cloud/Icons, 다이어그램 PPT): 그림은 무채색 회색이 대부분이고, 브랜드 파랑 #125DE6은 핵심 자리(지금, 흐름, 아이콘, 차트 주 계열)에만, 보라 #B28FD1, 빨강 #EF0F0F, 초록 #09C72C는 드문 강조다.
// 주황은 NHN에 없어 비교(data.compare)와 주의(warning)에만 남는다. 색마다 원색(ANCHORS)에서 테마별 fill, stroke, ink, dot, outline 단계를 대비 규칙으로 찾는다. 대비 기준 수치는 WCAG 규칙값이고 색 취향이 아니라 토큰이 아닌 상수다. 면의 값은 토큰 정본에서 읽은 것을 받는다.
import { contrast } from '../../src/contrast.js';
import { oklchOf, oklchToHex } from './oklch.mjs';

const TEXT = 4.5;
const GRAPHIC = 3;
const OUTLINE_FLOOR = 3;
const STEP = 0.002;
const MAX_STEPS = 400;
// 외곽선 단계: 면(fill)과 진한 선(stroke)을 OKLab에서 반씩 섞은 값에서 시작한다.
const OUTLINE_MIX = 0.5;
// 면 단계: 라이트는 옅은 면, 다크는 어두운 면(밝기 L과 채도 상한 C)
const FILL = { light: { L: 0.965, C: 0.025 }, dark: { L: 0.285, C: 0.05 } };
// 하늘 면(그룹 강조): 파랑과 같은 색상각의 더 옅은 면
const SKY_FILL = { light: { L: 0.955, C: 0.02 }, dark: { L: 0.285, C: 0.05 } };
// 파랑의 히트맵 두 끝. low는 그림 바탕과 대비 1.5(꾸밈 요소 기준)가 되는 가장 옅은 값이고 채도 상한은 HEAT_LOW_C다. high는 흰 글자와의 대비가 라이트 7, 다크 4.5 이상인 가장 밝은 값이다.
const HEAT_LOW_C = { light: 0.06, dark: 0.05 };
const HEAT_LOW_FLOOR = 1.5;
const HEAT_HIGH_FLOOR = { light: 7, dark: 4.5 };
const HEAT_LOW_START = { light: 0.95, dark: 0.25 };
// 다크 원색: 라이트 원색과 같은 색상각에서 밝기를 DARK_MIN_L 이상으로 올리고 채도 상한을 둔다.
const DARK_MIN_L = 0.72;
const DARK_MAX_C = 0.17;
// 다크 흐름 점을 찾기 시작하는 밝기(이보다 어두운 값은 면 위 대비 3에 못 미친다)
const DARK_DOT_START = 0.5;
// 강조 그룹의 틴트 면(깊이 셋). 회색 그룹 면과 같은 밝기(L)에 강조 색의 색상각으로 채도만 얹어 위계가 같은 리듬으로 읽히게 한다.
const TINT_CHROMA = [0.022, 0.028, 0.034];
// 흐름 점을 옮기는 색(L, 라이트는 어둡게, 다크는 밝게). 빨강이 비교 주황과, 초록과 색각 이상 눈에서도 OKLab 거리 0.1 이상 벌어지게 한다.
const DOT_SHIFT = { light: { red: 0.17 }, dark: { green: 0.14 } };
// 라이트 선(stroke)을 원색보다 어둡게 옮기는 색(L). 빨강이 주의 주황과 적록 색각 이상 눈에서도 OKLab 거리 0.025 이상 벌어지게 한다.
const STROKE_SHIFT = { red: 0.08 };
// 다크 흐름 점의 색상각을 옮기는 색(도). 빨강을 마젠타 쪽으로 돌려 주황과 벌린다.
const DOT_HUE_SHIFT = { red: -16 };
// 다크 선(stroke)의 색상각을 옮기는 색(도). 빨강을 마젠타 쪽으로 돌려 주의 주황과 보통 시각에서도 벌린다.
const STROKE_HUE_SHIFT = { red: -14 };

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 라이트 원색에서 다크 원색을 만든다. 색상각은 그대로, 밝기는 DARK_MIN_L 이상, 채도는 DARK_MAX_C 이하다.
function darkOf(hex) {
  const [L, C, hue] = oklchOf(hex);
  return oklchToHex(Math.max(L, DARK_MIN_L), Math.min(C, DARK_MAX_C), hue);
}

const NHN = { blue: '#125de6', purple: '#b28fd1', red: '#ef0f0f', green: '#09c72c', orange: '#e65200' };
/** 원색 표. 팔레트 값에서 사람이 정한 입력은 이 표뿐이고 나머지는 모두 계산이다. 라이트 원색은 NHN 아키텍처 자료의 색이고 주황만 비교와 주의용으로 남긴다. */
export const ANCHORS = Object.fromEntries(Object.entries(NHN).map(([name, light]) => [name, { light, dark: darkOf(light) }]));

// 회색(slate)은 무채색 정적 값이다. 중지 상태 도형의 면, 선, 글자, 세 번째 이후 흐름 점.
const GRAY = { 'light-fill': '#e7e7e7', 'light-stroke': '#5d5d5d', 'light-ink': '#5d5d5d', 'light-dot': '#747474', 'dark-fill': '#363636', 'dark-stroke': '#aaaaaa', 'dark-ink': '#aaaaaa', 'dark-dot': '#c7c7c7' };

// cost: time O(s), heap O(1), stack O(1)
// vars: s = 찾는 걸음 수
// basis: estimate
// 원색 그대로가 ok면 원색, 아니면 start에서 step씩 밝기를 옮기며 처음으로 ok를 만족하는 `#rrggbb`. 걸음이 MAX_STEPS를 넘으면 오류다.
function search({ anchor, start, step, chroma, hue }, ok) {
  if (anchor && ok(anchor)) return anchor;
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

// cost: time O(s), heap O(1), stack O(1)
// vars: s = 찾는 걸음 수
// basis: estimate
// 한 테마의 색 하나. fill은 옅은(라이트) 또는 어두운(다크) 면, stroke는 그래픽(면 위 대비 3), ink는 글자(대비 4.5, 켜진 글 상자 글자 onActive와도), dot은 흐름 점(ink와 같다).
function colorSteps(anchor, theme, { surfaces, onActive, dotShift, hueShift, tints, strokeShift, strokeHueShift }) {
  const [L, C, hue] = oklchOf(anchor);
  const away = theme === 'light' ? -STEP : STEP;
  const fill = oklchToHex(FILL[theme].L, Math.min(FILL[theme].C, C), hue);
  const strokeHue = theme === 'dark' ? hue + strokeHueShift : hue;
  const reached = search({ anchor: strokeHueShift && theme === 'dark' ? undefined : anchor, start: L, step: away, chroma: C, hue: strokeHue }, (hex) => reaches(hex, [...surfaces, fill, ...tints], GRAPHIC));
  const stroke = theme === 'light' && strokeShift ? oklchToHex(oklchOf(reached)[0] - strokeShift, oklchOf(reached)[1], hue) : reached;
  const ink = search({ anchor: stroke, start: oklchOf(stroke)[0], step: away, chroma: C, hue: strokeHue }, (hex) => reaches(hex, [...surfaces, fill, onActive, ...tints.slice(0, 1)], TEXT));
  // 흐름 점: 라이트는 ink이고, 다크는 면 위 그래픽 3과 글 상자 글자 4.5를 넘는 가장 어두운 값이다(DOT_SHIFT로 옮기는 색은 그만큼 더 옮긴다).
  const found = theme === 'light' ? ink : search({ start: DARK_DOT_START, step: STEP, chroma: C, hue: hue + hueShift }, (hex) => reaches(hex, surfaces, GRAPHIC) && contrast(hex, onActive) >= TEXT);
  const dot = dotShift ? oklchToHex(oklchOf(found)[0] + (theme === 'light' ? -dotShift : dotShift), oklchOf(found)[1], hue) : found;
  return { fill, stroke, ink, dot };
}

// cost: time O(s), heap O(1), stack O(1)
// vars: s = 찾는 걸음 수
// basis: estimate
// 파랑만 갖는 단계: 히트맵 두 끝(low, high)과 구성도 아이콘(icon). 아이콘은 NHN 컬러 아이콘처럼 브랜드 파랑(stroke)이다.
function blueExtras({ steps, anchor, theme }, { bg, white }) {
  const [L, C, hue] = oklchOf(anchor);
  const away = theme === 'light' ? -STEP : STEP;
  return {
    'heat-low': search({ start: HEAT_LOW_START[theme], step: away, chroma: Math.min(HEAT_LOW_C[theme], C), hue }, (hex) => contrast(hex, bg) >= HEAT_LOW_FLOOR),
    'heat-high': search({ start: L, step: -STEP, chroma: C, hue }, (hex) => contrast(hex, white) >= HEAT_HIGH_FLOOR[theme]),
    icon: steps.stroke,
  };
}

// cost: time O(h·s), heap O(h), stack O(1)
// vars: h = 색 수, s = 찾는 걸음 수
// basis: estimate
// 색마다 테마별 외곽선 단계(`<테마>-outline`)를 더한다. 면과 진한 선 사이 OKLab 값에서 시작해 밝기만 옮겨 면, 판(bg), 도형 바탕(node) 위 대비 OUTLINE_FLOOR를 맞춘다.
function withOutlines(table, tokens) {
  for (const steps of Object.values(table)) {
    for (const theme of ['light', 'dark']) {
      const faces = [steps[`${theme}-fill`], resolve(tokens[theme], 'color.bg'), resolve(tokens[theme], 'color.node')];
      const [fromL, fromC, fromHue] = oklchOf(steps[`${theme}-fill`]);
      const [toL, toC, toHue] = oklchOf(steps[`${theme}-stroke`]);
      const lab = (C, hue) => [C * Math.cos((hue * Math.PI) / 180), C * Math.sin((hue * Math.PI) / 180)];
      const [fromA, fromB] = lab(fromC, fromHue);
      const [toA, toB] = lab(toC, toHue);
      const mix = (from, to) => from + (to - from) * OUTLINE_MIX;
      const a = mix(fromA, toA);
      const b = mix(fromB, toB);
      const hue = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
      steps[`${theme}-outline`] = search({ start: mix(fromL, toL), step: theme === 'light' ? -STEP : STEP, chroma: Math.hypot(a, b), hue }, (hex) => reaches(hex, faces, OUTLINE_FLOOR));
    }
  }
  return table;
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

// 그림 면. 그래픽 3을 이 면들 위에서 맞춘다(판, 도형, 그룹 깊이 셋, 카드 바탕).
const SURFACES = ['bg', 'node', 'group-1', 'group-2', 'group-3', 'card'];

// cost: time O(h·s), heap O(h), stack O(1)
// vars: h = 색 수, s = 찾는 걸음 수
// basis: estimate
/**
 * 토큰 정본(tokens.json, tokens.dark.json을 읽은 Map)에서 테마별 색 단계를 만든다. 다크 표는 라이트 표 위에 덮어 쓴 것이다.
 * @returns { 색이름: { '<테마>-fill', '<테마>-stroke', '<테마>-ink', '<테마>-outline', ... } }. blue는 heat-low, heat-high, icon이, 흐름 점이 있는 색은 dot이 더 있다
 */
export function generatePalette(light, dark) {
  const lightTable = flatten(light, [], new Map());
  const darkTable = new Map([...lightTable, ...flatten(dark, [], new Map())]);
  const table = {};
  for (const [theme, tokens] of [['light', lightTable], ['dark', darkTable]]) {
    const faces = { surfaces: SURFACES.map((name) => resolve(tokens, `color.${name}`)), onActive: resolve(tokens, 'color.state.on-active') };
    const grayL = ['group-1', 'group-2', 'group-3'].map((name) => oklchOf(resolve(tokens, `color.${name}`))[0]);
    const tintsOf = (name) => (['blue', 'purple'].includes(name) ? grayL.map((L, i) => oklchToHex(L, TINT_CHROMA[i], oklchOf(ANCHORS[name][theme])[2])) : []);
    const steps = Object.fromEntries(Object.entries(ANCHORS).map(([name, pair]) => [name, { ...colorSteps(pair[theme], theme, { ...faces, dotShift: DOT_SHIFT[theme][name] ?? 0, hueShift: theme === 'dark' ? DOT_HUE_SHIFT[name] ?? 0 : 0, strokeShift: STROKE_SHIFT[name] ?? 0, strokeHueShift: STROKE_HUE_SHIFT[name] ?? 0, tints: tintsOf(name) }), ...Object.fromEntries(tintsOf(name).map((hex, i) => [`tint-${i + 1}`, hex])) }]));
    const white = resolve(tokens, 'color.data.heat-ink-on');
    steps.blue = { ...steps.blue, ...blueExtras({ steps: steps.blue, anchor: ANCHORS.blue[theme], theme }, { bg: faces.surfaces[0], white }) };
    const [, blueC, blueHue] = oklchOf(ANCHORS.blue[theme]);
    steps.sky = { fill: oklchToHex(SKY_FILL[theme].L, Math.min(SKY_FILL[theme].C, blueC), blueHue), stroke: steps.blue.stroke, ink: steps.blue.ink, 'tint-1': steps.blue['tint-1'], 'tint-2': steps.blue['tint-2'], 'tint-3': steps.blue['tint-3'] };
    for (const key of ['tint-1', 'tint-2', 'tint-3']) delete steps.blue[key];
    for (const [name, step] of Object.entries(steps)) for (const [stage, hex] of Object.entries(step)) (table[name] ??= {})[`${theme}-${stage}`] = hex;
  }
  // 파랑에서 갈라진 이름: navy는 파랑 그대로(히트맵과 아이콘 단계 없이), sky는 그룹 강조용 옅은 면. amber와 pink는 주황과 보라, teal은 초록을 쓰고, 회색(slate)은 무채색이다.
  const only = (name, keys) => Object.fromEntries(Object.entries(table[name]).filter(([key]) => keys.some((k) => key.endsWith(`-${k}`))));
  const colors = ['fill', 'stroke', 'ink', 'dot'];
  Object.assign(table, { navy: only('blue', ['fill', 'stroke', 'ink']), amber: only('orange', colors), pink: only('purple', colors), teal: only('green', colors), slate: { ...Object.fromEntries(Object.entries(GRAY)) } });
  for (const key of ['dot']) for (const name of ['orange', 'blue', 'amber', 'pink']) for (const theme of ['light', 'dark']) delete table[name][`${theme}-${key}`];
  return withOutlines(table, { light: lightTable, dark: darkTable });
}
