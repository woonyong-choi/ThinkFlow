# d2-flow

D2 그림을 Hindsight 문서 그림 모양의 움직이는 흐름 그림으로 바꾸는 명령입니다

설계 문서는 [docs/README.md](docs/README.md)에 있다.

## 구성

| 경로 | 내용 |
|---|---|
| `src/`에서 `player.js`, `viewer.js`, `svg.js`를 뺀 파일 | 원본을 읽어 D2.js로 배치하고 장면과 시간표를 만들어 HTML과 SVG로 쓰는 명령 |
| `src/player.js` | HTML 안에서 박자마다 선과 도형을 밝히고 점을 옮기는 재생기 |
| `src/viewer.js` | HTML의 전체 화면과, 전체 화면에서만 켜지는 확대·축소 |
| `src/svg.js` | 스크립트 없이 CSS keyframes와 SMIL로 움직이는 SVG |
| `scripts/shoot.mjs` | 결과 파일을 로컬 Chrome으로 열어 PNG로 찍는 확인 도구 |
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
- `#@` 줄은 D2 주석 유지
- 원본 파일 수정 없이 배치 입력 끝에만 줄 추가
- 원본에 적은 `width`, `height`, `font-size` 보존
- HTML과 SVG는 `renderScene` 하나의 그림 공유
- 결과 파일에 스크립트와 스타일 모두 포함
- 끝날 때 D2.js worker 종료
- 화면 값은 `src/tokens.json` 토큰만 사용
- `tokens.css`, `tokens.js` 직접 수정 금지
