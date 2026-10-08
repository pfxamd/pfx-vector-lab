#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CORE_TAG="v1.0.0"
CORE_SHA="603a358e72c145808fbc50e38b2ebc24e85ed2c4"
CORE_DIR="${PFx_VECTOR_CORE_SRC:-${ROOT}/.cache/vector-core}"

for command in git cargo wasm-pack node npm; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Missing build prerequisite: $command" >&2
    exit 1
  fi
done

if [ ! -d "${CORE_DIR}/.git" ]; then
  mkdir -p "$(dirname "$CORE_DIR")"
  git clone --depth 1 --branch "$CORE_TAG" https://github.com/pfxamd/pfx-vector-core.git "$CORE_DIR"
fi

ACTUAL_SHA="$(git -C "$CORE_DIR" rev-parse HEAD)"
if [ "$ACTUAL_SHA" != "$CORE_SHA" ]; then
  echo "Refusing to build unverified core revision: $ACTUAL_SHA (expected $CORE_SHA)" >&2
  echo "Remove the cached source and rebuild at pinned tag $CORE_TAG." >&2
  exit 1
fi

printf '\n==> Compile Rust geometry into browser WebAssembly\n'
wasm-pack build "$CORE_DIR/crates/pfx-vector-wasm" --release --target web --out-dir pkg
printf '\n==> Compile the pinned TypeScript consumer adapter\n'
npm install --prefix "$CORE_DIR/packages/pfx-vector-web" --no-audit --no-fund
npm run build:integration --prefix "$CORE_DIR/packages/pfx-vector-web"
printf '\n==> Assemble independent static application\n'
rm -rf "$ROOT/dist"
mkdir -p "$ROOT/dist/engine"
cp "$ROOT/index.html" "$ROOT/dist/index.html"
cp -R "$ROOT/src" "$ROOT/dist/src"
cp "$CORE_DIR/crates/pfx-vector-wasm/pkg/pfx_vector_wasm.js" "$ROOT/dist/engine/"
cp "$CORE_DIR/crates/pfx-vector-wasm/pkg/pfx_vector_wasm_bg.wasm" "$ROOT/dist/engine/"
cp "$CORE_DIR/packages/pfx-vector-web/dist/index.js" "$ROOT/dist/engine/vector-core-web.js"
cat > "$ROOT/dist/build-info.json" <<JSON
{"project":"pfx-vector-lab","version":"0.1.0","coreTag":"${CORE_TAG}","coreCommit":"${CORE_SHA}"}
JSON
printf '\nBuild complete: %s\n' "$ROOT/dist"
