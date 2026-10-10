import { escape, slot } from './html.mjs';
import { ContentIconImage, PageLinks } from './patterns.mjs';

/** 소비자는 목록과 토큰 크기, 검증한 아이콘 렌더러를 넘긴다. */
export function IconAuditPages({ catalog, detail, brands, review, sizes, renderIcon, routeBase = '/review/icons', assetBase = '/theme', pageSize = 12 }) {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) throw new Error('invalid icon review page size');
  const entries = [
    ...Object.entries(detail.icons).map(([name, icon]) => ({ id: `detail-${name}`, label: icon.label, note: icon.metaphor, render: size => renderIcon(name, size, 'detail') })),
    ...brands.icons.map(icon => ({ id: `brand-${icon.name}`, label: icon.label, note: icon.treatment, render: size => ContentIconImage({ src: `${assetBase}/assets/icons/brands/${icon.file}`, size }) })),
    ...Object.entries(catalog.icons).map(([name, icon]) => ({ id: `base-${name}`, label: `공유 원본 · ${icon.label}`, note: '기본 호출과 상세 호출이 같은 마스터를 사용합니다.', render: size => renderIcon(name, size) })),
    ...Object.entries(detail.badges).map(([name, badge]) => ({ id: `badge-${name}`, label: `글 표식 · ${badge.label}`, note: '작은 목록은 표식을 생략하고 제목을 함께 읽습니다.', render: size => renderIcon({ name: 'document', kind: name }, size, 'detail') })),
  ];
  const count = Math.ceil(entries.length / pageSize);
  const route = index => index === 0 ? `${routeBase}/` : `${routeBase}/page/${index + 1}/`;
  const summary = `${Object.keys(detail.icons).length}개 주제 · ${brands.icons.length}개 기술 로고 · ${Object.keys(catalog.icons).length}개 공유 원본 · ${Object.keys(detail.badges).length}개 표식`;
  return Array.from({ length: count }, (_, index) => ({
    route: route(index),
    body: `<main id="main" class="app-shell"><h1 class="app-page-heading">아이콘 검증 ${index + 1} / ${count}</h1><p>${summary}</p><p class="app-caption">${escape(review.reviewedAt)} 구현 검토 · 사용자 최종 승인과 구분합니다.</p><div class="app-icon-audit-grid">${entries.slice(index * pageSize, (index + 1) * pageSize).map(entry => reviewEntry(entry, review.entries[entry.id], sizes)).join('')}</div>${PageLinks({ label: '아이콘 검증 페이지', numbers: Array.from({ length: count }, (_, i) => ({ page: i + 1, href: route(i), current: i === index })) })}</main>`,
  }));
}

function reviewEntry(entry, review, sizes) {
  if (!review) throw new Error(`missing current icon review: ${entry.id}`);
  const pictures = Object.entries(sizes).map(([size, pixels]) => {
    if (!Number.isFinite(pixels) || pixels <= 0) throw new Error(`invalid icon review size: ${size}`);
    return `<figure>${slot(entry.render(size), 'icon')}<figcaption>${pixels}px</figcaption></figure>`;
  }).join('');
  return `<section class="app-icon-audit-item" data-audit-id="${escape(entry.id)}" data-review-fingerprint="${escape(review.fingerprint)}"><h2>${escape(entry.label)}</h2><div class="app-icon-review-pair">${pictures}</div><p>${escape(entry.note ?? '')}</p><details><summary>크기별 검토 기록</summary><p>${escape(review.observation)}</p><p>${escape(review.smallSize)}</p><p class="app-caption">원본 ${escape(review.fingerprint.slice(0, 12))}</p></details></section>`;
}
