// 무늬 층: 색 수를 넘는 계열이 막대, 누적 조각, 원 조각, 범례 칸에서 색 없이도 구분되게 면 위에 덮는 무늬.
// 무늬 정의(`<pattern>`)는 SVG마다 한 번만 있으면 된다. 정의 id는 무늬 종류, 간격, 선 색에서 만든 값이라 같은 무늬는 어느 판에서 그려도 같은 id와 같은 내용이다.
// 그래서 판마다 따로 넣어도 id가 충돌하지 않고, 그림 조립 단계가 id로 걸러 한 번만 넣을 수 있다. drawChart가 `patternKeys`와 `defs`로 돌려준다.
import { roundCoord as r } from '../text.js';
import { values } from '../vendor/theme/tokens.js';
import { SIZE } from './metrics.js';

// 이번 그리기가 쓴 무늬 정의 { id → 글 }. drawChart가 열고 닫는다. 그리기는 동기라 겹쳐 쓰이지 않는다.
let collector;

// cost: time O(n), heap O(1), stack O(1)
// vars: n = 글자 수
// basis: estimate
// 문자열의 32비트 FNV-1a 해시를 36진수로. id 글자 수를 줄이려는 용도다.
function hash(text) {
  let h = 0x811c9dc5;
  for (const ch of text) h = Math.imul(h ^ ch.codePointAt(0), 0x01000193) >>> 0;
  return h.toString(36);
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 무늬 한 칸의 내용. 칸 한 변은 기본 간격(size.chart.pattern-spacing)에 층의 간격 배율을 곱한 값이고 선 굵기는 border.tag다.
function tileBody(paint, size) {
  const stroke = `stroke="${paint.on}" stroke-width="${values["border-width"].tag}"`;
  if (paint.pattern === 'dots') return `<circle cx="${r(size / 2)}" cy="${r(size / 2)}" r="${values["border-width"].tag}" fill="${paint.on}"/>`;
  const down = `<line x1="0" y1="0" x2="0" y2="${r(size)}" ${stroke}/>`;
  return paint.pattern === 'cross' ? `${down}<line x1="0" y1="0" x2="${r(size)}" y2="0" ${stroke}/>` : down;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 무늬 정의 하나: `{ id, markup }`. 층 0(단색)은 무늬가 없어 undefined다. */
function patternDef(paint) {
  if (paint.pattern === 'solid') return undefined;
  const size = SIZE.chart['pattern-spacing'] * paint.spacing;
  const id = `dp-pat-${paint.pattern}-${hash(`${paint.pattern}|${size}|${paint.on}`)}`;
  const turn = paint.pattern === 'dots' ? '' : ' patternTransform="rotate(45)"';
  return { id, markup: `<pattern id="${id}" width="${r(size)}" height="${r(size)}" patternUnits="userSpaceOnUse"${turn}>${tileBody(paint, size)}</pattern>` };
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 면 위에 덮을 무늬 칠(`url(#id)`)을 정의와 함께 기록한다. 단색이면 undefined다. */
function patternFill(paint) {
  const def = patternDef(paint);
  if (!def) return undefined;
  collector?.set(def.id, def.markup);
  return `url(#${def.id})`;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/**
 * 사각형 면 위에 덮는 무늬 사각형. 단색이면 빈 글이다. 아래 면과 같은 자리에 겹치므로 위치 속성이 같고 pointer-events를 받지 않는다.
 * @param box { x, y, w, h, radius }
 * @param extra 요소에 더 붙일 속성 글(앞에 공백)
 * @param className 요소의 class. 아래 면이 자라는 움직임(grow)을 가지면 같은 class를 붙여 함께 자란다
 */
export function patternRect(paint, { x, y, w, h, radius = 0 }, extra = '', className = 'chart-pattern') {
  const fill = patternFill(paint);
  if (!fill) return '';
  return `<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" rx="${radius}" fill="${fill}" class="${className}" pointer-events="none"${extra}/>`;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 경로 면(원 조각) 위에 덮는 무늬 경로. 단색이면 빈 글이다. */
export function patternPath(paint, d, extra = '') {
  const fill = patternFill(paint);
  if (!fill) return '';
  return `<path d="${d}" fill="${fill}" fill-rule="evenodd" class="chart-pattern" pointer-events="none"${extra}/>`;
}

// cost: time O(draw), heap O(p), stack O(1)
// vars: draw = run이 하는 그리기, p = 쓴 무늬 수
// basis: estimate
/** run을 돌리며 쓰인 무늬 정의를 모은다. 정의는 id 순서로 정렬해 같은 그림은 같은 글이 되게 한다. */
export function collectPatterns(run) {
  const outer = collector;
  const defs = new Map();
  collector = defs;
  try {
    const result = run();
    const keys = [...defs.keys()].sort();
    return { result, patternKeys: keys, defs: keys.map((key) => defs.get(key)).join('') };
  } finally {
    collector = outer;
  }
}
