// 이동 글 상자가 피할 사각형. 글자(도형 이름과 부제, 테이블 머리와 열, 그룹 제목), 도형 테두리(사람 머리와 몸통, 원통 뚜껑 포함), 선 라벨 알약이다.
import { measure } from '../measure/fonts.js';
import { STYLE, groupHead, hasPill, sizePill } from '../measure/sizes.js';
import { plainText } from '../text.js';
import { values } from '../tokens.js';
import { labelRows } from './figure.js';
import { gridRows } from './grid.js';

const SPACE = values.space;
const INNER_X = SPACE['9'];
const SIZE = values.size;

// cost: time O(s·l + c + g), heap O(s·l + c + g), stack O(1)
// vars: s = 도형 수, l = 도형 이름 줄 수, c = 테이블 열 수, g = 그룹 수
// basis: estimate
/**
 * 장면의 글자 사각형 목록. 가로는 잰 글 폭이고 높이는 글자 크기에 위아래 `space.1`씩 더한 값이다(글자 위아래 내림과 올림).
 * @returns { x, y, w, h, name }[]. name은 알림 메시지에 쓸 표시 글이다
 */
function textBoxes(scene) {
  const boxes = [];
  const add = ({ x, center, width }, style, name) => boxes.push({ x, y: center - style.size / 2 - SPACE['1'], w: width, h: style.size + SPACE['1'] * 2, name: plainText(name) });
  for (const it of scene.items) {
    if (it.shape === 'table') {
      const labelW = measure(it.label, STYLE.label.size, STYLE.label.face);
      add({ x: it.x + it.w / 2 - labelW / 2, center: it.y + it.rowH / 2, width: labelW }, STYLE.label, it.label);
      it.columns.forEach((c, k) => {
        const center = it.y + it.rowH * (k + 1.5);
        const key = c.pk ? 'PK' : c.fk ? 'FK' : c.unique ? 'UNQ' : '';
        const nameW = measure(c.name, STYLE.cell.size) + (key ? SPACE['3'] + measure(key, STYLE.tag.size, STYLE.tag.face) : 0);
        const typeW = measure(c.type, STYLE.type.size, STYLE.type.face);
        add({ x: it.x + INNER_X, center, width: nameW }, STYLE.cell, c.name);
        add({ x: it.x + it.w - INNER_X - typeW, center, width: typeW }, STYLE.type, c.type);
      });
      continue;
    }
    for (const row of it.shape === 'grid' ? gridRows(it) : labelRows(it)) {
      const width = measure(row.text, row.style.size, row.style.face);
      add({ x: row.cx - width / 2, center: row.center, width }, row.style, row.text);
    }
  }
  for (const g of scene.groups) if (g.label) add({ x: g.x + g.titleDx + groupHead(g).textDx, center: g.y + values.size.group.title / 2, width: measure(g.label, STYLE.group.size, STYLE.group.face) }, STYLE.group, g.label);
  return boxes;
}

// cost: time O(s + e), heap O(s + e), stack O(1)
// vars: s = 도형 수, e = 선 수
// basis: estimate
/**
 * 이동 글 상자가 피할 모든 사각형: 글자, 도형 테두리, 선 라벨 알약. 그룹 틀은 이동이 그 안에서 일어나므로 제목 글자만 피한다.
 * @returns { x, y, w, h, name }[]
 */
export function chipObstacles(scene) {
  return [...textBoxes(scene), ...shapeBoxes(scene), ...pillBoxes(scene), ...decorBoxes(scene)];
}

// cost: time O(s + g), heap O(s + g), stack O(1)
// vars: s = 도형 수, g = 그룹 수
// basis: estimate
// 도형 윗줄과 그룹 제목 줄의 아이콘과 알약(배지, 개수, 반복). 글자와 같이 가리면 읽을 수 없다.
function decorBoxes(scene) {
  const place = (decor, origin, name) => decor.items.filter((i) => i.kind !== 'title').map((i) => ({ x: origin.x + i.x, y: origin.y + i.y, w: i.w, h: i.h, name: plainText(i.text ?? name) }));
  const nodes = scene.items.filter((it) => it.decor).flatMap((it) => place(it.decor, { x: it.x + it.decor.x, y: it.y + it.decor.y }, it.label));
  const groups = scene.groups.flatMap((g) => (groupHead(g).decor ? place(groupHead(g).decor, { x: g.x + g.titleDx, y: g.y + (values.size.group.title - groupHead(g).decor.h) / 2 }, g.label) : []));
  return [...nodes, ...groups];
}

// cost: time O(s), heap O(s), stack O(1)
// vars: s = 도형 수
// basis: estimate
// 도형이 그려진 테두리 사각형. 사람은 머리와 몸통(어깨 포함) 둘, 원통은 위아래 뚜껑까지 넓힌다.
function shapeBoxes(scene) {
  return scene.items.flatMap((it) => {
    const name = plainText(it.label ?? it.id);
    if (it.shape === 'person') {
      const head = SIZE.person.head;
      const shoulder = SIZE.person.shoulder;
      const headTop = it.y - shoulder - SPACE['1'] - head;
      return [
        { x: it.x + it.w / 2 - head / 2, y: headTop, w: head, h: head, name },
        { x: it.x, y: it.y - shoulder, w: it.w, h: it.h + shoulder, name },
      ];
    }
    const cap = it.shape === 'store' ? it.marginTop : 0;
    return [{ x: it.x, y: it.y - cap, w: it.w, h: it.h + cap * 2, name }];
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
      return { x: e.labelAt.x - w / 2, y: e.labelAt.y - h / 2, w, h, name: plainText(e.label ?? `${e.no}`) };
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
  const half = SPACE['1'];
  const bar = (a, b, extra) => ({ x: Math.min(a.x, b.x) - half, y: Math.min(a.y, b.y) - half, w: Math.abs(a.x - b.x) + half * 2, h: Math.abs(a.y - b.y) + half * 2, soft: true, ...extra });
  const edges = scene.edges.flatMap((e, edge) => (e.points ?? []).slice(1).map((p, i) => bar(e.points[i], p, { edge })));
  const frames = scene.groups.flatMap((g) => {
    const [tl, tr, bl, br] = [{ x: g.x, y: g.y }, { x: g.x + g.w, y: g.y }, { x: g.x, y: g.y + g.h }, { x: g.x + g.w, y: g.y + g.h }];
    return [bar(tl, tr), bar(bl, br), bar(tl, bl), bar(tr, br)];
  });
  return [...edges, ...frames];
}
