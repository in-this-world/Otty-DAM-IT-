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

/**
 * Border-connected ("flood fill") background removal. Only pixels that are
 * (a) close to the background color AND (b) reachable from the image border
 * through other background-colored pixels are made transparent. Unlike
 * {@link applyColorKey}, this preserves background-colored regions that are
 * *enclosed* by the subject's outline — e.g. gray stones, white fish bellies,
 * bubbles, an eagle's white head — which a global color-key would punch out.
 *
 * Alpha on the removed (outside) region ramps over the feather band exactly
 * like applyColorKey; interior/subject pixels keep their original alpha.
 * 4-connectivity is used so the fill cannot slip through 1px diagonal gaps in
 * an anti-aliased outline and eat into the subject. The input is not mutated.
 */
export function floodKeyBackground(img: RawRGBA, bg: RGB, opts: ColorKeyOptions = {}): RawRGBA {
  const tolerance = opts.tolerance ?? DEFAULT_TOLERANCE;
  const feather = Math.max(1, opts.feather ?? DEFAULT_FEATHER);
  const { width, height, data: src } = img;
  const out = new Uint8Array(src);
  const n = width * height;

  const dist = new Float32Array(n);
  const cand = new Uint8Array(n); // within tolerance+feather of bg -> floodable
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    const dr = src[i]! - bg.r;
    const dg = src[i + 1]! - bg.g;
    const db = src[i + 2]! - bg.b;
    const d = Math.sqrt(dr * dr + dg * dg + db * db);
    dist[p] = d;
    cand[p] = d <= tolerance + feather ? 1 : 0;
  }

  // Flood fill from every border pixel through floodable pixels.
  const outside = new Uint8Array(n);
  const stack: number[] = [];
  const push = (p: number): void => {
    if (cand[p] && !outside[p]) {
      outside[p] = 1;
      stack.push(p);
    }
  };
  for (let x = 0; x < width; x++) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    push(y * width);
    push(y * width + (width - 1));
  }
  while (stack.length > 0) {
    const p = stack.pop()!;
    const x = p % width;
    const y = (p - x) / width;
    if (x > 0) push(p - 1);
    if (x < width - 1) push(p + 1);
    if (y > 0) push(p - width);
    if (y < height - 1) push(p + width);
  }

  for (let p = 0; p < n; p++) {
    if (!outside[p]) continue; // interior / subject -> keep original alpha
    const d = dist[p]!;
    let a: number;
    if (d <= tolerance) a = 0;
    else if (d >= tolerance + feather) a = 255;
    else a = Math.round(((d - tolerance) / feather) * 255);
    out[p * 4 + 3] = Math.min(a, src[p * 4 + 3]!);
  }
  return { data: out, width, height };
}
