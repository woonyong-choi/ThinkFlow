// 보기마다 따로 배치한 판을 위에서 아래로 쌓아 장면 하나로 합친다. 판은 가장 넓은 판의 가운데에 맞추고, 보기 이름(label)이 있으면 판 위에 제목 줄을 둔다.
// 판의 폭은 내용 폭과 제목 폭(왼쪽 여백 FIGURE_PAD + 글 + 오른쪽 여백) 중 큰 쪽이고, 내용은 그 폭 안에서 가운데에 놓인다.
// 합친 장면의 선은 보기 순서대로 이어 붙여 문서 전체 선·메시지 번호(source/project.js)와 같은 번호를 받고, 처음 점·끝 겹원의 선(isMark)은 맨 뒤에 둔다.
import { FIGURE_PAD } from '../canvas.js';
import { measure } from '../measure/fonts.js';
import { STYLE } from '../measure/texts.js';
import { shiftScene } from './shift.js';
import { values } from '../vendor/theme/tokens.js';

const SIZE = values.spacing.figure;

// cost: time O(p·(s + e·pts)), heap O(p·(s + e·pts)), stack O(1)
// vars: p = 판 수, s = 도형·그룹 수, e = 선 수, pts = 경로 점 수
// basis: estimate
/**
 * 판들을 합친 장면을 만든다.
 * @param panels 보기 순서의 판 목록. 판은 { view, strategy, label?, scene?, chart?, time? }이다. 그래프와 순서 판은 scene({ items, groups, edges, ..., width, height }), 차트 판은 chart(chart/draw.js의 그림 + id), 시간 판은 time(layout/time.js의 배치)을 갖는다
 * @returns { items, groups, edges, lifelines, notes, activations, destructions, fragments, plots, times, panels, width, height }. panels는 { view, strategy, box: { x, y, w, h }, label?, index }다. 합쳐진 도형·그룹·선에는 view와 panel(판 번호), 선에는 strategy가 붙는다
 */
export function composePanels(panels) {
  const sizes = panels.map(sizeOf);
  const width = Math.max(...sizes.map((s) => s.w));
  const labelH = SIZE.group.title;
  const scene = { items: [], groups: [], edges: [], lifelines: [], notes: [], activations: [], destructions: [], fragments: [], plots: [], times: [], panels: [], width, height: 0 };
  let y = 0;
  panels.forEach((panel, index) => {
    const { w, h, content } = sizes[index];
    const head = panel.label ? labelH : 0;
    const x = (width - w) / 2;
    const place = { dx: x + (w - content) / 2, dy: y + head };
    place_(scene, panel, place, index);
    const box = { x, y, w, h: h + head };
    scene.panels.push({ index, view: panel.view, strategy: panel.strategy, box, label: panel.label, ...(panel.label ? { labelAt: { x: x + FIGURE_PAD, y: y + labelH / 2 } } : {}) });
    y += h + head;
  });
  scene.height = y;
  scene.edges = [...scene.edges.filter((e) => !e.isMark), ...scene.edges.filter((e) => e.isMark)];
  return scene;
}

// cost: time O(n), heap O(1), stack O(1)
// vars: n = 보기 이름 글자 수
// basis: estimate
// 판의 크기. content는 배치한 내용 폭이고 w는 제목이 잘리지 않게 늘린 판 폭이다.
function sizeOf(panel) {
  const source = panel.scene ?? panel.chart ?? panel.time;
  const title = panel.label ? measure(panel.label, STYLE.group.size, STYLE.group.face) + FIGURE_PAD * 2 : 0;
  return { w: Math.max(source.width, title), h: source.height, content: source.width };
}

// cost: time O(s + e·pts), heap O(s + e·pts), stack O(1)
// vars: s = 도형·그룹 수, e = 선 수, pts = 경로 점 수
// basis: estimate
// 판 하나를 합친 장면에 옮겨 담는다. 그래프와 순서 판은 좌표를 옮기고 view를 붙여 이어 붙이고, 차트와 시간 판은 놓일 자리만 적는다.
function place_(scene, panel, { dx, dy }, index) {
  if (panel.scene) {
    const part = panel.scene;
    shiftScene(part, dx, dy);
    const tag = (item) => Object.assign(item, { view: panel.view, panel: index });
    scene.items.push(...part.items.map(tag));
    scene.groups.push(...part.groups.map(tag));
    scene.edges.push(...part.edges.map((e) => Object.assign(e, { view: panel.view, panel: index, strategy: panel.strategy })));
    for (const key of ['lifelines', 'notes', 'activations', 'destructions', 'fragments']) scene[key].push(...(part[key] ?? []).map(tag));
    return;
  }
  if (panel.chart) scene.plots.push({ id: panel.chart.id, view: panel.view, panel: index, x: dx, y: dy, width: panel.chart.width, height: panel.chart.height, chart: panel.chart });
  else scene.times.push({ ...panel.time, view: panel.view, panel: index, x: dx, y: dy });
}
