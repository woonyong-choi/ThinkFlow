// README 로고 PNG(라이트, 다크)를 탭 아이콘 크기로 줄인 PNG를 만든다. 생성 HTML은 이 작은 PNG를 내장한다.
// 사용: node scripts/build-favicon.mjs [--check]   --check는 쓰지 않고, 로고에서 다시 줄인 화소와 다른 파일이 있으면 알리고 1로 끝낸다.
// 압축 바이트는 zlib 구현마다 다를 수 있으므로 --check는 풀어 낸 화소를 비교한다.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';

const ASSETS = new URL('../docs/assets/', import.meta.url);
const SOURCES = new URL('sources.json', ASSETS);
export const FAVICON_SIZE = 64;
export const FAVICONS = [
  { logo: 'torso-logo.png', icon: 'torso-favicon.png' },
  { logo: 'torso-logo-dark.png', icon: 'torso-favicon-dark.png' },
];
const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const RGBA = 4;
const RGBA_COLOR_TYPE = 6;
const BIT_DEPTH = 8;

// cost: time O(b), heap O(b), stack O(1)
// vars: b = PNG 바이트 수
// basis: estimate
// 8비트 RGBA, 비월 없는 PNG를 화소 배열로 푼다. 다른 형식은 오류다.
export function decodePng(bytes) {
  if (!bytes.subarray(0, SIGNATURE.length).equals(SIGNATURE)) throw new Error('not a PNG file');
  let width = 0;
  let height = 0;
  const data = [];
  for (let at = SIGNATURE.length; at < bytes.length;) {
    const length = bytes.readUInt32BE(at);
    const type = bytes.toString('latin1', at + 4, at + 8);
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      if (body[8] !== BIT_DEPTH || body[9] !== RGBA_COLOR_TYPE || body[12] !== 0) throw new Error('only 8-bit RGBA non-interlaced PNG is supported');
    } else if (type === 'IDAT') data.push(body);
    at += length + 12;
  }
  return { width, height, pixels: unfilter(inflateSync(Buffer.concat(data)), width, height) };
}

// cost: time O(w·h), heap O(w·h), stack O(1)
// vars: w, h = 그림 폭과 높이
// basis: estimate
// PNG 줄 필터(없음, 왼쪽, 위, 평균, Paeth)를 되돌린다.
function unfilter(raw, width, height) {
  const stride = width * RGBA;
  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const left = x >= RGBA ? out[y * stride + x - RGBA] : 0;
      const up = y > 0 ? out[(y - 1) * stride + x] : 0;
      const corner = x >= RGBA && y > 0 ? out[(y - 1) * stride + x - RGBA] : 0;
      out[y * stride + x] = (line[x] + predict(filter, left, up, corner)) & 0xff;
    }
  }
  return out;
}

// cost: time O(1), heap O(1), stack O(1)
// vars: 필터 번호 하나
// basis: estimate
function predict(filter, left, up, corner) {
  if (filter === 0) return 0;
  if (filter === 1) return left;
  if (filter === 2) return up;
  if (filter === 3) return (left + up) >> 1;
  if (filter !== 4) throw new Error(`unknown PNG filter ${filter}`);
  const p = left + up - corner;
  const [pa, pb, pc] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - corner)];
  return pa <= pb && pa <= pc ? left : pb <= pc ? up : corner;
}

// cost: time O(w·h), heap O(s²), stack O(1)
// vars: w, h = 원본 폭과 높이, s = 결과 한 변
// basis: estimate
// 정사각형 결과의 각 화소가 덮는 원본 영역을 면적 가중 평균한다. 투명 가장자리가 어두워지지 않도록 알파를 곱해 평균한다.
export function shrink({ width, height, pixels }, size) {
  const sum = new Float64Array(size * size * RGBA);
  const area = new Float64Array(size * size);
  const spans = (length) => Array.from({ length }, (_, i) => cover(i, length, size));
  const columns = spans(width);
  const rows = spans(height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * RGBA;
      const alpha = pixels[at + 3] / 255;
      for (const [ty, wy] of rows[y]) {
        for (const [tx, wx] of columns[x]) {
          const weight = wy * wx;
          const target = ty * size + tx;
          area[target] += weight;
          for (let c = 0; c < 3; c++) sum[target * RGBA + c] += pixels[at + c] * alpha * weight;
          sum[target * RGBA + 3] += alpha * weight;
        }
      }
    }
  }
  const out = Buffer.alloc(size * size * RGBA);
  for (let target = 0; target < size * size; target++) {
    const alpha = sum[target * RGBA + 3];
    for (let c = 0; c < 3; c++) out[target * RGBA + c] = alpha > 0 ? Math.round(sum[target * RGBA + c] / alpha) : 0;
    out[target * RGBA + 3] = Math.round((alpha / area[target]) * 255);
  }
  return out;
}

// cost: time O(1), heap O(1), stack O(1)
// vars: 원본 한 칸이 걸치는 결과 칸은 둘 이하
// basis: estimate
// 원본 i번째 칸이 결과 칸들과 겹치는 길이(결과 칸 단위). 원본이 결과보다 크다고 본다.
function cover(i, length, size) {
  const start = (i * size) / length;
  const end = ((i + 1) * size) / length;
  const first = Math.floor(start);
  const last = Math.min(size - 1, Math.ceil(end) - 1);
  if (first === last) return [[first, end - start]];
  return [[first, first + 1 - start], [last, end - last]];
}

// cost: time O(s²), heap O(s²), stack O(1)
// vars: s = 한 변
// basis: estimate
export function encodePng(pixels, size) {
  const stride = size * RGBA;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([BIT_DEPTH, RGBA_COLOR_TYPE, 0, 0, 0], 8);
  return Buffer.concat([SIGNATURE, chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// cost: time O(b), heap O(b), stack O(1)
// vars: b = 덩어리 바이트 수
// basis: estimate
function chunk(type, body) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, crc]);
}

// cost: time O(b), heap O(1), stack O(1)
// vars: b = 바이트 수
// basis: estimate
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// cost: time O(w·h), heap O(w·h), stack O(1), io 1
// vars: w, h = 로고 폭과 높이
// basis: estimate
/** 로고 파일 이름에서 탭 아이콘 화소를 만든다. */
export function faviconPixels(logo) {
  return shrink(decodePng(readFileSync(new URL(logo, ASSETS))), FAVICON_SIZE);
}

// cost: time O(w·h), heap O(w·h), stack O(1), io 4
// vars: w, h = 로고 폭과 높이
// basis: measured node scripts/build-favicon.mjs
function main() {
  const check = process.argv.includes('--check');
  const sources = JSON.parse(readFileSync(SOURCES, 'utf8'));
  const stale = [];
  for (const { logo, icon } of FAVICONS) {
    const pixels = faviconPixels(logo);
    const path = new URL(icon, ASSETS);
    if (check) {
      let current;
      try { current = decodePng(readFileSync(path)).pixels; } catch { current = undefined; }
      if (!current?.equals(pixels)) stale.push(icon);
      continue;
    }
    const bytes = encodePng(pixels, FAVICON_SIZE);
    writeFileSync(path, bytes);
    const entry = sources.find((source) => source.file === `docs/assets/${icon}`);
    const record = { file: `docs/assets/${icon}`, origin: 'project-original', license: 'MIT', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    if (entry) Object.assign(entry, record);
    else sources.push(record);
  }
  if (check) {
    if (stale.length) console.log(`favicon differs from the logo; run node scripts/build-favicon.mjs: ${stale.join(', ')}`);
    return stale.length ? 1 : 0;
  }
  writeFileSync(SOURCES, `${JSON.stringify(sources, null, 2)}\n`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = main();
