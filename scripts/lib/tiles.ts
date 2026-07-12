/**
 * P2-09 scene tiles (T1..T5): full-bleed environment art.
 *
 * Unlike characters/props, tiles are NOT color-keyed — they are opaque
 * paintings. The AI sheets carry near-white gutter margins between cells,
 * which are trimmed (content-aware, per cell edge) before resizing.
 *
 * Output: one horizontal strip PNG per sheet (public/assets/tiles/<key>.png)
 * plus a tiles.json manifest { key: { frames, size } }. Strips avoid
 * atlas-padding seams when the tiles are drawn edge-to-edge in the scene.
 */
import sharp from 'sharp';

import { detectGrid } from './grid';

export interface RawImage {
  /** Interleaved RGBA pixels, width*height*4 bytes. */
  data: Uint8Array;
  width: number;
  height: number;
}

export interface TileSheet {
  /** Filename prefix in Assets/ (matched as `${needle}.`). */
  needle: string;
  /** Texture key, also the output basename (e.g. "tile_grass"). */
  key: string;
}

/** Scene tile sheets (P2-09 batch 3). */
export const TILE_MAP: ReadonlyArray<TileSheet> = [
  { needle: 'T1', key: 'tile_grass' }, // 4 variants: plain / flowers / pebbles / bare patch
  { needle: 'T2', key: 'tile_water' }, // 4-frame flow loop
  { needle: 'T3', key: 'tile_bank' }, // h-bank / v-bank / outer corner / inner corner
  { needle: 'T4', key: 'tile_riverbed' }, // pebbly ford / ford with foundation stones
  { needle: 'T5', key: 'tile_forest' }, // plain / entrance gap / big trunk
];

/** Output tile side length in px (display draws at 96..224). */
export const DEFAULT_TILE_SIZE = 192;

const WHITE_MIN = 235;
/** A row/col is a gutter when at least this fraction of its pixels is near-white. */
const GUTTER_FRACTION = 0.98;
/** Never trim more than a quarter of a cell from one side. */
const MAX_TRIM_FRACTION = 0.25;

function isNearWhite(d: Uint8Array, idx: number): boolean {
  return d[idx]! >= WHITE_MIN && d[idx + 1]! >= WHITE_MIN && d[idx + 2]! >= WHITE_MIN;
}

export interface Margins {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Measure near-white gutter margins on each edge of a full-bleed cell.
 * Pure; operates on raw RGBA. Content that happens to be light (foam,
 * highlights) survives because a gutter row/col must be almost fully white.
 */
export function whiteMargins(img: RawImage): Margins {
  const { data, width, height } = img;
  const colIsGutter = (x: number): boolean => {
    let n = 0;
    for (let y = 0; y < height; y++) if (isNearWhite(data, (y * width + x) * 4)) n++;
    return n / height >= GUTTER_FRACTION;
  };
  const rowIsGutter = (y: number): boolean => {
    let n = 0;
    for (let x = 0; x < width; x++) if (isNearWhite(data, (y * width + x) * 4)) n++;
    return n / width >= GUTTER_FRACTION;
  };
  const maxX = Math.floor(width * MAX_TRIM_FRACTION);
  const maxY = Math.floor(height * MAX_TRIM_FRACTION);
  let left = 0;
  while (left < maxX && colIsGutter(left)) left++;
  let right = 0;
  while (right < maxX && colIsGutter(width - 1 - right)) right++;
  let top = 0;
  while (top < maxY && rowIsGutter(top)) top++;
  let bottom = 0;
  while (bottom < maxY && rowIsGutter(height - 1 - bottom)) bottom++;
  return { left, right, top, bottom };
}

export interface ProcessedTile {
  /** Raw interleaved RGBA pixels, size*size*4 bytes. */
  data: Uint8Array;
  size: number;
}

/**
 * Slice a full-bleed tile strip into square cells (grid auto-detected),
 * trim near-white gutters per cell, and resize each to `tileSize`.
 */
export async function processTileSheet(
  filePath: string,
  tileSize: number = DEFAULT_TILE_SIZE,
): Promise<ProcessedTile[]> {
  const { data, info } = await sharp(filePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const grid = detectGrid(info.width, info.height);
  const buf = Buffer.from(data);

  const tiles: ProcessedTile[] = [];
  for (let i = 0; i < grid.frameCount; i++) {
    const cellPng = await sharp(buf, {
      raw: { width: info.width, height: info.height, channels: 4 },
    })
      .extract({ left: i * grid.frameSize, top: 0, width: grid.frameSize, height: grid.frameSize })
      .png()
      .toBuffer();
    const { data: cellRaw, info: ci } = await sharp(cellPng)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const m = whiteMargins({ data: new Uint8Array(cellRaw), width: ci.width, height: ci.height });
    // Inset a further ~2% per edge: AI cells carry a faint edge vignette that
    // otherwise shows up as grid seams when tiles are drawn side by side.
    const inset = Math.round(Math.min(ci.width, ci.height) * 0.02);
    const inner = {
      left: m.left + inset,
      top: m.top + inset,
      width: Math.max(1, ci.width - m.left - m.right - inset * 2),
      height: Math.max(1, ci.height - m.top - m.bottom - inset * 2),
    };
    const out = await sharp(cellPng)
      .extract(inner)
      .resize(tileSize, tileSize, { kernel: 'lanczos3', fit: 'fill' })
      .raw()
      .toBuffer();
    tiles.push({ data: new Uint8Array(out), size: tileSize });
  }
  return tiles;
}
