// Lucide 아이콘(ISC)의 안쪽 도형을 src/icons/lucide/icons.js로 옮긴다. 사용: node scripts/build-lucide.mjs <lucide-static의 icons 폴더>
// 파일은 24 격자 외곽선 아이콘이고 선 굵기와 끝 모양은 그리는 쪽(src/player/view.js)이 토큰으로 정한다. 도형은 원본 그대로다.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const NAMES = ['maximize-2', 'minimize-2', 'zoom-in', 'zoom-out', 'scan', 'play', 'pause'];
const OUT = new URL('../src/icons/lucide/icons.js', import.meta.url);

// cost: time O(n), heap O(n), stack O(1), io n
// vars: n = 아이콘 수
// basis: estimate
// svg 파일에서 `<svg>` 안쪽 도형 글만 뽑는다. 줄바꿈과 들여쓰기는 지운다.
function innerOf(dir, name) {
  const text = readFileSync(join(dir, `${name}.svg`), 'utf8');
  return text.match(/<svg[^>]*>([\s\S]*)<\/svg>/)[1].replace(/\s*\n\s*/g, '').replace(/\s+\/>/g, '/>');
}

const dir = process.argv[2];
const entries = NAMES.map((name) => `  '${name}': '${innerOf(dir, name)}',`).join('\n');
writeFileSync(OUT, `// 생성물, 손으로 고치지 않음. scripts/build-lucide.mjs가 lucide-static 1.52.0의 icons/*.svg에서 안쪽 도형만 옮긴 것이다(ISC, 같은 폴더의 LICENSE와 NOTICE).\n/** Lucide 조작 아이콘의 24 격자 도형. 이름은 Lucide 아이콘 이름이다. */\nexport const LUCIDE_ICONS = {\n${entries}\n};\n`);
