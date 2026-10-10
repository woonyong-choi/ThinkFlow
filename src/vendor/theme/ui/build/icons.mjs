// 공통 카탈로그와 SVG 파일을 읽는 Node 진입점. 도형 해석과 렌더링은 ui/svg.mjs가 소유한다.
import { readFileSync } from 'node:fs';

const ROOT = new URL('../../assets/icons/', import.meta.url);
const FILE = /^[a-z][a-z0-9-]*\/[a-z0-9][a-z0-9-]*\.svg$/;
const files = new Map();
let catalog;

/** 카탈로그는 배포 사본 안에서 한 번 읽는다. */
export function getIconCatalog() {
  if (catalog) return catalog;
  const parsed = JSON.parse(readFileSync(new URL('catalog.json', ROOT), 'utf8'));
  if (parsed.version !== 2 || !parsed.icons || !parsed.aliases) throw new Error('unsupported icon catalog');
  catalog = parsed;
  return catalog;
}

/** 카탈로그 이름이나 별칭을 상대 파일 경로로 해석한다. detail이 없으면 기본 도형이다. */
export function iconFile(name, { variant = 'default' } = {}) {
  if (variant !== 'default' && variant !== 'detail') throw new Error(`unknown icon variant: ${variant}`);
  const { icons, aliases } = getIconCatalog();
  const target = Object.hasOwn(icons, name) ? name : aliases[name];
  if (typeof target !== 'string' || !Object.hasOwn(icons, target)) throw new Error(`unknown icon: ${name}`);
  const selected = variant === 'detail' && Object.hasOwn(icons, `${target}-detail`) ? `${target}-detail` : target;
  const file = icons[selected].file;
  if (typeof file !== 'string' || !FILE.test(file)) throw new Error(`invalid icon file: ${selected}`);
  return file;
}

/** 같은 파일의 SVG 글은 한 번 읽고, 삽입할 때 공통 SVG 함수가 내부 ID를 분리한다. */
export function readIcon(name, options) {
  const file = iconFile(name, options);
  if (!files.has(file)) files.set(file, readFileSync(new URL(file, ROOT), 'utf8'));
  return files.get(file);
}
