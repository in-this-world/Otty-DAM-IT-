/**
 * P2-09 scene tiles: pure background layout (zero Phaser imports).
 *
 * Maps the fixed 960x540 world onto a 96px display grid of tile placements:
 * grass everywhere, the water zone (bottom-left) edged with bank tiles, a
 * riverbed ford under the dam site, a forest wall along the top edge (with an
 * entrance gap for the bear), and a few atlas decorations. GameScene only
 * draws what this module returns.
 *
 * Tile textures are the pipeline's strip PNGs (public/assets/tiles/*.png),
 * declared in TILE_SHEETS and verified against tiles.json by a contract test.
 */

export interface WorldSize {
  readonly width: number;
  readonly height: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** One background tile draw (centre position, square display size). */
export interface TilePlacement {
  texture: TileTexture;
  frame: number;
  x: number;
  y: number;
  size: number;
  flipX?: boolean;
}

/** One decoration sprite from the main otter atlas (obj_decor_*). */
export interface DecorPlacement {
  frame: string;
  x: number;
  y: number;
  height: number;
}

export interface SceneLayout {
  /** Static background tiles, in draw order (bottom first). */
  tiles: TilePlacement[];
  /** Open-water cells whose frame cycles 0..3 (flow animation). */
  animatedWater: TilePlacement[];
  /** Decorations drawn above tiles, below gameplay sprites. */
  decor: DecorPlacement[];
}

/** Tile strip textures loaded by BootScene; must match pipeline tiles.json. */
export const TILE_SHEETS = {
  tile_grass: { frames: 4 },
  tile_water: { frames: 4 },
  tile_bank: { frames: 4 },
  tile_riverbed: { frames: 2 },
  tile_forest: { frames: 3 },
} as const;
export type TileTexture = keyof typeof TILE_SHEETS;

/** Source px per tile in the strip PNGs (pipeline DEFAULT_TILE_SIZE). */
export const TILE_SRC_SIZE = 192;

/** Display px per ground tile: 960x540 -> 10 x 5.625 cells. */
export const TILE = 96;

/** T3 bank frame meanings (see art guide batch 3). */
const BANK_H = 0; // grass top / water bottom
const BANK_V = 1; // grass left / water right
const BANK_OUTER = 2; // grass wraps top-left, water bottom-right

/** Water flow animation speed (GameScene cycles frames at this period). */
export const WATER_FRAME_MS = 450;

/**
 * The playable water zone, snapped to the tile grid (cols 0..2, rows 4..5)
 * and clipped to the world. Replaces the old P2-03 placeholder rect —
 * gameplay bounds and visuals now agree.
 */
export const WATER_RECT: Rect = { x: 0, y: 384, width: 288, height: 156 };

/** Dam site (kept in sync with GameScene.createDam). */
export const DAM_SITE = { x: 480, y: 96 } as const;

/** Deterministic tiny hash so grass variety is stable frame-to-frame. */
function cellHash(col: number, row: number): number {
  let h = (col * 73856093) ^ (row * 19349663);
  h = (h ^ (h >> 13)) >>> 0;
  return h % 1000;
}

/** Mostly plain grass; sparse flowers/pebbles/bare patches. */
function grassFrame(col: number, row: number): number {
  const h = cellHash(col, row);
  if (h < 100) return 1; // flowers ~10%
  if (h < 160) return 2; // pebbles ~6%
  if (h < 185) return 3; // bare patch ~2.5%
  return 0;
}

function centred(col: number, row: number): { x: number; y: number } {
  return { x: col * TILE + TILE / 2, y: row * TILE + TILE / 2 };
}

/** Build the full static background + animated water + decorations. */
export function buildSceneLayout(world: WorldSize = { width: 960, height: 540 }): SceneLayout {
  const cols = Math.ceil(world.width / TILE);
  const rows = Math.ceil(world.height / TILE);
  const waterCols = WATER_RECT.width / TILE; // 3
  const waterRowStart = WATER_RECT.y / TILE; // 4

  const tiles: TilePlacement[] = [];
  const animatedWater: TilePlacement[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const inWater = row >= waterRowStart && col < waterCols;
      const { x, y } = centred(col, row);
      if (!inWater) {
        tiles.push({ texture: 'tile_grass', frame: grassFrame(col, row), x, y, size: TILE });
        continue;
      }
      const edgeRow = row === waterRowStart; // grass above
      const edgeCol = col === waterCols - 1; // grass to the right
      if (edgeRow && edgeCol) {
        // grass wraps top + right -> mirrored outer corner
        tiles.push({ texture: 'tile_bank', frame: BANK_OUTER, x, y, size: TILE, flipX: true });
      } else if (edgeRow) {
        tiles.push({ texture: 'tile_bank', frame: BANK_H, x, y, size: TILE });
      } else if (edgeCol) {
        // water left / grass right -> mirrored vertical bank
        tiles.push({ texture: 'tile_bank', frame: BANK_V, x, y, size: TILE, flipX: true });
      } else {
        animatedWater.push({ texture: 'tile_water', frame: 0, x, y, size: TILE });
      }
    }
  }

  // Riverbed ford under the dam site — reads as the stream the dam blocks.
  tiles.push({
    texture: 'tile_riverbed',
    frame: 1, // the variant with big foundation stones
    x: DAM_SITE.x,
    y: DAM_SITE.y + 26,
    size: 236,
  });

  // Forest wall along the top edge, leaving the dam span open. Frame 1 is the
  // bushes-gap entrance (where the bear lumbers out), placed on the right.
  const FOREST_SIZE = 160;
  const forest: { x: number; frame: number }[] = [
    { x: 80, frame: 0 },
    { x: 240, frame: 2 },
    { x: 720, frame: 1 },
    { x: 880, frame: 0 },
  ];
  for (const f of forest) {
    tiles.push({ texture: 'tile_forest', frame: f.frame, x: f.x, y: FOREST_SIZE / 2 - 20, size: FOREST_SIZE });
  }

  // Decorations (otter-atlas obj_decor_*): reeds by the water, a stump and
  // mushrooms by the forest, a mossy rock on the right. Kept off the dam
  // approach and the open middle so gameplay stays readable.
  const decor: DecorPlacement[] = [
    { frame: 'obj_decor_0', x: 318, y: 392, height: 52 }, // reeds at water corner
    { frame: 'obj_decor_0', x: 36, y: 356, height: 44 }, // reeds on far bank
    { frame: 'obj_decor_1', x: 156, y: 178, height: 46 }, // stump under the forest
    { frame: 'obj_decor_2', x: 906, y: 338, height: 40 }, // mossy rock, right side
    { frame: 'obj_decor_3', x: 850, y: 186, height: 38 }, // mushrooms by the entrance
  ];

  return { tiles, animatedWater, decor };
}
