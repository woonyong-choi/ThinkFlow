// 이동 글 상자가 피할 사각형. 글자(도형 이름과 부제, 테이블 머리와 열, 그룹 제목), 아이콘과 알약 장식, 카드와 큐 안, 도형 테두리(원통 뚜껑 포함), 선 라벨 알약이다.
import { hasPill, placeGroupHead, sizePill } from '../measure/sizes.js';
import { STYLE, allTexts, textSpan } from '../measure/texts.js';
import { plainText } from '../text.js';
import { values } from '../vendor/theme/tokens.js';
import { queueSlots } from '../measure/queue.js';
import { contentBox } from './content.js';
import { statusBoxes } from './status.js';

const SPACE = values.spacing;

// cost: time O(s·l + g + e), heap O(s·l + g + e), stack O(1)
// vars: s = 도형 수, l = 도형 글 줄 수, g = 그룹 수, e = 선 수
// basis: estimate
/**
 * 장면의 글자 사각형 목록. 가로는 잰 글 폭이고 높이는 글자 크기에 위아래 `space.1`씩 더한 값이다(글자 위아래 내림과 올림).
 * 도형의 글은 모두 카드가 그리는 text(measure/texts.js)라서 그리는 자리와 같은 값을 읽는다.
 * @returns { x, y, w, h, name }[]. name은 알림 메시지에 쓸 표시 글이다
 */
export function textBoxes(scene) {
  const boxes = [];
  const add = ({ x, center, width }, style, name) => boxes.push({ x, y: center - style.size / 2 - SPACE["0-5"], w: width, h: style.size + SPACE["0-5"] * 2, name: plainText(name, style.face) });
  for (const it of scene.items) for (const t of allTexts(it)) add(textSpan(it, t), t.style, t.text);
  for (const g of scene.groups) if (g.label) add(textSpan(g, placeGroupHead(g).text), STYLE.group, g.label);
  for (const edge of scene.edges ?? []) for (const label of edge.endpointLabels ?? []) add({ x: label.x - label.w / 2, center: label.y, width: label.w }, STYLE.pill, label.text);
  return boxes;
}

// cost: time O(s + e), heap O(s + e), stack O(1)
// vars: s = 도형 수, e = 선 수
// basis: estimate
/**
 * 이동 글 상자가 피할 모든 사각형: 글자, 도형 테두리, 선 라벨 알약. 그룹 틀은 이동이 그 안에서 일어나므로 제목 글자만 피한다.
 * 시간표(timeline)를 주면 단계별 도형 상태 알약도 선 라벨 알약처럼 어떤 경우에도 가리지 않는다.
 * @returns { x, y, w, h, name }[]
 */
export function chipObstacles(scene, timeline) {
  return [...textBoxes(scene), ...shapeBoxes(scene), ...pillBoxes(scene), ...decorBoxes(scene), ...innerBoxes(scene), ...(timeline ? statusObstacles(scene, timeline) : [])];
}

// cost: time O(s), heap O(s), stack O(1)
// vars: s = 도형 수
// basis: estimate
// 도형 안에서 글자처럼 읽히는 것: 카드가 차지하는 사각형과 큐의 칸. 도형 윤곽 사각형 안에 들어 있어 처음 계획은 이미 윤곽으로 피하므로 `isInner`로 가르고, 윤곽을 덮는 두 번째 계획(chip-plan.js)만 이것을 따로 피한다.
function innerBoxes(scene) {
  return scene.items.flatMap((it) => {
    const name = plainText(it.label ?? it.id);
    const card = it.content ? [{ ...contentBox(it), name, isInner: true }] : [];
    if (it.shape !== 'queue') return card;
    const slots = queueSlots(it);
    const [x0, y0] = [Math.min(...slots.map((s) => s.x)), Math.min(...slots.map((s) => s.y))];
    return [...card, { x: x0, y: y0, w: Math.max(...slots.map((s) => s.x + s.w)) - x0, h: Math.max(...slots.map((s) => s.y + s.h)) - y0, name, isInner: true }];
  });
}

// cost: time O(s + p), heap O(p), stack O(1)
// vars: s = 도형 수, p = 상태 알약 수
// basis: estimate
// 단계별 도형 상태 알약 사각형. 선 라벨 알약과 같이 어떤 자리에서도 가리지 않는다(isPill).
function statusObstacles(scene, timeline) {
  return statusBoxes(scene, timeline).map(({ x, y, w, h, name }) => ({ x, y, w, h, name, isPill: true }));
}

// cost: time O(s + g), heap O(s + g), stack O(1)
// vars: s = 도형 수, g = 그룹 수
// basis: estimate
// 도형 윗줄과 그룹 제목 줄의 아이콘과 알약(배지, 개수, 반복). 글자와 같이 가리면 읽을 수 없다.
function decorBoxes(scene) {
  const place = (decor, origin, name) => decor.items.filter((i) => i.kind !== 'title').map((i) => ({ x: origin.x + i.x, y: origin.y + i.y, w: i.w, h: i.h, name: plainText(i.text ?? name) }));
  const nodes = scene.items.filter((it) => it.decor).flatMap((it) => place(it.decor, { x: it.x + it.decor.x, y: it.y + it.decor.y }, it.label));
  const groups = scene.groups.flatMap((g) => {
    const { decor } = placeGroupHead(g);
    return decor ? place(decor, { x: g.x + decor.x, y: g.y + decor.y }, g.label) : [];
  });
  return [...nodes, ...groups];
}

// cost: time O(s), heap O(s), stack O(1)
// vars: s = 도형 수
// basis: estimate
// 도형이 그려진 테두리 사각형(isFrame). 원통은 위아래 뚜껑까지 넓힌다. 글 상자는 보이는 동안 이 사각형 안의 글자를 가리지 않고, 윤곽은 자리가 모자랄 때만 덮는다.
function shapeBoxes(scene) {
  return scene.items.flatMap((it) => {
    if (it.shape === 'grid') return [];
    const name = plainText(it.label ?? it.id);
    const cap = it.shape === 'store' ? it.marginTop : 0;
    return [{ x: it.x, y: it.y - cap, w: it.w, h: it.h + cap * 2, name, isFrame: true }];
  });
}

// cost: time O(e), heap O(e), stack O(1)
// vars: e = 선 수
// basis: estimate
// 선 라벨 알약 사각형. 자기 선의 알약도 점이 지나므로 피한다.
function pillBoxes(scene) {
  return scene.edges
    .filter((e) => hasPill(e) && e.labelAt)
    .map((e) => {
      const { w, h } = sizePill(e.label, e.no);
      return { x: e.labelAt.x - w / 2, y: e.labelAt.y - h / 2, w, h, name: plainText(e.label ?? `${e.no}`), isPill: true };
    });
}

// cost: time O(e·p + g), heap O(e·p + g), stack O(1)
// vars: e = 선 수, p = 경로 점 수, g = 그룹 수
// basis: estimate
/**
 * 이동 글 상자가 되도록 떨어져야 하는 선: 모든 선의 마디와 그룹 틀의 네 변. 글자와 달리 가리면 읽을 수 없는 것이 아니라 붙어 보이는 것이라 순위만 낮춘다(soft).
 * 선 마디는 어느 선의 것인지 edge에 적는다. 이동은 자기 선을 피하지 않는다(글 상자는 자기 선 위에 뜬다).
 * @returns { x, y, w, h, soft: true, edge? }[]
 */
export function chipLines(scene) {
  const half = SPACE["0-5"];
  const bar = (a, b, extra) => ({ x: Math.min(a.x, b.x) - half, y: Math.min(a.y, b.y) - half, w: Math.abs(a.x - b.x) + half * 2, h: Math.abs(a.y - b.y) + half * 2, soft: true, ...extra });
  const edges = scene.edges.flatMap((e, edge) => (e.points ?? []).slice(1).map((p, i) => bar(e.points[i], p, { edge })));
  const frames = scene.groups.flatMap((g) => {
    const [tl, tr, bl, br] = [{ x: g.x, y: g.y }, { x: g.x + g.w, y: g.y }, { x: g.x, y: g.y + g.h }, { x: g.x + g.w, y: g.y + g.h }];
    return [bar(tl, tr), bar(bl, br), bar(tl, bl), bar(tr, br)];
  });
  return [...edges, ...frames];
}
