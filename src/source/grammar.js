// 문법 정본. 낱말, 선택 사항, 값 목록, 기본값, 판(since), 폐기 정보를 이 표 한 곳에만 둔다.
// 파서, 검증, 오류 메시지, 문서 표(docs/design/figure-syntax.md의 호환 규칙 절)가 모두 이 표를 읽는다.
// 항목은 { since }를 기본으로 갖는다. 기능 추가는 이 표에 항목을 더하는 일이다.

/** 이 도구가 읽는 가장 높은 문법 판. 깨지는 변경에만 올린다. */
export const VERSION = 1;
/** 첫 줄에 판 표기(`mutoscope 1`)가 없을 때 읽는 판. 판 표기가 생기기 전 파일이 모두 이 판이다. */
export const DEFAULT_VERSION = 1;

// 원형이 없는 표. `constructor` 같은 낱말이 표 항목으로 잡히지 않게 한다.
const table = (entries) => Object.assign(Object.create(null), entries);

const V1 = { since: 1 };
const FLAG = { ...V1, type: 'flag' };
const TEXT = { ...V1, type: 'text' };

/** 그림 종류 문장. argument는 둘째 낱말이 읽는 값 목록 이름이다. */
export const KINDS = table({
  flow: { ...V1, argument: 'direction' },
  sequence: { ...V1 },
  state: { ...V1, argument: 'direction' },
  data: { ...V1, argument: 'direction' },
  chart: { ...V1, argument: 'chartType', isArgumentRequired: true },
});

/** `decimals` 머리 줄이 받는 소수 자릿수의 상한. 값 글자의 자동 자릿수도 이 값까지만 쓴다. */
export const DECIMALS_MAX = 6;

const ALL_KINDS = Object.keys(KINDS);
const FLOW_SEQUENCE = ['flow', 'sequence'];

/**
 * 값 목록. items의 항목마다 { since, deprecated? }를 둘 수 있다.
 * 차트 종류의 firstRole은 계열을 보이는 순서에서 먼저 오는 역할이다(기본 main). role을 생략한 계열은 선언 순서대로 이 순서의 역할을 받는다.
 * deprecated: { since, replace, note? }는 옛 이름이다. 문장 낱말, 선택 사항 키, 값, 그림 종류 어디에 있든 같다. 계속 읽고, replace로 바꿔 읽고, 폐기 진단과 고칠 글(fix)을 낸다.
 */
export const VALUES = {
  direction: { default: 'right', items: table({ right: V1, down: V1 }) },
  scale: { default: 'linear', items: table({ linear: V1, log: V1 }) },
  chartType: {
    items: table({
      bar: { ...V1, rowWord: 'row', seriesRange: [1, 2], isInterval: true },
      dumbbell: { ...V1, rowWord: 'row', seriesRange: [2, 2], isInterval: true, firstRole: 'compare' },
      box: { ...V1, rowWord: 'row', seriesRange: [0, 0], valueKeys: ['min', 'q1', 'median', 'q3', 'max'] },
      scatter: { ...V1, rowWord: 'point', seriesRange: [0, 2] },
      line: { ...V1, rowWord: 'point', seriesRange: [1, 2], isInterval: true },
      heatmap: { ...V1, rowWord: 'cell', seriesRange: [0, 0] },
    }),
  },
  tone: {
    items: table({
      purple: V1,
      green: V1,
      teal: V1,
      gray: V1,
      blue: { ...V1, deprecated: { since: 1, replace: 'teal', note: 'Tag colors are categories now. Blue means the active state and orange means compare' } },
      orange: { ...V1, deprecated: { since: 1, replace: 'purple', note: 'Tag colors are categories now. Blue means the active state and orange means compare' } },
    }),
  },
  role: { items: table({ main: V1, compare: V1 }) },
};

/**
 * 문장 낱말. section은 파일 부분(version, header, declare, timeline), kinds는 쓸 수 있는 그림 종류다.
 * display는 문서에 적는 꼴이다(선 줄은 첫 낱말이 이름이라 낱말로 가를 수 없다). node는 도형 선언이고 hasSub는 부제를 받는지, scopes는 선택 사항을 찾을 OPTIONS 범위(기본은 낱말 자신)다.
 * positional은 낱말 뒤 자리별 값 목록 이름이다.
 */
export const STATEMENTS = table({
  mutoscope: { ...V1, section: 'version', kinds: ALL_KINDS },
  title: { ...V1, section: 'header', kinds: ALL_KINDS },
  subtitle: { ...V1, section: 'header', kinds: ALL_KINDS },
  speed: { ...V1, section: 'header', kinds: ALL_KINDS },
  aspect: { ...V1, section: 'header', kinds: ['flow', 'state', 'data'] },
  x: { ...V1, section: 'header', kinds: ['chart'] },
  y: { ...V1, section: 'header', kinds: ['chart'] },
  scale: { ...V1, section: 'header', kinds: ['chart'], positional: ['scale'] },
  decimals: { ...V1, section: 'header', kinds: ['chart'] },
  person: { ...V1, section: 'declare', kinds: FLOW_SEQUENCE, node: { hasSub: false } },
  box: { ...V1, section: 'declare', kinds: FLOW_SEQUENCE, node: { hasSub: true } },
  external: { ...V1, section: 'declare', kinds: FLOW_SEQUENCE, node: { hasSub: true } },
  store: { ...V1, section: 'declare', kinds: FLOW_SEQUENCE, node: { hasSub: true } },
  decision: { ...V1, section: 'declare', kinds: ['flow'], node: { hasSub: false } },
  state: { ...V1, section: 'declare', kinds: ['state'], node: { hasSub: false } },
  group: { ...V1, section: 'declare', kinds: ['flow', 'state'] },
  start: { ...V1, section: 'declare', kinds: ['state'] },
  final: { ...V1, section: 'declare', kinds: ['state'] },
  table: { ...V1, section: 'declare', kinds: ['data'] },
  edge: { ...V1, section: 'declare', kinds: ['flow', 'state'], display: 'a -> b' },
  series: { ...V1, section: 'declare', kinds: ['chart'] },
  rule: { ...V1, section: 'declare', kinds: ['chart'] },
  missing: { ...V1, section: 'declare', kinds: ['chart'] },
  data: { ...V1, section: 'declare', kinds: ['chart'] },
  row: { ...V1, section: 'declare', kinds: ['chart'] },
  point: { ...V1, section: 'declare', kinds: ['chart'] },
  cell: { ...V1, section: 'declare', kinds: ['chart'] },
  link: { ...V1, section: 'declare', kinds: ['chart'] },
  hop: { ...V1, section: 'timeline', kinds: ['flow', 'sequence', 'state', 'data'], display: 'a -> b' },
  step: { ...V1, section: 'timeline', kinds: ALL_KINDS },
  show: { ...V1, section: 'timeline', kinds: ['flow', 'data'], scopes: ['show', 'graph'] },
  clear: { ...V1, section: 'timeline', kinds: ['flow', 'data'] },
  light: { ...V1, section: 'timeline', kinds: ['flow', 'state', 'data', 'chart'] },
  note: { ...V1, section: 'timeline', kinds: ['sequence'] },
  reveal: { ...V1, section: 'timeline', kinds: ['chart'] },
  say: { ...V1, section: 'timeline', kinds: ALL_KINDS },
  wait: { ...V1, section: 'timeline', kinds: ALL_KINDS },
});

/**
 * 선택 사항. 키는 `범위.이름`이고 type은 word, text, number, flag다.
 * values는 값 목록 이름, format은 값 목록이 없는 낱말 값의 문서용 이름, maxLength는 글자 수 상한이다. 값 없는 낱말(flag)은 폐기 별칭을 두지 않는다. 이름 자리의 낱말과 가를 수 없기 때문이다.
 */
export const OPTIONS = table({
  'group.direction': { ...V1, type: 'word', values: 'direction' },
  'hop.time': { ...V1, type: 'word', format: '시간' },
  'hop.dashed': FLAG,
  'edge.quiet': FLAG,
  'edge.dashed': FLAG,
  'show.tag': TEXT,
  'show.tone': { ...V1, type: 'word', values: 'tone' },
  'show.meta': TEXT,
  'show.mark': { ...TEXT, maxLength: 8 },
  'show.mono': FLAG,
  'graph.lit': TEXT,
  'series.role': { ...V1, type: 'word', values: 'role' },
  'series.key': TEXT,
  'point.series': { ...V1, type: 'word', format: '계열 이름' },
  'light.x': { ...V1, type: 'number', format: '숫자' },
  'column.pk': FLAG,
  'column.unique': FLAG,
  'column.fk': { ...V1, type: 'word', format: '테이블.열' },
});

// cost: time O(o), heap O(o), stack O(1)
// vars: o = 선택 사항 수
// basis: estimate
/** 한 범위의 선택 사항을 { 이름: 항목 }으로. */
export function optionsOf(scope) {
  const prefix = `${scope}.`;
  return table(Object.fromEntries(Object.entries(OPTIONS).filter(([key]) => key.startsWith(prefix)).map(([key, spec]) => [key.slice(prefix.length), spec])));
}

// cost: time O(o), heap O(o), stack O(1)
// vars: o = 선택 사항 수
// basis: estimate
/** 한 범위의 값 없는 선택 사항(flag) 이름. */
export function flagNames(scope) {
  return Object.entries(optionsOf(scope)).filter(([, spec]) => spec.type === 'flag').map(([name]) => name);
}

// cost: time O(v), heap O(v), stack O(1)
// vars: v = 값 목록의 값 수
// basis: estimate
/** 값 목록에서 지금 쓸 수 있는 값(폐기 값을 뺀다). */
export function valueNames(list) {
  return Object.entries(VALUES[list].items).filter(([, item]) => !item.deprecated).map(([name]) => name);
}
