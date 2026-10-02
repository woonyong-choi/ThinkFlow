# mutoscope

`.muto` 원본 하나를 움직이는 문서 그림 하나(구조, 순서, 상태, 데이터 관계 그림과 차트)로 바꾸는 명령.

설계 문서는 [docs/README.md](docs/README.md)에 있다.

## 구성

| 경로 | 내용 |
|---|---|
| `src/source/` | 원본 읽기: 낱말 나누기, 문장 해석, 이름과 규칙 확인 |
| `src/measure/` | 글꼴 파일로 글 폭 재기, 도형과 카드 크기, 글꼴 조각 넣기 |
| `src/layout/` | elkjs 배치(구조, 상태, 데이터 관계)와 순서 그림 격자 배치 |
| `src/chart/` | 차트 눈금, 숫자 표기, 여섯 종류 그리기 |
| `src/draw/` | 도형, 선, 카드 그리기 |
| `src/timeline.js`, `src/chip.js`, `src/build.js` | 시간표, 글 상자 크기와 밀어 넣기, 단계 잇기 |
| `src/check.js`, `src/check/` | 그림 검사. 항목 목록(`items.js`)과 항목별 판정 파일 |
| `src/svg.js`, `src/html.js`, `src/html/`, `src/cli.js` | 움직이는 SVG, HTML 재생기 문서와 목록, 명령 |
| `src/player/` | 브라우저에서 도는 재생기(`play.js`, `controls.js`, `stage.js`, `curve.js`)와 전체 화면·확대(`view.js`) |
| `examples/` | 예제 원본, `out/` 결과, `screens/` UI 화면 |
| `scripts/` | 화면 확인 도구(`shoot.mjs`, `screens.mjs`), 토큰 생성(`build-tokens.mjs`), 하드코딩, 비용 주석, 수치 기준 검사(`check-tokens.mjs`, `check-cost-comments.mjs`, `check-size.mjs`), 배치 무작위 시험(`fuzz-layout.mjs`), 빌드 시간 기준 검사(`perf-chips.mjs`, 로컬 전용), 문서 표 생성(`build-grammar-doc.mjs`, `build-check-doc.mjs`) |
| `docs/` | 설계 문서 |

## 명령

```sh
npm test
npm run check
```

## 규칙

- 커밋 전 명령 절의 명령 모두 통과
- 동작, 계약, 설정 변경은 같은 PR에서 설계 문서 갱신
- 새 문서는 `docs/README.md` 문서 목록 안에서만 추가
- 배치에 넘긴 도형 크기와 연결점은 그리는 도형과 동일
- elkjs 경로 점 수정 금지. 예외는 `docs/design/layout.md` 선 그리기 절의 선 끝 계단 펴기 하나
- 오류가 있으면 결과 파일을 쓰지 않음
- `src/player/`는 시간표를 읽기만 하고 상태를 다시 계산하지 않음
- 화면 값은 `src/tokens.json` 토큰만 사용
- `tokens.css`, `tokens.js` 직접 수정 금지
