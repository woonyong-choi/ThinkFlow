// 문법의 고정 낱말. docs/design/figure-syntax.md의 이름 절과 docs/design/figure-kinds.md의 종류 사이 규칙 표를 그대로 옮긴다.

export const KINDS = ['flow', 'sequence', 'state', 'data', 'chart'];
export const CHART_TYPES = ['bar', 'dumbbell', 'box', 'scatter', 'line', 'heatmap'];
export const DIRECTIONS = ['right', 'down'];
export const TONES = ['blue', 'purple', 'green', 'orange', 'gray'];
export const SHAPES = ['person', 'box', 'external', 'store', 'decision'];

export const HEADER_WORDS = ['title', 'subtitle', 'speed', 'aspect', 'x', 'y', 'scale'];
export const TIMELINE_WORDS = ['step', 'show', 'clear', 'light', 'say', 'wait', 'note', 'reveal'];

// 종류 사이 규칙 표. 문장 첫 낱말(또는 'edge', 'hop')마다 쓸 수 있는 그림 종류
export const ALLOWED = {
  person: ['flow', 'sequence'],
  box: ['flow', 'sequence'],
  external: ['flow', 'sequence'],
  store: ['flow', 'sequence'],
  decision: ['flow'],
  group: ['flow', 'state'],
  state: ['state'],
  start: ['state'],
  final: ['state'],
  table: ['data'],
  edge: ['flow', 'state'],
  hop: ['flow', 'sequence', 'state', 'data'],
  show: ['flow', 'data'],
  clear: ['flow', 'data'],
  light: ['flow', 'state', 'data', 'chart'],
  note: ['sequence'],
  reveal: ['chart'],
  step: KINDS,
  say: KINDS,
  wait: KINDS,
  series: ['chart'],
  rule: ['chart'],
  missing: ['chart'],
  data: ['chart'],
  row: ['chart'],
  point: ['chart'],
  cell: ['chart'],
  link: ['chart'],
  x: ['chart'],
  y: ['chart'],
  scale: ['chart'],
  aspect: ['flow', 'state', 'data'],
};

// 이름 규칙. 테이블은 `-` 대신 `_`를 쓰고, 열은 대문자도 받는다.
// kebab-case. `-`는 낱말 사이에 하나씩만 온다(`a-`, `a--b`는 틀림).
export const ID_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
export const TABLE_PATTERN = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;
export const COLUMN_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;
export const FK_PATTERN = /^[a-z][a-z0-9]*(_[a-z0-9]+)*\.[A-Za-z][A-Za-z0-9_]*$/;
export const TIME_PATTERN = /^(\d+(?:\.\d+)?)(ms|s)$/;
export const NUMBER_PATTERN = /^-?\d+(?:\.\d+)?$/;
