// 도형 하나의 윤곽을 그린다. 상자, 원통, 사람, 갈림길, 원, 상태 점, 테이블, 격자. 이름과 카드는 draw/figure.js가 그린다.
import { STACK_STEP, bodyOf } from '../measure/decor.js';
import { STYLE } from '../measure/sizes.js';
import { centerBaseline, escapeXml, renderRich, roundCoord as r } from '../text.js';
import { tokens, values } from '../tokens.js';
import { drawGrid } from './grid.js';
import { fillOf } from './paint.js';

const SPACE = values.space;
const SIZE = values.size;
const RADIUS = values.radius;
const EDGE_DASH = `${values.dash.line} ${values.dash.gap}`;

// 윤곽 모양. 채우기와 선은 부르는 쪽이 정한다.
const geometry = {
  store: (it) => [`<path d="M${r(it.x)} ${r(it.y)} a ${r(it.w / 2)} ${it.marginTop} 0 0 1 ${r(it.w)} 0 v ${r(it.h)} a ${r(it.w / 2)} ${it.marginTop} 0 0 1 ${r(-it.w)} 0 z"`],
  person: (it) => {
    const head = SIZE.person.head / 2;
    return [
      `<circle cx="${r(it.x + it.w / 2)}" cy="${r(it.y - SIZE.person.shoulder - SPACE['1'] - head)}" r="${r(head)}"`,
      `<path d="M${r(it.x)} ${r(it.y + it.h)} V ${r(it.y)} A ${r(it.w / 2)} ${SIZE.person.shoulder} 0 0 1 ${r(it.x + it.w)} ${r(it.y)} V ${r(it.y + it.h)} Z"`,
    ];
  },
  circle: (it) => [`<circle cx="${r(it.x + it.w / 2)}" cy="${r(it.y + it.h / 2)}" r="${r(it.w / 2)}"`],
  rect: (it) => {
    const { x, y, w, h } = bodyOf(it);
    return [`<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" rx="${RADIUS.xl}"`];
  },
};

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 도형 윤곽 조각(닫지 않은 글). 후광이 같은 윤곽을 다시 그린다. 상자, 외부 도형, 타일은 앞 상자(몸통)다. */
export function outlineOf(it) {
  return (geometry[it.shape] ?? geometry.rect)(it);
}

// cost: time O(c), heap O(out), stack O(1)
// vars: c = 테이블 열 수, out = 만든 SVG 글자 수
// basis: estimate
export function drawShape(it, stroke, paint) {
  const { x, y, w, h } = it;
  const cx = x + w / 2;
  const fill = `fill="${it.fill ? fillOf(it.fill) : tokens.color.node}"`;
  switch (it.shape) {
    case 'store':
      return `${geometry.store(it)[0]} ${fill} ${stroke}/><path d="M${r(x)} ${r(y)} a ${r(w / 2)} ${it.marginTop} 0 0 0 ${r(w)} 0" fill="none" ${stroke}/>`;
    case 'person':
      return geometry.person(it).map((g) => `${g} ${fill} ${stroke}/>`).join('');
    case 'decision':
      return `<polygon points="${r(cx)},${r(y)} ${r(x + w)},${r(y + h / 2)} ${r(cx)},${r(y + h)} ${r(x)},${r(y + h / 2)}" ${fill} ${stroke}/>`;
    case 'circle':
      return `${geometry.circle(it)[0]} ${fill} ${stroke}/>`;
    case 'start':
      return `<circle cx="${r(cx)}" cy="${r(y + h / 2)}" r="${r(w / 2)}" fill="${tokens.color.fg}" ${stroke}/>`;
    case 'final':
      return `<circle cx="${r(cx)}" cy="${r(y + h / 2)}" r="${r(w / 2)}" fill="none" ${stroke}/><circle cx="${r(cx)}" cy="${r(y + h / 2)}" r="${r(w / 4)}" fill="${tokens.color.fg}"/>`;
    case 'table':
      return drawTable(it, stroke, paint);
    case 'grid':
      return drawGrid(it, stroke, paint);
    default:
      return drawBox(it, stroke, fill);
  }
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 상자와 외부 도형. 복제 개수(count)가 있으면 뒤 윤곽 두 겹이 오른쪽 아래로 비쳐 보인다. 앞 상자(몸통)는 bodyOf가 정한다.
function drawBox(it, stroke, fill) {
  const dash = it.shape === 'external' ? ` stroke-dasharray="${EDGE_DASH}"` : '';
  const steps = Array.from({ length: (it.stack ?? 0) / STACK_STEP }, (_, k) => it.stack / STACK_STEP - k);
  return [...steps, 0].map((k) => `${geometry.rect({ ...it, x: it.x + k * STACK_STEP, y: it.y + k * STACK_STEP })[0]} ${fill} ${stroke}${dash}/>`).join('');
}

// cost: time O(c), heap O(out), stack O(1)
// vars: c = 열 수, out = 만든 SVG 글자 수
// basis: estimate
// 테이블: 머리 칸, 열마다 이름과 표시(PK, FK, UNQ), 타입. 열 줄은 밝히기 대상이다.
function drawTable(it, stroke, { decorate, glyphs }) {
  const rowH = it.rowH;
  const frame = `<rect x="${r(it.x)}" y="${r(it.y)}" width="${r(it.w)}" height="${r(it.h)}" rx="${RADIUS.xl}" fill="${tokens.color.node}" ${stroke}/>`;
  glyphs.add(it.label, 'medium');
  const header = `<text x="${r(it.x + it.w / 2)}" y="${r(centerBaseline(it.y + rowH / 2, STYLE.label.size))}" class="label">${renderRich(it.label)}</text>`;
  const rows = it.columns.map((c, k) => {
    const key2 = `${it.id}.${c.name}`;
    const y = it.y + rowH * (k + 1);
    const key = c.pk ? 'PK' : c.fk ? 'FK' : c.unique ? 'UNQ' : '';
    glyphs.add(c.name, 'regular');
    glyphs.add(c.type, 'mono');
    glyphs.add(key, 'semibold');
    const baseline = r(centerBaseline(y + rowH / 2, STYLE.cell.size));
    return (
      `<g class="fl-part" data-part="${escapeXml(key2)}"><rect x="${r(it.x + values.border.thin)}" y="${r(y)}" width="${r(it.w - values.border.thin * 2)}" height="${r(rowH)}" class="part-bg ${decorate('part', 0, key2)}"/>` +
      `<line x1="${r(it.x)}" x2="${r(it.x + it.w)}" y1="${r(y)}" y2="${r(y)}" class="col-line"/>` +
      `<text x="${r(it.x + SPACE['9'])}" y="${baseline}" class="cell">${escapeXml(c.name)}${key ? `<tspan class="key" dx="${SPACE['3']}">${key}</tspan>` : ''}</text>` +
      `<text x="${r(it.x + it.w - SPACE['9'])}" y="${baseline}" class="cell type">${escapeXml(c.type)}</text></g>`
    );
  });
  return frame + header + rows.join('');
}
