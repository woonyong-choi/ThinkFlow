// 연결선(Connector)과 선 라벨(EdgeLabel)을 그린다. 구조, 순서, 상태, 데이터 관계 그림의 모든 선이 이 두 함수만 거친다.
// 선 경로의 기하는 layout과 route.js가 정하고, 화살촉은 draw/arrow.js 한 곳이 정의한다. 선 라벨 알약의 크기는 measure/sizes.js의 sizePill이 정한다.
import { BADGE_STYLE } from '../measure/decor.js';
import { hasPill, sizePill } from '../measure/sizes.js';
import { STYLE } from '../measure/texts.js';
import { routePolyline } from '../route.js';
import { centerBaseline, escapeXml, renderRich, roundCoord as r } from '../text.js';
import { values } from '../vendor/theme/tokens.js';
import { edgeMarker } from './arrow.js';
import { sceneTag } from './scene-tag.js';
import { LINE_DASH } from './surface.js';

const SPACE = values.spacing;
const RADIUS = values.radius;

// cost: time O(p), heap O(out), stack O(1)
// vars: p = 경로 점 수, out = 만든 SVG 글자 수
// basis: estimate
/** 선 하나. 선 라벨 알약은 drawEdgeLabel이 따로 그린다. */
export function drawEdge(e, j, { decorate, glyphs, scene }) {
  const tag = sceneTag(e, scene.shownSi);
  const { d } = routePolyline(e.points, RADIUS.route);
  const dash = e.dashed ? ` stroke-dasharray="${LINE_DASH}"` : '';
  const marker = edgeMarker(e, j);
  const path = `<path id="p-${j}" d="${d}" class="fl-path"${dash}${marker.attributes}/>`;
  const from = e.fromMultiplicity === undefined ? e.from : `${e.from} [${e.fromMultiplicity}]`;
  const to = e.toMultiplicity === undefined ? e.to : `${e.to} [${e.toMultiplicity}]`;
  const relation = e.relation ?? (e.isForeignKey ? 'references' : e.fromMultiplicity !== undefined || e.toMultiplicity !== undefined ? 'connects to' : undefined);
  const description = relation ? ` role="img" aria-label="${escapeXml(`${from} ${relation} ${to}${e.label ? `: ${e.label}` : ''}`)}"` : '';
  const ends = (e.endpointLabels ?? []).map((label) => {
    glyphs.add(label.text, STYLE.pill.face);
    return `<text class="edgelabel fl-multiplicity ${decorate('pilltext', j)}" data-end="${label.end}" x="${r(label.x)}" y="${r(centerBaseline(label.y, STYLE.pill.size))}">${escapeXml(label.text)}</text>`;
  });
  return `<g id="e-${j}" class="${edgeClass(e, j, decorate)} ${decorate('edge', j)}${tag.off}"${tag.attr}${description}>${marker.defs}${path}${ends.join('')}</g>`;
}

// 선과 라벨 묶음이 함께 쓰는 class. 라벨 묶음도 선과 같이 켜지고 조용해진다.
function edgeClass(e, j, decorate) {
  return `fl-edge${e.isMark ? ' mark' : ''}${e.quiet ? ` quiet ${decorate('quiet', j)}` : ''}`;
}

// cost: time O(n), heap O(out), stack O(1)
// vars: n = 라벨 글자 수, out = 만든 SVG 글자 수
// basis: estimate
/** 선의 라벨 묶음(알약, 번호 원, 글). 라벨 자리는 배치가 정했다. 라벨이 없으면 undefined다. */
export function drawEdgeLabel(e, j, { decorate, glyphs, scene }) {
  if (!hasPill(e) || !e.labelAt) return undefined;
  const tag = sceneTag(e, scene.shownSi);
  const { w, h, numW, textW } = sizePill(e.label, e.no);
  const { x, y } = e.labelAt;
  const frame = e.label === undefined ? '' : `<rect x="${r(x - w / 2)}" y="${r(y - h / 2)}" width="${r(w)}" height="${r(h)}" rx="${r(h / 2)}" class="pill ${decorate('pill', j)}"/>`;
  const number = e.no === undefined ? '' : drawNumber(e.no, { x: x - w / 2 + SPACE["0-5"], y, numW }, glyphs);
  const text = e.label === undefined ? '' : drawLabelText(e.label, { x: e.no === undefined ? x : x - w / 2 + SPACE["0-5"] + numW + SPACE["1"] + textW / 2, y, cls: decorate('pilltext', j) }, glyphs);
  return `<g id="l-${j}" class="${edgeClass(e, j, decorate)}${tag.off}"${tag.attr}><g class="fl-pill">${frame}${number}${text}</g></g>`;
}

// 선 라벨 글. 번호 원이 왼쪽에 붙으면 글 가운데가 그만큼 오른쪽이다.
function drawLabelText(label, { x, y, cls }, glyphs) {
  glyphs.add(label, STYLE.pill.face);
  return `<text x="${r(x)}" y="${r(centerBaseline(y, STYLE.pill.size))}" class="edgelabel ${cls}">${renderRich(label)}</text>`;
}

// cost: time O(1), heap O(out), stack O(1)
// vars: out = 만든 SVG 글자 수
// basis: estimate
// 선 번호 원. 정지 그림과 문서에서도 순서가 읽히도록 선언한 번호를 그대로 쓴다(재생 단계 번호와 독립이다). left는 원 왼쪽 끝, y는 세로 가운데다.
function drawNumber(no, { x: left, y, numW }, glyphs) {
  glyphs.add(String(no), BADGE_STYLE.face);
  const h = numW;
  return (
    `<rect x="${r(left)}" y="${r(y - h / 2)}" width="${r(numW)}" height="${r(h)}" rx="${r(h / 2)}" class="number-pill"/>` +
    `<text x="${r(left + numW / 2)}" y="${r(centerBaseline(y, BADGE_STYLE.size))}" class="number">${no}</text>`
  );
}
