// 그림 검사. 배치가 끝난 장면에서 화면 오류를 찾아 원본 줄 번호와 함께 알린다(docs/design/figure-check.md).
// 항목 목록은 check/items.js, 판정 함수는 check/ 아래 항목별 파일이다.
import { CHECKS } from './check/items.js';
import { createFamily, drawnBox, pillBox, titleBox } from './check/geometry.js';
import { hasPill } from './measure/sizes.js';

// cost: time O(e·p + s + g), heap O(e + s + g), stack O(1)
// vars: e = 선 수, p = 경로 점 수, s = 도형 수, g = 그룹 수
// basis: estimate
/** 판정이 함께 보는 장면 조각. 사각형은 한 번만 계산해 항목들이 나눠 쓴다. */
function createContext(figure, scene, timeline) {
  const edges = scene.edges.filter((e) => !e.isMark && e.points.length > 1);
  return {
    figure,
    scene,
    timeline,
    edges,
    boxes: scene.items.map((it) => ({ ...drawnBox(it), id: it.id, line: it.line, it })),
    pills: edges.filter((e) => hasPill(e) && e.labelAt).map((e) => ({ ...pillBox(e), edge: e })),
    titles: scene.groups.filter((g) => g.label).map((g) => ({ ...titleBox(g), group: g })),
    family: createFamily(scene),
  };
}

// cost: time O(e²·p² + e·s·p + s² + s·k·r·n + h·p), heap O(e + s), stack O(1)
// vars: e = 선 수, p = 경로 점 수, s = 도형 수, k = 도형당 카드 내용 수, r = 카드 줄 수, n = 줄 글자 수, h = 글 상자 있는 이동 수
// basis: estimate
/** 장면({ figure, scene, timeline })을 검사해 오류와 경고를 problems에 넣는다. 항목 목록 순서대로 판정한다. 오류 메시지 앞에 검사 번호를 붙인다. */
export function checkFigure({ figure, scene, timeline }, problems) {
  const context = createContext(figure, scene, timeline);
  for (const { judge, kinds } of CHECKS) {
    if (judge && (!kinds || kinds.includes(figure.kind))) judge(context, problems);
  }
}

// cost: time O(c·r·n), heap O(r), stack O(1)
// vars: c = 차트 판정 수, r = 항목 수, n = 이름 글자 수
// basis: estimate
/** 차트 검사. 차트에는 선과 도형이 없어 1번(항목 이름, 열 이름, 점 이름이 자기 칸에 들어간다)과 2번(산점도 점 이름끼리 겹치지 않는다)만 해당한다. */
export function checkChartFigure(chart, problems) {
  for (const { judgeChart } of CHECKS) judgeChart?.(chart, problems);
}
