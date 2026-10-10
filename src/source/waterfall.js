// 워터폴의 증감·합계 행을 읽고 입력 순서대로 누계를 확정한다.
import { MAX_VALUE, RANGE_MESSAGE, isTiny, TINY_MESSAGE } from './chart-limits.js';

export function readTotal({ tokens, line }, { figure, problems }) {
  if (figure.chartType !== 'waterfall') return problems.error(line, 'total is only for waterfall charts');
  const [, label, extra] = tokens;
  if (label?.type !== 'text' || extra) return problems.error(line, 'write a total as: total "label"');
  figure.chart.rows.push({ label: label.value, total: true, values: {}, line });
}

// cost: time O(k), heap O(k), stack O(1)
// vars: k = JSON 원소의 키 수
// basis: estimate
export function waterfallDataRow(record, { line, index }, problems) {
  if (typeof record.label !== 'string') return problems.error(line, `data element ${index} needs a text "label"`);
  if (Object.hasOwn(record, 'total') && typeof record.total !== 'boolean') return problems.error(line, `data element ${index} total must be a boolean`);
  for (const key of Object.keys(record)) if (!['label', 'value', 'total'].includes(key)) problems.warn(line, `data key "${key}" is not used by a waterfall chart`);
  const values = Object.hasOwn(record, 'value') ? { value: record.value } : {};
  return { label: record.label, total: record.total === true, values, line };
}

// cost: time O(d), heap O(d), stack O(1)
// vars: d = 숫자의 십진 자릿수
// basis: estimate
// Number가 보존한 십진 표현을 정수와 소수 위치로 나눠 0.1 + 0.2 같은 누계 오차를 피한다.
function decimal(value) {
  const [mantissa, exponent = '0'] = String(value).split('e');
  const [integer, fraction = ''] = mantissa.split('.');
  return { digits: BigInt(integer + fraction), scale: fraction.length - Number(exponent) };
}

// cost: time O(d), heap O(d), stack O(1)
// vars: d = 정렬한 십진 자릿수
// basis: estimate
function addDecimal(current, value) {
  const next = decimal(value);
  const scale = Math.max(current.scale, next.scale);
  const digits = current.digits * 10n ** BigInt(scale - current.scale) + next.digits * 10n ** BigInt(scale - next.scale);
  return { digits, scale };
}

// cost: time O(r·d), heap O(r + d), stack O(1)
// vars: r = 행 수, d = 누계의 십진 자릿수
// basis: estimate
/**
 * 입력 순서대로 누계 장부를 만든다. 합계 행은 값을 받지 않고 그때까지의 누계를 가져오는 자동 계산뿐이다.
 * 빠진 증감(`-`)은 0이 아니고 건너뛰는 것도 아니다. 그 행부터 누계를 알 수 없고, 뒤 증감과 합계도 알 수 없는 채로 끝까지 이어진다(되돌릴 알려진 기준이 없다).
 * 장부의 알 수 없는 끝점은 null이다: 빠진 증감은 { from: 직전 누계, to: null, change: null }, 그 뒤 증감은 { from: null, to: null, change }, 알 수 없는 합계는 { from: 0, to: null, total: true }.
 */
export function prepareWaterfall(figure, problems) {
  const { chart } = figure;
  const ledger = [];
  let exact = { digits: 0n, scale: 0 };
  let running = 0;
  for (const row of chart.rows) {
    if (row.total) { ledger.push({ from: 0, to: running, total: true }); continue; }
    const change = row.values.value;
    if (change === null) {
      ledger.push({ from: running, to: null, change: null, total: false });
      running = null;
      continue;
    }
    if (!Number.isFinite(change)) return problems.error(row.line, 'a waterfall change must be a finite number');
    if (running === null) {
      ledger.push({ from: null, to: null, change, total: false });
      continue;
    }
    const next = addDecimal(exact, change);
    const end = Number(`${next.digits}e${-next.scale}`);
    if (!Number.isFinite(end) || Math.abs(end) >= MAX_VALUE) return problems.error(row.line, `waterfall cumulative: ${RANGE_MESSAGE}`);
    if (isTiny(end) || (end === 0 && next.digits !== 0n)) return problems.error(row.line, `waterfall cumulative: ${TINY_MESSAGE}`);
    if (change !== 0 && end === running) return problems.error(row.line, 'waterfall change is too small to represent at the cumulative value');
    ledger.push({ from: running, to: end, change, total: false });
    exact = next;
    running = end;
  }
  chart.ledger = ledger;
}
