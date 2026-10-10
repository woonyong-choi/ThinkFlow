// 페이지에 존재하는 구성 요소만 런타임 진입점으로 선택한다.
export const RUNTIMES = Object.freeze({
  'document.js': /<[^>]+\sdata-(?:tabs|copy|keyboard|tooltip-trigger)(?:[\s=>])/,
  'document-navigation.js': /<[^>]+\sdata-document-layout(?:[\s=>])/,
  'flows.js': /<[^>]+\sdata-flow-rail(?:[\s=>])/,
  'video.js': /<[^>]+\sdata-player(?:[\s=>])/,
  'diagram.js': /<[^>]+\sdata-diagram(?:[\s=>])/,
});

export function runtimeEntrypoints(markup) {
  return Object.entries(RUNTIMES).filter(([, pattern]) => pattern.test(markup)).map(([name]) => name);
}

export const videoControlAssets = ['play', 'pause', 'replay'].map(name => `/theme/assets/controls/${name}.svg`);
