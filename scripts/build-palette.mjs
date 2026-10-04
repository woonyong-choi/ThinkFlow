// daphnis 그림 전용 팔레트 값(sky, slate의 면과 외곽선)을 계산해 토큰 정본(src/tokens.json)의 `color.palette.<색>` 층에 쓴다. 값의 출처는 scripts/lib/palette.mjs의 규칙이고 같은 정본에서 같은 값이 나온다.
// 파랑, 보라, 빨강, 초록, 주황 단계는 design-tokens가 계산하므로 여기서 만들지 않는다.
// 사용: node scripts/build-palette.mjs [tokens.json]   (기본 src/tokens.json). 쓴 뒤 `npm run tokens`로 tokens.css와 tokens.js를 다시 만든다.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { readCommonTokens } from './lib/design-tokens.mjs';
import { generatePalette } from './lib/palette.mjs';
import { readJson } from './lib/read-json.mjs';
import { serializeJson } from './lib/write-json.mjs';

const DEFAULT_SOURCE = 'src/tokens.json';

// cost: time O(s), heap O(t), stack O(d), io 4
// vars: s = 찾는 걸음 수, t = 토큰 수, d = 묶음 깊이
// basis: estimate
/** 팔레트를 만들어 정본에 쓴다. */
function main(argv) {
  const path = argv[0] ?? DEFAULT_SOURCE;
  const light = readJson(path);
  const palette = generatePalette(readCommonTokens(), { light, dark: readJson(join(dirname(path), 'tokens.dark.json')) });
  const layer = light.get('color').get('palette');
  for (const [name, steps] of Object.entries(palette)) {
    for (const [step, hex] of Object.entries(steps)) layer.get(name).get(step).set('$value', hex);
  }
  writeFileSync(path, serializeJson(light));
  return 0;
}

process.exit(main(process.argv.slice(2)));
