// 순서 보기의 요소(메시지, 메모, 구획, 활성 막대, 소멸 표식)는 자기 장면 번호(`si`)를 달고, 보이는 장면 하나의 요소만 보인다.
// 그림은 늘 모든 장면의 요소를 같은 자리에 두고(판 크기가 장면과 상관없다) 장면이 바뀌면 `.fl-off`만 바꾼다.

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/**
 * 요소의 장면 표시 속성. 장면 번호가 없는 요소(그래프의 선, 도형)는 늘 보여 아무것도 더하지 않는다.
 * @param item 장면 번호(si)를 가질 수 있는 요소
 * @param shownSi 지금 보이는 장면 번호. 없으면 모두 보인다
 * @returns { attr, off }. attr는 `data-si` 속성 글, off는 보이지 않는 장면의 요소에 붙는 class 조각이다
 */
export function sceneTag(item, shownSi) {
  if (item.si === undefined) return { attr: '', off: '' };
  return { attr: ` data-si="${item.si}"`, off: shownSi !== undefined && item.si !== shownSi ? ' fl-off' : '' };
}
