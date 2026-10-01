// D2 문법 해석과 배치는 D2.js(D2를 WASM으로 옮긴 것)가 맡는다. 그리기는 이 프로젝트가 한다.
import { D2 } from '@terrastruct/d2';

// D2.js는 WASM을 worker에서 돌린다. 여러 원본을 변환할 때 한 번만 띄우려고 모듈에 둔다.
let engine;

// cost: time O(s²) + d2, heap O(s), stack O(1), io 1
// vars: s = 도형 수, d2 = D2.js 해석과 배치 시간
// basis: estimate
/**
 * D2 원본을 해석하고 배치한다.
 * @returns d2target.Diagram(shapes, connections)에 원본에 직접 적은 값 `explicit`을 붙인 것
 * @throws Error D2 문법 오류. 메시지의 `index:`는 `d2:`로 바꾼다
 */
export async function compileD2(source, { layout = 'elk' } = {}) {
  engine ??= new D2();
  try {
    const { diagram, graph } = await engine.compile(source, { layout });
    return { ...diagram, explicit: findExplicitAttributes(diagram, graph) };
  } catch (error) {
    throw new Error(String(error.message ?? error).replace(/^Error:\s*/, '').replace(/\bindex:/g, 'd2:'));
  }
}

// cost: time O(s²), heap O(s), stack O(1)
// vars: s = 도형 수
// basis: estimate
// alt: 좌표를 키로 한 Map. time O(s), heap O(s). 잃는 것: 이름 끝부분 확인
/**
 * 원본에 직접 적은 크기와 글자 크기를 찾는다. 크기를 다시 잡을 때 이 값은 덮어쓰지 않는다.
 * graph.objects의 id는 부모 안에서의 이름뿐이라, 이름 끝부분과 배치 좌표로 도형을 찾는다.
 * graph.edges는 diagram.connections와 같은 순서다.
 * @returns { sized: Set<도형 id>, fontSized: Set<도형 id | 선 id> }
 */
export function findExplicitAttributes(diagram, graph) {
  const sized = new Set();
  const fontSized = new Set();
  const findShapeId = (o) =>
    diagram.shapes.find((s) => (s.id === o.id || s.id.endsWith(`.${o.id}`)) && s.pos.x === o.box?.TopLeft?.x && s.pos.y === o.box?.TopLeft?.y)?.id;
  for (const o of graph?.objects ?? []) {
    const a = o.attributes ?? {};
    const hasSize = Boolean(a.width || a.height);
    const hasFontSize = Boolean(a.style?.fontSize);
    const id = (hasSize || hasFontSize) && findShapeId(o);
    if (!id) continue;
    if (hasSize) sized.add(id);
    if (hasFontSize) fontSized.add(id);
  }
  const edges = graph?.edges ?? [];
  // 순서 그림은 생명선이 connections에만 있어 개수가 다르다. 그때는 순서로 맞출 수 없어 건너뛴다.
  if (edges.length === diagram.connections.length) {
    edges.forEach((e, i) => {
      if (e.attributes?.style?.fontSize) fontSized.add(diagram.connections[i].id);
    });
  }
  return { sized, fontSized };
}

// cost: time O(1), heap O(1), stack O(1), io 1
// basis: estimate
/** D2.js worker를 닫는다. 닫지 않으면 변환이 끝나도 프로세스가 남는다. */
export async function closeD2() {
  if (!engine) return;
  await engine.ready;
  await engine.worker.terminate();
  engine = undefined;
}

/** 순서 그림의 생명선인지 본다. 생명선은 `(a -- )[0]` 꼴이고 받는 쪽이 `a-lifeline-end-숫자`다. */
export function isLifeline(connection) {
  return /-lifeline-end-\d+$/.test(connection.dst);
}
