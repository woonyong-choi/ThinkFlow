// 문서 작성 도구가 넘긴 텍스트와 검증된 본문 슬롯을 공통 구조로 조립한다.
import { escape, slot, out } from './html.mjs';
import { Kbd } from './components.mjs';

export function ContentGroup({ title, body, after }) {
  return out(`<section class="app-support-group">${title ? `<h2>${escape(title)}</h2>` : ''}${slot(body, 'body')}${after ? `<p>${slot(after, 'after')}</p>` : ''}</section>`);
}

export function FeatureSection({ tone = 'canvas', split = false, heading, body, descriptions = [] }) {
  if (!['canvas', 'lightest', 'light', 'medium'].includes(tone)) throw new Error(`Unknown feature tone: ${tone}`);
  return out(`<section class="app-feature app-feature-${tone}${split ? ' is-split' : ''}"><div class="app-shell">${slot(heading, 'heading')}</div><div class="app-feature-workspace"><div class="app-feature-media">${slot(body, 'body')}</div>${descriptions.length ? `<div class="app-feature-description">${descriptions.map(item => `<div><h3>${escape(item.title)}</h3><p>${escape(item.body)}</p></div>`).join('')}</div>` : ''}</div></section>`);
}

export function SyntaxExamples({ items }) {
  return out(`<div class="app-syntax-examples">${items.map(item => `<section class="app-syntax-row"><pre aria-label="${escape(item.title)}">${escape(item.source)}</pre><div>${slot(item.body, 'body')}</div></section>`).join('')}</div>`);
}

export function FeatureList({ items }) {
  const middle = Math.ceil(items.length / 2);
  return out(`<div class="app-feature-list">${[items.slice(0, middle), items.slice(middle)].map(column => `<ul>${column.map(item => `<li><h3>${escape(item.title)}</h3>${slot(item.body, 'body')}</li>`).join('')}</ul>`).join('')}</div>`);
}

export function FeatureDemos({ items, media, mediaFirst = false, after }) {
  const descriptions = `<div>${items.map(item => `<section class="app-feature-demo-description">${item.title ? `<h3>${escape(item.title)}${item.action ? ` ${slot(item.action, 'action')}` : ''}</h3>` : ''}${slot(item.body, 'body')}</section>`).join('')}</div>`;
  const frame = `<div>${slot(media, 'media')}</div>`;
  return out(`<div class="app-feature-demos">${mediaFirst ? frame + descriptions : descriptions + frame}</div>${after ? `<div class="app-feature-demo-description">${slot(after, 'after')}</div>` : ''}`);
}

export function Details({ title, open = false, body }) {
  return out(`${Details.open({ open })}${Details.summaryOpen()}${escape(title)}${Details.summaryClose()}${slot(body, 'body')}${Details.close()}`);
}

Details.open = ({ open = false } = {}) => `<details class="app-details"${open ? ' open' : ''}>`;
Details.close = () => '</details>';
Details.summaryOpen = () => '<summary>';
Details.summaryClose = () => '</summary>';

export const Speech = ({ text }) => out(`<p class="app-speech">${escape(text)}</p>`);
export const Shortcut = ({ label = '', keys }) => out(`<p>${escape(label)} ${keys.map(text => Kbd({ text })).join(' + ')}</p>`);
