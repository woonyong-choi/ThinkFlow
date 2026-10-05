<br>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/daphnis-lockup-dark.svg">
    <img src="docs/assets/daphnis-lockup-light.svg" alt="daphnis" width="260">
  </picture>
</p>

English | [한국어](README.ko.md)

Turn one `.dap` text source into an animated SVG figure for documentation: asynchronous flows, sequences, states, data relations, and charts.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/showcase/async-orders-en-dark.svg">
    <img src="docs/assets/showcase/async-orders-en-light.svg" alt="Orders from four sources enter an event queue and spread to stock, payment, and notification consumers, while the queue fills and one mail is lost" width="100%">
  </picture>
</p>

Dots in a figure start at their own times and move at their own pace, so one scene shows several flows running at once, values changing as dots arrive, a queue filling, and a message lost on the way. The same source language draws sequence, state, and data relation diagrams and charts. daphnis measures text with the fonts it embeds, lays out with elkjs, checks the result for overlaps, and writes an animated SVG or an HTML player.

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

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/how-it-works-dark.svg">
  <img src="docs/assets/how-it-works-light.svg" alt="Figure rendered from the source above: the developer's question moves from Screen to Engine, then to Codex CLI">
</picture>

1. You write the first line as the figure kind, then shapes and edges, then steps from `step` on.
2. daphnis lays out the shapes inside `system` from top to bottom and the rest from left to right.
3. In the first beat a dot moves from `user` to `tui`, and the card inside `tui` fills in when the dot arrives.
4. A typo such as `engine -> cdex` stops the build with `how-it-works.dap:19: unknown node "cdex". Did you mean "codex"? Declared: codex, engine, system, tui, user`.

## Installation

Requirements: Node.js 20 or later.

```sh
npm install --save-dev daphnis
```

Run it with `npx daphnis <command>`.

## Gallery

<table>
  <tr>
    <td width="50%"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/showcase/order-rush-en-dark.svg"><img src="docs/assets/showcase/order-rush-en-light.svg" alt="Orders from the web, the app, and a partner reach the order API together, and the in-flight count and the stock change" width="100%"></picture><br>Simulation: concurrent flows and values that change. <a href="docs/reference/flow.md">Structure figures</a></td>
    <td width="50%"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/showcase/shop-schema-en-dark.svg"><img src="docs/assets/showcase/shop-schema-en-light.svg" alt="Shop database tables with foreign keys from orders to users and from order items to orders and products" width="100%"></picture><br>Data relations: tables and foreign keys. <a href="docs/reference/data.md">Data relation figures</a></td>
  </tr>
  <tr>
    <td width="50%"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/showcase/oauth-en-dark.svg"><img src="docs/assets/showcase/oauth-en-light.svg" alt="Sequence of the OAuth authorization code flow with PKCE between a user, an app, an auth server, and an API" width="100%"></picture><br>Sequence: messages in order. <a href="docs/reference/sequence.md">Sequence figures</a></td>
    <td width="50%"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/showcase/latency-en-dark.svg"><img src="docs/assets/showcase/latency-en-light.svg" alt="Dumbbell chart of p95 latency per endpoint before and after adding a cache" width="100%"></picture><br>Chart: a baseline and the improved value. <a href="docs/reference/charts.md">Charts</a></td>
  </tr>
  <tr>
    <td width="50%"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/showcase/cloud-architecture-en-dark.svg"><img src="docs/assets/showcase/cloud-architecture-en-light.svg" alt="Cloud architecture figure: web requests pass DNS, a CDN, a balancer, and web servers to the app server, while administrators reach it through a VPN and a bastion" width="100%"></picture><br>Architecture: groups, icons, and numbered edges. <a href="docs/reference/architecture.md">Architecture</a></td>
    <td width="50%"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/showcase/order-state-en-dark.svg"><img src="docs/assets/showcase/order-state-en-light.svg" alt="Order states from created to paid, shipped, and delivered, with cancellation as the other end state" width="100%"></picture><br>State: states and the moves between them. <a href="docs/reference/state.md">State figures</a></td>
  </tr>
</table>

## Usage

### Render one figure

Save the source from [How it works](#how-it-works) as `how-it-works.dap` and run:

```sh
npx daphnis render how-it-works.dap --html
```

```text
how-it-works.svg
how-it-works.html
```

The SVG animates without scripts. The HTML adds step tabs, pause, speed, fullscreen, and zoom. `--static` writes a still SVG that shows every line and shape at once with empty cards, no dots, and charts fully grown, so it reads as the structure of the whole figure rather than one step.

### Check a figure

```sh
npx daphnis check how-it-works.dap --strict --json
```

The command prints nothing and exits with 0 when the figure has no errors, warnings, or deprecated forms. `--strict` fails on warnings and `--no-deprecated` fails on deprecated forms. `--json` prints one `{ file, severity, code, line, column, message, fix? }` object per diagnostic. A figure that would generate more than a budget allows (for example a grid with hundreds of thousands of cells) fails with a `budget-exceeded` error before any file is written; `--budget grid-elements=2000000` raises it, and `render`, `check`, `gallery`, and `md` all take `--budget name=value`.

### Keep figures in a Markdown document

Write the source in a `dap` code block and run `daphnis md`:

````text
```dap name=request
flow right
box client "Client"
box server "Server"
client -> server "GET /orders"
```
````

```sh
npx daphnis md guide.md
```

The command writes `guide-request.svg` next to the document and puts `![request](guide-request.svg)<!-- dap -->` right below the block. The alt text is the block's `title`, or its name when there is no title. Run it again and nothing changes.

Renaming a `dap` block removes the old SVG, `--out-dir images` writes the SVG files into that folder and points the image lines there (SVG files already next to the document stay, so delete them by hand), and `--check` writes nothing and exits with 1 when a document or SVG is out of date. `--fold` shows the figure first and folds each `dap` block into a `<details>` section (`--fold-title "text"` sets the summary text), `--unfold` undoes only the folds daphnis made, and without either option a document keeps its folded state; the GitHub Action takes the same choice as the `fold` and `fold-title` inputs. A document only writes and removes the SVG files it made. If a block would write over an SVG made for another document, or over a file with no `daphnis md` mark, the command reports a conflict instead, and two runs cannot write to the same output folder at once. Any error in any block stops the command before it writes. See [Markdown](docs/design/markdown.md) for the rules.

### Keep them current in CI

This GitHub Action step fails a pull request when a source has a warning or a Markdown figure is out of date:

```yaml
- uses: actions/checkout@v4
- uses: woonyong-choi/daphnis@main
  with:
    paths: "docs/**/*.dap docs/**/*.md README.md"
    mode: check   # check (default) or render
    strict: true  # also fail on warnings
    budget: "grid-elements=2000000"  # optional: raise generation budgets
```

`paths` are git globs of tracked files. `mode: render` writes the SVG files and image lines but does not commit them. The step fails when no file matches. `budget` takes `name=value` items separated by spaces or commas and raises the generation budgets (the same as `--budget`); a bad name or value fails the step before any figure is built.

### Migrate old files

```sh
npx daphnis migrate how-it-works.dap
npx daphnis migrate how-it-works.dap --write
```

Files written for an older grammar keep working. `migrate` shows the lines it would change as a diff and rewrites the file only with `--write`. It refuses a file that still has errors or deprecated forms after the change. The first line may be `daphnis 1` to name the grammar version, and a file without it reads as version 1.

## Features

- Asynchronous scenes: tracks that start at their own times and speeds, values that change when a dot arrives, queues that fill, and dots lost on the way.
- Figure kinds: structure, architecture, sequence, state, and data relation diagrams, cell grids, and charts.
- Architecture diagrams: `no=` numbers edges so the order reads in still images, `badge=` adds a short letter badge that survives in black and white, `count=` stacks N replicas of one role, and `icon=` uses the bundled icons or your own set registered with `icons name "folder"`.
- Cell grids: bit fields, arrays, stacks, and matrices drawn cell by cell, with lines that start and end at a single cell.
- Charts: bar, dumbbell, box, scatter, line, heatmap, and difference charts, with values from the source or a JSON file.
- Layout: elkjs layout with per-group direction, using shape sizes measured with the embedded fonts.
- Colors and fonts: mostly neutral gray, with a brand blue only for what matters. Every outline reaches contrast 3 and every text 4.5, in light and dark. Text uses the embedded Pretendard and JetBrains Mono files.
- Figure check: overlaps, edges through nodes, crowded edges, aspect ratio, and readability.
- Playback: an HTML player and an animated SVG from the same timeline.
- Markdown: `daphnis md` renders the `dap` code blocks of a document and keeps the image lines below them up to date, and a GitHub Action checks them in CI.

## Comparison

- D2: draws diagrams from a richer language and its own layouts (checked 2026-10-01). Use it when you need D2 shapes or themes.
- Vega-Lite: draws many more chart types (checked 2026-10-01). Use it when you need stacked bars, areas, or maps.

## Documentation

The design documents and the per-kind references are written in Korean.

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
- [Structure figures](docs/reference/flow.md), [architecture](docs/reference/architecture.md), [sequence figures](docs/reference/sequence.md), [state figures](docs/reference/state.md), [data relation figures](docs/reference/data.md), [cell grids](docs/reference/grid.md), and [charts](docs/reference/charts.md): a minimal example, steps, and common errors for each kind

All documents are listed in [docs/README.md](docs/README.md).

## Development

```sh
git clone https://github.com/woonyong-choi/daphnis.git
cd daphnis
npm install
npm test
npm run check
```

Shared design values (color roles, spacing, text sizes) come from the [design-tokens](https://github.com/woonyong-choi/design-tokens) package, which `npm install` fetches from GitHub by tag, so `git` must be available. Only figure-specific tokens live in `src/tokens.json`. A workflow opens a pull request when design-tokens publishes a new tag. In a clone, run `node src/cli.js` in place of `daphnis`, and `npm run examples` to render every example into `examples/out/index.html`.

See [CONTRIBUTING](.github/CONTRIBUTING.md) for branches, commits, and pull requests.

## License

[MIT](LICENSE)
