// 순서 그림에서 메시지에 붙는 활성 구간과 참여자 생명주기를 확인한다.

/** 활성 시작·끝은 같은 단계의 바로 앞 메시지에 붙는다. */
export function readActivation({ tokens, line }, ctx) {
  const [head, node, extra] = tokens;
  const beat = ctx.step.beats.at(-1);
  if (node?.type !== 'word' || extra) {
    ctx.problems.error(line, `write ${head.value} as: ${head.value} participant`);
    return;
  }
  if (!beat?.hops.length) {
    ctx.problems.error(line, 'an activation follows a message in the same step');
    return;
  }
  (beat.activations ??= []).push({ kind: head.value, node: node.value, line });
}

// cost: time O(n·s + m + a), heap O(n + a), stack O(1)
// vars: n = 참여자 수, s = 장면 수, m = 메시지 수, a = 활성 명령 수
// basis: estimate
/**
 * 생성·소멸 사이의 메시지와 중첩 활성 구간을 장면마다 따로 검증한다. 장면은 서로 이어지지 않는 대안이라 한 장면의 생성, 소멸, 열린 활성은 다른 장면의 처음 상태에 영향을 주지 않는다:
 * 장면에서 만들어지는 참여자는 그 장면에서만 만들어질 때까지 없고, 다른 장면에서는 처음부터 있는 참여자다. 한 장면 안의 규칙(두 번 생성, 소멸 뒤 사용, 열린 활성)은 그대로 오류다.
 */
export function checkSequenceLife(figure, problems) {
  for (const step of figure.steps) checkSceneLife(step.beats.filter((beat) => beat.hops.length), figure, problems);
}

// cost: time O(n + m + a), heap O(n + a), stack O(1)
// vars: n = 참여자 수, m = 메시지 수, a = 활성 명령 수
// basis: estimate
// 한 장면의 메시지. 이 장면에서 생성 메시지를 받는 참여자는 그 메시지 전까지 없고, 나머지는 처음부터 산다.
function checkSceneLife(beats, figure, problems) {
  const created = new Set(beats.filter((beat) => beat.hops[0].create).map((beat) => beat.hops[0].to));
  const state = new Map(figure.nodes.map((node) => [node.id, { alive: !created.has(node.id), born: !created.has(node.id), stack: [] }]));
  for (const beat of beats) {
    const hop = beat.hops[0];
    checkLifeMessage(hop, state, problems);
    for (const action of beat.activations ?? []) checkActivation(action, state, problems);
  }
  for (const [id, life] of state) for (const action of life.stack) problems.error(action.line, `close activation of "${id}" with deactivate`);
}

function checkLifeMessage(hop, state, problems) {
  const source = state.get(hop.from);
  const target = state.get(hop.to);
  if (!source || !target) return;
  if (!source.alive) problems.error(hop.line, `participant "${hop.from}" cannot send before creation or after destruction`);
  if (hop.create) {
    if (target.born) problems.error(hop.line, `participant "${hop.to}" is created more than once`);
    if (hop.from === hop.to) problems.error(hop.line, 'a participant cannot create itself');
    target.alive = target.born = true;
  } else if (!target.alive) problems.error(hop.line, `participant "${hop.to}" cannot receive before creation or after destruction`);
  if (hop.create && hop.destroy) problems.error(hop.line, 'a message cannot both create and destroy its target');
  if (hop.destroy) {
    target.alive = false;
    target.stack.length = 0;
  }
}

function checkActivation(action, state, problems) {
  const life = state.get(action.node);
  if (!life) problems.error(action.line, `unknown participant "${action.node}"`);
  else if (!life.alive) problems.error(action.line, `participant "${action.node}" is not alive at this activation`);
  else if (action.kind === 'activate') life.stack.push(action);
  else if (!life.stack.length) problems.error(action.line, `participant "${action.node}" has no activation to close`);
  else life.stack.pop();
}
