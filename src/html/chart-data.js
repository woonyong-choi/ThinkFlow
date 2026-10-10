// 차트의 전체 입력값을 재생 상태와 독립된 HTML 표로 읽는다.
import { ecdfPoints, percentRows } from '../chart/data.js';
import { COPY } from '../chart/copy.js';
import { SHARE_PLACES, valueFormat } from '../chart/scale.js';
import { histogramLabels, histogramMeasure, histogramValue } from '../histogram.js';
import { hasRowRule } from '../source/chart-rules.js';
import { VALUES } from '../source/grammar.js';
import { escapeXml, plainText } from '../text.js';

const BOX_LABELS = { min: '최솟값', q1: '제1사분위', median: '중앙값', q3: '제3사분위', max: '최댓값' };
const text = (value) => escapeXml(plainText(String(value)));
// 묶은 값(`ms=depth`)의 칸은 값 이름과 시작 값을 함께 적는다. 재생하면 값이 바뀌므로 숫자 하나만 적으면 입력값이 아닌 것이 입력값처럼 읽힌다.
const field = (key, label, source = 'values') => ({ label, read: (row) => (source === 'row' ? row[key] : row.bind?.[key] === undefined ? row.values[key] : `${row.bind[key]} (시작 ${row.values[key]})`) });

// cost: time O(r·c + s), heap O(out), stack O(1)
// vars: r = 행 수, c = 열 수, s = 계열 수, out = HTML 글자 수
// basis: estimate
/**
 * 차트 카드 하나의 입력값 표. figure는 { chart, chartType, title }(카드의 plot과 이름)이다.
 * 한 그림에 차트가 여럿이면 접힘 제목과 표 영역 이름이 같아지므로 모두 차트 제목으로 가른다.
 */
export function chartData(figure) {
  const { chart } = figure;
  const name = text(figure.title ?? '차트');
  const columns = dataColumns(figure);
  const headers = columns.map((column) => `<th scope="col">${text(column.label)}</th>`).join('');
  const rows = chart.rows.map((row, index) => {
    const cells = columns.map((column, i) => {
      const value = column.read(row, index);
      const shown = value === null ? chart.missing ?? '값 없음' : value ?? '해당 없음';
      return i === 0 ? `<th scope="row">${text(shown)}</th>` : `<td>${text(shown)}</td>`;
    });
    return `<tr>${cells.join('')}</tr>`;
  });
  const axes = [chart.x, chart.y].filter(Boolean).map(text).join(' · ');
  // 값에 묶인 칸이 있으면 이 표는 시작 값이다. 재생 중 현재 값을 보인다고 읽히지 않도록 표 이름, 계산 열 이름, 안내 글에 시작 값임을 적는다(현재 값은 차트와 값 카드가 보인다).
  const isBound = hasBoundCells(chart);
  const note = isBound ? ' 재생 중 바뀌는 값은 차트와 값 카드에 나타납니다.' : '';
  return `<details class="fl-data"><summary>${name} 입력 데이터</summary><p>재생 단계와 관계없이 모든 입력값을 표시합니다.${note}${axes ? ` ${axes}` : ''}</p><div class="fl-data-scroll" tabindex="0" role="region" aria-label="${name} 입력 데이터 표"><table><caption>${name} 입력값${isBound ? ' · 묶인 값은 시작 값' : ''}</caption><thead><tr>${headers}</tr></thead><tbody>${rows.join('')}</tbody></table></div>${histogramTable(figure, name)}${ecdfTable(figure, name)}</details>`;
}

// 값에 묶인 칸이 하나라도 있는가
const hasBoundCells = (chart) => chart.rows.some((row) => Object.keys(row.bind ?? {}).length > 0);

// cost: time O(r·s), heap O(s), stack O(1)
// vars: r = 행 수, s = 계열 수
// basis: estimate
function dataColumns({ chart, chartType }) {
  // 묶인 값이 있으면 입력값에서 계산한 열은 시작 값으로 계산한 것이다.
  const derived = hasBoundCells(chart) ? ', 시작 값' : '';
  if (chartType === 'histogram') return [{ label: '관측 순서', read: (_, index) => index + 1 }, field('value', chart.x ?? '관측값')];
  if (chartType === 'ecdf') return [{ label: '관측 순서', read: (_, index) => index + 1 }, field('value', chart.x ?? '관측값'), ...(chart.series.length ? [{ label: '계열', read: (row) => chart.series.find((s) => s.id === row.values.series)?.label }] : [])];
  if (chartType === 'heatmap') return [field('row', '행', 'row'), field('col', '열', 'row'), field('value', '값')];
  const columns = VALUES.chartType.items[chartType].numericRows ? [field('x', chart.x ?? 'x')] : [field('label', '항목', 'row')];
  // 계산한 비율은 입력 값의 자릿수가 아니라 차트 조각 글과 같은 자릿수로 읽힌다(머리 줄 decimals, 없으면 SHARE_PLACES). 입력 값 열은 적은 그대로다.
  const percent = valueFormat([], chart.decimals ?? SHARE_PLACES);
  if (['pie', 'donut'].includes(chartType)) return [...columns, field('value', '값'), { label: `비율(%${derived})`, read: (_, index) => percent(chart.parts[index].fraction * 100) }];
  if (chartType === 'waterfall') return [...columns, { label: '종류', read: (row) => row.total ? '합계' : '증감' }, { label: '입력 증감', read: (row) => row.total ? '자동 계산' : row.values.value }, { label: `누계(계산${derived})`, read: (_, index) => chart.ledger[index].to ?? '-' }];
  if (chartType === 'box') return [...columns, ...VALUES.chartType.items.box.valueKeys.map((key) => field(key, BOX_LABELS[key]))];
  if (chartType === 'scatter') {
    const series = new Map(chart.series.map((s) => [s.id, s.label]));
    return [...columns, field('x', chart.x ?? 'x'), field('y', chart.y ?? 'y'), ...(series.size ? [{ label: '계열', read: (row) => series.get(row.values.series) }] : [])];
  }
  for (const s of chart.series) {
    columns.push(field(s.id, s.label));
    for (const [part, label] of [['low', '하한'], ['high', '상한']]) {
      const key = `${s.id}.${part}`;
      if (chart.rows.some((row) => row.values[key] !== undefined)) columns.push(field(key, `${s.label} ${label}`));
    }
  }
  if (chartType === 'percent') columns.push({ label: `행 합계(계산${derived})`, read: (_, index) => percentTotal(percentRows(chart.rows, chart.series.map((s) => s.id))[index]) });
  if (hasRowRule(chart, chartType) && chart.rows.some((row) => row.values.rule !== undefined)) columns.push(field('rule', '행 기준'));
  return columns;
}

// cost: time O(b), heap O(out), stack O(1)
// vars: b = 구간 수, out = HTML 글자 수
// basis: estimate
function histogramTable({ chartType, chart }, name) {
  if (chartType !== 'histogram') return '';
  const normalized = chart.binning.measure && chart.binning.measure !== 'count';
  const labels = histogramLabels(chart);
  const explanation = chart.binning.measure === 'density' ? '높이는 건수 ÷ 전체 관측 수 ÷ 구간 폭입니다. 막대 면적의 합은 1이며 높이는 1을 넘을 수 있습니다.' : '높이는 건수 ÷ 전체 관측 수입니다. 막대 높이의 합은 1입니다.';
  const rows = chart.bins.map((bin) => `<tr><th scope="row">${text(labels.range(bin))}</th><td>${bin.count}</td>${normalized ? `<td data-value="${histogramValue(bin, chart)}">${labels.height(bin)}</td>` : ''}</tr>`).join('') || `<tr><td colspan="${normalized ? 3 : 2}">${COPY.noData}</td></tr>`;
  // 빠진 표본은 관측이 아니다. 구간별 집계와 분모에서 빠지고, 몇 개를 뺐는지 밝힌다.
  const count = chart.missingCount ? `전체 입력 ${chart.rows.length}개 가운데 ${COPY.excluded(chart.missingCount)}, 관측값 ${chart.observed}개` : `전체 관측값 ${chart.rows.length}개`;
  return `${automaticBinsNote(chart.binning)}${normalized ? `<p>${explanation} 표시값은 반올림되며 계산에는 반올림 전 값을 사용합니다.</p>` : ''}<p>구간의 왼쪽 끝은 포함하고 오른쪽 끝은 제외합니다. 마지막 구간만 오른쪽 끝도 포함합니다. ${count}.</p><div class="fl-data-scroll" tabindex="0" role="region" aria-label="${name} 구간별 집계 표"><table><caption>${name} 구간별 관측 건수</caption><thead><tr><th scope="col">구간</th><th scope="col">관측 건수</th>${normalized ? `<th scope="col">${histogramMeasure(chart)}</th>` : ''}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function automaticBinsNote(spec) {
  if (spec.method !== 'sturges') return '';
  if (spec.min === undefined) return '<p>자동 구간: Sturges 방식, 관측값이 없어 구간을 정하지 않았습니다.</p>';
  const reason = spec.constantRange ? '모든 관측값이 같아 표시 범위만 확장했습니다. 관측값이 퍼져 있다는 뜻은 아닙니다.' : spec.count < spec.requestedCount ? `숫자 정밀도 때문에 제안 ${spec.requestedCount}개에서 구간 수를 줄였습니다.` : '';
  return `<p>자동 구간: Sturges 방식, 적용 ${spec.count}개, 범위 ${text(spec.min)} ~ ${text(spec.max)}. ${reason}</p>`;
}

// 퍼센트 한 행의 합계 칸. 값이 빠졌거나 합이 0인 행은 비율이 정의되지 않아 그렇게 적는다(0%로 쓰지 않는다).
const percentTotal = ({ state, sum }) => (state === 'ok' ? sum : state === 'zero' ? '0 (비율 정의 불가)' : '값 없음 (비율 정의 불가)');

// cost: time O(n log n), heap O(n), stack O(1)
// vars: n = 표본 수
// basis: estimate
// 누적분포의 계열별 집계. 결측은 빼고 세며, 같은 값은 묶어 고유값마다 그 값 이하의 개수와 비율(개수 ÷ 쓴 표본 수)을 적는다. 그래프의 계단 꼭짓점과 같은 계산이다.
function ecdfTable({ chartType, chart }, name) {
  if (chartType !== 'ecdf') return '';
  const groups = (chart.series.length ? chart.series.map((s) => ({ label: s.label, rows: chart.rows.filter((row) => row.values.series === s.id) })) : [{ label: undefined, rows: chart.rows }]).map((group) => ({ ...group, ...ecdfPoints(group.rows.map((row) => row.values.value)) }));
  const format = (p) => `${Math.round(p * 1000) / 10}%`;
  const head = (label) => (label === undefined ? '' : `<th scope="row">${text(label)}</th>`);
  const body = groups.flatMap(({ label, points, n }) => (points.length ? points.map((p) => `<tr>${head(label)}<${label === undefined ? 'th scope="row"' : 'td'}>${text(p.value)}</${label === undefined ? 'th' : 'td'}><td>${p.count} / ${n}</td><td data-value="${p.p}">${format(p.p)}</td></tr>`) : [`<tr>${head(label)}<td colspan="3">표본 없음</td></tr>`]));
  const skipped = groups.map(({ label, missing }) => `${label === undefined ? '' : `${text(label)} `}${missing}개`).join(', ');
  return `<p>누적 비율은 값이 그 값 이하인 표본 수 ÷ 쓴 표본 수입니다. 빠진 값은 세지 않았습니다: ${skipped}.</p><div class="fl-data-scroll" tabindex="0" role="region" aria-label="${name} 누적 비율 표"><table><caption>${name} 누적 비율</caption><thead><tr>${chart.series.length ? '<th scope="col">계열</th>' : ''}<th scope="col">값</th><th scope="col">이하 표본 수</th><th scope="col">누적 비율</th></tr></thead><tbody>${body.join('')}</tbody></table></div>`;
}
