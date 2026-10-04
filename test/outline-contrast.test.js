// 외곽선 대비 3 실험(팔레트 실험 브랜치): 회색 외곽선과 색별 외곽선, 그룹 제목 글자가 면 위에서 지키는 대비를 고정한다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contrast } from '../src/contrast.js';
import { valueNames } from '../src/source/grammar.js';
import { themeColor } from './helpers.js';

const THEMES = ['light', 'dark'];
const GROUP_FACES = ['group-1', 'group-2', 'group-3'];
const PLATE_FACES = ['bg', 'node', ...GROUP_FACES];
const OUTLINE_MIN = 3;
const TITLE_MIN = 4.5;

// 근거: 사용자 결정 "외곽선은 대비 3으로 맞춰 봐라"(색 제안안 실험). 회색 외곽선 color.outline이 판, 그룹 셋, 도형 면 모두 위에서 3 이상이다
test('outline_gray_reaches_contrast_3_on_the_plate_all_group_steps_and_the_node_in_both_themes', () => {
  for (const theme of THEMES) {
    for (const face of PLATE_FACES) {
      const ratio = contrast(themeColor(theme, 'outline'), themeColor(theme, face));
      assert.ok(ratio >= OUTLINE_MIN, `${theme} outline on ${face}: ${ratio.toFixed(2)}`);
    }
  }
});

// 근거: 사용자 결정 "상태 색 외곽선도 그 색 면과 판 위에서 3 이상". paint.<색>.outline이 자기 fill, 판, 도형 바탕 위에서 3 이상이다
test('outline_paint_steps_reach_contrast_3_on_their_own_fill_the_plate_and_the_node_in_both_themes', () => {
  for (const theme of THEMES) {
    for (const name of valueNames('paint')) {
      for (const face of [`paint.${name}.fill`, 'bg', 'node']) {
        const ratio = contrast(themeColor(theme, `paint.${name}.outline`), themeColor(theme, face));
        assert.ok(ratio >= OUTLINE_MIN, `${theme} paint.${name}.outline on ${face}: ${ratio.toFixed(2)}`);
      }
    }
  }
});

// 근거: 사용자 결정 "그룹 제목 글자는 각 면 위 4.5". 그룹 깊이 셋의 면 위에서 group-title이 4.5 이상이다
test('group_title_reaches_contrast_4_5_on_every_group_step_in_both_themes', () => {
  for (const theme of THEMES) {
    for (const face of GROUP_FACES) {
      const ratio = contrast(themeColor(theme, 'group-title'), themeColor(theme, face));
      assert.ok(ratio >= TITLE_MIN, `${theme} group-title on ${face}: ${ratio.toFixed(2)}`);
    }
  }
});

// 근거: 사용자 결정 "강조 그룹의 제목 글자와 외곽선은 같은 색 계열(제목 4.5, 외곽선 3)". 그룹 강조 색(sky, purple)의 제목 글자(ink)가 그 면(fill) 위에서 4.5 이상이다
test('group_emphasis_title_ink_reaches_contrast_4_5_on_its_own_fill_in_both_themes', () => {
  for (const theme of THEMES) {
    for (const name of ['sky', 'purple']) {
      const ratio = contrast(themeColor(theme, `paint.${name}.ink`), themeColor(theme, `paint.${name}.fill`));
      assert.ok(ratio >= TITLE_MIN, `${theme} paint.${name}.ink on fill: ${ratio.toFixed(2)}`);
    }
  }
});

// 근거: 사용자 결정 "강조 그룹은 1.5px 테두리(그 색의 진한 단계, 대비 3)". 강조 색(sky, purple)의 ink가 회색 그룹 면 셋과 판 위에서 3 이상이다
test('group_emphasis_border_ink_reaches_contrast_3_on_every_gray_group_step_and_the_plate_in_both_themes', () => {
  for (const theme of THEMES) {
    for (const name of ['sky', 'purple']) {
      for (const face of ['bg', ...GROUP_FACES]) {
        const ratio = contrast(themeColor(theme, `paint.${name}.ink`), themeColor(theme, face));
        assert.ok(ratio >= OUTLINE_MIN, `${theme} paint.${name}.ink on ${face}: ${ratio.toFixed(2)}`);
      }
    }
  }
});

// 근거: 사용자 결정 "강조 그룹은 면도 그 색의 옅은 틴트로 칠하고, 안의 그룹은 같은 색상각 틴트를 깊이마다 진하게(다크는 밝게). 도형 면은 그대로, 외곽선 대비 3, 제목 4.5, 테두리 3". 틴트 면 여섯(sky, purple 깊이 셋) 위에서 회색 외곽선은 3, 그룹 제목은 4.5 이상이다
test('group_tint_faces_keep_the_gray_outline_at_3_and_the_group_title_at_4_5_in_both_themes', () => {
  for (const theme of THEMES) {
    for (const name of ['sky', 'purple']) {
      for (const level of [1, 2, 3]) {
        const face = themeColor(theme, `paint.${name}.group-${level}`);
        const outline = contrast(themeColor(theme, 'outline'), face);
        const title = contrast(themeColor(theme, 'group-title'), face);
        assert.ok(outline >= OUTLINE_MIN, `${theme} outline on ${name} tint ${level}: ${outline.toFixed(2)}`);
        assert.ok(title >= TITLE_MIN, `${theme} group-title on ${name} tint ${level}: ${title.toFixed(2)}`);
      }
    }
  }
});

// 근거: 같은 결정의 강조 그룹 제목(그 색의 ink)은 자기 틴트 첫 단계 위에서 4.5, 테두리는 틴트 세 단계 위에서 3 이상이다
test('group_emphasis_ink_reaches_4_5_on_its_tint_1_and_3_on_every_tint_step_in_both_themes', () => {
  for (const theme of THEMES) {
    for (const name of ['sky', 'purple']) {
      const ink = themeColor(theme, `paint.${name}.ink`);
      assert.ok(contrast(ink, themeColor(theme, `paint.${name}.group-1`)) >= TITLE_MIN, `${theme} ${name} title on tint 1`);
      for (const level of [1, 2, 3]) assert.ok(contrast(ink, themeColor(theme, `paint.${name}.group-${level}`)) >= OUTLINE_MIN, `${theme} ${name} border on tint ${level}`);
    }
  }
});
