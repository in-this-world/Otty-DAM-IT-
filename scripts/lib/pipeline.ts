/**
 * Asset pipeline: RGB sprite strips -> background-removed RGBA frames ->
 * one packed texture atlas PNG + Phaser 3 atlas JSON + animations manifest.
 *
 * Wave 1 (P0-03): OTTY character actions A..G -> looping/one-shot animations.
 * Wave 2 (P2-08): extra OTTY actions + NPCs (dizzy..cone_hat) as animations,
 *   plus static prop/object sheets (obj_*) that live in the same atlas but are
 *   NOT animations (the game references their frames directly). Their frame
 *   list is emitted to objects.json.
 *
 * Background removal:
 *   - Wave 1 characters use the global color-key (unchanged, keeps the shipped
 *     otter frames byte-for-byte equivalent).
 *   - Wave 2 sheets use border-connected flood removal so background gray/white
 *     interiors (stones, fish belly, bubbles, eagle head, dam, splashes) are
 *     preserved instead of being punched out.
 */
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

import { detectGrid } from './grid';
import {
  applyColorKey,
  floodKeyBackground,
  sampleBackgroundColor,
  DEFAULT_FEATHER,
  DEFAULT_TOLERANCE,
  type RGB,
  type RawRGBA,
} from './colorkey';
import { buildPhaserAtlasJson, packFrames, type FrameInput } from './atlas';
import { chooseCutPoints, occupiedColumns } from './slice';
import { buildAnimationsManifest, DEFAULT_FRAME_RATE } from './animations';

/** Background-removal strategy per source sheet. */
export type KeyMode = 'global' | 'flood';

export interface AnimSheet {
  /** Filename prefix in Assets/ (matched as `${prefix}.`). */
  prefix: string;
  /** Animation key (also the atlas frame-name prefix). */
  key: string;
  /** Background removal mode. */
  mode: KeyMode;
}

/**
 * Character/NPC sheets that become animation clips (animations.json).
 * Wave 1 (A..G) keep the global color-key; wave 2 (H..R) use flood removal.
 * Portraits (Character_1/Character_2_Action) are intentionally not listed.
 * Loop-vs-one-shot is decided by LOOPING_KEYS in animations.ts.
 */
export const SHEET_MAP: ReadonlyArray<AnimSheet> = [
  // --- wave 1: OTTY core actions ---
  { prefix: 'A', key: 'idle', mode: 'global' },
  { prefix: 'B', key: 'walk', mode: 'global' },
  { prefix: 'C', key: 'carry', mode: 'global' },
  { prefix: 'D', key: 'poke', mode: 'global' },
  { prefix: 'E', key: 'eat', mode: 'global' },
  { prefix: 'F', key: 'float', mode: 'global' },
  { prefix: 'G', key: 'build', mode: 'global' },
  // --- wave 2: extra OTTY actions ---
  { prefix: 'H', key: 'dizzy', mode: 'flood' },
  { prefix: 'I', key: 'throw', mode: 'flood' },
  { prefix: 'J', key: 'dig', mode: 'flood' },
  { prefix: 'K', key: 'pick_stone', mode: 'flood' },
  { prefix: 'L', key: 'wash', mode: 'flood' },
  { prefix: 'M', key: 'win', mode: 'global' }, // source has a light card panel; global key dissolves it
  { prefix: 'N', key: 'lose', mode: 'flood' },
  // --- wave 2: NPCs (same art style, not OTTY) ---
  { prefix: 'P', key: 'eagle', mode: 'flood' },
  { prefix: 'Q', key: 'bear', mode: 'flood' },
  // --- wave 2: equipped-state loop ---
  { prefix: 'R', key: 'cone_hat', mode: 'flood' },
];

export interface ObjectSheet {
  /** Object key (also the atlas frame-name prefix), e.g. "obj_fish". */
  key: string;
  /**
   * Ordered list of unique filename substrings; each selects one source strip.
   * Multiple entries are concatenated into one continuous frame sequence
   * (used for the dam, split across Dam-1 + Dam-2).
   */
  sources: string[];
}

/**
 * Prop / object sheets (P2-08). Flood-keyed, packed into the atlas as static
 * frames named `obj_<name>_<i>`; NOT registered as animations.
 */
export const OBJECT_MAP: ReadonlyArray<ObjectSheet> = [
  { key: 'obj_cone', sources: ['1. '] }, // traffic cone (single)
  { key: 'obj_wood', sources: ['2. '] }, // branch / log / plank / stack
  { key: 'obj_fish', sources: ['3. '] }, // normal / curved / rare / skeleton
  { key: 'obj_falling', sources: ['4. '] }, // pine cone / leaf / stone / apple
  { key: 'obj_stone', sources: ['5. '] }, // pebble -> boulder
  { key: 'obj_dirt', sources: ['6. '] }, // dirt mound (single)
  { key: 'obj_splash', sources: ['7. '] }, // bubbles / splash / crown / droplets
  { key: 'obj_dam', sources: ['Dam-1', 'Dam-2'] }, // build stages 1..8 (merged)
  { key: 'obj_star', sources: ['9'] }, // star / cluster / burst / sparkle
];

export interface SheetOptions {
  /** Output frame height (and width, frames are square) in px. */
  frameHeight?: number;
  tolerance?: number;
  feather?: number;
  /** Background removal mode (default 'global'). */
  mode?: KeyMode;
}

export interface ProcessedFrame {
  name: string;
  /** Raw interleaved RGBA pixels, width*height*4 bytes. */
  data: Uint8Array;
  width: number;
  height: number;
}

export const DEFAULT_FRAME_HEIGHT = 128;

/** Remove the background of a raw image using the requested strategy. */
function removeBackground(img: RawRGBA, bg: RGB, mode: KeyMode, opts: SheetOptions): RawRGBA {
  const keyOpts = {
    tolerance: opts.tolerance ?? DEFAULT_TOLERANCE,
    feather: opts.feather ?? DEFAULT_FEATHER,
  };
  return mode === 'flood'
    ? floodKeyBackground(img, bg, keyOpts)
    : applyColorKey(img, bg, keyOpts);
}

/**
 * Load one sprite strip, remove its background, slice it into square frames
 * (grid auto-detected from dimensions) and resize each to `frameHeight`.
 * Frames are named `${key}_${startIndex + i}`.
 */
export async function processSheet(
  filePath: string,
  key: string,
  opts: SheetOptions = {},
  startIndex = 0,
): Promise<ProcessedFrame[]> {
  const frameHeight = opts.frameHeight ?? DEFAULT_FRAME_HEIGHT;
  const mode = opts.mode ?? 'global';

  const { data, info } = await sharp(filePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const grid = detectGrid(info.width, info.height);

  const img = { data: new Uint8Array(data), width: info.width, height: info.height };
  const bg = sampleBackgroundColor(img);
  const keyed = removeBackground(img, bg, mode, opts);
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
      name: `${key}_${startIndex + i}`,
      data: new Uint8Array(frame),
      width: frameHeight,
      height: frameHeight,
    });
  }
  return frames;
}

/**
 * Slice an OBJECT strip into `frameCount` props using content-aware gap cuts
 * (not equal cells), tight-crop each prop, then centre it at native size on a
 * per-sheet square canvas (relative sizes preserved, no distortion, no seams).
 * Frames are named `${key}_${startIndex + i}`.
 */
export async function processObjectSheet(
  filePath: string,
  key: string,
  opts: SheetOptions = {},
  startIndex = 0,
): Promise<ProcessedFrame[]> {
  const frameHeight = opts.frameHeight ?? DEFAULT_FRAME_HEIGHT;
  const { data, info } = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const grid = detectGrid(info.width, info.height);
  const img = { data: new Uint8Array(data), width: info.width, height: info.height };
  const bg = sampleBackgroundColor(img);
  const keyed = floodKeyBackground(img, bg, {
    tolerance: opts.tolerance ?? DEFAULT_TOLERANCE,
    feather: opts.feather ?? DEFAULT_FEATHER,
  });
  const keyedBuf = Buffer.from(keyed.data.buffer, keyed.data.byteOffset, keyed.data.byteLength);
  const occ = occupiedColumns(keyed.data, info.width, info.height);
  const cuts = chooseCutPoints(occ, grid.frameCount);
  const bounds = [0, ...cuts, info.width];

  // pass 1: tight-crop each segment to its content bbox
  const cropped: { buf: Buffer; w: number; h: number }[] = [];
  for (let i = 0; i < grid.frameCount; i++) {
    const left = Math.min(Math.max(0, bounds[i]!), info.width - 1);
    const width = Math.min(Math.max(1, bounds[i + 1]! - left), info.width - left);
    const segPng = await sharp(keyedBuf, { raw: { width: info.width, height: info.height, channels: 4 } })
      .extract({ left, top: 0, width, height: info.height })
      .png()
      .toBuffer();
    let out;
    try {
      out = await sharp(segPng).trim().png().toBuffer({ resolveWithObject: true });
    } catch {
      out = await sharp(segPng).png().toBuffer({ resolveWithObject: true }); // uniform/empty -> keep
    }
    cropped.push({ buf: out.data, w: out.info.width, h: out.info.height });
  }

  // pass 2: centre each crop at native size on a common square, resize to frameHeight
  const side = Math.max(1, ...cropped.map((c) => Math.max(c.w, c.h)));
  const frames: ProcessedFrame[] = [];
  for (let i = 0; i < cropped.length; i++) {
    const c = cropped[i]!;
    const padL = Math.floor((side - c.w) / 2);
    const padT = Math.floor((side - c.h) / 2);
    // NOTE: sharp applies resize BEFORE extend within one pipeline, so pad to
    // the square in one call, then resize in a fresh instance.
    const paddedPng = await sharp(c.buf)
      .extend({
        top: padT,
        bottom: side - c.h - padT,
        left: padL,
        right: side - c.w - padL,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
    const squared = await sharp(paddedPng)
      .resize(frameHeight, frameHeight, { kernel: 'lanczos3' })
      .raw()
      .toBuffer();
    frames.push({
      name: `${key}_${startIndex + i}`,
      data: new Uint8Array(squared),
      width: frameHeight,
      height: frameHeight,
    });
  }
  return frames;
}

export interface PipelineOptions {
  /** Directory containing the source sheets. */
  assetsDir: string;
  /** Directory to write otter.png / otter.json / animations.json / objects.json into. */
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
  objectsJson: string;
  frameTotal: number;
  animCount: number;
  objectCount: number;
  atlasSize: { width: number; height: number };
  /** Bytes of each output file. */
  bytes: Record<string, number>;
}

/** Find the file in assetsDir whose name contains `needle` (exactly one match). */
function resolveOne(entries: string[], needle: string, what: string): string {
  const matches = entries.filter(
    (e) => e.includes(needle) && e.toLowerCase().endsWith('.png'),
  );
  if (matches.length === 0) throw new Error(`Missing source sheet for ${what} (needle "${needle}")`);
  if (matches.length > 1) {
    throw new Error(`Ambiguous source for ${what} (needle "${needle}"): ${matches.join(', ')}`);
  }
  return matches[0]!;
}

/** Locate each animation sheet in assetsDir by its letter prefix ("A.", ...). */
export function findSheetFiles(assetsDir: string): { key: string; file: string; mode: KeyMode }[] {
  const entries = readdirSync(assetsDir);
  const found: { key: string; file: string; mode: KeyMode }[] = [];
  const missing: string[] = [];
  for (const { prefix, key, mode } of SHEET_MAP) {
    const match = entries.find(
      (e) => e.startsWith(`${prefix}.`) && e.toLowerCase().endsWith('.png'),
    );
    if (match) found.push({ key, file: path.join(assetsDir, match), mode });
    else missing.push(`${prefix}. (${key})`);
  }
  if (missing.length > 0) {
    throw new Error(`Missing source sheets in ${assetsDir}: ${missing.join(', ')}`);
  }
  return found;
}

/** Locate each object sheet's ordered source file(s) in assetsDir. */
export function findObjectFiles(assetsDir: string): { key: string; files: string[] }[] {
  const entries = readdirSync(assetsDir);
  return OBJECT_MAP.map(({ key, sources }) => ({
    key,
    files: sources.map((s) => path.join(assetsDir, resolveOne(entries, s, key))),
  }));
}

export async function runPipeline(opts: PipelineOptions): Promise<PipelineResult> {
  const atlasName = opts.atlasName ?? 'otter';
  const frameHeight = opts.frameHeight ?? DEFAULT_FRAME_HEIGHT;

  const allFrames: ProcessedFrame[] = [];

  // 1a. animation sheets -> frames + frameCounts (drive animations.json)
  const frameCounts: Record<string, number> = {};
  for (const { key, file, mode } of findSheetFiles(opts.assetsDir)) {
    const frames = await processSheet(file, key, {
      frameHeight,
      tolerance: opts.tolerance,
      feather: opts.feather,
      mode,
    });
    frameCounts[key] = frames.length;
    allFrames.push(...frames);
  }

  // 1b. object sheets -> atlas frames only (flood-keyed), NOT animations
  const objectFrames: Record<string, string[]> = {};
  for (const { key, files } of findObjectFiles(opts.assetsDir)) {
    const names: string[] = [];
    for (const file of files) {
      const frames = await processObjectSheet(
        file,
        key,
        { frameHeight, tolerance: opts.tolerance, feather: opts.feather },
        names.length,
      );
      for (const f of frames) names.push(f.name);
      allFrames.push(...frames);
    }
    objectFrames[key] = names;
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
  const objectsJson = path.join(opts.outDir, 'objects.json');

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
  writeFileSync(objectsJson, JSON.stringify({ objects: objectFrames }, null, 2));

  const bytes: Record<string, number> = {};
  for (const f of [atlasPng, atlasJson, animationsJson, objectsJson]) {
    bytes[path.basename(f)] = statSync(f).size;
  }

  return {
    atlasPng,
    atlasJson,
    animationsJson,
    objectsJson,
    frameTotal: allFrames.length,
    animCount: Object.keys(frameCounts).length,
    objectCount: Object.keys(objectFrames).length,
    atlasSize: { width: layout.width, height: layout.height },
    bytes,
  };
}
