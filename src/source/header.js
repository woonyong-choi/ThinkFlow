// 머리 줄(title, subtitle, pace, aspect, width) 하나를 읽는다. 값은 글, 시간, 숫자, 낱말 중 하나다.
import { valueNames } from './grammar.js';
import { isOverTimeLimit, overLimitMessage, parseTime } from './values.js';
import { NUMBER_PATTERN } from './words.js';

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 머리 줄 하나를 문서 모형에 적는다. */
export function readHeader({ tokens, line }, { figure, problems }) {
  const [head, value, extra] = tokens;
  if (extra) problems.error(line, `"${head.value}" takes one value`);
  const key = head.value;
  if (key === 'title' || key === 'subtitle') {
    if (value?.type !== 'text') problems.error(line, `write ${key} as quoted text: ${key} "..."`);
    else figure[key] = value.value;
  } else if (key === 'pace') {
    const ms = parseTime(value?.value);
    if (value?.type === 'word' && ms === undefined && isOverTimeLimit(value.value)) problems.error(line, overLimitMessage('pace', value.value), { code: 'time-limit' });
    else if (value?.type !== 'word' || ms === undefined) problems.error(line, 'write pace as a time such as 900ms or 2s');
    else figure.paceMs = ms;
  } else if (key === 'aspect') {
    const ratio = Number(value?.value);
    if (value?.type !== 'word' || !NUMBER_PATTERN.test(value.value) || !Number.isFinite(ratio) || !(ratio > 0)) problems.error(line, 'write aspect as a positive number such as 1.6');
    else figure.aspect = ratio;
  } else if (key === 'width') {
    if (!valueNames('width').includes(value?.value)) problems.error(line, `width is ${valueNames('width').map((v) => `"${v}"`).join(' or ')}`);
    else figure.width = value.value;
  }
}
