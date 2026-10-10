// 브라우저에서 돈다. html.js가 HTML 안에 그대로 넣는다(src/player/ 파일을 이어 붙인다).
// 시간표를 그대로 그린다. 상태를 다시 계산하지 않는다(docs/architecture.md 불변 조건).
// 이 파일은 재생기 본체다: 시작, 시계, 장면 들어가기. 역할별로 파일이 나뉜다: 시각마다의 모습(sample.js), 탭(controls.js), 그림 그리기(stage.js, values.js), 이동 곡선(curve.js), 도구 막대와 전체 화면과 확대(view.js), 문법 복사와 HTML 다운로드(export.js).
// 시계는 장면에 들어선 뒤 흐른 표시 시각 하나(clock.elapsed)다. 프레임 사이에 시간을 자르거나 버리지 않고 시작 기준 시각에서 바로 재므로 어긋남이 쌓이지 않는다.

const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)');

/**
 * 재생기를 붙인다.
 * @param root `.fl-figure` 요소
 * @param data html/content.js가 만든 재생 데이터. steps는 { label, mode, speed } 객체이고 mode는 static, once, loop, speed는 양수다. 다르면 오류다.
 */
function figurePlay(root, data) {
  const player = createPlayer(root, data);
  if (document.documentElement.classList.contains('embedded')) fitEmbedded(root, data);
  figureView(root, data, bindResponsiveScene(root, player));
  document.addEventListener('visibilitychange', () => syncClock(player));
  REDUCED_MOTION.addEventListener('change', () => REDUCED_MOTION.matches && settleScene(player));
  // 시간 흐름이 없는 그림은 다 자란 모양 그대로 움직이지 않고 탭도 없다(도구 막대는 쓸 수 있다). 장면이 하나뿐이어도 탭이 없다.
  root.querySelector('.fl-foot').hidden = !data.segs.length || player.scenes.length < 2;
  if (data.segs.length) enterScene(player, 0);
}

// 본문에 삽입된 재생기(iframe)는 본문 폭에 맞춰 줄이되 원래 크기보다 키우지 않는다. 판이 하나뿐인 그림은 둘레 여백을 걷은 보기 영역(tight)으로 맞춘다.
// 판이 여럿이면 판 상자가 서로 이어 붙어 있어 여백을 걷지 않고 장면 폭을 그대로 쓴다.
function fitEmbedded(root, data) {
  const panels = root.querySelector('.dp-panels');
  const svgs = panels.querySelectorAll('svg.fl');
  const { tight } = data;
  const isTight = svgs.length === 1 && tight;
  if (isTight) {
    svgs[0].setAttribute('viewBox', `${tight.x} ${tight.y} ${tight.w} ${tight.h}`);
    svgs[0].style.aspectRatio = `${tight.w} / ${tight.h}`;
    svgs[0].parentElement.style.setProperty('--panel-w', tight.w);
  }
  const width = isTight ? tight.w : data.width;
  panels.style.setProperty('--view-w', width);
  panels.style.maxWidth = `${width}px`;
}

// 재생기 상태 한 덩어리. 시계, 그림, 장면 모델, 탭이 이 객체 하나로 이어진다. 장면 모델은 데이터에서 만들고, 좁은 배치로 바뀌면 그 배치의 데이터로 다시 만든다.
function createPlayer(root, data) {
  const scenes = data.segs.length ? buildScenes(data) : [];
  const player = {
    data,
    scenes,
    scene: -1,
    frame: undefined,
    stage: createStage(root, data),
    clock: createClock(),
    tabs: [],
    // 다음 프레임 요청(없으면 undefined). 시계가 흐르는 동안에만 요청하고, 멈춘 모습(정지, 한 번이 끝남, 길이 0, 가려짐)은 프레임을 요청하지 않는다.
    request: undefined,
    tick: (now) => drawFrame(player, now),
  };
  player.tabs = bindTabs(root.querySelector('.app-tablist'), (si) => selectScene(player, si));
  return player;
}

// ---- 시계 ----

/**
 * elapsed는 장면에 들어선 뒤 흐른 표시 시각(ms)이다. anchor는 흐르는 동안 `프레임 시각 - elapsed`이고, 없으면 다음 프레임의 시각이 기준이 된다(들어올 때, 다시 보일 때).
 * isPlaying은 시계가 지금 흐르는지, wantsPlay는 장면이 재생을 원하는지다. 문서가 가려지면 isPlaying만 꺼지고 다시 보이면 멈춘 자리에서 이어진다. ended는 마지막 모습에서 멈췄는지다.
 */
function createClock() {
  return { elapsed: 0, anchor: undefined, isPlaying: false, wantsPlay: false, ended: false };
}

// 프레임마다 시계를 프레임 시각에 맞추고 그 순간의 모습을 그린다. 한 번 장면은 표시 길이가 끝나면 마지막 모습에서 멈추고 더는 프레임을 요청하지 않는다.
function drawFrame(player, now) {
  const { clock } = player;
  player.request = undefined;
  if (clock.isPlaying) {
    clock.anchor ??= now - clock.elapsed;
    clock.elapsed = now - clock.anchor;
    renderScene(player);
    if (player.scenes[player.scene].mode === 'once' && clock.elapsed >= player.scenes[player.scene].presentationMs) settleScene(player);
  }
  requestFrame(player);
}

// 시계가 흐를 때만 다음 프레임을 요청한다. 이미 요청했으면 겹쳐 요청하지 않는다.
function requestFrame(player) {
  if (player.clock.isPlaying && player.request === undefined) player.request = requestAnimationFrame(player.tick);
}

// 문서가 가려지면 시계를 멈추고, 다시 보이면 멈춘 자리에서 잇는다.
function syncClock(player) {
  const { clock } = player;
  const wasPlaying = clock.isPlaying;
  clock.isPlaying = clock.wantsPlay && !document.hidden;
  if (clock.isPlaying && !wasPlaying) clock.anchor = undefined;
  requestFrame(player);
}

// 지금 시계의 모습을 그린다. 같은 시각이면 몇 번을 그려도, 어떤 시각을 거쳐 왔어도 같은 그림이다.
function renderScene(player) {
  player.frame = sampleScene(player.scenes[player.scene], player.data, player.clock.elapsed, player.clock.ended);
  paintFrame(player.stage, player.data, player.frame);
}

// ---- 장면 ----

// 장면 si로 들어간다. 언제나 시간 0, 처음 값에서 시작한다. 정지 장면과 움직임 줄이기는 곧바로 마지막 모습이고, 나머지는 곧바로 재생을 시작한다.
function enterScene(player, si) {
  const { clock } = player;
  player.scene = si;
  player.tabs.select(si);
  player.tabs.buttons[si].ownerDocument.getElementById('scene-panel').setAttribute('aria-labelledby', player.tabs.buttons[si].id);
  clock.elapsed = 0;
  clock.anchor = undefined;
  clock.ended = false;
  // 표시 길이가 0인 장면(움직임도 효과도 없는 장면)은 흘릴 시간이 없어 곧바로 마지막 모습이다. 진행률을 길이로 나누지 않는다.
  clock.wantsPlay = player.scenes[si].mode !== 'static' && !REDUCED_MOTION.matches && player.scenes[si].presentationMs > 0;
  clock.isPlaying = clock.wantsPlay && !document.hidden;
  if (clock.wantsPlay) renderScene(player);
  else settleScene(player);
  requestFrame(player);
}

// 지금 장면의 탭을 다시 누르면 아무 일도 없다. 다른 장면의 탭은 그 장면에 새로 들어간다. 장면에서 나갔다 돌아오면 처음부터다.
function selectScene(player, si) {
  if (si !== player.scene) enterScene(player, si);
}

// 지금 장면을 마지막 모습에서 멈춘다. 시계는 서고 후광과 점은 없다. 움직임 줄이기가 켜질 때, 정지 장면에 들어갈 때, 한 번 장면이 끝날 때 쓴다.
// 움직임 줄이기가 꺼져도 다시 재생하지 않는다(다음 장면에 들어갈 때까지 이 모습이다).
function settleScene(player) {
  const { clock } = player;
  if (player.scene < 0) return;
  clock.wantsPlay = false;
  clock.isPlaying = false;
  clock.ended = true;
  clock.elapsed = player.scenes[player.scene].presentationMs;
  renderScene(player);
}
