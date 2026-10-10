// 값에 묶인 차트의 프레임 전환을 움직이는 SVG에 옮긴다. 프레임마다 달라지는 표식(chart-frames.js가 data-mark로 가렸다)에 구간 시작에서 속성이 바뀌는 SMIL을 건다.
// 바뀌는 속성마다 이산 animate 하나이고, 글이 바뀌는 표식은 SMIL로 글을 바꿀 수 없어 글마다 요소를 한 벌씩 두고 보임 창으로 바꾼다(값 글자와 같은 방식).
// 원자료가 바뀐 표식에는 펄스(80/80/240ms, 겹치면 최댓값)를 건 겹침을 얹는다(chart/pulse-overlay.js: 표식의 계열 옅은 면과 계열 테두리, 글은 뒤에 번지는 후광). HTML 재생기도 같은 겹침을 쓴다.
// 정지(static) 시계는 마지막 프레임의 속성과 글을 그대로 적는다.
import { tokenize } from '../chart-tokens.js';
import { IDENTITY } from '../chart/frames.js';
import { GEOMETRY_ATTRS, hasPulse, pulseOverlay } from '../chart/pulse-overlay.js';
import { escapeXml } from '../text.js';
import { discreteWindows } from './discrete.js';
import { pulseAnimate } from './pulse.js';

// cost: time O(m·p), heap O(out), stack O(1)
// vars: m = 표식 수, p = 구간 수, out = 만든 SVG 글자 수
// basis: estimate
/**
 * 표식 id가 붙은 차트 그림에 프레임 전환 SMIL을 더한다.
 * @param body 표식 id가 붙은 처음 그림(scene.chartFrames를 만든 body)
 * @param context { id, chartFrames, rows, clock, pulses }. rows는 이 장면의 시간표 행(시각은 장면 시작이 0이다), pulses는 이 장면의 펄스 [{ key, at }]다
 */
export function animateFrameBody(body, { id, chartFrames, rows, clock, pulses }) {
  const periods = rows.flatMap((row) => row.periods);
  if (!periods.length || !chartFrames.marks.length) return body;
  const tokens = tokenize(body);
  const where = new Map();
  tokens.forEach((t, i) => {
    const mark = t.attrs?.find(([name]) => name === 'data-mark' || name === 'data-mark-text');
    if (mark) where.set(mark[1], i);
  });
  let out = '';
  let at = 0;
  for (const mark of chartFrames.marks) {
    const i = where.get(mark.id);
    if (i === undefined) continue;
    const token = tokens[i];
    // 다른 표식 요소 안에 든 표식은 바깥 요소가 이미 바꿨다.
    if (token.start < at) continue;
    const extent = elementEnd(tokens, i);
    const edit = clock.mode === 'static' ? finalElement(body, tokens, i, { chartFrames, mark, periods }) : movingElement(body, tokens, i, { chartFrames, mark, periods, clock, ats: pulses.filter((p) => p.key === `chart:${id}:${mark.id}`).map((p) => p.at) });
    out += body.slice(at, token.start) + edit;
    at = extent;
  }
  return out + body.slice(at);
}

// 요소 끝 글자 자리: 닫는 태그가 있으면 그 끝, 스스로 닫는 태그면 자기 끝
function elementEnd(tokens, i) {
  const t = tokens[i];
  return t.type === 'open' ? tokens[t.close].end : t.end;
}

// cost: time O(a), heap O(a), stack O(1)
// vars: a = 속성 수
// basis: estimate
// 마지막 프레임의 속성과 글로 쓴 요소 하나(정지 그림).
function finalElement(body, tokens, i, { chartFrames, mark, periods }) {
  const state = chartFrames.frames[periods.at(-1)[2]][mark.id];
  const token = tokens[i];
  const inner = token.type === 'open' ? (mark.tag === 'text' && state.text !== undefined ? state.text : body.slice(token.end, tokens[token.close].start)) : '';
  return openTag(token, state.attrs) + (token.type === 'open' ? `${inner}</${token.tag}>` : `</${token.tag}>`);
}

// 한 프레임의 속성으로 쓴 여는 태그. 이름 속성(IDENTITY)은 그림의 것이고 나머지는 이 프레임이 가진 속성만 쓴다(다른 프레임에만 있던 속성은 쓰지 않는다). skip에 든 속성은 쓰지 않는다.
// 스스로 닫는 태그도 안에 SMIL을 넣을 수 있게 여는 태그로 쓴다.
function openTag(token, attrs, skip = []) {
  const own = token.attrs.filter(([name]) => IDENTITY.has(name) || name in attrs).map(([name, value]) => [name, IDENTITY.has(name) ? value : attrs[name]]);
  const added = Object.entries(attrs).filter(([name]) => !token.attrs.some(([key]) => key === name));
  return `<${token.tag}${[...own, ...added].filter(([name]) => !skip.includes(name)).map(([name, value]) => ` ${name}="${value}"`).join('')}>`;
}

// cost: time O(a·p), heap O(out), stack O(1)
// vars: a = 속성 수, p = 구간 수
// basis: estimate
// 구간마다 속성이 바뀌는 요소 하나. 글이 바뀌는 표식은 글마다 요소를 한 벌씩 두고, 펄스를 받는 면 모양은 덧칠 면을 얹는다.
function movingElement(body, tokens, i, { chartFrames, mark, periods, clock, ats }) {
  const token = tokens[i];
  const states = periods.map(([from, , frame]) => [from, chartFrames.frames[frame][mark.id]]);
  // `aria-label`은 SMIL로 바꿀 수 없는 속성이다. 프레임마다 달라지면 처음 프레임의 설명이 굳어 값과 어긋나므로 요소에서 빼고(role도), 현재 값은 보이는 글 변형이 읽는다. HTML 재생기는 이 속성을 프레임마다 바꾼다.
  const isLabelMoving = new Set(states.map(([, s]) => s.attrs['aria-label'])).size > 1;
  const skip = isLabelMoving ? ['aria-label', 'role'] : [];
  // 프레임마다 값이 달라지는 속성. 어느 프레임에 없는 `visibility`는 보임이다. 다른 속성이 빠지면 SMIL로 되돌릴 수 없어 그리기의 결함이다.
  const valueOf = (state, name) => state.attrs[name] ?? (name === 'visibility' ? 'visible' : undefined);
  const varying = [...new Set(states.flatMap(([, s]) => Object.keys(s.attrs)))].filter((name) => !skip.includes(name) && new Set(states.map(([, s]) => valueOf(s, name))).size > 1);
  const gone = varying.find((name) => states.some(([, s]) => valueOf(s, name) === undefined));
  if (gone) throw new Error(`chart mark "${mark.id}" drops attribute "${gone}" in some frames, which an animated SVG cannot restore`);
  const isText = mark.tag === 'text';
  // 글 표식의 보임은 글 변형의 보임 창에 접는다. 안쪽 요소가 visible을 정하면 바깥 hidden을 이기기 때문이다.
  const names = isText ? varying.filter((name) => name !== 'visibility') : varying;
  const animate = (list) => list.map((name) => attributeAnimate(clock, name, states.map(([from, s]) => [from, valueOf(s, name)]))).join('');
  const animations = animate(names);
  const base = states[0][1];
  const attrs = Object.fromEntries(token.attrs.filter(([name]) => !(isText && name === 'visibility')).map(([name, value]) => [name, base.attrs[name] ?? value]));
  // 겹침은 표식의 위치와 모양 전환만 따라가고 불투명도는 펄스가 정한다. 칠은 표식이 싣고 온 계열 칠이다. 글 겹침의 보임은 글 변형의 보임 창이 정한다.
  const overlay = (inner) => (hasPulse(token.tag, attrs) && ats.length ? pulseOverlay({ tag: token.tag, attrs, inner, id: mark.id, children: animate(names.filter((name) => GEOMETRY_ATTRS.includes(name))) + pulseAnimate(clock, ats) }) : '');
  if (isText) {
    const texts = [...new Set(states.map(([, s]) => s.text))];
    // 글마다 묶음 g를 두고 묶음의 불투명도와 보임으로 켠다(보이지 않는 변형은 접근성 트리에도 없다). 글 요소 자신의 불투명도는 차트가 자라는 CSS 움직임이 쥐고 있다. 후광은 글 바로 앞에 놓여 글자가 위에 그려진다.
    // 표식이 숨은 프레임(visibility hidden)은 어느 변형도 켜지 않는다. 장면 끝(과 효과 꼬리)까지 남는 것은 마지막 프레임의 글 하나뿐이다: 끝에서 바뀐 앞 글이 남으면 두 글이 겹친다.
    const last = states.at(-1)[1];
    const holder = valueOf(last, 'visibility') === 'hidden' ? undefined : last.text;
    return texts.flatMap((text) => {
      const spans = periods.filter(([, , frame]) => chartFrames.frames[frame][mark.id].text === text && valueOf(chartFrames.frames[frame][mark.id], 'visibility') !== 'hidden').map(([from, to]) => [from, to]);
      if (!spans.length) return [];
      return [`<g opacity="0" visibility="hidden">${discreteWindows(clock, spans, { holdEnd: text === holder })}${overlay(escapeText(text))}${openTag(token, base.attrs, [...skip, 'visibility'])}${animations}${escapeText(text)}</${token.tag}></g>`];
    }).join('');
  }
  return `${openTag(token, base.attrs, skip)}${animations}${token.type === 'open' ? body.slice(token.end, tokens[token.close].start) : ''}</${token.tag}>${overlay('')}`;
}

// 글 요소 본문. 차트 그리기가 이미 이스케이프한 글이라 그대로 쓴다.
const escapeText = (text) => text ?? '';

// cost: time O(p), heap O(p), stack O(1)
// vars: p = 구간 수
// basis: estimate
// 속성 하나의 이산 전환. 같은 값이 이어지면 하나로 합치고, 첫 키는 한 바퀴 처음(0)이다.
function attributeAnimate(clock, name, timed) {
  const keys = [];
  for (const [from, value] of timed) {
    const key = Number(clock.keyTime(from));
    if (keys.length && keys.at(-1)[1] === value) continue;
    if (keys.length && key === keys.at(-1)[0]) keys.at(-1)[1] = value;
    else keys.push([key, value]);
  }
  if (keys[0][0] !== 0) keys.unshift([0, keys[0][1]]);
  return `<animate attributeName="${name}" dur="${clock.duration}" ${clock.smil} calcMode="discrete" keyTimes="${keys.map(([at]) => at).join(';')}" values="${keys.map(([, value]) => escapeXml(String(value))).join(';')}"/>`;
}
