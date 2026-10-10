// 프레임이 바꿔 끼우는 표식의 이름. 값이 바뀌어도 이름이 변하지 않게 그리기가 직접 붙이고, 그림 구조를 정규식으로 읽어 이름을 짓지 않는다.
// 이름은 `계열:행번호`에서 온다. 같은 칸의 다른 요소는 뒤에 `.p`(무늬), `.ci`(신뢰구간), `.t`(글자), `.k`(번호)를 붙여 문서 안에서 하나뿐이게 한다.
// 계열이 없는 차트의 계열 자리는 `*`다. 표식은 값이 없거나 0이어도 모든 칸에 늘 있다. 값은 막대 길이, 보임 속성으로만 달라진다.
import { escapeXml } from '../text.js';

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 계열 i의 이름 자리 */
const seriesName =(chart, i) => chart.series[i]?.id ?? '*';

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 표식 이름: 계열 i와 행 key의 칸. suffix는 같은 칸의 다른 요소를 가른다. */
export const markId = (chart, i, key, suffix = '') => `${seriesName(chart, i)}:${key}${suffix}`;

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 원자료를 속성 글로. 값이 없으면 `-`다. */
const rawText = (raw) => (raw === null ? '-' : String(raw));

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/**
 * 요소의 표식 속성. `chart.markIds`가 참일 때만 붙는다(프레임을 만드는 쪽이 켠다). 거짓이면 빈 글이라 값에 묶이지 않은 차트는 속성이 늘지 않는다.
 * `data-raw`는 이 칸의 원자료다. 프레임 사이에서 원자료가 달라진 표식만 강조하고, 위치만 달라진 표식은 조용히 옮겨진다.
 * 원자료가 있는 표식은 갱신 효과를 받으므로 효과의 색도 함께 싣는다: `data-effect`(그 표식 계열의 effect 단계, 계열 테두리를 같은 색상에서 밝힌 값).
 * 효과는 표식의 모양을 덮는 겹침이고 계열 밖의 색(상태 파랑 등)을 쓰지 않아, 노랑 표식은 갱신 중에도 노랑 계열 안에서 밝아진다.
 * @param isText 글 요소(`data-mark-text`)인가
 * @param raw 원자료. 없으면(축, 선처럼 강조하지 않는 표식) `data-raw`를 붙이지 않는다
 * @param paint 표식의 범주 칠({ effect }). 원자료가 있으면 꼭 있어야 한다
 * @throws Error 원자료가 있는데 칠이 없을 때
 */
export function markAttrs(chart, id, { raw, isText = false, paint } = {}) {
  if (!chart.markIds) return '';
  if (raw !== undefined && !paint) throw new Error(`chart mark "${id}" has a raw value but no paint for its update effect`);
  const effect = raw === undefined ? '' : ` data-effect="${escapeXml(paint.effect)}"`;
  return ` ${isText ? 'data-mark-text' : 'data-mark'}="${escapeXml(id)}"${raw === undefined ? '' : ` data-raw="${escapeXml(rawText(raw))}"`}${effect}`;
}
