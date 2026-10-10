import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
const hash = value => createHash('sha256').update(value).digest('hex');
export function verifyDesign(folder) {
  folder = resolve(folder);
  const manifestPath = join(folder, 'manifest.json');
  if (!lstatSync(manifestPath).isFile()) throw new Error('invalid design manifest file');
  const manifest = JSON.parse(readFileSync(manifestPath));
  if (manifest.schemaVersion !== 1 || hash(JSON.stringify(manifest.files, null, 2) + '\n') !== manifest.contentHash) throw new Error('invalid design manifest');
  for (const name of Object.keys(manifest.files)) {
    if (name.includes('\\') || name.includes(':') || name.split('/').some(part => !part || part === '.' || part === '..') || name === 'manifest.json') throw new Error(`invalid design path: ${name}`);
  }
  for (const file of readdirSync(folder, { withFileTypes: true, recursive: true })) {
    const path = relative(folder, join(file.parentPath, file.name)).split(sep).join('/');
    if (file.isDirectory()) continue;
    if (!file.isFile()) throw new Error(`invalid design artifact: ${path}`);
    if (path !== 'manifest.json' && !Object.hasOwn(manifest.files, path)) throw new Error(`unowned design artifact: ${path}`);
  }
  for (const [name, expected] of Object.entries(manifest.files)) {
    if (hash(readFileSync(join(folder, name))) !== expected) throw new Error(`modified design artifact: ${name}`);
  }
  return manifest;
}
