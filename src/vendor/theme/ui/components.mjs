// 테마 값으로 표현하는 기본 구성 요소다.
import { escape, safeUrl, trusted, isTrusted, slot, id, out } from './html.mjs';
import { ToolButton, Toolbar, ToolHeader } from './toolbar.mjs';
const CARD_VARIANTS = ['centered', 'grouped', 'inline', 'related', 'summary'];

/** 본문 블록 폭: content(본문 폭), narrow(좁은 미디어 폭), wide(넓은 미디어 폭). 옛 표기 `wide: true`, `size: 'compact'`도 받는다. */
export const WIDTHS = ['content', 'narrow', 'wide'];
export function contentWidth({ width, wide, size } = {}) {
  if (width !== undefined && !WIDTHS.includes(width)) throw new Error(`Unknown width: ${width}`);
  const aliases = [wide === true ? 'wide' : undefined, size === 'compact' ? 'narrow' : undefined].filter(Boolean);
  if (size !== undefined && size !== 'compact') throw new Error(`Unknown size: ${size}`);
  if (aliases.length > 1 || (width !== undefined && aliases.length && aliases[0] !== width)) throw new Error(`Conflicting width: ${[width, ...aliases].filter(Boolean).join(', ')}`);
  return width ?? aliases[0] ?? 'content';
}
export const widthClass = (props) => { const width = contentWidth(props); return width === 'content' ? '' : ` app-width-${width}`; };

export function CopyButton({ label = '코드 복사' } = {}) {
  return ToolButton({ action: 'copy', label, icon: 'copy', hidden: true });
}

export const SYNTAX_ROLES = Object.freeze(['keyword', 'string', 'number', 'function', 'type', 'property', 'parameter', 'variable', 'constant', 'comment', 'operator', 'punctuation', 'annotation']);

export function syntaxClass(role) {
  if (role === undefined) return '';
  if (!SYNTAX_ROLES.includes(role)) throw new Error(`Unknown syntax role: ${role}`);
  return `app-syntax-${role}`;
}

/** 분석기는 역할과 원문만 전달한다. 색과 글꼴은 공통 테마가 소유한다. */
export function SyntaxToken({ text, role }) {
  const name = syntaxClass(role);
  return out(name ? `<span class="${name}">${escape(text)}</span>` : escape(text));
}

/** `code`는 이스케이프 또는 구문 강조를 마친 `<code>` 슬롯이다. */
export function CodeBlock({ code, label = '코드 복사', language = '', filename = '', width }) {
  const heading = [language, filename].filter(Boolean).join(' · ');
  const toolbar = Toolbar({ label: '코드 도구', buttons: [CopyButton({ label })] });
  return out(`<div class="app-code app-tool-surface${widthClass({ width })}">${ToolHeader({ label: heading, toolbar })}<pre>${slot(code, 'code')}</pre></div>`);
}

export function Callout({ title, tone, fineprint = false, body }) {
  return out(`${Callout.open({ title, tone, fineprint })}${slot(body, 'body')}${Callout.close()}`);
}
Callout.open = ({ title, tone, fineprint = false }) => `<aside class="app-callout${tone === 'warning' ? ' is-warning' : ''}${fineprint ? ' is-fineprint' : ''}"><strong>${escape(title)}</strong>`;
Callout.close = () => '</aside>';

export function TooltipTrigger({ id: target, label }) {
  return out(`<button class="app-tooltip" type="button" popovertarget="${id(target)}" data-tooltip-trigger>${escape(label)}</button>`);
}
/** 글자만 있으면 문장 안에 들어가는 `span`, 슬롯 본문이면 블록 `div`다. */
export function TooltipBubble({ id: target, text, body }) {
  return out(body === undefined
    ? `<span class="app-tooltip-bubble" id="${id(target)}" role="tooltip" popover>${escape(text)}</span>`
    : `<div class="app-tooltip-bubble" id="${id(target)}" popover>${slot(body, 'body')}</div>`);
}
/** 문장 안 설명: 눌러 여는 글 + 말풍선. */
export const Tooltip = ({ id: target, label, text }) => out(`${TooltipTrigger({ id: target, label })}${TooltipBubble({ id: target, text })}`);
/** 블록 설명: 단락 하나의 단추 + 슬롯 본문 말풍선. */
export const TooltipBlock = ({ id: target, label, body }) => out(`<p>${TooltipTrigger({ id: target, label })}</p>${TooltipBubble({ id: target, body })}`);

export const TAB_FRAMES = ['none', 'panel'];
export const TAB_POSITIONS = ['bottom', 'top'];
export const TAB_SELECTORS = ['buttons', 'segmented', 'numbers'];
// 기본은 frame none, position bottom, selector buttons(둥근 단추)다. 기본을 벗어난 값만 클래스가 된다(is-frame-panel, is-position-top, is-selector-segmented|numbers).
// platform은 기기별 안내 묶음으로 panel, top, buttons와 같고 `is-platform` 클래스 하나로 나타낸다.
function tabVariant({ platform = false, frame, position, selector }) {
  if (frame !== undefined && !TAB_FRAMES.includes(frame)) throw new Error(`Unknown tabs frame: ${frame}`);
  if (position !== undefined && !TAB_POSITIONS.includes(position)) throw new Error(`Unknown tabs position: ${position}`);
  if (selector !== undefined && !TAB_SELECTORS.includes(selector)) throw new Error(`Unknown tabs selector: ${selector}`);
  if (platform) {
    if ((frame ?? 'panel') !== 'panel' || (position ?? 'top') !== 'top' || (selector ?? 'buttons') !== 'buttons') throw new Error('Platform tabs always use frame panel, position top and selector buttons');
    return { frame: 'panel', position: 'top', selector: 'buttons', classes: '' };
  }
  const [f, p, s] = [frame ?? 'none', position ?? 'bottom', selector ?? 'buttons'];
  return { frame: f, position: p, selector: s, classes: `${f === 'none' ? '' : ` is-frame-${f}`}${p === 'bottom' ? '' : ` is-position-${p}`}${s === 'buttons' ? '' : ` is-selector-${s}`}` };
}
/** 패널과 별도로 조립할 수 있는 선택 줄. controls는 같은 캔버스를 공유하는 장면에도 쓸 수 있다. */
export function TabList({ id: group, label = '탭', labels, selector = 'buttons', selected = 0, controls, inlineCode = false, afterPanel = false }) {
  id(group);
  if (!TAB_SELECTORS.includes(selector)) throw new Error(`Unknown tabs selector: ${selector}`);
  const numbers = selector === 'numbers';
  const content = text => inlineCode ? String(text).split('`').map((part, at) => at % 2 ? `<code>${escape(part)}</code>` : escape(part)).join('') : escape(text);
  return out(`<div class="app-tablist${afterPanel ? ' is-after-panel' : ''}${selector === 'buttons' ? '' : ` is-${selector}`}" role="tablist" aria-label="${escape(label)}">${labels.map((text, index) => `<button type="button" id="${group}-tab-${index}" role="tab" aria-selected="${index === selected}" aria-controls="${id(controls?.[index] ?? `${group}-panel-${index}`)}" tabindex="${index === selected ? '0' : '-1'}"${numbers ? ` aria-label="${escape(text ?? `탭 ${index + 1}`)}"` : ''}>${numbers ? index + 1 : content(text)}</button>`).join('')}</div>`);
}
/**
 * 탭 묶음. `tabs`는 `{ label, body }`이고 body는 슬롯이다.
 * 옵션: `frame`(none, panel), `position`(bottom, top), `selector`(buttons, segmented, numbers), `width`(content, narrow, wide), `selected`(처음 보이는 탭).
 * 모두 생략하면 상자 없이 둥근 단추 줄이 패널 아래에 온다. `numbers`만 라벨 없이 쓸 수 있고 버튼에는 번호, 접근성 이름에는 라벨이 나온다.
 * 보이는 패널만 높이를 차지하므로 선택 줄은 현재 내용 바로 옆에 붙는다. `position: bottom`이면 탭 목록이 패널 뒤에 놓인다.
 */
export function Tabs({ id: group, label, platform = false, tabs, frame, position, selector, selected = 0, width, wide }) {
  if (!Array.isArray(tabs) || !tabs.length) throw new Error('Tabs require tabs');
  if (!Number.isInteger(selected) || selected < 0 || selected >= tabs.length) throw new Error('Tabs selected index is out of range');
  const props = { id: group, label, platform, labels: tabs.map((tab) => tab.label), frame, position, selector, selected, width, wide };
  return out(`${Tabs.open(props)}${tabs.map((tab, index) => `${Tabs.panelOpen({ id: group, index, selected })}${slot(tab.body, 'tab body')}${Tabs.panelClose()}`).join('')}${Tabs.close(props)}`);
}
Tabs.open = (props) => {
  const { id: group, label = props.platform ? '기기별 안내' : '탭', platform = false, labels } = props;
  const variant = tabVariant(props);
  return `<section class="app-tabs${platform ? ' is-platform' : ''}${variant.classes}${widthClass({ width: props.width, wide: props.wide })}" data-tabs${platform ? ' data-platform' : ''}>${variant.position === 'bottom' ? '' : TabList({ id: group, label, labels, selector: variant.selector, selected: props.selected })}`;
};
Tabs.panelOpen = ({ id: group, index, selected = 0 }) => `<div class="app-tabpanel" id="${id(group)}-panel-${index}" role="tabpanel" aria-labelledby="${group}-tab-${index}" tabindex="0"${index === selected ? '' : ' hidden'}>`;
Tabs.panelClose = () => '</div>';
// 위치가 bottom이면 탭 목록은 닫을 때 낸다. 열 때와 같은 속성을 넘긴다.
Tabs.close = (props) => {
  if (!props) throw new Error('Tabs.close needs the same props as Tabs.open');
  const variant = tabVariant(props);
  if (variant.position !== 'bottom') return '</section>';
  const { id: group, label = props.platform ? '기기별 안내' : '탭', labels } = props;
  return `${TabList({ id: group, label, labels, selector: variant.selector, selected: props.selected, afterPanel: true })}</section>`;
};

/** 도움말 카드. `icon`은 슬롯이고 없으면 아이콘 자리가 없다. `related`는 이어서 읽을 글의 한 줄 카드(작은 아이콘, 제목, 갈매기표)이며 설명은 그리지 않는다. `headingLevel`을 주면 제목이 해당 단계의 제목 역할이 된다. */
export function Card({ href, title, description = '', icon, variant, compact = false, horizontal = false, headingLevel, rel, label }) {
  if (variant !== undefined && !CARD_VARIANTS.includes(variant)) throw new Error(`Unknown card variant: ${variant}`);
  const link = safeUrl(href);
  const heading = headingLevel === undefined ? '<strong>' : `<strong role="heading" aria-level="${Number(headingLevel)}">`;
  const mark = icon === undefined || icon === false ? '' : slot(icon, 'icon');
  if (variant === 'related') return out(`<a class="app-help-card app-related-link${mark ? '' : ' has-no-icon'}" href="${link}"${rel ? ` rel="${escape(rel)}"` : ''}${label ? ` aria-label="${escape(label)}"` : ''}>${mark}${heading}${escape(title)}</strong></a>`);
  const classes = variant ? ` is-${variant}` : compact ? ' is-compact' : horizontal ? ' is-horizontal' : '';
  const bare = !mark || (compact && !variant);
  return out(`<a class="app-help-card${classes}${bare ? ' has-no-icon' : ''}" href="${link}">${bare ? '' : mark}${heading}${escape(title)}</strong>${description ? `<p${variant === 'summary' ? ' class="app-card-summary"' : ''}>${escape(description)}</p>` : ''}</a>`);
}

/** 카드 묶음. `cards`는 Card 결과(슬롯)의 배열이다. `split`은 첫 카드를 크게 두는 배치다. */
export function CardGroup({ variant, columns, split = false, cards }) {
  const items = cards.map((card) => slot(card, 'card'));
  if (split && variant !== 'inline' && variant !== 'related') return out(`<div class="app-support-split">${items[0]}<div class="app-support-links">${items.slice(1).join('')}</div></div>`);
  return out(`${CardGroup.open({ variant, columns })}${items.join(CardGroup.gap(variant))}${CardGroup.close()}`);
}
CardGroup.open = ({ variant, columns }) => variant === 'related' ? '<div class="app-related-grid">' : variant === 'inline' ? '<div class="app-inline-links">' : `<div class="app-support-grid${({ 2: ' is-pair', 4: ' is-four', 5: ' is-five' })[Number(columns)] ?? ''}">`;
CardGroup.close = () => '</div>';
CardGroup.gap = (variant) => variant === 'inline' ? ' ' : '';

/**
 * 번호 단추로 한 장씩 보는 갤러리. 모양과 동작은 `Tabs`(기본 frame none, position bottom)를 그대로 쓴다.
 * 이름이 모두 있으면 분할 선택 줄, 아니면 번호 줄이다. 보이는 장만 높이를 차지하므로 선택 줄은 현재 그림 바로 아래에 있다.
 * `slides`는 `{ image(슬롯), caption, label }`이다.
 */
export function Gallery({ id: group, title = '이미지 슬라이드', wide, width, selected = 0, slides }) {
  if (!Array.isArray(slides) || !slides.length) throw new Error('Gallery requires slides');
  if (!Number.isInteger(selected) || selected < 0 || selected >= slides.length) throw new Error('Gallery selected index is out of range');
  const labeled = slides.every((slide) => typeof slide.label === 'string');
  return Tabs({
    id: group, label: title, selector: labeled ? 'segmented' : 'numbers', selected, width, wide,
    tabs: slides.map((slide, index) => ({ label: slide.label ?? `슬라이드 ${index + 1}`, body: Figure({ media: slide.image, caption: slide.caption }) })),
  });
}

/** 그림과 영상 같은 미디어 한 장. `media`는 슬롯, `href`를 주면 링크로 감싼다. `controls` 슬롯은 캡션 줄에 붙는다. */
export function Figure({ media, href, caption = '', controls, width, wide, size }) {
  const body = href === undefined ? slot(media, 'media') : `<a href="${safeUrl(href)}">${slot(media, 'media')}</a>`;
  return out(`<figure class="${FIGURE_CLASS}${widthClass({ width, wide, size })}">${body}${caption || controls ? `<figcaption>${escape(caption)}${controls === undefined ? '' : slot(controls, 'controls')}</figcaption>` : ''}</figure>`);
}

const GRID_COLUMNS = { 1: 'one-column', 2: 'two-columns', 3: 'three-columns', 4: 'four-columns', 5: 'five-columns', 6: 'six-columns' };
/** 그림 격자. `figures`는 Figure 결과의 배열이다. */
export function FigureGrid({ columns, size, figures }) {
  if (!Array.isArray(figures) || !figures.length) throw new Error('FigureGrid needs figures');
  if (columns !== undefined && !(['number', 'string'].includes(typeof columns) && Object.hasOwn(GRID_COLUMNS, columns))) throw new Error(`Invalid columns: ${columns}`);
  if (size !== undefined && !['small', 'large'].includes(size)) throw new Error(`Invalid size: ${size}`);
  return out(`<div class="app-figure-grid${size ? ` is-${size}` : ''}${columns === undefined ? '' : ` has-${GRID_COLUMNS[columns]}`}">${figures.map((figure) => `<div class="app-figure-grid-item">${slot(figure, 'figure')}</div>`).join('')}</div>`);
}

/** 영상 자리. `src`, `poster`는 소비자가 확인한 주소다. */
export function Player({ id: target, src, poster, title = '기능 소개 영상', width, height, controls = false, overlay = false, wide = false }) {
  return out(`<div class="app-player${wide ? ' is-wide' : ''}${controls ? ' has-controls' : ''}" data-player id="${id(target)}"><video${width ? ` width="${Number(width)}"` : ''}${height ? ` height="${Number(height)}"` : ''} playsinline${controls ? '' : ' muted'} preload="none" poster="${safeUrl(poster)}" aria-label="${escape(title)}"${controls ? ' data-native-controls' : ''}><source src="${safeUrl(src)}" type="video/mp4"></video>${overlay || controls ? '<button class="app-player-button" type="button" data-player-play aria-label="Play video"></button>' : ''}<span class="app-sr" role="status"></span></div>`);
}
export function RemoteButton({ id: target, src, icon }) {
  return out(`<button class="app-remote" type="button" data-remote="${id(target)}"${src ? ` data-video-src="${safeUrl(src)}"` : ''} aria-label="Play video">${slot(icon, 'icon')}<span>Play</span></button>`);
}
/** 기기 틀. `label`을 주면 이름이 있는 `figure`, `figure: true`면 이름 없는 `figure`, 아니면 `div`다. */
export function Device({ screen, overlay, label, figure = false }) {
  const inner = `<div class="app-device-screen">${slot(screen, 'screen')}</div>${slot(overlay, 'overlay')}`;
  if (label !== undefined) return out(`<figure class="app-device" aria-label="${escape(label)}">${inner}</figure>`);
  return out(figure ? `<figure class="app-device">${inner}</figure>` : `<div class="app-device">${inner}</div>`);
}
export const MediaControls = ({ remote }) => out(`<div class="app-media-controls">${slot(remote, 'remote')}</div>`);
/** 본문 영상: 내부 재생 조작과 선택 캡션. 홈의 외부 재생 링크는 RemoteLink가 맡는다. */
export function Video({ id: target, src, poster, title, caption, playerWidth, playerHeight, playerWide = false, frame, deviceOverlay, width, wide, size }) {
  const view = Player({ id: target, src, poster, title, width: playerWidth, height: playerHeight, controls: true, wide: playerWide });
  const media = frame === 'iphone' ? Device({ screen: view, overlay: deviceOverlay }) : view;
  return Figure({ media, caption, width, wide, size });
}

export const FIGURE_CLASS = 'app-figure';
/** 작은 글씨 단락. 토큰 스트림에서는 문단에 이 클래스를 붙인다. */
export const FINEPRINT_CLASS = 'app-fineprint';
export const Fineprint = ({ text }) => out(`<p class="${FINEPRINT_CLASS}">${slot(text, 'text')}</p>`);
/** 넓은 간격의 목록(단계). */
export const Steps = ({ body }) => out(`${Steps.open()}${slot(body, 'body')}${Steps.close()}`);
Steps.open = () => '<div class="app-steps">';
Steps.close = () => '</div>';
/** 질문과 답 표. 토큰 스트림에서는 정의 목록에 이 클래스를 붙인다. */
export const DEFINITIONS_CLASS = 'app-definitions';
export const Definitions = ({ items }) => out(`<dl class="${DEFINITIONS_CLASS}">${items.map((item) => `<dt>${escape(item.term)}</dt><dd>${slot(item.body, 'body')}</dd>`).join('')}</dl>`);

export const Kbd = ({ text }) => out(`<kbd>${escape(text)}</kbd>`);
export const Menu = ({ text }) => out(`<b class="app-menu-label">${escape(text)}</b>`);
export const InlineIcon = ({ icon }) => out(`<span class="app-inline-icon">${slot(icon, 'icon')}</span>`);
export const CancelledTask = () => out('<span class="app-cancelled-task" role="img" aria-label="취소된 작업"></span>');
