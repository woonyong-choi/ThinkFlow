// 원본 글 하나를 읽고 만들고 진단을 알리고, 쓸 파일의 겹침을 가리고, 결과 파일을 쓴다. cli의 파일 명령과 md 명령이 같이 쓴다. 진단 출력은 docs/design/figure-check.md 명령 절이다.
import { readFileSync } from 'node:fs';
import { buildFigure } from './build.js';
import { toJson } from './diagnostics.js';
import { commitWrites, FILE_IO, isLink, outputKey } from './md-write.js';
import { FigureError, makeDiagnostic } from './source/problems.js';
import { selectScene } from './svg.js';

// 진단 종류마다 글 출력의 머리말. 오류는 머리말이 없다.
const SEVERITY_LABEL = { error: '', warning: 'warning: ' };

// cost: time O(m), heap O(m), stack O(1), io m
// vars: m = 메시지 수
// basis: estimate
/** 진단(오류, 경고)을 알린다. 기본은 stderr에 `파일:줄: 메시지`, json이면 진단마다 `toJson`이 정한 한 줄을 stdout에 쓴다. */
export function report(file, diagnostics, json) {
  for (const d of diagnostics) {
    if (json) process.stdout.write(`${JSON.stringify(toJson(file, d))}\n`);
    // 줄 번호가 없는 문제(파일 읽기, 도구 버그)는 줄 0이고, 글로는 `파일: 메시지`로 쓴다.
    else process.stderr.write(`${file}${d.line ? `:${d.line}` : ''}: ${SEVERITY_LABEL[d.severity]}${d.message}\n`);
  }
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 줄 없는 오류 진단(파일 읽기와 쓰기 같은 도구 밖 실패). code는 알리는 쪽이 정한다. */
export const problem = (message, code) => makeDiagnostic({ severity: 'error', line: 0, message }, { code });

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 오류 글은 한 줄이어야 한다. 파일 시스템 오류는 코드(EISDIR)만 알리고, 코드가 없으면 첫 줄만 알린다.
const why = (error) => error.code ?? String(error.message).split('\n')[0];

// cost: time O(1), heap O(n), stack O(1), io 1
// vars: n = 파일 글자 수
// basis: estimate
/** 파일을 글로 읽는다. 못 읽으면 진단 code `io`로 알리고 undefined다. */
export function readReported(file, json) {
  try {
    return readFileSync(file, 'utf8');
  } catch (error) {
    report(file, [problem(`cannot read the file: ${why(error)}`, 'io')], json);
    return undefined;
  }
}

// cost: time O(s), heap O(1), stack O(1), io 1
// vars: s = 장면 수
// basis: estimate
/**
 * `--scene` 값(1부터 센 번호나 장면 이름)을 만든 그림의 장면 번호(0부터)로 바꾼다. render와 md가 같이 쓴다.
 * 값을 주지 않으면 첫 장면이고 장면이 없는 그림은 0이다(정지 그림 하나). 없는 장면이면(장면이 없는 그림에 값을 준 경우도) `파일:줄: --scene: …`을 알리고 undefined다. json이면 code `scene` 진단 한 줄이다.
 * @param options { file, json, line? }. line은 그림이 시작하는 파일 안 줄이다(md 코드 블록). 파일 하나가 그림 하나인 render는 줄이 없다
 */
export function pickScene(result, option, { file, json, line = 0 }) {
  if (option === undefined && !result.timeline.steps.length) return 0;
  try {
    return selectScene(result.timeline.steps, option);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    report(file, [makeDiagnostic({ severity: 'error', line, message: `--scene: ${error.message}` }, { code: 'scene' })], json);
    return undefined;
  }
}

// cost: time O(d), heap O(d), stack O(1)
// vars: d = 진단 수
// basis: estimate
// 글 한 조각의 진단 줄을 파일 안 줄로 옮긴다. 줄 없는 진단(0)은 조각이 시작한 줄이다.
function shifted(diagnostics, lineOffset) {
  if (!lineOffset) return diagnostics;
  return diagnostics.map((d) => ({ ...d, line: d.line + lineOffset }));
}

// cost: time O(build), heap O(out), stack O(1), io m
// vars: build = 원본 하나를 만드는 비용, out = 결과 글자 수, m = 진단 수
// basis: estimate
/**
 * 원본 글을 만들고 진단을 알린다. 파일은 쓰지 않는다. 오류가 있으면 undefined다.
 * @param options { flags, baseDir, lineOffset?, budget? }. budget은 올린 예산 { 이름: 값 }(src/budget.js)이고, flags는 명령 옵션 집합(`strict`, `json`),
 *   lineOffset은 이 글이 파일 안에서 시작하기 전 줄 수다(md 코드 블록)
 */
export async function buildReported(source, file, { flags, baseDir, lineOffset = 0, budget }) {
  const json = flags.has('json');
  try {
    const result = await buildFigure(source, { baseDir, strict: flags.has('strict'), budget });
    report(file, shifted([...result.warnings].sort((a, b) => a.line - b.line), lineOffset), json);
    return result;
  } catch (error) {
    // 원본 오류가 아닌 실패는 이 도구의 버그다. 스택 대신 한 줄로 알리고 다음 파일로 넘어간다.
    const problems = error instanceof FigureError ? error.problems : [problem(`internal error: ${error.message}. Please report this`, 'internal')];
    report(file, shifted(problems, lineOffset), json);
    return undefined;
  }
}

// cost: time O(f·d), heap O(f), stack O(1), io f·d
// vars: f = 쓸 파일 수, d = 경로 깊이
// basis: estimate
/**
 * 쓸 파일 경로가 겹치는 곳을 찾아 알리고 겹침이 있으면 false다. 아무것도 쓰기 전에 부른다.
 * 대소문자나 유니코드 정규화만 다른 이름도 같은 파일로 센다(`outputKey`). 이미 있는 심볼릭 링크는 가리키는 파일로 센다. 같은 원본을 두 번 줘도 겹친다.
 * @param entries { path, owner, shown?, hint?, site? }[]. path는 쓸 파일, shown은 알릴 이름(기본은 path), owner는 그 파일을 쓰려는 곳(원본이나 문서 줄), hint는 푸는 방법(기본은 링크 여부에 따른 안내),
 *   site는 { file, line }로 진단을 붙일 문서 줄이다(없으면 shown에 붙고 글 출력은 접두 없이 메시지만 쓴다)
 * @param options { json, claimed? }. claimed는 경로 키에서 { path, owner }로 가는 Map이고 이미 이름을 가진 파일로 채워 올 수 있으며 여러 번 불러도 이어서 쓴다
 */
export function claimOutputs(entries, { json, claimed = new Map() }) {
  let ok = true;
  for (const { path, owner, shown = path, hint, site } of entries) {
    const key = outputKey(path);
    const first = claimed.get(key);
    if (!first) {
      claimed.set(key, { path, owner });
      continue;
    }
    const advice = hint ?? (isLink(path) || isLink(first.path) ? 'Rename one of the sources, or point the symbolic link at a different file' : 'Rename one of the sources');
    const message = `${shown} would be written twice: for ${owner} and for ${first.owner}. ${advice}`;
    if (site || json) report(site?.file ?? shown, [{ ...problem(message, 'output-collision'), line: site?.line ?? 0 }], json);
    else process.stderr.write(`${message}\n`);
    ok = false;
  }
  return ok;
}

// cost: time O(f·out), heap O(f·out), stack O(1), io 4f
// vars: f = 쓸 파일 수, out = 파일 글자 수
// basis: estimate
/**
 * 파일들을 한 번에 쓰고(md-write.js의 임시 파일과 rename, 실패 때 되돌리기) 성공한 뒤에만 경로를 stdout에 알린다. json이면 경로를 알리지 않는다.
 * 쓰기가 끝난 뒤에만 removes(낡은 파일)를 지우고 `removed 경로`를 알린다. 지우기가 실패해도 새로 쓴 파일은 그대로고 실패만 알린다.
 * 쓰기가 실패하면 스택 대신 `파일: cannot write the file: 코드` 한 줄을 알리고 false다. 이미 바꾼 파일은 옛 상태로 돌아가 있다.
 * @param writes { path, text }[]
 * @param options { json, removes? }
 */
export function commitReported(writes, { json, removes = [] }) {
  const result = commitWrites(writes, FILE_IO);
  if (result.error) {
    report(result.path, [problem(`cannot write the file: ${why(result.error)}`, 'io')], json);
    for (const path of result.unrestored) report(path, [problem('could not be restored after a failed write. Restore it from version control', 'io')], json);
    return false;
  }
  if (!json) for (const { path } of writes) process.stdout.write(`${path}\n`);
  let ok = true;
  for (const path of removes) {
    try {
      FILE_IO.unlink(path);
      if (!json) process.stdout.write(`removed ${path}\n`);
    } catch (error) {
      report(path, [problem(`cannot remove the file: ${why(error)}`, 'io')], json);
      ok = false;
    }
  }
  return ok;
}
