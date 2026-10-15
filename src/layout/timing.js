// 타이밍 보기 배치. 줄(값과 카드)을 위에서 아래로 쌓고, 장면마다 시간표의 값 변화·상태·이동을 장면 시간 축 위의 띠, 높낮이 선, 화살표로 바꾼다.
// 줄의 자리와 판 크기는 시간표와 상관없이 정하고(layoutTiming), 장면마다의 모양은 시간표가 정해진 뒤 같은 판에 붙인다(timingScenes). 그래서 판 크기는 장면과 상관없다.
// 시각은 모두 시간표의 논리 ms라 같은 원본의 흐름·순서 보기의 점과 같은 순간에 바뀐다(docs/design/figure-kinds.md 타이밍 보기).
import { measure } from '../measure/fonts.js';
import { sizeStatus } from '../draw/status.js';
import { axisEnd } from '../chart/axis.js';
import { labelColumn } from '../chart/labels.js';
import { PAD, ROW, SPACE, TEXT, WIDTH } from '../chart/metrics.js';
import { makeScale } from '../chart/scale.js';

/** 구간 표시(`note`) 한 줄의 높이. 양쪽 화살표와 그 위 글 한 줄이 든다. */
const NOTE_ROW = TEXT['13'] + SPACE['6'];
/** 띠와 높낮이 선이 줄 안에서 차지하는 높이의 절반. 줄 높이에서 위아래 여유를 뺀다. */
export const BAND_HALF = (ROW - SPACE['3'] * 2) / 2;
/** 띠의 경사 변 폭. 값이 바뀌는 순간을 WaveDrom처럼 비스듬한 변으로 보인다. */
export const SLOPE = SPACE['1-5'];
/** 눈금을 초로 적기 시작하는 장면 길이(ms) */
const SECOND_FROM = 1000;
const MS_PER_SECOND = 1000;
/** 띠 안 글자 둘레 여유 */
const LABEL_PAD = SPACE['2'];

// cost: time O(r + n), heap O(r + n), stack O(1)
// vars: r = 줄 수, n = 구간 표시 수
// basis: estimate
/**
 * 타이밍 보기 판의 줄 자리. 줄 이름 칸은 차트 행 이름과 같은 규칙이고 시간 축은 맨 아래다.
 * 카드 줄의 장면 상태(`status=`)는 시간에 따라 바뀌지 않으므로 띠가 아니라 줄 이름 옆 알약이고, 상태가 있는 카드 줄은 이름 칸에 알약 자리를 더한다.
 * @param view 보기({ id, rows, notes })
 * @param statuses 카드 id → 장면들이 쓰는 상태 종류 집합(figure.steps의 status)
 * @returns { kind: 'timing', id, width, height, rows, plotX, plotRight, axisY, notes, pillX }. rows는 { id, kind, label, y, h, cy, noteY? }이고 cy는 띠의 세로 가운데, noteY는 그 값의 구간 표시 줄 세로 가운데다. pillX는 상태 알약의 왼쪽 끝이다
 */
export function layoutTiming(view, { width = WIDTH, statuses = new Map() } = {}) {
  const pillW = Math.max(0, ...view.rows.flatMap((row) => [...(statuses.get(row.id) ?? [])].map((kind) => sizeStatus(kind).w)));
  const nameW = Math.max(0, ...view.rows.map((row) => measure(row.label, TEXT['13'], 'regular')));
  const labelW = Math.max(labelColumn(view.rows.map((row) => row.label)), pillW ? nameW + pillW + SPACE['3'] * 2 : 0);
  const plotX = PAD + labelW;
  const plotRight = width - PAD;
  let y = PAD;
  const rows = view.rows.map((row) => {
    const placed = { id: row.id, kind: row.kind, label: row.label, y, h: ROW, cy: y + ROW / 2 };
    y += ROW;
    if ((view.notes ?? []).some((note) => note.value === row.id)) {
      placed.noteY = y + NOTE_ROW / 2;
      y += NOTE_ROW;
    }
    return placed;
  });
  const axisY = y + SPACE['2'];
  return { kind: 'timing', id: view.id, width, height: axisEnd(axisY, true) + PAD, rows, plotX, plotRight, axisY, notes: view.notes ?? [], pillX: PAD + nameW + SPACE['3'] };
}

// cost: time O(s·(v·c + h)), heap O(s·(v·c + h)), stack O(1)
// vars: s = 장면 수, v = 값 줄 수, c = 값이 바뀌는 횟수, h = 이동 수
// basis: estimate
/**
 * 장면마다의 타이밍 모양을 판에 붙인다. 가로축은 그 장면의 처음(0)부터 표시 길이 끝까지의 논리 ms이고, 장면마다 판 폭을 다 쓴다.
 * 값 줄은 값이 가진 글마다 띠 하나이고, 값이 모든 장면에서 0과 1만 가지면 높낮이 선이다. 카드 줄은 장면 상태(`status=`)가 있으면 그 띠다.
 * 이동은 두 끝이 모두 카드 줄이면 출발 시각의 보내는 줄에서 도착 시각의 받는 줄로 가는 화살표다. 사라지는 점(lost)은 사라지는 시각에서 끝난다.
 * @param timing layoutTiming 결과
 * @param deps { timeline, scene, steps }. scene은 판을 합친 장면이고 이동의 선 번호(hop.edge)로 두 끝 카드를 찾는다
 * @returns 장면 목록 { si, t0, t1, scale, rows: { id, bands?, wave?, status? }[], arrows, notes }
 */
export function timingScenes(timing, { timeline, scene }) {
  const valueRows = timing.rows.filter((row) => row.kind === 'value');
  const binary = new Set(valueRows.filter((row) => isBinary(timeline.values ?? [], row.id)).map((row) => row.id));
  const rowById = new Map(timing.rows.map((row) => [row.id, row]));
  return timeline.steps.flatMap((step, si) => {
    const segs = timeline.segs.filter((seg) => seg.si === si);
    if (!segs.length) return [];
    // 축은 장면의 표시 길이까지다. 장면 끝에 닿은 점의 마지막 값도 효과가 끝날 때까지(표시 꼬리) 띠로 보인다. 정지 장면은 논리 길이다.
    const t0 = segs[0].t0;
    const t1 = t0 + Math.max(segs.at(-1).t1 - t0, (timeline.presentation?.[si] ?? 0) * step.speed);
    // 장면이 1초를 넘으면 눈금을 초로 적는다(5000ms보다 5s가 읽기 쉽다). 좌표는 같은 논리 ms에서 나온다.
    const perUnit = t1 - t0 > SECOND_FROM ? MS_PER_SECOND : 1;
    const scale = sceneScale(Math.max(t1 - t0, 1) / perUnit, { start: timing.plotX, length: timing.plotRight - timing.plotX });
    const x = (t) => scale.at((t - t0) / perUnit);
    const rows = timing.rows.map((row) => (row.kind === 'value' ? valueShape(row, { timeline, si, x, binary, end: x(t1) }) : cardShape(row, segs[0])));
    const arrows = placeArrowLabels(hopArrows(segs, { scene, rowById, x }), timing);
    const notes = timing.notes.flatMap((note) => noteSpans(note, { timeline, si, x, end: x(t1), row: rowById.get(note.value) })).filter((note) => note.x1 > note.x0);
    return [{ si, t0, t1, scale, unit: perUnit === 1 ? 'ms' : 's', end: x(t1), rows, arrows, notes }];
  });
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 눈금 수
// basis: estimate
// 장면 시간 축. 장면 끝이 그림 오른쪽 끝에 닿게 하고, 눈금은 차트 눈금 규칙(1, 2, 5 단위)에서 장면 길이 안의 것만 남긴다. 장면 끝 뒤의 빈 축을 그리지 않기 위해서다.
function sceneScale(max, { start, length }) {
  const nominal = makeScale('linear', { min: 0, max, start, length });
  const top = nominal.ticks.at(-1);
  const scale = makeScale('linear', { min: 0, max: top, start, length: (length * top) / max });
  const kept = scale.ticks.map((tick, i) => [tick, scale.labels[i]]).filter(([tick]) => tick <= max * (1 + Number.EPSILON));
  return { ...scale, ticks: kept.map(([tick]) => tick), labels: kept.map(([, label]) => label), length };
}

// 값 줄이 모든 장면에서 0과 1만 가지는지. 높낮이 선(WaveDrom의 0/1, PlantUML의 binary)으로 그린다.
function isBinary(values, id) {
  const texts = values.filter((row) => row.id === id).flatMap((row) => row.periods.map(([, , text]) => text));
  return texts.length > 0 && texts.every((text) => text === '0' || text === '1');
}

// cost: time O(c), heap O(c), stack O(1)
// vars: c = 값이 바뀌는 횟수
// basis: estimate
// 값 줄 하나의 장면 모양: 높낮이 선의 점 목록이나 글 띠 목록. 띠의 글은 띠 안에 들어갈 때만 놓고, 들어가지 않으면 띠만 남긴다(이름은 다음에 바뀌는 띠나 줄 이름으로 읽는다).
function valueShape(row, { timeline, si, x, binary, end }) {
  const line = (timeline.values ?? []).find((v) => v.id === row.id && v.si === si);
  if (!line) return { id: row.id };
  const periods = line.periods.map(([a, b, text], k) => ({ x0: x(a), x1: k === line.periods.length - 1 ? end : x(b), text }));
  if (binary.has(row.id)) {
    const level = (text) => (text === '1' ? row.cy - BAND_HALF : row.cy + BAND_HALF);
    const points = periods.flatMap((p, k) => [...(k ? [{ x: p.x0, y: level(periods[k - 1].text) }] : []), { x: p.x0, y: level(p.text) }, { x: p.x1, y: level(p.text) }]);
    return { id: row.id, wave: points, changes: periods.slice(1).map((p) => p.x0) };
  }
  const bands = periods.filter((p) => p.x1 > p.x0).map((p) => ({ ...p, showsText: measure(p.text, TEXT['13'], 'regular') + LABEL_PAD * 2 + SLOPE * 2 <= p.x1 - p.x0 }));
  return { id: row.id, bands };
}

// 카드 줄 하나의 장면 모양: 장면의 상태(`status=`)가 이 카드에 있으면 장면 전체에 걸친 상태 띠다.
function cardShape(row, seg) {
  const status = (seg.status ?? []).find((s) => s.node === row.id);
  return status ? { id: row.id, status: status.kind } : { id: row.id };
}

// cost: time O(h), heap O(h), stack O(1)
// vars: h = 장면의 이동 수
// basis: estimate
// 두 끝이 카드 줄인 이동의 화살표. 이동은 보기마다 하나로 펼쳐져 있어(투영) 같은 출발·도착 시각과 두 끝은 하나로 합친다.
function hopArrows(segs, { scene, rowById, x }) {
  const seen = new Set();
  return segs.flatMap((seg) => seg.hops.flatMap((hop) => {
    const edge = scene.edges[hop.edge];
    const [from, to] = [edge?.from, edge?.to].map((id) => String(id ?? '').split('.')[0]);
    const start = seg.t0 + (hop.at ?? 0);
    const end = start + (hop.cut ?? hop.ms);
    const key = `${from}>${to}@${start}:${end}`;
    if (!rowById.has(from) || !rowById.has(to) || from === to || seen.has(key)) return [];
    seen.add(key);
    const label = edge.strategy === 'sequence' ? edge.label : hop.data?.join(' ') ?? edge.label;
    return [{ x0: x(start), y0: rowById.get(from).cy, x1: x(end), y1: rowById.get(to).cy, label, isLost: hop.cut !== undefined }];
  }));
}

// cost: time O(c), heap O(c), stack O(1)
// vars: c = 값이 바뀌는 횟수
// basis: estimate
// 값이 note의 상태를 가진 구간마다 양쪽 화살표 하나. 장면 끝까지 이어진 구간은 장면 끝에서 닫는다.
function noteSpans(note, { timeline, si, x, end, row }) {
  const line = (timeline.values ?? []).find((v) => v.id === note.value && v.si === si);
  if (!line || !row) return [];
  const last = line.periods.length - 1;
  return line.periods.flatMap(([a, b, text], k) => (text === note.state && (b > a || k === last) ? [{ x0: x(a), x1: k === last ? end : x(b), y: row.noteY, label: note.label }] : []));
}

/** 화살표 글 바탕 둘레 */
export const ARROW_LABEL_PAD = SPACE['1'];
// 화살표 글을 놓아 볼 자리(화살표 길이의 비율). 가운데부터 양쪽으로 옮긴다.
const LABEL_SPOTS = [0.5, 0.35, 0.65, 0.2, 0.8];

// cost: time O(a²·k), heap O(a), stack O(1)
// vars: a = 화살표 수, k = 놓아 볼 자리 수
// basis: estimate
/**
 * 화살표마다 글 상자 자리 { lx, ly, lw, lh }. 글은 화살표 위에 놓고, 앞서 놓은 글 상자와 겹치지 않는 첫 자리를 고른다. 모든 자리가 겹치면 가운데다.
 * 글 상자는 그림 영역(plotX ~ plotRight) 안으로 민다. 드러냄 창이 글을 자르지 않게 하기 위해서다.
 */
function placeArrowLabels(arrows, timing) {
  const placed = [];
  return arrows.map((arrow) => {
    if (!arrow.label) return arrow;
    const lw = measure(arrow.label, TEXT['13'], 'regular') + ARROW_LABEL_PAD * 2;
    const lh = TEXT['13'] + ARROW_LABEL_PAD * 2;
    const boxAt = (f) => {
      const cx = Math.min(Math.max(arrow.x0 + (arrow.x1 - arrow.x0) * f, timing.plotX + lw / 2), timing.plotRight - lw / 2);
      const cy = arrow.y0 + (arrow.y1 - arrow.y0) * f;
      return { x: cx - lw / 2, y: cy - lh / 2, w: lw, h: lh };
    };
    const clear = (box) => placed.every((other) => box.x + box.w <= other.x || other.x + other.w <= box.x || box.y + box.h <= other.y || other.y + other.h <= box.y);
    const box = LABEL_SPOTS.map(boxAt).find(clear) ?? boxAt(LABEL_SPOTS[0]);
    placed.push(box);
    return { ...arrow, labelBox: box };
  });
}
