// 스크립트 없이 움직이는 SVG 한 장. GitHub README, PR, 블로그에 이미지로 넣는다.
// 모든 단계를 한 줄로 이어 반복한다. 버튼, 일시정지, 마우스 반응은 없다.
// 켜짐/꺼짐 순서가 같은 요소끼리 CSS keyframes 하나를 나눠 쓴다.
import { renderScene } from './render.js';
import { DEFS, STYLES } from './styles.js';
import { escapeXml, measureText, roundCoord, wrapText } from './text.js';
import { tokens, values } from './tokens.js';

const SPACE = values.space;
const LINE = values.size.line;
const MIN_WIDTH = values.size['figure-min'];
const CAPTION_SIZE = values.size.text['13-5'];
const CHIP_SIZE = values.size.text['11-5'];
// 설명 줄바꿈 너비는 그림 너비에서 양쪽 여백을 뺀 값이다.
const CAPTION_INSET = SPACE['30'];
// 켜짐 구간 끝을 다음 구간 시작보다 이만큼(ms) 앞당긴다. 같은 퍼센트에 두 값이 겹치지 않게 하기 위해서다.
const EPSILON_MS = 0.1;

// cost: time O(g·b + b·h), heap O(out), stack O(1)
// vars: g = 켜고 끄는 요소 수, b = 박자 수, h = 박자마다 이동 수, out = 만든 SVG 글자 수
// basis: estimate
// alt: 요소마다 keyframes. time 같음, heap O(g·b). 잃는 것: 같은 순서를 나눠 쓰는 절약
/** 장면과 시간표로 움직이는 SVG 문서를 만든다. */
export function toAnimatedSvg(scene, tl) {
  const animator = createAnimator(tl);
  const body = renderScene(scene, (kind, i, extra) => animator.decorate(kind, i, extra));
  const packets = tl.segs.flatMap((seg, si) => seg.hops.map((hop, hi) => drawPacket(animator, seg, hop, `p${si}-${hi}`)));
  const W = Math.max(scene.width, MIN_WIDTH);
  const captions = [...new Set(tl.segs.map((s) => s.caption))].filter(Boolean);
  const captionLines = Math.max(1, ...captions.map((c) => wrapText(c, W - CAPTION_INSET, CAPTION_SIZE).length));
  // 설명이 하나도 없으면 단계 이름 한 줄 자리만 둔다.
  const captionH = !tl.segs.length ? 0 : captions.length ? SPACE['17'] + captionLines * LINE['20'] : SPACE['15'];
  const H = scene.height + captionH;
  const stepLabels = tl.steps.map((label, si) => {
    const cls = animator.animationClass(animator.mapSegs((s) => s.si === si), 'opacity: 1', 'opacity: 0', 's');
    return `<text x="${roundCoord(W / 2)}" y="${roundCoord(scene.height + SPACE['9'])}" opacity="0" class="steplabel ${cls}">${escapeXml(label)}</text>`;
  });
  const said = captions.map((text) => {
    const cls = animator.animationClass(animator.mapSegs((s) => s.caption === text), 'opacity: 1', 'opacity: 0', 'y');
    const lines = wrapText(text, W - CAPTION_INSET, CAPTION_SIZE).map(
      (line, li) => `<text x="${roundCoord(W / 2)}" y="${roundCoord(scene.height + SPACE['22'] + li * LINE['20'])}" class="caption">${escapeXml(line)}</text>`,
    );
    return `<g opacity="0" class="${cls}">${lines.join('')}</g>`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" class="fl" width="${roundCoord(W)}" height="${roundCoord(H)}" viewBox="0 0 ${roundCoord(W)} ${roundCoord(H)}">
<style>${STYLES.tokens}${STYLES.figure}${STYLES.animated}
${animator.css.join('\n')}
</style>
<defs>${DEFS}</defs>
<rect width="100%" height="100%" fill="${tokens.color.bg}"/><rect width="100%" height="100%" fill="url(#fl-dots)"/>
<g transform="translate(${roundCoord((W - scene.width) / 2)} 0)">
${body}
${packets.join('\n')}
</g>
${stepLabels.join('\n')}
${said.join('\n')}
</svg>
`;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 박자별 켜짐/꺼짐을 CSS keyframes class로 바꾼다. 같은 켜짐 순서는 class 하나를 나눠 쓴다.
function createAnimator({ segs, total }) {
  const duration = `${roundCoord(total / 1000)}s`;
  const css = [];
  const names = new Map();
  const toPercent = (ms) => `${Math.round((ms / total) * 100000) / 1000}%`;
  const mapSegs = (predicate) => segs.map(predicate);
  const edgeStates = (j) => mapSegs((s) => s.edgesOn.includes(j));

  // cost: time O(b), heap O(b), stack O(1)
  // vars: b = 박자 수
  // basis: estimate
  // states[i]는 박자 i의 켜짐이다. [앞, 뒤] 쌍이면 박자 안 cardsAt에서 앞 상태가 뒤 상태로 바뀐다.
  function animationClass(states, onCss, offCss, prefix) {
    if (!segs.length) return '';
    const windows = segs.flatMap((s, i) => {
      const [before, after] = Array.isArray(states[i]) ? states[i] : [states[i], states[i]];
      const at = s.t0 + s.cardsAt;
      return at > s.t0 && before !== after ? [[s.t0, at, before], [at, s.t1, after]] : [[s.t0, s.t1, after]];
    });
    const key = prefix + windows.map(([start, , isOn]) => `${Math.round(start)}${isOn ? 1 : 0}`).join('');
    if (!names.has(key)) {
      const name = `a${names.size}`;
      names.set(key, name);
      const frames = windows.map(([start, end, isOn]) => `${toPercent(start)},${toPercent(Math.max(start, end - EPSILON_MS))} { ${isOn ? onCss : offCss} }`).join(' ');
      css.push(`@keyframes ${name} { ${frames} }\n.fl .${name} { animation: ${name} ${duration} infinite step-end; }`);
    }
    return names.get(key);
  }

  // cost: time O(b·m), heap O(b), stack O(1)
  // vars: b = 박자 수, m = 박자의 밝은 선·도형 수
  // basis: estimate
  // renderScene이 요소마다 부르는 decorate. kind마다 켜질 때와 꺼질 때의 모양이 다르다.
  function decorate(kind, i, extra) {
    switch (kind) {
      case 'node':
        return animationClass(mapSegs((s) => s.nodesOn.includes(i)), `stroke: ${tokens.color.accent}`, `stroke: ${tokens.color.border}`, 'n');
      case 'edge': {
        const markers = (id) => `${extra.hasEndArrow ? `; marker-end: url(#${id})` : ''}${extra.hasStartArrow ? `; marker-start: url(#${id})` : ''}`;
        const prefix = `e${Number(extra.hasEndArrow)}${Number(extra.hasStartArrow)}`;
        const on = `stroke: ${tokens.color.accent}; stroke-width: ${tokens.border.strong}${markers('fl-arrow-on')}`;
        const off = `stroke: ${tokens.color.muted}; stroke-width: ${tokens.border.edge}${markers('fl-arrow')}`;
        return animationClass(edgeStates(i), on, off, prefix);
      }
      case 'quiet':
        return animationClass(edgeStates(i), 'opacity: 1', 'opacity: 0', 'q');
      case 'pill':
        return animationClass(edgeStates(i), `fill: ${tokens.color.accent}; stroke: ${tokens.color.accent}`, `fill: ${tokens.color.bg}; stroke: ${tokens.color.border}`, 'l');
      case 'pilltext':
        return animationClass(edgeStates(i), `fill: ${tokens.color['on-accent']}`, `fill: ${tokens.color.muted}`, 'x');
      case 'card':
        return animationClass(
          mapSegs((s) => [s.cardsBefore[i] !== undefined, s.cards[i] !== undefined]),
          `stroke: ${tokens.color.accent}; fill: ${tokens.color['card-on']}`,
          `stroke: ${tokens.color.border}; fill: ${tokens.color.surface}`,
          'c',
        );
      case 'layer':
        return animationClass(mapSegs((s) => [s.cardsBefore[i] === extra, s.cards[i] === extra]), 'opacity: 1', 'opacity: 0', 'v');
      case 'empty':
        return animationClass(mapSegs((s) => [s.cardsBefore[i] === undefined, s.cards[i] === undefined]), 'opacity: 1', 'opacity: 0', 'v');
      default:
        return '';
    }
  }

  return { css, toPercent, mapSegs, animationClass, decorate, total, duration };
}

// 점 하나가 한 박자 동안 선을 건너고, 실어 보내는 글은 점 위의 작은 상자로 따라간다.
function drawPacket(animator, seg, hop, name) {
  const { toPercent, total, duration } = animator;
  const end = seg.t0 + seg.move;
  animator.css.push(
    `@keyframes ${name} { 0%,${toPercent(seg.t0)} { opacity: 0 } ${toPercent(seg.t0 + EPSILON_MS)},${toPercent(end - EPSILON_MS)} { opacity: 1 } ${toPercent(end)},100% { opacity: 0 } }\n` +
      `.fl .${name} { animation: ${name} ${duration} infinite step-end; }`,
  );
  const keyTimes = `0;${round4(seg.t0 / total)};${round4(end / total)};1`;
  return (
    `<g class="${name}" opacity="0"><circle r="${values.size.halo}" fill="${tokens.color.accent}" opacity="${values.opacity.halo}"/><circle r="${values.size.packet}" fill="${tokens.color.accent}"/>${hop.data ? drawChip(hop.data) : ''}` +
    `<animateMotion dur="${duration}" repeatCount="indefinite" calcMode="linear" keyTimes="${keyTimes}" keyPoints="${hop.isBack ? '1;1;0;0' : '0;0;1;1'}">` +
    `<mpath href="#p-${hop.edge}" xlink:href="#p-${hop.edge}"/></animateMotion></g>`
  );
}

// cost: time O(n²), heap O(n), stack O(1)
// vars: n = 글자 수
// basis: estimate
// 점 위에 뜨는 글 상자. size.chip-max보다 길면 줄을 나눈다.
function drawChip(data) {
  const size = CHIP_SIZE;
  const lines = wrapChip(data);
  const w = Math.max(...lines.map((line) => measureText(line, size))) + SPACE['9'];
  const h = lines.length * LINE['15'] + SPACE['4'];
  const top = -h - SPACE['6'];
  return (
    `<rect x="${roundCoord(-w / 2)}" y="${roundCoord(top)}" width="${roundCoord(w)}" height="${roundCoord(h)}" rx="${values.radius.lg}" fill="${tokens.color.accent}"/>` +
    lines.map((line, li) => `<text x="0" y="${roundCoord(top + LINE['15'] * (li + 1))}" class="chip">${escapeXml(line)}</text>`).join('')
  );
}

// cost: time O(n²), heap O(n), stack O(1)
// vars: n = 글자 수
// basis: estimate
/** 글 상자 글을 size.chip-max 너비로 나눈 줄. HTML 재생기도 같은 줄을 쓴다. */
export function wrapChip(data) {
  return wrapText(String(data), values.size['chip-max'], CHIP_SIZE);
}

function round4(value) {
  return Math.round(value * 10000) / 10000;
}
