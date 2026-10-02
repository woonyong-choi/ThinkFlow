// 검사 항목 목록(src/check/items.js)으로 docs/design/figure-check.md의 "검사 항목" 구간을 다시 쓴다.
// 사용: node scripts/build-check-doc.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { DOC_END, DOC_START, renderCheckTable } from '../src/check/doc.js';

const DOC = new URL('../docs/design/figure-check.md', import.meta.url);
const text = readFileSync(DOC, 'utf8');
const start = text.indexOf(DOC_START);
const end = text.indexOf(DOC_END);
if (start < 0 || end < start) {
  process.stderr.write(`${DOC.pathname}: put ${DOC_START} and ${DOC_END} where the check table goes\n`);
  process.exit(1);
}
writeFileSync(DOC, `${text.slice(0, start + DOC_START.length)}\n${renderCheckTable()}\n${text.slice(end)}`);
