#!/usr/bin/env python3
"""Copy the validated source dataset into the static site output."""

from pathlib import Path
import shutil


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data/generated/hsk-2025-11/levels-1-2.json"
TARGET = ROOT / "dist/data/levels-1-2.json"


def main() -> None:
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(SOURCE, TARGET)
    print(f"Synced {SOURCE.relative_to(ROOT)} to {TARGET.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
