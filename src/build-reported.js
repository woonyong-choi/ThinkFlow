// 원본 글 하나를 만들고 진단을 알리고 결과 파일을 쓴다. cli의 파일 명령과 md 명령이 같이 쓴다. 진단 출력은 docs/design/figure-check.md 명령 절이다.
import { writeFileSync } from 'node:fs';
import { buildFigure } from './build.js';
import { toJson } from './diagnostics.js';
import { FigureError, makeDiagnostic } from './source/problems.js';

// 진단 종류마다 글 출력의 머리말. 오류는 머리말이 없다.
const SEVERITY_LABEL = { error: '', warning: 'warning: ', deprecated: 'deprecated: ' };

// cost: time O(m), heap O(m), stack O(1), io m
// vars: m = 메시지 수
// basis: estimate
/** 진단(오류, 경고, 폐기)을 알린다. 기본은 stderr에 `파일:줄: 메시지`, json이면 진단마다 `toJson`이 정한 한 줄을 stdout에 쓴다. */
export function report(file, diagnostics, json) {
  for (const d of diagnostics) {
    if (json) process.stdout.write(`${JSON.stringify(toJson(file, d))}\n`);
    // 줄 번호가 없는 문제(파일 읽기, 도구 버그)는 줄 0이고, 글로는 `파일: 메시지`로 쓴다.
    else process.stderr.write(`${file}${d.line ? `:${d.line}` : ''}: ${SEVERITY_LABEL[d.severity]}${d.message}\n`);
  }
}

// cost: time O(d), heap O(d), stack O(1)
// vars: d = 진단 수
// basis: estimate
// 글 한 조각의 진단 줄을 파일 안 줄로 옮긴다. 줄 없는 진단(0)은 조각이 시작한 줄이다.
function shifted(diagnostics, lineOffset) {
  if (!lineOffset) return diagnostics;
  return diagnostics.map((d) => ({ ...d, line: d.line + lineOffset, ...(d.fix ? { fix: { ...d.fix, line: d.fix.line + lineOffset } } : {}) }));
}

// cost: time O(build), heap O(out), stack O(1), io m
// vars: build = 원본 하나를 만드는 비용, out = 결과 글자 수, m = 진단 수
// basis: estimate
/**
 * 원본 글을 만들고 진단을 알린다. 파일은 쓰지 않는다. 오류가 있으면 undefined다.
 * @param options { flags, baseDir, lineOffset?, budget? }. budget은 올린 예산 { 이름: 값 }(src/budget.js)이고, flags는 명령 옵션 집합(`strict`, `no-deprecated`, `require-data`, `require-ci`, `json`),
 *   lineOffset은 이 글이 파일 안에서 시작하기 전 줄 수다(md 코드 블록)
 */
export async function buildReported(source, file, { flags, baseDir, lineOffset = 0, budget }) {
  const json = flags.has('json');
  try {
    const result = await buildFigure(source, { baseDir, strict: flags.has('strict'), noDeprecated: flags.has('no-deprecated'), requireData: flags.has('require-data'), requireCi: flags.has('require-ci'), budget });
    report(file, shifted([...result.warnings, ...result.deprecations].sort((a, b) => a.line - b.line), lineOffset), json);
    return result;
  } catch (error) {
    // 원본 오류가 아닌 실패는 이 도구의 버그다. 스택 대신 한 줄로 알리고 다음 파일로 넘어간다.
    const problems = error instanceof FigureError ? error.problems : [makeDiagnostic({ severity: 'error', line: 0, message: `internal error: ${error.message}. Please report this` }, { code: 'internal' })];
    report(file, shifted(problems, lineOffset), json);
    return undefined;
  }
}

// cost: time O(n), heap O(1), stack O(1), io 2
// vars: n = 쓸 글자 수
// basis: estimate
/** 파일을 쓰고 경로를 stdout에 알린다. json이면 경로를 알리지 않는다. */
export function writeOutput(path, text, json) {
  writeFileSync(path, text);
  if (!json) process.stdout.write(`${path}\n`);
}
