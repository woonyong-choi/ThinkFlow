# 기여 안내

이슈에서 변경 범위와 완료 조건을 정하고 PR로 반영한다.

## 시작 전에

같은 작업의 이슈와 열린 PR을 먼저 확인한다. 새 사용자 결과는 이슈를 만들고, 기존 결과의 결함이나 작은 후속 변경은 같은 이슈에 연결한다.

## 개발 환경

Node.js 20 이상과 Git이 필요하다.

```sh
git clone https://github.com/woonyong-choi/torso.git
cd torso
npm ci
```

## 검사

PR을 열기 전에 아래 검사가 모두 통과해야 한다.

```sh
npm test
npm run check
npm run check:docs
npm run check:sources
npm run check:figures
npm run check:package -- /absolute/new-consumer-path
```

패키지 검사는 저장소 밖의 새 폴더를 만들고 검사 뒤 지운다. CI는 Node.js 20·22에서 검사하며 Node.js 22 작업에서 실제 Chrome으로 `npm run test:browser`도 실행한다. `npm run check:advisory`는 기존 유지보수 항목을 알리는 참고 검사다.

## 커밋과 PR

| 항목 | 형식 | 예 |
|---|---|---|
| 브랜치 | `{type}/{이슈 번호}-{scope}-{설명}` | `fix/31-repo-label-overlap` |
| 커밋 | `{type}({scope}): 한글 설명` | `fix(repo): 그룹 제목과 겹친 라벨 수정` |
| PR | 이슈 하나의 결과와 검증 | 완료 조건을 모두 채우면 본문 첫 줄에 `Closes #31`, 일부만 반영하면 `Refs #31` |

scope는 패키지 모듈 이름을 쓴다. 모듈 밖 변경은 `repo`, `deps`, `readme`, `docs`, `release` 가운데 고른다. 커밋 설명은 대상과 결과를 적고 `추가`, `수정`, `변경`, `정리`, `갱신` 같은 끝말을 쓴다. 커밋 본문과 PR 본문은 한 줄에 사실 하나를 명사형으로 적는다.

이슈 완료 조건을 근거와 함께 확인하고 현재 변경의 검증을 마친 뒤 squash 머지한다. squash 제목은 PR 제목 뒤에 PR 번호를 붙이고, 본문에는 변경 이유·검증 결과와 이슈 연결을 남긴다.

## 문서

동작, 계약, 설정을 바꾸면 같은 PR에서 [설계 문서](../docs/README.md)를 고친다. 문법 표와 그림 검사 표는 원본 코드에서 다시 생성한다. 한국어 문서는 평서문으로 쓰고 기본 README는 합쇼체로 쓴다.
