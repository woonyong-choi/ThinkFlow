import { escape, out, slot } from './html.mjs';
import { ControlIcon } from './icons.mjs';

/** 조작 아이콘의 경로는 공통 자산이고 크기와 획은 공통 CSS가 정한다. */
export function ToolIcon(name) {
  return String(ControlIcon(name, 'app-tool-icon'));
}

export function ToolButton({ action, label, icon, className = '', hidden = false, zoom }) {
  if (!/^[a-z][a-z-]*$/.test(action) || !/^[a-z -]*$/.test(className)) throw new Error('Invalid tool button');
  if (zoom !== undefined && !['in', 'out', 'fit'].includes(zoom)) throw new Error('Invalid zoom action');
  return out(`<button type="button" class="app-tool-button${className ? ` ${className}` : ''}" data-tool="${action}" aria-label="${escape(label)}" title="${escape(label)}"${hidden ? ' hidden' : ''}${zoom ? ` data-zoom="${zoom}"` : ''}>${ToolIcon(icon)}</button>`);
}

export function Toolbar({ label, buttons, extra }) {
  return out(`<div class="app-toolbar" role="toolbar" aria-label="${escape(label)}"><span class="app-tool-status app-sr" data-tool-status role="status" aria-live="polite" aria-atomic="true"></span>${buttons.map(button => slot(button, 'tool button')).join('')}${extra === undefined ? '' : slot(extra, 'extra tools')}</div>`);
}

/** 블록 안에서 버튼 높이를 확보하므로 조작부가 코드나 그림을 덮지 않는다. */
export function ToolHeader({ label = '', toolbar }) {
  return out(`<div class="app-tool-header">${label ? `<span class="app-tool-label">${escape(label)}</span>` : ''}${slot(toolbar, 'toolbar')}</div>`);
}
