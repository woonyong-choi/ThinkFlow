// 브라우저에서 돈다(play.js와 한 스크립트로 이어 붙는다). 그림(SVG) 조각을 찾아 두고, 표본 추출기(sample.js)가 돌려준 모습을 그대로 그린다.
// 그림은 모습의 함수다. 이전 프레임, 웹 애니메이션 끝 알림, 요소 충돌에서 사건을 읽지 않고 같은 모습을 몇 번 그려도 같다.
// 도형과 그룹은 논리 id로 찾는다. 같은 카드가 여러 판에 그려지면 도형 번호(#n-번호)는 다르지만 논리 id가 같고, 모든 그림 요소가 같은 모습으로 맞춰진다.

const SVG_NS = 'http://www.w3.org/2000/svg';

// ---- 그림 조각 ----

// 논리 id 목록(번호 순서)을 { id: 번호[] }로. 같은 id가 여러 번 나오면 번호가 여럿이다.
function indicesById(ids) {
  const map = new Map();
  ids.forEach((id, i) => map.set(id, [...(map.get(id) ?? []), i]));
  return map;
}

/**
 * 그림(SVG) 조각을 한 번 찾아 둔 묶음. 점과 마지막으로 그린 모습처럼 그림 쪽에 남는 것도 여기에 둔다.
 * 판마다 SVG 한 장이고 요소 id는 판을 가로질러 하나뿐이므로, 판 묶음(.dp-panels) 전체에서 찾는다.
 */
function createStage(root, data) {
  const view = root.querySelector('.dp-panels');
  const find = (selector) => view.querySelector(selector);
  const all = (selector) => [...view.querySelectorAll(selector)];
  return {
    view,
    metrics: data.metrics,
    edgePanels: data.edgePanels,
    trackPanels: data.trackPanels,
    chartMeta: data.chartMeta,
    cardCounts: data.cardCounts,
    packetLayers: all('.fl-packets'),
    nodes: data.itemIds.map((_, i) => find(`#n-${i}`)),
    nodesById: indicesById(data.itemIds),
    cardEls: data.cardCounts.map((count, i) => Array.from({ length: count }, (_, k) => find(`#n-${i}-c${k}`))),
    groups: data.groupIds.map((_, j) => find(`#g-${j}`)),
    groupsById: indicesById(data.groupIds),
    edges: data.edgePanels.map((_, j) => ({ line: find(`#e-${j}`), label: find(`#l-${j}`) })),
    paths: data.edgePanels.map((_, j) => find(`#p-${j}`)),
    trackPaths: Array.from({ length: data.trackCount ?? 0 }, (_, k) => find(`#tp-${k}`)),
    values: data.values ?? [],
    valueEls: createValueEls(view, data),
    rowEls: createRowEls(view),
    parts: all('.fl-part'),
    sceneEls: all('[data-si]'),
    statusEls: all('.fl-status'),
    charts: createChartEls(view, data),
    packets: [],
    // 마지막으로 그린 박자와 요소별 값. 같은 값을 다시 쓰지 않으려고 둔다(그린 결과는 모습만으로 정해진다).
    painted: { key: '', si: undefined, cards: {}, chartFrames: {}, marks: new Set(), lights: {} },
    written: new WeakMap(),
    overlays: [],
  };
}

// 차트 카드마다 그려진 곳(같은 차트가 여러 판에 있으면 모두)의 계열(cs-번호) 요소, 행(cr-번호) 요소, 행 이름 요소. 요소는 그 차트의 data-chart 안에서만 찾아 다른 차트에 번지지 않는다.
function createChartEls(view, data) {
  return Object.fromEntries(
    Object.entries(data.chartMeta ?? {}).map(([cardId, meta]) => {
      const roots = [...view.querySelectorAll(`[data-chart="${CSS.escape(cardId)}"]`)];
      const within = (selector) => roots.flatMap((chart) => [...chart.querySelectorAll(selector)]);
      return [cardId, { series: meta.series.map((_, s) => within(`.cs-${s}`)), rows: meta.rowKeys.map((_, k) => within(`.cr-${k}`)) }];
    }),
  );
}

// 요소 el의 속성 name을 value로 쓴다. 지금 값과 같으면 쓰지 않는다.
function writeAttr(stage, el, name, value) {
  const seen = stage.written.get(el) ?? {};
  if (seen[name] === value) return;
  stage.written.set(el, { ...seen, [name]: value });
  el.setAttribute(name, value);
}

// 보였다 사라지는 변형(값 글자, 큐 찬 칸, 상태 알약, 카드 내용 층)을 켜거나 끈다. 불투명도 0인 요소는 접근성 트리에 남으므로 보임(visibility)도 같이 쓴다. 변형은 서로 들어 있지 않고 안쪽은 visibility를 정하지 않는다.
function showVariant(stage, el, isShown) {
  writeAttr(stage, el, 'opacity', isShown ? 1 : 0);
  writeAttr(stage, el, 'visibility', isShown ? 'visible' : 'hidden');
}

// 요소 el의 스타일 속성(사용자 정의 속성 포함) name을 value로 쓴다. 지금 값과 같으면 쓰지 않는다.
function writeStyle(stage, el, name, value) {
  const seen = stage.written.get(el) ?? {};
  const key = `style:${name}`;
  if (seen[key] === value) return;
  stage.written.set(el, { ...seen, [key]: value });
  el.style.setProperty(name, value);
}

// ---- 그리기 ----

/**
 * 모습(frame)을 그린다. 박자가 바뀌었을 때만 박자 전체 상태(상태 알약, 차트 계열, 점)를 새로 맞추고, 나머지는 프레임마다 모습의 값만 쓴다.
 * @param frame sampleScene이 돌려준 모습
 */
function paintFrame(stage, data, frame) {
  const seg = data.segs[frame.seg];
  const key = `${frame.seg}:${frame.phase}`;
  paintScene(stage, frame.si);
  if (stage.painted.key !== key) paintSegment(stage, seg, frame);
  stage.painted.key = key;
  paintCards(stage, frame.cards);
  paintHeld(stage, frame.held);
  paintEdges(stage, frame);
  paintValues(stage, frame);
  paintChartFrames(stage, data, frame.charts);
  paintPulses(stage, frame.pulses);
  stage.packets.forEach((packet) => packet.move(frame.elapsed));
  driveChartMotion(stage, frame);
}

// 순서 보기의 메시지, 메모, 구획, 활성 막대는 자기 장면(`data-si`)이 보일 때만 보인다. 장면이 바뀔 때 한 번 맞춘다. 장면에 들어서는 때와 다시 들어서는 때, 마지막 모습은 모두 같은 장면 번호의 요소만 보인다.
function paintScene(stage, si) {
  if (stage.painted.si === si) return;
  stage.painted.si = si;
  for (const el of stage.sceneEls) el.classList.toggle('fl-off', Number(el.dataset.si) !== si);
}

// 박자 전체에서 변하지 않는 상태. 상태 알약, 차트 계열(보임과 자람), 점. 마지막 모습(phase가 final)이면 계열이 다 자란 채이고 점이 없다.
function paintSegment(stage, seg, frame) {
  stage.statusEls.forEach((el) => showVariant(stage, el, Boolean(seg.status?.includes(el.dataset.st))));
  drawChartState(stage, seg, frame.phase === 'play');
  stage.packets.forEach((packet) => packet.remove());
  stage.packets = frame.phase === 'play' ? seg.hops.map((hop) => createPacket(hop, stage)) : [];
  stage.painted.cards = {};
}

// 도형(논리 id)마다 보일 카드. 바뀐 도형만 다시 쓰고, 같은 도형이 여러 판에 있으면 모두 쓴다. 카드 층이 있는 판만 쓰고, 카드 층이 있는 판이 하나도 없으면(머리만 그리는 순서 보기뿐) 건너뛴다.
// 판 순서에 따라 첫 판이 카드 층이 없는 순서 보기일 수 있어 첫 번호만 보지 않는다.
function paintCards(stage, cards) {
  for (const [id, indices] of stage.nodesById) {
    if (!indices.some((i) => stage.cardCounts[i]) || stage.painted.cards[id] === `${cards[id]}`) continue;
    stage.painted.cards[id] = `${cards[id]}`;
    for (const i of indices) if (stage.cardCounts[i]) showCard(stage, i, cards[id]);
  }
}

function showCard(stage, i, shown) {
  stage.cardEls[i].forEach((layer, k) => showVariant(stage, layer, shown === k));
  stage.nodes[i].querySelector('.fl-card')?.classList.toggle('filled', shown !== undefined);
}

// 켜진 도형, 그룹(논리 id)과 시간 보기의 부분, 차트 밝히기를 모습의 값대로 맞춘다.
function paintHeld(stage, held) {
  const lit = new Set(held.lit);
  const parts = new Set(held.parts);
  for (const [id, indices] of stage.nodesById) for (const i of indices) stage.nodes[i].classList.toggle('on', lit.has(id));
  for (const [id, indices] of stage.groupsById) for (const j of indices) stage.groups[j].classList.toggle('on', lit.has(id));
  stage.parts.forEach((part) => part.classList.toggle('on', parts.has(part.dataset.part)));
  paintLights(stage, held.lights);
}

// 밝힌 행이 있는 차트는 나머지 행을 흐린다. 밝힌 행이 없으면 흐리지 않는다. 차트마다 따로다.
function paintLights(stage, lights) {
  for (const [cardId, els] of Object.entries(stage.charts)) {
    const lit = lights[cardId] ?? [];
    const key = lit.join('\u0001');
    if (stage.painted.lights[cardId] === key) continue;
    stage.painted.lights[cardId] = key;
    stage.chartMeta[cardId].rowKeys.forEach((name, k) => els.rows[k].forEach((el) => el.classList.toggle('dim', lit.length > 0 && !lit.includes(name))));
  }
}

/**
 * 선과 고정 알약. 선은 점이 하나 이상 올라 있는 동안 is-current이고, 선과 알약은 켜 둔 선(held)이거나 알약 색이 남아 있는 동안 on이다.
 * 알약은 늘 그대로 보인다(글자와 중립 알약 바탕을 투명하게 하지 않는다). 점이 올라 있다가 비면 알약의 활성 색(--pill-tint, 1에서 0)만 줄어들어 중립으로 돌아온다.
 * 조용한 선(quiet)의 보임은 켜 둔 선이거나 알약 색이 남은 동안 `on`이 정한다. 켜 둔 선은 점이 지나간 뒤에도 남을 수 있지만 알약의 활성 색을 붙들지 않는다.
 */
function paintEdges(stage, frame) {
  const held = new Set(frame.held.edges);
  stage.edges.forEach(({ line, label }, j) => {
    if (!line) return;
    const tint = frame.edges[j]?.pill ?? 0;
    line.classList.toggle('is-current', Boolean(frame.edges[j]?.active));
    for (const el of [line, label]) el?.classList.toggle('on', held.has(j) || tint > 0);
    // 알약 색은 라벨 묶음과 선 묶음(관계 끝 글 `edgelabel`이 안에 있다)이 같은 세기를 읽는다.
    for (const el of [line, label]) if (el) writeStyle(stage, el, '--pill-tint', String(tint));
  });
}

// ---- 차트 계열 ----

// 차트마다 따로: 드러낸 계열을 보이고, 이 박자에 드러내는 계열은 자라는 움직임을 다시 건다(mayGrow가 거짓이면 걸지 않고 다 자란 채 둔다). 시간표에 이 차트의 상태가 없으면 모든 계열이 보인다.
function drawChartState(stage, seg, mayGrow) {
  for (const [cardId, els] of Object.entries(stage.charts)) {
    const state = seg.charts[cardId];
    const names = stage.chartMeta[cardId].series;
    els.series.forEach((list, s) => {
      const isGrowing = mayGrow && state?.growing.includes(names[s]);
      for (const el of list) {
        el.classList.toggle('hidden', state !== undefined && !state.series.includes(names[s]));
        el.classList.remove('play');
        if (isGrowing) {
          el.getBoundingClientRect();
          el.classList.add('play');
        }
      }
    });
  }
}

// 차트 움직임(막대, 선, 값 글자, 점의 CSS 애니메이션)을 박자 안 논리 시각에 둔다. 브라우저 시계를 따로 따르지 않게 늘 멈춰 두고 currentTime을 모습의 시각으로 쓴다.
// 마지막 모습은 끝까지 감는다. 시간이 거꾸로 가거나 건너뛰어도 같은 결과다.
function driveChartMotion(stage, frame) {
  for (const animation of stage.view.getAnimations({ subtree: true })) {
    if (!animation.animationName?.startsWith('chart-')) continue;
    animation.pause();
    if (frame.phase === 'final') animation.finish();
    else animation.currentTime = frame.elapsed;
  }
}

// ---- 점과 글 상자 ----

// 점과 글 상자. 글 상자 줄과 자리는 시간표가 움직이는 SVG와 같게 정해 넘긴다. move(elapsed)는 박자 안 시각에서 점의 자리와 보임만 정한다.
// 점은 그 선이 있는 판의 점 층에 놓는다. 선 번호와 흐름 길 번호가 판을 가로질러 하나뿐이어서 판은 data.edgePanels, data.trackPanels가 알려 준다.
function createPacket(hop, stage) {
  const { metrics } = stage;
  const isTrack = hop.track !== undefined;
  const path = isTrack ? stage.trackPaths[hop.track] : stage.paths[hop.edge];
  const layer = stage.packetLayers[isTrack ? stage.trackPanels[hop.track] : stage.edgePanels[hop.edge]];
  if (hop.tone !== undefined && !metrics.tones?.[hop.tone]) throw new Error(`이동의 색 이름이 정본이 아니다: ${JSON.stringify(hop.tone)}(가능: ${Object.keys(metrics.tones ?? {}).join(', ')})`);
  const color = hop.tone ? metrics.tones[hop.tone] : metrics.active;
  const outline = metrics.toneOutlines?.[hop.tone];
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'fl-packet');
  g.style.opacity = 0;
  g.setAttribute('fill', metrics.toneInks?.[hop.tone] ?? metrics.chipInk);
  g.innerHTML = `<circle r="${metrics.halo}" fill="${color}" opacity="${metrics.haloOpacity}"/><circle r="${metrics.packet}" fill="${color}"${outline ? ` stroke="${outline}" stroke-width="${metrics.chipStroke}"` : ''}/>`;
  layer.appendChild(g);
  const chip = hop.data ? createChip(hop.data, { layer, metrics, color: hop.tone ? color : undefined, outline }) : undefined;
  if (chip) g.appendChild(chip.g);
  const length = path.getTotalLength();
  const slide = chipSlide(hop, metrics);
  const end = hop.cut ?? hop.ms;
  let isDrawn = false;
  return {
    remove: () => g.remove(),
    move(elapsed) {
      const t = elapsed - (hop.at ?? 0);
      const isLive = t >= 0 && t < end;
      if (!isLive && !isDrawn) return;
      isDrawn = isLive;
      const p = Math.min(1, Math.max(0, t / hop.ms));
      const eased = progressAt(metrics.move, p, hop.pace);
      const point = path.getPointAtLength(length * (hop.isBack ? 1 - eased : eased));
      g.setAttribute('transform', `translate(${point.x} ${point.y})`);
      if (chip) {
        const [dx, dy, opacity] = slide(p);
        chip.g.setAttribute('transform', `translate(${dx} ${dy})`);
        chip.g.style.opacity = opacity * chipFadeAt(hop.chipFade, t);
      }
      const isInside = (hop.gaps ?? []).some(([from, to]) => eased > from && eased < to);
      g.style.opacity = isLive && !isInside ? cutFade(hop, t, metrics) : 0;
    },
  };
}

// 단계 끝에서 잘리는 점(hop.cut)이 끝 앞 cutFadeMs 동안 서서히 사라지는 불투명도. 그 밖의 점은 1이다.
function cutFade(hop, t, metrics) {
  return hop.cut === undefined ? 1 : Math.min(1, (hop.cut - t) / metrics.cutFadeMs);
}

function createChip(lines, { layer, metrics, color, outline }) {
  const chip = document.createElementNS(SVG_NS, 'g');
  const rect = document.createElementNS(SVG_NS, 'rect');
  rect.setAttribute('rx', metrics.chipRadius);
  rect.setAttribute('fill', color ?? metrics.chipFill);
  if (color) {
    rect.setAttribute('stroke', outline ?? color);
    rect.setAttribute('stroke-width', metrics.chipStroke);
  }
  chip.appendChild(rect);
  const texts = lines.map((line) => createChipLine(line, chip));
  // 글 폭은 그림 안에 있어야 잴 수 있어 점 층에 잠깐 붙인다. 점 묶음(g)이 곧 이 요소를 데려간다.
  layer.appendChild(chip);
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
