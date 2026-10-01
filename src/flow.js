// `#@` 줄을 읽어 단계(step)와 박자(beat)로 만든다. D2는 이 줄을 주석으로 보고 무시한다.
import { parseMiniGraph } from './minigraph.js';
import { values } from './tokens.js';

const DIRECTIVE = /^\s*#@\s?(.*)$/;
const HEADS = ['step', 'say', 'wait', 'light', 'speed', 'show', 'edges', 'quiet'];
const EDGE_MODES = ['curve', 'd2'];
const TONES = Object.keys(values.color.tag);
const DEFAULT_SPEED_MS = values.duration.hop;

/** 흐름 줄의 오류. 메시지 앞에 원본 `.d2` 파일의 줄 번호를 붙인다. */
export class FlowError extends Error {
  constructor(line, message) {
    super(`${line}번째 줄: ${message}`);
    this.line = line;
  }
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 원본 글자 수
// basis: estimate
/**
 * 원본에서 흐름을 읽는다.
 * @returns {{ speed, edges: 'curve' | 'd2', quiet: { isAll, hops, line }, steps: { label, caption?, line, beats: Beat[] }[] }}
 *   quiet: 쓰는 단계에서만 보이는 선. isAll이면 모든 선이다
 *   Beat: { hops: { from, to, index?, data? }[], light: string[], say?, ms?, show?: { [이름]: { line, rows } }, line }
 * @throws FlowError 형식이 틀린 줄, 첫 step 앞의 박자 줄
 */
export function parseFlow(source) {
  const flow = { speed: DEFAULT_SPEED_MS, edges: 'd2', quiet: { isAll: false, hops: [], line: 0 }, steps: [] };
  source.split('\n').forEach((raw, i) => {
    const text = DIRECTIVE.exec(raw)?.[1].trim();
    if (text) readDirective(flow, text, i + 1);
  });
  return flow;
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 줄 글자 수
// basis: estimate
// 흐름 줄 하나를 읽어 flow에 더한다.
function readDirective(flow, text, line) {
  const [head, rest] = splitHead(text);
  if (head === 'speed') {
    flow.speed = parseMoveMs(rest, line);
    return;
  }
  if (head === 'edges') {
    if (!EDGE_MODES.includes(rest)) throw new FlowError(line, 'edges는 curve나 d2다');
    flow.edges = rest;
    return;
  }
  if (head === 'step') {
    flow.steps.push(parseStep(rest, line));
    return;
  }
  // `quiet`만 적으면 모든 선, `quiet a -> b & c -> d`면 적은 선만 조용한 선이다.
  if (head === 'quiet') {
    if (!rest) flow.quiet.isAll = true;
    else flow.quiet.hops.push(...splitByAmp(tokenize(rest, line)).map((group) => ({ ...parseHop(group, line), line })));
    return;
  }
  const step = flow.steps.at(-1);
  if (!step) throw new FlowError(line, '첫 step 앞에 박자가 있다');
  if (head === 'show') addCardRow(step, rest, line);
  else step.beats.push(parseBeat(head, rest, text, line));
}

function parseStep(rest, line) {
  const [label, caption] = splitColon(rest);
  if (!label) throw new FlowError(line, 'step에 이름이 없다');
  return { label: unquote(label), caption: caption && unquote(caption), line, beats: [] };
}

// 카드 줄은 바로 앞 박자에 붙는다. 앞 박자가 없으면 멈추는 박자를 하나 만든다.
function addCardRow(step, rest, line) {
  const [node, row] = splitHead(rest, { isAnyHead: true });
  if (!node) throw new FlowError(line, 'show 뒤에 도형 이름이 없다');
  if (!step.beats.length) step.beats.push({ hops: [], light: [], line });
  const beat = step.beats.at(-1);
  beat.show ??= {};
  beat.show[node] ??= { line, rows: [] };
  if (!row) return;
  try {
    beat.show[node].rows.push(parseRow(row));
  } catch (error) {
    throw new FlowError(line, error.message);
  }
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 줄 글자 수
// basis: estimate
function parseBeat(head, rest, text, line) {
  const beat = { hops: [], light: [], line };
  if (head === 'say') {
    beat.say = unquote(rest);
    return beat;
  }
  const [left, say] = splitColon(head === 'light' || head === 'wait' ? rest : text);
  if (say) beat.say = unquote(say);
  // `+3s`처럼 적으면 이 박자만 그 시간 동안 이어진다.
  const tokens = tokenize(left, line).filter((t) => {
    const time = t.kind === 'word' && /^\+(\d+\s*(?:ms|s)?)$/.exec(t.value);
    if (time) beat.ms = parseMoveMs(time[1], line);
    return !time;
  });
  if (head === 'wait') {
    if (tokens.length > 1) throw new FlowError(line, 'wait 뒤에는 시간 하나만 적는다');
    if (tokens.length) beat.ms = parseMs(tokens[0].value, line);
    return beat;
  }
  if (head === 'light') {
    beat.light = tokens.map((t) => t.value);
    return beat;
  }
  beat.hops = splitByAmp(tokens).map((group) => parseHop(group, line));
  return beat;
}

// `a -> b "글"` 하나. `<-`는 방향을 뒤집어 읽는다.
function parseHop(tokens, line) {
  const [a, arrow, b, data, extra] = tokens;
  const isHopShape = a?.kind === 'word' && arrow?.kind === 'arrow' && b?.kind === 'word';
  if (!isHopShape || extra) throw new FlowError(line, '이동은 `보내는쪽 -> 받는쪽 ["실어 보낼 글"]` 형식이다');
  if (data && data.kind !== 'str') throw new FlowError(line, `실어 보낼 글은 따옴표로 감싼다: ${data.value}`);
  // 같은 두 도형 사이에 선이 여럿이면 `a -> b[1]`처럼 몇 번째 선인지 적는다.
  const index = /\[(\d+)\]$/.exec(b.value)?.[1];
  const [first, second] = [a.value, b.value.replace(/\[\d+\]$/, '')];
  const [from, to] = arrow.value === '->' ? [first, second] : [second, first];
  return { from, to, index: index === undefined ? undefined : Number(index), data: data?.value };
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 글자 수
// basis: estimate
// 낱말(word), 따옴표 글(str), 화살표(arrow), `&`(amp)로 나눈다.
function tokenize(text, line) {
  const tokens = [];
  const isArrowAt = (i) => text.startsWith('->', i) || text.startsWith('<-', i);
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (/\s/.test(c)) {
      i++;
    } else if (c === '"') {
      const [value, end] = readQuoted(text, i, line);
      tokens.push({ kind: 'str', value });
      i = end;
    } else if (isArrowAt(i)) {
      tokens.push({ kind: 'arrow', value: text.slice(i, i + 2) });
      i += 2;
    } else if (c === '&') {
      tokens.push({ kind: 'amp', value: '&' });
      i++;
    } else {
      let j = i;
      while (j < text.length && !/[\s"&]/.test(text[j]) && !isArrowAt(j)) j++;
      tokens.push({ kind: 'word', value: text.slice(i, j) });
      i = j;
    }
  }
  return tokens;
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 따옴표 안 글자 수
// basis: estimate
// start 자리의 따옴표부터 닫는 따옴표까지. `\`는 다음 글자를 그대로 넣는다.
function readQuoted(text, start, line) {
  let value = '';
  let j = start + 1;
  while (j < text.length && text[j] !== '"') {
    if (text[j] === '\\' && j + 1 < text.length) j++;
    value += text[j];
    j++;
  }
  if (j >= text.length) throw new FlowError(line, '따옴표가 닫히지 않았다');
  return [value, j + 1];
}

// cost: time O(k), heap O(k), stack O(1)
// vars: k = 낱말 수
// basis: estimate
function splitByAmp(tokens) {
  const groups = [[]];
  for (const t of tokens) {
    if (t.kind === 'amp') groups.push([]);
    else groups.at(-1).push(t);
  }
  return groups;
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 글자 수
// basis: estimate
// 따옴표 밖의 첫 `:`에서 나눈다.
function splitColon(text) {
  let isQuoted = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"' && text[i - 1] !== '\\') isQuoted = !isQuoted;
    if (text[i] === ':' && !isQuoted) return [text.slice(0, i).trim(), text.slice(i + 1).trim()];
  }
  return [text.trim(), undefined];
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 글자 수
// basis: estimate
// 첫 낱말이 줄 종류(HEADS)이면 떼어 낸다. isAnyHead면 첫 낱말을 무조건 떼어 낸다.
function splitHead(text, { isAnyHead = false } = {}) {
  const m = /^(\S+)\s*(.*)$/.exec(text);
  if (!m) return ['', ''];
  return isAnyHead || HEADS.includes(m[1]) ? [m[1], m[2]] : ['', text];
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 줄 글자 수
// basis: estimate
/**
 * 카드 한 줄 `[태그/색] 글 · 덧붙임 (표시)`를 읽는다. 글을 `로 감싸면 고정폭 글꼴이다.
 * `graph 가 -> 나 ; 가`로 시작하면 작은 관계 그래프 한 줄이다(minigraph.js).
 * @returns { text, tag?, tone?, meta?, mark?, isMono? } 또는 { graph }
 * @throws Error graph 줄의 관계에 이름이 빠졌을 때
 */
export function parseRow(text) {
  let rest = text.trim();
  if (rest.startsWith('graph ')) return { graph: parseMiniGraph(rest.slice('graph '.length)) };
  const row = {};
  const tag = /^\[([^\]/]+)(?:\/(\w+))?\]\s*/.exec(rest);
  if (tag) {
    row.tag = tag[1].trim();
    if (TONES.includes(tag[2])) row.tone = tag[2];
    rest = rest.slice(tag[0].length);
  }
  const mark = /\s*\(([^()]{1,8})\)$/.exec(rest);
  if (mark) {
    row.mark = mark[1];
    rest = rest.slice(0, mark.index);
  }
  // 글 전체를 `로 감쌌으면 안의 ` · `도 글이다. 덧붙임을 떼기 전에 먼저 본다.
  if (readMono(rest) === undefined) {
    const metaAt = rest.indexOf(' · ');
    if (metaAt >= 0) {
      row.meta = rest.slice(metaAt + 3).trim();
      rest = rest.slice(0, metaAt);
    }
  }
  const mono = readMono(rest);
  row.text = mono ?? unquote(rest);
  if (mono !== undefined) row.isMono = true;
  return row;
}

// 글 전체를 `로 감쌌으면 안의 글, 아니면 undefined
function readMono(text) {
  return /^`([^`]*)`$/.exec(text.trim())?.[1];
}

function unquote(text) {
  const t = text.trim();
  const isQuoted = t.length > 1 && t.startsWith('"') && t.endsWith('"');
  return isQuoted ? t.slice(1, -1).replace(/\\(.)/g, '$1') : t;
}

// 점이 선을 지나는 시간. 0이면 점의 위치를 0으로 나눠 구하게 되어 막는다.
function parseMoveMs(text, line) {
  const ms = parseMs(text, line);
  if (ms <= 0) throw new FlowError(line, `이동 시간은 0보다 커야 한다: ${text}`);
  return ms;
}

// `900`, `900ms`, `2s`를 밀리초로 바꾼다.
function parseMs(text, line) {
  const m = /^(\d+)\s*(ms|s)?$/.exec(text.trim());
  if (!m) throw new FlowError(line, `시간은 900, 900ms, 2s 형식이다: ${text}`);
  return Number(m[1]) * (m[2] === 's' ? 1000 : 1);
}
