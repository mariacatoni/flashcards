#!/usr/bin/env python3
"""Copy a generated dataset into the site and update its data manifest."""

import argparse
import json
from pathlib import Path
import shutil

try:
    from .validate_hsk import validate
except ImportError:
    from validate_hsk import validate


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT / "data/generated/hsk-2025-11/levels-1-2.json"
DATA_DIRECTORY = ROOT / "dist/data"
MANIFEST = DATA_DIRECTORY / "manifest.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "source",
        type=Path,
        nargs="?",
        default=DEFAULT_SOURCE,
        help="Generated dataset to publish",
    )
    parser.add_argument(
        "--target-name",
        help="Published JSON filename (default: source filename)",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    source = args.source.resolve()
    target_name = args.target_name or source.name
    if Path(target_name).name != target_name or not target_name.endswith(".json"):
        raise SystemExit("Target name must be a plain .json filename")

    errors = validate(source)
    if errors:
        print("Dataset was not published because validation failed:")
        for error in errors:
            print(f"- {error}")
        raise SystemExit(1)

    target = DATA_DIRECTORY / target_name
    DATA_DIRECTORY.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)
    MANIFEST.write_text(
        json.dumps({"schemaVersion": 1, "dataset": target_name}, indent=2) + "\n",
        encoding="utf-8",
    )
    try:
        source_label = source.relative_to(ROOT)
    except ValueError:
        source_label = source
    print(f"Synced {source_label} to {target.relative_to(ROOT)}")
    print(f"Updated {MANIFEST.relative_to(ROOT)} -> {target_name}")


if __name__ == "__main__":
    main()
