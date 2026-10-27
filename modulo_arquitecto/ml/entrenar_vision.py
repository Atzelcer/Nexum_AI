from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from sklearn.metrics import classification_report
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from torch.utils.data import DataLoader, TensorDataset

from features import FEATURE_SIZE, extract_features, landmarks_from_row
from gesture_labels import CLASES, GESTURE_LABELS

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data" / "vision"
OUT_DIR = ROOT / "models" / "vision"
EPOCHS = 80
BATCH = 32
LR = 1e-3
AUGMENT = 6


class MLP(nn.Module):
    def __init__(self, n_in: int, n_out: int):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(n_in, 128),
            nn.BatchNorm1d(128),
            nn.ReLU(),
            nn.Dropout(0.25),
            nn.Linear(128, 64),
            nn.BatchNorm1d(64),
            nn.ReLU(),
            nn.Dropout(0.15),
            nn.Linear(64, n_out),
        )

    def forward(self, x):
        return self.net(x)


def load_csv_samples() -> tuple[np.ndarray, np.ndarray]:
    frames: list[pd.DataFrame] = []
    if DATA_DIR.exists():
        for csv in sorted(DATA_DIR.glob("*.csv")):
            df = pd.read_csv(csv)
            if "gesto" not in df.columns:
                continue
            frames.append(df)
            print(f"  {csv.name}: {len(df)} filas")

    if not frames:
        raise FileNotFoundError(f"No hay CSV en {DATA_DIR}. Ejecuta collect_vision.py primero.")

    df_all = pd.concat(frames, ignore_index=True)
    label_map = {g: i for i, g in enumerate(CLASES)}
    X, y = [], []
    for _, row in df_all.iterrows():
        g = str(row["gesto"])
        if g not in label_map:
            continue
        left = landmarks_from_row(row, "left")
        right = landmarks_from_row(row, "right")
        X.append(extract_features(left, right))
        y.append(label_map[g])

    return np.array(X, dtype=np.float32), np.array(y, dtype=np.int64)


def export_browser(model: MLP, scaler: StandardScaler, clases: list[str]) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    state = model.state_dict()
    layers = []
    for key_w, key_b in [("net.0.weight", "net.0.bias"), ("net.4.weight", "net.4.bias"), ("net.8.weight", "net.8.bias")]:
        layers.append({
            "W": state[key_w].cpu().numpy().tolist(),
            "b": state[key_b].cpu().numpy().tolist(),
        })

    payload = {
        "version": 1,
        "clases": clases,
        "input_size": FEATURE_SIZE,
        "scaler": {
            "mean": scaler.mean_.tolist(),
            "scale": scaler.scale_.tolist(),
        },
        "layers": layers,
    }
    (OUT_DIR / "model.json").write_text(json.dumps(payload), encoding="utf-8")
    (OUT_DIR / "metadata.json").write_text(
        json.dumps(
            {
                "codigo_modelo": "arch_vision_gestos_v2",
                "descripcion": "Clasificador de 14 gestos + posiciones (Arquitecto 3D)",
                "muestras_por_clase": 10000,
                "gestos": {g: GESTURE_LABELS.get(g, g) for g in clases},
                "tipo_modelo": "clasificador",
                "codigo_modalidad": "arquitecto_tridimensional",
                "motor_deteccion": "hand_landmarker",
                "clases": clases,
                "input_size": FEATURE_SIZE,
                "estado_modelo": "listo",
            },
            indent=2,
        ),
        encoding="utf-8",
    )


def main() -> None:
    print("Cargando muestras de vision…")
    X, y = load_csv_samples()
    print(f"Total: {len(X)} muestras, {len(CLASES)} clases")

    noise_std = X.std(axis=0) * 0.04 + 1e-6
    X_aug, y_aug = [X], [y]
    for _ in range(AUGMENT):
        X_aug.append(X + np.random.randn(*X.shape).astype(np.float32) * noise_std)
        y_aug.append(y)
    X = np.vstack(X_aug)
    y = np.concatenate(y_aug)

    scaler = StandardScaler()
    X = scaler.fit_transform(X).astype(np.float32)

    X_tr, X_tmp, y_tr, y_tmp = train_test_split(X, y, test_size=0.25, random_state=42, stratify=y)
    X_val, X_te, y_val, y_te = train_test_split(X_tmp, y_tmp, test_size=0.5, random_state=42, stratify=y_tmp)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = MLP(FEATURE_SIZE, len(CLASES)).to(device)
    opt = torch.optim.Adam(model.parameters(), lr=LR, weight_decay=1e-4)
    crit = nn.CrossEntropyLoss()

    def loader(Xd, yd, shuffle=True):
        return DataLoader(TensorDataset(torch.tensor(Xd), torch.tensor(yd)), batch_size=BATCH, shuffle=shuffle)

    tr_loader = loader(X_tr, y_tr)
    val_loader = loader(X_val, y_val, shuffle=False)
    best_acc, best_state = 0.0, None

    print(f"Entrenando en {device}…")
    for epoch in range(1, EPOCHS + 1):
        model.train()
        for xb, yb in tr_loader:
            xb, yb = xb.to(device), yb.to(device)
            opt.zero_grad()
            crit(model(xb), yb).backward()
            opt.step()

        if epoch % 10 == 0 or epoch == EPOCHS:
            model.eval()
            ok = tot = 0
            with torch.no_grad():
                for xb, yb in val_loader:
                    pred = model(xb.to(device)).argmax(1).cpu()
                    ok += (pred == yb).sum().item()
                    tot += len(yb)
            acc = ok / max(tot, 1)
            if acc >= best_acc:
                best_acc = acc
                best_state = {k: v.clone() for k, v in model.state_dict().items()}
            print(f"  epoch {epoch:3d}  val_acc={acc:.3f}  best={best_acc:.3f}")

    model.load_state_dict(best_state)
    model.eval()
    te_loader = loader(X_te, y_te, shuffle=False)
    pred_all, true_all = [], []
    with torch.no_grad():
        for xb, yb in te_loader:
            pred_all.extend(model(xb.to(device)).argmax(1).cpu().tolist())
            true_all.extend(yb.tolist())

    print("\n" + classification_report(true_all, pred_all, target_names=CLASES, zero_division=0))
    export_browser(model.cpu(), scaler, CLASES)
    print(f"\nOK Exportado a {OUT_DIR / 'model.json'}")


if __name__ == "__main__":
    main()
