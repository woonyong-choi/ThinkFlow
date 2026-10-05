// 브라우저에서 돈다(play.js와 한 스크립트로 이어 붙는다). 단계별 도형 상태를 쓰는 그림에만 뒤에 붙는다(html.js).
// 구간의 status(도형 번호와 종류의 목록)에 든 상태 알약만 보이고 나머지는 꺼진다. 시간표가 구간마다 완전히 적어 둔 값을 읽기만 한다.

{
  const drawBase = drawSegmentState;
  // cost: time O(p) 첫 호출 뒤에도 같다, heap O(p), stack O(1)
  // vars: p = 상태 알약 수
  // basis: estimate
  drawSegmentState = (stage, seg, mayGrow) => {
    drawBase(stage, seg, mayGrow);
    stage.statusEls ??= [...stage.svg.querySelectorAll('.fl-status')];
    stage.statusEls.forEach((el) => el.setAttribute('opacity', seg.status?.includes(el.dataset.st) ? 1 : 0));
  };
}
