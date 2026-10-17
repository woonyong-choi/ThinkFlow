// 구조, 상태, 데이터 관계 그림을 elkjs로 배치한다. 그룹마다 따로 배치하고, 그룹 경계를 넘는 선은 경계마다 연결점을 거친다(docs/design/layout.md).
import ELK from 'elkjs/lib/elk.bundled.js';
import { ASPECT_MAX, canvasOf, displayRatio, layoutWidthOf } from '../canvas.js';
import { values } from '@woonyong-choi/design-tokens/tokens.js';
import { toElk } from './elk.js';
import { LayoutError } from './error.js';
import { buildModel } from './model.js';
import { isBodyShape, recordPortOrder } from './ports.js';
import { readElk } from './read.js';

// 알맞은 보이는 비율의 범위. 세로로 긴 쪽은 두 화면 모두 페이지 스크롤로 읽혀 한도(aspect-max)의 역수까지, 가로로 넓은 쪽은 데스크톱 가로 화면 비율(1400x900)까지다.
const FIT_MIN = 1 / ASPECT_MAX;
const FIT_MAX = values.scale['aspect-fit-max'];
const TURNED = { right: 'down', down: 'right' };
// 자동 접기에서 비율을 낮춰 다시 배치해 보는 최대 횟수. 배치 시간이 이 횟수만큼 늘 수 있다.
const FOLD_TRIES = 4;
// 본문 단 그림에서 가로형으로 보는 가장 작은 폭/높이 비율. 이보다 정사각형에 가까운 후보는 세로 배치를 바꿀 만큼 낫지 않다(예제 흐름도 807x777은 좁은 화면 재배치에서 이동 글이 그림 밖으로 나갔다).
const LANDSCAPE_MIN = 1.25;

let engine;

/** 배치 목표는 표시 배율이 아니므로 그래프 보기가 있는 문서에서만 받는다. */
export function checkLayoutWidth(figure, width, problems) {
  if (width === undefined) return;
  if (!Number.isFinite(width) || width <= 0) problems.error(figure.line, 'layoutWidth must be a positive finite number');
  if (!figure.views?.some((view) => view.strategy === 'graph')) problems.error(figure.line, 'layoutWidth is only for documents with a graph view');
}

// cost: time O(elk), heap O(s + e), stack O(1)
// vars: elk = 배치 시간, s = 도형 수, e = 선 수
// basis: estimate
// 구조 그림 배치. 배치가 끝내 실패하면 원인 선의 줄 번호가 있는 오류로 바꿔 알린다(내부 오류로 끝내지 않는다).
export async function layoutOrFail(figure, sizes, { problems, width }) {
  try {
    return await layoutGraph(figure, sizes, width);
  } catch (error) {
    if (!(error instanceof LayoutError)) throw error;
    problems.error(error.line ?? figure.line, `${error.message}. Change a group direction, remove "aspect", or break the cycle into fewer back edges`, { code: 'layout' });
    return problems.throwIfAny();
  }
}

// cost: time O((3 + FOLD_TRIES)·elk(s + e) + e·d), heap O(s + e·d), stack O(d)
// vars: s = 도형 수, e = 선 수, d = 그룹 깊이, elk = elkjs 층 배치 시간
// basis: estimate
/**
 * 그림을 배치한다.
 * @param sizes Map<도형 id, sizeNode 결과>
 * @param layoutWidth 배치가 들어갈 목표 폭. 표시 배율이나 글자 크기는 바꾸지 않는다
 * @returns { items, groups, edges, width, height }. items는 도형 사각형(배치 사각형과 바깥 여백), edges는 경로 점과 라벨 자리
 */
async function layoutGraph(figure, sizes, layoutWidth = layoutWidthOf(figure)) {
  engine ??= new ELK();
  try {
    return await place(figure, sizes, layoutWidth);
  } catch (first) {
    // 처음 배치가 실패하면 줄 바꿈과 모델 순서 없이 한 번 더 한다. 이것도 실패하면 줄 번호가 있는 배치 오류로 알린다.
    try {
      return await place({ ...figure, aspect: undefined, safeLayout: true }, sizes, layoutWidth);
    } catch {
      throw first instanceof LayoutError ? first : new LayoutError(first.message, figure.line);
    }
  }
}

// cost: time O((3 + FOLD_TRIES)·elk(s + e) + e·d), heap O(s + e·d), stack O(d)
// vars: s = 도형 수, e = 선 수, d = 그룹 깊이, elk = elkjs 층 배치 시간
// basis: estimate
// 배치 한 번. 안전 배치(safeLayout)는 자동 접기와 방향 돌리기를 하지 않는다.
async function place(figure, sizes, layoutWidth) {
  let best = await arrange(figure, sizes);
  const canAdapt = figure.aspect === undefined || layoutWidth < layoutWidthOf(figure);
  if (best.laid.width > layoutWidth && canAdapt && !figure.safeLayout) best = await fitCanvas({ ...figure, aspect: undefined }, sizes, { flat: best, canvas: layoutWidth, cap: Math.max(layoutWidth, canvasOf(figure)) });
  const scene = readElk(best.laid, best.model);
  // 제목이 선을 비킬 자리가 없는 그룹은 너비를 넓혀 한 번 더 배치한다(그림 검사 13번).
  const blocked = scene.groups.filter((g) => g.isTitleBlocked).map((g) => g.id);
  return blocked.length && !figure.wideGroups ? place({ ...figure, wideGroups: new Set(blocked) }, sizes, layoutWidth) : scene;
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
function fitsCanvas({ width, height }, canvas) {
  const ratio = displayRatio(width, height, canvas);
  const isBalanced = ratio <= ASPECT_MAX && ratio >= 1 / ASPECT_MAX;
  return width <= canvas && (isBalanced || height <= canvas);
}

// 알맞은 비율 범위에서 벗어난 정도(비율을 로그로 본 거리). 범위 안이면 0이다.
// 본문 단 폭 목표에서는 내용 자체의 비율로 재고 가로형(폭이 높이의 LANDSCAPE_MIN배 이상)만 알맞다고 본다. 좁고 긴 기둥도 단 폭의 자리를 차지한다고 보면(displayRatio) 세로 기둥이 접은 배치보다 먼저 뽑혔다.
function ratioMiss({ width, height }, canvas, isColumn) {
  if (isColumn) {
    const ratio = width / height;
    return Math.max(0, Math.log(LANDSCAPE_MIN / ratio), Math.log(ratio / ASPECT_MAX));
  }
  const ratio = displayRatio(width, height, canvas);
  return Math.max(0, Math.log(FIT_MIN / ratio), Math.log(ratio / FIT_MAX));
}

// cost: time O(e), heap O(1), stack O(1)
// vars: e = 선 수
// basis: estimate
function hasColumnEdges(figure) {
  return figure.edges.some((e) => e.fromColumns || e.toColumns);
}

// cost: time O((3 + FOLD_TRIES)·elk(s + e)), heap O(s + e), stack O(d)
// vars: s = 도형 수, e = 선 수, d = 그룹 깊이, elk = elkjs 층 배치 시간
// basis: estimate
/**
 * 한 줄 배치가 캔버스보다 넓을 때 글자 크기를 지키는 배치를 찾는다. 후보 순서는 이렇다.
 * 1. 바깥 방향을 돌린다(right는 down으로). 선이 줄 사이를 돌아오지 않아 접기보다 선이 짧다. 열을 이은 테이블이 있고 이것이 폭에 들지 않으면 열 선을 오른쪽 면으로 모은 묶음 배치도 본다.
 * 2. 자동 비율로 접는다. 폭에 들 때까지 비율을 낮춰 가며 FOLD_TRIES번까지 본다.
 * 3. 좁은 화면 목표 폭에서도 넘치면 한 층당 도형 하나인 세로 후보를 비교한다. 관계나 사건 순서는 바꾸지 않는다. 본문 단 폭에서는 이 후보를 보지 않는다.
 * 목표 폭(canvas, 보통 본문 단 폭)에 들고 비율이 알맞은 범위(FIT_MIN~FIT_MAX) 안인 첫 후보를 쓴다. 범위 안인 후보가 없으면 목표 폭에 드는 후보 가운데 범위에 가장 가까운 것을 쓴다.
 * 목표 폭에 드는 후보가 없으면 본문 단 목표에서는 표시 상한(cap) 안의 가로형 후보를, 그것도 없으면 상한 안에서 가장 좁은 것을, 그것도 없으면 가장 좁은 배치를 쓴다. SVG와 HTML은 칸 폭을 채우므로 가로 스크롤은 없다.
 */
async function fitCanvas(figure, sizes, { flat, canvas, cap }) {
  let narrowest = flat;
  const tried = [flat];
  const fitting = [];
  const isColumn = canvas >= layoutWidthOf(figure);
  const consider = (candidate) => {
    tried.push(candidate);
    if (candidate.laid.width < narrowest.laid.width) narrowest = candidate;
    if (!fitsCanvas(candidate.laid, canvas)) return false;
    fitting.push(candidate);
    return ratioMiss(candidate.laid, canvas, isColumn) === 0;
  };
  const turned = await arrange({ ...figure, direction: TURNED[figure.direction] }, sizes);
  if (consider(turned)) return turned;
  // 열을 이은 테이블은 세로로 돌려도 들어오는 선이 왼쪽 면이라 아래 도형이 계단처럼 밀려 폭에 들지 않는다. 선이 모두 오른쪽 면인 묶음 배치로 한 번 더 본다.
  if (hasColumnEdges(figure)) {
    for (const direction of [TURNED[figure.direction], figure.direction]) {
      const bracket = await arrange({ ...figure, direction, isBracket: true }, sizes);
      if (consider(bracket)) return bracket;
    }
  }
  let aspect = values.scale['fold-aspect'];
  for (let i = 0; i < FOLD_TRIES; i++, aspect *= values.scale['fold-step']) {
    const folded = await arrange({ ...figure, aspect }, sizes);
    if (consider(folded)) return folded;
  }
  // 가로 형제가 남아 목표 폭을 넘으면 한 층에 하나씩 놓는 세로 후보를 비교한다. 도형과 연결은 그대로 ELK에 맡긴다.
  // 열을 이은 테이블도 한 줄로 세우면 열 선이 옆면을 오가며 그림을 휘감는다. 좁은 화면에서는 폭에 드는 것이 우선이라 본다.
  const isNarrowTarget = canvas < layoutWidthOf(figure);
  // 한 층에 하나씩 세우는 후보도 좁은 화면 목표 폭에서만 본다. 본문 단 폭에서 쓰면 형제 카드가 모두 한 줄로 서서 단 폭의 절반만 쓰는 긴 기둥이 되었다(async-orders 336×1440).
  if (narrowest.laid.width > canvas && isNarrowTarget) {
    consider(await arrange({ ...figure, direction: 'down', aspect: undefined, oneNodePerLayer: true }, sizes));
    // 그룹을 한 층씩 푸는 후보는 좁은 화면 목표 폭에서만 본다. 본문 단 폭에서 쓰면 그룹 사이 선이 한 줄로 몰려 이동 글 상자 자리 찾기가 느려졌다(architecture 예제 빌드가 main의 1.7배).
    if (narrowest.laid.width > canvas && figure.groups.length && isNarrowTarget) {
      const grouped = await arrange({ ...figure, direction: 'down', aspect: undefined, oneNodePerLayer: true, compactGroups: true }, sizes);
      consider(grouped);
    }
  }
  const capped = tried.filter((c) => fitsCanvas(c.laid, cap));
  const byWidth = (a, b) => a.laid.width - b.laid.width;
  // 본문 단 폭 목표에서는 표시 상한(cap) 안의 가로형(폭이 높이의 LANDSCAPE_MIN배 이상) 후보가 있으면 그 가운데 비율이 알맞고, 목표 폭에 들고, 좁은 것을 고른다.
  // 그림은 넣는 칸의 폭을 채우도록 줄거나 커지므로(svg width 100%) 목표 폭을 조금 넘는 가로형도 스크롤 없이 줄어 보이고, 세로 기둥은 칸을 채우면 화면보다 길어진다.
  // 상한 안의 가로형이 없으면 예전 규칙대로 목표 폭 안에서 비율이 알맞은 것, 없으면 덜 줄어드는(글자가 큰) 좁은 후보를 쓴다. 상한을 넘는 가로형은 글자가 가장 작은 글 토큰보다 작아지므로(그림 검사 10번) 고르지 않는다.
  const landscape = capped.filter((c) => c.laid.width >= c.laid.height * LANDSCAPE_MIN);
  if (isColumn && landscape.length) {
    const rank = (c) => [ratioMiss(c.laid, cap, true), c.laid.width > canvas ? 1 : 0, c.laid.width];
    const byRank = (a, b) => rank(a).reduce((order, value, i) => order || value - rank(b)[i], 0);
    return landscape.sort(byRank)[0];
  }
  return closest(fitting, canvas, false) ?? capped.sort(byWidth)[0] ?? narrowest;
}

// 후보 가운데 알맞은 비율 범위에 가장 가까운 배치. 같으면 먼저 본 후보다.
function closest(candidates, canvas, isColumn) {
  return [...candidates].sort((a, b) => ratioMiss(a.laid, canvas, isColumn) - ratioMiss(b.laid, canvas, isColumn))[0];
}
