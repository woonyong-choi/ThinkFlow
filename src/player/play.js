// 브라우저에서 돈다. html.js가 HTML 안에 그대로 넣는다(src/player/ 파일을 이어 붙인다).
// 시간표의 박자 상태를 그대로 그린다. 상태를 다시 계산하지 않는다(docs/architecture.md 불변 조건).
// 이 파일은 재생기 본체다: 시작, 시계, 박자 이동, 설명 글. 역할별로 파일이 나뉜다: 단추와 탭과 진행 고리(controls.js), 그림 그리기(stage.js), 이동 곡선(curve.js), 전체 화면과 확대(view.js).

const PLAYER_RATES = [1, 2, 0.5];
// 설명 글이 바뀔 때 앞 글이 사라지고 뒤 글이 나타나는 각 시간(ms)을 담은 토큰 변수. 움직이는 SVG와 같은 토큰이다.
const CAPTION_FADE_VAR = '--duration-caption-fade';

// cost: time O(s + c) 시작, 프레임마다 O(h + k), heap O(s + c), stack O(1)
// vars: s = 도형 수, c = 선 수, h = 한 박자의 이동 수, k = 카드 있는 도형 수
// basis: estimate
/**
 * 재생기를 붙인다.
 * @param root `.fl-figure` 요소
 * @param data { segs, steps, cardCounts, edgeEnds, seriesCount, rowCount, metrics }
 */
function figurePlay(root, data) {
  const player = createPlayer(root, data);
  bindControls(root, player);
  highlightOnHover(player.stage);
  figureView(root, data.metrics);
  centerCanvas(root);
  setPlaying(player, player.clock.isPlaying);
  if (data.segs.length) {
    enterSegment(player, 0);
    requestAnimationFrame(player.tick);
  } else {
    // 시간 흐름이 없는 그림은 조작 막대를 숨긴다. 차트는 SVG 이미지처럼 되풀이해 자란다.
    root.querySelector('.fl-foot').hidden = true;
    player.stage.svg.classList.add('chart-loop');
  }
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 화면이 표준 캔버스 폭보다 좁으면 그림 영역이 가로로 스크롤된다. 내용이 캔버스보다 좁은 그림은 내용이 캔버스 가운데에 있으므로 가운데에서 시작하고(viewBox 왼쪽이 음수),
// 캔버스를 꽉 채우는 차트와 넓은 그림은 왼쪽 끝(이름과 축)에서 시작한다. 화면 크기가 바뀌어도 다시 맞춘다.
function centerCanvas(root) {
  const canvas = root.querySelector('.fl-canvas');
  const isCentered = root.querySelector('svg.fl').viewBox.baseVal.x < 0;
  const place = () => {
    canvas.scrollLeft = isCentered ? (canvas.scrollWidth - canvas.clientWidth) / 2 : 0;
  };
  place();
  addEventListener('resize', place);
}

// cost: time O(s + c), heap O(s + c), stack O(1)
// vars: s = 도형 수, c = 선 수
// basis: estimate
// 재생기 상태 한 덩어리. 시계, 그림, 탭, 고리, 설명 줄이 이 객체 하나로 이어진다.
function createPlayer(root, data) {
  const pauseButton = root.querySelector('.fl-pause');
  const player = {
    data,
    stage: createStage(root, data),
    clock: createClock(),
    stepSegs: data.steps.map((_, si) => data.segs.filter((s) => s.si === si)),
    hasCaption: data.segs.some((s) => s.caption),
    caption: root.querySelector('.fl-caption'),
    captionText: undefined,
    captionFade: undefined,
    pause: { button: pauseButton, icon: pauseButton.querySelector('.fl-pause-icon') },
    ring: createRing(pauseButton),
    tabs: [],
    tick: (now) => drawFrame(player, now),
  };
  player.tabs = createTabs(root.querySelector('.fl-tabs'), player);
  return player;
}

// ---- 시계 ----

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
function createClock() {
  return {
    index: 0,
    elapsed: 0,
    before: performance.now(),
    isPlaying: !matchMedia('(prefers-reduced-motion: reduce)').matches,
    rate: PLAYER_RATES[0],
  };
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
function nextRate(rate) {
  return PLAYER_RATES[(PLAYER_RATES.indexOf(rate) + 1) % PLAYER_RATES.length];
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 박자 seg가 속한 탭(step) 전체 시간 중 지금까지 지난 비율(0~1).
function tabProgress(player, seg) {
  const steps = player.stepSegs[seg.si];
  const start = steps[0].t0;
  const end = steps.at(-1).t1;
  return (seg.t0 - start + Math.min(player.clock.elapsed, seg.t1 - seg.t0)) / (end - start);
}

// cost: time O(h + k), heap O(1), stack O(1)
// vars: h = 박자의 이동 수, k = 카드가 바뀌는 도형 수
// basis: estimate
// 프레임마다 시계를 흘리고, 점과 카드를 옮기고, 재생 단추 고리를 채운다.
function drawFrame(player, now) {
  const { clock, data } = player;
  if (clock.isPlaying) clock.elapsed += (now - clock.before) * clock.rate;
  clock.before = now;
  const seg = data.segs[clock.index];
  advanceStage(player.stage, seg, clock.elapsed);
  player.ring.draw(tabProgress(player, seg));
  if (clock.elapsed >= seg.t1 - seg.t0) enterSegment(player, (clock.index + 1) % data.segs.length);
  requestAnimationFrame(player.tick);
}

// cost: time O(s + c + k + r), heap O(h), stack O(1)
// vars: s = 도형 수, c = 선 수, k = 카드 내용 수 합, r = 차트 행 수, h = 이동 수
// basis: estimate
// 박자 i로 들어간다. 시계를 0으로 돌리고 그림, 설명, 탭, 고리를 그 박자 상태로 맞춘다.
function enterSegment(player, i) {
  const { clock, data } = player;
  const seg = data.segs[i];
  clock.index = i;
  clock.elapsed = 0;
  drawSegmentState(player.stage, seg);
  showCaption(player, seg.caption);
  markTabs(player.tabs, seg.si);
  resetPackets(player.stage, seg);
  player.ring.draw(tabProgress(player, seg));
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 설명 글자 수
// basis: estimate
// 설명 글을 바꾼다. 앞 글이 다 사라진 뒤 뒤 글이 나타난다(순차 페이드). 같은 글이면 그대로 두고, 첫 글과 움직임 줄이기 설정에서는 바로 바꾼다.
function showCaption(player, text) {
  const { caption } = player;
  caption.hidden = !player.hasCaption;
  if (text === player.captionText) return;
  const isFirst = player.captionText === undefined;
  player.captionText = text;
  player.captionFade?.cancel();
  const fadeMs = parseFloat(getComputedStyle(caption).getPropertyValue(CAPTION_FADE_VAR));
  const fill = () => caption.replaceChildren(...richNodes(text, htmlCode));
  if (isFirst || !fadeMs || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    fill();
    return;
  }
  const out = caption.animate([{ opacity: getComputedStyle(caption).opacity }, { opacity: 0 }], { duration: fadeMs, fill: 'forwards' });
  player.captionFade = out;
  out.finished.then(() => {
    fill();
    player.captionFade = caption.animate([{ opacity: 0 }, { opacity: 1 }], { duration: fadeMs });
    out.cancel();
  }, () => {});
}
