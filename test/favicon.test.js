import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { faviconLinks } from '../src/html/favicon.js';

test('standalone HTML uses the README logo bytes for both browser themes', () => {
  const links = faviconLinks();
  for (const [scheme, file] of [['light', 'thinkflow-logo.png'], ['dark', 'thinkflow-logo-dark.png']]) {
    const match = links.match(new RegExp(`media="\\(prefers-color-scheme: ${scheme}\\)" href="data:image/png;base64,([^\"]+)"`));
    assert.ok(match, `${scheme} logo is embedded for offline HTML`);
    assert.deepEqual(Buffer.from(match[1], 'base64'), readFileSync(new URL(`../docs/assets/${file}`, import.meta.url)));
  }
  assert.equal((links.match(/rel="icon"/g) ?? []).length, 2);
});
