# d2-flow

English | [한국어](README.ko.md)

A command that turns D2 diagrams into animated flow figures in the Hindsight documentation style.

Engineers who draw architecture in D2 cannot show which path one request takes through the boxes. d2-flow reads flow lines written inside the same D2 file and plays them as dots that travel along the edges. Unlike D2 animations, which switch whole boards, it follows one request edge by edge and keeps the D2 source valid for the `d2` command.

> [!NOTE]
> In development. There are no releases; build from source.

## How it works

```d2
direction: right
agent: Your AI Agent
api: Hindsight API {
  retain: "Retain\nLLM extraction"
}
facts: "Facts\nworld · experience" {shape: cylinder}
agent -> api.retain: retain()
api.retain -> facts

#@ step "retain()": The agent sends the conversation
#@   agent -> retain "the conversation"
#@   show agent [user/gray] “Alice joined Google in March.”
#@   retain -> facts +3s : An LLM extracts facts
#@   show facts [world] Alice joined Google · Mar 2026 (new)
#@   retain -> agent "✓ stored"
```

1. You write a normal D2 diagram and add flow lines that start with `#@`.
2. d2-flow lays out the diagram with D2 and draws it in the Hindsight figure style.
3. The figure shows a `retain()` tab and its caption.
4. A dot carries `the conversation` from `agent` to `retain`, and a card inside `agent` fills in.
5. The last dot runs back along the same edge to `agent`.

The full syntax is in [Flow syntax](docs/design/flow-syntax.md).

## Installation

Node.js 20 or later is required. The `d2` command is optional; one test uses it and skips when it is missing. Run the following command in the project folder.

```sh
npm install
```

## Usage

### Render one diagram

```sh
node src/cli.js examples/memory.d2 --out examples/out
```

```text
examples/out/memory.html
examples/out/memory.svg
```

Open the HTML file for the player with tabs, pause, and speed control. Put the SVG file in a README to show the animation without scripts.

### Render all examples with a gallery

```sh
npm run examples
```

```text
> d2-flow@0.0.0 examples
> node src/cli.js examples/*.d2 --out examples/out --gallery

examples/out/browser.html
examples/out/browser.svg
examples/out/ci-pipeline.html
examples/out/ci-pipeline.svg
examples/out/classes.html
examples/out/classes.svg
examples/out/dashboard.html
examples/out/dashboard.svg
examples/out/hindsight.html
examples/out/hindsight.svg
examples/out/k8s.html
examples/out/k8s.svg
examples/out/kafka.html
examples/out/kafka.svg
examples/out/memory.html
examples/out/memory.svg
examples/out/multi-agent.html
...
```

Open `examples/out/index.html` to see every example on one page. `npm run examples:bigtech` renders larger architecture demos, and `npm run examples:showcase` renders demos of tables, relation graphs, quiet edges, and charts. The options are `--out`, `--layout elk|dagre` (default `elk`), `--html-only`, `--svg-only`, and `--gallery`.

## Features

- Flow syntax: `#@` lines add steps, moving dots, cards, and captions to a D2 file.
- Rendering: shapes laid out by D2 are drawn with dotted backgrounds, rounded containers, pill labels, and cards.
- Playback: an HTML player with tabs and speed control, and an SVG that animates without scripts.
- Quiet edges and graphs: edges that show only in the step that uses them, and small relation graphs inside cards.
- Charts: paired bar charts and before-to-after arrow charts written with `#@ chart` lines.

## Status

The command and the examples work from source, and the tests pass. There is no release and no npm package. The flow syntax and output files may change without notice before 1.0.

## Comparison

- D2 animations: D2 can switch between boards at an interval and animate dashed edges (checked 2026-09-30). Use them when each step is a different diagram.
- hindsight-interfig: the Hindsight figure component takes a hand-arranged layout in JavaScript (checked 2026-09-30). Use it when you need exact control of rows and columns.

## Documentation

The design documents are written in Korean.

- [Architecture](docs/architecture.md): components, flows, and invariants
- [Flow syntax](docs/design/flow-syntax.md): line types, name lookup, card rows, and errors
- [Rendering](docs/design/rendering.md): two-pass layout, shape sizes, shapes, and edge paths
- [Playback](docs/design/playback.md): step timing and state, the HTML player, and the animated SVG
- [Charts](docs/design/charts.md): syntax and drawing of bar charts and arrow charts

All documents are listed in [docs/README.md](docs/README.md).

## Development

```sh
npm test
npm run check
```
