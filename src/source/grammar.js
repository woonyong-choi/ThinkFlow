// 문법 정본. 낱말, 선택 사항, 값 목록, 기본값, 판(since), 폐기 정보를 이 표 한 곳에만 둔다.
// 파서, 검증, 오류 메시지, 문서 표(docs/design/figure-syntax.md의 호환 규칙 절)가 모두 이 표를 읽는다.
// 항목은 { since }를 기본으로 갖는다. 기능 추가는 이 표에 항목을 더하는 일이다.

/** 이 도구가 읽는 가장 높은 문법 판. 깨지는 변경에만 올린다. */
export const VERSION = 1;
/** 첫 줄에 판 표기(`daphnis 1`)가 없을 때 읽는 판. 판 표기가 생기기 전 파일이 모두 이 판이다. */
export const DEFAULT_VERSION = 1;

// 원형이 없는 표. `constructor` 같은 낱말이 표 항목으로 잡히지 않게 한다.
const table = (entries) => Object.assign(Object.create(null), entries);

const V1 = { since: 1 };
const FLAG = { ...V1, type: 'flag' };
const TEXT = { ...V1, type: 'text' };
/** 칸 격자의 정수 선택 사항. min은 받는 가장 작은 값이다(칸 위치는 0, 크기와 개수는 1). */
const COUNT = { ...V1, type: 'number', format: '양의 정수', min: 1 };
const INDEX = { ...V1, type: 'number', format: '0 이상 정수', min: 0 };
/** 아이콘 이름. 기본 세트의 이름(`server`)이거나 등록한 세트의 `세트:이름`이다. */
const ICON = { ...V1, type: 'word', format: '이름 또는 세트:이름' };
/** 같은 역할 복제 개수. 하나는 겹칠 것이 없어 2부터 받는다. */
const PLURAL = { ...V1, type: 'number', format: '2 이상 정수', min: 2 };
/** 도형 면, 테두리와 카드 바탕 색. 값은 `paint` 목록의 이름뿐이다. */
const PAINT = { ...V1, type: 'word', values: 'paint' };
/** 도형 글자 배지의 글자 수 상한. 도형 윗줄에 이름 글과 함께 들어갈 만큼이다. */
export const BADGE_MAX = 8;
/** 값(`value`)이 보이는 글자 수 상한. 카드 오른쪽 끝에 들어갈 자리가 정해져 있어 `mark`와 같다. */
export const VALUE_MAX = 8;

/** 카드를 쓰는 도형(`show`, `value`가 놓이는 곳). 이름 순서는 오류 안내 글에 그대로 나온다. */
export const CARD_SHAPES = ['box', 'external', 'store', 'person', 'table'];

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
 * 값 목록. items의 항목마다 { since, deprecated? }를 둘 수 있다. hint는 값이 목록 밖일 때 오류 메시지에 덧붙이는 이유다.
 * 차트 종류의 firstRole은 계열을 보이는 순서에서 먼저 오는 역할이다(기본 main). role을 생략한 계열은 선언 순서대로 이 순서의 역할을 받는다.
 * deprecated: { since, replace, note? }는 옛 이름이다. 문장 낱말, 선택 사항 키, 값, 그림 종류 어디에 있든 같다. 계속 읽고, replace로 바꿔 읽고, 폐기 진단과 고칠 글(fix)을 낸다.
 */
export const VALUES = {
  direction: { default: 'right', items: table({ right: V1, down: V1 }) },
  scale: { default: 'linear', items: table({ linear: V1, log: V1 }) },
  zero: { default: 'on', items: table({ on: V1, off: V1 }) },
  chartType: {
    items: table({
      bar: { ...V1, rowWord: 'row', seriesRange: [1, 2], isInterval: true },
      dumbbell: { ...V1, rowWord: 'row', seriesRange: [2, 2], isInterval: true, firstRole: 'compare' },
      box: { ...V1, rowWord: 'row', seriesRange: [0, 0], valueKeys: ['min', 'q1', 'median', 'q3', 'max'] },
      scatter: { ...V1, rowWord: 'point', seriesRange: [0, 2] },
      line: { ...V1, rowWord: 'point', seriesRange: [1, 2], isInterval: true },
      difference: { ...V1, rowWord: 'row', seriesRange: [1, 1], isInterval: true },
      heatmap: { ...V1, rowWord: 'cell', seriesRange: [0, 0] },
    }),
  },
  tone: {
    items: table({
      brand: V1,
      purple: V1,
      green: V1,
      gray: V1,
      red: V1,
      teal: { ...V1, deprecated: { since: 1, replace: 'purple', note: 'Tone names are the colors they draw now: brand is the brand blue, purple, green, gray, and red for errors. Teal has no color of its own' } },
      blue: { ...V1, deprecated: { since: 1, replace: 'brand', note: 'Tone names are the colors they draw now. Blue reads as brand, the brand blue' } },
      orange: { ...V1, deprecated: { since: 1, replace: 'purple', note: 'Tag colors are categories now. Blue means the active state and orange means compare' } },
    }),
  },
  role: { items: table({ main: V1, compare: V1 }) },
  paint: {
    hint: 'Colors are names, not hex, so the contrast rules hold. Blue marks the active state and orange marks compare, so they are not choices',
    items: table({ red: V1, amber: V1, green: V1, teal: V1, navy: V1, purple: V1, pink: V1, gray: V1, sky: V1 }),
  },
  head: { default: 'end', items: table({ end: V1, both: V1, none: V1 }) },
  shape: { default: 'rect', items: table({ rect: V1, circle: V1, tile: V1 }) },
  width: { default: 'standard', items: table({ standard: V1, wide: V1 }) },
  border: { default: 'solid', items: table({ solid: V1, dashed: V1 }) },
};

/**
 * 문장 낱말. section은 파일 부분(version, header, declare, timeline), kinds는 쓸 수 있는 그림 종류다. `item`과 `gap`은 `grid { }` 안에서만 쓴다.
 * display는 문서에 적는 꼴이다(선 줄은 첫 낱말이 이름이라 낱말로 가를 수 없다). node는 도형 선언이고 hasSub는 부제를 받는지, scopes는 선택 사항을 찾을 OPTIONS 범위(기본은 낱말 자신)다.
 * positional은 낱말 뒤 자리별 값 목록 이름이다.
 */
export const STATEMENTS = table({
  daphnis: { ...V1, section: 'version', kinds: ALL_KINDS },
  mutoscope: { ...V1, section: 'version', kinds: ALL_KINDS, deprecated: { since: 1, replace: 'daphnis' } },
  title: { ...V1, section: 'header', kinds: ALL_KINDS },
  subtitle: { ...V1, section: 'header', kinds: ALL_KINDS },
  speed: { ...V1, section: 'header', kinds: ALL_KINDS },
  aspect: { ...V1, section: 'header', kinds: ['flow', 'state', 'data'] },
  width: { ...V1, section: 'header', kinds: ['flow', 'state', 'data'], positional: ['width'] },
  x: { ...V1, section: 'header', kinds: ['chart'] },
  y: { ...V1, section: 'header', kinds: ['chart'] },
  scale: { ...V1, section: 'header', kinds: ['chart'], positional: ['scale'] },
  zero: { ...V1, section: 'header', kinds: ['chart'], positional: ['zero'] },
  decimals: { ...V1, section: 'header', kinds: ['chart'] },
  person: { ...V1, section: 'declare', kinds: FLOW_SEQUENCE, node: { hasSub: false }, scopes: ['node'] },
  box: { ...V1, section: 'declare', kinds: FLOW_SEQUENCE, node: { hasSub: true }, scopes: ['box', 'node'] },
  external: { ...V1, section: 'declare', kinds: FLOW_SEQUENCE, node: { hasSub: true }, scopes: ['node'] },
  store: { ...V1, section: 'declare', kinds: FLOW_SEQUENCE, node: { hasSub: true }, scopes: ['node'] },
  decision: { ...V1, section: 'declare', kinds: ['flow'], node: { hasSub: false } },
  state: { ...V1, section: 'declare', kinds: ['state'], node: { hasSub: false } },
  group: { ...V1, section: 'declare', kinds: ['flow', 'state'] },
  grid: { ...V1, section: 'declare', kinds: ['flow'] },
  icons: { ...V1, section: 'declare', kinds: ['flow'] },
  item: { ...V1, section: 'declare', kinds: ['flow'] },
  value: { ...V1, section: 'declare', kinds: ['flow'] },
  on: { ...V1, section: 'declare', kinds: ['flow'], display: 'on node id+N' },
  gap: { ...V1, section: 'declare', kinds: ['flow'], scopes: ['gap', 'item'] },
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
  track: { ...V1, section: 'timeline', kinds: ['flow'], display: 'track a, b -> c -> d' },
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
 * values는 값 목록 이름, format은 값 목록이 없는 낱말 값의 문서용 이름, maxLength는 글자 수 상한, min은 정수만 받는 숫자 선택 사항의 가장 작은 값이다. 값 없는 낱말(flag)은 폐기 별칭을 두지 않는다. 이름 자리의 낱말과 가를 수 없기 때문이다.
 */
export const OPTIONS = table({
  'group.direction': { ...V1, type: 'word', values: 'direction' },
  'group.border': { ...V1, type: 'word', values: 'border' },
  'group.badge': { ...TEXT, maxLength: BADGE_MAX },
  'group.icon': ICON,
  'group.fill': PAINT,
  'group.stroke': PAINT,
  'node.badge': { ...TEXT, maxLength: BADGE_MAX },
  'node.icon': ICON,
  'node.fill': PAINT,
  'node.stroke': PAINT,
  'box.count': PLURAL,
  'edge.no': COUNT,
  'step.for': { ...V1, type: 'word', format: '시간' },
  'hop.time': { ...V1, type: 'word', format: '시간' },
  'hop.tone': { ...V1, type: 'word', values: 'tone' },
  'hop.set': TEXT,
  'track.at': { ...V1, type: 'word', format: '시간(0 가능)' },
  'track.every': { ...V1, type: 'word', format: '시간' },
  'track.time': { ...V1, type: 'word', format: '시간' },
  'track.tone': { ...V1, type: 'word', values: 'tone' },
  'track.set': TEXT,
  'value.on': { ...V1, type: 'word', format: '도형 이름' },
  'value.from': { ...V1, type: 'word', format: '숫자 또는 낱말' },
  'value.ref': { ...V1, type: 'word', format: '값 이름' },
  'hop.dashed': FLAG,
  'edge.quiet': FLAG,
  'edge.dashed': FLAG,
  'edge.head': { ...V1, type: 'word', values: 'head' },
  'box.shape': { ...V1, type: 'word', values: 'shape' },
  'show.tag': TEXT,
  'show.tone': { ...V1, type: 'word', values: 'tone' },
  'show.card': PAINT,
  'show.meta': TEXT,
  'show.mark': { ...TEXT, maxLength: 8 },
  'show.mono': FLAG,
  'graph.lit': TEXT,
  'series.role': { ...V1, type: 'word', values: 'role' },
  'series.key': TEXT,
  'point.series': { ...V1, type: 'word', format: '계열 이름' },
  'grid.rows': COUNT,
  'grid.cols': COUNT,
  'item.row': INDEX,
  'item.col': INDEX,
  'item.rows': COUNT,
  'item.cols': COUNT,
  'gap.count': COUNT,
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
