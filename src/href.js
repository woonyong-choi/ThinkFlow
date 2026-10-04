// 파일 이름을 링크 주소로 쓰는 모든 곳(목록, 문서 미리보기, 마크다운 이미지 줄)이 함께 쓰는 변환. 파일 이름은 늘 상대 경로로만 쓰이고 URL 스킴이 되지 않는다.
import { escapeXml } from './text.js';

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 경로 글자 수
// basis: estimate
/**
 * 상대 경로(구분자 `/`나 경로 조각 목록)를 주소로 바꾼다. 조각마다 encodeURIComponent로 `:`, `#`, `?`, `%`, 공백을 막고,
 * 괄호도 이미지 문법을 깨므로 인코딩한다. 첫 조각이 `..`이 아니면 `./`를 앞에 붙여 `javascript:` 같은 이름이 스킴으로 읽히지 않게 한다(explicit: false면 붙이지 않는다. 인코딩으로 `:`가 이미 없다).
 * @param path `/`로 이은 상대 경로 또는 조각 배열
 */
export function fileHref(path, { explicit = true } = {}) {
  const parts = (Array.isArray(path) ? path : path.split('/')).map((part) => (part === '..' || part === '.' ? part : encodeURIComponent(part).replace(/[()]/g, (c) => `%${c.charCodeAt(0).toString(16)}`)));
  return explicit && parts[0] !== '..' && parts[0] !== '.' ? `./${parts.join('/')}` : parts.join('/');
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 경로 글자 수
// basis: estimate
/** HTML 속성(href, src)에 그대로 넣을 수 있는 주소. fileHref에 속성 이스케이프를 더한다. */
export const hrefAttr = (path) => escapeXml(fileHref(path));
