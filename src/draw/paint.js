// 원본이 고른 면, 테두리, 카드 바탕 색(`fill=`, `stroke=`, `card=`)을 그린다. 값은 문법 표의 paint 목록 이름이고, 색은 역할 토큰 `color.paint.<이름>`의 단계(fill, stroke)다.
// 고르지 않은 도형과 카드는 이 파일의 어떤 것도 쓰지 않아 출력이 그대로다. 고른 색의 CSS 규칙은 쓴 색에만 결과 파일에 들어간다.
import { tokens, values } from '../tokens.js';

const SPACE = values.space;
// 밝힌 도형의 후광: 테두리(border.strong) 바깥으로 틈(gap)을 두고 고리(ring)를 한 겹 더한다. 고리는 그 도형의 stroke 색이다.
const HALO_GAP = SPACE['1-5'];
const HALO_RING = values.border.edge;
const GAP_WIDTH = values.border.strong + HALO_GAP * 2;
const RING_WIDTH = GAP_WIDTH + HALO_RING * 2;

/** 색 이름의 면 색 토큰 참조 */
export const fillOf = (name) => tokens.color.paint[name].fill;

/** 색 이름의 테두리 색 토큰 참조 */
export const strokeOf = (name) => tokens.color.paint[name].stroke;

// cost: time O(s + g), heap O(c), stack O(1)
// vars: s = 도형 수, g = 그룹 수, c = 고른 색 수
// basis: estimate
/** 그림이 고른 색 이름 목록. { stroke, groupFill }은 테두리와 그룹 면에 쓴 이름이다. */
function usedPaints(scene) {
  const boxes = [...scene.items, ...scene.groups];
  return { stroke: [...new Set(boxes.map((b) => b.stroke).filter(Boolean))], groupFill: [...new Set(scene.groups.map((g) => g.fill).filter(Boolean))] };
}

// cost: time O(c), heap O(out), stack O(1)
// vars: c = 고른 색 수, out = 만든 CSS 글자 수
// basis: estimate
/**
 * 고른 색의 CSS. 테두리 색 클래스(`ps-이름`)는 켜진 도형과 그룹에서도, 아이콘 탭이 있는 그룹에서도 그대로여서 밝힘은 색이 아니라 굵은 테두리와 후광(`fl-halo`)이 알린다.
 * 그룹 면 클래스는 `pf-이름`이다. 쓴 색이 없으면 빈 글이다.
 */
export function paintCss(scene) {
  if (!scene) return '';
  const { stroke, groupFill } = usedPaints(scene);
  const rules = stroke.flatMap((name) => {
    const color = `stroke: var(--color-paint-${name}-stroke);`;
    return [
      `.fl .fl-stroke.ps-${name} {\n  ${color}\n}`,
      `.fl .fl-node.on .fl-stroke.ps-${name},\n.fl .fl-group.on .fl-stroke.ps-${name},\n.fl .fl-group.tabbed:not(.on) .frame-box.ps-${name} {\n  ${color}\n}`,
    ];
  });
  if (stroke.length) rules.push('.fl .fl-node.on .fl-halo,\n.fl .fl-group.on .fl-halo {\n  opacity: 1;\n}');
  for (const name of groupFill) rules.push(`.fl .frame-box.pf-${name} {\n  fill: var(--color-paint-${name}-fill);\n}`);
  return rules.length ? `\n${rules.join('\n')}\n` : '';
}

// cost: time O(p), heap O(p), stack O(1)
// vars: p = 윤곽 조각 수
// basis: estimate
/**
 * 후광: 켜졌을 때만 보이는 고리. 윤곽 조각마다 stroke 색 고리를 먼저 깔고, 그 위에 바탕색 띠(틈)를 얹은 뒤 도형이 덮는다.
 * @param pieces 도형 윤곽 조각. 닫지 않은 `<rect ...` 같은 글이다
 * @param ground 도형 바깥 바탕 색(그룹 안이면 그 그룹 면, 아니면 그림 바탕)
 * @param option { name, cls }. name은 stroke 색 이름, cls는 켜짐 class다
 */
export function drawHalo(pieces, ground, { name, cls }) {
  const ring = pieces.map((p) => `${p} stroke="${strokeOf(name)}" stroke-width="${RING_WIDTH}"/>`).join('');
  const gap = pieces.map((p) => `${p} stroke="${ground}" stroke-width="${GAP_WIDTH}"/>`).join('');
  return `<g class="fl-halo ${cls}" fill="none" opacity="0">${ring}${gap}</g>`;
}
