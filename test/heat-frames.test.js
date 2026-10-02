// 히트맵 단계가 바뀌는 동안 칸 글자와 칸 면의 대비가 모든 프레임에서 4.5 이상인지, 생성한 CSS keyframes를 60fps로 풀어 확인한다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { contrast, mixHex } from '../src/contrast.js';
import { toSvg } from '../src/svg.js';
import { themeColor } from './helpers.js';

const TEXT = 4.5;
const FPS = 60;
const MS_PER_SECOND = 1000;
const PERCENT = 100;
const SOURCE = [
  'chart heatmap',
  'cell "a" "x" 10',
  'cell "a" "y" 8',
  'cell "a" "z" 6',
  'cell "b" "x" 4',
  'cell "b" "y" 2',
  'cell "b" "z" 0.5',
  'step "one"',
  '  light "a" "x"',
  'step "two"',
  '  light "b" "y"',
  'step "three"',
  '  light "a" "z"',
].join('\n');

// cost: time O(k), heap O(k), stack O(1)
// vars: k = keyframes 본문 글자 수
// basis: estimate
// keyframes 이름 하나의 [{ at(0~100), props: Map }] 목록. 같은 줄에 퍼센트 여럿이면 같은 값을 모두에 건다.
function stopsOf(css, name) {
  const body = new RegExp(`@keyframes ${name} \\{((?:[^{}]|\\{[^}]*\\})*)\\}`).exec(css)[1];
  const stops = [...body.matchAll(/([\d.%,\s]+)\{([^}]*)\}/g)].flatMap(([, ats, decls]) => {
    const props = new Map(decls.split(';').map((d) => d.split(':').map((s) => s.trim())).filter(([k]) => k));
    return ats.split(',').map((at) => ({ at: parseFloat(at), props }));
  });
  return stops.sort((a, b) => a.at - b.at);
}

// cost: time O(s), heap O(1), stack O(1)
// vars: s = 정지점 수
// basis: estimate
// 이름 있는 애니메이션 하나가 시각 at(0~100)에 내는 속성 값. 값이 서로 다른 정지점 사이는 선형으로 보간한다(animation linear).
function sample(stops, at, resolve) {
  const before = stops.findLastIndex((s) => s.at <= at);
  if (before < 0) return new Map();
  const [from, to] = [stops[before], stops[before + 1]];
  const out = new Map();
  for (const [prop, value] of from.props) {
    const next = to?.props.get(prop);
    if (prop === 'animation-timing-function' || next === undefined || next === value) {
      out.set(prop, value);
      continue;
    }
    const p = (at - from.at) / (to.at - from.at);
    out.set(prop, prop === 'opacity' ? String(Number(value) + (Number(next) - Number(value)) * p) : mixHex(resolve(value), resolve(next), p));
  }
  return out;
}

// cost: time O(r), heap O(1), stack O(1)
// vars: r = 규칙 수
// basis: estimate
// `.fl .cr-K { animation: aN 12s ..., aM 12s ... }`에서 애니메이션 이름들과 한 바퀴 길이(ms)
function animationsOf(css, selector) {
  const decl = new RegExp(`${selector.replaceAll('.', '\\.')} \\{ animation: ([^;]*);`).exec(css)[1];
  return { names: [...decl.matchAll(/(a\d+) [\d.]+s/g)].map((m) => m[1]), total: parseFloat(/[\d.]+(?=s )/.exec(decl)[0]) * MS_PER_SECOND };
}

test('toSvg_heat_cell_text_keeps_contrast_4_5_on_the_cell_face_in_every_60fps_frame_of_every_step_change', async () => {
  const svg = await toSvg(await buildFigure(SOURCE));
  const css = /<style>([^]*?)<\/style>/.exec(svg)[1];
  const cells = [...svg.matchAll(/class="chart-heat" style="--s:([\d.]+)"[^]*?class="cr-(\d+) ink chart-cell( on)?"/g)];
  assert.equal(cells.length, 6);

  for (const theme of ['light', 'dark']) {
    const color = (name) => themeColor(theme, name);
    const resolve = (value) => (value.startsWith('var(--color-data-heat-ink-on)') ? color('data.heat-ink-on') : color('data.heat-ink'));
    let frames = 0;
    for (const [, strength, k, on] of cells) {
      const inkOf = (value) => (value === 'var(--ink)' ? (on ? color('data.heat-ink-on') : color('data.heat-ink')) : resolve(value));
      const face = animationsOf(css, `.fl .cr-${k}`);
      const text = animationsOf(css, `.fl .cr-${k}.ink`);
      const fill = mixHex(color('data.heat-low'), color('data.heat-high'), Number(strength));
      for (let ms = 0; ms < face.total; ms += MS_PER_SECOND / FPS) {
        const at = (ms / face.total) * PERCENT;
        const faceProps = new Map(face.names.flatMap((n) => [...sample(stopsOf(css, n), at, inkOf)]));
        const textProps = new Map(text.names.flatMap((n) => [...sample(stopsOf(css, n), at, inkOf)]));
        const facePaint = mixHex(color('bg'), fill, Number(faceProps.get('opacity') ?? 1));
        const textPaint = mixHex(facePaint, inkOf(textProps.get('fill') ?? 'var(--ink)'), Number(textProps.get('opacity') ?? 1));
        const ratio = contrast(textPaint, facePaint);
        assert.ok(ratio >= TEXT, `${theme} cell ${k} strength ${strength} at ${ms.toFixed(0)}ms: ${ratio.toFixed(2)}`);
        frames++;
      }
    }
    assert.ok(frames > cells.length * FPS, `${theme} sampled ${frames} frames`);
  }
});

test('chartCss_heat_cell_face_and_text_change_at_once_without_a_fade', () => {
  const css = readFileSync(new URL('../src/styles/chart.css', import.meta.url), 'utf8');

  assert.match(css, /\.fl \.chart-heat-cell,\s*\.fl \.chart-cell\.ink \{\s*transition: none;/);
});
