/** Animation manifest generation (consumed by the game's animation loader). */

export interface AnimationDef {
  key: string;
  frames: string[];
  frameRate: number;
  repeat: number; // -1 = loop forever, 0 = play once
}

export interface AnimationsManifest {
  animations: AnimationDef[];
}

/** Animations that loop forever; the rest play once (MASTER_PLAN P0-03). */
export const LOOPING_KEYS: ReadonlySet<string> = new Set([
  'idle',
  'walk',
  'carry',
  'float',
  'build',
  // wave 2: continuous loops (idle-like, cycles, ambient)
  'dizzy',
  'wash',
  'eagle',
  'bear',
  'cone_hat',
]);

export const DEFAULT_FRAME_RATE = 8;

/**
 * Build the animations manifest from a map of animation key -> frame count.
 * Frame names follow the `${key}_${index}` convention used in the atlas.
 */
export function buildAnimationsManifest(
  frameCounts: Record<string, number>,
  frameRate: number = DEFAULT_FRAME_RATE,
): AnimationsManifest {
  const animations: AnimationDef[] = Object.entries(frameCounts).map(([key, count]) => {
    if (count <= 0) throw new Error(`Animation "${key}" has no frames`);
    return {
      key,
      frames: Array.from({ length: count }, (_, i) => `${key}_${i}`),
      frameRate,
      repeat: LOOPING_KEYS.has(key) ? -1 : 0,
    };
  });
  return { animations };
}
