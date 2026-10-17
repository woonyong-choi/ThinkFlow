// 선 끝 표시: 관계의 다중성(0..*, 1)은 선 옆의 글이고, 외래 키의 삭제 정책(CASCADE)은 참조하는 열 쪽 끝의 선 위 알약이다.
// 배치(elkjs 끝 라벨 자리), 읽기(read.js), 그리기(draw/connector.js), 그림 검사가 이 목록 하나를 같이 쓴다.
// 삭제 정책을 선 옆 글로 두면 외래 키 열이 붙어 있을 때 글이 두 열 줄 사이에 서서 어느 선의 것인지 읽히지 않는다. 선 위 알약은 자기 선에 붙어 있다.
import { sizePill } from '../measure/sizes.js';
import { STYLE, textBlock } from '../measure/texts.js';
import { deleteRule } from '../table.js';

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 표시 글자 수
// basis: estimate
/**
 * 선 끝 end('from' | 'to')의 표시 목록. { id, end, text, isPill, w, h }이고 id는 elkjs 라벨 id다.
 * 알약을 먼저 둔다. elkjs는 같은 끝의 라벨을 선에서 가까운 것부터 쌓고, 알약은 읽을 때 선 위로 옮기므로 다중성 글이 그 아래 자리를 쓴다.
 */
export function endMarks(edge, end) {
  const marks = [];
  if (end === 'from' && edge.ondelete) {
    const text = deleteRule(edge.ondelete);
    marks.push({ id: `end::${edge.index}::${end}::policy`, end, text, isPill: true, ...sizePill(text) });
  }
  const multiplicity = edge[`${end}Multiplicity`];
  if (multiplicity !== undefined) {
    const { w, h } = textBlock(multiplicity, { textW: Infinity, pad: 0, style: STYLE.meta });
    marks.push({ id: `end::${edge.index}::${end}`, end, text: multiplicity, isPill: false, w, h });
  }
  return marks;
}
