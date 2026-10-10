// 실제 배포물을 저장소 밖에 설치해 공개 진입점만으로 문서 그림을 만든다.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = realpathSync(fileURLToPath(new URL('../', import.meta.url)));
const target = process.argv[2];
assert.ok(process.argv.length === 3 && isAbsolute(target ?? ''), '사용법: npm run check:package -- <저장소 밖 새 폴더의 절대 경로>');
const consumer = join(realpathSync(dirname(resolve(target))), basename(resolve(target)));
assert.ok(consumer !== root && !consumer.startsWith(root + sep), '검사 폴더는 저장소 밖에 둡니다.');

// 기존 경로는 손대지 않는다. 이 호출로 만든 소비 환경만 finally에서 정리한다.
mkdirSync(consumer);
try {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(npm_|node_options$|node_path$|node_auth_token$|gh_token$|github_token$)/i.test(key)));
  for (const config of ['user', 'global']) writeFileSync(join(consumer, `${config}.npmrc`), '');
  Object.assign(env, {
    npm_config_userconfig: join(consumer, 'user.npmrc'),
    npm_config_globalconfig: join(consumer, 'global.npmrc'),
    npm_config_cache: join(consumer, 'cache'),
    npm_config_registry: 'https://registry.npmjs.org/',
    npm_config_audit: 'false',
    npm_config_fund: 'false',
  });
  const run = (command, args, cwd = consumer) => execFileSync(command, args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 });
  const [pack] = JSON.parse(run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', consumer], root));
  const allowed = /^(?:src\/|docs\/assets\/daphnis-[^/]+\.svg$|LICENSE$|NOTICE$|README(?:\.ko)?\.md$|package\.json$)/;
  assert.deepEqual(pack.files.filter(({ path }) => !allowed.test(path)), [], '배포 허용 목록 밖 파일');
  writeFileSync(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }) + '\n');
  run('npm', ['install', '--ignore-scripts', '--omit=dev', '--package-lock=false', join(consumer, pack.filename)]);
  const installed = join(consumer, 'node_modules/daphnis');
  assert.ok(!lstatSync(installed).isSymbolicLink(), '설치본은 저장소 링크가 아닌 tarball 사본이어야 합니다.');
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  for (const name of Object.keys(pkg.devDependencies ?? {})) assert.ok(!existsSync(join(consumer, 'node_modules', name)), `개발 의존성 ${name}이 소비 환경에 있습니다.`);
  copyFileSync(join(root, 'examples/flow.dap'), join(consumer, 'flow.dap'));
  const cli = join(consumer, 'node_modules/.bin/daphnis');
  run(cli, ['check', 'flow.dap', '--strict']);
  run(cli, ['render', 'flow.dap', '--html', '--strict', '--out', 'render']);
  const source = readFileSync(join(consumer, 'flow.dap'), 'utf8');
  writeFileSync(join(consumer, 'document.md'), '# 설치 검사\n\n```dap name=flow\n' + source + '```\n');
  run(cli, ['md', 'document.md', '--strict']);
  run(cli, ['md', 'document.md', '--check', '--strict']);
  assert.match(readFileSync(join(consumer, 'document.md'), 'utf8'), /<!-- dap -->/);
  writeFileSync(join(consumer, 'consumer.mjs'), `
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { buildFigure, toSvg, toHtml } from 'daphnis';
const require = createRequire(import.meta.url);
const manifest = require('daphnis/design-manifest.json');
assert.equal(manifest.contentHash, process.argv[2]);
const source = readFileSync('flow.dap', 'utf8');
const result = await buildFigure(source, { strict: true, allowFileAccess: false });
const svg = await toSvg(result);
const html = await toHtml(result, 'flow');
assert.equal(svg, readFileSync('render/flow.svg', 'utf8'));
assert.equal(html, readFileSync('render/flow.html', 'utf8'));
for (const output of [svg, html]) assert.match(output, /data:font\\/woff2;base64,/);
assert.ok(result.timeline.segs.length > 0);
assert.match(html, /role="tablist"/);
console.log('설치한 CLI·Markdown·공개 API와 내장 글꼴·디자인 확인');
`);
  const manifest = JSON.parse(readFileSync(join(root, 'src/vendor/theme/manifest.json'), 'utf8'));
  process.stdout.write(run(process.execPath, ['consumer.mjs', manifest.contentHash]));
  console.log(`${pack.name}@${pack.version}: 배포 파일 ${pack.files.length}개 검사 완료`);
} finally {
  rmSync(consumer, { recursive: true });
}
