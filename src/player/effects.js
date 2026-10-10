// 브라우저에서 돈다(play.js와 한 스크립트로 이어 붙는다). 후광(도착, 차트 표)과 차트 틀 바꾸기를 그린다.
// 모습(frame.pulses, frame.charts)이 가리키는 값을 그대로 쓰고, 지난 프레임의 후광이 남았는지는 마지막으로 그린 키 집합으로만 본다.

// 도형 윤곽 후광을 겹칠 윤곽 요소를 찾는 선택자. 모든 도형 종류의 바깥 윤곽은 도형 묶음 바로 아래의 .fl-stroke 요소이고, 종류에 따라 하나(상자, 표, 차트 카드 등)이거나 여럿(저장소: 몸통과 뚜껑)이다.
// 윤곽 요소가 없는 도형은 후광이 없다.
const OUTLINE_SELECTOR = ':scope > .fl-stroke';

/**
 * 후광을 그린다. 도착 후광은 도형 윤곽과 같은 모양의 겹침 선 하나의 불투명도이고(면이나 선 굵기를 키우지 않는다),
 * 차트 표식 후광은 문서에 미리 들어 있는 표식 겹침(chart/pulse-overlay.js)의 불투명도다. 겹침의 색은 표식이 싣고 온 계열 칠이라 표식 자신의 칠과 테두리는 그대로다.
 * 같은 도형과 같은 차트가 여러 곳에 그려져도 후광은 논리 사건 하나이고, 있는 곳마다 같은 값을 쓴다.
 */
function paintPulses(stage, pulses) {
  for (const [id, indices] of stage.nodesById) {
    const level = pulses[`node:${id}`] ?? 0;
    for (const i of indices) for (const overlay of level > 0 ? overlayOf(stage, i) : (stage.overlays[i] ?? [])) writeAttr(stage, overlay, 'opacity', level);
  }
  const live = new Set(Object.keys(pulses).filter((key) => key.startsWith('chart:')));
  for (const key of new Set([...stage.painted.marks, ...live])) {
    const level = live.has(key) ? pulses[key] : 0;
    for (const overlay of markOverlays(stage, key)) writeAttr(stage, overlay, 'opacity', level);
  }
  stage.painted.marks = live;
}

// 도형 i의 도착 후광 겹침 선 목록. 도형 윤곽(.fl-stroke)마다 복제해 면을 없애고 그 바로 위에 겹친다. 처음 필요할 때 한 번 만든다.
// 윤곽 요소가 없는 도형은 후광이 없어 빈 목록이다(OUTLINE_SELECTOR).
function overlayOf(stage, i) {
  if (stage.overlays[i] !== undefined) return stage.overlays[i];
  stage.overlays[i] = [...stage.nodes[i].querySelectorAll(OUTLINE_SELECTOR)].map((outline) => {
    const overlay = outline.cloneNode(false);
    overlay.removeAttribute('id');
    // 도착 후광은 도형이 고른 색과 상관없이 공통 UI 강조 색이다(figure.css .fl-pulse).
    overlay.setAttribute('class', 'fl-pulse');
    overlay.setAttribute('opacity', 0);
    overlay.setAttribute('aria-hidden', 'true');
    outline.after(overlay);
    return overlay;
  });
  return stage.overlays[i];
}

// 후광 키 `chart:차트 id:표식 id`의 표식 겹침들. 같은 차트가 여러 판에 그려지면 모두 돌려준다.
function markOverlays(stage, key) {
  const rest = key.slice('chart:'.length);
  const split = rest.indexOf(':');
  const [chart, mark] = [CSS.escape(rest.slice(0, split)), CSS.escape(rest.slice(split + 1))];
  return stage.view.querySelectorAll(`[data-chart="${chart}"] [data-pulse-of="${mark}"]`);
}

// 표식을 바꿀 때 그 표식의 겹침도 표식의 지금 모양에 맞춘다(보이지 않을 때도 같아서 겹침의 모양은 지나온 시각에 기대지 않는다).
// 글 표식의 겹침은 표식 바로 앞에, 모양 표식의 겹침은 바로 뒤에 있다(나타나는 표식은 `.fl-mark-pulse-wrap` 묶음 하나가 사이에 든다). 따라갈 속성은 문서를 만들 때 정한 목록(metrics.markGeometry)이고 칠은 따라가지 않는다.
function followMark(stage, base) {
  const isText = base.localName === 'text';
  const next = isText ? base.previousElementSibling : base.nextElementSibling;
  // 나타나는 표식(점, 값 글자)의 겹침은 표식과 같은 나타남을 받는 묶음 안에 있다.
  const overlay = next?.classList.contains('fl-mark-pulse-wrap') ? next.firstElementChild : next;
  if (!overlay?.hasAttribute('data-pulse-of')) return;
  for (const name of stage.metrics.markGeometry) {
    const value = base.getAttribute(name);
    if (value === null) overlay.removeAttribute(name);
    else if (overlay.getAttribute(name) !== value) overlay.setAttribute(name, value);
  }
  if (isText && overlay.innerHTML !== base.innerHTML) overlay.innerHTML = base.innerHTML;
}

/**
 * 차트 틀 바꾸기. 보일 틀(frames[i])의 표 가운데 지금 그려진 틀과 속성이나 글이 다른 표만 쓴다. 처음 그리거나 틀을 건너뛰어도 같은 결과다.
 * @param shown { 차트 id: 틀 번호 }
 */
function paintChartFrames(stage, data, shown) {
  for (const [cardId, index] of Object.entries(shown)) {
    const frames = data.chartFrames?.[cardId]?.frames;
    const was = stage.painted.chartFrames[cardId];
    if (!frames || was === index) continue;
    const names = attrNamesOf(data.chartFrames[cardId]);
    for (const [mark, next] of Object.entries(frames[index])) if (was === undefined || JSON.stringify(frames[was][mark]) !== JSON.stringify(next)) setMark(stage, cardId, mark, next, names[mark]);
    stage.painted.chartFrames[cardId] = index;
  }
}

// 표마다 어느 틀에서든 쓰인 속성 이름. 틀에 없는 속성은 지워야 이전 틀에만 있던 속성이 남지 않는다. 데이터마다 한 번 구해 둔다.
const attrNameCache = new WeakMap();
function attrNamesOf(chartFrames) {
  if (!attrNameCache.has(chartFrames)) {
    const names = {};
    for (const frame of chartFrames.frames) for (const [mark, { attrs }] of Object.entries(frame)) names[mark] = [...new Set([...(names[mark] ?? []), ...Object.keys(attrs)])];
    attrNameCache.set(chartFrames, names);
  }
  return attrNameCache.get(chartFrames);
}

// 재생기가 요소에 직접 달고 떼는 class. 표의 class 속성을 바꿀 때 이 class는 그대로 둔다.
const PLAYER_CLASSES = ['hidden', 'play', 'dim'];

// 표 하나를 틀의 속성과 글로 만든다. names에 있고 틀에 없는 속성은 지워 어떤 틀에서 왔든 같은 결과가 된다. 글은 차트 그리기가 이스케이프한 글이라 markup으로 쓴다.
// 글 요소(data-mark-text)도 자리 속성(x, y)이 틀마다 다르므로 속성을 쓴다.
function setMark(stage, cardId, mark, { attrs, text }, names) {
  const scope = `[data-chart="${CSS.escape(cardId)}"]`;
  const id = CSS.escape(mark);
  for (const el of stage.view.querySelectorAll(`${scope} [data-mark="${id}"], ${scope} [data-mark-text="${id}"]`)) {
    for (const name of names) {
      if (name === 'class') el.setAttribute('class', [...(attrs.class ?? '').split(/\s+/).filter(Boolean), ...PLAYER_CLASSES.filter((c) => el.classList.contains(c))].join(' '));
      else if (name in attrs) el.setAttribute(name, attrs[name]);
      else el.removeAttribute(name);
    }
    if (text !== undefined && el.hasAttribute('data-mark-text')) el.innerHTML = text;
    followMark(stage, el);
  }
}
