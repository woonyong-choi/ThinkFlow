import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportDesign } from '../src/vendor/theme/ui/build/export.mjs';

const [destination, revision] = process.argv.slice(2);
if (!destination || !/^[a-f0-9]{40}$/.test(revision ?? '') || process.argv.length !== 4) throw new Error('usage: sync-homepage.mjs <homepage> <commit>');
const target = resolve(destination);
exportDesign(fileURLToPath(new URL('../src/vendor/theme', import.meta.url)), resolve(target, 'src/vendor/theme'));
execFileSync('npm', ['install', '--save-dev', '--save-exact', `github:woonyong-choi/daphnis#${revision}`], { cwd: target, stdio: 'inherit' });
