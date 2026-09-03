"""Train a 3-class motion-mode classifier on our real IMU captures.

Classes:
    0: stationary
    1: walking
    2: driving

For each 2-second window of IMU data we compute six features and train a
multinomial logistic regression via gradient descent. Weights + feature
normalization stats are exported to `web/public/motion_classifier.json`
so the frontend can run inference in the browser with no model runtime.

Data labeling is heuristic — we know which captures were which:
    ios_test_2026-08-24            -> stationary (~1.5s test capture)
    ios_drive_2026-08-24 (~18s)    -> walking     (Palak walking on campus)
    ios_drive_2026-08-29 (~2.5min) -> walking     (Palak walking on campus)
    ios_drive_2026-09-02a,b        -> driving     (real car drives, Bengaluru)
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).parent.parent.parent
DATA = ROOT / "data" / "real"
OUT = ROOT / "web" / "public" / "motion_classifier.json"

CLASSES = ["stationary", "walking", "driving"]

# (path, class_idx)
LABELED = [
    ("ios_test_2026-08-24.csv",   0),
    ("ios_drive_2026-08-24.csv",  1),
    ("ios_drive_2026-08-29.csv",  1),
    ("ios_drive_2026-09-02a.csv", 2),
    ("ios_drive_2026-09-02b.csv", 2),
]

WINDOW_S = 2.0
STRIDE_S = 1.0


def load_features_and_labels() -> tuple[np.ndarray, np.ndarray, list[str]]:
    feats: list[np.ndarray] = []
    labels: list[int] = []
    per_class = {c: 0 for c in range(len(CLASSES))}

    for filename, cls in LABELED:
        path = DATA / filename
        if not path.exists():
            print(f"  skip {filename} (missing)")
            continue
        df = pd.read_csv(path)
        if len(df) < 20:
            continue
        # Window by wall-clock timestamps
        ts = df.timestamp_ms.to_numpy()
        t0 = ts[0]
        i = 0
        n = len(df)
        while i < n:
            t_start = ts[i]
            t_end = t_start + WINDOW_S * 1000
            # Find end of window
            j = i
            while j < n and ts[j] < t_end:
                j += 1
            if j - i < 20:
                break
            window = df.iloc[i:j]
            feats.append(extract_features(window))
            labels.append(cls)
            per_class[cls] += 1
            # Advance by stride
            t_next = t_start + STRIDE_S * 1000
            while i < n and ts[i] < t_next:
                i += 1
        print(f"  {filename}: {per_class[cls]} windows (cumulative for class {cls})")

    print(f"\nClass counts: " + ", ".join(f"{CLASSES[c]}={n}" for c, n in per_class.items()))
    return np.array(feats), np.array(labels), FEATURE_NAMES


FEATURE_NAMES = [
    "accel_mag_mean",
    "accel_mag_std",
    "gyro_mag_mean",
    "gyro_mag_std",
    "accel_z_std",
    "gyro_z_std",
]


def extract_features(window: pd.DataFrame) -> np.ndarray:
    ax = window.accel_x.to_numpy()
    ay = window.accel_y.to_numpy()
    az = window.accel_z.to_numpy()
    gx = window.gyro_x.to_numpy()
    gy = window.gyro_y.to_numpy()
    gz = window.gyro_z.to_numpy()
    a_mag = np.sqrt(ax * ax + ay * ay + az * az)
    g_mag = np.sqrt(gx * gx + gy * gy + gz * gz)
    return np.array([
        a_mag.mean(),
        a_mag.std(),
        g_mag.mean(),
        g_mag.std(),
        az.std(),
        gz.std(),
    ], dtype=np.float64)


# ---------- Multinomial logistic regression, pure numpy ----------

def softmax(z: np.ndarray) -> np.ndarray:
    z = z - z.max(axis=1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(axis=1, keepdims=True)


def train_logreg(
    X: np.ndarray,
    y: np.ndarray,
    n_classes: int,
    lr: float = 0.15,
    epochs: int = 6000,
    l2: float = 0.001,
) -> tuple[np.ndarray, np.ndarray, dict]:
    """Multinomial logistic regression via full-batch gradient descent, with
    inverse-frequency class weights so a heavily-imbalanced dataset doesn't
    just learn 'predict the majority class'.
    Returns (W [n_classes, n_features], b [n_classes], stats)."""
    n, d = X.shape
    W = np.zeros((n_classes, d), dtype=np.float64)
    b = np.zeros(n_classes, dtype=np.float64)

    # One-hot labels
    Y = np.zeros((n, n_classes))
    Y[np.arange(n), y] = 1

    # Per-sample weights = 1 / class-frequency so each class contributes
    # equally to the loss regardless of how many examples it has.
    counts = np.array([max(1, int((y == c).sum())) for c in range(n_classes)])
    sample_w = (n / (n_classes * counts))[y]      # shape (n,)
    sample_w = sample_w / sample_w.mean()          # normalize so mean=1

    losses: list[float] = []
    for epoch in range(epochs):
        logits = X @ W.T + b
        probs = softmax(logits)
        ce_per_sample = -np.sum(Y * np.log(probs + 1e-12), axis=1)
        loss = float((sample_w * ce_per_sample).mean() + 0.5 * l2 * np.sum(W * W))
        dz = ((probs - Y) * sample_w[:, None]) / n
        grad_W = dz.T @ X + l2 * W
        grad_b = dz.sum(axis=0)
        W -= lr * grad_W
        b -= lr * grad_b
        if epoch % 750 == 0 or epoch == epochs - 1:
            preds = probs.argmax(axis=1)
            acc = float(np.mean(preds == y))
            losses.append(loss)
            print(f"    epoch {epoch:5d}  loss={loss:.4f}  acc={acc:.3f}")

    preds = softmax(X @ W.T + b).argmax(axis=1)
    acc = float(np.mean(preds == y))
    return W, b, {"final_loss": float(loss), "final_accuracy": acc, "losses": losses}


def main() -> None:
    print("Loading + windowing:")
    X, y, feature_names = load_features_and_labels()
    print(f"\nTotal windows: {len(X)}")
    if len(X) == 0:
        raise SystemExit("no training data found — check paths")

    # Feature normalization: standardize to unit mean/variance
    mean = X.mean(axis=0)
    std = X.std(axis=0)
    std[std == 0] = 1.0
    Xn = (X - mean) / std

    print("\nTraining logistic regression:")
    W, b, stats = train_logreg(Xn, y, n_classes=len(CLASSES))

    # Per-class recall
    print("\nPer-class recall:")
    probs = softmax(Xn @ W.T + b)
    preds = probs.argmax(axis=1)
    for c, name in enumerate(CLASSES):
        mask = y == c
        if mask.sum() == 0:
            print(f"  {name:11s}: (no data)")
        else:
            recall = float(np.mean(preds[mask] == c))
            print(f"  {name:11s}: {recall:.3f}  ({int(mask.sum())} samples)")

    # Export
    payload = {
        "version": 1,
        "classes": CLASSES,
        "feature_names": feature_names,
        "window_s": WINDOW_S,
        "normalize": {
            "mean": mean.tolist(),
            "std": std.tolist(),
        },
        "weights": W.tolist(),
        "bias": b.tolist(),
        "training_stats": {
            "n_windows": int(len(X)),
            "final_loss": stats["final_loss"],
            "final_accuracy": stats["final_accuracy"],
        },
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2))
    print(f"\nWrote weights → {OUT}")


if __name__ == "__main__":
    main()
