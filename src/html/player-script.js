// 재생기 문서의 고정 부분: 브라우저 스크립트(src/player/)를 한 글로 이어 붙인 것과 그림 틀 마크업. 컴파일러(build)에 기대지 않아 재생기 시험이 이 모듈로 같은 문서 틀을 만든다.
import { readFileSync } from 'node:fs';
import { bindTabs } from '../vendor/theme/ui/runtime/tabs.js';
import { ToolIcon } from '../vendor/theme/ui/toolbar.mjs';
import { cssTimeMs } from '../vendor/theme/ui/runtime/time.js';
import { bindToolbar } from '../vendor/theme/ui/runtime/toolbar.js';
import { CONTROL_ICONS } from '../vendor/theme/ui/control-icons.mjs';
export { DiagramFrame as figureFrame } from '../vendor/theme/ui/diagram.mjs';

// 브라우저 스크립트 파일(src/player/). 한 스크립트로 이어 붙여 HTML에 넣는다. 순서는 상수와 함수 선언이 쓰이기 전에 있어야 하는 곳만 지키면 된다(진입은 맨 끝의 figurePlay 호출).
const PLAYER_FILES = ['view', 'export', 'play', 'controls', 'stage', 'effects', 'responsive', 'curve', 'sample', 'values'];
// 내려받기용 정본 템플릿을 넣어 두는 문서 머리 meta 칸의 이름. 재생기 스크립트(player/export.js)가 같은 이름을 읽는다.
export const CANONICAL_NAME = 'daphnis-canonical';
// 조작부 전용 글리프를 재생기 앞에 붙인다. 크기와 선 굵기는 공통 토큰을 따른다.
const UI_ICON_SCRIPT = `const CONTROL_ICONS = ${JSON.stringify(CONTROL_ICONS).replace(/</g, '\\u003c')};\nconst CANONICAL_NAME = ${JSON.stringify(CANONICAL_NAME)};\n`;
export const PLAYER_SCRIPT = UI_ICON_SCRIPT + cssTimeMs.toString() + '\n' + ToolIcon.toString() + '\n' + bindToolbar.toString() + '\n' + bindTabs.toString() + '\n' + PLAYER_FILES.map((name) => readFileSync(new URL(`../player/${name}.js`, import.meta.url), 'utf8')).join('\n');
