import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRESETS, clonePreset, pathFromAnchors, translateAnchor,
  svgDocument, SECONDARY_PATH,
} from '../src/shape-model.mjs';

test('all presets serialize to closed cubic SVG paths', () => {
  for (const name of Object.keys(PRESETS)) {
    const anchors = clonePreset(name);
    const path = pathFromAnchors(anchors);
    assert.match(path, /^M\d+ \d+ C/);
    assert.match(path, /Z$/);
    assert.equal((path.match(/C/g) || []).length, anchors.length);
    assert.equal(anchors.length, 4);
  }
});
test('presets are deep copied', () => {
  const anchors = clonePreset('contour');
  anchors[0].x = 999;
  anchors[0].in.x = 888;
  assert.notEqual(clonePreset('contour')[0].x, 999);
  assert.notEqual(clonePreset('contour')[0].in.x, 888);
});
test('dragging anchor preserves local tangents', () => {
  const anchors = clonePreset('contour');
  const before = structuredClone(anchors[0]);
  translateAnchor(anchors, 0, 13, -7);
  for (const p of ['x', 'y']) {
    const delta = p === 'x' ? 13 : -7;
    assert.equal(anchors[0][p], before[p] + delta);
    assert.equal(anchors[0].in[p], before.in[p] + delta);
    assert.equal(anchors[0].out[p], before.out[p] + delta);
  }
});
test('invalid preset and invalid control coordinate fail fast', () => {
  assert.throws(() => clonePreset('missing'), RangeError);
  const anchors = clonePreset('bloom');
  anchors[0].x = Number.NaN;
  assert.throws(() => pathFromAnchors(anchors), TypeError);
  assert.throws(() => pathFromAnchors([]), RangeError);
});
test('SVG document exports path markup, not arbitrary DOM content', () => {
  const text = svgDocument([{data: SECONDARY_PATH}]);
  assert.match(text, /viewBox="0 0 840 560"/);
  assert.match(text, /<path d="/);
  assert.throws(() => svgDocument([{data: 'M0 0" onload="alert(1)'}]), TypeError);
});
