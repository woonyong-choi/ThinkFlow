// 시간표에 재생기와 움직이는 SVG가 읽기만 하면 되는 표시 정보를 더한다: 장면 정보 steps는 timeline.js가 정하고, 여기서는 marks, pulses, presentation을 정한다.
// 모두 시간표가 이미 정한 논리 시각에서 나온 파생 값이다. 어느 것도 t0, t1, at, ms, 값 구간, 프레임 구간을 바꾸지 않는다.
import { hopLegs } from './animate/legs.js';
import { roundToScale } from './format.js';
import { PULSE_MS } from './pulse.js';

// 표시 길이를 줄이는 자릿수 배율(소수 셋째 자리)
const PRESENTATION_PRECISION = 1000;

// cost: time O(r log r), heap O(r), stack O(1)
// vars: r = 구간 수
// basis: estimate
// 같은 장면(si)에서 겹치거나 맞닿은 구간을 하나로 합친다. 구간은 출처 장면의 것이라 다른 장면의 구간과는 합치지 않고, 길이 0인 구간도 버리지 않는다.
function merge(ranges) {
  const sorted = [...ranges].sort((a, b) => a[2] - b[2] || a[0] - b[0] || a[1] - b[1]);
  return sorted.reduce((out, [from, to, si]) => {
    if (out.length && out.at(-1)[2] === si && from <= out.at(-1)[1]) out.at(-1)[1] = Math.max(out.at(-1)[1], to);
    else out.push([from, to, si]);
    return out;
  }, []);
}

// cost: time O(b·(e + n + p + c)), heap O(m), stack O(1)
// vars: b = 구간 수, e = 켜진 선 수, n = 켜진 도형 수, p = 밝은 부분 수, c = 밝힌 차트 행 수, m = 구간 수의 합
// basis: estimate
/**
 * 시간표가 정한 켜진 구간(논리 ms). 지금은 조용한 선이 보이는 구간뿐이다: 키 `quiet:번호`.
 * 켜 둔 도형, 부분, 차트 행은 구간 자신이 가진다(seg.nodesOn, seg.partsOn, seg.charts[id].lights는 그 장면에서 지금까지 `light`가 명시한 대상이다). 길이 0인 구간(`light`만 있는 장면의 박자)도 같은 규칙으로 읽히도록 시각 구간으로 옮기지 않는다.
 * 점이 지나간 선은 켜 두지 않는다: 선이 활성인 구간은 이동의 길 계획(hop.legEdges, hop.gaps, hop.cut)이 정하고 재생기와 움직이는 SVG가 같은 규칙(hopLegs)으로 읽는다.
 * 조용한 선(`quiet`)은 활성과 별개로 그 선을 처음 지나는 때(점이 선에 들어서는 시각)부터 그 장면 끝까지 보인다. 보임일 뿐 활성이 아니라 알약의 활성 색은 붙들지 않는다.
 * @param quiet 조용한 선의 선 번호 집합
 * 구간은 출처 장면에 속한다(`si`): 장면 끝 시각에 닿은 구간도 그 장면의 것이고, 다음 장면이 같은 시각에 시작해도 이어 붙지 않는다.
 * @returns { [키]: [시작, 끝, 출처 장면][] }
 */
export function marksOf(timeline, { quiet = new Set() } = {}) {
  const byKey = new Map();
  const add = (key, from, to, si) => byKey.set(key, [...(byKey.get(key) ?? []), [from, to, si]]);
  for (const [edge, first] of firstPasses(timeline, quiet)) for (const [si, at] of first) add(`quiet:${edge}`, at, sceneEnd(timeline, si), si);
  return Object.fromEntries([...byKey].map(([key, ranges]) => [key, merge(ranges)]));
}

// 장면 si의 끝 논리 시각
const sceneEnd = (timeline, si) => timeline.segs.findLast((seg) => seg.si === si).t1;

// 조용한 선마다 장면별로 점이 처음 그 선에 들어서는 논리 시각: Map<선 번호, Map<장면, 시각>>.
function firstPasses(timeline, quiet) {
  const out = new Map();
  if (!quiet.size) return out;
  for (const seg of timeline.segs) {
    for (const hop of seg.hops) {
      for (const leg of hopLegs(hop)) {
        if (!quiet.has(leg.edge)) continue;
        const scenes = out.get(leg.edge) ?? new Map();
        const at = seg.t0 + (hop.at ?? 0) + leg.from;
        scenes.set(seg.si, Math.min(scenes.get(seg.si) ?? Infinity, at));
        out.set(leg.edge, scenes);
      }
    }
  }
  return out;
}

// cost: time O(v·c + f), heap O(p), stack O(1)
// vars: v = 값 줄 수, c = 값이 바뀌는 횟수, f = 차트 프레임 구간 수, p = 펄스 수
// basis: estimate
/**
 * 갱신 펄스 시각. 값이 바뀐 시각마다 하나(키 `value:값 줄 번호`)이고, 차트 프레임이 바뀐 표식마다 하나(키 `차트:차트 id:표식 id`)다.
 * 같은 시각에 이어 쓴 값이 한 시각을 지나고 처음 글로 돌아오면 바뀐 것이 아니라 펄스가 없다. 프레임도 그 시각의 마지막 프레임이 앞 구간과 같으면 바뀐 표식이 없어 펄스가 없다.
 * 키는 `value:값 줄 번호`, `chart:차트 id:표식 id`, `row:도형 id:카드 줄 번호`(보이는 글이 바뀐 카드 글 줄, timeline-rows.js)다.
 * 펄스는 시각이 아니라 출처 장면(`si`)에 속한다: 장면 끝 시각에 일어난 변화도 그 장면의 펄스다.
 * @param charts 차트 카드 id → { rows }(chart-frames.js)
 * @returns { key, at, si }[] 시각 순
 */
export function pulsesOf(timeline, charts) {
  const pulses = [];
  (timeline.values ?? []).forEach((row, vi) => {
    let before = row.initial;
    for (let i = 0; i < row.changes.length; ) {
      const t = row.changes[i][0];
      let last = row.changes[i][1];
      while (i < row.changes.length && row.changes[i][0] === t) last = row.changes[i++][1];
      if (last !== before) pulses.push({ key: `value:${vi}`, at: t, si: row.si });
      before = last;
    }
  });
  for (const [id, chart] of Object.entries(charts)) {
    for (const row of chart.rows) for (const [from, , , changed] of row.periods) for (const mark of changed) pulses.push({ key: `chart:${id}:${mark}`, at: from, si: row.si });
  }
  // 카드 글 줄: 실제로 보이는 글이 바뀐 줄(timeline-rows.js)
  pulses.push(...(timeline.rowPulses ?? []));
  return pulses.sort((a, b) => a.at - b.at || (a.key < b.key ? -1 : Number(a.key > b.key)));
}

// cost: time O(s·(b·h·l + p)), heap O(s), stack O(1)
// vars: s = 장면 수, b = 박자 수, h = 박자의 이동 수, l = 이동이 지나는 선 수, p = 펄스 수
// basis: estimate
/**
 * 장면마다 표시 길이(화면 ms). 논리 시각과 표시 시각은 따로다. 논리 시각(ms, 재생 속도 1)에는 효과 시간이 없고, 표시 시각은 논리 시각을 장면 재생 속도 `s`로 나눈 값에 효과 꼬리를 더한다:
 * `D = max((T - t0) / s, (마지막 펄스 - t0) / s + PULSE_MS, (마지막 선 이탈 - t0) / s + PULSE_MS)`
 * PULSE_MS(400)는 표시 ms라 `s`로 나누지 않는다. 마지막 선 이탈은 점이 그 선을 떠나는 시각이고 장면 끝 `T`를 넘지 않는다(끝에 선에 있던 점은 `T`에 떠난다).
 * 펄스는 값이나 차트 표식이 실제로 바뀐 것, 점이 도형에 닿은 것, 선에서 점이 떠난 것뿐이다. 켜기(`light`), 보이기(`show`), 지우기(`clear`), 드러내기(`reveal`)는 상태라 꼬리를 더하지 않는다.
 * 사건 없는 장면(길이 0, 펄스 없음)은 0이다.
 * @returns number[] 장면 번호 순서
 */
export function presentationOf(timeline) {
  return timeline.steps.map((step, si) => {
    const segs = timeline.segs.filter((seg) => seg.si === si);
    if (!segs.length) return 0;
    const [t0, t1] = [segs[0].t0, segs.at(-1).t1];
    const arrivals = segs.flatMap((seg) => (seg.pulses ?? []).map(({ at }) => seg.t0 + at));
    const onsets = [...arrivals, ...(timeline.pulses ?? []).filter((p) => p.si === si).map((p) => p.at)];
    const exits = segs.flatMap((seg) => seg.hops.flatMap((hop) => hopLegs(hop).map((leg) => Math.min(t1, seg.t0 + (hop.at ?? 0) + leg.to))));
    const shown = (logical) => (logical - t0) / step.speed;
    const tails = [...onsets, ...exits].map((logical) => shown(logical) + PULSE_MS);
    return roundToScale(Math.max(shown(t1), ...tails), PRESENTATION_PRECISION);
  });
}
