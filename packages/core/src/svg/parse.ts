/**
 * SVG document parser: source text → Design (IR).
 *
 * Scope is the v0.1.0 contract (#9): viewBox/units, nested transforms,
 * primitives, layers by stroke color. `use`/`defs`, text, images and CSS
 * beyond inline `style=""` are reported as warnings, not silently dropped —
 * FEATURE_CATALOG §B tracks them.
 *
 * Coordinate policy: output is in **millimeters**, still SVG-oriented
 * (Y grows downward, origin at the SVG top-left). The single Y-flip to
 * machine orientation happens in the geometry stage (#10) — this file is the
 * only place px→mm happens, that one is the only place the flip happens.
 */
import { parseXml, XmlElement, type XmlNode } from '@rgrove/parse-xml';
import svgpath from 'svgpath';
import type { Design, Layer, PathSegment, Shape, SubPath } from '../ir/index.js';
import { DEFAULT_LAYER_SETTINGS, IDENTITY } from '../ir/index.js';
import { normalizePaint } from './colors.js';
import { CONTAINER, DRAWABLE, UNSUPPORTED, elementToPathD } from './primitives.js';
import { MM_PER_PX, lengthToMm } from './units.js';

export interface ParseResult {
  readonly design: Design;
  /** Human-readable notes about what the file contained that we skipped or
   * guessed. The UI surfaces these — silent data loss is how importers lose
   * user trust. */
  readonly warnings: readonly string[];
}

interface Paint {
  stroke: string | 'none' | null;
  fill: string | 'none' | null;
}

interface WalkContext {
  /** Transform strings from the document root down to (and including) the
   * current element, in SVG attribute order (outermost first). */
  transforms: string[];
  paint: Paint;
}

export function parseSvg(source: string): ParseResult {
  const warnings = new Set<string>();
  const doc = parseXml(source); // throws with line/column on malformed XML
  const root = doc.root;
  if (!(root instanceof XmlElement) || root.name !== 'svg') {
    throw new Error('Not an SVG document: root element is not <svg>.');
  }

  const { widthMm, heightMm, rootTransform } = resolveViewport(root, warnings);

  const shapesByColor = new Map<string, Shape[]>();
  const colorOrder: string[] = [];
  let shapeCounter = 0;

  const addShape = (color: string, shape: Shape): void => {
    let bucket = shapesByColor.get(color);
    if (!bucket) {
      bucket = [];
      shapesByColor.set(color, bucket);
      colorOrder.push(color);
    }
    bucket.push(shape);
  };

  const walk = (el: XmlElement, ctx: WalkContext): void => {
    const style = parseInlineStyle(el.attributes['style']);
    const paint: Paint = {
      stroke: resolvePaint(style['stroke'] ?? el.attributes['stroke'], ctx.paint.stroke, warnings),
      fill: resolvePaint(style['fill'] ?? el.attributes['fill'], ctx.paint.fill, warnings),
    };
    const ownTransform = el.attributes['transform'];
    const transforms = ownTransform ? [...ctx.transforms, ownTransform] : ctx.transforms;

    if (DRAWABLE.has(el.name)) {
      const d = elementToPathD(el.name, el.attributes);
      if (d === null) return; // zero-sized: draws nothing per spec
      const subPaths = pathToSubPaths(d, transforms.join(' '), warnings, el.name);
      if (subPaths.length === 0) return;
      shapeCounter += 1;
      const layerColor =
        paint.stroke && paint.stroke !== 'none'
          ? paint.stroke
          : paint.fill && paint.fill !== 'none'
            ? paint.fill
            : '#000000';
      addShape(layerColor, {
        id: el.attributes['id'] ?? `shape-${shapeCounter}`,
        subPaths,
        transform: IDENTITY, // fully applied here; flatten treats it as a no-op
      });
      return;
    }

    if (CONTAINER.has(el.name)) {
      for (const child of el.children as readonly XmlNode[]) {
        if (child instanceof XmlElement) walk(child, { transforms, paint });
      }
      return;
    }

    if (UNSUPPORTED.has(el.name)) {
      warnings.add(`<${el.name}> is not supported yet and was skipped.`);
      return;
    }
    // Metadata/unknown elements (title, desc, sodipodi:*, …): ignore quietly.
  };

  for (const child of root.children as readonly XmlNode[]) {
    if (child instanceof XmlElement) {
      walk(child, {
        transforms: rootTransform ? [rootTransform] : [],
        paint: { stroke: null, fill: null },
      });
    }
  }

  const layers: Layer[] = colorOrder.map((color, i) => ({
    id: `layer-${i + 1}`,
    color,
    name: color,
    settings: { ...DEFAULT_LAYER_SETTINGS, priority: i },
    shapes: shapesByColor.get(color) as Shape[],
  }));

  return {
    design: { widthMm, heightMm, layers },
    warnings: [...warnings],
  };
}

/** Resolve the canvas size in mm and the root transform that maps user units
 * to mm (and folds in the viewBox min-x/min-y offset). */
function resolveViewport(
  root: XmlElement,
  warnings: Set<string>,
): { widthMm: number; heightMm: number; rootTransform: string } {
  const vbRaw = root.attributes['viewBox'];
  const vb = vbRaw
    ?.trim()
    .split(/[\s,]+/)
    .map(parseFloat);
  const viewBox =
    vb &&
    vb.length === 4 &&
    vb.every(Number.isFinite) &&
    (vb[2] as number) > 0 &&
    (vb[3] as number) > 0
      ? {
          minX: vb[0] as number,
          minY: vb[1] as number,
          width: vb[2] as number,
          height: vb[3] as number,
        }
      : null;
  if (vbRaw && !viewBox) warnings.add(`Ignored malformed viewBox "${vbRaw}".`);

  const attrW = lengthToMm(root.attributes['width']);
  const attrH = lengthToMm(root.attributes['height']);

  if (viewBox) {
    // Physical size wins when declared; otherwise user units are CSS px.
    const widthMm = attrW ?? viewBox.width * MM_PER_PX;
    const heightMm = attrH ?? viewBox.height * MM_PER_PX;
    const sx = widthMm / viewBox.width;
    const sy = heightMm / viewBox.height;
    return {
      widthMm,
      heightMm,
      rootTransform: `scale(${sx} ${sy}) translate(${-viewBox.minX} ${-viewBox.minY})`,
    };
  }

  if (attrW !== null && attrH !== null) {
    return { widthMm: attrW, heightMm: attrH, rootTransform: `scale(${MM_PER_PX})` };
  }

  warnings.add(
    'The SVG declares no usable size (no viewBox, no width/height); assuming 100×100 mm.',
  );
  return { widthMm: 100, heightMm: 100, rootTransform: `scale(${MM_PER_PX})` };
}

/** `style="stroke: red; fill:none"` → { stroke: 'red', fill: 'none' }. */
function parseInlineStyle(style: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!style) return out;
  for (const decl of style.split(';')) {
    const i = decl.indexOf(':');
    if (i === -1) continue;
    out[decl.slice(0, i).trim().toLowerCase()] = decl.slice(i + 1).trim();
  }
  return out;
}

function resolvePaint(
  raw: string | undefined,
  inherited: string | 'none' | null,
  warnings: Set<string>,
): string | 'none' | null {
  if (raw === undefined || raw.trim().toLowerCase() === 'inherit') return inherited;
  const normalized = normalizePaint(raw);
  if (normalized === null) {
    warnings.add(`Could not resolve paint "${raw.trim()}"; treating as unset.`);
    return inherited;
  }
  return normalized;
}

/** Normalized path data + accumulated transform → SubPaths (mm, Y-down).
 * `unarc()` runs BEFORE `transform()`: an arc under non-uniform scale or skew
 * is not an arc, but its cubic approximation transforms exactly. */
function pathToSubPaths(
  d: string,
  transformString: string,
  warnings: Set<string>,
  elementName: string,
): SubPath[] {
  let sp = svgpath(d);
  // `err` is real but missing from svgpath's shipped index.d.ts — hence the
  // cast (an ambient re-declaration of the module conflicts with those types).
  const parseError = (sp as unknown as { err?: string }).err;
  if (parseError) {
    warnings.add(`Skipped a <${elementName}> with unparsable path data (${parseError}).`);
    return [];
  }
  sp = sp.abs().unshort().unarc();
  if (transformString.trim() !== '') sp = sp.transform(transformString);
  sp = sp.abs(); // transform() can relativize; segment extraction assumes abs

  const subPaths: SubPath[] = [];
  let start: { x: number; y: number } | null = null;
  let segments: PathSegment[] = [];

  const flush = (closed: boolean): void => {
    if (start && segments.length > 0) subPaths.push({ start, segments, closed });
    segments = [];
  };

  sp.iterate((seg, _index, x, y) => {
    const op = seg[0] as string;
    const n = seg as unknown as number[];
    switch (op) {
      case 'M':
        flush(false);
        start = { x: n[1] as number, y: n[2] as number };
        break;
      case 'L':
        segments.push({ kind: 'line', to: { x: n[1] as number, y: n[2] as number } });
        break;
      case 'H':
        segments.push({ kind: 'line', to: { x: n[1] as number, y } });
        break;
      case 'V':
        segments.push({ kind: 'line', to: { x, y: n[1] as number } });
        break;
      case 'C':
        segments.push({
          kind: 'cubic',
          c1: { x: n[1] as number, y: n[2] as number },
          c2: { x: n[3] as number, y: n[4] as number },
          to: { x: n[5] as number, y: n[6] as number },
        });
        break;
      case 'Q':
        segments.push({
          kind: 'quadratic',
          c: { x: n[1] as number, y: n[2] as number },
          to: { x: n[3] as number, y: n[4] as number },
        });
        break;
      case 'Z':
        flush(true);
        // After Z the current point is the subpath start; segments that follow
        // without an M begin a new subpath from there (SVG spec behavior).
        break;
      default:
        // 'A'/'S'/'T' cannot appear after unarc/unshort; anything else is a
        // svgpath internal we don't know — losing geometry silently is worse
        // than a warning.
        warnings.add(`Unhandled path segment "${op}" in <${elementName}>.`);
    }
  });
  flush(false);
  return subPaths;
}
