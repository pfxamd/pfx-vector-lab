import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const files = [
  'index.html','src/app.mjs','src/shape-model.mjs','src/styles.css',
  'scripts/build.sh','tests/shape-model.test.mjs','tests/browser-smoke.mjs',
  '.github/workflows/pages.yml','docs/ARCHITECTURE.md','README.md',
];
for (const path of files) {
  assert.ok(existsSync(path), `File is missing: ${path}`);
  if (path.endsWith('.mjs')) execFileSync(process.execPath, ['--check', path]);
}
const html = readFileSync('index.html', 'utf8');
const code = readFileSync('src/app.mjs', 'utf8');
const coreScript = readFileSync('scripts/build.sh', 'utf8');
for (const id of ['stageSvg','sourceShape','resultShape','controlLayer','pathSource','exportButton','engineStatus']) {
  assert.ok(html.includes(`id="${id}"`), `HTML element absent: ${id}`);
}
for (const operation of ['unionPaths','intersectPathAreas','subtractPaths','xorPaths','offsetPath','pointsAtLengths','intersectPaths']) {
  assert.ok(code.includes(`core.${operation}(`), `Core operation missing: ${operation}`);
}
assert.ok(coreScript.includes('603a358e72c145808fbc50e38b2ebc24e85ed2c4'), 'Core commit is not pinned');
assert.ok(!html.includes('https://'), 'App shell should not have remote runtime dependencies');
console.log(`Source verification: PASS (${files.length} files, pinned Rust core, no remote app-shell dependencies)`);
