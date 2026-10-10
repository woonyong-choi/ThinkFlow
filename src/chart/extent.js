// 값에 묶인 차트가 모든 프레임에서 같은 축을 쓰게 하는 값 범위. 프레임마다 가질 수 있는 모든 행 목록에서 구한다.
// 누적 막대는 양수 합과 음수 합 양쪽을, 퍼센트는 0~100을, 누적분포는 0~1을 고정한다. 그 밖의 종류는 모든 값의 최솟값과 최댓값이다.
import { isValue, stackExtent } from './data.js';

// 행 값이 아닌 키. 가로 위치, 계열 이름, 행 기준이다.
const NOT_VALUE = new Set(['x', 'series', 'rule']);

// cost: time O(n), heap O(1), stack O(1)
// vars: n = 값 수
// basis: estimate
/**
 * 숫자 목록의 값 범위. 값이 하나도 없으면(모두 빠짐) 틀과 축만 그릴 대체 범위이고 `empty`가 참이다:
 * 선형 0~0(눈금 0, 1), 로그 1~10. 대체 범위는 축만 정하고 어떤 표식에도 값 0을 주지 않는다. 축 범위를 고르는 모든 차트가 같은 규칙을 쓴다.
 * @param kind 'linear' | 'log'
 * @returns { min, max } 또는 값이 없으면 { min, max, empty: true }
 */
export function valueRange(numbers, kind = 'linear') {
  if (!numbers.length) return kind === 'log' ? { min: 1, max: 10, empty: true } : { min: 0, max: 0, empty: true };
  return { min: Math.min(...numbers), max: Math.max(...numbers) };
}

// cost: time O(f·r·s), heap O(1), stack O(1)
// vars: f = 프레임 수, r = 행 수, s = 계열 수
// basis: estimate
/**
 * @param chartType 차트 종류
 * @param ids 계열 id 목록
 * @param framesRows 프레임마다의 행 목록(`{ values }[]`). 처음 값, 값이 가질 글 하나씩을 넣은 값 모두를 포함한다
 * @param kind 값 축 종류('linear' | 'log'). 값이 하나도 없을 때의 대체 범위를 정한다
 * @returns { min, max, empty? }. 값이 하나도 없으면 valueRange의 대체 범위다
 */
export function extentOfFrames(chartType, ids, framesRows, kind = 'linear') {
  if (chartType === 'percent') return { min: 0, max: 100 };
  if (chartType === 'ecdf') return { min: 0, max: 1 };
  if (chartType === 'stacked') {
    const extents = framesRows.map((rows) => stackExtent(rows, ids));
    return { min: Math.min(...extents.map((e) => e.min)), max: Math.max(...extents.map((e) => e.max)) };
  }
  const numbers = framesRows.flatMap((rows) => rows.flatMap((row) => Object.entries(row.values).filter(([key, v]) => !NOT_VALUE.has(key) && isValue(v)).map(([, v]) => v)));
  return valueRange(numbers, kind);
}
