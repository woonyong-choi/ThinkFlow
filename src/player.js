// 브라우저에서 돈다. html.js가 HTML 안에 그대로 넣는다.
// 박자(seg)마다 선과 도형을 밝히고, 카드 내용을 바꾸고, 점을 선 위로 옮긴다.

// cost: time O(s + c) 시작, 프레임마다 O(h), heap O(s + c), stack O(1)
// vars: s = 도형 수, c = 선 수, h = 한 박자의 이동 수
// basis: estimate
/**
 * 재생기를 붙인다.
 * @param root `.fl-figure` 요소
 * @param data { segs, total, steps, edges: [시작 도형 번호, 끝 도형 번호][], cards: 도형마다 카드 내용 수, metrics: 점, 글 상자, 아이콘 선 크기(토큰 값) }
 */
function d2flowPlay(root, data) {
  const NS = 'http://www.w3.org/2000/svg';
  const RATES = [1, 2, 0.5];
  const svg = root.querySelector('svg.fl');
  const packetLayer = svg.querySelector('.fl-packets');
  const tabs = root.querySelector('.fl-tabs');
  const caption = root.querySelector('.fl-caption');
  const pauseButton = root.querySelector('.fl-pause');
  const rateButton = root.querySelector('.fl-rate');
  const nodes = data.cards.map((_, i) => svg.querySelector(`#n-${i}`));
  // 생명선은 `#e-`, `#p-` 요소가 없어 null이다.
  const edges = data.edges.map((_, j) => svg.querySelector(`#e-${j}`));
  const paths = data.edges.map((_, j) => svg.querySelector(`#p-${j}`));
  const segs = data.segs;
  const metrics = data.metrics;
  const stepSegs = data.steps.map((_, si) => segs.filter((s) => s.si === si));
  const buttons = data.steps.map(createTab);
  // 설명이 하나도 없는 그림은 설명 줄 자리를 두지 않는다.
  const hasCaption = segs.some((s) => s.caption);

  let index = 0;
  let elapsed = 0;
  let before = performance.now();
  let isPlaying = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  let rate = RATES[0];
  let packets = [];
  let hasNewCards = false;

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
  d2flowView(root, metrics);

  setPlaying(isPlaying);
  if (segs.length) {
    enterSegment(0);
    requestAnimationFrame(drawFrame);
  } else {
    root.querySelector('.fl-foot').hidden = true;
  }

  // cost: time O(s), heap O(1), stack O(1)
  // vars: s = 박자 수(누를 때 첫 박자를 찾음)
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
      ? '<svg width="12" height="12" viewBox="0 0 16 16"><rect x="3" y="2" width="3.5" height="12" rx="1" fill="currentColor"/><rect x="9.5" y="2" width="3.5" height="12" rx="1" fill="currentColor"/></svg>'
      : '<svg width="12" height="12" viewBox="0 0 16 16"><path d="M4 2.5v11l9.5-5.5z" fill="currentColor"/></svg>';
    pauseButton.setAttribute('aria-label', isPlaying ? '일시정지' : '재생');
  }

  // cost: time O(n·c), heap O(n·c), stack O(1)
  // vars: n = 도형 수, c = 선 수
  // basis: estimate
  // 도형에 마우스를 올리면 닿은 선을 밝힌다.
  function highlightOnHover() {
    nodes.forEach((g, i) => {
      const touching = data.edges.map((e, j) => (e[0] === i || e[1] === i ? edges[j] : null)).filter(Boolean);
      g.addEventListener('mouseenter', () => touching.forEach((e) => e.classList.add('hover')));
      g.addEventListener('mouseleave', () => touching.forEach((e) => e.classList.remove('hover')));
    });
  }

  // cost: time O(s + c + k), heap O(h), stack O(1)
  // vars: s = 도형 수, c = 선 수, k = 카드 내용 수 합, h = 이동 수
  // basis: estimate
  // 박자 i의 상태를 그린다. 점은 만들자마자 선 시작점에 둔다. 첫 프레임에 그림 구석에 보이는 일을 막기 위해서다.
  function enterSegment(i) {
    index = i;
    elapsed = 0;
    const seg = segs[i];
    nodes.forEach((g, n) => g.classList.toggle('on', seg.nodesOn.includes(n)));
    edges.forEach((e, j) => e?.classList.toggle('on', seg.edgesOn.includes(j)));
    showCards(seg.cardsBefore);
    hasNewCards = false;
    caption.textContent = seg.caption;
    caption.hidden = !hasCaption;
    // 탭을 눌러 옮겨도 앞 탭의 진행 막대가 남지 않게, 지금 탭이 아닌 막대는 모두 비운다.
    buttons.forEach((b, si) => {
      const isCurrent = si === seg.si;
      b.classList.toggle('on', isCurrent);
      b.setAttribute('aria-selected', isCurrent);
      if (!isCurrent) b.querySelector('i').style.width = '0';
    });
    packets.forEach((p) => p.remove());
    packets = seg.hops.map(createPacket);
    packets.forEach((packet) => packet.move(0));
  }

  // cost: time O(k), heap O(1), stack O(1)
  // vars: k = 카드 내용 수 합
  // basis: estimate
  // 도형마다 cards가 가리키는 카드 내용 하나만 보이고, 없으면 빈 표시를 보인다.
  function showCards(cards) {
    data.cards.forEach((count, n) => {
      if (!count) return;
      const shown = cards[n];
      for (let k = 0; k < count; k++) svg.querySelector(`#n-${n}-c${k}`).setAttribute('opacity', shown === k ? 1 : 0);
      nodes[n].querySelector('.fl-empty').setAttribute('opacity', shown === undefined ? 1 : 0);
      nodes[n].querySelector('.fl-card').classList.toggle('on', shown !== undefined);
    });
  }

  // 점과 글 상자. 글 상자 폭은 브라우저가 잰 글자 폭으로 맞춘다.
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
      move(p) {
        const point = path.getPointAtLength(length * (hop.isBack ? 1 - p : p));
        g.setAttribute('transform', `translate(${point.x} ${point.y})`);
        if (chip) placeChip(chip, point);
        g.style.opacity = p >= 1 ? 0 : 1;
      },
    };
  }

  // cost: time O(l), heap O(l), stack O(1)
  // vars: l = 글 상자 줄 수
  // basis: estimate
  // lines는 html.js가 움직이는 SVG와 같은 너비로 미리 나눈 줄이다.
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
    // 글자 폭은 문서에 붙은 뒤에만 잴 수 있다.
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

  // 글 상자가 그림 밖으로 나가면 잘린다. 옆으로는 그림 안까지 밀고, 위가 모자라면 점 아래로 내린다.
  function placeChip(chip, point) {
    const box = svg.viewBox.baseVal;
    const half = chip.w / 2 + metrics.chipGap;
    const x = Math.min(box.x + box.width - half, Math.max(box.x + half, point.x)) - point.x;
    const isTooHigh = point.y - chip.h - metrics.chipGap < box.y;
    const y = isTooHigh ? chip.h + metrics.chipGap * 2 : 0;
    chip.g.setAttribute('transform', `translate(${x} ${y})`);
  }

  // cost: time O(h), heap O(1), stack O(1)
  // vars: h = 한 박자의 이동 수
  // basis: estimate
  // 프레임마다 점을 옮기고, 탭 진행 막대를 채우고, 박자가 끝나면 다음 박자로 넘어간다.
  function drawFrame(now) {
    if (isPlaying) elapsed += (now - before) * rate;
    before = now;
    const seg = segs[index];
    const p = seg.move > 0 ? Math.min(1, elapsed / seg.move) : 1;
    const eased = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
    packets.forEach((packet) => packet.move(eased));
    if (!hasNewCards && elapsed >= seg.cardsAt) {
      showCards(seg.cards);
      hasNewCards = true;
    }
    const steps = stepSegs[seg.si];
    const start = steps[0].t0;
    const end = steps.at(-1).t1;
    const bar = buttons[seg.si].querySelector('i');
    bar.style.width = `${((seg.t0 - start + Math.min(elapsed, seg.t1 - seg.t0)) / (end - start)) * 100}%`;
    if (elapsed >= seg.t1 - seg.t0) enterSegment((index + 1) % segs.length);
    requestAnimationFrame(drawFrame);
  }
}
