// 그림 검사 항목 목록. 번호, 진단 code, 등급, 설명은 여기 한 곳에 선언하고, 판정 함수는 항목 파일에 따로 둔다.
// docs/design/figure-check.md의 "검사 항목" 표가 이 목록과 같아야 하고, 어긋나면 테스트가 실패한다. 표는 `npm run checkdoc`으로 다시 쓴다.
import { checkEnds, checkCrowding, checkThrough } from './edges.js';
import { checkChartFits, checkFits } from './fit.js';
import { checkFlow } from './flow.js';
import { checkChips } from './moving.js';
import { checkNotes } from './notes.js';
import { checkChartLabels, checkLabels, checkNodes, checkTitleLines } from './overlap.js';
import { checkAspect, checkReadable } from './proportion.js';

/**
 * 항목마다 { number, code, severity, title, criterion, judge?, judgeChart?, kinds?, stage }.
 * severity는 이 항목이 내는 등급 목록('error', 'warning')이다.
 * stage는 판정하는 때다. 'scene'은 배치가 끝난 장면(judge, 순서대로 돈다), 'source'는 원본을 읽는 때(src/source/validate.js)다.
 * judgeChart는 차트에 쓰는 판정이고, kinds가 있으면 그 종류의 그림에만 judge를 돌린다.
 * judge는 (context, problems)를 받는다. context는 { figure, scene, timeline, boxes, edges, pills, titles, family }다.
 */
export const CHECKS = [
  { number: 1, code: 'check-1', severity: ['error'], stage: 'scene', judge: checkFits, judgeChart: checkChartFits, title: '글이 도형, 카드, 알약, 글 상자, 차트 이름 칸 안에 들어간다', criterion: '잰 글 폭과 줄 수가 칸의 안쪽 크기 이하' },
  { number: 2, code: 'check-2', severity: ['error'], stage: 'scene', judge: checkLabels, judgeChart: checkChartLabels, title: '글끼리 겹치지 않는다', criterion: '선 라벨, 그룹 제목, 도형 사각형(이름과 카드를 품음)끼리 겹친 넓이 0. 산점도 점 이름은 [차트](charts.md)가 위아래와 좌우로 비켜 놓은 뒤에도 서로 겹친 넓이 0' },
  { number: 3, code: 'check-3', severity: ['error'], stage: 'scene', judge: checkThrough, title: '선이 끝 도형이 아닌 도형과 격자 칸을 지나지 않는다', criterion: '경로 선분이 다른 도형과 그룹 사각형 안쪽을 지나지 않음. 선 끝이거나 선 끝을 품은 그룹(그 선이 드나드는 그룹)은 제외. 끝 격자 안에서도 어느 칸(빈 자리 제외)의 안쪽도 지나지 않음' },
  { number: 4, code: 'check-4', severity: ['error'], stage: 'scene', judge: checkEnds, title: '선 끝이 연결점 규칙 자리에 있다', criterion: '[배치](layout.md)의 도형별 연결점 규칙과 0.5 이내로 일치. 격자 칸 끝은 그 칸의 테두리' },
  { number: 5, code: 'check-5', severity: ['error'], stage: 'scene', judge: checkCrowding, title: '나란한 두 선이 붙지 않는다', criterion: '다른 두 선의 나란한 선분 사이가 토큰 `space.2-5` 이상. 같은 도형에서 함께 나가거나 함께 들어오는 두 선은 그 도형 쪽 끝 선분(경계에서 첫 꺾임까지)을 보지 않는다' },
  { number: 6, code: 'check-6', severity: ['error'], stage: 'scene', judge: checkNodes, title: '도형끼리 겹치지 않는다', criterion: '도형과 그룹 사각형끼리 겹친 넓이 0. 그룹과 그 안의 도형, 그룹과 그 안의 그룹은 제외' },
  { number: 7, code: 'check-7', severity: ['error', 'warning'], stage: 'scene', judge: checkChips, title: '글 상자가 그림 안에 있고 이름을 가리지 않는다', criterion: '이동의 계획 지점(2프레임 간격)마다 정한 글 상자([재생](playback.md) 자리 규칙)가 그림 경계 안이면 통과한다. 점 위아래 어디에도 들어가지 않으면 오류. 글 상자가 그림보다 넓은 경우는 [배치](layout.md)가 그림을 넓혀서 생기지 않는다. 자리 규칙대로 점 위, 아래, 옆으로 비켜도 도형 이름, 부제, 테이블 열, 그룹 제목을 가리면 경고. 박자 이동은 붙임 거리 안에 자리가 없어 선 라벨 알약이나 이동의 25% 넘는 숨김이 남아도 경고. 흐름의 글 상자는 도형 이름을 가려 점이 보이는 시간(도형 안을 지나는 구간 제외)의 25% 넘게 숨어도 경고(선 틈보다 넓은 글 상자. 배치가 그 선의 간격을 늘려 다시 배치한 뒤에도 남을 때만). 보이는 글 상자끼리 겹쳐도 경고(흐름과 `&` 동시 이동은 나중에 출발한 점의 글 상자가 숨어 겹치지 않는다)' },
  { number: 8, code: 'check-8', severity: ['warning'], stage: 'source', title: '같은 글이 두 번 보이지 않는다', criterion: '이동 글 상자 글과 그 선 라벨이 같은 경우' },
  { number: 9, code: 'check-9', severity: ['warning'], stage: 'scene', judge: checkAspect, kinds: ['flow', 'state', 'data'], title: '그림 비율', criterion: '보이는 가로세로 비율(가로는 내용 폭과 캔버스 폭 중 큰 쪽)이 3 초과 또는 1/3 미만. 가로세로가 모두 캔버스 폭 이하인 그림은 제외' },
  { number: 10, code: 'check-10', severity: ['warning'], stage: 'scene', judge: checkReadable, title: '문서 폭에서 읽힘', criterion: '그림을 캔버스 폭(표준 `size.figure-canvas`, `width wide`면 `size.figure-canvas-wide`)으로 줄였을 때 가장 작은 글이 가장 작은 글 토큰(`size.text`의 최솟값, 9px) 미만. 내용이 캔버스보다 넓으면 줄이는 비율이 곧 글자 비율이다' },
  { number: 11, code: 'check-11', severity: ['warning'], stage: 'source', title: '쓰지 않는 조용한 선', criterion: '시간 흐름에서 한 번도 지나지 않는 `quiet` 선' },
  { number: 12, code: 'check-12', severity: ['error', 'warning'], stage: 'scene', judge: checkNotes, title: '순서 그림 메모가 겹치지 않는다', criterion: '메모가 그림 안에 있고 같은 행 메시지의 화살표와 라벨을 가리지 않으면 통과한다(오류). 다른 참여자의 생명선에 걸치면 경고' },
  { number: 13, code: 'check-13', severity: ['error'], stage: 'scene', judge: checkTitleLines, title: '선이 그룹 제목 줄을 지나지 않는다', criterion: '경로 선분이 그룹 제목 줄(제목 글, 아이콘, 배지를 감싼 사각형) 안쪽을 지나지 않음' },
  { number: 14, code: 'check-14', severity: ['error', 'warning'], stage: 'scene', judge: checkFlow, kinds: ['flow'], title: '흐름이 점을 그리고 점 수와 값 글자가 상한 안에 있다', criterion: '흐름마다 점이 하나 이상 그려지면 통과한다(단계 끝까지 도착하지 못하면 오류). 한 그림의 점이 토큰 `scale.flow-dots-max` 이하이고(초과하면 경고). 출발 수를 `for`와 `every`에서 미리 세어 그림 전체가 `scale.flow-dots-max`의 열 배를 넘으면 시간표를 만들기 전에 오류다. 값이 바뀌어 간 글자가 8자 이하다(초과하면 오류)' },
];
