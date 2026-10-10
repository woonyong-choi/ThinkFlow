// 글꼴 파일로 글 폭을 재고, 그림에 쓴 글자만 잘라 SVG에 넣는다. 잰 폭과 그려진 폭을 같게 하기 위해서다(docs/design/layout.md 글 재기).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as fontkit from 'fontkit';
import subsetFont from 'subset-font';
import { codeParts } from '../text.js';
import { values } from '../vendor/theme/tokens.js';

const require = createRequire(import.meta.url);
// 글자 사이 간격(px). 글자마다 더해지므로 글 폭에 글자 수만큼 곱해 더한다. 고정폭 글은 간격을 주지 않는다.
const TRACKING = values.tracking.text;
/** 잰 글 폭의 반올림 차이를 넘기 위한 여유. 글이 칸 안에 드는지 가를 때 더한다. */
export const FIT_SLACK = 0.5;

// 글꼴 이름과 파일. weight는 CSS font-weight, family는 SVG 안 @font-face 이름이다.
// 본문은 한글, 라틴, 숫자를 Pretendard(FigSans) 하나로 그린다. 참고 문서 페이지와 같은 글꼴이다.
// 수학 기호는 Pretendard에 없는 것만 뒤 글꼴이 그린다. 위 첨자(ᵀ)는 Noto Sans(FigSansSym), 연산자와 집합 기호(∈, ∇, ⊙, ∘)는 Noto Sans Math(FigSansMath)다. 모두 SIL OFL이다.
// fallback은 이 글꼴에 없는 글자를 대신 그리는 글꼴이다. CSS font-family 사슬(FigMono, FigSans, FigSansSym, FigSansMath)과 같은 순서다.
const PRETENDARD = 'pretendard/dist/public/static';
const NOTO_LATIN = '@expo-google-fonts/noto-sans';
const NOTO_MATH = '@expo-google-fonts/noto-sans-math';
// 굵기마다 파일이 없는 수학 글꼴은 모든 굵기에 한 파일을 쓴다. 굵기를 400으로만 적으면 브라우저가 굵은 글에서 글자를 덧칠해 폭이 달라진다.
const ALL_WEIGHTS = '400 900';
const FACES = {
  regular: { family: 'FigSans', weight: 400, file: `${PRETENDARD}/Pretendard-Regular.otf`, fallback: 'symRegular' },
  semibold: { family: 'FigSans', weight: 600, file: `${PRETENDARD}/Pretendard-SemiBold.otf`, fallback: 'symSemibold' },
  symRegular: { family: 'FigSansSym', weight: 400, file: `${NOTO_LATIN}/400Regular/NotoSans_400Regular.ttf`, fallback: 'math' },
  symSemibold: { family: 'FigSansSym', weight: 600, file: `${NOTO_LATIN}/600SemiBold/NotoSans_600SemiBold.ttf`, fallback: 'math' },
  math: { family: 'FigSansMath', weight: ALL_WEIGHTS, file: `${NOTO_MATH}/400Regular/NotoSansMath_400Regular.ttf` },
  // 차트 숫자는 Pretendard의 tnum(자리 폭이 같은 숫자)으로 그린다. 파일과 @font-face는 base 글꼴의 것을 쓴다.
  num: { base: 'regular', features: ['tnum'], fallback: 'symRegular' },
  numSemibold: { base: 'semibold', features: ['tnum'], fallback: 'symSemibold' },
  // 값 글은 굵은 글꼴로 글자 그대로 읽는다(text.js isLiteralFace). 파일과 @font-face는 semibold의 것을 쓴다.
  semiboldLiteral: { base: 'semibold', fallback: 'symSemibold' },
  mono: { family: 'FigMono', weight: 400, file: 'jetbrains-mono/fonts/webfonts/JetBrainsMono-Regular.woff2', fallback: 'regular' },
};

// 글꼴 이름이 가리키는 실제 글꼴(파일, @font-face 이름). num 계열은 base를 따른다.
function baseOf(name) {
  return FACES[name].base ?? name;
}

// 글꼴 파일은 처음 쓸 때 한 번 읽는다.
const loaded = new Map();
const widths = new Map();

// cost: time O(1) 이후, 첫 호출 O(f), heap O(f), stack O(1), io 1
// vars: f = 글꼴 파일 크기
// basis: estimate
function faceOf(name) {
  if (!loaded.has(name)) {
    const path = require.resolve(FACES[baseOf(name)].file);
    const buffer = readFileSync(path);
    loaded.set(name, { buffer, font: fontkit.create(buffer) });
  }
  return loaded.get(name);
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 글자 수
// basis: estimate
/** 글자를 그릴 글꼴. 글꼴에 있으면 그 글꼴, 없으면 대체 글꼴을 따라가고 어디에도 없으면 undefined. 브라우저의 글자별 대체와 같다. */
function faceFor(char, face) {
  for (let name = face; name; name = FACES[name].fallback) {
    if (faceOf(name).font.hasGlyphForCodePoint(char.codePointAt(0))) return name;
  }
  return undefined;
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 글자 수
// basis: estimate
/** 글을 같은 글꼴로 그려지는 구간으로 나눈다. 백틱 코드 구간은 고정폭 글꼴, 나머지는 face다. 띄어쓰기는 구간 첫 글꼴의 것으로 그려진다. */
function runsOf(text, face) {
  const runs = [];
  for (const part of codeParts(text, face)) {
    for (const c of part.text) {
      const name = faceFor(c, part.code ? 'mono' : face);
      if (name === undefined) throw new Error(`the font has no glyph for "${c}". Remove the character`);
      const spaced = !part.code && face !== 'mono';
      if (runs.at(-1)?.face === name && runs.at(-1).spaced === spaced) runs[runs.length - 1].text += c;
      else runs.push({ face: name, text: c, spaced });
    }
  }
  return runs;
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 글자 수
// basis: estimate
/**
 * 글 한 줄의 폭(px). 같은 글꼴과 글은 한 번만 잰다. 글꼴에 없는 글자는 대체 글꼴 폭으로 재서 글꼴이 바뀌는 구간마다 더한다.
 * 백틱으로 감싼 구간은 face와 상관없이 고정폭으로 잰다(표시 글자인 백틱은 폭이 없다). 글 그대로 읽는 글꼴(text.js isLiteralFace)이면 글 전체가 하나의 구간이라서 백틱은 표시 글자가 아니라 글자로 잰다.
 * @param face 'regular' | 'semibold' | 'semiboldLiteral' | 'num' | 'numSemibold' | 'mono'
 * @throws Error 글꼴과 대체 글꼴 어디에도 없는 글자가 있을 때. 대신 그릴 글꼴의 폭을 알 수 없기 때문이다
 */
export function measure(text, size, face = 'regular') {
  const key = `${face}\u0000${text}`;
  if (!widths.has(key)) {
    let total = 0;
    let spacing = 0;
    for (const run of runsOf(text, face)) {
      const { font } = faceOf(run.face);
      total += font.layout(run.text, FACES[run.face].features ?? []).advanceWidth / font.unitsPerEm;
      spacing += run.spaced ? [...run.text].length * TRACKING : 0;
    }
    widths.set(key, { total, spacing });
  }
  const { total, spacing } = widths.get(key);
  return total * size + spacing;
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 글자 수
// basis: estimate
/** 글꼴과 대체 글꼴 어디에도 없는 글자. 원본 검사에서 줄 번호와 함께 알리려고 쓴다. 없으면 undefined. */
export function findMissingGlyph(text, face = 'regular') {
  for (const part of codeParts(text, face)) {
    const missing = [...part.text].find((c) => faceFor(c, part.code ? 'mono' : face) === undefined);
    if (missing !== undefined) return missing;
  }
  return undefined;
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 글자 수
// basis: estimate
// 글자 목록을 백틱 표시가 든 글로 되돌린다. 이어진 코드 글자는 백틱 한 쌍으로 묶는다.
function toMarkup(chars) {
  let out = '';
  let isCode = false;
  for (const { c, code } of chars) {
    if (code !== isCode) out += '`';
    isCode = code;
    out += c;
  }
  return isCode ? `${out}\`` : out;
}

// cost: time O(n²), heap O(n), stack O(1)
// vars: n = 글자 수
// basis: estimate
/**
 * width 안에 들어가게 띄어쓰기 자리로 줄을 나눈다. 띄어쓰기 없는 긴 낱말은 글자 단위로 나눈다.
 * 글자 모양은 { size, face }다(STYLE 항목을 그대로 넘긴다). 백틱 코드 구간이 줄 사이에 걸치면 줄마다 백틱을 닫고 다시 연다. 돌려주는 줄은 짝이 맞는 백틱 표시 글이다.
 */
export function wrap(text, width, { size, face = 'regular' }) {
  const chars = codeParts(text, face).flatMap((part) => [...part.text].map((c) => ({ c, code: part.code })));
  const words = [{ sep: undefined, chars: [] }];
  for (const ch of chars) {
    if (ch.c === ' ') words.push({ sep: ch, chars: [] });
    else words.at(-1).chars.push(ch);
  }
  const lines = [];
  let line = [];
  const fits = (candidate) => measure(toMarkup(candidate), size, face) <= width;
  words.forEach((word, i) => {
    const next = i === 0 || !line.length ? [...line, ...word.chars] : [...line, word.sep, ...word.chars];
    if (fits(next)) {
      line = next;
      return;
    }
    if (line.length) lines.push(toMarkup(line));
    line = [];
    for (const segment of segmentsOf(word.chars)) {
      if (fits([...line, ...segment])) {
        line = [...line, ...segment];
        continue;
      }
      if (line.length) lines.push(toMarkup(line));
      line = [];
      for (const ch of segment) {
        if (line.length && !fits([...line, ch])) {
          lines.push(toMarkup(line));
          line = [];
        }
        line.push(ch);
      }
    }
  });
  lines.push(toMarkup(line));
  return lines;
}

// 이 글자 뒤에서 낱말을 나눌 수 있다. 경로와 식별자(`https://pay.example.com/v1/charges`, `snake_case`)가 낱말 하나로 길 때 구분 글자 뒤에서 먼저 나눈다.
const BREAK_AFTER = new Set(['/', '-', '_', '.']);

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 낱말 글자 수
// basis: estimate
// 띄어쓰기 없는 낱말을 줄 바꿀 수 있는 조각으로 나눈다. 구분 글자가 이어지면(`//`, `...`) 한 조각이다. 조각 하나가 줄보다 길면 글자 단위로 나눈다.
function segmentsOf(chars) {
  const segments = [[]];
  chars.forEach((ch, i) => {
    segments.at(-1).push(ch);
    if (BREAK_AFTER.has(ch.c) && chars[i + 1] && !BREAK_AFTER.has(chars[i + 1].c)) segments.push([]);
  });
  return segments;
}

// cost: time O(g), heap O(g), stack O(1)
// vars: g = 쓴 글자 수
// basis: estimate
/** 글자마다 실제로 그려질 글꼴로 옮겨 담는다. 고정폭 글 안 한글은 Pretendard 몫이 된다. */
function resolveUsed(used) {
  const resolved = new Map();
  for (const [face, chars] of used) {
    for (const c of chars) {
      const name = baseOf(faceFor(c, face) ?? face);
      resolved.set(name, (resolved.get(name) ?? '') + c);
    }
  }
  return new Map([...resolved].map(([name, chars]) => [name, [...new Set(chars)].sort().join('')]));
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
  for (const [name, chars] of [...resolveUsed(used).entries()].sort()) {
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
/** 글을 쓸 때 글꼴마다 쓴 글자를 모으는 그릇. add(text, face)로 모으고 used로 꺼낸다. 백틱 코드 구간의 글자는 고정폭 글꼴 몫이다. */
export function createGlyphSet() {
  const sets = new Map();
  return {
    // cost: time O(n), heap O(n), stack O(1)
    // vars: n = 글자 수
    // basis: estimate
    add(text, face = 'regular') {
      for (const part of codeParts(text, face)) {
        const name = part.code ? 'mono' : face;
        if (!sets.has(name)) sets.set(name, new Set());
        for (const c of part.text) sets.get(name).add(c);
      }
    },
    // cost: time O(f·g log g), heap O(g), stack O(1)
    // vars: f = 글꼴 수, g = 글자 수
    // basis: estimate
    get used() {
      return new Map([...sets.entries()].map(([face, set]) => [face, [...set].sort().join('')]));
    },
  };
}
