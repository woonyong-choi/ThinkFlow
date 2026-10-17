// draw.io(diagrams.net) 파일을 셀 목록으로 읽는다. 내용은 drawio.js가 모형으로 옮긴다(docs/design/import.md draw.io).
// 파일은 mxfile 안의 diagram(쪽)마다 mxGraphModel 하나다. 쪽 내용이 압축(deflate + base64 + URI 인코딩)되어 있으면 풀어서 읽는다.
// XML 전체를 해석하지 않고 셀을 이루는 태그(mxCell, UserObject, object, mxGeometry, diagram)만 읽는다. 다른 태그는 셀 구조에 영향이 없다.
import { inflateRawSync } from 'node:zlib';

const TAG = /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
const ATTRIBUTE = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 글자 수
// basis: estimate
/** XML 문자 참조와 이름 참조를 푼다. 모르는 이름 참조는 그대로 둔다. */
export function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, name) => {
    if (name[0] === '#') return String.fromCodePoint(name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : Number(name.slice(1)));
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 속성 글자 수
// basis: estimate
function attributesOf(text) {
  const attrs = {};
  for (const m of text.matchAll(ATTRIBUTE)) attrs[m[1]] = decodeEntities(m[2] ?? m[3]);
  return attrs;
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 글자 수
// basis: estimate
const lineAt = (text, offset) => text.slice(0, offset).split('\n').length;

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 쪽 내용 글자 수
// basis: estimate
// 압축된 쪽 내용을 푼다. draw.io는 URI 인코딩한 XML을 raw deflate로 줄이고 base64로 적는다. 풀 수 없으면 undefined다.
function inflatePage(body) {
  try {
    return decodeURIComponent(inflateRawSync(Buffer.from(body.trim(), 'base64')).toString('utf8'));
  } catch {
    return undefined;
  }
}

// cost: time O(n), heap O(n), stack O(d)
// vars: n = 원본 글자 수, d = 태그 깊이
// basis: estimate
/**
 * draw.io 파일의 쪽 목록. 쪽마다 { name, line, cells, isBroken }이다.
 * cells는 { id, value, style, vertex, edge, parent, source, target, geometry?, line }[]이고 UserObject·object가 감싼 셀은 감싼 쪽의 id와 label을 쓴다.
 * line은 원본 파일의 줄이다. 압축된 쪽의 셀은 그 쪽(diagram 태그)의 줄이다.
 * mxfile 없이 mxGraphModel만 있는 파일도 쪽 하나로 읽는다.
 */
export function parseDrawio(text) {
  const pages = [];
  const diagrams = [...text.matchAll(/<diagram\b([^>]*)>([\s\S]*?)<\/diagram>/g)];
  if (!diagrams.length) return [{ name: undefined, line: 1, cells: cellsOf(text, (offset) => lineAt(text, offset)), isBroken: false }];
  for (const m of diagrams) {
    const line = lineAt(text, m.index);
    const { name } = attributesOf(m[1]);
    const body = m[2];
    if (body.includes('<mxGraphModel')) {
      const start = m.index + m[0].indexOf(body);
      pages.push({ name, line, cells: cellsOf(body, (offset) => lineAt(text, start + offset)), isBroken: false });
    } else {
      const inflated = inflatePage(body);
      pages.push({ name, line, cells: inflated ? cellsOf(inflated, () => line) : [], isBroken: !inflated });
    }
  }
  return pages;
}

// cost: time O(n), heap O(c), stack O(d)
// vars: n = 글자 수, c = 셀 수, d = 태그 깊이
// basis: estimate
// 셀 태그를 차례로 읽는다. UserObject·object는 안쪽 mxCell에 id와 label을 넘기고, mxGeometry는 바로 바깥 셀의 자리다.
function cellsOf(xml, lineOf) {
  const cells = [];
  const wrappers = [];
  let open;
  for (const m of xml.matchAll(TAG)) {
    const [, closing, name, rawAttributes, selfClosing] = m;
    if (name === 'UserObject' || name === 'object') {
      if (closing) wrappers.pop();
      else if (!selfClosing) wrappers.push(attributesOf(rawAttributes));
    } else if (name === 'mxCell') {
      if (closing) open = undefined;
      else {
        const attrs = attributesOf(rawAttributes);
        const wrapper = wrappers.at(-1);
        const cell = { ...attrs, id: wrapper?.id ?? attrs.id, value: wrapper ? wrapper.label ?? '' : attrs.value ?? '', line: lineOf(m.index) };
        cells.push(cell);
        open = selfClosing ? undefined : cell;
      }
    } else if (name === 'mxGeometry' && !closing && open) {
      const { x = 0, y = 0, width = 0, height = 0 } = attributesOf(rawAttributes);
      open.geometry = { x: Number(x), y: Number(y), w: Number(width), h: Number(height) };
    }
  }
  return cells;
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 스타일 글자 수
// basis: estimate
/** 셀 스타일(`ellipse;whiteSpace=wrap;dashed=1;`)을 { 키: 값 }으로. 값 없는 낱말은 키가 그 낱말이고 값이 '1'이다. */
export function styleOf(style = '') {
  const map = {};
  for (const part of style.split(';')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    if (eq === -1) map[part] = '1';
    else map[part.slice(0, eq)] = part.slice(eq + 1);
  }
  return map;
}
