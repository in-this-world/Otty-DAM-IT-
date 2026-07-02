/** Grid auto-detection for horizontal strips of square frames. */

export interface GridInfo {
  /** Number of frames in the strip (width / height). */
  frameCount: number;
  /** Side length of each square frame in px (equals sheet height). */
  frameSize: number;
}

/**
 * Detect the frame grid of a horizontal sprite strip. Frames are assumed to be
 * square, so the sheet width must be an integer multiple of its height
 * (e.g. 2508x627 -> 4 frames of 627px, 2172x724 -> 3 frames of 724px).
 */
export function detectGrid(width: number, height: number): GridInfo {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`Invalid sheet dimensions ${width}x${height}`);
  }
  if (width % height !== 0) {
    throw new Error(
      `Sheet ${width}x${height} does not divide into square ${height}px frames`,
    );
  }
  return { frameCount: width / height, frameSize: height };
}
