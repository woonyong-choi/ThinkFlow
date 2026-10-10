// 카드 선언 안의 본문. 장면의 show와 같은 줄 모형이며 값은 문서의 값 선언을 쓴다.
import { readContent } from './content.js';
import { readChartCard } from './chart-card.js';
import { readValue } from './value.js';

export function readCardBody(statement, ctx) {
  const { tokens, line } = statement;
  const { card } = ctx.block;
  if (tokens[0].type === 'close') {
    if (tokens.length > 1) ctx.problems.error(line, 'put "}" on its own line');
    ctx.block = undefined;
    return;
  }
  if (statement.hasLexError || card.isRejected) return;
  const word = tokens[0].value;
  if (word === 'chart') {
    const parent = ctx.block;
    readChartCard(statement, ctx);
    if (ctx.block !== parent) {
      ctx.block.parent = parent;
      ctx.block.card.owner = card.id;
      ctx.block.card.parent = undefined;
      if (!ctx.block.card.isRejected) card.content.push({ chartId: ctx.block.card.id, line });
    }
    return;
  }
  if (word === 'value') {
    const value = readValue(statement, ctx, card.id);
    if (value) card.content.push({ valueId: value.id, line });
    return;
  }
  if (word !== 'text' && word !== 'graph') {
    ctx.problems.error(line, 'a card body takes text "...", value id "label", graph "a -> b", or chart id "title" type {', { column: tokens[0].column });
    return;
  }
  const row = readContent({ tokens: word === 'text' ? tokens.slice(1) : tokens, line }, ctx);
  if (row) card.content.push({ ...row, line });
}
