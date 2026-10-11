import { existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { verifyDesign } from './verify.mjs';

export function removeEmptyDirectories(folder) {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = join(folder, entry.name);
    removeEmptyDirectories(path);
    if (!readdirSync(path).length) rmdirSync(path);
  }
}

/** 검증한 완성본만 전달하며 기존 파일을 소비자가 수정했으면 중단한다. */
export function exportDesign(source, target) {
  const manifest = verifyDesign(source);
  const previous = existsSync(join(target, 'manifest.json')) ? verifyDesign(target) : undefined;
  if (!previous && existsSync(target) && readdirSync(target).length) throw new Error('design destination is not empty');
  for (const name of Object.keys(previous?.files ?? {})) if (!Object.hasOwn(manifest.files, name)) unlinkSync(join(target, name));
  if (existsSync(target)) removeEmptyDirectories(target);
  for (const name of Object.keys(manifest.files)) {
    const file = join(target, name);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, readFileSync(join(source, name)));
  }
  writeFileSync(join(target, 'manifest.json'), readFileSync(join(source, 'manifest.json')));
  return verifyDesign(target);
}
