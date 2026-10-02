// 점 위에 뜨는 글 상자의 크기와 자리. 움직이는 SVG, 재생기, 그림 검사가 시간표에 담은 같은 계획을 쓴다(docs/design/playback.md 이동 글).
import { curveOf, progressAt, timeAt } from './easing.js';
import { measure } from './measure/fonts.js';
import { STYLE } from './measure/sizes.js';
import { flattenRoute, pointAlong } from './route.js';
import { values } from './tokens.js';

const SPACE = values.space;
/** 글 상자와 점 사이 간격 */
export const CHIP_GAP = SPACE['6'];
/** 글 상자가 판 위아래 끝에서 떨어져야 하는 거리. 판 안쪽 여백(그림 둘레 여백)과 같다. */
export const CHIP_MARGIN = SPACE['14'];
// 글 상자 자리를 재는 경로 비율 간격(5%)
const SAMPLES = 20;
// 지점 사이를 선형으로 이은 자리가 글자를 가리면 지점을 반으로 쪼개는 최대 횟수
const REFINE_DEPTH = 4;
// 바뀜 시각을 찾으려고 구간을 훑는 칸 수
const FLIP_SCAN = 16;
// 겹치기 시작하는 칸 안에서 바뀜 시각을 이분 탐색하는 횟수. 칸 폭의 1/256까지 좁혀 한 프레임보다 훨씬 정확하다
const FLIP_BISECT = 8;
// 점이 선을 지나는 곡선. 움직이는 SVG와 재생기와 같다
const MOVE = curveOf('move');
// 이름 글자와 겹친 넓이가 이 값 이하면 겹침 없음으로 본다(잰 글 폭의 반올림 차이)
const OVERLAP_SLACK = 0.5;
// 잰 글 폭의 반올림 차이를 넘기 위한 여유
const FIT_SLACK = 0.5;
/** 글 상자가 도형, 글자, 알약, 다른 선, 그룹 틀에서 떨어져야 하는 최소 간격. 비켜 놓는 자리는 이만큼 띄운다. */
export const CHIP_CLEAR = SPACE['2'];
// 지점 사이 자리를 사각형과 견주는 시간 비율(구간을 8등분한 일곱 지점). 좁은 알약을 스치는 짧은 겹침을 놓치지 않으려는 촘촘함이다
const BETWEEN_RATIOS = Array.from({ length: 7 }, (_, i) => (i + 1) / 8);
// 가리는 것을 비켜 올리거나 내리는 최대 거리
const LIFT_MAX = CHIP_GAP * 4;
// 후보 선택 순서 가중치. 점 위 0, 올림 0.3, 점 아래 1, 옆으로 비킴 2(가까움)와 4(멂). 아래 줄의 옆 후보도 이 값에 더해 순서가 섞이지 않는다
const ROW_LIFT = 0.3;
const ROW_BELOW = 1;
const SIDE_NEAR = 2;
const SIDE_FAR = 4;
// 후보 순위에서 옆으로 비킨 거리를 가르는 가중치. 후보 종류(위, 아래, 옆)의 순서를 넘지 않을 만큼 작다
const SHIFT_WEIGHT = 1 / 10000;

// cost: time O(l·n), heap O(1), stack O(1)
// vars: l = 줄 수, n = 줄 글자 수
// basis: estimate
/** 글 상자 크기. 줄은 시간표가 이미 나눴다. */
export function sizeChip(lines) {
  const w = Math.max(...lines.map((line) => measure(line, STYLE.chip.size, STYLE.chip.face))) + SPACE['9'];
  return { w, h: lines.length * STYLE.chip.line + SPACE['4'] };
}

function overlapArea(a, b) {
  return Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
}

// cost: time O(a²), heap O(a), stack O(1)
// vars: a = 피할 사각형 수
// basis: estimate
/**
 * 점 point 위의 글 상자 자리. 후보마다 아래 순서로 견주어 가장 나은 것을 쓴다.
 * 1. 그림 안에 있다. 2. 피할 사각형(글자, 도형 테두리, 선 라벨 알약)과 겹치지 않는다(겹치면 겹친 넓이가 작은 쪽). 3. 판 위아래 끝에서 CHIP_MARGIN 이상 떨어진다.
 * 4. 선택 순서는 점 위 그대로, 가리는 것을 비켜 조금 더 올린 자리, 선 반대쪽(점 아래)과 그것을 조금 더 내린 자리, 가리는 사각형의 양 끝에 붙게 옆으로 비킨 자리(점에서 글 상자 반 폭과 간격 안), 그보다 멀리 옆으로 비킨 자리다.
 * 멀리 비킨 자리는 글 상자가 점에서 떨어져 보이지만, 점이 노드 안에서 출발해 도형을 벗어날 때까지 글 상자를 선을 따라 노드 밖에 두어 점이 따라잡게 하는 마지막 수단이다. 그래도 겹치면 그림 검사(check.js)가 경고한다.
 * 옆으로는 그림 밖으로 나가지 않게 밀어 넣는다. 가장자리 여백(CHIP_GAP)을 지킨 자리가 가리면 여백을 CHIP_CLEAR까지 줄인 자리를 쓴다. 가려지지 않는 자리가 여백보다 앞선다.
 * @param field { scene, avoid }. scene은 { width, height }, avoid는 { x, y, w, h, name }[]
 * @returns { dx, dy, box, isOutside, hits }. dx, dy는 점 위 기본 자리에서 옮긴 양, box는 그림 좌표의 글 상자 사각형이다. hits는 겹친 이름 목록이다
 */
export function placeChip(point, chip, { scene, avoid = [] }) {
  const ctx = { point, chip, scene, avoid };
  const candidates = rowsOf(ctx).flatMap((row) => centersOf(ctx, row.top).flatMap((side) => insetsOf(ctx, side).map((x) => candidateAt(ctx, row, { x, order: side.order }))));
  const best = candidates.reduce((a, b) => (compare(a.rank, b.rank) <= 0 ? a : b));
  const { rank, ...placed } = best;
  return placed;
}

// cost: time O(a), heap O(a), stack O(1)
// vars: a = 피할 사각형 수
// basis: estimate
// 세로 후보 줄: 점 위, 점 위를 가리는 것 위로 올린 자리, 점 아래, 가리는 것 아래로 내린 자리. order는 선택 순서 가중치다.
function rowsOf({ point, chip, avoid }) {
  const above = point.y - chip.h - CHIP_GAP;
  const below = above + chip.h + CHIP_GAP * 2;
  const rows = [{ top: above, order: 0, dy: 0 }, { top: below, order: ROW_BELOW, dy: below - above }];
  const covering = (top) => avoid.filter((o) => o.x < point.x + chip.w / 2 && point.x - chip.w / 2 < o.x + o.w && o.y < top + chip.h && top < o.y + o.h);
  for (const o of covering(above)) {
    const top = o.y - chip.h - CHIP_CLEAR;
    if (above - top <= LIFT_MAX) rows.push({ top, order: ROW_LIFT, dy: top - above });
  }
  for (const o of covering(below)) {
    const top = o.y + o.h + CHIP_CLEAR;
    if (top - below <= LIFT_MAX) rows.push({ top, order: ROW_BELOW + ROW_LIFT, dy: top - above });
  }
  return rows;
}

// cost: time O(a), heap O(a), stack O(1)
// vars: a = 피할 사각형 수
// basis: estimate
// 가로 후보: 점 바로 위(아래)와, 같은 높이 띠의 사각형 양 끝에 붙는 자리. 점에서 반 폭과 간격 안이면 order 2, 더 멀면 4다.
function centersOf({ point, chip, avoid }, top) {
  const reach = chip.w / 2 + CHIP_GAP;
  const near = avoid.filter((o) => o.y < top + chip.h && top < o.y + o.h);
  const ends = near.flatMap((o) => [o.x + o.w + chip.w / 2 + CHIP_CLEAR, o.x - chip.w / 2 - CHIP_CLEAR]);
  return [{ center: point.x, order: 0 }, ...ends.map((center) => ({ center, order: Math.abs(center - point.x) <= reach ? SIDE_NEAR : SIDE_FAR }))];
}

// cost: time O(1), heap O(1), stack O(1)
// vars: 없음
// basis: estimate
// 가로 중심 후보 하나를 그림 안으로 밀어 넣는 자리. 가장자리 여백 CHIP_GAP을 지킨 자리가 먼저이고, 그 자리가 막히면 쓰라고 여백을 CHIP_CLEAR까지 줄인 자리를 더한다(서로 같으면 하나).
function insetsOf({ chip, scene }, { center }) {
  const fit = (inset) => Math.min(scene.width - chip.w / 2 - inset, Math.max(chip.w / 2 + inset, center));
  return [...new Set([fit(CHIP_GAP), fit(CHIP_CLEAR)])];
}

// cost: time O(a), heap O(1), stack O(1)
// vars: a = 피할 사각형 수
// basis: estimate
// 후보 하나의 자리와 순위
function candidateAt({ point, chip, scene, avoid }, row, { x, order: sideOrder }) {
  const box = { x: x - chip.w / 2, y: row.top, w: chip.w, h: chip.h };
  const hits = avoid.filter((o) => !o.soft && overlapArea(box, o) > OVERLAP_SLACK);
  const area = hits.reduce((sum, o) => sum + overlapArea(box, o), 0);
  // 선과 그룹 틀은 최소 간격 안에 들어와도 순위만 낮춘다.
  const padded = { x: box.x - CHIP_CLEAR, y: box.y - CHIP_CLEAR, w: box.w + CHIP_CLEAR * 2, h: box.h + CHIP_CLEAR * 2 };
  const nearArea = avoid.filter((o) => o.soft).reduce((sum, o) => sum + overlapArea(padded, o), 0);
  const isOutside = isOutsideFigure(box, scene);
  const isTight = row.top < CHIP_MARGIN - FIT_SLACK || row.top + chip.h > scene.height - CHIP_MARGIN + FIT_SLACK;
  const isCrowded = Math.min(box.x, scene.width - box.x - box.w) < CHIP_GAP - FIT_SLACK;
  const order = row.order + sideOrder + (Math.abs(x - point.x) + Math.abs(row.dy)) * SHIFT_WEIGHT;
  return { dx: x - point.x, dy: row.dy, box, isOutside, hits: hits.map((h) => h.name), rank: [Number(isOutside), area, nearArea, Number(isTight), Number(isCrowded), order] };
}

// cost: time O(r), heap O(1), stack O(1)
// vars: r = 순위 항목 수(6)
// basis: estimate
function compare(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

// cost: time O(k·(p + a)·2^d), heap O(k·2^d), stack O(d)
// vars: k = 재는 지점 수(21), p = 경로 점 수, a = 피할 글자 사각형 수, d = 쪼개는 최대 횟수(4)
// basis: estimate
/**
 * 이동 하나의 글 상자 계획. 경로를 5% 간격으로 나눈 지점마다 글 상자 자리를 정하고, 지점 사이를 선형으로 이은 자리가 글자를 가리거나 그림 밖으로 나가면 그 사이에 지점을 더한다.
 * 움직이는 SVG와 재생기가 이 목록을 그대로 쓴다.
 * @returns { path, issues }. path는 이동 진행 비율 at(오름차순)마다 [at, dx, dy]이고, issues는 지점마다 { at, isOutside, hits }다
 */
export function planChip(scene, hop, avoid) {
  const plan = { scene, hop, chip: sizeChip(hop.data), field: avoid.filter((o) => o.edge !== hop.edge), route: flattenRoute(scene.edges[hop.edge].points) };
  const base = Array.from({ length: SAMPLES + 1 }, (_, i) => placeAt(plan, i / SAMPLES));
  // 선형으로 이은 자리 검사는 진행 비율이 오르는 순서(isBack이면 경로 비율이 내려가는 순서)로 한다.
  if (hop.isBack) base.reverse();
  const samples = base.flatMap((sample, i) => (i < base.length - 1 ? [sample, ...refine(plan, [sample, base[i + 1]], REFINE_DEPTH)] : [sample]));
  return { path: samples.map(({ at, dx, dy }) => [at, dx, dy]), issues: samples.map(({ at, isOutside, hits }) => ({ at, isOutside, hits })) };
}

// cost: time O(p + a), heap O(1), stack O(1)
// vars: p = 경로 점 수, a = 피할 글자 사각형 수
// basis: estimate
// 경로 비율 fraction 지점의 글 상자 자리. at은 이동 진행 비율이다.
function placeAt({ scene, hop, chip, field, route }, fraction) {
  return { at: hop.isBack ? 1 - fraction : fraction, fraction, ...placeChip(pointAlong(route, fraction), chip, { scene, avoid: field }) };
}

// cost: time O(r·(p + a)), heap O(1), stack O(1)
// vars: r = 재는 비율 수, p = 경로 점 수, a = 피할 글자 사각형 수
// basis: estimate
// 두 지점 사이를 선형으로 이은 자리가 ratios 모든 비율에서 그림 안이고 글자를 가리지 않는지
function isClean({ scene, hop, chip, field, route }, pair, ratios = BETWEEN_RATIOS) {
  return ratios.every((ratio) => {
    const { box } = chipBoxBetween({ route, hop, chip }, pair, ratio);
    return !isOutsideFigure(box, scene) && !field.some((text) => !text.soft && overlapArea(box, text) > OVERLAP_SLACK);
  });
}

// cost: time O((p + a)·2^d), heap O(2^d), stack O(d)
// vars: p = 경로 점 수, a = 피할 글자 사각형 수, d = 쪼갠 깊이
// basis: estimate
// 두 지점 사이가 깨끗하지 않으면 가운데 지점을 더해 반씩 다시 본다.
function refine(plan, [a, b], depth) {
  if (isClean(plan, [a, b])) return [];
  // 더 쪼개도 사이가 글자를 가리면(점 위에서 아래로 바뀌는 구간) 앞 자리를 b 직전까지 붙들어 바뀜을 같은 시각의 두 지점(순간 이동)으로 만든다.
  if (depth === 0) return flip(plan, [a, b]);
  const mid = placeAt(plan, (a.fraction + b.fraction) / 2);
  return [...refine(plan, [a, mid], depth - 1), mid, ...refine(plan, [mid, b], depth - 1)];
}

// cost: time O((FLIP_SCAN + FLIP_BISECT)·(p + a)), heap O(1), stack O(1)
// vars: FLIP_SCAN = 훑는 칸 수(16), FLIP_BISECT = 이분 탐색 횟수(8), p = 경로 점 수, a = 피할 글자 사각형 수
// basis: estimate
// 앞 지점 a의 자리를 붙든 채 점이 가다가 처음 글자를 가리기 직전까지 두고, 거기서 같은 시각에 b의 자리로 바꾼다. 바뀜이 가리는 구간을 시간 없는 순간으로 줄여, 어느 프레임에도 중간 자리가 보이지 않게 한다. 한 시각에 지점이 둘이라 SMIL keyTimes도 같은 값이 이어진다.
function flip(plan, [a, b]) {
  const [ta, tb] = [timeAt(MOVE, a.at), timeAt(MOVE, b.at)];
  const held = { ...a, at: b.at };
  let safe = 0;
  while (safe < FLIP_SCAN && isClean(plan, [a, held], [(safe + 1) / FLIP_SCAN])) safe += 1;
  // 겹침은 깨끗한 마지막 칸 끝과 겹치는 칸 끝 사이 어딘가에서 시작하므로, 그 칸 안에서 마지막으로 깨끗한 비율을 찾는다.
  let [low, high] = [safe / FLIP_SCAN, Math.min(1, (safe + 1) / FLIP_SCAN)];
  for (let i = 0; i < FLIP_BISECT; i++) {
    const mid = (low + high) / 2;
    if (isClean(plan, [a, held], [mid])) low = mid;
    else high = mid;
  }
  const atFrom = progressAt(MOVE, ta + (tb - ta) * low);
  const entries = [];
  const at = { at: atFrom, fraction: plan.hop.isBack ? 1 - atFrom : atFrom };
  if (atFrom > a.at && atFrom < b.at) entries.push({ ...a, ...at });
  if (atFrom < b.at) entries.push({ ...b, ...at });
  return entries;
}

// cost: time O(p), heap O(1), stack O(1)
// vars: p = 경로 점 수
// basis: estimate
/**
 * 두 계획 지점 a, b(진행 비율이 오르는 순서) 사이, 시간 비율이 a 시각에서 b 시각으로 ratio만큼 간 때의 글 상자. 움직이는 SVG와 재생기가 지점 사이를 시간에 선형으로 잇는 것과 같다.
 * @param move { route, hop, chip }. route는 그려지는 경로를 편 점 목록(flattenRoute)이다. 점은 둥근 모서리 경로를 따라가므로 꺾은선이 아니라 이것으로 자리를 잰다
 * @returns { box, point }. box는 그림 좌표의 글 상자, point는 그 시각 점의 자리다
 */
export function chipBoxBetween({ route, hop, chip }, [a, b], ratio) {
  const [ta, tb] = [timeAt(MOVE, a.at), timeAt(MOVE, b.at)];
  const time = ta + (tb - ta) * ratio;
  const f = progressAt(MOVE, time);
  const point = pointAlong(route, hop.isBack ? 1 - f : f);
  const [dx, dy] = [a.dx + (b.dx - a.dx) * ratio, a.dy + (b.dy - a.dy) * ratio];
  return { point, box: { x: point.x + dx - chip.w / 2, y: point.y - chip.h - CHIP_GAP + dy, w: chip.w, h: chip.h } };
}

function isOutsideFigure(box, scene) {
  return box.x < -FIT_SLACK || box.y < -FIT_SLACK || box.x + box.w > scene.width + FIT_SLACK || box.y + box.h > scene.height + FIT_SLACK;
}
