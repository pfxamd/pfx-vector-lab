# Architecture and scope

## Independent consumer

PFx Vector Lab is a separate, static application. Its source does not contain copies of algorithms from PFx Vector Core. Source anchors, pointer state, toolbar state, canvas camera, I/O, and undo/redo belong to the application. Geometry operations belong to the pinned Rust kernel.

```
User input / pointers / SVG import
            |
  UI shape model / SVG path serialization
            |
   @pfxamd/vector-core-web (built locally)
            |
       wasm-bindgen glue
            |
    PFx Vector Core v1.0.0 (pinned source)
            |
     geometry / topology results
            |
    Browser SVG renderer (display only)
```

`createVectorCore` is compiled directly from the pinned upstream TypeScript adapter. It calls compiled, real Rust/WebAssembly exports. No Canvas2D/SVG DOM geometry algorithm substitutes for Rust computations. UI-origin SVG serialization is limited to building path command strings from draggable authoring controls.

## Source boundaries

- `src/shape-model.mjs`: authoring model, serialization, clone/translation of UI handles, SVG export document.
- `src/app.mjs`: UI actions, pointer handling, history, WASM adapter initialization, binding geometry output to elements.
- `src/styles.css`: theme tokens, layout, responsive shell.
- `scripts/build.sh`: clones and **verifies exact upstream commit** and builds WASM and adapter into `dist/`.
- `tests/shape-model.test.mjs`: authoring model and export safety checks.
- `tests/browser-smoke.mjs`: verifies real core integration on Chromium, Firefox and WebKit (CI).

## Deliberate limits of Alpha 0.1

- Imported SVG path supports the first `<path>` only; arbitrary groups, text, filters, external assets, and entire SVG scene graphs are not edited.
- Imported raw paths can be inspected, combined and exported, but do not expose editable anchors until a preset is selected. The existing core does not provide a full source-to-editor-anchor decomposition through the web API.
- Bezier handles are independent; automatic smooth/symmetric constraints are not enabled.
- WASM path-string APIs reparse inputs per call. This lab is intended for bounded example contours, not tens of thousands of segments at interactive rates.
- The inspector reports scalar length and bounding-box size but not document-level history, layers, text, or rendering state.
- File size is limited to 1 MB. This is not a security certification for untrusted complex SVG input.
- The workbench targets laptop/desktop viewports; no phone-first editor workflow is implemented.
- Undo/redo tracks authoring mutations, not every inspector mode, zoom, or panel selection.

## Release and dependency policy

- Upstream kernel GitHub tag: `v1.0.0`.
- Exact upstream commit: `603a358e72c145808fbc50e38b2ebc24e85ed2c4`.
- Runtime third-party UI dependencies: none. Runtime relies only on local generated WASM + local upstream adapter.
- Build and CI use Rust, wasm-pack, Node, TypeScript, and Playwright.
- Updating the kernel requires an explicit pinned-commit change followed by full browser and Node integration validation.
