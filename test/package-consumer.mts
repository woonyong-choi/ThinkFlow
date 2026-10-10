import { buildFigure, FigureError, toHtml, toSvg } from 'thinkflow';
import type { BuildOptions, BuiltFigure, FigureDiagnostic, SvgOptions } from 'thinkflow';

const source = 'thinkflow\nbox client "Client"\nbox server "Server"\nclient -> server\nscene "request"\n  client -> server "GET"\n';
const options: BuildOptions = {
  baseDir: '.', strict: true, allowFileAccess: false,
  budget: { events: 100, chain: 100 }, layoutWidth: 600,
};
const result: BuiltFigure = await buildFigure(source, options);
const svgOptions: SvgOptions = { scene: 'request', isStatic: true, name: 'request' };
const svg: string = await toSvg(result, svgOptions);
const html: string = await toHtml(result, 'request');
const warnings: readonly FigureDiagnostic[] = result.warnings;
if (!svg.startsWith('<svg ') || !html.startsWith('<!doctype html>') || warnings.length) {
  throw new Error('typed consumer did not render the source');
}

try {
  await buildFigure('thinkflow\nbox a "A"\na -> missing\n');
  throw new Error('invalid source was accepted');
} catch (error) {
  if (!(error instanceof FigureError)) throw error;
  const problems: readonly FigureDiagnostic[] = error.problems;
  const first = problems[0];
  if (error.name !== 'FigureError' || first?.severity !== 'error' || first.code !== 'syntax') {
    throw new Error('typed consumer did not receive structured diagnostics');
  }
  if (first.line !== 3 || first.column !== 1 || !first.message) {
    throw new Error('typed consumer did not receive the source location');
  }
}

// 컴파일만 하는 반례. 잘못된 호출을 허용하면 @ts-expect-error가 실패한다.
function invalidCalls(figure: BuiltFigure) {
  // @ts-expect-error 원본은 문자열이다.
  void buildFigure(123);
  // @ts-expect-error 지원하는 예산 이름만 받는다.
  void buildFigure(source, { budget: { unknown: 1 } });
  // @ts-expect-error 폭은 숫자다.
  void buildFigure(source, { layoutWidth: '600' });
  // @ts-expect-error 임의 객체는 빌드 결과가 아니다.
  void toSvg({ warnings: [] });
  // @ts-expect-error 장면 선택자는 번호나 이름이다.
  void toSvg(figure, { scene: true });
  // @ts-expect-error HTML의 두 번째 인자는 제목 문자열이다.
  void toHtml(figure, { name: 'request' });
  // @ts-expect-error 내부 그림 모형은 공개 계약이 아니다.
  void figure.figure;
}
