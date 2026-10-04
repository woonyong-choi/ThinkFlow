// 브라우저에서 돈다(play.js와 한 스크립트로 이어 붙는다). 그림(SVG) 조각을 찾아 박자 상태를 그리고 점과 글 상자를 옮긴다.

const SVG_NS = 'http://www.w3.org/2000/svg';

// ---- 그림 그리기 ----

// cost: time O(s + c + r), heap O(s + c + r), stack O(1)
// vars: s = 도형 수, c = 선 수, r = 차트 행 수
// basis: estimate
// 그림(SVG) 조각을 한 번 찾아 둔 묶음. 점, 카드 대기열 같은 그림 쪽 상태도 여기에 둔다.
function createStage(root, data) {
  const svg = root.querySelector('svg.fl');
  const all = (selector) => [...svg.querySelectorAll(selector)];
  return {
    svg,
    metrics: data.metrics,
    edgeEnds: data.edgeEnds,
    cardCounts: data.cardCounts,
    packetLayer: svg.querySelector('.fl-packets'),
    nodes: data.cardCounts.map((_, i) => svg.querySelector(`#n-${i}`)),
    groups: all('.fl-group'),
    edges: data.edgeEnds.map((_, j) => withLabel(svg.querySelector(`#e-${j}`), svg.querySelector(`#l-${j}`))),
    paths: data.edgeEnds.map((_, j) => svg.querySelector(`#p-${j}`)),
    trackPaths: Array.from({ length: data.trackCount ?? 0 }, (_, k) => svg.querySelector(`#tp-${k}`)),
    values: data.values ?? [],
    valueEls: createValueEls(svg, data),
    pendingOn: [],
    pendingPulses: [],
    parts: all('.fl-part'),
    seriesEls: Array.from({ length: data.seriesCount }, (_, i) => all(`.cs-${i}`)),
    labelEls: all('.chart-label.shift'),
    rowEls: Array.from({ length: data.rowCount }, (_, k) => all(`.cr-${k}`)),
    packets: [],
    pendingCards: [],
  };
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 선 묶음과 알약 묶음(점 층 위에 따로 그려진다)의 class를 함께 바꾸는 손잡이. 알약이 없으면 선만 바꾼다.
function withLabel(edge, label) {
  const both = (act) => (name, on) => [edge, label].forEach((el) => el && act(el.classList, name, on));
  return { classList: { toggle: both((list, name, on) => list.toggle(name, on)), add: both((list, name) => list.add(name)), remove: both((list, name) => list.remove(name)) } };
}

// cost: time O(n·c), heap O(n·c), stack O(1)
// vars: n = 도형 수, c = 선 수
// basis: estimate
// 도형에 마우스를 올리면 닿은 선을 밝힌다. 조용한 선도 그때 보인다.
function highlightOnHover(stage) {
  stage.nodes.forEach((g, i) => {
    const touching = stage.edgeEnds.map((e, j) => (e[0] === i || e[1] === i ? stage.edges[j] : null)).filter(Boolean);
    g?.addEventListener('mouseenter', () => touching.forEach((e) => e.classList.add('hover')));
    g?.addEventListener('mouseleave', () => touching.forEach((e) => e.classList.remove('hover')));
  });
}

// cost: time O(s + c + k + r), heap O(1), stack O(1)
// vars: s = 도형 수, c = 선 수, k = 카드 내용 수 합, r = 차트 행 수
// basis: estimate
// 박자 seg의 상태를 그린다. 점이 도착하는 도형의 카드는 cardsAt 시각에 바뀐다.
function drawSegmentState(stage, seg) {
  stage.isFlow = Boolean(seg.pulses);
  stage.nodes.forEach((g, n) => g?.classList.toggle('on', seg.nodesOn.includes(n)));
  stage.groups.forEach((g, n) => g.classList.toggle('on', seg.groupsOn.includes(n)));
  stage.edges.forEach((e, j) => e?.classList.toggle('on', seg.edgesOn.includes(j)));
  stage.parts.forEach((p) => p.classList.toggle('on', seg.partsOn.includes(p.dataset.part)));
  showCards(stage, seg.cardsBefore);
  stage.pendingCards = Object.entries(seg.cardsAt).map(([n, at]) => ({ n: Number(n), at }));
  stage.pendingOn = pendingLights(stage, seg);
  stage.pendingPulses = [...(seg.pulses ?? [])];
  drawValueState(stage, seg, seg.t0);
  drawChartState(stage, seg);
}

// cost: time O(e + s), heap O(e + s), stack O(1)
// vars: e = 처음 닿는 선 수, s = 처음 닿는 도형과 그룹 수
// basis: estimate
// 흐름 구간에서 점이 처음 닿는 시각에 켜질 선, 도형, 그룹. 구간 처음부터 켜진 것은 이미 켜져 있어 뺀다.
function pendingLights(stage, seg) {
  const timed = (at, els, on) => Object.entries(at ?? {}).filter(([i]) => !on.includes(Number(i))).map(([i, ms]) => ({ el: els[i], at: ms }));
  return [...timed(seg.edgesAt, stage.edges, seg.edgesOn), ...timed(seg.nodesAt, stage.nodes, seg.nodesOn), ...timed(seg.groupsAt, stage.groups, seg.groupsOn)];
}

// cost: time O(k), heap O(1), stack O(1)
// vars: k = 카드 있는 도형 수
// basis: estimate
function showCards(stage, cards, only) {
  stage.cardCounts.forEach((count, n) => {
    if (!count || (only !== undefined && only !== n)) return;
    const shown = cards[n];
    for (let k = 0; k < count; k++) stage.svg.querySelector(`#n-${n}-c${k}`).setAttribute('opacity', shown === k ? 1 : 0);
    stage.nodes[n].querySelector('.fl-card').classList.toggle('on', shown !== undefined && !stage.isFlow);
  });
}

// cost: time O(r + s), heap O(1), stack O(1)
// vars: r = 차트 행 수, s = 계열 수
// basis: estimate
// 차트: 드러낸 계열을 보이고, 이 박자에 드러내는 계열은 자라는 움직임을 다시 건다. light가 있으면 나머지 행을 흐린다.
function drawChartState(stage, seg) {
  stage.seriesEls.forEach((els, s) => {
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
  stage.labelEls.forEach((el, k) => el.style.setProperty('--label-shift', `${seg.labelShifts[k] ?? 0}px`));
  stage.rowEls.forEach((els, k) => els.forEach((el) => el.classList.toggle('dim', seg.lights.length > 0 && !seg.lights.includes(k))));
}

// cost: time O(a), heap O(a), stack O(1)
// vars: a = 차트 움직임 수
// basis: estimate
// 차트 움직임(막대, 선, 값 글자, 점의 CSS 애니메이션)을 박자 시계에 맞춘다. CSS 애니메이션은 브라우저 시계를 따로 따르므로
// 정지면 멈추고 재개하면 잇고, 배속이면 재생 속도를 같게 한다. 모델 상태는 다시 계산하지 않는다(상태는 시간표가 정한다).
// 이미 끝난 움직임은 건드리지 않는다. play()는 끝난 움직임을 처음부터 다시 돌리기 때문이다.
function syncChartMotion(stage, clock) {
  for (const animation of stage.svg.getAnimations({ subtree: true })) {
    if (!animation.animationName?.startsWith('chart-')) continue;
    animation.playbackRate = clock.rate;
    if (!clock.isPlaying && animation.playState === 'running') animation.pause();
    else if (clock.isPlaying && animation.playState === 'paused') animation.play();
  }
}

// cost: time O(h), heap O(h), stack O(1)
// vars: h = 박자의 이동 수
// basis: estimate
function resetPackets(stage, seg) {
  stage.packets.forEach((p) => p.remove());
  stage.packets = seg.hops.map((hop) => createPacket(hop, stage));
  stage.packets.forEach((packet) => packet.move(0));
}

// cost: time O(h + k), heap O(1), stack O(1)
// vars: h = 박자의 이동 수, k = 카드가 바뀌는 도형 수
// basis: estimate
// 점을 옮기고, 도착한 도형의 카드를 바꾼다.
function advanceStage(stage, seg, elapsed) {
  stage.packets.forEach((packet) => packet.move(elapsed));
  stage.pendingCards = stage.pendingCards.filter(({ n, at }) => {
    if (elapsed < at) return true;
    showCards(stage, seg.cards, n);
    return false;
  });
  stage.pendingOn = stage.pendingOn.filter(({ el, at }) => {
    if (elapsed < at) return true;
    el?.classList.add('on');
    return false;
  });
  stage.pendingPulses = stage.pendingPulses.filter(({ n, at }) => {
    if (elapsed < at) return true;
    if (elapsed - at < stage.metrics.pulseMs) pulseNode(stage, n);
    return false;
  });
  drawValueState(stage, seg, seg.t0 + elapsed);
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 점이 닿은 도형의 후광을 한 번 깜빡인다. 도형은 켜지지 않고 테두리도 그대로다.
function pulseNode(stage, n) {
  stage.nodes[n]?.querySelector('.fl-halo')?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: stage.metrics.pulseMs });
}

// cost: time O(l), heap O(l), stack O(1)
// vars: l = 글 상자 줄 수
// basis: estimate
// 점과 글 상자. 글 상자 줄과 자리는 시간표가 움직이는 SVG와 같게 정해 넘긴다.
function createPacket(hop, stage) {
  const { metrics } = stage;
  const path = hop.track === undefined ? stage.paths[hop.edge] : stage.trackPaths[hop.track];
  const color = hop.tone ? metrics.tones[hop.tone] : metrics.active;
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'fl-packet');
  g.innerHTML = `<circle r="${metrics.halo}" fill="${color}" opacity="${metrics.haloOpacity}"/><circle r="${metrics.packet}" fill="${color}"/>`;
  stage.packetLayer.appendChild(g);
  const chip = hop.data ? createChip(hop.data, { stage, color: hop.tone ? color : undefined }) : undefined;
  if (chip) g.appendChild(chip.g);
  const length = path.getTotalLength();
  const slide = chipSlide(hop, metrics);
  return {
    remove: () => g.remove(),
    // cost: time O(g + l), heap O(1), stack O(1)
    // vars: g = 도형 안을 지나는 구간 수, l = 글 상자 경로 지점 수
    // basis: estimate
    move(elapsed) {
      const t = elapsed - (hop.at ?? 0);
      const p = Math.min(1, Math.max(0, t / hop.ms));
      const eased = progressAt(metrics.move, p);
      const point = path.getPointAtLength(length * (hop.isBack ? 1 - eased : eased));
      g.setAttribute('transform', `translate(${point.x} ${point.y})`);
      if (chip) {
        const [dx, dy, opacity] = slide(p);
        chip.g.setAttribute('transform', `translate(${dx} ${dy})`);
        chip.g.style.opacity = opacity * chipFadeAt(hop.chipFade, t);
      }
      const isInside = (hop.gaps ?? []).some(([from, to]) => eased > from && eased < to);
      g.style.opacity = isShown(hop, t, isInside) ? cutFade(hop, t, metrics) : 0;
    },
  };
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 점이 보이는 때인지. 이동 시작 전, 도형 안(isInside), 끝에 닿은 뒤, 단계 끝에서 잘린 뒤(hop.cut)는 보이지 않는다.
function isShown(hop, t, isInside) {
  return t >= 0 && t < (hop.cut ?? hop.ms) && !isInside;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 단계 끝에서 잘리는 점(hop.cut)이 끝 앞 cutFadeMs 동안 서서히 사라지는 불투명도. 그 밖의 점은 1이다.
function cutFade(hop, t, metrics) {
  return hop.cut === undefined ? 1 : Math.min(1, (hop.cut - t) / metrics.cutFadeMs);
}

// cost: time O(l), heap O(l), stack O(1)
// vars: l = 글 상자 줄 수
// basis: estimate
function createChip(lines, { stage, color }) {
  const { metrics } = stage;
  const chip = document.createElementNS(SVG_NS, 'g');
  const rect = document.createElementNS(SVG_NS, 'rect');
  rect.setAttribute('rx', metrics.chipRadius);
  rect.setAttribute('fill', color ?? metrics.chipFill);
  if (color) {
    rect.setAttribute('stroke', color);
    rect.setAttribute('stroke-width', metrics.chipStroke);
  }
  chip.appendChild(rect);
  const texts = lines.map((line) => createChipLine(line, chip));
  stage.packetLayer.appendChild(chip);
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

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 글자 수
// basis: estimate
function createChipLine(line, chip) {
  const text = document.createElementNS(SVG_NS, 'text');
  text.setAttribute('class', 'chip');
  text.append(
    ...richNodes(line, () => {
      const code = document.createElementNS(SVG_NS, 'tspan');
      code.setAttribute('class', 'code');
      return code;
    }),
  );
  chip.appendChild(text);
  return text;
}
