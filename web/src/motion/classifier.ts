/**
 * In-browser inference for the motion-mode classifier trained in
 * `model/motion_classifier/train.py`. Loads `/motion_classifier.json` once,
 * then classifies 2-second IMU windows into {stationary, walking, driving}.
 *
 * Weights are a multinomial logistic regression: 6 features → 3 classes.
 * Feature extraction here MUST match the Python side exactly.
 */

export type MotionMode = "stationary" | "walking" | "driving";

interface ClassifierWeights {
  version: number;
  classes: MotionMode[];
  feature_names: string[];
  window_s: number;
  normalize: { mean: number[]; std: number[] };
  weights: number[][]; // [n_classes][n_features]
  bias: number[];      // [n_classes]
}

export interface ImuSample {
  accelX: number;
  accelY: number;
  accelZ: number;
  gyroX: number;
  gyroY: number;
  gyroZ: number;
  timestampMs: number;
}

let cached: ClassifierWeights | null = null;

export async function loadClassifier(): Promise<ClassifierWeights> {
  if (cached) return cached;
  const resp = await fetch("/motion_classifier.json");
  if (!resp.ok) throw new Error(`load classifier: ${resp.status}`);
  cached = (await resp.json()) as ClassifierWeights;
  return cached;
}

/**
 * Predict motion mode from a window of IMU samples. Returns the top class
 * plus the full probability vector so the UI can show confidence if needed.
 * Returns null if the window is too small or the classifier hasn't loaded yet.
 */
export function classify(
  samples: ImuSample[],
  weights: ClassifierWeights | null,
): { mode: MotionMode; probs: Record<MotionMode, number> } | null {
  if (!weights || samples.length < 20) return null;

  const features = extractFeatures(samples);
  // Normalize
  const normalized = features.map(
    (f, i) => (f - weights.normalize.mean[i]) / weights.normalize.std[i],
  );
  // Logits = W · x + b
  const logits = weights.weights.map(
    (row, c) => row.reduce((s, w, i) => s + w * normalized[i], 0) + weights.bias[c],
  );
  const probs = softmax(logits);
  let bestIdx = 0;
  for (let i = 1; i < probs.length; i++) if (probs[i] > probs[bestIdx]) bestIdx = i;

  const probObj: Record<MotionMode, number> = { stationary: 0, walking: 0, driving: 0 };
  weights.classes.forEach((c, i) => (probObj[c] = probs[i]));

  return { mode: weights.classes[bestIdx], probs: probObj };
}

/** Matches model/motion_classifier/train.py :: extract_features exactly. */
function extractFeatures(samples: ImuSample[]): number[] {
  const n = samples.length;
  const aMag = new Float64Array(n);
  const gMag = new Float64Array(n);
  const az = new Float64Array(n);
  const gz = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const s = samples[i];
    aMag[i] = Math.sqrt(s.accelX ** 2 + s.accelY ** 2 + s.accelZ ** 2);
    gMag[i] = Math.sqrt(s.gyroX ** 2 + s.gyroY ** 2 + s.gyroZ ** 2);
    az[i] = s.accelZ;
    gz[i] = s.gyroZ;
  }
  return [mean(aMag), std(aMag), mean(gMag), std(gMag), std(az), std(gz)];
}

function mean(a: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  return s / a.length;
}
function std(a: ArrayLike<number>): number {
  const m = mean(a);
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - m) ** 2;
  return Math.sqrt(s / a.length);
}
function softmax(z: number[]): number[] {
  const m = Math.max(...z);
  const e = z.map((v) => Math.exp(v - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / s);
}
