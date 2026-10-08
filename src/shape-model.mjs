/** Editable Bezier control data only. All geometry calculations belong to PFx Vector Core. */
const point = (x, y) => ({ x, y });
const anchor = (x, y, ix, iy, ox, oy) => ({ x, y, in: point(ix, iy), out: point(ox, oy) });

export const PRESETS = Object.freeze({
  contour: {
    name: 'Contour',
    anchors: [
      anchor(218, 240, 188, 175, 264, 133),
      anchor(445, 164, 358, 132, 529, 202),
      anchor(544, 353, 600, 274, 490, 438),
      anchor(287, 411, 384, 461, 196, 354),
    ],
  },
  bloom: {
    name: 'Bloom',
    anchors: [
      anchor(340, 100, 284, 100, 398, 100),
      anchor(546, 268, 557, 191, 558, 349),
      anchor(340, 450, 410, 450, 273, 450),
      anchor(143, 265, 130, 348, 133, 191),
    ],
  },
  ribbon: {
    name: 'Ribbon',
    anchors: [
      anchor(155, 207, 185, 138, 263, 98),
      anchor(474, 251, 360, 147, 592, 335),
      anchor(390, 435, 496, 462, 280, 435),
      anchor(184, 333, 129, 380, 175, 281),
    ],
  },
});

export function clonePreset(name = 'contour') {
  const preset = PRESETS[name];
  if (!preset) throw new RangeError(`Unknown preset: ${name}`);
  return preset.anchors.map((a) => structuredClone(a));
}

function num(value) {
  if (!Number.isFinite(value)) throw new TypeError('Control coordinates must be finite numbers');
  return String(Number(value.toFixed(3)));
}
function coords(p) { return `${num(p.x)} ${num(p.y)}`; }

/** SVG serialization of editor-owned anchors; no geometry computation here. */
export function pathFromAnchors(anchors) {
  if (!Array.isArray(anchors) || anchors.length < 2) throw new RangeError('Two or more anchors required');
  const parts = [`M${coords(anchors[0])}`];
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    const b = anchors[(i + 1) % anchors.length];
    parts.push(`C${coords(a.out)} ${coords(b.in)} ${coords(b)}`);
  }
  parts.push('Z');
  return parts.join(' ');
}

/** Local secondary input shape, passed to Rust for all computations. */
export const SECONDARY_PATH = 'M355 142 C460 98 640 163 644 292 C650 394 531 447 399 410 C291 380 263 211 355 142 Z';

export function translateAnchor(anchors, index, dx, dy) {
  const selected = anchors[index];
  if (!selected) throw new RangeError('No anchor at index');
  for (const p of [selected, selected.in, selected.out]) {
    p.x += dx;
    p.y += dy;
  }
}

export function svgDocument(paths, options = {}) {
  const entries = paths.filter((item) => item?.data).map(({ data, fill = '#d7ff69', opacity = 1 }) => {
    if (!/^[\x20-\x7e]+$/.test(data) || /["<>]/.test(data)) throw new TypeError('Unsafe path data');
    return `<path d="${data}" fill="${fill}" fill-opacity="${opacity}"/>`;
  });
  const label = options.label || 'PFx Vector Lab';
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="840" height="560" viewBox="0 0 840 560" role="img" aria-label="${label}">\n  ${entries.join('\n  ')}\n</svg>\n`;
}
