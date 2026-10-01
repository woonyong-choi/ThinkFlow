// 브라우저에서 돈다. html.js가 HTML 안에 그대로 넣는다.
// 시간표의 박자 상태를 그대로 그린다. 상태를 다시 계산하지 않는다(docs/architecture.md 불변 조건).

// cost: time O(s + c) 시작, 프레임마다 O(h + k), heap O(s + c), stack O(1)
// vars: s = 도형 수, c = 선 수, h = 한 박자의 이동 수, k = 카드 있는 도형 수
// basis: estimate
/**
 * 재생기를 붙인다.
 * @param root `.fl-figure` 요소
 * @param data { segs, steps, cardCounts, edgeEnds, seriesCount, rowCount, metrics }
 */
function figurePlay(root, data) {
  const NS = 'http://www.w3.org/2000/svg';
  const RATES = [1, 2, 0.5];
  const svg = root.querySelector('svg.fl');
  const packetLayer = svg.querySelector('.fl-packets');
  const tabs = root.querySelector('.fl-tabs');
  const caption = root.querySelector('.fl-caption');
  const pauseButton = root.querySelector('.fl-pause');
  const rateButton = root.querySelector('.fl-rate');
  const nodes = data.cardCounts.map((_, i) => svg.querySelector(`#n-${i}`));
  const groups = [...svg.querySelectorAll('.fl-group')];
  const edges = data.edgeEnds.map((_, j) => svg.querySelector(`#e-${j}`));
  const paths = data.edgeEnds.map((_, j) => svg.querySelector(`#p-${j}`));
  const columns = [...svg.querySelectorAll('.fl-col')];
  const seriesEls = Array.from({ length: data.seriesCount }, (_, i) => [...svg.querySelectorAll(`.cs-${i}`)]);
  const rowEls = Array.from({ length: data.rowCount }, (_, k) => [...svg.querySelectorAll(`.cr-${k}`)]);
  const { segs, metrics } = data;
  const stepSegs = data.steps.map((_, si) => segs.filter((s) => s.si === si));
  const buttons = data.steps.map(createTab);
  const hasCaption = segs.some((s) => s.caption);

  let index = 0;
  let elapsed = 0;
  let before = performance.now();
  let isPlaying = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  let rate = RATES[0];
  let packets = [];
  let pendingCards = [];

  pauseButton.addEventListener('click', () => setPlaying(!isPlaying));
  rateButton.addEventListener('click', () => {
    rate = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
    rateButton.textContent = `${rate}×`;
  });
  root.addEventListener('keydown', (e) => {
    // 단추 위의 스페이스는 그 단추를 누르는 키다.
    if (e.key === ' ' && !e.target.closest('button')) {
      setPlaying(!isPlaying);
      e.preventDefault();
    }
  });
  highlightOnHover();
  figureView(root, metrics);

  setPlaying(isPlaying);
  if (segs.length) {
    enterSegment(0);
    requestAnimationFrame(drawFrame);
  } else {
    // 시간 흐름이 없는 그림은 조작 막대를 숨긴다. 차트는 SVG 이미지처럼 되풀이해 자란다.
    root.querySelector('.fl-foot').hidden = true;
    svg.classList.add('chart-loop');
  }

  // cost: time O(s), heap O(1), stack O(1)
  // vars: s = 박자 수
  // basis: estimate
  function createTab(label, si) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'tab');
    button.append(label, document.createElement('i'));
    button.addEventListener('click', () => enterSegment(segs.indexOf(stepSegs[si][0])));
    tabs.appendChild(button);
    return button;
  }

  function setPlaying(value) {
    isPlaying = value;
    pauseButton.innerHTML = isPlaying
      ? `<svg width="${metrics.icon}" height="${metrics.icon}" viewBox="0 0 16 16"><path d="M5 2.5v11M11 2.5v11" stroke="currentColor" stroke-width="${metrics.pauseStroke}" stroke-linecap="round"/></svg>`
      : '<svg width="${metrics.icon}" height="${metrics.icon}" viewBox="0 0 16 16"><path d="M4 2.5v11l9.5-5.5z" fill="currentColor"/></svg>';
    pauseButton.setAttribute('aria-label', isPlaying ? '일시정지' : '재생');
  }

  // cost: time O(n·c), heap O(n·c), stack O(1)
  // vars: n = 도형 수, c = 선 수
  // basis: estimate
  // 도형에 마우스를 올리면 닿은 선을 밝힌다. 조용한 선도 그때 보인다.
  function highlightOnHover() {
    nodes.forEach((g, i) => {
      const touching = data.edgeEnds.map((e, j) => (e[0] === i || e[1] === i ? edges[j] : null)).filter(Boolean);
      g?.addEventListener('mouseenter', () => touching.forEach((e) => e.classList.add('hover')));
      g?.addEventListener('mouseleave', () => touching.forEach((e) => e.classList.remove('hover')));
    });
  }

  // cost: time O(s + c + k + r), heap O(h), stack O(1)
  // vars: s = 도형 수, c = 선 수, k = 카드 내용 수 합, r = 차트 행 수, h = 이동 수
  // basis: estimate
  // 박자 i의 상태를 그린다. 점이 도착하는 도형의 카드는 cardsAt 시각에 바뀐다.
  function enterSegment(i) {
    index = i;
    elapsed = 0;
    const seg = segs[i];
    nodes.forEach((g, n) => g?.classList.toggle('on', seg.nodesOn.includes(n)));
    groups.forEach((g, n) => g.classList.toggle('on', seg.groupsOn.includes(n)));
    edges.forEach((e, j) => e?.classList.toggle('on', seg.edgesOn.includes(j)));
    columns.forEach((c) => c.classList.toggle('on', seg.columnsOn.includes(c.dataset.col)));
    showCards(seg.cardsBefore);
    pendingCards = Object.entries(seg.cardsAt).map(([n, at]) => ({ n: Number(n), at }));
    drawChartState(seg);
    caption.textContent = seg.caption;
    caption.hidden = !hasCaption;
    buttons.forEach((b, si) => {
      const isCurrent = si === seg.si;
      b.classList.toggle('on', isCurrent);
      b.setAttribute('aria-selected', isCurrent);
      // 탭을 옮겨도 앞 탭의 진행 막대가 남지 않게 지금 탭이 아닌 막대는 비운다.
      if (!isCurrent) b.querySelector('i').style.width = '0';
    });
    packets.forEach((p) => p.remove());
    packets = seg.hops.map(createPacket);
    packets.forEach((packet) => packet.move(0));
  }

  // cost: time O(k), heap O(1), stack O(1)
  // vars: k = 카드 있는 도형 수
  // basis: estimate
  function showCards(cards, only) {
    data.cardCounts.forEach((count, n) => {
      if (!count || (only !== undefined && only !== n)) return;
      const shown = cards[n];
      for (let k = 0; k < count; k++) svg.querySelector(`#n-${n}-c${k}`).setAttribute('opacity', shown === k ? 1 : 0);
      nodes[n].querySelector('.fl-empty').setAttribute('opacity', shown === undefined ? 1 : 0);
      nodes[n].querySelector('.fl-card').classList.toggle('on', shown !== undefined);
    });
  }

  // cost: time O(r + s), heap O(1), stack O(1)
  // vars: r = 차트 행 수, s = 계열 수
  // basis: estimate
  // 차트: 드러낸 계열을 보이고, 이 박자에 드러내는 계열은 자라는 움직임을 다시 건다. light가 있으면 나머지 행을 흐린다.
  function drawChartState(seg) {
    seriesEls.forEach((els, s) => {
      const isGrowing = seg.growing.includes(s);
      for (const el of els) {
        el.classList.toggle('hidden', !seg.series.includes(s));
        el.classList.remove('play');
        if (isGrowing) {
          el.getBoundingClientRect();
          el.classList.add('play');
        }
      }
    });
    rowEls.forEach((els, k) => els.forEach((el) => el.classList.toggle('dim', seg.lights.length > 0 && !seg.lights.includes(k))));
  }

  // cost: time O(l), heap O(l), stack O(1)
  // vars: l = 글 상자 줄 수
  // basis: estimate
  // 점과 글 상자. 글 상자 줄은 html.js가 움직이는 SVG와 같은 너비로 나눠 넘긴다.
  function createPacket(hop) {
    const path = paths[hop.edge];
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'fl-packet');
    g.innerHTML = `<circle r="${metrics.halo}" fill="${metrics.accent}" opacity="${metrics.haloOpacity}"/><circle r="${metrics.packet}" fill="${metrics.accent}"/>`;
    packetLayer.appendChild(g);
    const chip = hop.data ? createChip(hop.data) : undefined;
    if (chip) g.appendChild(chip.g);
    const length = path.getTotalLength();
    return {
      remove: () => g.remove(),
      move(t) {
        const p = Math.min(1, t / hop.ms);
        const eased = progressAt(metrics.move, p);
        const point = path.getPointAtLength(length * (hop.isBack ? 1 - eased : eased));
        g.setAttribute('transform', `translate(${point.x} ${point.y})`);
        if (chip) placeChip(chip, point);
        g.style.opacity = p >= 1 ? 0 : 1;
      },
    };
  }

  // cost: time O(l), heap O(l), stack O(1)
  // vars: l = 글 상자 줄 수
  // basis: estimate
  function createChip(lines) {
    const chip = document.createElementNS(NS, 'g');
    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('rx', metrics.chipRadius);
    rect.setAttribute('fill', metrics.accent);
    chip.appendChild(rect);
    const texts = lines.map((line) => {
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('class', 'chip');
      t.textContent = line;
      chip.appendChild(t);
      return t;
    });
    packetLayer.appendChild(chip);
    const w = Math.max(...texts.map((t) => t.getComputedTextLength())) + metrics.chipPadX;
    const h = texts.length * metrics.chipLine + metrics.chipPadY;
    const top = -h - metrics.chipGap;
    rect.setAttribute('x', -w / 2);
    rect.setAttribute('y', top);
    rect.setAttribute('width', w);
    rect.setAttribute('height', h);
    texts.forEach((t, li) => t.setAttribute('y', top + metrics.chipLine * (li + 1)));
    return { g: chip, w, h };
  }

  // cost: time O(STEPS), heap O(1), stack O(1)
  // vars: STEPS = 이분 탐색 횟수(30)
  // basis: estimate
  // 시간 비율 p에서 이동 곡선의 진행 비율. easing.js의 timeAt과 같은 곡선을 반대 방향으로 푼다.
  function progressAt([x1, y1, x2, y2], p) {
    const axis = (a, b, t) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
    let [low, high] = [0, 1];
    for (let i = 0; i < 30; i++) {
      const mid = (low + high) / 2;
      if (axis(x1, x2, mid) < p) low = mid;
      else high = mid;
    }
    return axis(y1, y2, (low + high) / 2);
  }

  // 글 상자가 그림 밖으로 나가면 옆으로 밀어 넣고, 위가 모자라면 점 아래로 내린다.
  function placeChip(chip, point) {
    const box = svg.viewBox.baseVal;
    const half = chip.w / 2 + metrics.chipGap;
    const x = Math.min(box.x + box.width - half, Math.max(box.x + half, point.x)) - point.x;
    const isTooHigh = point.y - chip.h - metrics.chipGap < box.y;
    chip.g.setAttribute('transform', `translate(${x} ${isTooHigh ? chip.h + metrics.chipGap * 2 : 0})`);
  }

  // cost: time O(h + k), heap O(1), stack O(1)
  // vars: h = 박자의 이동 수, k = 카드가 바뀌는 도형 수
  // basis: estimate
  // 프레임마다 점을 옮기고, 도착한 도형의 카드를 바꾸고, 탭 진행 막대를 채운다.
  function drawFrame(now) {
    if (isPlaying) elapsed += (now - before) * rate;
    before = now;
    const seg = segs[index];
    packets.forEach((packet) => packet.move(elapsed));
    pendingCards = pendingCards.filter(({ n, at }) => {
      if (elapsed < at) return true;
      showCards(seg.cards, n);
      return false;
    });
    const steps = stepSegs[seg.si];
    const start = steps[0].t0;
    const end = steps.at(-1).t1;
    buttons[seg.si].querySelector('i').style.width = `${((seg.t0 - start + Math.min(elapsed, seg.t1 - seg.t0)) / (end - start)) * 100}%`;
    if (elapsed >= seg.t1 - seg.t0) enterSegment((index + 1) % segs.length);
    requestAnimationFrame(drawFrame);
  }
}
