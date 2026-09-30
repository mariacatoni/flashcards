#!/usr/bin/env python3
"""Validate invariants required by the flashcard application."""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", type=Path)
    return parser.parse_args()


def validate(path: Path) -> list[str]:
    document = json.loads(path.read_text(encoding="utf-8"))
    errors: list[str] = []
    entries = document.get("entries", [])
    ids = [entry.get("id") for entry in entries]

    if document.get("schemaVersion") != 1:
        errors.append("schemaVersion must be 1")
    if len(ids) != len(set(ids)):
        errors.append("entry IDs must be unique")
    if document.get("dataset", {}).get("entryCount") != len(entries):
        errors.append("dataset.entryCount does not match entries")

    for entry in entries:
        label = entry.get("id", "<missing id>")
        if entry.get("level") not in range(1, 10):
            errors.append(f"{label}: invalid level")
        if not entry.get("simplified"):
            errors.append(f"{label}: missing simplified headword")
        if not entry.get("definitions"):
            errors.append(f"{label}: missing definitions")
        if not entry.get("traditionalForms"):
            errors.append(f"{label}: missing traditional forms")
        if not entry.get("characters"):
            errors.append(f"{label}: missing character list")
        readings = entry.get("pinyin", {}).get("readings", [])
        if not readings:
            errors.append(f"{label}: missing pinyin readings")
        for reading in readings:
            for syllable in reading:
                if syllable.get("tone") not in range(1, 6):
                    errors.append(f"{label}: invalid tone number")

    expected_counts = {"1": 300, "2": 204}
    actual_counts = Counter(str(entry["level"]) for entry in entries)
    if set(document.get("dataset", {}).get("levels", [])) == {1, 2}:
        for level, expected in expected_counts.items():
            if actual_counts[level] != expected:
                errors.append(
                    f"level {level}: expected {expected} entries, found {actual_counts[level]}"
                )
    return errors


def main() -> None:
    args = parse_args()
    errors = validate(args.dataset)
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

