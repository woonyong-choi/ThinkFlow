// 차트 카드를 파일을 다 읽은 뒤 확인한다. 값에 묶인 숫자(`ms=depth`)의 시작 값을 채우고, 이 차트에 건 reveal과 light를 모은 다음 차트 규칙을 본다.
import { checkChart } from './chart-rules.js';
import { unknownName } from './problems.js';
import { NUMBER_PATTERN } from './words.js';

// cost: time O(c·r·k + b), heap O(b), stack O(1)
// vars: c = 차트 카드 수, r = 행 수, k = 행의 값 수, b = 박자 수
// basis: estimate
/** 차트 카드마다 값 묶음과 움직임 줄(plot.motion)을 정하고 차트 규칙을 확인한다. */
export function checkChartCards(figure, names, problems) {
  const byId = new Map(figure.values.map((v) => [v.id, v]));
  const beats = figure.steps.flatMap((step, si) => step.beats.map((beat) => ({ beat, si })));
  for (const card of figure.nodes.filter((n) => n.shape === 'chart' && !n.isRejected)) {
    const { plot } = card;
    plot.cardId = card.id;
    plot.motion = {
      reveals: beats.flatMap(({ beat, si }) => beat.reveal.filter((r) => r.chart === card.id).map((r) => ({ series: r.series, line: r.line, si }))),
      lights: beats.flatMap(({ beat, si }) => beat.chartLight.filter((l) => l.chart === card.id).map((l) => ({ ...l, si }))),
    };
    resolveBindings(card, byId, problems);
    checkChart(plot, problems);
  }
}

// cost: time O(r·k·c), heap O(1), stack O(c)
// vars: r = 행 수, k = 행의 값 수, c = 참조 사슬 길이
// basis: estimate
// 값에 묶인 자리의 시작 값. 값 선언의 처음 글(참조면 가리키는 값의 처음 글)이 숫자여야 한다. 이후 값이 바뀌는 글은 시간표를 만든 뒤 chart-frames.js가 확인한다.
function resolveBindings(card, byId, problems) {
  for (const row of card.plot.chart.rows) {
    for (const [key, id] of Object.entries(row.bind ?? {})) {
      const value = byId.get(id);
      if (!value) {
        problems.error(row.line, unknownName('value', id, byId.keys()));
        continue;
      }
      const start = startText(value, byId);
      if (start === undefined || !NUMBER_PATTERN.test(start)) problems.error(row.line, `chart "${card.id}" reads "${id}", which holds "${start}" at the start. A chart value is a number`, { code: 'value-type' });
      else row.values[key] = Number(start);
    }
  }
}

// 참조를 끝까지 따라간 값의 처음 글. 순환은 값 확인이 이미 오류로 알렸으므로 사슬 길이로 끊는다.
function startText(value, byId) {
  let current = value;
  for (let i = 0; i <= byId.size && current.ref !== undefined; i++) current = byId.get(current.ref) ?? current;
  return current.from;
}
