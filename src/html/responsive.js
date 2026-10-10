// HTML은 원본 시간표를 유지한 좁은 배치를 함께 싣는다. 브라우저에서 배치나 사건을 다시 계산하지 않는다.
// 좁은 배치는 그래프·차트·시간 판을 좁은 컨테이너 폭(COMPACT_WIDTH)에 맞춰 다시 만든 후보다. 이동 글을 원본보다 더 가리면 쓰지 않는다. 순서 판은 다시 만들지 않고 다른 판과 같은 비율로 줄어 구역 안에 들어온다(html.js panelsMarkup).
import { reflowFigure } from '../build.js';
import { COMPACT_WIDTH } from '../canvas.js';
import { values } from '../vendor/theme/tokens.js';
import { figureContent } from './content.js';

const REFLOWED = new Set(['graph', 'plot', 'time']);

// cost: time O(elk + check + out), heap O(out), stack O(d)
// vars: elk = 배치 시간, check = 그림 검사 시간, out = SVG와 시간표 크기, d = 그룹 깊이
// basis: estimate
/**
 * 좁은 배치의 내용. 다시 만들 판(그래프, 차트, 시간) 가운데 컨테이너보다 넓은 판이 없거나 다시 만들어도 좁아지지 않으면 undefined다.
 * 사건과 시각은 원본 시간표와 같고 그래프의 경로와 차트·시간축의 그림 폭만 다르다. 후보는 이동 글 경고(검사 7번)가 원본보다 늘지 않을 때만 쓴다.
 * 그래프 후보가 시각을 보존하지 못하거나 경고를 늘리면 차트만 좁힌 후보를 같은 기준으로 보고, 그것도 안 되면 undefined라 원본 배치를 폭에 맞춰 줄인다.
 */
export async function responsiveContent(result, glyphs) {
  const wide = result.scene.panels;
  if (!wide.some((panel) => REFLOWED.has(panel.strategy) && panel.box.w > COMPACT_WIDTH)) return;
  const hasGraph = result.figure.views.some((view) => view.strategy === 'graph');
  const narrow = await reflowNarrow(result, hasGraph);
  if (!narrow?.scene.panels.some((panel, i) => panel.box.w < wide[i].box.w)) return;
  const content = figureContent(narrow, glyphs);
  return { content, timeline: narrow.timeline, breakpoint: values.breakpoint.tablet };
}

// 이동 글이 도형·글에 가려지거나 다른 이동 글과 겹친다는 검사 7번 경고 수. 배치 선택이 이미 쓰는 기준과 같다.
const movingTextWarnings = (built) => built.warnings.filter((d) => d.code === 'check-7').length;

// 그래프 후보, 차트만 좁힌 후보 순으로 보고 이동 글 경고가 원본(result)보다 늘지 않은 첫 후보를 쓴다. 없으면 undefined다.
async function reflowNarrow(result, hasGraph) {
  const keeps = (narrow) => movingTextWarnings(narrow) <= movingTextWarnings(result);
  if (hasGraph) {
    const graph = await reflowGraph(result);
    if (graph && keeps(graph)) return graph;
  }
  const charts = await reflowFigure(result, { chartWidth: COMPACT_WIDTH });
  return keeps(charts) ? charts : undefined;
}

// 그래프도 좁은 폭에 배치한다. 새 배치에서 사건 시각을 보존할 수 없으면(layout-timing) undefined다. 다른 오류는 그대로 던진다.
async function reflowGraph(result) {
  try {
    return await reflowFigure(result, { layoutWidth: COMPACT_WIDTH, chartWidth: COMPACT_WIDTH });
  } catch (error) {
    if (!error.problems?.some((d) => d.code === 'layout-timing')) throw error;
  }
}
