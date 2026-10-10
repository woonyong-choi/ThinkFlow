import { escape, slot, out } from './html.mjs';

/** 행과 열은 소비자의 의미 구조다. 표의 틀·스크롤·색·간격은 한 구성 요소가 소유한다. */
export function Table({ body, ...props }) {
  return out(`${Table.open(props)}${slot(body, 'table body')}${Table.close()}`);
}

Table.open = ({ caption, label = caption ?? '표' } = {}) => `<div class="app-table-scroll" tabindex="0" role="region" aria-label="${escape(label)}"><table class="app-table">${caption ? `<caption>${escape(caption)}</caption>` : ''}`;
Table.close = () => '</table></div>';
