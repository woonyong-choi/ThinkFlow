// 글을 백틱 기준으로 나눠 노드 목록으로 만든다. 홀수 번째 구간(백틱 안)은 makeCode가 만든 요소에 담는다.
function richNodes(text, makeCode) {
  return text
    .split('`')
    .map((part, i) => {
      if (!part) return null;
      if (i % 2 === 0) return document.createTextNode(part);
      const code = makeCode();
      code.textContent = part;
      return code;
    })
    .filter(Boolean);
}
