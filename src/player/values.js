// 브라우저에서 돈다(play.js와 한 스크립트로 이어 붙는다). 값 카드 줄의 값 글자와 바뀐 값의 배경 후광을 그린다.
// 글자 요소는 값마다 하나씩 미리 그려져 있고, 모습(frame.values)이 가리키는 글과 같은 글자 요소만 보인다. 어느 글을 보일지는 표본 추출기가 정한다.
// 같은 카드가 여러 판에 그려지면 값 글자와 배경 후광 요소가 판마다 한 벌씩 있고(data-v, data-vf는 같다), 모두 같은 값으로 쓴다. 값 쓰기는 논리 사건 하나다.

// 값 줄마다 그림 안의 글자 요소 목록과 배경 후광 요소 목록을 한 번 찾아 둔다.
function createValueEls(view, data) {
  return (data.values ?? []).map((_, vi) => ({ texts: [...view.querySelectorAll(`[data-v="${vi}"]`)], flashes: [...view.querySelectorAll(`[data-vf="${vi}"]`)] }));
}

// 보이는 글이 바뀐 카드 글 줄의 배경 후광 요소를 줄마다(`도형 id:줄 번호`) 한 번 찾아 둔다. 같은 카드가 여러 판에 그려져도 줄 하나는 논리 사건 하나다.
function createRowEls(view) {
  const rows = new Map();
  for (const el of view.querySelectorAll('[data-rf]')) rows.set(el.dataset.rf, [...(rows.get(el.dataset.rf) ?? []), el]);
  return rows;
}

/**
 * 값 줄을 그린다. 이 장면의 줄이 아니면(frame.values가 없음) 모든 글자가 꺼진다.
 * 배경 후광은 실제로 글이 바뀐 줄만 켜지고(`value:줄 번호` 후광) 불투명도가 후광 세기다.
 */
function paintValues(stage, frame) {
  stage.valueEls.forEach(({ texts, flashes }, vi) => {
    for (const el of texts) showVariant(stage, el, el.dataset.t === frame.values[vi]);
    for (const el of flashes) writeAttr(stage, el, 'opacity', frame.pulses[`value:${vi}`] ?? 0);
  });
  // 글 줄의 배경 후광은 보이는 글이 실제로 바뀐 줄(`row:도형:줄`)만 켜진다. 카드 전체나 지운 줄은 켜지 않는다.
  for (const [key, els] of stage.rowEls) for (const el of els) writeAttr(stage, el, 'opacity', frame.pulses[`row:${key}`] ?? 0);
}
