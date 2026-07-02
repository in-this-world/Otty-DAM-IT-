/** Simple shelf packer + Phaser 3 hash-format atlas JSON generation. */

export interface FrameInput {
  name: string;
  width: number;
  height: number;
}

export interface Placement extends FrameInput {
  x: number;
  y: number;
}

export interface AtlasLayout {
  width: number;
  height: number;
  placements: Placement[];
}

export interface PackOptions {
  /** Maximum atlas width in px. */
  maxWidth?: number;
  /** Gap between frames in px (guards against texture bleeding). */
  padding?: number;
}

/**
 * Pack frames left-to-right into shelves (rows), wrapping at maxWidth.
 * Deterministic: preserves input order.
 */
export function packFrames(frames: FrameInput[], opts: PackOptions = {}): AtlasLayout {
  const maxWidth = opts.maxWidth ?? 1024;
  const padding = opts.padding ?? 2;

  const placements: Placement[] = [];
  let x = 0;
  let y = 0;
  let shelfHeight = 0;
  let atlasWidth = 0;

  for (const f of frames) {
    if (f.width > maxWidth) {
      throw new Error(`Frame "${f.name}" (${f.width}px) exceeds maxWidth ${maxWidth}`);
    }
    if (x > 0 && x + f.width > maxWidth) {
      // start a new shelf
      y += shelfHeight + padding;
      x = 0;
      shelfHeight = 0;
    }
    placements.push({ ...f, x, y });
    atlasWidth = Math.max(atlasWidth, x + f.width);
    shelfHeight = Math.max(shelfHeight, f.height);
    x += f.width + padding;
  }

  return { width: atlasWidth, height: y + shelfHeight, placements };
}

/** Phaser 3 "hash" texture atlas JSON (this.load.atlas compatible). */
export interface PhaserAtlasFrame {
  frame: { x: number; y: number; w: number; h: number };
  rotated: boolean;
  trimmed: boolean;
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
}

export interface PhaserAtlasJson {
  frames: Record<string, PhaserAtlasFrame>;
  meta: {
    app: string;
    image: string;
    format: string;
    size: { w: number; h: number };
    scale: string;
  };
}

export function buildPhaserAtlasJson(layout: AtlasLayout, imageFile: string): PhaserAtlasJson {
  const frames: Record<string, PhaserAtlasFrame> = {};
  for (const p of layout.placements) {
    frames[p.name] = {
      frame: { x: p.x, y: p.y, w: p.width, h: p.height },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: p.width, h: p.height },
      sourceSize: { w: p.width, h: p.height },
    };
  }
  return {
    frames,
    meta: {
      app: 'otty prepare-assets',
      image: imageFile,
      format: 'RGBA8888',
      size: { w: layout.width, h: layout.height },
      scale: '1',
    },
  };
}
