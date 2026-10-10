// 문법 정본. 낱말, 선택 사항, 값 목록, 기본값을 이 표 한 곳에만 둔다.
// 파서, 검증, 오류 메시지, 문서 표(docs/design/figure-syntax.md의 문법 표 구간)가 모두 이 표를 읽는다.
// 기능 추가는 이 표에 항목을 더하는 일이다.
import { TONES } from '../tone.js';

/** 이 도구가 읽는 문법 판. 첫 문장 `daphnis 2`가 이 판을 적는다. */
export const VERSION = 2;

// 원형이 없는 표. `constructor` 같은 낱말이 표 항목으로 잡히지 않게 한다.
const table = (entries) => Object.assign(Object.create(null), entries);

const FLAG = { type: 'flag' };
const TEXT = { type: 'text' };
/** 칸 격자의 정수 선택 사항. min은 받는 가장 작은 값이다(칸 위치는 0, 크기와 개수는 1). */
const COUNT = { type: 'number', format: '양의 정수', min: 1 };
/** 경로 길이의 비율. 숫자와 `%`를 붙여 쓴다(`60%`). */
const PERCENT = { type: 'word', format: '0 이상 100 이하 퍼센트' };
/** 흐름 조건식 글(`when`, `wait`). 문법은 condition.js다. */
const CONDITION = { type: 'text', format: '조건 글' };
const INDEX = { type: 'number', format: '0 이상 정수', min: 0 };
/** 아이콘 이름. 기본 세트의 이름(`server`)이거나 등록한 세트의 `세트:이름`이다. */
const ICON = { type: 'word', format: '이름 또는 세트:이름' };
/** 같은 역할 복제 개수. 하나는 겹칠 것이 없어 2부터 받는다. */
const PLURAL = { type: 'number', format: '2 이상 정수', min: 2 };
/** 도형, 그룹, 카드 줄이 고르는 색 이름. 값은 `tone` 목록의 이름뿐이다. */
const TONE = { type: 'word', values: 'tone' };
/** 도형, 그룹, 카드 줄의 색 표현 방식. 값은 `appearance` 목록의 이름뿐이다. */
const APPEARANCE = { type: 'word', values: 'appearance' };
/** 시간 선택 사항. 값은 `900ms`, `2s` 꼴이다. */
const TIME = { type: 'word', format: '시간' };
/** 도형 글자 배지의 글자 수 상한. 도형 윗줄에 이름 글과 함께 들어갈 만큼이다. */
const BADGE_MAX = 8;

/** 큐 칸 수(`slots`)의 상한. 가장 넓은 큐(칸 폭 16px, 틈 4px)가 약 640px라 캔버스 폭(960) 안에 들고, 칸 수를 세어 읽을 수 있는 한계다. */
const QUEUE_SLOTS_MAX = 32;

/** 카드를 쓰는 도형(`show`, `value`가 놓이는 곳). 이름 순서는 오류 안내 글에 그대로 나온다. */
export const CARD_SHAPES = ['box', 'external', 'store', 'person', 'table', 'api'];

/** 칸(필드)을 가져 `카드.칸`을 연결점으로 쓰는 도형. 클래스 멤버는 연결점이 아니다. */
export const PART_SHAPES = ['table', 'api', 'grid'];

/**
 * 순서 뷰에 참여자로 놓을 수 있는 도형. 표(`table`), API, 클래스(`classifier`, `interface` 포함)는 칸과 멤버를 그리지 않고 공통 카드 머리(아이콘과 이름)만 참여자로 보이고,
 * 칸과 멤버는 같은 카드를 담은 그래프 보기가 보인다. 논리 카드는 하나라 이름, 값, 상태가 보기 사이에서 같다. 갈림길, 상태, 격자, 차트, 추적은 참여자 모양이 없다.
 */
export const SEQUENCE_SHAPES = ['person', 'box', 'external', 'store', 'queue', 'table', 'api', 'classifier'];

/** `decimals` 차트 줄이 받는 소수 자릿수의 상한. 값 글자의 자동 자릿수도 이 값까지만 쓴다. */
export const DECIMALS_MAX = 6;

/** 단계 상태(`status`)를 받는 도형. 원(`box shape=circle`)은 상자의 한 모양이다. 이름 순서는 오류 안내 글에 그대로 나온다. */
export const STATUS_SHAPES = ['box', 'circle', 'external', 'store', 'person', 'queue', 'decision'];

/**
 * 값 목록. hint는 값이 목록 밖일 때 오류 메시지에 덧붙이는 이유다.
 * 차트 종류의 firstRole은 계열을 보이는 순서에서 먼저 오는 역할이다(기본 main). 계열이 하나나 둘이면 role을 생략한 계열은 선언 순서대로 main, compare를 받고(firstRole이 먼저), 셋 이상이면 생략한 계열은 역할이 없다. main과 compare는 각각 하나 이하이고 reference는 기대값 계열(계획, 목표)이다.
 */
export const VALUES = {
  fragmentType: { items: table({ alt: {}, loop: {}, par: {}, opt: {} }) },
  histogramMeasure: { default: 'count', items: table({ count: {}, probability: {}, density: {} }) },
  fragmentRun: { items: table({ on: {}, off: {} }) },
  direction: { default: 'right', items: table({ right: {}, down: {} }) },
  viewStrategy: { items: table({ graph: {}, sequence: {}, plot: {}, time: {} }) },
  sceneMode: { items: table({ static: {}, once: {}, loop: {} }) },
  traceUnit: { default: 'ms', items: table({ ms: {}, us: {}, s: {} }) },
  scale: { default: 'linear', items: table({ linear: {}, log: {} }) },
  zero: { default: 'on', items: table({ on: {}, off: {} }) },
  // seriesRange는 받는 계열 수의 범위다. 위는 Infinity라 상한이 없고, 계열 색은 범주 색 도우미(chart-palette.js)가 번호로 정한다.
  // allowsMissing은 값 자리에 `-`(빠진 값)를 받는 종류다. 빠진 값은 0이 아니다(막대는 그리지 않고, 선은 끊기고, 비율은 그 행을 정하지 않는다).
  chartType: {
    items: table({
      bar: { rowWord: 'row', seriesRange: [1, Infinity], isInterval: true, allowsMissing: true },
      stacked: { rowWord: 'row', seriesRange: [1, Infinity], allowsMissing: true },
      percent: { rowWord: 'row', seriesRange: [2, Infinity], allowsMissing: true },
      dumbbell: { rowWord: 'row', seriesRange: [2, 2], isInterval: true, firstRole: 'compare' },
      box: { rowWord: 'row', seriesRange: [0, 0], valueKeys: ['min', 'q1', 'median', 'q3', 'max'], allowsMissing: true },
      scatter: { rowWord: 'point', seriesRange: [0, Infinity] },
      line: { rowWord: 'point', seriesRange: [1, Infinity], isInterval: true, numericRows: true, allowsMissing: true },
      step: { rowWord: 'point', seriesRange: [1, Infinity], numericRows: true, allowsMissing: true },
      area: { rowWord: 'point', seriesRange: [1, Infinity], numericRows: true },
      ecdf: { rowWord: 'sample', seriesRange: [0, Infinity], allowsMissing: true },
      difference: { rowWord: 'row', seriesRange: [1, 1], isInterval: true },
      heatmap: { rowWord: 'cell', seriesRange: [0, 0] },
      pie: { rowWord: 'row', seriesRange: [0, 0] },
      donut: { rowWord: 'row', seriesRange: [0, 0] },
      histogram: { rowWord: 'sample', seriesRange: [0, 0], allowsMissing: true },
      waterfall: { rowWord: 'row', seriesRange: [0, 0], allowsMissing: true },
    }),
  },
  // 색 이름은 범주 색 도우미의 계열과 무채색 gray다(tone.js). 이름이 계열을 따라 늘어난다.
  tone: {
    hint: 'Colors are names, not hex, so the contrast rules hold',
    items: table(Object.fromEntries(TONES.map((name) => [name, {}]))),
  },
  // plain은 중립 면에 색 아이콘과 작은 표식, filled는 같은 계열의 옅은 면, outline은 같은 계열 경계와 중립 면이다. filled와 outline은 tone이 있어야 한다.
  appearance: { default: 'plain', items: table({ plain: {}, filled: {}, outline: {} }) },
  role: { items: table({ main: {}, compare: {}, reference: {} }) },
  head: { default: 'end', items: table({ end: {}, both: {}, none: {} }) },
  shape: { default: 'rect', items: table({ rect: {}, circle: {}, tile: {} }) },
  width: { default: 'standard', items: table({ standard: {}, wide: {} }) },
  border: { default: 'solid', items: table({ solid: {}, dashed: {} }) },
  status: { items: table({ ok: {}, warn: {}, fail: {}, wait: {} }) },
  deleteAction: { items: table({ restrict: {}, cascade: {}, 'set-null': {}, 'no-action': {} }) },
  relation: { default: 'association', items: table({ association: {}, dependency: {}, inheritance: {}, realization: {}, aggregation: {}, composition: {} }) },
  visibility: { items: table({ public: {}, private: {}, protected: {}, package: {} }) },
};

/**
 * 문장 낱말. section은 파일 부분(version, header, declare, timeline)이고, in은 블록 안에서만 쓰는 낱말의 블록 종류(chart, class, grid, trace)다.
 * display는 문서에 적는 꼴이다(선 줄은 첫 낱말이 이름이라 낱말로 가를 수 없다). node는 도형 선언이고 hasSub는 부제를 받는지, scopes는 선택 사항을 찾을 OPTIONS 범위(기본은 낱말 자신)다.
 * positional은 낱말 뒤 자리별 값 목록 이름이다.
 */
export const STATEMENTS = table({
  daphnis: { section: 'version' },
  title: { section: 'header' },
  subtitle: { section: 'header' },
  pace: { section: 'header' },
  aspect: { section: 'header' },
  width: { section: 'header', positional: ['width'] },
  person: { section: 'declare', node: { hasSub: false }, scopes: ['node'] },
  box: { section: 'declare', node: { hasSub: true }, scopes: ['box', 'node'] },
  external: { section: 'declare', node: { hasSub: true }, scopes: ['node'] },
  store: { section: 'declare', node: { hasSub: true }, scopes: ['node'] },
  decision: { section: 'declare', node: { hasSub: false } },
  queue: { section: 'declare', node: { hasSub: false }, scopes: ['queue'] },
  state: { section: 'declare', node: { hasSub: false } },
  group: { section: 'declare' },
  grid: { section: 'declare' },
  icons: { section: 'declare' },
  item: { section: 'declare', in: 'grid' },
  gap: { section: 'declare', in: 'grid', scopes: ['gap', 'item'] },
  value: { section: 'declare' },
  text: { section: 'declare', in: 'card', scopes: ['show'] },
  graph: { section: 'declare', in: 'card', scopes: ['graph'] },
  on: { section: 'declare', display: 'on node id+N' },
  start: { section: 'declare' },
  final: { section: 'declare' },
  table: { section: 'declare' },
  api: { section: 'declare', display: 'api id "METHOD /url" {' },
  class: { section: 'declare', scopes: ['classifier'] },
  interface: { section: 'declare', scopes: ['classifier'] },
  field: { section: 'declare', in: 'class', scopes: ['member'] },
  method: { section: 'declare', in: 'class', scopes: ['member'] },
  chart: { section: 'declare', display: 'chart id "title" type ["subtitle"] {' },
  trace: { section: 'declare', display: 'trace id "title" [unit=ms] {', scopes: ['trace'] },
  span: { section: 'declare', in: 'trace' },
  view: { section: 'declare', display: 'view graph|sequence|plot|time ["label"] [{]' },
  edge: { section: 'declare', scopes: ['edge', 'relation'], display: 'a -> b' },
  x: { section: 'declare', in: 'chart' },
  y: { section: 'declare', in: 'chart' },
  scale: { section: 'declare', in: 'chart', positional: ['scale'] },
  zero: { section: 'declare', in: 'chart', positional: ['zero'] },
  decimals: { section: 'declare', in: 'chart' },
  series: { section: 'declare', in: 'chart' },
  rule: { section: 'declare', in: 'chart' },
  missing: { section: 'declare', in: 'chart' },
  data: { section: 'declare', in: 'chart' },
  row: { section: 'declare', in: 'chart' },
  point: { section: 'declare', in: 'chart' },
  cell: { section: 'declare', in: 'chart' },
  sample: { section: 'declare', in: 'chart' },
  bins: { section: 'declare', in: 'chart', display: 'bins minimum maximum count [measure=count|probability|density] or bins auto [measure=count|probability|density]' },
  total: { section: 'declare', in: 'chart' },
  link: { section: 'declare', in: 'chart' },
  scene: { section: 'timeline', display: 'scene "label" [mode=static|once|loop] [speed=1]' },
  hop: { section: 'timeline', display: 'a -> b' },
  track: { section: 'timeline', display: 'track a, b -> c -> d' },
  // 읽기 식 `대상:=원천`은 문장이 아니라 `set=`, `on` 줄, 장면 `set=` 안의 식이다. 줄 첫 낱말로 쓸 수 없는 이름이라 문장으로 읽히지 않고 문서 표에만 나온다.
  ':=': { section: 'timeline', display: '대상:=원천' },
  show: { section: 'timeline', scopes: ['show', 'graph'] },
  clear: { section: 'timeline' },
  light: { section: 'timeline' },
  reveal: { section: 'timeline' },
  note: { section: 'timeline' },
  activate: { section: 'timeline' },
  deactivate: { section: 'timeline' },
  fragment: { section: 'timeline', positional: ['fragmentType'] },
  branch: { section: 'timeline' },
  wait: { section: 'timeline' },
});

/** 도형을 만드는 블록 낱말과 그 블록 종류. 블록은 `{`로 열고 `}`로 닫는다. */
export const BLOCK_WORDS = table({ table: 'table', api: 'api', class: 'class', interface: 'class', grid: 'grid', chart: 'chart', trace: 'trace' });

/**
 * 선택 사항. 키는 `범위.이름`이고 type은 word, text, number, flag다.
 * values는 값 목록 이름, format은 값 목록이 없는 낱말 값의 문서용 이름, maxLength는 글자 수 상한, min은 정수만 받는 숫자 선택 사항의 가장 작은 값이다.
 */
export const OPTIONS = table({
  'fragment.choose': TEXT,
  'fragment.times': COUNT,
  'fragment.run': { type: 'word', values: 'fragmentRun' },
  'group.direction': { type: 'word', values: 'direction' },
  'group.border': { type: 'word', values: 'border' },
  'group.badge': { ...TEXT, maxLength: BADGE_MAX },
  'group.icon': ICON,
  'group.tone': TONE,
  'group.appearance': APPEARANCE,
  'node.badge': { ...TEXT, maxLength: BADGE_MAX },
  'node.icon': ICON,
  'node.tone': TONE,
  'node.appearance': APPEARANCE,
  'box.count': PLURAL,
  'queue.slots': { ...COUNT, format: `1 이상 ${QUEUE_SLOTS_MAX} 이하 정수`, max: QUEUE_SLOTS_MAX },
  'queue.from': { ...INDEX, format: '0 이상 slots 이하 정수' },
  'edge.no': COUNT,
  'scene.mode': { type: 'word', values: 'sceneMode' },
  'scene.speed': { type: 'word', format: '0보다 큰 숫자' },
  'scene.for': TIME,
  'scene.status': { ...TEXT, values: 'status' },
  'scene.keep': { ...TEXT, format: '값 이름 목록' },
  'scene.set': TEXT,
  'hop.time': TIME,
  'hop.tone': { type: 'word', values: 'tone' },
  'hop.set': TEXT,
  'hop.lost': PERCENT,
  'hop.when': CONDITION,
  'hop.wait': CONDITION,
  'hop.timeout': TIME,
  'hop.else': { type: 'word', format: '도형 이름' },
  'hop.stuck': FLAG,
  'hop.reserve': { ...TEXT, format: '값 식 목록' },
  'track.at': { type: 'word', format: '시간(0 가능)' },
  'track.every': TIME,
  'track.time': TIME,
  'track.tone': { type: 'word', values: 'tone' },
  'track.set': TEXT,
  'track.lost': PERCENT,
  'track.when': CONDITION,
  'track.wait': CONDITION,
  'track.timeout': TIME,
  'track.else': { type: 'word', format: '도형 이름' },
  'track.stuck': FLAG,
  'track.reserve': { ...TEXT, format: '값 식 목록' },
  'track.legs': { ...TEXT, format: '시간 또는 -의 목록' },
  'value.on': { type: 'word', format: '도형 이름' },
  'value.from': { type: 'word', format: '숫자 또는 낱말' },
  'value.ref': { type: 'word', format: '값 이름' },
  'hop.dashed': FLAG,
  'hop.create': FLAG,
  'hop.destroy': FLAG,
  'edge.quiet': FLAG,
  'edge.dashed': FLAG,
  'edge.head': { type: 'word', values: 'head' },
  'box.shape': { type: 'word', values: 'shape' },
  'show.tag': TEXT,
  'show.tone': TONE,
  'show.appearance': APPEARANCE,
  'show.meta': TEXT,
  'show.mark': { ...TEXT, maxLength: 8 },
  'show.mono': FLAG,
  'graph.lit': TEXT,
  'bins.measure': { type: 'word', values: 'histogramMeasure' },
  'series.role': { type: 'word', values: 'role' },
  'series.key': TEXT,
  'point.series': { type: 'word', format: '계열 이름' },
  'trace.unit': { type: 'word', values: 'traceUnit' },
  'span.lane': { type: 'word', format: '도형 이름' },
  'span.at': { type: 'word', format: '0 이상 숫자' },
  'span.dur': { type: 'word', format: '0보다 큰 숫자' },
  'grid.rows': COUNT,
  'grid.cols': COUNT,
  'item.row': INDEX,
  'item.col': INDEX,
  'item.rows': COUNT,
  'item.cols': COUNT,
  'gap.count': COUNT,
  'light.x': { type: 'number', format: '숫자' },
  'column.pk': FLAG,
  'column.unique': FLAG,
  'column.nullable': FLAG,
  'column.required': FLAG,
  'column.ondelete': { type: 'word', values: 'deleteAction' },
  'column.fk': { type: 'word', format: '테이블.열' },
  'classifier.abstract': FLAG,
  'member.visibility': { type: 'word', values: 'visibility' },
  'member.static': FLAG,
  'member.abstract': FLAG,
  'relation.relation': { type: 'word', values: 'relation' },
  'relation.from': { ...TEXT, format: '출발 쪽 다중성' },
  'relation.to': { ...TEXT, format: '도착 쪽 다중성' },
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
/** 값 목록의 값 이름. */
export function valueNames(list) {
  return Object.keys(VALUES[list].items);
}
