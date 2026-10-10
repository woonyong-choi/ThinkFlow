import { fileURLToPath } from 'node:url';
import { verifyDesign } from '../src/vendor/theme/ui/build/verify.mjs';
verifyDesign(fileURLToPath(new URL('../src/vendor/theme', import.meta.url)));
