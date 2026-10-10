// 순서 그림의 활성 구간과 소멸 표식. 시간표를 바꾸지 않는 구조 표시다.
import { escapeXml, roundCoord as r } from '../text.js';
import { tokens, values } from '../vendor/theme/tokens.js';
import { sceneTag } from './scene-tag.js';

// cost: time O(a + d), heap O(a + d), stack O(1)
// vars: a = 활성 구간 수, d = 소멸 표식 수
// basis: estimate
/** 활성 막대와 소멸 X를 생명선 위에 그린다. */
export function drawSequenceLife(scene) {
  const bars = (scene.activations ?? []).map((bar) => `<rect class="fl-activation${sceneTag(bar, scene.shownSi).off}"${sceneTag(bar, scene.shownSi).attr} data-node="${escapeXml(bar.node)}" x="${r(bar.x)}" y="${r(bar.y)}" width="${r(bar.w)}" height="${r(bar.h)}" fill="${tokens.color.node}" stroke="${tokens.color.line}" stroke-width="${tokens["border-width"].thin}"><title>${escapeXml(bar.node)} activation ${bar.depth + 1}</title></rect>`);
  const half = values.spacing["2"];
  const marks = (scene.destructions ?? []).map((mark) => `<g class="fl-destroy${sceneTag(mark, scene.shownSi).off}"${sceneTag(mark, scene.shownSi).attr}><circle cx="${r(mark.x)}" cy="${r(mark.y)}" r="${half + values.spacing["0-5"]}" fill="${tokens.color["prose-pre-background"]}"/><path class="fl-destruction" data-node="${escapeXml(mark.node)}" d="M ${r(mark.x - half)} ${r(mark.y - half)} L ${r(mark.x + half)} ${r(mark.y + half)} M ${r(mark.x + half)} ${r(mark.y - half)} L ${r(mark.x - half)} ${r(mark.y + half)}" fill="none" stroke="${tokens.color.line}" stroke-width="${tokens["border-width"].edge}" stroke-linecap="round"><title>${escapeXml(mark.node)} destruction</title></path></g>`);
  return bars.join('') + marks.join('');
}
