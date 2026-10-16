import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { faviconLinks } from '../src/html/favicon.js';
import { decodePng, FAVICON_SIZE, FAVICONS, faviconPixels } from '../scripts/build-favicon.mjs';

const ASSETS = new URL('../docs/assets/', import.meta.url);

test('standalone HTML embeds the tab icons shrunk from the README logo for both browser themes', () => {
  const links = faviconLinks();
  for (const [scheme, { logo, icon }] of [['light', FAVICONS[0]], ['dark', FAVICONS[1]]]) {
    const match = links.match(new RegExp(`media="\\(prefers-color-scheme: ${scheme}\\)" href="data:image/png;base64,([^\"]+)"`));
    assert.ok(match, `${scheme} icon is embedded for offline HTML`);
    const embedded = Buffer.from(match[1], 'base64');
    assert.deepEqual(embedded, readFileSync(new URL(icon, ASSETS)));
    const decoded = decodePng(embedded);
    assert.deepEqual([decoded.width, decoded.height], [FAVICON_SIZE, FAVICON_SIZE]);
    assert.ok(decoded.pixels.equals(faviconPixels(logo)), `${icon} is the current ${logo} shrunk; run node scripts/build-favicon.mjs`);
  }
  assert.equal((links.match(/rel="icon"/g) ?? []).length, 2);
});
