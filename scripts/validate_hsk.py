#!/usr/bin/env python3
"""Validate invariants required by the flashcard application."""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_EXPECTED_COUNTS = (
    ROOT / "data/sources/hsk-2025-11/expected-level-counts.json"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", type=Path)
    parser.add_argument(
        "--expected-counts",
        type=Path,
        default=DEFAULT_EXPECTED_COUNTS,
        help="Independent, reviewed per-level count contract",
    )
    return parser.parse_args()


def load_expected_counts(path: Path = DEFAULT_EXPECTED_COUNTS) -> dict[int, int]:
    document = json.loads(path.read_text(encoding="utf-8"))
    return {int(level): int(count) for level, count in document["counts"].items()}


def validate(
    path: Path, expected_counts: dict[int, int] | None = None
) -> list[str]:
    document = json.loads(path.read_text(encoding="utf-8"))
    if expected_counts is None:
        expected_counts = load_expected_counts()
    errors: list[str] = []
    entries = document.get("entries", [])
    ids = [entry.get("id") for entry in entries]
    dataset = document.get("dataset", {})
    declared_levels = dataset.get("levels", [])
    actual_counts = Counter(entry.get("level") for entry in entries)
    actual_levels = set(actual_counts)

    if document.get("schemaVersion") != 1:
        errors.append("schemaVersion must be 1")
    if len(ids) != len(set(ids)):
        errors.append("entry IDs must be unique")
    if dataset.get("entryCount") != len(entries):
        errors.append("dataset.entryCount does not match entries")
    if declared_levels != sorted(set(declared_levels)):
        errors.append("dataset.levels must be unique and sorted")
    if set(declared_levels) != actual_levels:
        errors.append("dataset.levels does not match entry levels")
    expected_metadata_counts = {
        str(level): count for level, count in sorted(actual_counts.items())
    }
    if dataset.get("entryCountByLevel") != expected_metadata_counts:
        errors.append("dataset.entryCountByLevel does not match entries")

    for entry in entries:
        label = entry.get("id", "<missing id>")
        if entry.get("level") not in range(1, 10):
            errors.append(f"{label}: invalid level")
        if not entry.get("simplified"):
            errors.append(f"{label}: missing simplified headword")
        if not entry.get("definitions"):
            errors.append(f"{label}: missing definitions")
        if not entry.get("characters"):
            errors.append(f"{label}: missing character list")
        readings = entry.get("pinyin", {}).get("readings", [])
        if not readings:
            errors.append(f"{label}: missing pinyin readings")
        for reading in readings:
            for syllable in reading:
                if syllable.get("tone") not in range(1, 6):
                    errors.append(f"{label}: invalid tone number")

    for level, expected in expected_counts.items():
        if level in actual_levels and actual_counts[level] != expected:
            errors.append(
                f"level {level}: expected {expected} entries, found {actual_counts[level]}"
            )
    return errors


def main() -> None:
    args = parse_args()
    errors = validate(args.dataset, load_expected_counts(args.expected_counts))
    if errors:
        print("Validation failed:")
        for error in errors:
            print(f"- {error}")
        raise SystemExit(1)
    document = json.loads(args.dataset.read_text(encoding="utf-8"))
    review_count = sum(
        entry["quality"]["definitionNeedsReview"] for entry in document["entries"]
    )
    mismatch_count = sum(
        not entry["quality"]["pinyinMatchesCedict"] for entry in document["entries"]
    )
    print(f"Validated {len(document['entries'])} entries")
    print(f"Definition review queue: {review_count}")
    print(f"Official/CC-CEDICT pinyin differences: {mismatch_count}")


if __name__ == "__main__":
    main()
