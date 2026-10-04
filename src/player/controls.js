// 브라우저에서 돈다(play.js와 한 스크립트로 이어 붙는다). 재생 단추와 배속, 진행 고리, 탭, 설명 글의 백틱 코드.

// ---- 재생 단추와 배속 ----

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
function bindControls(root, player) {
  const { clock, pause } = player;
  const rateButton = root.querySelector('.fl-rate');
  pause.button.addEventListener('click', () => setPlaying(player, !clock.isPlaying));
  rateButton.addEventListener('click', () => {
    clock.rate = nextRate(clock.rate);
    rateButton.textContent = `${clock.rate}×`;
    syncChartMotion(player.stage, clock);
  });
  root.addEventListener('keydown', (e) => {
    // 단추 위의 스페이스는 그 단추를 누르는 키다.
    if (e.key !== ' ' || e.target.closest('button')) return;
    setPlaying(player, !clock.isPlaying);
    e.preventDefault();
  });
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
function setPlaying(player, value) {
  const { clock, pause } = player;
  clock.isPlaying = value;
  pause.icon.innerHTML = playIconSvg(clock.isPlaying, player.data.metrics);
  pause.button.setAttribute('aria-label', clock.isPlaying ? '일시정지' : '재생');
  syncChartMotion(player.stage, clock);
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 재생 단추 아이콘. 재생 중이면 일시정지 모양, 멈췄으면 재생 모양이다.
function playIconSvg(isPlaying, metrics) {
  return drawUiIcon(metrics, isPlaying ? 'pause' : 'play');
}

// ---- 진행 고리 ----

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 고리 둘레는 마크업의 반지름에서 구한다. draw(0~1)로 12시에서 시계 방향으로 채운다.
function createRing(button) {
  const fill = button.querySelector('.fl-ring-fill');
  const length = 2 * Math.PI * fill.r.baseVal.value;
  fill.style.strokeDasharray = length;
  return {
    draw(progress) {
      fill.style.strokeDashoffset = length * (1 - progress);
    },
  };
}

// ---- 탭 ----

// cost: time O(s), heap O(s), stack O(1)
// vars: s = 탭 수
// basis: estimate
function createTabs(container, player) {
  const { data, stepSegs } = player;
  const buttons = data.steps.map((label, si) => createTab(label, () => enterSegment(player, data.segs.indexOf(stepSegs[si][0]))));
  container.append(...buttons);
  return buttons;
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 글자 수
// basis: estimate
function createTab(label, onSelect) {
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('role', 'tab');
  button.append(...richNodes(label, htmlCode));
  button.addEventListener('click', onSelect);
  return button;
}

// cost: time O(s), heap O(1), stack O(1)
// vars: s = 탭 수
// basis: estimate
function markTabs(buttons, current) {
  buttons.forEach((button, si) => {
    button.classList.toggle('on', si === current);
    button.setAttribute('aria-selected', si === current);
  });
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 글자 수
// basis: estimate
// 글을 백틱 기준으로 나눠 노드 목록으로 만든다. 홀수 번째 구간(백틱 안)은 makeCode가 만든 요소에 담는다.
function richNodes(text, makeCode) {
  return text
    .split('`')
    .map((part, i) => {
      if (!part) return null;
      if (i % 2 === 0) return document.createTextNode(part);
      const code = makeCode();
      code.textContent = part;
      return code;
    })
    .filter(Boolean);
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
function htmlCode() {
  const code = document.createElement('code');
  code.className = 'fl-code';
  return code;
}
