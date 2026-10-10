// 차트가 데이터 곁에 적는 글. 값이 없는 칸, 0, 단위처럼 값의 뜻을 바로 옆에서 밝히는 글만 있고 따로 풀어 쓰는 설명은 없다.

/** 값이 없는 칸 기본 글. 막대 차트는 `missing "글"`로 바꾼다. */
export const MISSING = '비교 없음';

export const COPY = {
  // 퍼센트 누적 막대의 행 합이 0이라 비율이 정의되지 않는 행
  zeroSum: '합계 0 · 비율 정의 불가',
  // 행 끝의 합계 글머리
  total: '합계',
  // 값 목록에서 결측인 칸
  dash: '−',
  // 누적분포에서 표본이 하나도 없는 계열의 범례 덧붙임
  noSample: '표본 없음',
  // 값이 하나도 없는 계열의 끝 이름 덧붙임. 값 0으로 읽히지 않게 이름 곁에서 밝힌다.
  noData: '값 없음',
  excluded: (count) => `결측 ${count}개 제외`,
};

/** 차트 글꼴 조각에 넣을 글자: 위 글에 쓰인 글자와 번호 키, 퍼센트 표기에 쓰이는 기호 */
export const COPY_CHARS = `${MISSING}${COPY.zeroSum}${COPY.total}${COPY.dash}${COPY.noSample}${COPY.noData}${COPY.excluded(0)}.:()%·`;
