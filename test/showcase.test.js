// 첫 화면과 갤러리 그림: 원본과 만든 SVG의 일치, 영어판과 한국어판의 같은 구조, README 연결, 레퍼런스 문서 그림.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { SHOWCASE_DIR, showcaseSvgs } from '../scripts/build-showcase.mjs';
import { runCli } from './helpers.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const sources = readdirSync(SHOWCASE_DIR).filter((f) => f.endsWith('.dap'));
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const showcaseRefs = (readme) => [...read(readme).matchAll(/docs\/assets\/showcase\/([\w-]+\.svg)/g)].map((m) => m[1]);
const viewBoxOf = (svg) => /viewBox="0 0 (\d+) (\d+)"/.exec(svg).slice(1).join('x');
// 따옴표 글을 지운 원본. 영어판과 한국어판은 이 모양이 같아야 한다.
// 이징 곡선의 마지막 자리(16번째 숫자)가 운영체제마다 다르다(CI 확인). 소수 10자리까지만 비교한다.
const roundedFloats = (svg) => svg.replace(/\d+\.\d{10,}/g, (n) => Number(n).toFixed(10));
const skeletonOf = (source) => source.replace(/"[^"\n]*"/g, '""').replace(/`[^`\n]*`/g, '``');

// 근거: 이슈 #61 "그림 원본과 생성 SVG를 함께 커밋": 커밋한 SVG는 원본에서 다시 만든 것과 같다
test('showcase_svgs_equal_the_rendering_of_their_sources', async () => {
  for (const file of sources) {
    const { light, dark } = await showcaseSvgs(join(SHOWCASE_DIR, file));

    const committed = (theme) => roundedFloats(readFileSync(join(SHOWCASE_DIR, file.replace(/\.dap$/, `-${theme}.svg`)), 'utf8'));

    assert.equal(committed('light'), roundedFloats(light), `run npm run showcase: ${file}`);
    assert.equal(committed('dark'), roundedFloats(dark), `run npm run showcase: ${file}`);
  }
});

// 근거: 이슈 #61 "영어판과 한국어판, 같은 구조, 글만 다름". 글 길이가 달라 배치 방향이 뒤집힌 사례(구성도 영어판)를 막는다
test('showcase_english_and_korean_sources_share_one_structure_and_one_layout_size', async () => {
  for (const file of sources.filter((f) => f.includes('-en.'))) {
    const korean = file.replace('-en.', '-ko.');

    assert.ok(sources.includes(korean), `${file} has no ${korean}`);
    assert.equal(skeletonOf(readFileSync(join(SHOWCASE_DIR, file), 'utf8')), skeletonOf(readFileSync(join(SHOWCASE_DIR, korean), 'utf8')), file);
    const [en, ko] = [file, korean].map((f) => viewBoxOf(readFileSync(join(SHOWCASE_DIR, f.replace(/\.dap$/, '-light.svg')), 'utf8')));
    assert.equal(en, ko, `${file} lays out differently from ${korean}`);
  }
});

// 근거: 이슈 #61 완료 조건 "영어 README는 영어 그림, 한국어 README는 한국어 그림", "영어·한국어 README가 그림과 링크 일대일"
test('readmes_use_the_figures_of_their_own_language_and_the_same_set', () => {
  const english = showcaseRefs('README.md');
  const korean = showcaseRefs('README.ko.md');

  assert.ok(english.length > 0);
  assert.ok(english.every((name) => name.includes('-en-')), 'README.md uses a non-English figure');
  assert.ok(korean.every((name) => name.includes('-ko-')), 'README.ko.md uses a non-Korean figure');
  assert.deepEqual(english.map((n) => n.replace('-en-', '-ko-')), korean);
  for (const name of [...english, ...korean]) assert.ok(readFileSync(join(SHOWCASE_DIR, name)), name);
});

// 근거: 이슈 #61 완료 조건 "첫 화면에 움직이는 그림": 로고 다음 첫 그림이 대표 구성도의 라이트와 다크 SVG다
test('readme_first_figure_after_the_logo_is_the_animated_cloud_architecture_in_both_themes', () => {
  for (const [readme, lang] of [['README.md', 'en'], ['README.ko.md', 'ko']]) {
    const [, second] = read(readme).split('<picture>').slice(0, 3);
    const hero = read(readme).split('<picture>')[2];

    assert.ok(second.includes('daphnis-light.svg'));
    assert.ok(hero.includes(`cloud-architecture-${lang}-dark.svg`) && hero.includes(`cloud-architecture-${lang}-light.svg`));
    assert.match(readFileSync(join(SHOWCASE_DIR, `cloud-architecture-${lang}-light.svg`), 'utf8'), /<animate|animation/);
  }
});

// 근거: 이슈 #61 레퍼런스 문서의 그림도 원본(dap 블록)과 같아야 한다. md --check와 같은 판정
test('reference_documents_figures_are_up_to_date', () => {
  const docs = readdirSync(join(ROOT, 'docs/reference')).filter((f) => f.endsWith('.md')).map((f) => `docs/reference/${f}`);
  const result = runCli(['md', '--check', '--strict', ...docs], ROOT);

  assert.equal(result.status, 0, result.stderr);
});
