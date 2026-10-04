// 무작위 구조 그림을 만들어 배치와 검사가 올바른 입력을 오류로 돌려보내는지 센다.
// 사용: node scripts/fuzz-layout.mjs [--count 1500] [--seed 1] [--kind flow|state|data|chart] [--no-aspect] [--show] [--hang-dir 폴더]
// 출력: 실패 종류마다 `{건수} {메시지 앞부분}`, 마지막에 `kinds, failed, aspect` 합계. 실패가 있으면 종료 코드 1.
// 같은 씨앗은 같은 그림을 만든다. --show는 실패한 원본을 모두 `---`로 나눠 쓴다.
// 그림 하나가 FIGURE_TIME_LIMIT_MS를 넘으면 멈춘 것으로 보고 실패로 세며, 원본을 --hang-dir(기본 .local/fuzz-hang)에 파일로 남긴다.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { randomChart } from './lib/fuzz-chart.mjs';

const LCG_MUL = 1664525;
const LCG_ADD = 1013904223;
const LCG_MOD = 4294967296;
const KEY_LENGTH = 90;
// 그림 하나를 만드는 데 허용하는 시간. 보통 수십 ms라 이를 넘으면 배치가 멈춘 것이다.
const FIGURE_TIME_LIMIT_MS = 5000;
const HANG_DIR = '.local/fuzz-hang';
const KINDS = ['flow', 'state', 'data', 'chart'];
const BUILD_WORKER = new URL('./lib/fuzz-build-worker.mjs', import.meta.url);
const HANG_MESSAGE = `HANG over ${FIGURE_TIME_LIMIT_MS}ms`;
const ASPECT_CHANCE = 0.4;
const GROUP_CHANCE = 0.5;
const OUTER_CHANCE = 0.4;
const LABEL_CHANCE = 0.5;
const FK_CHANCE = 0.7;
const NODE_MIN = 3;
const NODE_SPREAD = 7;
const GROUP_MIN = 2;
const GROUP_SPREAD = 3;
const GRID_CHANCE = 0.25;
const GRID_ROWS_MAX = 4;
const GRID_COLS_MAX = 6;
const EMPTY_CHANCE = 0.25;
const GAP_CHANCE = 0.15;
const SPAN_CHANCE = 0.3;
const SPAN_GROW_CHANCE = 0.5;
const GAP_COUNT_MAX = 9;
const CELL_LABELS = ['A', '0x1F', '읽기', '긴 한글 글이 한 칸 안에서 줄을 바꿔 들어간다', 'a very long cell label that has to wrap inside its cell'];
const SHAPES = ['box', 'box', 'person', 'store', 'external', 'circle'];
// 칸 연결: 격자 끝은 이 확률로 칸을 가리키고, 선은 이 확률로 head를 쓴다.
const CELL_END_CHANCE = 0.7;
const HEAD_CHANCE = 0.25;
const HEADS = ['both', 'none', 'end'];
// 번호, 배지, 아이콘, 복제 개수 섞기(흐름 그림)
const DECOR_CHANCE = 0.3;
const NUMBER_CHANCE = 0.25;
const ICONS = ['server', 'db', 'lb', 'user', 'region', 'cdn'];
const ASPECTS = ['0.6', '1', '1.4', '1.6', '2.4'];
const DIRECTIONS = ['right', 'down'];

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
function createRandom(seed) {
  let state = seed;
  const next = () => (state = (state * LCG_MUL + LCG_ADD) % LCG_MOD) / LCG_MOD;
  return { next, pick: (list) => list[Math.floor(next() * list.length)], int: (n) => Math.floor(next() * n) };
}

// cost: time O(a), heap O(1), stack O(1)
// vars: a = 인자 수
// basis: estimate
// 알 수 없는 --kind나 숫자가 아닌 --count, --seed는 조용히 넘기지 않고 멈춘다.
function parseOptions(argv) {
  const value = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
  const options = { count: Number(value('--count', 1500)), seed: Number(value('--seed', 1)), kind: value('--kind', 'flow'), hangDir: value('--hang-dir', HANG_DIR), isAspectOff: argv.includes('--no-aspect'), isShown: argv.includes('--show') };
  if (!KINDS.includes(options.kind)) throw new Error(`--kind must be one of ${KINDS.join(', ')}: ${options.kind}`);
  if (!Number.isInteger(options.count) || !Number.isInteger(options.seed)) throw new Error('--count and --seed must be integers');
  return options;
}

// cost: time O(r·c), heap O(r·c), stack O(1)
// vars: r = 격자 행 수, c = 격자 열 수
// basis: estimate
// 칸 격자 선언 줄들. 칸은 겹치지 않게 앞에서부터 빈 자리에 놓고, 가끔 비우거나 합치거나 gap으로 접는다.
function declareGrid(id, rnd) {
  const [rows, cols] = [1 + rnd.int(GRID_ROWS_MAX), 1 + rnd.int(GRID_COLS_MAX)];
  const taken = Array.from({ length: rows }, () => Array(cols).fill(false));
  const lines = [`grid ${id} "${id}" rows=${rows} cols=${cols} {`];
  for (let slot = 0; slot < rows * cols; slot++) {
    const [row, col] = [Math.floor(slot / cols), slot % cols];
    const isSkipped = taken[row][col] || (slot > 0 && rnd.next() < EMPTY_CHANCE);
    if (!isSkipped) lines.push(`  ${cellLine(`c${lines.length}`, placeCell(taken, { row, col }, rnd), rnd)}`);
  }
  return [...lines, '}'];
}

// 빈 자리 (row, col)에 칸을 놓고 가끔 오른쪽으로 합쳐 차지한 자리를 표시한다.
function placeCell(taken, { row, col }, rnd) {
  let cols = 1;
  if (rnd.next() < SPAN_CHANCE) while (col + cols < taken[row].length && !taken[row][col + cols] && rnd.next() < SPAN_GROW_CHANCE) cols++;
  for (let c = col; c < col + cols; c++) taken[row][c] = true;
  return { row, col, rows: 1, cols };
}

function cellLine(id, { row, col, rows, cols }, rnd) {
  const place = `row=${row} col=${col} rows=${rows} cols=${cols}`;
  if (rnd.next() < GAP_CHANCE) return `gap ${id} "…" count=${1 + rnd.int(GAP_COUNT_MAX)} ${place}`;
  return `item ${id} "${rnd.pick(CELL_LABELS)}" ${place}`;
}

// 도형 선언 한 줄. circle은 box의 shape 선택 사항이다. 원은 배지와 아이콘을 받지 않는다.
function nodeLine(shape, id, decor = '') {
  if (shape === 'circle') return `box ${id} "${id}" shape=circle`;
  const allowed = shape === 'person' ? '' : shape === 'box' ? decor : decor.replace(/ (count|shape)=\S+/g, '');
  return `${shape} ${id} "${id}"${allowed}`;
}

// 흐름 그림 도형의 배지, 아이콘, 복제 개수 선택 사항. 사람은 받지 않고 상자만 개수를 받는다(nodeLine이 걸러낸다).
function nodeDecor(rnd) {
  if (rnd.next() >= DECOR_CHANCE) return '';
  const badge = rnd.next() < 0.5 ? ` badge="${rnd.pick(['LB', 'DB', 'API', 'WEB'])}"` : '';
  const icon = rnd.next() < 0.5 ? ` icon=${rnd.pick(ICONS)}` : '';
  const count = rnd.next() < 0.2 ? ' count=3' : '';
  const tile = icon && rnd.next() < 0.3 ? ' shape=tile' : '';
  return `${tile}${badge}${icon}${count}`;
}

// 그룹 선택 사항: 배지와 아이콘
function groupDecor(rnd) {
  return rnd.next() < DECOR_CHANCE ? ` badge="G" icon=${rnd.pick(ICONS)}${rnd.next() < 0.5 ? ' border=dashed' : ''}` : '';
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 도형 수
// basis: estimate
// 도형 선언 줄들. 구조 그림은 가끔 칸 격자를 도형 하나로 섞는다. 도형 둘 이상을 묶은 그룹을 섞고, 가끔 첫 그룹을 바깥 그룹으로 한 번 더 감싼다.
function declareNodes(ids, rnd, kind) {
  const shape = () => (kind === 'state' ? 'state' : rnd.pick(SHAPES));
  const declare = (id) => (kind === 'flow' && rnd.next() < GRID_CHANCE ? declareGrid(id, rnd) : [nodeLine(shape(), id, kind === 'flow' ? nodeDecor(rnd) : '')]);
  const parts = [];
  let groups = 0;
  for (let i = 0; i < ids.length; ) {
    const size = Math.min(ids.length - i, GROUP_MIN + rnd.int(GROUP_SPREAD));
    if (rnd.next() < GROUP_CHANCE && i + GROUP_MIN <= ids.length) {
      parts.push(`group g${groups} "그룹${groups}" direction=${rnd.pick(DIRECTIONS)}${kind === 'flow' ? groupDecor(rnd) : ''} {`, ...ids.slice(i, i + size).flatMap((m) => declare(m).map((line) => `  ${line}`)), '}');
      groups++;
      i += size;
    } else {
      parts.push(...declare(ids[i]));
      i++;
    }
  }
  return parts;
}

function wrapFirstGroup(parts, rnd) {
  const at = parts.findIndex((l) => l.startsWith('group'));
  const end = parts.indexOf('}', at);
  if (at < 0 || end < at) return parts;
  return [...parts.slice(0, at), `group outer "바깥" direction=${rnd.pick(DIRECTIONS)} {`, ...parts.slice(at, end + 1), '}', ...parts.slice(end + 1)];
}

// 선언 줄에서 격자마다 칸(item) 이름 목록. 칸 줄은 바로 앞 격자 줄에 속한다.
function cellsOf(parts) {
  const cells = new Map();
  let grid;
  for (const line of parts) {
    const open = line.match(/^\s*grid (\w+) /);
    if (open) cells.set((grid = open[1]), []);
    const item = line.match(/^\s*item (\w+) /);
    if (item) cells.get(grid).push(item[1]);
  }
  return cells;
}

// 선 끝 하나: 격자면 가끔 칸을 가리킨다.
function endOf(id, rnd, cells) {
  const items = cells.get(id);
  return items?.length && rnd.next() < CELL_END_CHANCE ? `${id}.${rnd.pick(items)}` : id;
}

// cost: time O(m), heap O(m), stack O(1)
// vars: m = 선 수
// basis: estimate
// 선 줄들. 격자 끝은 가끔 칸을 가리키고, 같은 격자의 두 칸을 잇는 선(양끝이 같은 격자에서 우연히 나온다)과 head 선택 사항도 섞는다. 칸 사이 선은 라벨이 없다.
function declareEdges(ids, rnd, { kind, cells }) {
  const seen = new Set();
  const lines = [];
  const count = ids.length + rnd.int(ids.length);
  for (let e = 0; e < count; e++) {
    const [a, b] = [rnd.pick(ids), rnd.pick(ids)];
    const [from, to] = [endOf(a, rnd, cells), endOf(b, rnd, cells)];
    const isInner = a === b && from.includes('.') && to.includes('.') && from !== to;
    if ((a === b && kind !== 'state' && !isInner) || seen.has(`${from}>${to}`)) continue;
    seen.add(`${from}>${to}`);
    const isLabeled = !isInner && (kind === 'state' || rnd.next() < LABEL_CHANCE);
    const head = rnd.next() < HEAD_CHANCE ? ` head=${rnd.pick(HEADS)}` : '';
    const no = kind !== 'data' && rnd.next() < NUMBER_CHANCE ? ` no=${1 + rnd.int(9)}` : '';
    lines.push(`${from} -> ${to}${isLabeled ? ` "l${e}"` : ''}${head}${no}`);
  }
  return lines;
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 표 수
// basis: estimate
// 표마다 열 둘과, 앞 표를 가리키는 외래 키 열을 가끔 둔다.
function declareTables(count, rnd) {
  return Array.from({ length: count }, (_, i) => {
    const target = i > 0 && rnd.next() < FK_CHANCE ? `\n  ref bigint fk=n${rnd.int(i)}.id` : '';
    return `table n${i} "n${i}" {\n  id bigint pk\n  name varchar${target}\n}`;
  });
}

// cost: time O(n + m), heap O(n + m), stack O(1)
// vars: n = 도형 수, m = 선 수
// basis: estimate
function randomSource(rnd, { kind, isAspectOff }) {
  if (kind === 'chart') return randomChart(rnd);
  const ids = Array.from({ length: NODE_MIN + rnd.int(NODE_SPREAD) }, (_, i) => `n${i}`);
  const lines = [`${kind} ${rnd.pick(DIRECTIONS)}`];
  if (rnd.next() < ASPECT_CHANCE && !isAspectOff) lines.push(`aspect ${rnd.pick(ASPECTS)}`);
  if (kind === 'data') return [...lines, ...declareTables(ids.length, rnd)].join('\n');
  let parts = declareNodes(ids, rnd, kind);
  if (rnd.next() < OUTER_CHANCE && parts.length > NODE_MIN + 1) parts = wrapFirstGroup(parts, rnd);
  lines.push(...parts, ...declareEdges(ids, rnd, { kind, cells: cellsOf(parts) }));
  if (kind === 'state') lines.push(`start ${ids[0]}`, `final ${rnd.pick(ids)}`);
  return lines.join('\n');
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
function startWorker() {
  return new Worker(BUILD_WORKER);
}

// cost: time O(limit), heap O(1), stack O(1)
// vars: limit = FIGURE_TIME_LIMIT_MS
// basis: estimate
// 작업 스레드에 그림 하나를 맡기고 시간 안에 못 끝나면 스레드를 끊어 HANG_MESSAGE를 돌려준다.
function buildWithin(builder, source) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      builder.worker.terminate();
      builder.worker = startWorker();
      resolve(HANG_MESSAGE);
    }, FIGURE_TIME_LIMIT_MS);
    builder.worker.once('message', (message) => {
      clearTimeout(timer);
      resolve(message);
    });
    builder.worker.postMessage(source);
  });
}

function saveHang(source, options, index) {
  mkdirSync(options.hangDir, { recursive: true });
  writeFileSync(join(options.hangDir, `hang-${options.kind}-seed${options.seed}-${index}.dap`), `${source}\n`);
}

// cost: time O(count·build), heap O(k), stack O(1)
// vars: count = 그림 수, build = 그림 하나를 만드는 비용, k = 실패 종류 수
// basis: estimate
async function run(options) {
  const rnd = createRandom(options.seed);
  const builder = { worker: startWorker() };
  const fails = new Map();
  for (let t = 0; t < options.count; t++) {
    const source = randomSource(rnd, options);
    const message = await buildWithin(builder, source);
    if (message === undefined) continue;
    if (message === HANG_MESSAGE) saveHang(source, options, t);
    const key = message.slice(0, KEY_LENGTH);
    const found = fails.get(key) ?? { count: 0, withAspect: 0, sources: [] };
    fails.set(key, { count: found.count + 1, withAspect: found.withAspect + (/^aspect /m.test(source) ? 1 : 0), sources: [...found.sources, source] });
  }
  await builder.worker.terminate();
  return fails;
}

const options = parseOptions(process.argv.slice(2));
const fails = await run(options);
for (const [key, { count, sources }] of fails) {
  console.log(count, key);
  if (options.isShown) for (const source of sources) console.log(`---\n${source}`);
}
const failed = [...fails.values()].reduce((sum, f) => sum + f.count, 0);
const withAspect = [...fails.values()].reduce((sum, f) => sum + f.withAspect, 0);
console.log(`kinds ${fails.size} failed ${failed} aspect ${withAspect} of ${options.count} (kind ${options.kind}, seed ${options.seed})`);
process.exit(failed ? 1 : 0);
