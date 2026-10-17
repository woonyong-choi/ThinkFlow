// Mermaid 원본 읽기. 머리말(frontmatter), 주석, 첫 줄의 그림 종류를 읽고 종류별 읽기에 넘긴다(docs/design/import.md Mermaid).
import { FAIL, skip, textOf } from './model.js';
import { readClass } from './mermaid-class.js';
import { readFlowchart } from './mermaid-flow.js';
import { readEr } from './mermaid-er.js';
import { readSequence } from './mermaid-sequence.js';
import { readState } from './mermaid-state.js';
import { decimal } from './names.js';

// 그림 종류 낱말 → 읽기. flowchart와 graph는 같은 순서도다.
const READERS = {
  flowchart: readFlowchart,
  graph: readFlowchart,
  sequenceDiagram: readSequence,
  stateDiagram: readState,
  'stateDiagram-v2': readState,
  erDiagram: readEr,
  classDiagram: readClass,
  pie: readPie,
};

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 원본 글자 수
// basis: estimate
/** Mermaid 원본 하나를 모형에 읽는다. 그림 종류를 모르면 그 줄의 오류다. */
export function readMermaid(text, model) {
  const lines = statements(text, model);
  const head = lines.shift();
  if (!head) {
    model.problems.error(1, 'there is no Mermaid diagram here. The first line names the diagram, such as flowchart TD', { code: FAIL });
    return;
  }
  const word = head.text.split(/\s+/)[0];
  const reader = Object.hasOwn(READERS, word) ? READERS[word] : undefined;
  if (!reader) {
    model.problems.error(head.line, `the Mermaid diagram "${word}" is not imported. Supported: flowchart, graph, sequenceDiagram, stateDiagram-v2, erDiagram, classDiagram, pie`, { code: FAIL });
    return;
  }
  reader({ head, lines }, model);
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 원본 글자 수
// basis: estimate
// 의미 있는 줄 { text, line }. `%%` 주석 줄은 버리고, `%%{...}%%` 설정과 머리말의 title 밖 설정은 경고한다.
function statements(text, model) {
  const raw = text.replace(/^﻿/, '').split(/\r?\n/);
  let start = 0;
  if (raw[0]?.trim() === '---') {
    const end = raw.findIndex((line, i) => i > 0 && line.trim() === '---');
    if (end > 0) {
      readFrontmatter(raw.slice(1, end), model);
      start = end + 1;
    }
  }
  const out = [];
  for (let i = start; i < raw.length; i++) {
    const line = raw[i].trim();
    if (!line) continue;
    if (line.startsWith('%%{')) skip(model, i + 1, 'the Mermaid directive is not imported. Sizes and colors come from the design tokens');
    else if (!line.startsWith('%%')) out.push({ text: line, line: i + 1 });
  }
  return out;
}

// cost: time O(m), heap O(1), stack O(1)
// vars: m = 머리말 줄 수
// basis: estimate
// 머리말에서 title만 읽는다. 들여쓴 줄은 바로 위 키의 값이라 그 키와 함께 알린다.
function readFrontmatter(lines, model) {
  for (const [i, line] of lines.entries()) {
    if (!line.trim() || /^\s/.test(line)) continue;
    const pair = /^([\w-]+)\s*:\s*(.*)$/.exec(line.trim());
    if (pair?.[1] === 'title' && pair[2]) model.title = textOf(model, unquote(pair[2]), i + 2);
    else skip(model, i + 2, `the front matter "${pair?.[1] ?? line.trim()}" is not imported. Torso reads only title`);
  }
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 글자 수
// basis: estimate
/** 따옴표를 벗기고 Mermaid 글자 표기(`#quot;`, `#35;`)와 마크다운 글(`` "`글`" ``)의 백틱을 푼다. */
export function unquote(raw) {
  let text = String(raw).trim();
  if (/^".*"$/s.test(text) || /^'.*'$/s.test(text)) text = text.slice(1, -1);
  if (/^`.*`$/s.test(text)) text = text.slice(1, -1);
  return text.replace(/#quot;/g, '"').replace(/#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

// cost: time O(r), heap O(r), stack O(1)
// vars: r = 조각 수
// basis: estimate
// 원 차트: `pie [showData] [title 글]`, `title 글`, `"이름" : 값`. 값 표시(showData)는 Torso 원 차트가 늘 하므로 그대로다.
function readPie({ head, lines }, model) {
  const titled = /^pie\b(?:\s+showData)?(?:\s+title\s+(.+))?$/.exec(head.text);
  const chart = { kind: 'pie', title: titled?.[1] ? textOf(model, titled[1], head.line) : undefined, rows: [], line: head.line };
  for (const { text, line } of lines) {
    const title = /^title\s+(.+)$/.exec(text);
    const row = /^("(?:[^"]*)"|'(?:[^']*)')\s*:\s*(\S+)$/.exec(text);
    if (title) chart.title = textOf(model, title[1], line);
    else if (text === 'showData') continue;
    else if (row && decimal(row[2]) !== undefined && Number(row[2]) > 0) chart.rows.push({ label: textOf(model, unquote(row[1]), line) || `row ${chart.rows.length + 1}`, value: decimal(row[2]), line });
    else if (row) skip(model, line, `the slice value "${row[2]}" is not imported. A pie slice is a number above 0`);
    else if (/^acc(Title|Descr)\b/.test(text)) skip(model, line, 'the accessibility title or description is not imported');
    else skip(model, line, `"${text}" is not imported. A pie line is "name" : value`);
  }
  if (!chart.rows.length) {
    model.problems.error(head.line, 'the pie has no slices to import', { code: FAIL });
    return;
  }
  chart.title ??= model.title ?? 'pie';
  model.chart = chart;
}
