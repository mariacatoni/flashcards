#!/usr/bin/env python3
"""Build a prioritized TSV queue for unresolved English definition review."""

from __future__ import annotations

import argparse
import csv
import json
import math
from pathlib import Path


HIGH_RISK_FIRST_SENSE = (
    "abbr.",
    "classifier",
    "surname",
    "variant of",
    "(classical)",
    "(literary)",
)
SPECIAL_PARTS_OF_SPEECH = {"量", "介", "助", "副", "前缀", "后缀"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--levels", type=int, nargs="+", default=[3, 4])
    parser.add_argument("--batch-size", type=int, default=100)
    return parser.parse_args()


def review_priority(entry: dict[str, object]) -> int:
    definitions = entry["definitions"]
    first = str(definitions[0]).lower()
    if entry.get("senseNumber") or any(marker in first for marker in HIGH_RISK_FIRST_SENSE):
        return 1
    if SPECIAL_PARTS_OF_SPEECH.intersection(entry["partOfSpeech"]):
        return 1
    if not entry["quality"]["pinyinMatchesCedict"] or len(definitions) >= 5:
        return 2
    return 3


def build_queue(
    dataset: Path, output: Path, levels: set[int], batch_size: int
) -> dict[str, int]:
    if batch_size < 1:
        raise ValueError("batch size must be positive")
    document = json.loads(dataset.read_text(encoding="utf-8"))
    entries = [
        entry
        for entry in document["entries"]
        if entry["level"] in levels and entry["quality"]["definitionNeedsReview"]
    ]
    entries.sort(key=lambda entry: (review_priority(entry), entry["level"], entry["sourceIndex"]))

    output.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "batch",
        "priority",
        "id",
        "level",
        "source_index",
        "simplified",
        "pinyin",
        "part_of_speech",
        "displayed_definition",
        "all_dictionary_senses",
        "pinyin_review",
        "status",
        "reviewed_definition",
        "review_note",
    ]
    with output.open("w", encoding="utf-8", newline="") as target:
        writer = csv.DictWriter(target, fieldnames=fieldnames, delimiter="\t")
        writer.writeheader()
        for index, entry in enumerate(entries):
            pinyin = entry["pinyin"]
            writer.writerow(
                {
                    "batch": index // batch_size + 1,
                    "priority": review_priority(entry),
                    "id": entry["id"],
                    "level": entry["level"],
                    "source_index": entry["sourceIndex"],
                    "simplified": entry["simplified"],
                    "pinyin": pinyin["display"],
                    "part_of_speech": "、".join(entry["partOfSpeech"]),
                    "displayed_definition": entry["definitions"][0],
                    "all_dictionary_senses": " / ".join(entry["definitions"]),
                    "pinyin_review": (
                        "official syllabus pronunciation retained; dictionary has "
                        + str(pinyin["cedictNumbered"])
                        if not entry["quality"]["pinyinMatchesCedict"]
                        else ""
                    ),
                    "status": "pending",
                    "reviewed_definition": "",
                    "review_note": "",
                }
            )

    return {
        "pending": len(entries),
        "batches": math.ceil(len(entries) / batch_size),
        "priority1": sum(review_priority(entry) == 1 for entry in entries),
        "priority2": sum(review_priority(entry) == 2 for entry in entries),
        "priority3": sum(review_priority(entry) == 3 for entry in entries),
    }


def main() -> None:
    args = parse_args()
    summary = build_queue(args.dataset, args.output, set(args.levels), args.batch_size)
    print(f"Wrote {summary['pending']} pending rows in {summary['batches']} batches")
    print(
        "Priorities: "
        f"1={summary['priority1']}, 2={summary['priority2']}, 3={summary['priority3']}"
    )


if __name__ == "__main__":
    main()
