# Contributing

This guide explains how to contribute to thinkflow.

## Before you start

Open an issue before you start work.

## Development environment

Requirements: Node.js 20 or later.

```sh
git clone https://github.com/woonyong-choi/thinkflow.git
cd thinkflow
npm install
```

## Checks

All of the following commands must pass before a pull request.

```sh
npm test
npm run check
```

## Commits and pull requests

| Item | Format | Example |
|---|---|---|
| Branch | `{type}/{issue number}-{scope}-{description}` | `fix/31-check-label-overlap` |
| Commit | `{type}({scope}): {description in Korean}` | `fix(check): 그룹 제목과 겹친 라벨 검사` |
| Pull request | One pull request per issue, with `Closes: #{number}` in the body | Not applicable |

## Documentation

When you change behavior, a contract, or a setting, update the [design documents](../docs/README.md) in the same pull request. The design documents are written in Korean.
