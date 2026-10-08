# PFx Vector Lab

**Alpha 0.1 — independent geometry workbench powered by [PFx Vector Core v1.0.0](https://github.com/pfxamd/pfx-vector-core/releases/tag/v1.0.0).**

This is a usable browser geometry integration environment, not a mock screenshot and not a replacement implementation of the kernel. The editor's shape model and drag controls create SVG path data; all measurements, offsets, path intersections, Boolean operations, and topology work are executed by the real Rust core compiled into WebAssembly.

## Features

- Drag Bézier anchors and inbound/outbound handles on an SVG canvas.
- Three starting paths and selection-aware numeric coordinate editing.
- Undo/redo for authoring changes, grid, pan, and zoom.
- Boolean union, intersection, difference, xor with repositionable second shape.
- WASM-driven offset, point-at-length samples, intersection points, length and bounds.
- Paste SVG path data or import a file's first SVG `<path>`.
- Export valid computed SVG and copy source paths.
- Dark/light theme. Entire geometry engine stays client-side after initial load.

## Build locally

Prerequisites: Git, Rust stable (>= 1.85), wasm32 target, wasm-pack, Node 22, npm, Python 3.

```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-pack --locked
npm test
npm run verify
npm run build
npm run serve
```

Open `http://127.0.0.1:8787/`.

**Do not open `index.html` directly using `file://`.** `dist/` must be built first, because no precompiled WASM is checked into this independent repository. The build clones the upstream v1.0.0 source into `.cache/vector-core`, verifies the exact Git commit, then compiles and copies the generated browser WASM and TypeScript adapter into `dist/engine/`.

## Publish to GitHub Pages

1. Use the existing independent repository [pfxamd/pfx-vector-lab](https://github.com/pfxamd/pfx-vector-lab) and place these project files at its root.
2. Open **Settings → Pages → Build and deployment**, select **GitHub Actions** as the source.
3. Push to `main`. The included workflow builds pinned upstream WASM, verifies the lab through unit/browser tests and deploys `dist/` only if checks pass.
4. Once deployment succeeds, visit `https://pfxamd.github.io/pfx-vector-lab/`.

That URL is the expected GitHub Pages address for this repo configuration, **not an active site until the GitHub Pages workflow deploys successfully**.

## Architecture, supported scope, known limitations

See [Architecture](docs/ARCHITECTURE.md) for the actual dependency boundaries and deliberately unsupported editor functions.

This lab does not modify or publish the upstream core, and does not redistribute a renamed third-party geometry implementation. All runtime geometry engine functionality is the project's own PFx Vector Core revision, integrated through its official WebAssembly/TypeScript boundary.

## License

Apache-2.0.
