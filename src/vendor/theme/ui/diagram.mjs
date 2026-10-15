import { escape, safeUrl, out, trusted } from './html.mjs';
import { TabList, widthClass } from './components.mjs';
import { ToolButton, Toolbar, ToolHeader } from './toolbar.mjs';

/** 정적으로 만든 도표 문서를 공통 프레임에 넣는다. 크기는 콘텐츠의 측정값이다. */
export function DiagramEmbed({ src, title, dimensions, width }) {
  if (!src.startsWith('/') || src.startsWith('//')) throw new TypeError('Diagram source must be local');
  if (![dimensions?.width, dimensions?.height].every(value => Number.isFinite(value) && value > 0)) throw new TypeError('Diagram dimensions must be positive');
  return out(`<figure class="app-diagram${widthClass({ width })}"><iframe data-diagram src="${safeUrl(src)}" title="${escape(title)}" width="${Math.ceil(dimensions.width)}" height="${Math.ceil(dimensions.height)}" loading="lazy" allow="fullscreen; clipboard-write" allowfullscreen></iframe></figure>`);
}

const zoomTools = trusted(`<div class="fl-zoom app-tool-group">${[
  ['in', '확대', 'zoom-in'], ['out', '축소', 'zoom-out'], ['fit', '전체 보기', 'scan'],
].map(([zoom, label, icon]) => ToolButton({ action: `zoom-${zoom}`, zoom, label, icon })).join('')}</div>`);
const VIEW_BUTTONS = ToolHeader({ toolbar: Toolbar({ label: '그림 도구', buttons: [
  ToolButton({ action: 'copy', className: 'fl-copy', label: '문법 복사', icon: 'copy' }),
  ToolButton({ action: 'download', className: 'fl-download', label: 'HTML 다운로드', icon: 'download' }),
  ToolButton({ action: 'fullscreen', className: 'fl-full', label: '전체화면', icon: 'maximize-2' }),
], extra: zoomTools }) });

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 원본 글자 수
// basis: estimate
/**
 * 원본 글을 문서에 싣는 JSON 칸. 글을 JSON 문자열 하나로 쓰고 `<`, `>`, `&`, 줄 구분 문자는 \u 이스케이프로 바꿔 HTML 어디에 있어도 요소나 주석이 열리지 않는다.
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
 * @param source 원본 글. 없으면 복사 단추가 숨는다
 */
export function DiagramFrame({ canvas, className = '', style = '', narrow = '', source, labels = [] }) {
  return `<figure class="fl-figure${className}" tabindex="0"${style}>
<div class="fl-surface app-tool-surface">
${VIEW_BUTTONS}
<div class="fl-canvas" id="scene-panel" role="tabpanel" aria-label="그림" tabindex="0">${canvas}</div>
</div>
${narrow}
${source === undefined ? '' : sourceScript(source)}
<div class="fl-foot">
${TabList({ id: 'scene', label: '장면 선택', labels, controls: labels.map(() => 'scene-panel'), inlineCode: true, afterPanel: true })}
</div>
</figure>`;
}

// HTML과 SVG가 공유하는 성장 모양. 장면의 시각은 소비자가 계산한다.
export const CHART_GROWTH = [
  ['rise', 'transform: scaleY(0)', 'transform: none'],
  ['grow', 'transform: scaleX(0)', 'transform: none'],
  ['draw', 'stroke-dashoffset: 1', 'stroke-dashoffset: 0'],
  ['wipe', 'clip-path: inset(0 100% 0 0)', 'clip-path: inset(0 0 0 0)'],
];

/** 성장 시간과 경로 위 점의 도착 비율로 HTML 재생 스타일을 만든다. */
export function chartMotionCss(growMs, dotAts = []) {
  if (!Number.isFinite(growMs) || growMs < 0) throw new RangeError('Chart growth time must be finite and nonnegative');
  if (!Array.isArray(dotAts) || dotAts.some(at => !Number.isFinite(at) || at < 0 || at > 1)) throw new RangeError('Chart arrival ratios must be between zero and one');
  const dots = dotAts.map(at => `.fl .play .dot[data-at="${at}"] { animation-delay: ${Math.round(at * growMs)}ms; }`);
  const growth = CHART_GROWTH.map(([name, from]) => `.fl .play .${name}, .fl .play.${name} { animation: chart-${name} ${growMs}ms var(--ease-reveal) both; }
@keyframes chart-${name} { from { ${from}; } }`);
  return `
.fl .play .dot, .fl .play.dot { animation: chart-dot var(--duration-fast) var(--ease-reveal) both; }
@keyframes chart-dot { from { opacity: 0; } }
${dots.join('\n')}
${growth.join('\n')}
.fl .play .pop, .fl .play.pop, .fl .play .late, .fl .play.late { animation: chart-fade ${growMs}ms var(--ease-reveal) both; }
@keyframes chart-fade { 0%, 50% { opacity: 0; } }
`;
}
