import { escape, safeUrl, out } from './html.mjs';
import { TabList } from './components.mjs';

/** 정적으로 만든 도표 문서를 공통 프레임에 넣는다. 크기는 콘텐츠의 측정값이다. */
export function DiagramEmbed({ src, title, width, height }) {
  if (!src.startsWith('/') || src.startsWith('//')) throw new TypeError('Diagram source must be local');
  if (![width, height].every(value => Number.isFinite(value) && value > 0)) throw new TypeError('Diagram dimensions must be positive');
  return out(`<figure class="app-diagram"><iframe data-diagram src="${safeUrl(src)}" title="${escape(title)}" width="${Math.ceil(width)}" height="${Math.ceil(height)}" loading="lazy" allow="fullscreen; clipboard-write" allowfullscreen></iframe></figure>`);
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 원 단추 하나. 문법 복사, HTML 다운로드, 전체 화면, 확대·축소가 모두 이 구성을 쓴다. 아이콘은 player/view.js와 player/export.js가 같은 격자에서 그린다.
function roundButton(extraClass, { label, zoom } = {}) {
  const className = extraClass ? `fl-round ${extraClass}` : 'fl-round';
  const labelAttr = label ? ` aria-label="${label}" title="${label}"` : '';
  const zoomAttr = zoom ? ` data-zoom="${zoom}"` : '';
  return `<button type="button" class="${className}"${zoomAttr}${labelAttr}></button>`;
}

// 도구 막대는 모든 그림과 모든 곳(단독, 삽입, 내려받은 파일)에서 같다. 순서는 문법 복사, HTML 다운로드, 전체 화면이다. 맨 앞의 상태 칸은 복사와 내려받기의 결과를 짧게 알린다(비어 있으면 폭이 0이다).
// 확대·축소는 전체 화면에서만 보인다. 재생을 다루는 단추는 두지 않는다.
const VIEW_BUTTONS =
  `<div class="fl-view-tools" role="toolbar" aria-label="그림 도구"><span class="fl-tool-status" role="status" aria-live="polite"></span>` +
  `${roundButton('fl-copy', { label: '문법 복사' })}${roundButton('fl-download', { label: 'HTML 다운로드' })}${roundButton('fl-full', { label: '전체화면' })}` +
  `<div class="fl-zoom">${roundButton('', { label: '확대', zoom: 'in' })}${roundButton('', { label: '축소', zoom: 'out' })}${roundButton('', { label: '전체 보기', zoom: 'fit' })}</div></div>`;

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 원본 글자 수
// basis: estimate
/**
 * 원본 글(.dap 문법)을 문서에 싣는 JSON 칸. 글을 JSON 문자열 하나로 쓰고 `<`, `>`, `&`, 줄 구분 문자는 \u 이스케이프로 바꿔 HTML 어디에 있어도 요소나 주석이 열리지 않는다.
 * 줄바꿈(CRLF 포함)은 JSON 이스케이프로 그대로 남아 복사한 글이 원본과 같다. 이 칸은 정본 템플릿 안에 있으므로 내려받은 파일에서도, 다시 내려받아도 같다.
 */
function sourceScript(source) {
  const encoded = JSON.stringify(source).replace(/[<>&\u2028\u2029]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
  return `<script type="application/json" class="fl-source">${encoded}</script>`;
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 그림 글자 수
// basis: estimate
/**
 * 그림 틀(figure). 장면 탭은 빌드 때 만들고 재생기가 선택 동작을 연결한다. 재생 조작 단추와 글 설명은 없다.
 * 탭 줄(.fl-foot)은 그림(.fl-surface) 바로 아래 문서 흐름에 놓인 가운데 줄이다(CSS). 그림 위를 덮지 않는다. 그림 뒤에는 아무것도 오지 않는다.
 * @param canvas 그림 영역 안쪽 마크업(판 묶음, html.js panelsMarkup)
 * @param className figure 요소에 더할 class(앞에 공백 포함, 없으면 빈 글)
 * @param style figure 요소에 더할 속성 글(앞에 공백 포함, 없으면 빈 글)
 * @param narrow 좁은 배치의 판 묶음을 담은 template 글(없으면 빈 글)
 * @param source 원본 글(.dap). 없으면 복사 단추가 숨는다
 */
export function DiagramFrame({ canvas, className = '', style = '', narrow = '', source, labels = [] }) {
  return `<figure class="fl-figure${className}" tabindex="0"${style}>
<div class="fl-surface">
${VIEW_BUTTONS}
<div class="fl-canvas" id="scene-panel" role="tabpanel" aria-label="그림" tabindex="0">${canvas}</div>
</div>
${narrow}
${source === undefined ? '' : sourceScript(source)}
<div class="fl-foot">
${TabList({ id: 'scene', label: '장면 선택', labels, selector: 'segmented', controls: labels.map(() => 'scene-panel'), inlineCode: true })}
</div>
</figure>`;
}
