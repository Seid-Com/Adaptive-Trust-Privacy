#!/usr/bin/env python3
r"""
Download IoT intrusion detection datasets from Kaggle.

Prerequisites:
    pip install kaggle
    # Place kaggle.json in ~/.kaggle/ (Windows: C:\Users\<user>\.kaggle\)
    # Get API key from: https://www.kaggle.com/settings

Usage:
    python scripts/download_datasets.py
"""

import subprocess
import sys
import os
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

DATASETS = {
    "TON-IoT": {
        "kaggle": "arnobbhowmik/ton-iot-network-dataset",
        "file": "train_test_network.csv",
        "description": "TON-IoT Network Intrusion Dataset (UNSW Canberra)",
    },
    "Edge-IIoTset": {
        "kaggle": "mohamedamineferrag/edgeiiotset-cyber-security-dataset-of-iot-iiot",
        "file": "Edge-IIoTset dataset/Selected dataset for ML and DL/DNN-EdgeIIoT-dataset.csv",
        "description": "Edge-IIoTset Cyber Security Dataset",
    },
    "Bot-IoT": {
        "kaggle": "vigneshvenkateswaran/bot-iot",
        "file": "Bot_IoT.csv",
        "description": "Bot-IoT Dataset (UNSW Canberra)",
    },
}


def check_kaggle():
    try:
        import kaggle  # noqa: F401
        return True
    except ImportError:
        return False


def download_dataset(name: str, info: dict) -> bool:
    out_dir = DATA_DIR / name
    out_dir.mkdir(parents=True, exist_ok=True)

    target = out_dir / info["file"].split("/")[-1]
    if target.exists():
        print(f"  [skip] {target.name} already exists")
        return True

    print(f"  Downloading {info['kaggle']}...")
    try:
        subprocess.run(
            [
                sys.executable, "-m", "kaggle",
                "datasets", "download",
                "-d", info["kaggle"],
                "-f", info["file"],
                "-p", str(out_dir),
                "--unzip",
            ],
            check=True,
            capture_output=True,
        )
        print(f"  [ok] Saved to {out_dir}")
        return True
    except subprocess.CalledProcessError as e:
        print(f"  [error] {e.stderr.decode() if e.stderr else e}")
        return False


def main():
    print("=== IoT Dataset Downloader ===\n")

    if not check_kaggle():
        print("ERROR: kaggle package not installed.")
        print("  pip install kaggle")
        print("  Then place kaggle.json in ~/.kaggle/")
        print("  Get API key: https://www.kaggle.com/settings")
        sys.exit(1)

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    results = {}

    for name, info in DATASETS.items():
        print(f"\n[{name}] {info['description']}")
        results[name] = download_dataset(name, info)

    print("\n=== Summary ===")
    for name, ok in results.items():
        print(f"  {name}: {'OK' if ok else 'FAILED'}")

    if all(results.values()):
        print("\nAll datasets ready. You can now run FL experiments.")
    else:
        print("\nSome downloads failed. Check errors above.")


if __name__ == "__main__":
    main()
