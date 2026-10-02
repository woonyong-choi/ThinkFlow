// 구조, 상태, 데이터 관계 그림을 elkjs로 배치한다. 그룹마다 따로 배치하고, 그룹 경계를 넘는 선은 경계마다 연결점을 거친다(docs/design/layout.md).
import ELK from 'elkjs/lib/elk.bundled.js';
import { displayRatio } from '../canvas.js';
import { values } from '../tokens.js';
import { toElk } from './elk.js';
import { LayoutError } from './error.js';
import { buildModel } from './model.js';
import { isBodyShape, recordPortOrder } from './ports.js';
import { readElk } from './read.js';

const CANVAS = values.size['figure-canvas'];
const ASPECT_MAX = values.scale['aspect-max'];
// 알맞은 보이는 비율의 범위. 세로로 긴 쪽은 두 화면 모두 페이지 스크롤로 읽혀 한도(aspect-max)의 역수까지, 가로로 넓은 쪽은 데스크톱 가로 화면 비율(1400x900)까지다.
const FIT_MIN = 1 / ASPECT_MAX;
const FIT_MAX = values.scale['aspect-fit-max'];
const TURNED = { right: 'down', down: 'right' };
// 자동 접기에서 비율을 낮춰 다시 배치해 보는 최대 횟수. 배치 시간이 이 횟수만큼 늘 수 있다.
const FOLD_TRIES = 4;

let engine;

// cost: time O((2 + FOLD_TRIES)·elk(s + e) + e·d), heap O(s + e·d), stack O(d)
// vars: s = 도형 수, e = 선 수, d = 그룹 깊이, elk = elkjs 층 배치 시간
// basis: estimate
/**
 * 그림을 배치한다.
 * @param sizes Map<도형 id, sizeNode 결과>
 * @returns { items, groups, edges, width, height }. items는 도형 사각형(배치 사각형과 바깥 여백), edges는 경로 점과 라벨 자리
 */
export async function layoutGraph(figure, sizes) {
  engine ??= new ELK();
  try {
    return await place(figure, sizes);
  } catch (first) {
    // 처음 배치가 실패하면 줄 바꿈과 모델 순서 없이 한 번 더 한다. 이것도 실패하면 줄 번호가 있는 배치 오류로 알린다.
    try {
      return await place({ ...figure, aspect: undefined, safeLayout: true }, sizes);
    } catch {
      throw first instanceof LayoutError ? first : new LayoutError(first.message, figure.line);
    }
  }
}

// cost: time O((2 + FOLD_TRIES)·elk(s + e) + e·d), heap O(s + e·d), stack O(d)
// vars: s = 도형 수, e = 선 수, d = 그룹 깊이, elk = elkjs 층 배치 시간
// basis: estimate
// 배치 한 번. 안전 배치(safeLayout)는 자동 접기와 방향 돌리기를 하지 않는다.
async function place(figure, sizes) {
  let best = await arrange(figure, sizes);
  if (best.laid.width > CANVAS && figure.aspect === undefined && !figure.safeLayout) best = await fitCanvas(figure, sizes, best);
  return readElk(best.laid, best.model);
}

// cost: time O(elk(s + e) + e·d), heap O(s + e·d), stack O(d)
// vars: s = 도형 수, e = 선 수, d = 그룹 깊이, elk = elkjs 층 배치 시간
// basis: estimate
// 모형을 만들고 elkjs로 한 번 배치한다. 사람과 원통이 있으면 두 번 배치한다.
// 처음에는 연결점 순서를 elkjs에 맡기고, 그 순서대로 몸통 범위에 연결점을 고정해 다시 배치한다.
// 순서를 미리 정하면 선이 엇갈리고, 맡기기만 하면 연결점이 머리나 뚜껑 자리에 놓이기 때문이다.
async function arrange(figure, sizes) {
  const model = buildModel(figure, sizes);
  const hasBodyPorts = [...model.nodes.values()].some((n) => isBodyShape(n) && n.ports.length);
  if (hasBodyPorts) recordPortOrder(await engine.layout(toElk(model, figure)), model);
  return { model, laid: await engine.layout(toElk(model, figure)) };
}

// 글자 크기를 지킨 채 표준 캔버스에 들어가고 보이는 비율도 한도 안인 배치. 높이가 캔버스 안이면 비율은 보지 않는다(그림 검사 9번과 같은 기준).
function fitsCanvas({ width, height }) {
  const ratio = displayRatio(width, height);
  const isBalanced = ratio <= ASPECT_MAX && ratio >= 1 / ASPECT_MAX;
  return width <= CANVAS && (isBalanced || height <= CANVAS);
}

// 알맞은 비율 범위에서 벗어난 정도(비율을 로그로 본 거리). 범위 안이면 0이다.
function ratioMiss({ width, height }) {
  const ratio = displayRatio(width, height);
  return Math.max(0, Math.log(FIT_MIN / ratio), Math.log(ratio / FIT_MAX));
}

// cost: time O(e), heap O(1), stack O(1)
// vars: e = 선 수
// basis: estimate
function hasColumnEdges(figure) {
  return figure.edges.some((e) => e.fromColumn || e.toColumn);
}

// cost: time O((2 + FOLD_TRIES)·elk(s + e)), heap O(s + e), stack O(d)
// vars: s = 도형 수, e = 선 수, d = 그룹 깊이, elk = elkjs 층 배치 시간
// basis: estimate
/**
 * 한 줄 배치가 캔버스보다 넓을 때 글자 크기를 지키는 배치를 찾는다. 후보 순서는 이렇다.
 * 1. 바깥 방향을 돌린다(right는 down으로). 선이 줄 사이를 돌아오지 않아 접기보다 선이 짧다. 열을 이은 테이블이 있고 이것이 폭에 들지 않으면 열 선을 오른쪽 면으로 모은 묶음 배치도 본다.
 * 2. 자동 비율로 접는다. 폭에 들 때까지 비율을 낮춰 가며 FOLD_TRIES번까지 본다.
 * 캔버스에 들고 비율이 알맞은 범위(FIT_MIN~FIT_MAX) 안인 첫 후보를 쓴다. 범위 안인 후보가 없으면 캔버스에 드는 후보 가운데 범위에 가장 가까운 것을 쓴다.
 * 캔버스에 드는 후보가 없으면 가장 좁은 배치를 쓰고, 표시 폭만 줄인다(docs/design/layout.md 그림 크기).
 */
async function fitCanvas(figure, sizes, flat) {
  let narrowest = flat;
  const fitting = [];
  const consider = (candidate) => {
    if (candidate.laid.width < narrowest.laid.width) narrowest = candidate;
    if (!fitsCanvas(candidate.laid)) return false;
    fitting.push(candidate);
    return ratioMiss(candidate.laid) === 0;
  };
  const turned = await arrange({ ...figure, direction: TURNED[figure.direction] }, sizes);
  if (consider(turned)) return turned;
  // 열을 이은 테이블은 세로로 돌려도 들어오는 선이 왼쪽 면이라 아래 도형이 계단처럼 밀려 폭에 들지 않는다. 선이 모두 오른쪽 면인 묶음 배치로 한 번 더 본다.
  if (hasColumnEdges(figure)) {
    const bracket = await arrange({ ...figure, direction: TURNED[figure.direction], isBracket: true }, sizes);
    if (consider(bracket)) return bracket;
  }
  let aspect = values.scale['fold-aspect'];
  for (let i = 0; i < FOLD_TRIES; i++, aspect *= values.scale['fold-step']) {
    const folded = await arrange({ ...figure, aspect }, sizes);
    if (consider(folded)) return folded;
  }
  return fitting.sort((a, b) => ratioMiss(a.laid) - ratioMiss(b.laid))[0] ?? narrowest;
}
