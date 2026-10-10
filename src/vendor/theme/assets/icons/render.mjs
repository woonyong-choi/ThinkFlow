// 색과 선은 테마에서 공급하고 도형 좌표는 원본에 보존한다.
export function validateIconCatalog(catalog) {
  if (catalog.version !== 1 || catalog.viewBox !== '0 0 48 48') throw new Error('unsupported icon catalog');
  for (const group of ['icons', 'badges']) {
    for (const [id, entry] of Object.entries(catalog[group])) {
      if (!/^[a-z][a-z0-9-]*$/.test(id) || !entry.label) throw new Error(`invalid icon identity: ${id}`);
      if (group === 'icons' && (!['object', 'tile', 'outline'].includes(entry.family) || !entry.metaphor)) throw new Error(`incomplete icon contract: ${id}`);
      const variants = ['body'];
      if (entry.smallBody) variants.push('smallBody');
      for (const variant of variants) {
        const body = entry[variant];
        if (typeof body !== 'string' || /[&#]|url\(|(?:script|style|href|filter|opacity|transform|on\w+)\s*=/i.test(body)) throw new Error(`unsafe icon: ${id}`);
        const tags = body.match(/<[^>]+>/g) ?? [];
        if (body.replace(/<[^>]+>/g, '').trim()) throw new Error(`unexpected icon text: ${id}`);
        for (const tag of tags) {
          if (!/^<(?:path|rect|circle|ellipse)\s[^<>]*\/>$/.test(tag)) throw new Error(`invalid icon element: ${id}`);
          const attributes = tag.replace(/^<\w+\s|\/>$/g, '');
          if (attributes.replace(/[\w-]+="[^"]*"/g, '').trim()) throw new Error(`invalid icon attributes: ${id}`);
          for (const [, attr, value] of tag.matchAll(/([\w-]+)="([^"]*)"/g)) {
            if (!['d','x','y','width','height','rx','ry','cx','cy','r','fill','stroke','stroke-width','stroke-linecap','stroke-linejoin'].includes(attr)) throw new Error(`invalid icon attribute: ${attr}`);
            if (['fill','stroke','stroke-width'].includes(attr) && !/^(none|var\(--icon-[a-z-]+\))$/.test(value)) throw new Error(`unbound icon paint: ${id}`);
            if (attr === 'd' && !/^[MmLlHhVvCcSsQqTtAaZz\d\s.,+\-eE]+$/.test(value)) throw new Error(`invalid icon path: ${id}`);
            if (['x','y','width','height','rx','ry','cx','cy','r'].includes(attr) && !/^-?\d+(?:\.\d+)?$/.test(value)) throw new Error(`invalid icon coordinate: ${id}`);
            if (['stroke-linecap','stroke-linejoin'].includes(attr) && value !== 'round') throw new Error(`invalid icon join: ${id}`);
          }
        }
      }
    }
  }
  for (const [alias, target] of Object.entries(catalog.aliases ?? {})) {
    if (!/^[a-z][a-z0-9-]*$/.test(alias) || !Object.hasOwn(catalog.icons, target)) throw new Error(`invalid icon alias: ${alias}`);
  }
}

export function renderContentIcon(catalog, name, kind, size) {
  const entry = catalog.icons[name];
  if (!entry) throw new Error(`unknown content icon: ${name}`);
  const badge = kind ? catalog.badges[kind] : undefined;
  if (kind && !badge) throw new Error(`unknown article kind: ${kind}`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${catalog.viewBox}" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${size === 'small' ? entry.smallBody ?? entry.body : entry.body}${size === 'small' ? '' : badge?.body ?? ''}</svg>`;
}
