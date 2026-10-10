// 범주 색 도우미. 차트의 표식, 범례, 원·도넛이 함께 쓴다. 값은 모두 토큰에서 오고, 개수는 토큰에 기록된 판(revision)의 길이다.
// 계열(family)은 판이 정한 앞쪽 목록을 돌고, 한 바퀴를 돌 때마다 층(tier)이 오른다. 층 0은 단색 면이고 층 1부터 무늬가 달라진다. 점의 모양은 층과 상관없이 범주 번호마다 돌아서, 점만 있는 차트도 첫 바퀴 안에서 색 없이 구분된다.
// 색·무늬·모양 목록은 뒤에만 늘어난다. 늘어나면 `index % n`의 n이 바뀌어 기존 범주의 칠이 달라지므로, 판 하나가 세 목록의 앞쪽 개수를 고정한다. 기본은 언제나 1판이다.
// 색만으로 구분하지 않는다: 층 1부터와 경계가 대비 3에 못 미치는 계열은 `needsLabel`이 참이라 직접 라벨이나 범례가 있어야 한다.
import { tokens, values } from './vendor/theme/tokens.js';

/** 소스가 판을 고르지 않을 때 쓰는 판. 최신 판이 아니다. */
export const BASE_REVISION = 1;
// 1판의 앞 네 계열은 Things 공식 사이트 기능 아이콘의 solid 면색 그대로라 바뀌지 않는다. 네이티브 앱의 모든 역할이 같은 색이라는 뜻은 아니다.
const FIRST_FAMILIES = ['blue', 'yellow', 'red', 'green'];
const COUNTS = ['family', 'pattern', 'shape'];

const orderedKeys = (group) => Object.keys(group).sort((a, b) => a - b);
const listOf = (group) => orderedKeys(group).map((key) => group[key]);

// cost: time O(r·log r), heap O(r), stack O(1)
// vars: r = 기록된 판 수
// basis: estimate
/**
 * 토큰의 판 목록(번호 순서). 판은 `{ revision, family, pattern, shape, step }`이고 세 개수는 각 목록의 앞에서부터 쓰는 개수, step은 무늬 간격 배율이다.
 * 번호가 1부터 빈칸 없이 이어지지 않거나, 개수가 줄거나 목록 길이를 넘거나, 최신 판이 목록 전체를 덮지 않거나, 앞 네 계열이 blue, yellow, red, green이 아니면 던진다.
 */
export function readRevisions({ raw = values.color.data } = {}) {
  const lengths = { family: Object.keys(raw['category-family']).length, pattern: Object.keys(raw['category-pattern']).length, shape: Object.keys(raw['category-shape']).length };
  const revisions = orderedKeys(raw['category-revision'] ?? {}).map((key) => {
    const entry = raw['category-revision'][key];
    return { revision: Number(key), family: entry.family, pattern: entry.pattern, shape: entry.shape, step: entry.step };
  });
  if (!revisions.length) throw new RangeError('category-revision needs revision 1');
  revisions.forEach((entry, index) => {
    const at = `category-revision ${entry.revision}`;
    if (entry.revision !== index + 1) throw new RangeError(`${at}: numbers must run 1..n without gaps`);
    for (const name of COUNTS) {
      if (!Number.isInteger(entry[name]) || entry[name] < 1) throw new RangeError(`${at}: ${name} must be a whole number of 1 or more`);
      if (entry[name] > lengths[name]) throw new RangeError(`${at}: ${name} exceeds the recorded list`);
      if (index && entry[name] < revisions[index - 1][name]) throw new RangeError(`${at}: ${name} is smaller than in revision ${index}`);
    }
    if (!(typeof entry.step === 'number' && entry.step > 0)) throw new RangeError(`${at}: step must be a positive number`);
  });
  const latest = revisions.at(-1);
  if (COUNTS.some((name) => latest[name] !== lengths[name])) throw new RangeError(`category-revision ${latest.revision}: the latest revision must cover every recorded entry`);
  const families = listOf(raw['category-family']);
  if (revisions[0].family < FIRST_FAMILIES.length || FIRST_FAMILIES.some((name, index) => families[index] !== name)) throw new RangeError(`the first families must be ${FIRST_FAMILIES.join(', ')}`);
  return revisions;
}

// cost: time O(r·log r), heap O(r), stack O(1)
// vars: r = 기록된 판 수
// basis: estimate
const revisionOf = (raw, revision) => {
  const found = Number.isInteger(revision) ? readRevisions({ raw }).find((entry) => entry.revision === revision) : undefined;
  if (!found) throw new RangeError(`unknown palette revision: ${revision}`);
  return found;
};

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 판이 쓰는 계열 수
// basis: estimate
/** 판이 쓰는 앞쪽 계열 목록(토큰의 번호 순서). 칸은 `{ family, fill, border, on, ink, effect, tint, needsLabel }`이고 색은 `var(--…)` 참조다. effect는 갱신 효과의 한 단계(그 계열 테두리를 같은 색상에서 밝힌 값)다. 판을 생략하면 1판이다. */
export function readPalette({ ref = tokens.color.data, raw = values.color.data, revision = BASE_REVISION } = {}) {
  return orderedKeys(raw['category-family']).slice(0, revisionOf(raw, revision).family).map((key) => ({
    family: raw['category-family'][key],
    fill: ref.category[key],
    area: ref['category-area'][key],
    onArea: ref['category-on-area'][key],
    border: ref['category-outline'][key],
    on: ref['category-on'][key],
    ink: ref['category-ink'][key],
    effect: ref['category-effect'][key],
    tint: ref['category-tint'][key],
    needsLabel: raw['category-label'][key] === 'required',
  }));
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 판이 쓰는 무늬·모양 수
// basis: estimate
/** 판이 쓰는 앞쪽 무늬 목록, 모양 목록, 무늬 목록을 한 바퀴 돌 때마다 넓히는 간격 배율. 토큰의 번호 순서 그대로다(무작위 없음). 판을 생략하면 1판이다. */
export function readTiers({ raw = values.color.data, revision = BASE_REVISION } = {}) {
  const { pattern, shape, step } = revisionOf(raw, revision);
  return {
    patterns: listOf(raw['category-pattern']).slice(0, pattern),
    shapes: listOf(raw['category-shape']).slice(0, shape),
    step,
  };
}

// cost: time O(r·n), heap O(r·n), stack O(1)
// vars: r = 판 수, n = 판이 쓰는 목록 길이
// basis: estimate
/** 판 번호에서 `{ revision, palette, tiers }`로 가는 얼린 표. 새 판을 읽을 때 한 번 만들고 다시 바뀌지 않는다. */
export function readSnapshots({ ref = tokens.color.data, raw = values.color.data } = {}) {
  const frozen = (list) => Object.freeze(list.map((entry) => (entry && typeof entry === 'object' ? Object.freeze(entry) : entry)));
  return Object.freeze(Object.fromEntries(readRevisions({ raw }).map(({ revision }) => {
    const tiers = readTiers({ raw, revision });
    const snapshot = { revision, palette: frozen(readPalette({ ref, raw, revision })), tiers: Object.freeze({ ...tiers, patterns: frozen(tiers.patterns), shapes: frozen(tiers.shapes) }) };
    return [revision, Object.freeze(snapshot)];
  })));
}

export const SNAPSHOTS = readSnapshots();
/** 1판의 계열과 층 목록. 기본 칠이다. */
export const PALETTE = SNAPSHOTS[BASE_REVISION].palette;
export const TIERS = SNAPSHOTS[BASE_REVISION].tiers;

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/**
 * 범주 번호(0부터)의 색과 구분 방법.
 * @param index 범주 번호. 상한이 없다
 * @param options { revision, snapshots, palette, tiers }. revision은 판 번호이며 생략하면 최신 판이 아니라 1판이다. snapshots는 다른 토큰 표(시험)이고, palette·tiers는 판의 목록을 덮어쓴다
 * @returns { index, revision, tier, family, fill, border, on, ink, tint, pattern, spacing, shape, needsLabel }. pattern은 층 0에서 'solid', spacing은 무늬 간격 배율이다
 */
export function categoryPaint(index, { revision = BASE_REVISION, snapshots = SNAPSHOTS, palette, tiers } = {}) {
  if (!Number.isInteger(index) || index < 0) throw new RangeError(`category index must be a non-negative integer: ${index}`);
  const snapshot = Number.isInteger(revision) && Object.hasOwn(snapshots, revision) ? snapshots[revision] : undefined;
  if (!snapshot) throw new RangeError(`unknown palette revision: ${revision}`);
  const colors = palette ?? snapshot.palette;
  const { patterns, shapes, step } = tiers ?? snapshot.tiers;
  if (!colors.length) throw new RangeError('the category palette is empty');
  const tier = Math.floor(index / colors.length);
  const family = colors[index % colors.length];
  const cycle = tier === 0 ? 0 : Math.floor((tier - 1) / patterns.length);
  return {
    index,
    revision,
    tier,
    ...family,
    pattern: tier === 0 ? 'solid' : patterns[(tier - 1) % patterns.length],
    spacing: 1 + step * cycle,
    shape: shapes[index % shapes.length],
    needsLabel: family.needsLabel || tier > 0,
  };
}

/** 넓은 데이터 면과 그 위 글·무늬의 칠. 작은 의미 표식의 원색과 계열 순서는 categoryPaint가 그대로 소유한다. */
export function areaPaint(index, options) {
  const paint = categoryPaint(index, options);
  return { ...paint, fill: paint.area, on: paint.onArea };
}
