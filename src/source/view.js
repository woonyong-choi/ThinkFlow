// 보기(`view graph|sequence|plot|time ...`)를 읽는다. 보기는 같은 문서의 카드를 다른 방식으로 보이는 판이다. 카드는 여러 보기에 함께 놓일 수 있다.
// 보기는 이름이 없다. 어떤 문장도 보기를 가리키지 않아서, 보기 번호(v1, v2, ...)는 보기가 정해진 순서대로 내부에서 붙인다(views-check.js).
import { VALUES, valueNames } from './grammar.js';

// 블록이 꼭 있어야 하는 보기 방식. 그래프는 블록을 생략하면 남은 카드를 모두 담는다.
const NEEDS_BLOCK = new Set(['sequence', 'plot', 'time', 'timing']);

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
/** 보기 하나를 연다. `view graph [right|down] ["이름"] [{]`, `view sequence|plot|time ["이름"] {`. */
export function readView({ tokens, line }, ctx) {
  const [, strategy, ...rest] = tokens;
  const { problems, figure } = ctx;
  const isOpen = rest.at(-1)?.type === 'open';
  const body = isOpen ? rest.slice(0, -1) : rest;
  const reject = () => {
    if (isOpen) ctx.block = { kind: 'view', card: { members: [], isRejected: true, line }, line };
  };
  const strategies = valueNames('viewStrategy');
  if (strategy?.type !== 'word' || !strategies.includes(strategy.value)) {
    const hasId = strategy?.type === 'word' && rest[0]?.type === 'word' && strategies.includes(rest[0].value);
    problems.error(line, `a view is one of ${strategies.join(', ')}. Found "${strategy?.value ?? ''}"${hasId ? `. A view has no name: write view ${rest[0].value} ...` : ''}`);
    return reject();
  }
  const direction = body.find((t) => t.type === 'word');
  const label = body.find((t) => t.type === 'text');
  const extra = body.filter((t) => t !== direction && t !== label);
  if (extra.length || (direction && (strategy.value !== 'graph' || !valueNames('direction').includes(direction.value)))) {
    problems.error(line, direction && strategy.value !== 'graph' ? `${strategy.value} takes no direction` : `write view as: view ${strategy.value} ${strategy.value === 'graph' ? '[right|down] ' : ''}["label"]${NEEDS_BLOCK.has(strategy.value) ? ' {' : ''}`);
    return reject();
  }
  if (NEEDS_BLOCK.has(strategy.value) && !isOpen) problems.error(line, `a ${strategy.value} view lists its ${strategy.value === 'timing' ? 'rows' : 'cards'} in a block: view ${strategy.value} {`);
  const view = { strategy: strategy.value, direction: direction?.value ?? VALUES.direction.default, label: label?.value, members: isOpen ? [] : undefined, ...(strategy.value === 'timing' ? { notes: [] } : {}), line };
  figure.views.push(view);
  if (isOpen) ctx.block = { kind: 'view', card: view, line };
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
/** 보기 블록 안 줄. `}`면 닫고, 아니면 카드 이름을 한 줄에 여럿 적는다. */
export function readViewLine({ tokens, line, hasLexError }, ctx) {
  const { card } = ctx.block;
  if (tokens[0].type === 'close') {
    if (tokens.length > 1) ctx.problems.error(line, 'put "}" on its own line');
    ctx.block = undefined;
    return;
  }
  if (hasLexError || card.isRejected) return;
  if (card.notes && tokens[0].type === 'word' && tokens[0].value === 'note' && tokens.length > 1) {
    readTimingNote(tokens, { line, ctx, view: card });
    return;
  }
  for (const t of tokens) {
    if (t.type !== 'word') {
      ctx.problems.error(line, `a view block lists card names. Found "${t.value}"`, { column: t.column });
      continue;
    }
    if (card.members.some((m) => m.id === t.value)) ctx.problems.error(line, `"${t.value}" is already listed in this view`, { column: t.column });
    else card.members.push({ id: t.value, line, column: t.column });
  }
}

// cost: time O(t), heap O(1), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
/**
 * 타이밍 보기 블록의 구간 표시 한 줄. `note 값=상태 "글"`은 그 값이 상태를 가진 구간마다 양쪽 화살표와 글을 값 줄 아래에 놓는다.
 * 구간은 시간표의 값 변화에서 정해지므로 다른 보기의 점과 같은 시각에 시작하고 끝난다. 이름 확인은 보기를 정할 때 한다(views-check.js).
 */
function readTimingNote(tokens, { line, ctx, view }) {
  const [, state, text, ...rest] = tokens;
  if (state?.type !== 'option' || text?.type !== 'text' || rest.length) {
    ctx.problems.error(line, 'write a timing note as: note value=state "text"', { column: tokens[0].column });
    return;
  }
  view.notes.push({ value: state.key, state: state.value, label: text.value, line, column: state.column });
}
