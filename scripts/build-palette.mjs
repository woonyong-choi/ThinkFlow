// 같은 톤 팔레트를 만들어 토큰 정본(src/tokens.json)의 `color.palette.<색>` 층에 쓴다. 값의 출처는 scripts/lib/palette.mjs의 규칙이고 같은 정본에서 같은 값이 나온다.
// 사용: node scripts/build-palette.mjs [tokens.json]   (기본 src/tokens.json). 쓴 뒤 `npm run tokens`로 tokens.css와 tokens.js를 다시 만든다.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { generatePalette } from './lib/palette.mjs';
import { readJson } from './lib/read-json.mjs';
import { serializeJson } from './lib/write-json.mjs';

const DEFAULT_SOURCE = 'src/tokens.json';
const NOTE = '생성물, 손으로 고치지 않음. scripts/lib/palette.mjs의 원색 표(ANCHORS)에서 대비 규칙으로 계산한다. fill은 옅은 면, stroke는 그래픽(그림 면 위 대비 3 이상), ink는 글자(대비 4.5 이상)다';
// 생성하는 단계 이름. 손으로 정한 숫자 단계(blue.450, blue.700)는 두고 이 이름만 다시 쓴다.
const GENERATED_KEY = /^(light|dark)-/;
const GRAY_NOTE = 'gray 색. 같은 색상에서 채도만 낮췄다. ';

// cost: time O(h·f·s), heap O(h), stack O(1), io 3
// vars: h = 색 수, f = 면 수, s = 찾는 걸음 수
// basis: estimate
/** 팔레트를 만들어 정본에 쓴다. */
function main(argv) {
  const path = argv[0] ?? DEFAULT_SOURCE;
  const light = readJson(path);
  const palette = generatePalette(light, readJson(join(dirname(path), 'tokens.dark.json')));
  const layer = light.get('color').get('palette');
  for (const [name, steps] of Object.entries(palette)) {
    const group = layer.get(name) ?? new Map([['$description', `${name === 'slate' ? GRAY_NOTE : ''}${NOTE}`]]);
    for (const key of [...group.keys()]) if (GENERATED_KEY.test(key)) group.delete(key);
    for (const [step, hex] of Object.entries(steps)) group.set(step, new Map([['$value', hex]]));
    layer.set(name, group);
  }
  writeFileSync(path, serializeJson(light));
  return 0;
}

process.exit(main(process.argv.slice(2)));
