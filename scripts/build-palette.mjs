// 가져온 그림 전용 팔레트가 scripts/lib/palette.mjs의 계산 규칙과 같은지 검사한다.
// 파랑, 보라, 빨강, 초록, 주황 단계는 design-tokens가 계산하므로 여기서 만들지 않는다.
// 사용: node scripts/build-palette.mjs [tokens.json] (기본 src/tokens.json). 변경은 공통 정본에서 한다.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { readCommonTokens } from './lib/design-tokens.mjs';
import { generatePalette } from './lib/palette.mjs';
import { readJson } from './lib/read-json.mjs';
import { serializeJson } from './lib/write-json.mjs';

const DEFAULT_SOURCE = 'src/tokens.json';

// cost: time O(s), heap O(t), stack O(d), io 4
// vars: s = 찾는 걸음 수, t = 토큰 수, d = 묶음 깊이
// basis: estimate
/** 가져온 팔레트가 계산 규칙과 같은지 검사한다. 소비자 정본은 수정하지 않는다. */
function main(argv) {
  const path = argv[0] ?? DEFAULT_SOURCE;
  const light = readJson(path);
  const palette = generatePalette(readCommonTokens(), { light, dark: readJson(join(dirname(path), 'tokens.dark.json')) });
  const layer = light.get('color').get('palette');
  for (const [name, steps] of Object.entries(palette)) {
    for (const [step, hex] of Object.entries(steps)) layer.get(name).get(step).set('$value', hex);
  }
  if (serializeJson(light) !== readFileSync(path, 'utf8')) throw new Error('imported palette is stale: regenerate it in design-tokens and sync the technical theme');
  return 0;
}

process.exit(main(process.argv.slice(2)));
