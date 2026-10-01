// 테스트가 같이 쓰는 도구. 문서 예시 원본 뽑기와 오류 메시지 모으기.
import { readdirSync, readFileSync } from 'node:fs';
import { parseFigure } from '../src/source/parse.js';

const DOCS = new URL('../docs/design/', import.meta.url);

// cost: time O(d), heap O(d), stack O(1), io f
// vars: d = 문서 글자 수, f = 문서 수
// basis: estimate
/** 설계 문서의 예시 원본 모두. { file, source } 목록이다. */
export function docExamples() {
  return readdirSync(DOCS)
    .filter((f) => f.endsWith('.md'))
    .flatMap((file) => [...readFileSync(new URL(file, DOCS), 'utf8').matchAll(/```text\n([\s\S]*?)```/g)].map((m) => ({ file, source: m[1] })))
    .filter(({ source }) => /^(flow|sequence|state|data|chart)\b/.test(source));
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 원본 글자 수
// basis: estimate
/** 원본을 읽고 오류 메시지 목록을 돌려준다. 오류가 없으면 빈 목록이다. */
export function errorsOf(source) {
  try {
    parseFigure(source);
    return [];
  } catch (error) {
    if (!error.problems) throw error;
    return error.problems.map((p) => `${p.line}: ${p.message}`);
  }
}
