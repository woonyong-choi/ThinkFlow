// 시퀀스 구획은 공통 중립 경계와 제목 면을 쓴다. 메시지의 실제 재생 강조와 구획의 구조 표시는 분리한다.
import { escapeXml, roundCoord as r } from '../text.js';
import { sceneTag } from './scene-tag.js';
import { CORNER, rectOpen } from './surface.js';
import { drawTexts } from './texts.js';

// cost: time O(f·b·n), heap O(out), stack O(1)
// vars: f = 구획 수, b = 대안 수, n = 제목 글자 수, out = 출력 글자 수
// basis: estimate
/** 생명선 위에 제목 면을 얹어 글자를 가로지르지 않게 한다. */
export function drawSequenceFragments(scene, glyphs) {
  return (scene.fragments ?? []).map((frame) => {
    const box = `<rect x="${r(frame.x)}" y="${r(frame.y)}" width="${r(frame.w)}" height="${r(frame.h)}" rx="${CORNER.outer}" class="fl-fragment-border"/>`;
    const title = drawHeading(frame.header, frame, glyphs);
    const branches = frame.branches.map((branch, i) => `${i ? `<path d="M${r(frame.x)} ${r(branch.y)} h${r(frame.w)}" class="fl-fragment-divider"/>` : ''}${drawHeading(branch, frame, glyphs)}`).join('');
    const tag = sceneTag(frame, scene.shownSi);
    return `<g class="fl-fragment${tag.off}"${tag.attr} data-kind="${frame.kind}" role="group" aria-label="${escapeXml(frame.header.text)}">${box}${title}${branches}</g>`;
  }).join('');
}

// cost: time O(n), heap O(out), stack O(1)
// vars: n = 제목 글자 수, out = 출력 글자 수
// basis: estimate
// 구획의 제목과 대안 이름 줄. 카드 머리와 달리 생명선 위에 얹는 제목 면이라 이름이 다르다. 면(plate)과 글은 배치(layout/sequence-fragments.js)가 정한 자리 그대로다.
function drawHeading(header, frame, glyphs) {
  const { plate } = header;
  const face = `${rectOpen({ x: frame.x + plate.x, y: header.y + plate.y, w: plate.w, h: plate.h }, CORNER.inner)} class="fl-fragment-heading"/>`;
  return `<g class="${header === frame.header ? 'fl-fragment-title' : 'fl-fragment-branch'}">${face}${drawTexts(header.texts, { x: frame.x, y: header.y }, glyphs)}</g>`;
}
