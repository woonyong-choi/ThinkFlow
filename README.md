# mutoscope

English | [한국어](README.ko.md)

A command that turns one `.muto` source into one animated documentation figure: a structure, sequence, state, or data relation diagram, or a chart.

Design documents need figures that show which path a request takes, and charts that show a baseline before the improved value. Drawing diagrams in D2 and charts in Vega-Lite gives two looks in one document, and the D2 layout does not match a custom drawing style. mutoscope measures every shape with the same font files it embeds, lays out with elkjs, checks the result for overlaps, and plays steps in an HTML player or an animated SVG.

> [!NOTE]
> In development. There is no npm release yet; run it straight from GitHub or from a clone.

## How it works

```text
flow right
title "Saturn"

person user "Developer"
group system "Saturn" direction=down {
  box tui "Screen"
  box engine "Engine"
}
external codex "Codex CLI"

user -> tui "input"
tui -> engine "JSON-RPC"
engine -> codex "app-server request"

step "Chat" "Input goes through the screen to the engine"
  user -> tui "question"
  show tui "why does this test fail?" tag="you"
  tui -> engine
  engine -> codex "turn" time=3s
```

![Figure rendered from the source above: the developer's question moves from Screen to Engine, then to Codex CLI](docs/assets/how-it-works.svg)

1. You write the first line as the figure kind, then shapes and edges, then steps from `step` on.
2. mutoscope lays out the shapes inside `system` from top to bottom and the rest from left to right.
3. In the first beat a dot moves from `user` to `tui`, and the card inside `tui` fills in when the dot arrives.
4. A typo such as `engine -> cdex` stops the build with `how-it-works.muto:19: unknown node "cdex". Did you mean "codex"? Declared: codex, engine, system, tui, user`.

## Installation

Requirements: Node.js 20 or later.

mutoscope is not on npm yet, so `npm install mutoscope` does not work. Run it straight from GitHub:

```sh
npx github:woonyong-choi/mutoscope render figure.muto
```

Or work from a clone:

```sh
git clone https://github.com/woonyong-choi/mutoscope.git
cd mutoscope
npm install
```

After the first npm release, `npm install --save-dev mutoscope` adds the `mutoscope` command to a project and `npx mutoscope` runs it. The examples below use `node src/cli.js` from a clone.

## Usage

### Render one figure

```sh
node src/cli.js render examples/memory.muto --html
```

```text
examples/memory.svg
examples/memory.html
```

The SVG animates without scripts. The HTML adds step tabs, pause, speed, fullscreen, and zoom. `--static` writes a still SVG.

### Check a figure

```sh
node src/cli.js check examples/memory.muto --strict --json
```

The command prints nothing and exits with 0 when the figure has no errors, warnings, or deprecated forms. `--strict` fails on warnings and `--no-deprecated` fails on deprecated forms. `--json` prints one `{ file, severity, code, line, column, message, fix? }` object per diagnostic.

### Migrate old files

```sh
node src/cli.js migrate examples/memory.muto
node src/cli.js migrate examples/memory.muto --write
```

Files written for an older grammar keep working. `migrate` shows the lines it would change as a diff and rewrites the file only with `--write`. It refuses a file that still has errors or deprecated forms after the change. The first line may be `mutoscope 1` to name the grammar version, and a file without it reads as version 1.

### Render all examples with a gallery

```sh
npm run examples
```

Open `examples/out/index.html` to see every example on one page.

### Keep figures in a Markdown document

Write the source in a `muto` code block. A name keeps the image file name stable when blocks move.

````text
```muto name=flow
flow right
box client "Client"
box server "Server"
client -> server "GET"
```
````

```sh
node src/cli.js md docs/guide.md
```

The command writes `docs/guide-flow.svg` next to the document and puts `![Client, Server](guide-flow.svg)<!-- muto -->` right below the block (the alt text is the figure `title`). Run it again and nothing changes. Renaming a block removes the old SVG, `--out-dir images` moves the SVG files, and `--check` writes nothing and exits with 1 when a document or SVG is out of date. Any error in any block stops the command before it writes. See [Markdown](docs/design/markdown.md) for the rules.

### Check figures in CI

The repository root has a composite GitHub Action. This step fails a pull request when a source has a warning or a Markdown figure is out of date:

```yaml
- uses: actions/checkout@v4
- uses: woonyong-choi/mutoscope@main
  with:
    paths: "docs/**/*.muto docs/**/*.md README.md"
    mode: check   # check (default) or render
    strict: true  # also fail on warnings
```

`paths` are git globs of tracked files. `mode: render` writes the SVG files and image lines but does not commit them. The step fails when no file matches.

## Features

- Figure syntax: one statement per line, quoted text, unique names, and line-numbered errors with suggestions.
- Figure kinds: structure, sequence, state, and data relation diagrams.
- Architecture diagrams: `no=` numbers edges so the order reads in still images, `badge=` adds a short letter badge that survives in black and white, `count=` stacks N replicas of one role, and `icon=` uses the bundled icons (IBM Carbon concepts and technology brand marks, drawn in one icon blue) or your own set registered with `icons name "folder"`.
- Cell grids: bit fields, arrays, stacks, and matrices drawn cell by cell, with merged, empty, and omitted cells and lit cells. Lines start and end at a single cell (`a -> grid.cell`), turning through the gaps between rows so they never cover a neighbor cell. Edges also take arrowheads at both ends or none (`head=`), and a small circle (`shape=circle`) draws a join such as ⊕.
- Charts: bar, dumbbell, box, scatter, line, heatmap, and difference charts, with values from the source or a JSON file.
- Layout: elkjs layout with per-group direction, using shape sizes measured with the embedded fonts.
- Colors and fonts: figures are mostly neutral gray, with groups one step darker per nesting depth. The brand blue `#125DE6` marks only what matters (the lit shape, flowing dots, the main chart series, the icons), and purple, red (errors), and green (healthy) are rare accents; orange is kept for comparison and warnings. A group can take a `sky` or `purple` accent with a tinted face. Every outline reaches contrast 3 and every text 4.5, in light and dark. Text uses the embedded Pretendard and JetBrains Mono files.
- Figure check: overlaps, edges through nodes, crowded edges, aspect ratio, and readability.
- Playback: an HTML player and an animated SVG from the same timeline.
- Markdown: `mutoscope md` renders the `muto` code blocks of a document and keeps the image lines below them up to date; a GitHub Action checks them in CI.

## Status

The code on `main` implements the redesign and the tests pass. The design documents for syntax, figure kinds, charts, layout, figure check, and playback are implemented; the docs skill integration is still a proposal. The previous D2-compatible version is kept at the `d2-compat` tag.

## Comparison

- D2: draws diagrams from a richer language and its own layouts (checked 2026-10-01). Use it when you need D2 shapes or themes.
- Vega-Lite: draws many more chart types (checked 2026-10-01). Use it when you need stacked bars, areas, or maps.

## Documentation

The design documents are written in Korean.

- [Architecture](docs/architecture.md): components, flows, and invariants
- [Figure syntax](docs/design/figure-syntax.md): line rules, file structure, flow figures, timeline, and errors
- [Figure kinds](docs/design/figure-kinds.md): sequence, state, and data relation figures
- [Cell grids](docs/design/grid.md): cell grid syntax, sizes, lighting a cell, and cell-to-cell lines
- [Charts](docs/design/charts.md): seven chart kinds, value sources, and revealing series
- [Layout](docs/design/layout.md): text measurement, shape sizes and ports, group layout, and aspect ratio
- [Figure check](docs/design/figure-check.md): screen error checks and messages
- [Playback](docs/design/playback.md): timeline, beat state, the HTML player, and the animated SVG
- [Markdown and release](docs/design/markdown.md): the `md` command, the GitHub Action, and publishing
- [Docs skill integration](docs/design/docs-integration.md): replacing D2 and Vega-Lite in the docs skill

All documents are listed in [docs/README.md](docs/README.md).

## Development

```sh
npm test
npm run check
```

See [CONTRIBUTING](.github/CONTRIBUTING.md) for branches, commits, and pull requests.

## License

[MIT](LICENSE)
