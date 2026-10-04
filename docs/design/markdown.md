# 마크다운 반영과 배포

| 항목 | 값 |
|---|---|
| 상태 | 구현 |
| 관련 결정 | [그림 문법과 배치를 직접 맡고 D2 호환을 버린다](../decisions/2026-10-01-own-syntax-and-layout.md) |

## 요약

`daphnis md`는 마크다운 문서 안의 ` ```dap ` 코드 블록을 SVG로 만들고, 블록 바로 아래에 그 그림을 보이는 이미지 줄을 넣거나 고친다. 같은 문서에 다시 돌려도 결과가 같고, `--check`는 문서와 SVG가 낡았는지만 알린다. 이 기능을 쓰기 위한 설치 경로(npm 패키지, 저장소 직접 실행, GitHub Action)와 배포 절차도 이 문서가 맡는다.

## 동기

문서 저장소는 그림 원본을 `.dap` 파일로 따로 두고, 문서에는 이미지 줄을 손으로 넣는다. 원본과 문서가 어긋나도 아무도 모르고, 글 옆에서 그림을 고치려면 파일을 두 개 열어야 한다. 원본을 문서 안에 두면 글과 그림이 한 파일에서 같이 바뀐다. GitHub는 ` ```dap ` 블록을 그림으로 그려 주지 않으므로 SVG를 저장소에 함께 두어야 하고, 그 SVG가 원본과 같은지 CI가 확인해야 한다.

## 예시

### 문서에 그림 넣기

1. 문서에 이름 붙인 블록을 쓴다.

````text
```dap name=flow
flow right
box doc "doc.md"
box cli "daphnis md"
doc -> cli
```
````

2. `daphnis md doc.md`를 돌린다. 명령이 `doc-flow.svg`를 쓰고, 블록 아래에 이미지 줄을 넣는다.

````text
```dap name=flow
...
```

![doc.md, daphnis md](doc-flow.svg)<!-- dap -->
````

3. 이름을 `name=path`로 바꾸고 다시 돌리면 이미지 줄이 `doc-path.svg`를 가리키고 옛 `doc-flow.svg`는 지워진다.

### CI에서 낡은 그림 잡기

1. 블록을 고치고 `md`를 돌리지 않은 채 올린다.
2. `daphnis md doc.md --check`가 `doc-flow.svg: is out of date. Run daphnis md to update it`을 내고 종료 코드 1로 끝난다. 아무 파일도 쓰지 않는다.

이 문서의 아래 그림은 이 문서의 ` ```dap ` 블록을 `daphnis md`로 만든 것이다.

```dap name=flow
flow right
title "daphnis md가 문서를 고치는 길"
box doc "문서(.md)"
box cli "daphnis md"
box svg "SVG 파일"
doc -> cli "dap 블록"
cli -> svg "그림 만들기"
cli -> doc "이미지 줄 넣기"
step "읽기" "문서에서 dap 블록을 모두 찾는다"
  doc -> cli
step "쓰기" "SVG를 쓰고 블록 아래 이미지 줄을 맞춘다"
  cli -> svg
  cli -> doc
```

![daphnis md가 문서를 고치는 길](markdown-flow.svg)<!-- dap -->

## 상세 설계

### 명령

```text
daphnis md <file.md ...> [--check] [--out-dir dir] [--static] [--strict] [--no-deprecated] [--require-data] [--require-ci] [--json]
```

| 옵션 | 뜻 |
|---|---|
| `--check` | 쓰지 않고 갱신이 필요한지만 알린다. 필요하면 종료 코드 1 |
| `--out-dir dir` | SVG를 `dir`에 쓴다. 기본은 문서와 같은 폴더 |
| `--static` | 멈춘 SVG를 쓴다 |
| `--strict`, `--no-deprecated`, `--require-data`, `--require-ci`, `--json` | `render`와 같은 뜻. 블록마다 적용한다 |

`render`의 `--out`, `--title`, `--html`, `--write`는 이 명령이 받지 않고, `--check`와 `--out-dir`는 다른 명령이 받지 않는다. 기존 명령의 동작은 바뀌지 않는다(명령 추가만).

### 블록

- 대상은 설명 글자의 첫 낱말이 `dap`인 울타리 블록이다. 백틱과 물결표 울타리, 목록 안 들여쓴 울타리를 읽는다. 다른 울타리(`text` 등) 안에 든 ` ```dap ` 줄은 블록이 아니다.
- 설명 글자의 선택 항목은 `name=<이름>` 하나다. 이름은 소문자, 숫자, `-`다. 다른 항목이나 형식이 틀린 이름은 오류다.
- 블록 안 글은 `.dap` 원본이다. `data`, `icons` 경로는 문서가 있는 폴더 기준이다.
- 오류 줄 번호는 문서 안 줄 번호다.

### 이미지 줄

- 블록의 닫는 울타리 아래에 빈 줄 하나를 두고 `![대체 글](주소)<!-- dap -->` 한 줄을 둔다. 끝의 `<!-- dap -->`가 이 도구가 만든 줄이라는 표시다. 표시가 있는 줄만 고치거나 지운다. 표시 없는 이미지 줄은 건드리지 않는다.
- 대체 글은 블록의 `title`이다. `title`이 없으면 이름, 이름도 없으면 `{문서 이름} figure {순번}`이다. 줄 바꿈과 대괄호는 이미지 문법을 깨므로 바꾼다.
- 주소는 문서 폴더 기준 상대 경로이고 구분자는 `/`다. 이미지 문법을 깨는 글자는 퍼센트 인코딩한다.
- 이미지 줄 뒤에 글이 바로 이어지면 빈 줄을 하나 더 둔다.
- 문서의 줄바꿈(LF 또는 CRLF)을 그대로 쓴다.
- 블록이 없어졌는데 남은 표시 있는 이미지 줄(울타리 밖)은 지운다.

### SVG 이름과 위치

- 이름은 `{문서 이름}-{블록 이름}.svg`다. 문서 이름은 확장자를 뺀 파일 이름이다. 이름 없는 블록은 `{문서 이름}-{순번}.svg`이고, 순번은 이름 없는 블록만 세어 1부터다. 이름 있는 블록은 문서 안에서 순서가 바뀌거나 앞에 블록이 늘어도 같은 이름이다.
- 위치는 문서 옆이고 `--out-dir`로 바꾼다.
- 한 실행 안에서 두 블록이 같은 파일을 쓰려 하면 오류다(같은 이름, 같은 문서 이름 두 개).
- 만든 SVG에는 `<!-- daphnis md {문서 파일 이름} -->` 표시가 들어 있다.

### 오래된 SVG 정리

실행이 끝나면 SVG 폴더에서 `{문서 이름}-`로 시작하는 `.svg` 중 이 문서의 표시가 들어 있고 이번 실행이 쓰지 않는 파일을 지운다. 표시가 없는 파일(손으로 만든 그림)과 이름이 비슷한 다른 문서의 SVG는 지우지 않는다. `--check`는 지우지 않고 지울 파일이 있으면 갱신 필요로 센다.

### 오류와 종료 코드

| 상황 | 종료 코드 | 파일 |
|---|---|---|
| 갱신 없음 또는 갱신 완료 | 0 | 바뀐 파일만 쓴다. 쓴 경로를 stdout에 한 줄씩 알리고, 지운 파일은 `removed {경로}`로 알린다 |
| `--check`에서 갱신 필요 | 1 | 쓰지 않는다. 낡은 파일마다 stderr에 `{경로}: is out of date. Run daphnis md to update it` 또는 `is a stale figure`를 알린다 |
| 어느 문서의 블록이든 오류(원본 오류, `--strict` 경고, 울타리 형식, 이름 겹침, 읽기 실패) | 1 | 모든 문서를 먼저 만들고 하나라도 오류면 아무 파일도 쓰거나 지우지 않는다([그림 검사](figure-check.md)의 gallery와 같은 계약) |
| 인자 오류 | 2 | 없음 |

같은 입력에 다시 돌리면 쓸 파일이 없다. SVG가 바이트 단위로 같게 나오는 것은 [배치](layout.md)의 결정성 요구사항이 지킨다.

### GitHub에서 보이는 모양

GitHub 마크다운은 ` ```dap ` 블록을 코드로 보이고 아래 이미지를 그림으로 보인다. 블록을 `<details>`로 접는 경우도 GitHub가 울타리를 렌더하는지 `POST /markdown`으로 확인했다(`<details>` 안 울타리는 앞뒤에 빈 줄이 있으면 코드 블록으로 렌더된다). 그래도 명령이 접기를 만들지는 않는다. 이유는 대안 절에 있다.

### 설치와 Action

| 경로 | 명령 | 상태 |
|---|---|---|
| npm | `npx daphnis md doc.md` | 배포 뒤 |
| 저장소 | `npx github:woonyong-choi/daphnis md doc.md` | 지금 |
| GitHub Action | `uses: woonyong-choi/daphnis@main` | 지금 |

저장소 루트 `action.yml`은 composite Action이다. 의존 패키지를 Action 폴더에 설치한 뒤 입력에 맞춰 명령을 돌린다.

| 입력 | 기본값 | 뜻 |
|---|---|---|
| `paths` | `**/*.dap **/*.md` | 공백으로 나눈 git 글롭 목록. 추적 중인 파일만 대상이다 |
| `mode` | `check` | `check`는 `.dap`에 `check`, `.md`에 `md --check`를 돈다. `render`는 `render`와 `md`를 돌려 파일을 쓴다 |
| `strict` | `false` | `true`면 경고도 실패다 |

대상 파일이 하나도 없으면 실패한다. 빈 글롭이 조용히 통과하는 일을 막기 위해서다. `render` 모드는 파일을 쓸 뿐 커밋하지 않는다.

### 배포

`.github/workflows/release.yml`은 `v*` 태그에서 돈다.

1. 태그가 `v{package.json version}`과 다르면 실패한다.
2. `secrets.NPM_TOKEN`이 없으면 해당 메시지로 실패한다.
3. `npm ci`, `npm test`, `npm run check`, 예제 `--strict` 검사를 돈다.
4. `npm publish --provenance --access public`을 한다. 버전에 `-`가 있으면 `--tag next`를 붙인다.
5. `gh release create`로 GitHub Release를 만든다. 버전에 `-`가 있으면 사전 배포 표시를 한다.

### 패키지

`package.json`의 `files`는 `src`, `LICENSE`, `NOTICE`다. README와 `package.json`은 npm이 늘 넣는다. 글꼴은 의존 패키지(`@expo-google-fonts/*`, `jetbrains-mono`)로 설치되고, 아이콘과 그 라이선스는 `src/icons`에 들어 있다. 시험, 문서, 예제, 스크립트는 올라가지 않는다. 실행 파일은 `bin`의 `daphnis` 하나이고 라이브러리 API는 내보내지 않는다(`exports` 없음).

### 요구사항

| 요구사항 | 검증 계획 |
|---|---|
| 블록 아래에 이미지 줄이 생기고 대체 글이 `title`이다. | `test/md.test.js` 이미지 줄 시험 |
| 다시 돌려도 결과가 같고 파일을 쓰지 않는다(멱등). | 같은 시험이 두 번째 실행의 stdout과 SVG 수정 시각 확인 |
| 이름 있는 블록은 순서가 바뀌어도 같은 SVG 이름이다. | 앞에 블록을 넣고 SVG 내용 비교 |
| 이름이 바뀌면 옛 SVG를 지우고, 손으로 만든 SVG와 다른 문서의 SVG는 둔다. | 이름 변경 시험(반대 사례: 접두사가 같은 파일 둘) |
| 블록이 없어지면 이미지 줄과 SVG를 정리하고, 다른 울타리 안의 표시 줄은 둔다. | 블록 삭제 시험 |
| 오류가 하나라도 있으면 어떤 파일도 쓰지 않는다. | 좋은 블록 옆의 나쁜 블록, `--strict` 경고, 틀린 설명 글자, 이름 겹침, 닫히지 않은 울타리 입력 |
| `--check`는 갱신이 필요하면 1, 아니면 0이고 쓰지 않는다. | 미생성, 최신, 블록 수정, 지울 SVG 네 상태의 종료 코드 |
| `--out-dir`의 이미지 주소는 문서 기준 상대 경로다. | `--out-dir` 시험 |
| 다른 울타리 안의 dap 줄은 그리지 않고, 들여쓴 블록은 그린다. | 울타리와 목록 시험 |
| CRLF 문서는 CRLF로 다시 쓰고 두 번째 실행은 바꾸지 않는다. | CRLF 시험 |
| 옵션은 명령마다 받는 것만 받는다. 기존 명령은 그대로다. | 옵션 거절 시험, 기존 `cli.test.js`, `compat.test.js` |
| 패키지에는 실행에 필요한 파일, 라이선스, NOTICE만 든다. | `test/package.test.js`(반대 사례: `files`에 `docs`를 더하면 실패) |
| 패키지를 설치해 실행할 수 있다. | 수동: `npm pack`, 빈 폴더에 설치, `npx daphnis render`와 `md`(자동 시험은 설치에 네트워크가 필요해 두지 않는다) |
| Action이 저장소 CI에서 돈다. | `ci.yml`의 `action` 작업 |

## 단점

- 문서와 같은 폴더에 SVG가 늘어난다. `--out-dir`로 모을 수 있지만 같은 이름의 문서가 서로 다른 폴더에 있으면 같은 `--out-dir`을 함께 쓸 수 없다(이름 겹침 오류).
- 이미지 줄 표시(`<!-- dap -->`)가 문서 원문에 남는다.
- 저장소를 이미지 서버로 쓰므로 GitHub 밖(npm 패키지 페이지 등)에서는 상대 주소 이미지가 깨진다.

## 대안

- 블록을 이미지로 바꾸고 원본을 지우는 방식(mermaid-cli의 기본)은 문서에서 원본을 잃으므로 쓰지 않는다. 원본은 블록으로 남긴다.
- 블록을 `<details>`로 접는 방식은 GitHub에서 렌더되지만, 문서 구조를 명령이 바꾸고 닫는 태그 자리를 이미지 줄 규칙과 맞춰야 한다. 쓰지 않는다.
- 이미지 줄을 구분하는 표시로 시작과 끝 주석 두 줄을 쓰는 방식은 문서가 길어져 한 줄 표시를 고른다.
- 이름 없는 블록의 이름을 문서 전체 순번으로 하는 방식은 이름 있는 블록이 끼면 이름이 밀려 쓰지 않는다.

## 미해결 질문

- 블록을 접어 보이는 `fold` 옵션을 둘지([#39](https://github.com/woonyong-choi/daphnis/issues/39))
