// 가져오기의 공개 진입점. 다른 도구의 그림 원본(Mermaid, DBML, D2)을 Torso 원본 글로 옮긴다(docs/design/import.md).
// 파일은 다루지 않는다. 명령은 src/import-run.js다.
import { readD2 } from './d2.js';
import { readDbml } from './dbml.js';
import { emit } from './emit.js';
import { readMermaid } from './mermaid.js';
import { FAIL, createModel } from './model.js';

/** 가져오는 형식과 읽기. 형식 이름이 명령의 첫 인자다. */
const READERS = { mermaid: readMermaid, dbml: readDbml, d2: readD2 };

/** 가져올 수 있는 형식 이름 */
export const IMPORT_FORMATS = Object.keys(READERS);

// cost: time O(n + emit), heap O(n), stack O(d)
// vars: n = 원본 글자 수, emit = 모형을 쓰는 비용(emit.js), d = 원본의 중첩 깊이
// basis: estimate
/**
 * 다른 도구의 원본 글을 Torso 원본 글로 옮긴다.
 * 받지 않는 문장은 건너뛰고 줄 번호가 있는 경고로 알린다(code `import-skip`). 모양이나 글을 바꿔 옮긴 문장도 경고한다(code `import-change`).
 * 형식이나 그림 종류를 모르거나 옮길 카드가 하나도 없으면 FigureError(code `import`)다.
 * @param format 'mermaid' | 'dbml' | 'd2'
 * @param text 원본 글
 * @returns { source, warnings }. warnings는 진단 { severity, code, line, column, message }[]이고 줄은 받은 원본의 줄이다
 */
export function importDiagram(format, text) {
  if (!Object.hasOwn(READERS, format)) throw new TypeError(`unknown import format "${format}". Formats: ${IMPORT_FORMATS.join(', ')}`);
  const model = createModel(text);
  READERS[format](String(text), model);
  model.problems.throwIfAny();
  if (!model.nodes.length && !model.chart) {
    model.problems.error(0, `there is nothing to import. The ${format} source has no nodes`, { code: FAIL });
    model.problems.throwIfAny();
  }
  const source = emit(model);
  const warnings = [...model.problems.warnings].sort((a, b) => a.line - b.line || a.column - b.column);
  return { source, warnings };
}
