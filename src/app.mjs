import {
  PRESETS, SECONDARY_PATH, clonePreset, pathFromAnchors,
  translateAnchor, svgDocument,
} from './shape-model.mjs';

const $ = (id) => document.getElementById(id);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const stage = $('stageSvg');
const baseView = { x: 0, y: 0, w: 840, h: 560 };
const state = {
  tab: 'edit', preset: 'contour', anchors: clonePreset(), rawPath: null,
  selected: 0, operation: 'union', secondaryX: 0, secondaryY: 0,
  showSource: true, showHandles: true, showGrid: true,
  inspection: 'points', sampleCount: 12, offset: 18,
  view: { ...baseView },
};
let core = null;
let engineError = null;
let drag = null;
const undoStack = [];
const redoStack = [];
let toastTimeout = null;
let frameQueued = false;
let lastResult = '';
let lastPrimary = '';
let lastSecondary = SECONDARY_PATH;

const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const format = (value, decimals = 1) => Number.isFinite(value) ? value.toFixed(decimals) : '—';
function snapshot() {
  return JSON.stringify({ preset: state.preset, anchors: state.anchors, rawPath: state.rawPath,
    secondaryX: state.secondaryX, secondaryY: state.secondaryY });
}
function saveSnapshot(before) {
  if (before === snapshot()) return;
  undoStack.push(before);
  if (undoStack.length > 60) undoStack.shift();
  redoStack.length = 0;
  updateHistoryButtons();
}
function updateHistoryButtons() { $('undo').disabled = undoStack.length === 0; $('redo').disabled = redoStack.length === 0; }
function loadSnapshot(source) {
  const next = JSON.parse(source);
  Object.assign(state, next);
  state.selected = clamp(state.selected, 0, state.anchors.length - 1);
  syncControls();
  requestRender();
}
function undo() {
  if (!undoStack.length) return;
  redoStack.push(snapshot());
  loadSnapshot(undoStack.pop());
  updateHistoryButtons();
}
function redo() {
  if (!redoStack.length) return;
  undoStack.push(snapshot());
  loadSnapshot(redoStack.pop());
  updateHistoryButtons();
}
function notify(message) {
  clearTimeout(toastTimeout);
  $('toast').textContent = message;
  $('toast').classList.add('visible');
  toastTimeout = setTimeout(() => $('toast').classList.remove('visible'), 2800);
}
function primaryPath() { return state.rawPath ?? pathFromAnchors(state.anchors); }
function secondaryPath() {
  if (!core || (state.secondaryX === 0 && state.secondaryY === 0)) return SECONDARY_PATH;
  return core.transformPath(SECONDARY_PATH, [1, 0, 0, 1, state.secondaryX, state.secondaryY]);
}
function renderControls() {
  const layer = $('controlLayer');
  if (state.tab !== 'edit' || state.rawPath !== null) { layer.replaceChildren(); return; }
  const fragments = [];
  state.anchors.forEach((a, i) => {
    const selected = state.selected === i;
    if (state.showHandles) {
      for (const kind of ['in', 'out']) {
        const p = a[kind];
        fragments.push(`<line class="guide-line" x1="${a.x}" y1="${a.y}" x2="${p.x}" y2="${p.y}" opacity="${selected ? 1 : 0.3}"/>`);
        fragments.push(`<circle data-control="${kind}" data-index="${i}" class="tangent-handle" cx="${p.x}" cy="${p.y}" r="${selected ? 6.2 : 4.5}" opacity="${selected ? 1 : 0.55}"/>`);
      }
    }
    fragments.push(`<circle data-control="anchor" data-index="${i}" class="anchor-handle ${selected ? 'is-selected' : ''}" cx="${a.x}" cy="${a.y}" r="${selected ? 7.5 : 6.3}"/>`);
  });
  layer.innerHTML = fragments.join('');
}
function showShape(id, data, visible) {
  const element = $(id);
  element.setAttribute('d', data || '');
  element.style.display = visible && !!data ? '' : 'none';
}
function drawSamples(data) {
  const layer = $('sampleLayer');
  layer.replaceChildren();
  if (!core || state.tab !== 'inspect') return;
  try {
    let points = [];
    if (state.inspection === 'points') {
      const total = core.pathLength(data);
      points = core.pointsAtLengths(data, Array.from({ length: state.sampleCount }, (_, i) =>
        total * i / state.sampleCount));
    } else if (state.inspection === 'intersections') {
      points = core.intersectPaths(lastPrimary, lastSecondary);
    }
    for (const point of points) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
      const node = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      node.setAttribute('cx', String(point.x));
      node.setAttribute('cy', String(point.y));
      node.setAttribute('r', state.inspection === 'intersections' ? '6' : '3.5');
      node.setAttribute('class', state.inspection === 'intersections' ? 'intersection-mark' : 'sample-mark');
      layer.append(node);
    }
  } catch (error) { setRuntimeError(error); }
}
function setRuntimeError(error) {
  $('measurementStatus').textContent = 'ERROR';
  $('measurementStatus').style.color = 'var(--warning)';
  console.error('[PFx Vector Lab geometry]', error);
}
function updateMetrics(data) {
  if (!core) {
    $('pathLength').textContent = '—';
    $('pathBounds').textContent = '—';
    $('measurementStatus').textContent = 'OFFLINE';
    return;
  }
  try {
    const length = core.pathLength(data);
    const bounds = core.pathBounds(data);
    $('pathLength').textContent = `${format(length, 2)} px`;
    $('pathBounds').textContent = bounds
      ? `${format(bounds.maxX - bounds.minX, 0)} × ${format(bounds.maxY - bounds.minY, 0)}`
      : 'EMPTY';
    $('measurementStatus').textContent = 'LIVE';
    $('measurementStatus').style.color = '';
  } catch (error) { setRuntimeError(error); }
}
function render() {
  const data = primaryPath();
  lastPrimary = data;
  let secondary = SECONDARY_PATH;
  let result = '';
  try { secondary = secondaryPath(); } catch (error) { setRuntimeError(error); }
  lastSecondary = secondary;
  const combining = state.tab === 'combine';
  const analysis = state.tab === 'inspect';
  try {
    if (core && combining) {
      const operations = {
        union: () => core.unionPaths(data, secondary),
        intersection: () => core.intersectPathAreas(data, secondary),
        difference: () => core.subtractPaths(data, secondary),
        xor: () => core.xorPaths(data, secondary),
      };
      result = operations[state.operation]();
    } else if (core && analysis && state.inspection === 'offset') {
      result = core.offsetPath(data, state.offset, { join: 'round' });
    }
  } catch (error) { setRuntimeError(error); }
  lastResult = result;
  showShape('sourceShape', data, !combining || state.showSource);
  showShape('secondaryShape', secondary, (combining && state.showSource) || (analysis && state.inspection === 'intersections'));
  $('secondaryShape').setAttribute('transform', !core ? `translate(${state.secondaryX} ${state.secondaryY})` : '');
  showShape('resultShape', result, combining || (analysis && state.inspection === 'offset'));
  $('sourceShape').style.opacity = result ? '0.24' : '1';
  $('secondaryShape').style.opacity = result ? '0.42' : '.85';
  $('sourceShape').style.fillOpacity = combining ? '.1' : '.66';
  $('resultLegend').textContent = combining ? state.operation.toUpperCase() : analysis ? state.inspection.toUpperCase() : 'LIVE GEOMETRY';
  $('workspaceMode').textContent = { edit: 'NODE EDITOR', combine: 'BOOLEAN ENGINE', inspect: 'PATH ANALYSIS' }[state.tab];
  $('segmentCount').textContent = state.rawPath ? 'SVG' : String(state.anchors.length).padStart(2, '0');
  $('activeObject').textContent = state.rawPath ? 'IMPORTED SVG PATH' : `PATH A · ${state.anchors.length} NODES`;
  if (document.activeElement !== $('pathSource')) $('pathSource').value = data;
  const selected = state.anchors[state.selected];
  $('anchorIndexLabel').textContent = `NODE ${String(state.selected + 1).padStart(2, '0')}`;
  $('anchorX').value = selected.x.toFixed(1).replace(/\.0$/, '');
  $('anchorY').value = selected.y.toFixed(1).replace(/\.0$/, '');
  $('anchorX').disabled = state.rawPath !== null;
  $('anchorY').disabled = state.rawPath !== null;
  renderControls();
  drawSamples(data);
  updateMetrics(result || data);
}
function requestRender() {
  if (frameQueued) return;
  frameQueued = true;
  requestAnimationFrame(() => { frameQueued = false; render(); });
}
function syncControls() {
  $$('.preset-choice').forEach((button) => button.classList.toggle('active', button.dataset.preset === state.preset && state.rawPath === null));
  $$('.operation-choice').forEach((button) => button.classList.toggle('active', button.dataset.operation === state.operation));
  $$('.inspect-chip').forEach((button) => button.classList.toggle('active', button.dataset.inspection === state.inspection));
  $('secondaryX').value = state.secondaryX;
  $('secondaryY').value = state.secondaryY;
  $('secondaryXValue').textContent = `${state.secondaryX} px`;
  $('secondaryYValue').textContent = `${state.secondaryY} px`;
  $('sampleCount').value = state.sampleCount;
  $('sampleCountValue').textContent = String(state.sampleCount);
  $('offsetValue').value = state.offset;
  $('offsetValueLabel').textContent = `${state.offset} px`;
  $('handleToggle').checked = state.showHandles;
  $('sourceToggle').checked = state.showSource;
}
function setTab(tab) {
  state.tab = tab;
  $$('.tab').forEach((item) => {
    const current = item.dataset.tab === tab;
    item.classList.toggle('active', current);
    item.setAttribute('aria-selected', String(current));
  });
  $$('.tool-button[data-tool]').forEach((item) => item.classList.toggle('selected', item.dataset.tool === tab));
  $$('.tab-panel').forEach((item) => item.classList.toggle('hidden', item.id !== `panel-${tab}`));
  requestRender();
}
function svgPosition(event) {
  const matrix = stage.getScreenCTM();
  if (!matrix) return null;
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
  return { x: point.x, y: point.y };
}
function setView() {
  const v = state.view;
  stage.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
  const zoom = Math.round(baseView.w / v.w * 100);
  $('zoomLabel').textContent = `${zoom}%`;
  $('zoomReset').textContent = `${zoom}%`;
}
function zoomAt(factor, clientX, clientY) {
  const before = clientX == null ? { x: state.view.x + state.view.w / 2, y: state.view.y + state.view.h / 2 } : svgPosition({ clientX, clientY });
  if (!before) return;
  const scale = clamp(state.view.w * factor, 270, 2400) / state.view.w;
  state.view.x = before.x - (before.x - state.view.x) * scale;
  state.view.y = before.y - (before.y - state.view.y) * scale;
  state.view.w *= scale;
  state.view.h *= scale;
  setView();
}
function downloadSVG() {
  if (!core) return notify('The WebAssembly engine must be ready to export');
  try {
    const selected = state.tab === 'combine' || (state.tab === 'inspect' && state.inspection === 'offset')
      ? lastResult : lastPrimary;
    if (!selected || !core.validatePath(selected)) throw new Error('No valid geometry to export');
    const content = svgDocument([{ data: selected }]);
    const blob = new Blob([content], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'pfx-vector-lab.svg';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('SVG exported');
  } catch (error) { notify(`Export failed: ${error.message}`); }
}
function editSelectedAxis(axis, raw) {
  if (state.rawPath !== null) return;
  const value = Number(raw);
  if (!Number.isFinite(value)) return;
  const selected = state.anchors[state.selected];
  if (!selected || value === selected[axis]) return;
  const before = snapshot();
  translateAnchor(state.anchors, state.selected, axis === 'x' ? value - selected.x : 0,
    axis === 'y' ? value - selected.y : 0);
  saveSnapshot(before);
  requestRender();
}
function toggleGrid() {
  state.showGrid = !state.showGrid;
  $('gridSurface').style.display = state.showGrid ? '' : 'none';
  $('gridButton').classList.toggle('selected', state.showGrid);
  $('gridButton').classList.toggle('muted-selected', state.showGrid);
}
function loadPreset(name) {
  const before = snapshot();
  state.preset = name;
  state.anchors = clonePreset(name);
  state.rawPath = null;
  state.selected = 0;
  saveSnapshot(before);
  syncControls();
  requestRender();
}

$$('.tab, [data-tool]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab || b.dataset.tool)));
$$('.preset-choice').forEach((b) => b.addEventListener('click', () => loadPreset(b.dataset.preset)));
$$('.operation-choice').forEach((b) => b.addEventListener('click', () => { state.operation = b.dataset.operation; syncControls(); requestRender(); }));
$$('.inspect-chip').forEach((b) => b.addEventListener('click', () => { state.inspection = b.dataset.inspection; syncControls(); requestRender(); }));
$('anchorX').addEventListener('change', (e) => editSelectedAxis('x', e.target.value));
$('anchorY').addEventListener('change', (e) => editSelectedAxis('y', e.target.value));
$('handleToggle').addEventListener('change', (e) => { state.showHandles = e.target.checked; requestRender(); });
$('sourceToggle').addEventListener('change', (e) => { state.showSource = e.target.checked; requestRender(); });
for (const id of ['secondaryX', 'secondaryY']) {
  $(id).addEventListener('pointerdown', () => { $(id).dataset.before = snapshot(); });
  $(id).addEventListener('input', (e) => {
    state[id] = Number(e.target.value);
    syncControls(); requestRender();
  });
  $(id).addEventListener('change', (e) => { saveSnapshot(e.target.dataset.before ?? snapshot()); delete e.target.dataset.before; });
}
$('sampleCount').addEventListener('input', (e) => { state.sampleCount = Number(e.target.value); syncControls(); requestRender(); });
$('offsetValue').addEventListener('input', (e) => { state.offset = Number(e.target.value); syncControls(); requestRender(); });
$('resetButton').addEventListener('click', () => loadPreset(state.preset));
$('undo').addEventListener('click', undo);
$('redo').addEventListener('click', redo);
$('exportButton').addEventListener('click', downloadSVG);
$('gridButton').addEventListener('click', toggleGrid);
$('fitButton').addEventListener('click', () => { state.view = { ...baseView }; setView(); });
$('zoomReset').addEventListener('click', () => { state.view = { ...baseView }; setView(); });
$('zoomIn').addEventListener('click', () => zoomAt(.8));
$('zoomOut').addEventListener('click', () => zoomAt(1.25));
$('helpButton').addEventListener('click', () => $('helpDialog').showModal());
$('closeHelp').addEventListener('click', () => $('helpDialog').close());
$('themeButton').addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('pfx-vector-lab-theme', theme); } catch { /* storage optional */ }
});
try { const theme = localStorage.getItem('pfx-vector-lab-theme'); if (theme === 'light') document.documentElement.dataset.theme = 'light'; } catch { /* optional */ }

stage.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  const target = event.target.closest?.('[data-control]');
  if (event.altKey) {
    drag = { kind: 'pan', x: event.clientX, y: event.clientY };
    stage.style.cursor = 'grabbing';
  } else if (state.tab === 'edit' && state.rawPath === null && target) {
    const position = svgPosition(event);
    if (!position) return;
    const index = Number(target.dataset.index);
    state.selected = index;
    drag = { kind: target.dataset.control, index, position, before: snapshot() };
    requestRender();
  }
  if (drag) { stage.setPointerCapture(event.pointerId); event.preventDefault(); }
});
stage.addEventListener('pointermove', (event) => {
  const position = svgPosition(event);
  if (position) $('pointerCoordinates').textContent = `X ${Math.round(position.x)}   Y ${Math.round(position.y)}`;
  if (!drag) return;
  if (drag.kind === 'pan') {
    const scale = state.view.w / Math.max(1, stage.getBoundingClientRect().width);
    state.view.x -= (event.clientX - drag.x) * scale;
    state.view.y -= (event.clientY - drag.y) * scale;
    drag.x = event.clientX; drag.y = event.clientY;
    setView();
    return;
  }
  if (!position) return;
  const anchor = state.anchors[drag.index];
  if (!anchor) return;
  const dx = position.x - drag.position.x;
  const dy = position.y - drag.position.y;
  if (drag.kind === 'anchor') translateAnchor(state.anchors, drag.index, dx, dy);
  else { anchor[drag.kind].x += dx; anchor[drag.kind].y += dy; }
  drag.position = position;
  requestRender();
});
function endPointer() {
  if (drag?.before) saveSnapshot(drag.before);
  drag = null;
  stage.style.cursor = '';
}
stage.addEventListener('pointerup', endPointer);
stage.addEventListener('pointercancel', endPointer);
stage.addEventListener('lostpointercapture', endPointer);
stage.addEventListener('wheel', (event) => {
  event.preventDefault();
  zoomAt(event.deltaY < 0 ? 0.9 : 1.1, event.clientX, event.clientY);
}, { passive: false });

document.addEventListener('keydown', (event) => {
  if (event.target.closest?.('input,textarea') || $('helpDialog').open) return;
  const ctrl = event.ctrlKey || event.metaKey;
  if (ctrl && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    if (event.shiftKey) redo(); else undo();
  } else if (ctrl && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); }
  else if (!ctrl && /^[123]$/.test(event.key)) setTab(['edit', 'combine', 'inspect'][Number(event.key) - 1]);
  else if (event.key.toLowerCase() === 'g') toggleGrid();
  else if (event.key === '0') { state.view = { ...baseView }; setView(); }
});

$('applySource').addEventListener('click', () => {
  if (!core) return notify('WebAssembly is not available');
  const data = $('pathSource').value.trim();
  if (!data || data.length > 1_000_000 || !core.validatePath(data)) return notify('Enter a valid SVG path (max 1 MB)');
  const before = snapshot();
  state.rawPath = data;
  saveSnapshot(before);
  requestRender();
  notify('SVG path loaded. Choose a preset to edit anchor handles again.');
});
$('copySource').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(primaryPath()); notify('Path data copied'); }
  catch { notify('Clipboard unavailable. Select and copy the path manually.'); }
});
$('importButton').addEventListener('click', () => $('fileInput').click());
$('fileInput').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.size > 1_000_000) { notify('File limit: 1 MB'); event.target.value = ''; return; }
  try {
    const text = await file.text();
    let data = text.trim();
    if (data.includes('<svg')) {
      const document = new DOMParser().parseFromString(data, 'image/svg+xml');
      if (document.querySelector('parsererror')) throw new Error('Invalid SVG document');
      data = document.querySelector('path[d]')?.getAttribute('d')?.trim() ?? '';
    }
    if (!core?.validatePath(data)) throw new Error('No valid SVG path found');
    const before = snapshot();
    state.rawPath = data;
    saveSnapshot(before);
    setTab('inspect');
    syncControls();
    requestRender();
    notify('SVG path imported');
  } catch (error) { notify(`Import failed: ${error.message}`); }
  finally { event.target.value = ''; }
});

syncControls();
setView();
render();
(async () => {
  try {
    const [{ default: init, ...wasm }, { createVectorCore }] = await Promise.all([
      import('../engine/pfx_vector_wasm.js'),
      import('../engine/vector-core-web.js'),
    ]);
    await init();
    core = createVectorCore(wasm);
    if (wasm.core_version() !== '1.0.0') throw new Error(`Unexpected core: ${wasm.core_version()}`);
    if (Math.abs(core.pathLength('M0 0 L3 4') - 5) > 1e-9) throw new Error('Engine self-check failed');
    $('engineDot').classList.add('ready');
    $$('.status-mark').forEach((item) => item.classList.add('ready'));
    $('engineStatus').textContent = 'RUST ENGINE ONLINE';
    $('footerState').textContent = 'WASM INITIALIZED';
    requestRender();
  } catch (error) {
    core = null;
    engineError = error;
    $('engineDot').classList.add('failed');
    $('engineStatus').textContent = 'ENGINE UNAVAILABLE';
    $('footerState').textContent = 'WASM FAILED TO LOAD';
    console.error('PFx Vector Core could not initialize', engineError);
    notify('Engine unavailable: build the pinned Rust/WASM package first');
  }
})();
