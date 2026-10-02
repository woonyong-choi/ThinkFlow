// 문법 표(src/source/grammar.js)로 docs/design/figure-syntax.md의 "문법 표" 구간을 다시 쓴다.
// 사용: node scripts/build-grammar-doc.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { DOC_END, DOC_START, renderGrammarTables } from '../src/source/grammar-doc.js';

const DOC = new URL('../docs/design/figure-syntax.md', import.meta.url);
const text = readFileSync(DOC, 'utf8');
const start = text.indexOf(DOC_START);
const end = text.indexOf(DOC_END);
if (start < 0 || end < start) {
  process.stderr.write(`${DOC.pathname}: put ${DOC_START} and ${DOC_END} where the grammar tables go\n`);
  process.exit(1);
}
writeFileSync(DOC, `${text.slice(0, start + DOC_START.length)}\n${renderGrammarTables()}\n${text.slice(end)}`);
