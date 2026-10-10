import { out } from './html.mjs';
import { ICON_DATA, ICON_ROLES } from './icon-data.mjs';
import { renderSvgIcon } from './svg.mjs';

export const SOCIAL_ICONS = /* @__PURE__ */ Object.keys(ICON_ROLES.social);

function roleIcon(group, name, className, monochrome) {
  if (!Object.hasOwn(ICON_ROLES[group], name)) throw new Error(`unknown ${group} icon: ${name}`);
  return renderSvgIcon(ICON_DATA[ICON_ROLES[group][name]], { className, monochrome });
}

export function ArticleIcon(name = 'question') {
  return out(roleIcon('articles', name, 'app-article-icon', false));
}

export function SocialIcon(name, className = 'app-social-icon') {
  return out(roleIcon('social', name, className, true));
}

export function ControlIcon(name, className = '') {
  const graphic = roleIcon('controls', name, className || 'app-control-icon', !['play', 'pause'].includes(ICON_ROLES.controls[name]));
  return out(graphic.replace('<svg ', `<svg data-control-icon="${name}" `));
}
