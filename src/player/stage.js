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
    edges: data.edgeEnds.map((_, j) => svg.querySelector(`#e-${j}`)),
    paths: data.edgeEnds.map((_, j) => svg.querySelector(`#p-${j}`)),
    columns: all('.fl-col'),
    seriesEls: Array.from({ length: data.seriesCount }, (_, i) => all(`.cs-${i}`)),
    labelEls: all('.chart-label.shift'),
    rowEls: Array.from({ length: data.rowCount }, (_, k) => all(`.cr-${k}`)),
    packets: [],
    pendingCards: [],
  };
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
  stage.nodes.forEach((g, n) => g?.classList.toggle('on', seg.nodesOn.includes(n)));
  stage.groups.forEach((g, n) => g.classList.toggle('on', seg.groupsOn.includes(n)));
  stage.edges.forEach((e, j) => e?.classList.toggle('on', seg.edgesOn.includes(j)));
  stage.columns.forEach((c) => c.classList.toggle('on', seg.columnsOn.includes(c.dataset.col)));
  showCards(stage, seg.cardsBefore);
  stage.pendingCards = Object.entries(seg.cardsAt).map(([n, at]) => ({ n: Number(n), at }));
  drawChartState(stage, seg);
}

// cost: time O(k), heap O(1), stack O(1)
// vars: k = 카드 있는 도형 수
// basis: estimate
function showCards(stage, cards, only) {
  stage.cardCounts.forEach((count, n) => {
    if (!count || (only !== undefined && only !== n)) return;
    const shown = cards[n];
    for (let k = 0; k < count; k++) stage.svg.querySelector(`#n-${n}-c${k}`).setAttribute('opacity', shown === k ? 1 : 0);
    stage.nodes[n].querySelector('.fl-card').classList.toggle('on', shown !== undefined);
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
}

// cost: time O(l), heap O(l), stack O(1)
// vars: l = 글 상자 줄 수
// basis: estimate
// 점과 글 상자. 글 상자 줄과 자리는 시간표가 움직이는 SVG와 같게 정해 넘긴다.
function createPacket(hop, stage) {
  const { metrics } = stage;
  const path = stage.paths[hop.edge];
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'fl-packet');
  g.innerHTML = `<circle r="${metrics.halo}" fill="${metrics.active}" opacity="${metrics.haloOpacity}"/><circle r="${metrics.packet}" fill="${metrics.active}"/>`;
  stage.packetLayer.appendChild(g);
  const chip = hop.data ? createChip(hop.data, stage) : undefined;
  if (chip) g.appendChild(chip.g);
  const length = path.getTotalLength();
  const slide = chipSlide(hop, metrics);
  return {
    remove: () => g.remove(),
    move(t) {
      const p = Math.min(1, t / hop.ms);
      const eased = progressAt(metrics.move, p);
      const point = path.getPointAtLength(length * (hop.isBack ? 1 - eased : eased));
      g.setAttribute('transform', `translate(${point.x} ${point.y})`);
      if (chip) {
        const [dx, dy, opacity] = slide(p);
        chip.g.setAttribute('transform', `translate(${dx} ${dy})`);
        chip.g.style.opacity = opacity;
      }
      g.style.opacity = p >= 1 ? 0 : 1;
    },
  };
}

// cost: time O(l), heap O(l), stack O(1)
// vars: l = 글 상자 줄 수
// basis: estimate
function createChip(lines, stage) {
  const { metrics } = stage;
  const chip = document.createElementNS(SVG_NS, 'g');
  const rect = document.createElementNS(SVG_NS, 'rect');
  rect.setAttribute('rx', metrics.chipRadius);
  rect.setAttribute('fill', metrics.chipFill);
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
