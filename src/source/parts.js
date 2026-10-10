// 원·도넛의 입력 순서를 보존하며 각 항목의 전체 대비 비율을 계산한다.
import { MAX_VALUE, RANGE_MESSAGE } from './chart-limits.js';

// cost: time O(r), heap O(r), stack O(1)
// vars: r = 항목 수
// basis: estimate
export function prepareParts({ chart, chartType, line }, problems) {
  if (chart.scaleLine !== undefined || chart.rules.length || chart.x || chart.y) problems.error(line, `a ${chartType} chart has no axes. Remove x, y, scale, and rule; put the value unit in subtitle`);
  const values = chart.rows.map((row) => row.values.value);
  if (values.some((value) => !Number.isFinite(value) || value < 0)) return problems.error(line, 'parts need finite nonnegative values');
  let total = 0;
  let correction = 0;
  for (const value of values) {
    const adjusted = value - correction;
    const next = total + adjusted;
    correction = (next - total) - adjusted;
    total = next;
  }
  if (total >= MAX_VALUE) return problems.error(line, `parts total: ${RANGE_MESSAGE}`);
  // 합이 0이면 비율이 정의되지 않는다. 오류가 아니고, 조각은 모두 길이 0이며 그림이 그 뜻을 글로 알린다(0%로 쓰지 않는다).
  if (total === 0) {
    chart.parts = values.map((value) => ({ value, fraction: 0, start: 0, end: 0 }));
    chart.total = 0;
    return undefined;
  }
  const last = values.findLastIndex((value) => value > 0);
  let at = 0;
  chart.parts = values.map((value, index) => {
    const fraction = value / total;
    const end = index === last ? 1 : at + fraction;
    if (value > 0 && end <= at) problems.error(chart.rows[index].line, 'part value is too small to represent at its cumulative position');
    const part = { value, fraction, start: at, end };
    at = end;
    return part;
  });
  chart.total = total;
}
