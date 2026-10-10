// 페이지의 데이터·주소·문구를 받아 공통 배치만 조립한다.
import { escape, id, safeUrl, slot, out } from './html.mjs';
import { SocialIcon } from './icons.mjs';

export function SiteHeader({ label, homeLabel, title = homeLabel, icon, homeHref = '/', items, active = '' }) {
  return out(`<div class="app-shell"><header class="app-header"><a class="app-logo" href="${safeUrl(homeHref)}" aria-label="${escape(homeLabel)}">${icon ? `<span class="app-logo-icon">${slot(icon, 'icon')}</span>` : ''}${escape(title)}</a><nav class="app-nav" aria-label="${escape(label)}">${items.map(({ label, href }) => `<span class="app-nav-item"><a href="${safeUrl(href)}"${active.startsWith(href) ? ' aria-current="page"' : ''}>${escape(label)}</a></span>`).join('')}</nav></header></div>`);
}

export function SiteFooter({ owner, year, links }) {
  return out(`<footer class="app-footer"><div class="app-shell"><div class="app-footer-bar"><p class="app-footer-copy">© <span data-current-year>${Number(year)}</span> ${escape(owner)}</p><div class="app-footer-links">${links.map(link => `<a href="${safeUrl(link.href)}" aria-label="${escape(link.label)}">${SocialIcon(link.icon)}</a>`).join('')}</div></div></div></footer>`);
}

export function QuoteCard({ profile, href, label, content }) {
  const link = href ? `<a class="app-interview-card-link" href="${safeUrl(href)}" aria-label="${escape(label)}"></a>` : '';
  const picture = profile?.image ? `<span class="app-interview-avatar"><img src="${safeUrl(profile.image.src)}" alt="${escape(profile.image.alt)}" loading="lazy" decoding="async"></span>` : '';
  const attribution = profile ? `<div class="app-interview-meta">${picture}<div class="app-interview-lines"><strong>${escape(profile.title)}</strong>${profile.subtitle ? `<span>${escape(profile.subtitle)}</span>` : ''}</div></div>` : '';
  return out(`<li class="app-interview-card">${link}<p class="app-interview-summary">${slot(content, 'content')}</p>${attribution}</li>`);
}

export function Hero({ id: name, title, description, icon, action, showcase }) {
  return out(`<section id="${id(name)}" class="app-landing-hero"><div class="app-shell"><div class="app-hero-copy">${icon ? slot(icon, 'icon') : title ? `<p class="app-hero-title" aria-hidden="true">${escape(title)}</p>` : ''}<p class="app-hero-description">${escape(description)}</p>${action ? `<p class="app-hero-description">${slot(action, 'action')}</p>` : ''}</div></div></section>${showcase ? slot(showcase, 'showcase') : ''}`);
}

const SECTIONS = { content: 'app-landing-features', icons: 'app-landing-technologies', quotes: 'app-landing-interviews' };
export function Section({ id: name, variant = 'content', labelledBy, heading, content }) {
  if (!Object.hasOwn(SECTIONS, variant)) throw new Error(`Unknown section: ${variant}`);
  return out(`<section${name ? ` id="${id(name)}"` : ''} class="app-landing-section ${SECTIONS[variant]}"${labelledBy ? ` aria-labelledby="${id(labelledBy)}"` : ''}><div class="app-shell">${heading ? slot(heading, 'heading') : ''}${slot(content, 'content')}</div></section>`);
}

export function LogoItem({ href, label, src }) {
  return out(`<li class="app-technology"><a href="${safeUrl(href)}" aria-label="${escape(label)}"><img src="${safeUrl(src)}" alt="" decoding="async"><span class="app-sr">${escape(label)}</span></a></li>`);
}
