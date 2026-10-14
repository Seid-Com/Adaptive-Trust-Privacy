"""
Preprocess IoT intrusion detection datasets for Federated Learning.

Datasets expected:
  data/TON-IoT/train_test_network.csv
  data/Edge-IIoTset/DNN-EdgeIIoT-dataset.csv
  data/Bot-IoT/Bot_IoT.csv

Output:
  data/preprocessed/{dataset}_X.npy   — feature matrix (N, D)
  data/preprocessed/{dataset}_y.npy   — labels (N,)
  data/preprocessed/{dataset}_meta.json — feature names, num classes, etc.
"""

import json
import numpy as np
import pandas as pd
from pathlib import Path
from sklearn.preprocessing import LabelEncoder, StandardScaler

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
OUT_DIR = DATA_DIR / "preprocessed"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Columns to drop (high-cardinality / leakage / identifiers)
DROP_cols_common = [
    "frame.time", "ip.src_host", "ip.dst_host",
    "arp.src.proto.ipv4", "arp.dst.proto.ipv4",
    "http.file_data", "http.request.full_uri",
    "icmp.transmit_timestamp", "http.request.uri.query",
    "tcp.options", "tcp.payload", "tcp.srcport", "tcp.dstport",
    "udp.port", "mqtt.msg",
]


def load_ton_iot():
    csv = DATA_DIR / "TON-IoT" / "TON_IoT Network Dataset.csv"
    if not csv.exists():
        # fallback
        csv = DATA_DIR / "TON-IoT" / "train_test_network.csv"
    if not csv.exists():
        raise FileNotFoundError(f"Missing {csv}")
    print(f"  Loading {csv} ...")
    df = pd.read_csv(csv, low_memory=False)
    # Target: 'label' (binary) or 'type' (multiclass)
    if "type" in df.columns:
        y_col = "type"
    elif "label" in df.columns:
        y_col = "label"
    else:
        raise ValueError("No label/type column found")
    # Drop non-feature columns
    drop = [c for c in DROP_cols_common + ["src_ip", "dst_ip", "src_port", "dst_port", "time", "date"]
            if c in df.columns]
    df.drop(columns=drop, inplace=True, errors="ignore")
    return df, y_col


def load_edge_iiotset():
    csv = DATA_DIR / "Edge-IIoTset" / "DNN-EdgeIIoT-dataset.csv"
    if not csv.exists():
        csv = DATA_DIR / "DNN-EdgeIIoT-dataset.csv"  # flat layout
    if not csv.exists():
        raise FileNotFoundError(f"Missing {csv}")
    print(f"  Loading {csv} ...")
    df = pd.read_csv(csv, low_memory=False)
    y_col = "Attack_type" if "Attack_type" in df.columns else "Attack_label"
    drop = [c for c in DROP_cols_common + ["frame.time", "frame.len", "frame.protocols"]
            if c in df.columns]
    df.drop(columns=drop, inplace=True, errors="ignore")
    return df, y_col


def load_bot_iot():
    csv = DATA_DIR / "Bot-IoT" / "Bot_IoT_Data_set.csv"
    if not csv.exists():
        csv = DATA_DIR / "Bot-IoT" / "Bot_IoT.csv"
    if not csv.exists():
        raise FileNotFoundError(f"Missing {csv}")
    print(f"  Loading {csv} ...")
    df = pd.read_csv(csv, low_memory=False)
    y_col = "subcategory" if "subcategory" in df.columns else "label"
    drop_cols = ["pkSeqID", "stime", "ltime", "seq", "attack", "category",
                 "proto", "saddr", "daddr", "sport", "dport"]
    df.drop(columns=[c for c in drop_cols if c in df.columns], inplace=True, errors="ignore")
    return df, y_col


def preprocess(df: pd.DataFrame, y_col: str, name: str):
    print(f"  Raw shape: {df.shape}")

    # Separate features / target
    y_raw = df.pop(y_col).values

    # Drop columns with >50% null
    null_pct = df.isnull().mean()
    df = df.loc[:, null_pct < 0.5]

    # Drop constant columns
    df = df.loc[:, df.nunique() > 1]

    # Encode categoricals
    cat_cols = df.select_dtypes(include=["object", "category"]).columns.tolist()
    num_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    print(f"  Categorical: {len(cat_cols)}, Numerical: {len(num_cols)}")

    for c in cat_cols:
        le = LabelEncoder()
        df[c] = le.fit_transform(df[c].astype(str))

    # Fill NaN with median
    df = df.fillna(df.median(numeric_only=True))

    # Scale
    X = df.values.astype(np.float32)
    scaler = StandardScaler()
    X = scaler.fit_transform(X)

    # Encode labels
    le_y = LabelEncoder()
    y = le_y.fit_transform(y_raw)

    print(f"  Features: {X.shape[1]}, Classes: {len(le_y.classes_)}")
    print(f"  Class distribution: {dict(zip(le_y.classes_.tolist(), np.bincount(y).tolist()))}")

    # Save
    np.save(OUT_DIR / f"{name}_X.npy", X)
    np.save(OUT_DIR / f"{name}_y.npy", y)
    meta = {
        "dataset": name,
        "n_samples": int(X.shape[0]),
        "n_features": int(X.shape[1]),
        "n_classes": int(len(le_y.classes_)),
        "class_names": le_y.classes_.tolist(),
        "feature_names": df.columns.tolist(),
    }
    with open(OUT_DIR / f"{name}_meta.json", "w") as f:
        json.dump(meta, f, indent=2)
    print(f"  Saved to {OUT_DIR / name}_*.npy")
    return X, y, meta


def main():
    loaders = [
        ("TON-IoT", load_ton_iot),
        ("Edge-IIoTset", load_edge_iiotset),
        ("Bot-IoT", load_bot_iot),
    ]
    for name, loader in loaders:
        print(f"\n=== {name} ===")
        try:
            df, y_col = loader()
            preprocess(df, y_col, name)
        except FileNotFoundError as e:
            print(f"  [skip] {e}")

    print("\nDone. Preprocessed files in data/preprocessed/")


if __name__ == "__main__":
    main()
