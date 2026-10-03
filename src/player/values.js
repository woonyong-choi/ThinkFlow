// 브라우저에서 돈다(play.js와 한 스크립트로 이어 붙는다). 값 카드 줄의 값 글자와 밝힘 테두리를 시각에 맞춰 보인다.
// 시간표의 변화 목록(values)을 읽기만 한다. 글자 요소는 값마다 하나씩 미리 그려져 있고, 지금 값과 같은 글자 요소만 보인다(움직이는 SVG의 SMIL 이산 불투명도와 같은 결과).

// cost: time O(v), heap O(v), stack O(1)
// vars: v = 값 줄 수
// basis: estimate
// 값 줄마다 그림 안의 글자 요소 목록과 밝힘 테두리 요소를 한 번 찾아 둔다.
function createValueEls(svg, data) {
  return (data.values ?? []).map((_, vi) => ({ texts: [...svg.querySelectorAll(`[data-v="${vi}"]`)], frame: svg.querySelector(`[data-vf="${vi}"]`) }));
}

// cost: time O(v·(c + n)), heap O(1), stack O(1)
// vars: v = 값 줄 수, c = 값이 바뀌는 횟수, n = 값 글자 요소 수
// basis: estimate
// 그림 전체 시각 t(ms)의 값 줄을 그린다. 이 구간의 단계가 아닌 값 줄은 모두 숨기고, 단계의 값 줄은 t가 든 구간(periods)의 글을 보이고 밝힘 구간(flashes)에 들면 테두리를 밝힌다.
// 구간은 시간표가 한 번 계산한 값이고 움직이는 SVG의 SMIL 이산 불투명도와 같다.
function drawValueState(stage, seg, t) {
  stage.valueEls.forEach(({ texts, frame }, vi) => {
    const row = stage.values[vi];
    const isHere = row.si === seg.si;
    const text = (row.periods.find(([from, to]) => t >= from && t < to) ?? row.periods.at(-1))[2];
    texts.forEach((el) => el.setAttribute('opacity', isHere && el.dataset.t === text ? 1 : 0));
    frame?.setAttribute('opacity', isHere && row.flashes.some(([from, to]) => t >= from && t < to) ? 1 : 0);
  });
}
