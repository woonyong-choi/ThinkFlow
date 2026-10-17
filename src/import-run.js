// `torso import [mermaid|dbml|d2|drawio|excalidraw] <파일|-> [--out 파일.torso] [--json]` 실행. 옮기기는 import/index.js, 명령 계약은 docs/design/import.md 명령이다.
// 옮긴 원본은 표준 출력에 쓰고, --out이 있으면 그 파일에 쓴다. 형식을 적지 않으면 원본 확장자로 정한다.
import { readFileSync } from 'node:fs';
import { dirname, extname } from 'node:path';
import { buildFigure } from './build.js';
import { commitReported, problem, readReported, report } from './build-reported.js';
import { IMPORT_FORMATS, importDiagram } from './import/index.js';
import { FigureError } from './source/problems.js';

/** 표준 입력을 가리키는 파일 이름 */
const STDIN = '-';
/** 표준 출력에 쓴 원본의 진단에 붙이는 이름 */
const STDOUT = 'stdout';
/** 형식을 적지 않았을 때 원본 확장자 → 형식 */
const EXTENSIONS = { '.mmd': 'mermaid', '.mermaid': 'mermaid', '.dbml': 'dbml', '.d2': 'd2', '.drawio': 'drawio', '.excalidraw': 'excalidraw' };

// cost: time O(n + build), heap O(n), stack O(1), io 3
// vars: n = 원본 글자 수, build = 옮긴 원본을 한 번 만들어 보는 비용
// basis: estimate
/**
 * import 명령. 종료 코드를 돌려준다: 0 성공(경고 포함), 1 원본이나 쓰기 오류, 2 사용법 오류.
 * @param args cli.js의 parseArgs 결과. inputs는 [형식?, 파일]이다
 * @param usage 사용법 글
 */
export async function runImport(args, usage) {
  const json = args.flags.has('json');
  const plan = planOf(args);
  if (plan.error) {
    process.stderr.write(`${plan.error}\n${usage}\n`);
    return 2;
  }
  const { format, input } = plan;
  const text = input === STDIN ? readStdin(json) : readReported(input, json);
  if (text === undefined) return 1;
  let imported;
  try {
    imported = importDiagram(format, text);
  } catch (error) {
    if (!(error instanceof FigureError)) throw error;
    report(input, error.problems, json);
    return 1;
  }
  report(input, imported.warnings, json);
  const target = args.out ?? STDOUT;
  if (!(await tryBuild(imported.source, { file: target, baseDir: dirname(args.out ?? (input === STDIN ? '.' : input)), json }))) return 1;
  if (args.out !== undefined) return commitReported([{ path: args.out, text: imported.source }], { json }) ? 0 : 1;
  process.stdout.write(json ? `${JSON.stringify({ file: input, source: imported.source })}\n` : imported.source);
  return 0;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 인자에서 형식과 원본 하나를 고른다. 사용법이 틀리면 { error }다. 형식이 없으면 확장자로 정하고, 표준 입력은 형식이 있어야 한다.
function planOf({ inputs, out }) {
  const hasFormat = IMPORT_FORMATS.includes(inputs[0]);
  if (!hasFormat && inputs.length === 2) return { error: `unknown import format "${inputs[0]}". Formats: ${IMPORT_FORMATS.join(', ')}` };
  const files = hasFormat ? inputs.slice(1) : inputs;
  if (files.length !== 1) return { error: files.length ? `import takes one file, not ${files.length}` : 'import needs a file, or - for standard input' };
  if (out !== undefined && extname(out) !== '.torso') return { error: `--out names a .torso file, not ${out}` };
  const [input] = files;
  if (hasFormat) return { format: inputs[0], input };
  const format = EXTENSIONS[extname(input).toLowerCase()];
  if (format) return { format, input };
  const hint = input === STDIN ? 'standard input' : `"${input}"`;
  return { error: `cannot tell the format of ${hint}. Name it first: ${IMPORT_FORMATS.join(', ')}` };
}

// cost: time O(n), heap O(n), stack O(1), io 1
// vars: n = 입력 글자 수
// basis: estimate
function readStdin(json) {
  try {
    return readFileSync(0, 'utf8');
  } catch (error) {
    report(STDIN, [problem(`cannot read standard input: ${error.code ?? error.message}`, 'io')], json);
    return undefined;
  }
}

// cost: time O(build), heap O(out), stack O(1), io d
// vars: build = 원본 하나를 만드는 비용, out = 결과 크기, d = 진단 수
// basis: estimate
/**
 * 옮긴 원본을 한 번 만들어 본다. 그림 검사(`check-N`)의 오류와 경고는 원본은 맞고 그림을 손볼 곳이라 경고로 알리고 쓴다(true).
 * 그 밖의 오류(글꼴에 없는 글자 같은 원본 오류)는 그대로 알리고 쓰지 않는다(false). 줄은 옮긴 원본의 줄이다.
 */
async function tryBuild(source, { file, baseDir, json }) {
  try {
    const result = await buildFigure(source, { baseDir });
    report(file, [...result.warnings].sort((a, b) => a.line - b.line), json);
    return true;
  } catch (error) {
    const problems = error instanceof FigureError ? error.problems : [problem(`internal error: ${error.message}. Please report this`, 'internal')];
    const isFigureOnly = problems.every((p) => p.code.startsWith('check-'));
    if (isFigureOnly) report(file, problems.map((p) => ({ ...p, severity: 'warning' })), json);
    else report(file, [...problems, problem('the imported source does not build, so it is not written', 'import')], json);
    return isFigureOnly;
  }
}
