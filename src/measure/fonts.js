// 글꼴 파일로 글 폭을 재고, 그림에 쓴 글자만 잘라 SVG에 넣는다. 잰 폭과 그려진 폭을 같게 하기 위해서다(docs/design/layout.md 글 재기).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as fontkit from 'fontkit';
import subsetFont from 'subset-font';

const require = createRequire(import.meta.url);

// 글꼴 이름과 파일. weight는 CSS font-weight, family는 SVG 안 @font-face 이름이다.
const FACES = {
  regular: { family: 'FigSans', weight: 400, file: 'pretendard/dist/public/static/Pretendard-Regular.otf' },
  medium: { family: 'FigSans', weight: 500, file: 'pretendard/dist/public/static/Pretendard-Medium.otf' },
  semibold: { family: 'FigSans', weight: 600, file: 'pretendard/dist/public/static/Pretendard-SemiBold.otf' },
  mono: { family: 'FigMono', weight: 400, file: 'd2coding/fonts/d2coding-full.ttf' },
};

// 글꼴 파일은 처음 쓸 때 한 번 읽는다.
const loaded = new Map();
const widths = new Map();

// cost: time O(1) 이후, 첫 호출 O(f), heap O(f), stack O(1), io 1
// vars: f = 글꼴 파일 크기
// basis: estimate
function faceOf(name) {
  if (!loaded.has(name)) {
    const path = require.resolve(FACES[name].file);
    const buffer = readFileSync(path);
    loaded.set(name, { buffer, font: fontkit.create(buffer) });
  }
  return loaded.get(name);
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 글자 수
// basis: estimate
/**
 * 글 한 줄의 폭(px). 같은 글꼴과 글은 한 번만 잰다.
 * @param face 'regular' | 'medium' | 'semibold' | 'mono'
 * @throws Error 글꼴에 없는 글자가 있을 때. 대신 그릴 글꼴의 폭을 알 수 없기 때문이다
 */
export function measure(text, size, face = 'regular') {
  const key = `${face}\u0000${text}`;
  if (!widths.has(key)) {
    const { font } = faceOf(face);
    const missing = [...text].find((c) => c !== ' ' && !font.hasGlyphForCodePoint(c.codePointAt(0)));
    if (missing !== undefined) throw new Error(`the font has no glyph for "${missing}". Remove the character`);
    widths.set(key, font.layout(text).advanceWidth / font.unitsPerEm);
  }
  return widths.get(key) * size;
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 글자 수
// basis: estimate
/** 글꼴에 없는 글자. 원본 검사에서 줄 번호와 함께 알리려고 쓴다. 없으면 undefined. */
export function findMissingGlyph(text, face = 'regular') {
  const { font } = faceOf(face);
  return [...text].find((c) => c !== ' ' && !font.hasGlyphForCodePoint(c.codePointAt(0)));
}

// cost: time O(n²), heap O(n), stack O(1)
// vars: n = 글자 수
// basis: estimate
/** width 안에 들어가게 띄어쓰기 자리로 줄을 나눈다. 띄어쓰기 없는 긴 낱말은 글자 단위로 나눈다. */
export function wrap(text, width, size, face = 'regular') {
  const lines = [];
  let line = '';
  for (const word of String(text).split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (measure(next, size, face) <= width) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = '';
    for (const c of word) {
      if (line && measure(line + c, size, face) > width) {
        lines.push(line);
        line = '';
      }
      line += c;
    }
  }
  lines.push(line);
  return lines;
}

// cost: time O(g + f), heap O(f), stack O(1), io 1
// vars: g = 쓴 글자 수, f = 글꼴 파일 크기
// basis: estimate
/**
 * 그림에 쓴 글자만 담은 @font-face CSS. 글꼴마다 woff2로 잘라 base64로 넣는다.
 * @param used Map<face, string> 글꼴마다 쓴 글자 모음
 */
export async function embedFonts(used) {
  const rules = [];
  for (const [name, chars] of [...used.entries()].sort()) {
    if (!chars) continue;
    const { buffer } = faceOf(name);
    const subset = await subsetFont(buffer, chars, { targetFormat: 'woff2' });
    const { family, weight } = FACES[name];
    rules.push(`@font-face{font-family:${family};font-weight:${weight};src:url(data:font/woff2;base64,${subset.toString('base64')}) format("woff2")}`); // tokens-allow: 글꼴 조각을 정의하는 @font-face 이름이라 토큰이 가리키는 대상이다
  }
  return rules.join('\n');
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 글을 쓸 때 글꼴마다 쓴 글자를 모으는 그릇. add(text, face)로 모으고 used로 꺼낸다. */
export function createGlyphSet() {
  const sets = new Map();
  return {
    // cost: time O(n), heap O(n), stack O(1)
    // vars: n = 글자 수
    // basis: estimate
    add(text, face = 'regular') {
      if (!sets.has(face)) sets.set(face, new Set());
      for (const c of String(text)) sets.get(face).add(c);
    },
    // cost: time O(f·g log g), heap O(g), stack O(1)
    // vars: f = 글꼴 수, g = 글자 수
    // basis: estimate
    get used() {
      return new Map([...sets.entries()].map(([face, set]) => [face, [...set].sort().join('')]));
    },
  };
}
