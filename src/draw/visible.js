// 보였다 사라지는 변형(값 글자, 큐 찬 칸, 카드 내용 층, 상태 알약)의 보임 속성. 불투명도 0인 요소는 화면에서만 사라지고 접근성 트리에는 남으므로 보이지 않을 때는 `visibility="hidden"`도 쓴다.
// 변형끼리는 겹쳐 들어가지 않고 안쪽 요소는 visibility를 정하지 않는다. 안쪽 `visible`이 바깥 `hidden`을 이기기 때문이다.

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 처음 보이지 않는 변형(shown이 0)에 붙이는 속성 글. 처음부터 보이면 빈 글이다. */
export const hiddenAttr = (shown) => (shown ? '' : ' visibility="hidden"');
