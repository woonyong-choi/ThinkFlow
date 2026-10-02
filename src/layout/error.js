// 배치가 끝내 그리지 못했을 때의 오류. 원본 줄 번호를 담아 build가 진단으로 바꾼다(docs/design/layout.md 배치 실패).

/** 배치 실패. line은 원인이 된 선이나 그림 종류 문장의 원본 줄이다. */
export class LayoutError extends Error {
  // cost: time O(1), heap O(1), stack O(1)
  // basis: estimate
  constructor(message, line) {
    super(message);
    this.line = line;
  }
}
