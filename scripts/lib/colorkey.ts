/** Color-key background removal for RGB sheets on a near-solid background. */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

/** Raw interleaved RGBA pixel data (4 channels). */
export interface RawRGBA {
  data: Uint8Array;
  width: number;
  height: number;
}

export interface ColorKeyOptions {
  /** Euclidean RGB distance below which a pixel is fully transparent. */
  tolerance?: number;
  /** Distance band above tolerance over which alpha ramps 0 -> 255 (feather). */
  feather?: number;
}

export const DEFAULT_TOLERANCE = 26;
export const DEFAULT_FEATHER = 34;

/**
 * Estimate the background color by averaging a small patch of pixels in each
 * of the four corners of the image.
 */
export function sampleBackgroundColor(img: RawRGBA, patch = 4): RGB {
  const { data, width, height } = img;
  const p = Math.max(1, Math.min(patch, Math.floor(width / 2), Math.floor(height / 2)));
  const xs = [0, width - p];
  const ys = [0, height - p];
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (const y0 of ys) {
    for (const x0 of xs) {
      for (let y = y0; y < y0 + p; y++) {
        for (let x = x0; x < x0 + p; x++) {
          const i = (y * width + x) * 4;
          r += data[i]!;
          g += data[i + 1]!;
          b += data[i + 2]!;
          n++;
        }
      }
    }
  }
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
}

/**
 * Return a new RGBA image where pixels close to the background color become
 * transparent. Alpha ramps linearly over the feather band for soft edges:
 *   dist <= tolerance            -> alpha 0
 *   tolerance..tolerance+feather -> alpha 0..255 (linear)
 *   dist >= tolerance+feather    -> alpha 255
 * The input image is not mutated.
 */
export function applyColorKey(img: RawRGBA, bg: RGB, opts: ColorKeyOptions = {}): RawRGBA {
  const tolerance = opts.tolerance ?? DEFAULT_TOLERANCE;
  const feather = Math.max(1, opts.feather ?? DEFAULT_FEATHER);
  const src = img.data;
  const out = new Uint8Array(src);
  for (let i = 0; i < out.length; i += 4) {
    const dr = src[i]! - bg.r;
    const dg = src[i + 1]! - bg.g;
    const db = src[i + 2]! - bg.b;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    let a: number;
    if (dist <= tolerance) a = 0;
    else if (dist >= tolerance + feather) a = 255;
    else a = Math.round(((dist - tolerance) / feather) * 255);
    // combine with any pre-existing alpha
    out[i + 3] = Math.min(a, src[i + 3]!);
  }
  return { data: out, width: img.width, height: img.height };
}
