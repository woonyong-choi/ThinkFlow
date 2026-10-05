// 원자 예약(`reserve=`)의 적용(docs/design/playback.md 원자 예약). 이벤트 처리(flow-events.js)가 조건을 통과한 출발마다 부른다.
import { msOfTicks } from './time-grid.js';
import { noteRowChanges, runAtomicUpdate } from './timeline-values.js';

// cost: time O(e + v), heap O(v), stack O(1)
// vars: e = 예약의 식 수, v = 값 수
// basis: estimate
/**
 * 조건(`wait`, `when`)이 모두 참인 출발이 점을 내보내는 같은 사건 안에서 예약 식을 한 갱신으로 적용한다. 조건을 읽은 뒤 쓰기 전에 다른 이벤트가 끼지 않는다.
 * 식 하나라도 실패하면 값은 하나도 바뀌지 않고 오류로 끝난다. 바뀐 값은 `engine.reserved`에 모아 이 시각의 대기를 다시 평가하게 하고, 시간표의 `reserves`에 남긴다.
 * @param engine 단계의 이벤트 처리 그릇(StepEngine)
 * @param launch 출발 { line, node, reserve }
 * @param t 이벤트 시각(눈금 번호)
 */
export function applyReserve(engine, launch, t) {
  const { state, byId, rows, textOf } = engine;
  engine.count(1, { line: launch.line, t });
  const before = new Map(launch.reserve.map((e) => [engine.root(e.id), textOf(e.id)]));
  const changed = runAtomicUpdate(launch.reserve, { state, byId, onWrite: engine.noteWrite(t) });
  noteRowChanges(rows, textOf, { t: msOfTicks(t), isMerged: true });
  for (const id of changed) engine.reserved.add(engine.root(id));
  engine.run.conditions.reserves?.push({ si: engine.si, line: launch.line, node: launch.node, t: msOfTicks(t), writes: changed.map((id) => ({ id, from: before.get(engine.root(id)), to: textOf(id) })) });
}
