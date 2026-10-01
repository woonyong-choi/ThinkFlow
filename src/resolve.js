// 흐름에 적은 이름을 D2 도형과 선에 잇는다.
import { isLifeline } from './d2.js';
import { FlowError } from './flow.js';

// cost: time O(b·(s + c)), heap O(b), stack O(1)
// vars: b = 흐름 박자 수, s = 도형 수, c = 선 수
// basis: estimate
/**
 * 흐름의 이름을 D2 id로 바꾼다.
 * @returns hop이 { edge, isBack, from, to, data }이고 light, show가 도형 id이며 quiet가 선 id 목록인 흐름
 * @throws FlowError 없는 도형, 모호한 이름, 두 도형 사이에 없는 선
 */
export function resolveFlow(flow, diagram) {
  const keys = diagram.shapes.map((s) => s.id);
  const edges = diagram.connections.filter((c) => !isLifeline(c));
  const findNode = (name, line) => findKey(ownerOf(name, keys), keys, line);
  const quiet = flow.quiet.isAll
    ? edges.map((e) => e.id)
    : flow.quiet.hops.map((hop) => findEdge(edges, findNode(hop.from, hop.line), findNode(hop.to, hop.line), hop.index, hop.line).id);
  return {
    speed: flow.speed,
    quiet,
    steps: flow.steps.map((step) => ({
      label: step.label,
      caption: step.caption,
      beats: step.beats.map((beat) => ({
        say: beat.say,
        ms: beat.ms,
        light: beat.light.map((name) => findNode(name, beat.line)),
        show: Object.fromEntries(Object.entries(beat.show ?? {}).map(([name, card]) => [findNode(name, card.line), card.rows])),
        hops: beat.hops.map((hop) => {
          const from = findNode(hop.from, beat.line);
          const to = findNode(hop.to, beat.line);
          const edge = findEdge(edges, from, to, hop.index, beat.line);
          return { edge: edge.id, isBack: edge.src !== from, from, to, data: hop.data };
        }),
      })),
    })),
  };
}

// cost: time O(s), heap O(1), stack O(1)
// vars: s = 도형 수
// basis: estimate
// sql_table, class의 칸은 도형이 아니다. D2도 칸에 잇는 선을 표에 잇는 선으로 그리므로, 없는 이름이면 표 이름으로 찾는다.
function ownerOf(name, keys) {
  const isKnown = keys.some((k) => k === name || k.endsWith(`.${name}`));
  return name.includes('.') && !isKnown ? name.slice(0, name.lastIndexOf('.')) : name;
}

// cost: time O(s), heap O(s), stack O(1)
// vars: s = 도형 수
// basis: estimate
// 전체 id와 같거나, 끝부분이 하나만 맞으면 그 id다. `system.cli` 대신 `cli`만 적어도 된다.
function findKey(name, keys, line) {
  if (keys.includes(name)) return name;
  const tails = keys.filter((k) => k.endsWith(`.${name}`));
  if (tails.length === 1) return tails[0];
  if (tails.length > 1) throw new FlowError(line, `도형 \`${name}\`이 여럿이다: ${tails.join(', ')}`);
  throw new FlowError(line, `도형 \`${name}\`이 그림에 없다`);
}

// cost: time O(c), heap O(c), stack O(1)
// vars: c = 선 수
// basis: estimate
// 방향과 관계없이 두 도형 사이의 선. index가 있으면 `[index]`번 선이다.
function findEdge(edges, from, to, index, line) {
  const between = edges.filter((e) => (e.src === from && e.dst === to) || (e.src === to && e.dst === from));
  if (!between.length) throw new FlowError(line, `\`${from}\`와 \`${to}\` 사이에 선이 없다`);
  if (index === undefined) return between[0];
  const edge = between.find((e) => Number(/\[(\d+)\]$/.exec(e.id)?.[1]) === index);
  if (!edge) throw new FlowError(line, `\`${from}\`와 \`${to}\` 사이에 [${index}]번 선이 없다`);
  return edge;
}
