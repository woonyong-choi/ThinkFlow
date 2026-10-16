// 다른 도구(Mermaid, D2, PlantUML, CSS·Tailwind)의 습관이나 흔한 실수로 보이는 낱말을 알아보고, 같은 뜻의 Torso 꼴을 알리는 글을 만든다.
// 별칭이 아니다. 여기 적은 꼴은 어느 것도 받지 않고, 진단 글에 고칠 꼴만 더한다(docs/design/figure-syntax.md의 흔한 실수 절).
import { TONES } from '../tone.js';

// 화살표처럼 보이지만 Torso의 화살표 `->`가 아닌 낱말. 값은 고칠 꼴이다.
const ARROWS = new Map([
  ...['-->', '--->', '=>', '==>', '->>', '-->>', '-)', '--)', '-.->', '~>', '→', '⟶', '⇒', '-x', '--x', '-o', '--o'].map((arrow) => [arrow, 'write the arrow as "->": a -> b. Did you mean "->"?']),
  ['<-', 'there is no reverse arrow. Write the edge from its source: b -> a'],
  ['<--', 'there is no reverse arrow. Write the edge from its source: b -> a'],
  ['<->', 'write a two-headed edge as: a -> b head=both'],
  ['<-->', 'write a two-headed edge as: a -> b head=both'],
  ['--', 'write an edge without an arrowhead as: a -> b head=none'],
  ['---', 'write an edge without an arrowhead as: a -> b head=none'],
]);

// 다이어그램 종류를 정하는 다른 도구의 첫 줄. Torso는 카드를 선언하고 보기를 고른다.
const DIAGRAM_HEADERS = new Set(['flowchart', 'sequenceDiagram', 'stateDiagram', 'stateDiagram-v2', 'classDiagram', 'erDiagram', 'gantt', 'pie', 'journey', 'gitGraph', 'mindmap', 'timeline', 'xychart-beta', '@startuml', '@enduml', '@startmindmap', 'digraph']);
const MERMAID_DIRECTIONS = new Set(['TD', 'TB', 'LR', 'RL', 'BT']);
const NO_DIAGRAM_TYPE = 'Torso has no diagram-type line. Declare cards (box a "A"), then pick a view: view graph [right|down], view sequence { ... }, view plot { ... }, or view time { ... }';

// 다른 도구의 블록과 참여자 낱말. 값은 같은 뜻의 Torso 꼴이다.
const FOREIGN_STATEMENTS = new Map([
  ['subgraph', 'a group is: group id "name" { ... }'],
  ['end', 'close a block with "}" on its own line'],
  ['participant', 'declare a participant as a card (person a "A" or box a "A") and list it in view sequence { a b }'],
  ['actor', 'declare an actor as: person a "A", and list it in view sequence { a b }'],
  ['direction', 'set a direction on the view (view graph down) or on a group (group g "G" direction=down {)'],
  ['style', 'Torso has no style lines. Colors are tone=name and appearance=plain|filled|outline on the card line'],
  ['classDef', 'Torso has no style classes. Colors are tone=name and appearance=plain|filled|outline on the card line'],
  ['linkStyle', 'Torso has no style lines. An edge takes dashed, quiet, and head=end|both|none'],
  ['skinparam', 'Torso has no style lines. Sizes and colors come from the design tokens; pick colors with tone=name'],
]);

// 꾸밈 선택 사항 키. 색과 모양은 tone과 appearance뿐이고 크기, 글꼴, 그림자는 디자인 토큰이 정한다.
const STYLE_KEYS = new Set(['class', 'classname', 'style', 'fill', 'stroke', 'color', 'colour', 'bg', 'background', 'font', 'font-size', 'fontsize', 'size', 'shadow', 'rounded', 'radius', 'opacity', 'stroke-width', 'stroke-dash', 'theme', 'card']);
// 이름을 선택 사항으로 쓰려는 키. 이름은 id 뒤의 따옴표 글이다.
const NAME_KEYS = new Set(['label', 'name', 'text', 'title']);

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 글자 수
// basis: estimate
/** 진단 글 뒤에 고칠 꼴을 새 문장으로 붙인다(첫 글자를 대문자로). */
export function withHint(message, hint) {
  return hint ? `${message}. ${hint[0].toUpperCase()}${hint.slice(1)}` : message;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 화살표처럼 보이는 낱말을 고칠 꼴. 화살표가 아니면 undefined다. */
export function arrowMistake(word) {
  return ARROWS.get(word);
}

// cost: time O(n), heap O(1), stack O(1)
// vars: n = 낱말 글자 수
// basis: estimate
/** `a-->b`, `a-->|글|b`처럼 붙여 쓴 화살표. 고칠 꼴이고, 아니면 undefined다. */
export function gluedArrowMistake(word) {
  if (!/^[^-<=~→]+(-->|--->|==>|=>|->>|<->|<--|<-|→|->)/.test(word)) return undefined;
  const label = /\|([^|]*)\|/.exec(word)?.[1];
  return `put spaces around the arrow and write it as "->"${label ? `, with the label in quotes: a -> b "${label}"` : ': a -> b'}`;
}

// cost: time O(n), heap O(1), stack O(1)
// vars: n = 낱말 글자 수
// basis: estimate
/** Mermaid 노드 꼴(`A[글]`, `A(글)`, `A{글}`, `A((글))`, `A>글]`)인 낱말을 고칠 꼴. 아니면 undefined다. */
export function mermaidNodeMistake(word) {
  const form = /^([A-Za-z]\w*(?:-\w+)*)([[({>])([[(]?)"?([^"\])}]*)/.exec(word);
  if (!form) return undefined;
  const [, name, open, inner, written] = form;
  const id = toId(name);
  const label = written.trim() || (open === '{' ? 'question' : 'label');
  const card = open === '{' ? `decision ${id} "${label}"` : open === '[' && inner === '(' ? `store ${id} "${label}"` : open === '(' && inner === '(' ? `box ${id} "${label}" shape=circle` : `box ${id} "${label}"`;
  return `declare a card as: ${card}. Brackets around a label are Mermaid syntax`;
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 낱말 글자 수
// basis: estimate
/** 대문자, `_`, 공백 대신 쓴 글자를 고친 이름(id) 꼴. */
export function toId(word) {
  const id = String(word).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^[^a-z]+|-+$/g, '');
  return id || 'a';
}

// cost: time O(t), heap O(1), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
/**
 * 문법 표에 없는 첫 낱말로 시작한 줄이 다른 도구의 습관인지 보고, 고칠 꼴을 돌려준다. 아니면 undefined다.
 * @param tokens 그 줄의 낱말
 * @param isStatement 낱말이 문장 낱말인지 (낱말, 문장 이름) => boolean
 */
export function statementMistake(tokens, isStatement) {
  const [head, second] = tokens;
  if (head.type !== 'word') return undefined;
  const word = head.value.replace(/:$/, '');
  if (DIAGRAM_HEADERS.has(word) || (word === 'graph' && MERMAID_DIRECTIONS.has(second?.value))) return NO_DIAGRAM_TYPE;
  if (FOREIGN_STATEMENTS.has(word)) return FOREIGN_STATEMENTS.get(word);
  if (word.startsWith('//')) return 'a comment starts with "#"';
  if (word.endsWith(';') || tokens.some((t) => t.type === 'word' && /;$/.test(t.value))) return 'write one statement per line. ";" does not separate statements';
  const mermaid = mermaidNodeMistake(word);
  if (mermaid) return mermaid;
  if (head.value.endsWith(':') && word.length > 0) {
    const bare = word;
    if (isStatement(bare)) return `write ${bare} without ":": ${bare} ${second?.type === 'text' ? `"${second.value}"` : '...'}`;
    const label = second?.type === 'text' ? second.value : second?.value ?? 'label';
    return `declare a card as: box ${toId(bare)} "${label}". "id: label" is D2 syntax`;
  }
  if (word === '{') return 'put "{" at the end of the line that opens the block';
  return undefined;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/**
 * 문법 표에 없는 선택 사항 키가 꾸밈이나 이름을 옵션으로 쓰려는 습관인지 보고 고칠 꼴을 돌려준다. 아니면 undefined다.
 * @param token 선택 사항 낱말 { key, value }
 * @param keys 그 줄이 받는 키 목록
 */
export function optionMistake({ key, value }, keys) {
  const lower = key.toLowerCase();
  if (lower === 'border' && keys.includes('dashed')) return `a dashed border is the word dashed: write dashed instead of border=${value}`;
  if (STYLE_KEYS.has(lower) || lower.startsWith('text-') || lower.startsWith('bg-')) {
    const tone = TONES.find((name) => String(value).toLowerCase().includes(name));
    const colors = keys.includes('tone') ? 'Colors are tone=name and appearance=plain|filled|outline; ' : '';
    const pick = tone && keys.includes('tone') ? ` Did you mean "tone=${tone}"?` : '';
    return `there is no ${key}=. ${colors}sizes, fonts, corners, and shadows come from the design tokens.${pick}`;
  }
  if (NAME_KEYS.has(lower)) return `write the name as quoted text after the id, not as ${key}=`;
  return undefined;
}

// Mermaid의 방향 낱말 → Torso의 방향
const MERMAID_DIRECTION = { TD: 'down', TB: 'down', LR: 'right' };

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** Mermaid 방향 낱말(`TD`, `LR`)의 고칠 꼴. 거꾸로 가는 방향(`RL`, `BT`)은 없다고 알린다. 아니면 undefined다. */
export function directionMistake(word) {
  if (Object.hasOwn(MERMAID_DIRECTION, word)) return `${word} is Mermaid syntax. Did you mean "${MERMAID_DIRECTION[word]}"?`;
  if (word === 'RL' || word === 'BT') return `${word} is Mermaid syntax. A graph flows right or down`;
  return undefined;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 따옴표 밖 낱말이 작은따옴표 글(`'글'`)이면 고칠 꼴. 아니면 undefined다. */
export function quoteMistake(word) {
  return /^'.*'?$/.test(word) && word.length > 1 ? `write text in double quotes: "${word.replace(/^'|'$/g, '')}"` : undefined;
}
