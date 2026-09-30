#!/usr/bin/env python3
"""Compare dataset characters with a Hanzi Writer GitHub tree inventory."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", type=Path)
    parser.add_argument("tree", type=Path, help="GitHub recursive tree API JSON")
    parser.add_argument("output", type=Path)
    return parser.parse_args()


def build_report(dataset_path: Path, tree_path: Path) -> dict[str, object]:
    dataset = json.loads(dataset_path.read_text(encoding="utf-8"))
    tree = json.loads(tree_path.read_text(encoding="utf-8"))
    if tree.get("truncated"):
        raise ValueError("GitHub tree inventory is truncated")

    available = {
        Path(item["path"]).stem
        for item in tree["tree"]
        if item["path"].startswith("data/")
        and item["path"].endswith(".json")
        and item["path"] != "data/all.json"
    }
    required = {
        character
        for entry in dataset["entries"]
        for character in entry["characters"]
    }
    missing = sorted(required.difference(available))
    return {
        "datasetId": dataset["dataset"]["id"],
        "source": {
            "repository": "https://github.com/chanind/hanzi-writer-data",
            "commit": tree["sha"],
            "license": "Arphic Public License",
        },
        "requiredCharacterCount": len(required),
        "availableCharacterCount": len(required) - len(missing),
        "coveragePercent": round(
            100 * (len(required) - len(missing)) / len(required), 2
        ),
        "missingCharacters": missing,
    }


def main() -> None:
    args = parse_args()
    report = build_report(args.dataset, args.tree)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(
        f"Stroke coverage: {report['availableCharacterCount']}/"
        f"{report['requiredCharacterCount']} ({report['coveragePercent']}%)"
    )
    if report["missingCharacters"]:
        print("Missing: " + " ".join(report["missingCharacters"]))
        raise SystemExit(1)


if __name__ == "__main__":
    main()

