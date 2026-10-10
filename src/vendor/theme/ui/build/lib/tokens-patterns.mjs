// 하드코딩 검사가 쓰는 규칙(정규식과 상수). check-tokens.mjs와 lib/ 모듈이 함께 쓴다.

export const CSS_EXTS = new Set(['.css', '.scss']);
export const SCRIPT_EXTS = new Set(['.js', '.mjs', '.cjs', '.ts', '.jsx', '.tsx']);
// docs/는 문서 그림 산출물 자리라 이 검사 대상이 아니다.
export const SKIP_DIRS = new Set(['node_modules', 'vendor', 'dist', 'build', 'coverage', '.git', 'docs']);
export const TOKEN_FILES = new Set(['tokens.json', 'tokens.dark.json']);
export const GENERATED_MARK = '생성물, 손으로 고치지 않음';
export const ALLOW_MARK = 'tokens-allow:';
// 토큰 없이 써도 되는 값
export const FREE_LENGTHS = new Set(['0', '100%', '50%', '100vh', '100vw']);
export const FREE_NUMBERS = new Set(['0', '1']);
// 테마에 따라 바뀌어 의미 토큰으로만 써야 하는 타입
export const THEMED_TYPES = new Set(['color', 'shadow']);

// 유니코드 낱말 글자와 낱말 경계. 패턴 글자의 `\w`(글자 묶음 안에서만 씀)와 `\b`를 이것으로 바꾼다.
const WORD_CHARS = String.raw`\p{L}\p{N}_`;
const WORD_BOUNDARY = `(?:(?<=[${WORD_CHARS}])(?![${WORD_CHARS}])|(?<![${WORD_CHARS}])(?=[${WORD_CHARS}]))`;

const FONT_KEYWORDS = String.raw`(?:inherit|initial|unset|var\()`;
export const HEX_COLOR = unicodePattern(String.raw`(?<![\w&/])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b`);
export const COLOR_FUNCTION = unicodePattern(String.raw`\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb|color)\(`);
export const FONT_FAMILY = unicodePattern(
  String.raw`font-family\s*:(?!\s*${FONT_KEYWORDS})[^;}\n]+|\bfont\s*:(?!\s*${FONT_KEYWORDS})[^;}\n]*(?:serif|monospace|system-ui)`,
);
export const LENGTH = unicodePattern(String.raw`(?<![\w.#-])-?\d*\.?\d+(?:px|rem|em|ms|s|vh|vw|pt)\b`);
export const UNITLESS_PROPERTY = unicodePattern(String.raw`\b(font-weight|line-height|opacity|z-index|letter-spacing)\s*:\s*(-?[\d.]+)\b`);
export const UNITLESS_ATTRIBUTE = unicodePattern(
  String.raw`\b(rx|ry|stroke-width|font-size|font-weight|opacity|fill-opacity|stroke-opacity|letter-spacing)="\s*(-?[\d.]+)\s*"`,
);
export const CUSTOM_PROPERTY = unicodePattern(String.raw`(--[\w-]+)\s*:\s*(?!var\()([^;}\n]+)`);
export const AT_CONDITION = /@(?:media|container)[^{]*/g;
export const CONDITION_VALUE = unicodePattern(String.raw`(\d+(?:\.\d+)?)(px|em|rem)\b`);
export const CSS_COMMENT = /\/\*[\s\S]*?\*\//g;
export const STRING = /'(?:[^'\\\n]|\\[\s\S])*'|"(?:[^"\\\n]|\\[\s\S])*"|`(?:[^`\\]|\\[\s\S])*`/g;
// CSS 선언(`속성: 값;`)이나 마크업 속성(`이름="값"`)이 든 문자열
export const LOOKS_STYLED = unicodePattern(String.raw`[\w-]+\s*:\s*[^;]+;|<[\w][^>]*=|[\w-]+="`, '');
// 값 하나뿐인 문자열: `'12px'`, `'1.5rem'`, `'200ms'`
export const BARE_VALUE = /^['"`]\s*-?\d*\.?\d+(?:px|rem|em|ms|s|pt)\s*['"`]$/;
export const VAR_REFERENCE = unicodePattern(String.raw`var\(\s*(--[\w-]+)`);
export const THEME_BRANCH = unicodePattern(String.raw`prefers-color-scheme|\[data-theme(?![\w-])`);
export const JS_TOKEN_PATH = unicodePattern(
  String.raw`\b(?:tokens|values)((?:\.[A-Za-z_$][\w$]*|\[\s*(?:['"\x60][^'"\x60]+['"\x60]|\d+)\s*\])+)`,
);
export const JS_PATH_PART = unicodePattern(String.raw`\.([A-Za-z_$][\w$]*)|\[\s*['"\x60]?([^'"\x60\]\s]+)['"\x60]?\s*\]`);
// 일반 문자열. `['600']` 같은 경로 키 자리는 남긴다.
export const PLAIN_STRING = /(?<!\[)\s*('(?:[^'\\\n]|\\[^\n])*'|"(?:[^"\\\n]|\\[^\n])*")/g;
// 스타일 객체: `style={{`, `style: {`, `sx: {`, `css: {`, `styles = {` 뒤 중괄호 안만 숫자를 본다.
export const STYLE_OBJECT_START = unicodePattern(String.raw`\b(?:style|styles|sx|css)\s*[:=]\s*\{\{?`);
export const STYLE_OBJECT_NUMBER = unicodePattern(
  String.raw`\b(fontSize|fontWeight|lineHeight|letterSpacing|opacity|zIndex|borderRadius|borderWidth|gap|rowGap|columnGap` +
    String.raw`|strokeWidth|top|right|bottom|left|(?:padding|margin|inset)(?:Top|Right|Bottom|Left|Inline|Block)?|(?:min|max)?(?:Width|Height)|width|height)` +
    String.raw`\s*:\s*(-?\d+(?:\.\d+)?)\b`,
);
export const REFERENCE_IN_VALUE = /\{[\w.-]+\}/;


// cost: time O(n), heap O(n), stack O(1)
// vars: n = 패턴 글자 수
// basis: estimate
/** 패턴의 `\w`를 유니코드 낱말 글자로, `\b`를 유니코드 낱말 경계로 바꾼 정규식을 만든다. */
export function unicodePattern(source, flags = 'g') {
  return new RegExp(source.replaceAll(String.raw`\b`, WORD_BOUNDARY).replaceAll(String.raw`\w`, WORD_CHARS), `${flags}u`);
}
