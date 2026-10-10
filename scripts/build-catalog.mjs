// examples/의 예제 원본마다 SVG, 재생 HTML, 원본 사본을 만들고, 모든 예제와 원본을 한 쪽에 모은 목록(index.html)을 쓴다.
// 사용: node scripts/build-catalog.mjs [출력 폴더, 기본 .local/examples]
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { buildFigure } from '../src/build.js';
import { toHtml } from '../src/html.js';
import { VALUES } from '../src/source/grammar.js';
import { toSvg } from '../src/svg.js';
import { catalogCoverage } from './lib/catalog-coverage.mjs';
import { galleryPage } from './lib/catalog-page.mjs';
import { supportFiles } from './lib/catalog-support.mjs';

const EXAMPLES = 'examples';
// 목록에 나오는 순서. 차트 종류는 문법 표의 차트 종류와 하나씩 맞고, 나머지는 개발 문서에서 자주 그리는 그림이다.
export const CHART_EXAMPLES = ['bar', 'stacked', 'percent', 'dumbbell', 'difference', 'line', 'step', 'area', 'scatter', 'histogram', 'box', 'ecdf', 'heatmap', 'donut', 'pie', 'waterfall'];
export const DEVELOPMENT_EXAMPLES = ['architecture', 'flow', 'state', 'schema', 'class', 'api', 'sequence', 'trace', 'metric', 'memory', 'stack', 'queue', 'pointer', 'integration'];
const output = resolve(process.argv[2] ?? '.local/examples');

// cost: time O(n·build), heap O(out), stack O(1), io O(n)
// vars: n = 예제 수, build = 그림 빌드 비용, out = 한 예제의 생성물 크기
// basis: estimate
async function main() {
  const sources = readdirSync(EXAMPLES).filter((name) => name.endsWith('.thinkflow')).map((name) => name.replace(/\.thinkflow$/, ''));
  assert.deepEqual([...sources].sort(), [...CHART_EXAMPLES, ...DEVELOPMENT_EXAMPLES].sort(), 'examples/ holds exactly the listed demos');
  assert.deepEqual([...CHART_EXAMPLES].sort(), Object.keys(VALUES.chartType.items).sort(), 'one chart demo per chart type in the grammar table');
  // 이전에 이 도구가 만든 폴더(review.json이 있다)만 비우고 다시 만든다. 낡은 목록과 그림이 남지 않게 하려는 것이고, 모르는 폴더는 지우지 않는다.
  if (existsSync(output)) {
    const present = readdirSync(output);
    assert.ok(!present.length || present.includes('review.json'), `${output} is not an empty folder or a catalog made by this script. Pick another folder`);
    rmSync(output, { recursive: true, force: true });
  }
  mkdirSync(output, { recursive: true });
  // 끝나기 전에 멈춰도 다음 실행이 이 폴더를 알아보도록 표시를 먼저 둔다. 검토 기록은 끝에서 다시 쓴다.
  writeFileSync(resolve(output, 'review.json'), '[]');
  const entries = [];
  const review = [];
  for (const id of [...CHART_EXAMPLES, ...DEVELOPMENT_EXAMPLES]) {
    const source = readFileSync(`${EXAMPLES}/${id}.thinkflow`, 'utf8');
    const result = await buildFigure(source, { baseDir: EXAMPLES, strict: true });
    const scenes = result.timeline.steps;
    writeFileSync(resolve(output, `${id}.thinkflow`), source);
    writeFileSync(resolve(output, `${id}.svg`), await toSvg(result, { name: id }));
    writeFileSync(resolve(output, `${id}.html`), await toHtml(result, id));
    // 원본이 상대 경로로 읽는 자료(사용자 아이콘, JSON 값)는 원본 사본과 같은 상대 경로에 놓고, 목록이 파일마다 링크한다.
    const support = supportFiles(source, EXAMPLES);
    for (const file of support) {
      mkdirSync(dirname(resolve(output, file)), { recursive: true });
      copyFileSync(resolve(EXAMPLES, file), resolve(output, file));
    }
    entries.push({ id, group: CHART_EXAMPLES.includes(id) ? '차트' : '개발 그림', title: result.figure.title, subtitle: result.figure.subtitle, scenes, source, support });
    review.push({ id, scenes, warnings: result.warnings, durationMs: result.timeline.total, support, coverage: Object.keys(catalogCoverage(source)) });
    console.log(`${id}: ${scenes.map((scene) => `${scene.label}(${scene.mode})`).join(' · ')}`);
  }
  writeFileSync(resolve(output, 'index.html'), galleryPage(entries, 'ThinkFlow 예제'));
  writeFileSync(resolve(output, 'review.json'), JSON.stringify(review, null, 2));
  console.log(JSON.stringify({ examples: entries.length, output }));
}

await main();
