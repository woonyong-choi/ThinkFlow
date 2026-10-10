/** 원본이나 그림 검사에서 찾은 문제. 위치를 모르면 line과 column은 0이다. */
export interface FigureDiagnostic {
  readonly severity: 'error' | 'warning';
  readonly code: string;
  readonly line: number;
  readonly column: number;
  readonly message: string;
}

export type BudgetName = 'grid-elements' | 'grid-path-commands' | 'events' | 'chain' | 'chip-index';

export interface BuildOptions {
  /** 외부 JSON과 아이콘 경로의 기준. 기본값은 현재 작업 폴더다. */
  baseDir?: string;
  /** 경고도 FigureError로 전달한다. 기본값은 false다. */
  strict?: boolean;
  /** 이름별 한도를 양의 안전한 정수로 지정한다. 생략한 이름은 기본 한도다. */
  budget?: Partial<Record<BudgetName, number>>;
  /** 그래프 보기의 배치 목표 폭(px). 양의 유한수여야 한다. */
  layoutWidth?: number;
  /** 원본이 지정한 외부 JSON과 아이콘 파일을 읽을 수 있다. 기본값은 true다. */
  allowFileAccess?: boolean;
}

declare const builtFigure: unique symbol;

/** buildFigure로만 얻으며 같은 패키지의 렌더러에 그대로 전달한다. */
export interface BuiltFigure {
  readonly [builtFigure]: never;
  readonly warnings: readonly FigureDiagnostic[];
}

export interface SvgOptions {
  /** 0부터 시작하는 장면 번호 또는 장면 이름. 기본값은 첫 장면이다. */
  scene?: number | string;
  /** 장면의 재생 모드와 무관하게 마지막 상태를 그린다. 기본값은 false다. */
  isStatic?: boolean;
  /** 원본에 title이 없을 때 쓸 SVG 제목. 기본값은 빈 문자열이다. */
  name?: string;
}

/** 원본·그림 검사 오류. strict 빌드의 경고도 오류로 승격된다. */
export class FigureError extends Error {
  readonly name: 'FigureError';
  readonly problems: readonly FigureDiagnostic[];
  constructor(problems: readonly FigureDiagnostic[]);
}

/** @throws FigureError 원본·그림 검사 실패. 잘못된 budget은 TypeError다. */
export function buildFigure(source: string, options?: BuildOptions): Promise<BuiltFigure>;

/** @throws RangeError 장면이 있는 그림에서 존재하지 않는 장면을 선택한 경우. */
export function toSvg(result: BuiltFigure, options?: SvgOptions): Promise<string>;

/** 모든 장면이 있는 독립 HTML 문서. name은 원본에 title이 없을 때 쓸 제목이다. */
export function toHtml(result: BuiltFigure, name?: string): Promise<string>;
