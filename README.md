<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/daphnis-lockup-dark.svg">
    <img src="docs/assets/daphnis-lockup-light.svg" alt="daphnis" width="260">
  </picture>
</p>

English | [한국어](README.ko.md)

A command that turns one `.dap` source into one animated documentation figure: a structure, sequence, state, or data relation diagram, or a chart.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/showcase/cloud-architecture-en-dark.svg">
    <img src="docs/assets/showcase/cloud-architecture-en-light.svg" alt="Cloud architecture figure: web requests pass DNS, a CDN, a balancer, and web servers to the app server, while administrators reach it through a VPN and a bastion" width="100%">
  </picture>
</p>

Design documents need figures that show which path a request takes, and charts that show a baseline before the improved value. Drawing diagrams in D2 and charts in Vega-Lite gives two looks in one document, and the D2 layout does not match a custom drawing style. daphnis measures every shape with the same font files it embeds, lays out with elkjs, checks the result for overlaps, and plays steps in an HTML player or an animated SVG.

> [!NOTE]
> In development. There is no npm release yet; run it straight from GitHub or from a clone.

## Gallery

<table>
  <tr>
    <td width="50%"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/showcase/order-rush-en-dark.svg"><img src="docs/assets/showcase/order-rush-en-light.svg" alt="Orders from the web, the app, and a partner reach the order API together, and the in-flight count and the stock change" width="100%"></picture><br>Simulation: concurrent flows and values that change. <a href="docs/reference/flow.md">Structure figures</a></td>
    <td width="50%"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/showcase/shop-schema-en-dark.svg"><img src="docs/assets/showcase/shop-schema-en-light.svg" alt="Shop database tables with foreign keys from orders to users and from order items to orders and products" width="100%"></picture><br>Data relations: tables and foreign keys. <a href="docs/reference/data.md">Data relation figures</a></td>
  </tr>
  <tr>
    <td width="50%"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/showcase/latency-en-dark.svg"><img src="docs/assets/showcase/latency-en-light.svg" alt="Dumbbell chart of p95 latency per endpoint before and after adding a cache" width="100%"></picture><br>Chart: a baseline and the improved value. <a href="docs/reference/charts.md">Charts</a></td>
    <td width="50%"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/showcase/oauth-en-dark.svg"><img src="docs/assets/showcase/oauth-en-light.svg" alt="Sequence of the OAuth authorization code flow with PKCE between a user, an app, an auth server, and an API" width="100%"></picture><br>Sequence: messages in order. <a href="docs/reference/sequence.md">Sequence figures</a></td>
  </tr>
</table>

## Quick start

Requirements: Node.js 20 or later.

daphnis is not on npm yet, so `npm install daphnis` does not work. Run it straight from GitHub with `npx github:woonyong-choi/daphnis <command>`, as the steps below do.

Or work from a clone and run `node src/cli.js` in place of `daphnis`:

```sh
git clone https://github.com/woonyong-choi/daphnis.git
cd daphnis
npm install
```

After the first npm release, `npm install --save-dev daphnis` adds the `daphnis` command to a project and `npx daphnis` runs it.

1. Write one source. Save this as `hello.dap`:

   ```text
   flow right
   title "Request path"

   box client "Client"
   box server "Server"
   store db "Database"

   client -> server "GET /orders"
   server -> db "SELECT"

   step "Request" "The client calls the server, which reads the database"
     client -> server
     server -> db
   ```

2. Render it:

   ```sh
   npx github:woonyong-choi/daphnis render hello.dap
   ```

   The command writes `hello.svg`, an animated SVG that plays without scripts. Add `--html` for a player with step tabs, pause, speed, fullscreen, and zoom.

3. Put figures in a Markdown document. Write the source in a `dap` code block and run `daphnis md`:

   ````text
   ```dap name=request
   flow right
   box client "Client"
   box server "Server"
   client -> server "GET /orders"
   ```
   ````

   ```sh
   npx github:woonyong-choi/daphnis md guide.md
   ```

   The command writes `guide-request.svg` next to the document and puts `![request](guide-request.svg)<!-- dap -->` right below the block. The alt text is the block's `title`, or its name when there is no title. Run it again and nothing changes.

4. Keep them current in CI. This GitHub Action step fails a pull request when a source has a warning or a Markdown figure is out of date:

   ```yaml
   - uses: actions/checkout@v4
   - uses: woonyong-choi/daphnis@main
     with:
       paths: "docs/**/*.dap docs/**/*.md README.md"
       mode: check   # check (default) or render
       strict: true  # also fail on warnings
   ```

   `paths` are git globs of tracked files. `mode: render` writes the SVG files and image lines but does not commit them. The step fails when no file matches.

## Figure kinds

| Kind | Demo | Reference |
|---|---|---|
| Structure (`flow`) | [Orders arriving together](docs/assets/showcase/order-rush-en-light.svg) | [Structure figures](docs/reference/flow.md) |
| Architecture (`flow` with groups and icons) | [Cloud architecture](docs/assets/showcase/cloud-architecture-en-light.svg) | [Architecture](docs/reference/architecture.md) |
| Sequence (`sequence`) | [OAuth with PKCE](docs/assets/showcase/oauth-en-light.svg) | [Sequence figures](docs/reference/sequence.md) |
| State (`state`) | [Order states](docs/assets/showcase/order-state-en-light.svg) | [State figures](docs/reference/state.md) |
| Data relation (`data`) | [Shop database](docs/assets/showcase/shop-schema-en-light.svg) | [Data relation figures](docs/reference/data.md) |
| Cell grid (`grid` in `flow`) | [Splitting an address](docs/assets/showcase/address-split-en-light.svg) | [Cell grids](docs/reference/grid.md) |
| Chart (`chart`) | [p95 latency](docs/assets/showcase/latency-en-light.svg) | [Charts](docs/reference/charts.md) |

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
2. daphnis lays out the shapes inside `system` from top to bottom and the rest from left to right.
3. In the first beat a dot moves from `user` to `tui`, and the card inside `tui` fills in when the dot arrives.
4. A typo such as `engine -> cdex` stops the build with `how-it-works.dap:19: unknown node "cdex". Did you mean "codex"? Declared: codex, engine, system, tui, user`.

## Usage

### Render one figure

The commands in this section run from a clone.

```sh
node src/cli.js render examples/memory.dap --html
```

```text
examples/memory.svg
examples/memory.html
```

The SVG animates without scripts. The HTML adds step tabs, pause, speed, fullscreen, and zoom. `--static` writes a still SVG that shows every line and shape at once with empty cards, no dots, and charts fully grown, so it reads as the structure of the whole figure rather than one step.

### Check a figure

```sh
node src/cli.js check examples/memory.dap --strict --json
```

The command prints nothing and exits with 0 when the figure has no errors, warnings, or deprecated forms. `--strict` fails on warnings and `--no-deprecated` fails on deprecated forms. `--json` prints one `{ file, severity, code, line, column, message, fix? }` object per diagnostic.

### Migrate old files

```sh
node src/cli.js migrate examples/memory.dap
node src/cli.js migrate examples/memory.dap --write
```

Files written for an older grammar keep working. `migrate` shows the lines it would change as a diff and rewrites the file only with `--write`. It refuses a file that still has errors or deprecated forms after the change. The first line may be `daphnis 1` to name the grammar version, and a file without it reads as version 1.

### Render all examples with a gallery

```sh
npm run examples
```

Open `examples/out/index.html` to see every example on one page.

### Keep figures in a Markdown document

Renaming a `dap` block removes the old SVG, `--out-dir images` writes the SVG files into that folder and points the image lines there (SVG files already next to the document stay, so delete them by hand), and `--check` writes nothing and exits with 1 when a document or SVG is out of date. Any error in any block stops the command before it writes. See [Markdown](docs/design/markdown.md) for the rules, and [Quick start](#quick-start) for the first run and the GitHub Action.

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
- Markdown: `daphnis md` renders the `dap` code blocks of a document and keeps the image lines below them up to date; a GitHub Action checks them in CI.

## Status

The code on `main` implements the redesign and the tests pass. The design documents for syntax, figure kinds, charts, layout, figure check, and playback are implemented; the docs skill integration is still a proposal. The previous D2-compatible version is kept at the `d2-compat` tag.

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
npm test
npm run check
```

Shared design values (color roles, spacing, text sizes) come from the [design-tokens](https://github.com/woonyong-choi/design-tokens) package, which `npm install` fetches from GitHub by tag, so `git` must be available. Only figure-specific tokens live in `src/tokens.json`. A workflow opens a pull request when design-tokens publishes a new tag.

See [CONTRIBUTING](.github/CONTRIBUTING.md) for branches, commits, and pull requests.

## License

[MIT](LICENSE)
