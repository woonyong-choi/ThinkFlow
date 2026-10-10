import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const hash = value => createHash('sha256').update(value).digest('hex');
export function verifyDesign(folder) {
  const manifest = JSON.parse(readFileSync(join(folder, 'manifest.json')));
  if (manifest.schemaVersion !== 1 || hash(JSON.stringify(manifest.files, null, 2) + '\n') !== manifest.contentHash) throw new Error('invalid design manifest');
  for (const [name, expected] of Object.entries(manifest.files)) {
    if (name.startsWith('/') || name.split('/').includes('..')) throw new Error(`invalid design path: ${name}`);
    if (hash(readFileSync(join(folder, name))) !== expected) throw new Error(`modified design artifact: ${name}`);
  }
  for (const file of readdirSync(folder, { withFileTypes: true, recursive: true }).filter(file => file.isFile())) {
    const path = join(file.parentPath, file.name).slice(folder.replace(/\/$/, '').length + 1);
    if (path !== 'manifest.json' && !Object.hasOwn(manifest.files, path)) throw new Error(`unowned design artifact: ${path}`);
  }
  return manifest;
}
