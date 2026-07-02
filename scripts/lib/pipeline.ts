/**
 * P0-03 asset pipeline: RGB sprite strips -> color-keyed RGBA frames ->
 * one packed texture atlas PNG + Phaser 3 atlas JSON + animations manifest.
 */
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

import { detectGrid } from './grid';
import {
  applyColorKey,
  sampleBackgroundColor,
  DEFAULT_FEATHER,
  DEFAULT_TOLERANCE,
} from './colorkey';
import { buildPhaserAtlasJson, packFrames, type FrameInput } from './atlas';
import { buildAnimationsManifest, DEFAULT_FRAME_RATE } from './animations';

/** Source sheets: letter prefix in Assets/ -> animation key. Portraits
 *  (Character_1/Character_2_Action) are intentionally not listed. */
export const SHEET_MAP: ReadonlyArray<{ prefix: string; key: string }> = [
  { prefix: 'A', key: 'idle' },
  { prefix: 'B', key: 'walk' },
  { prefix: 'C', key: 'carry' },
  { prefix: 'D', key: 'poke' },
  { prefix: 'E', key: 'eat' },
  { prefix: 'F', key: 'float' },
  { prefix: 'G', key: 'build' },
];

export interface SheetOptions {
  /** Output frame height (and width, frames are square) in px. */
  frameHeight?: number;
  tolerance?: number;
  feather?: number;
}

export interface ProcessedFrame {
  name: string;
  /** Raw interleaved RGBA pixels, width*height*4 bytes. */
  data: Uint8Array;
  width: number;
  height: number;
}

export const DEFAULT_FRAME_HEIGHT = 128;

/**
 * Load one sprite strip, remove its background via color-key, slice it into
 * square frames (grid auto-detected from dimensions) and resize each frame.
 */
export async function processSheet(
  filePath: string,
  key: string,
  opts: SheetOptions = {},
): Promise<ProcessedFrame[]> {
  const frameHeight = opts.frameHeight ?? DEFAULT_FRAME_HEIGHT;

  const { data, info } = await sharp(filePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const grid = detectGrid(info.width, info.height);

  const img = { data: new Uint8Array(data), width: info.width, height: info.height };
  const bg = sampleBackgroundColor(img);
  const keyed = applyColorKey(img, bg, {
    tolerance: opts.tolerance ?? DEFAULT_TOLERANCE,
    feather: opts.feather ?? DEFAULT_FEATHER,
  });
  const keyedBuf = Buffer.from(keyed.data.buffer, keyed.data.byteOffset, keyed.data.byteLength);

  const frames: ProcessedFrame[] = [];
  for (let i = 0; i < grid.frameCount; i++) {
    const frame = await sharp(keyedBuf, {
      raw: { width: info.width, height: info.height, channels: 4 },
    })
      .extract({ left: i * grid.frameSize, top: 0, width: grid.frameSize, height: grid.frameSize })
      .resize(frameHeight, frameHeight, { kernel: 'lanczos3' })
      .raw()
      .toBuffer();
    frames.push({
      name: `${key}_${i}`,
      data: new Uint8Array(frame),
      width: frameHeight,
      height: frameHeight,
    });
  }
  return frames;
}

export interface PipelineOptions {
  /** Directory containing the source sheets (A. ... G. PNGs). */
  assetsDir: string;
  /** Directory to write otter.png / otter.json / animations.json into. */
  outDir: string;
  frameHeight?: number;
  tolerance?: number;
  feather?: number;
  frameRate?: number;
  /** Basename for the atlas files (default "otter"). */
  atlasName?: string;
  maxAtlasWidth?: number;
  padding?: number;
}

export interface PipelineResult {
  atlasPng: string;
  atlasJson: string;
  animationsJson: string;
  frameTotal: number;
  atlasSize: { width: number; height: number };
  /** Bytes of each output file. */
  bytes: Record<string, number>;
}

/** Locate each A..G sheet in assetsDir by its letter prefix ("A.", "B.", ...). */
export function findSheetFiles(assetsDir: string): { key: string; file: string }[] {
  const entries = readdirSync(assetsDir);
  const found: { key: string; file: string }[] = [];
  const missing: string[] = [];
  for (const { prefix, key } of SHEET_MAP) {
    const match = entries.find((e) => e.startsWith(`${prefix}.`) && e.toLowerCase().endsWith('.png'));
    if (match) found.push({ key, file: path.join(assetsDir, match) });
    else missing.push(`${prefix}. (${key})`);
  }
  if (missing.length > 0) {
    throw new Error(`Missing source sheets in ${assetsDir}: ${missing.join(', ')}`);
  }
  return found;
}

export async function runPipeline(opts: PipelineOptions): Promise<PipelineResult> {
  const atlasName = opts.atlasName ?? 'otter';
  const frameHeight = opts.frameHeight ?? DEFAULT_FRAME_HEIGHT;
  const sheets = findSheetFiles(opts.assetsDir);

  // 1. process every sheet into resized RGBA frames
  const allFrames: ProcessedFrame[] = [];
  const frameCounts: Record<string, number> = {};
  for (const { key, file } of sheets) {
    const frames = await processSheet(file, key, {
      frameHeight,
      tolerance: opts.tolerance,
      feather: opts.feather,
    });
    frameCounts[key] = frames.length;
    allFrames.push(...frames);
  }

  // 2. pack into a single atlas
  const inputs: FrameInput[] = allFrames.map(({ name, width, height }) => ({ name, width, height }));
  const layout = packFrames(inputs, {
    maxWidth: opts.maxAtlasWidth ?? 1024,
    padding: opts.padding ?? 2,
  });

  // 3. composite frames onto a transparent canvas
  const byName = new Map(allFrames.map((f) => [f.name, f]));
  const composites = layout.placements.map((p) => {
    const f = byName.get(p.name)!;
    return {
      input: Buffer.from(f.data.buffer, f.data.byteOffset, f.data.byteLength),
      raw: { width: f.width, height: f.height, channels: 4 as const },
      left: p.x,
      top: p.y,
    };
  });

  mkdirSync(opts.outDir, { recursive: true });
  const atlasPng = path.join(opts.outDir, `${atlasName}.png`);
  const atlasJson = path.join(opts.outDir, `${atlasName}.json`);
  const animationsJson = path.join(opts.outDir, 'animations.json');

  await sharp({
    create: {
      width: layout.width,
      height: layout.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(atlasPng);

  // 4. metadata
  writeFileSync(atlasJson, JSON.stringify(buildPhaserAtlasJson(layout, `${atlasName}.png`), null, 2));
  writeFileSync(
    animationsJson,
    JSON.stringify(buildAnimationsManifest(frameCounts, opts.frameRate ?? DEFAULT_FRAME_RATE), null, 2),
  );

  const bytes: Record<string, number> = {};
  for (const f of [atlasPng, atlasJson, animationsJson]) {
    bytes[path.basename(f)] = statSync(f).size;
  }

  return {
    atlasPng,
    atlasJson,
    animationsJson,
    frameTotal: allFrames.length,
    atlasSize: { width: layout.width, height: layout.height },
    bytes,
  };
}
