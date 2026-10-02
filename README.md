# mutoscope

English | [한국어](README.ko.md)

A command that turns one `.muto` source into one animated documentation figure: a structure, sequence, state, or data relation diagram, or a chart.

Design documents need figures that show which path a request takes, and charts that show a baseline before the improved value. Drawing diagrams in D2 and charts in Vega-Lite gives two looks in one document, and the D2 layout does not match a custom drawing style. mutoscope measures every shape with the same font files it embeds, lays out with elkjs, checks the result for overlaps, and plays steps in an HTML player or an animated SVG.

> [!NOTE]
> In development. There are no releases; build from source.

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

```sh
git clone https://github.com/woonyong-choi/mutoscope.git
cd mutoscope
npm install
```

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

## Features

- Figure syntax: one statement per line, quoted text, unique names, and line-numbered errors with suggestions.
- Figure kinds: structure, sequence, state, and data relation diagrams.
- Charts: bar, dumbbell, box, scatter, line, and heatmap charts, with values from the source or a JSON file.
- Layout: elkjs layout with per-group direction, using shape sizes measured with the embedded fonts.
- Figure check: overlaps, edges through nodes, crowded edges, aspect ratio, and readability.
- Playback: an HTML player and an animated SVG from the same timeline.

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
- [Charts](docs/design/charts.md): six chart kinds, value sources, and revealing series
- [Layout](docs/design/layout.md): text measurement, shape sizes and ports, group layout, and aspect ratio
- [Figure check](docs/design/figure-check.md): screen error checks and messages
- [Playback](docs/design/playback.md): timeline, beat state, the HTML player, and the animated SVG
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
