// 옛 형식을 지금 형식으로 고쳐 쓴다. 고칠 범위와 새 글은 진단의 fix가 정하고, 이 파일은 그 fix를 적용할 뿐이다.
// 새 폐기 항목은 grammar.js 표에 deprecated.replace만 적으면 여기서 따로 할 일이 없다.
import { FigureError, createProblems } from './source/problems.js';
import { readFigure } from './source/parse.js';

// cost: time O(n + s), heap O(n), stack O(1)
// vars: n = 원본 글자 수, s = 문장 수
// basis: estimate
// 원본의 오류와 폐기 진단을 모두 모은다. 읽다 멈춘 오류(FigureError)도 모아 둔 진단에 이미 들어 있다.
function diagnose(source) {
  const problems = createProblems(source);
  try {
    readFigure(source, problems);
  } catch (error) {
    if (!(error instanceof FigureError)) throw error;
  }
  return { errors: problems.errors, deprecations: problems.deprecations };
}

// cost: time O(f log f + n), heap O(n), stack O(1)
// vars: f = fix 수, n = 원본 글자 수
// basis: estimate
/** 줄마다 fix를 뒤쪽 자리부터 적용해 앞 자리가 밀리지 않게 한다. 같은 자리의 같은 fix는 한 번만 쓴다. */
export function applyFixes(source, fixes) {
  const lines = source.split('\n');
  const unique = new Map(fixes.map((fix) => [`${fix.line}:${fix.column}`, fix]));
  for (const fix of [...unique.values()].sort((a, b) => b.line - a.line || b.column - a.column)) {
    const text = lines[fix.line - 1];
    lines[fix.line - 1] = text.slice(0, fix.column - 1) + fix.text + text.slice(fix.column - 1 + fix.length);
  }
  return lines.join('\n');
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 줄 수
// basis: estimate
/** 줄 수가 같은 두 원본의 바뀐 줄을 미리보기 글로 쓴다. 바뀐 것이 없으면 빈 글이다. */
export function previewDiff(before, after, name) {
  const [old, next] = [before.split('\n'), after.split('\n')];
  const hunks = old.flatMap((text, i) => (text === next[i] ? [] : [`@@ line ${i + 1} @@`, `-${text}`, `+${next[i]}`]));
  return hunks.length ? [`--- ${name}`, `+++ ${name} (migrated)`, ...hunks].join('\n') : '';
}

// cost: time O(n + s), heap O(n), stack O(1)
// vars: n = 원본 글자 수, s = 문장 수
// basis: estimate
/**
 * 원본의 폐기 진단을 fix로 고친 글을 만든다.
 * @returns { text, count } 고친 글과 고친 곳 수. 원본에 오류가 있거나 고친 글에 오류나 폐기가 남으면 { errors }다
 */
export function migrateSource(source) {
  const before = diagnose(source);
  if (before.errors.length) return { errors: before.errors };
  const fixes = before.deprecations.map((d) => d.fix).filter(Boolean);
  const text = applyFixes(source, fixes);
  const after = diagnose(text);
  const left = [...after.errors, ...after.deprecations];
  if (left.length) return { errors: left };
  return { text, count: fixes.length };
}
