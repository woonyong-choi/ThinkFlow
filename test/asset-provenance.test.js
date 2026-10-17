import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

// 공통 디자인(@woonyong-choi/design-tokens 패키지)의 출처는 design-tokens가 검사한다. 여기서는 이 저장소의 자체 파일만 본다.
const root = new URL('../', import.meta.url).pathname;
const SKIP = new Set(['node_modules', '.git', '.local', 'examples/out']);
const RASTER = /\.(png|jpe?g|gif|webp|avif|bmp|ico)$/i;
const THIRD_PARTY_NAMES = [/-io\d{2}\.[a-z0-9]+$/i, /^fancysection-/i, /^arrivals-/i, /^bezel-/i];
const TEXT = /\.(m?js|ts|css|html|svg|json|torso|ya?ml)$/i;
const sources = JSON.parse(readFileSync(root + 'docs/assets/sources.json', 'utf8'));

const walk = dir => readdirSync(root + dir, { withFileTypes: true }).flatMap(entry => {
  const path = dir ? `${dir}/${entry.name}` : entry.name;
  if (SKIP.has(entry.name) || SKIP.has(path)) return [];
  return entry.isDirectory() ? walk(path) : [path];
});
const files = walk('');

test('own_raster_images_have_a_recorded_origin_license_and_hash', () => {
  for (const path of files.filter(name => RASTER.test(name))) {
    const entry = sources.find(source => source.file === path);
    assert.ok(entry, `${path}: docs/assets/sources.json에 출처 기록이 없다`);
    assert.ok(['project-original', 'third-party'].includes(entry.origin), path);
    assert.ok(entry.license, path);
    if (entry.origin === 'third-party') assert.match(entry.url ?? '', /^https:\/\/(?!([^/]*\.)?culturedcode\.com\/)/, path);
    assert.equal(createHash('sha256').update(readFileSync(root + path)).digest('hex'), entry.sha256, path);
  }
  for (const entry of sources) assert.ok(files.includes(entry.file), entry.file);
});

test('own_files_have_no_third_party_site_names_or_asset_links', () => {
  for (const path of files) {
    const name = path.split('/').pop();
    for (const rule of THIRD_PARTY_NAMES) assert.doesNotMatch(name, rule, path);
    if (TEXT.test(path)) assert.doesNotMatch(readFileSync(root + path, 'utf8'), /(?:url\(|src=|href=)["']?https?:\/\/([^/"')]*\.)?culturedcode\.com\//i, path);
  }
});
