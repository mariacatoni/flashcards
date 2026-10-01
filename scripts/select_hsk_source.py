#!/usr/bin/env python3
"""Create a simplified-only, cumulative HSK source snapshot from an upstream TSV."""

from __future__ import annotations

import argparse
import csv
import hashlib
import re
from collections import Counter
from pathlib import Path


OUTPUT_COLUMNS = [
    "word_index",
    "level",
    "word",
    "pinyin",
    "part_of_speech",
    "pinyin_numbered",
    "pinyin_cc-cedict",
    "definition_cc-cedict",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="Pinned upstream TSV")
    parser.add_argument("output", type=Path, help="Reviewed snapshot destination")
    parser.add_argument("--levels", nargs="+", required=True)
    parser.add_argument("--expected-sha256")
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def select_rows(
    input_path: Path,
    output_path: Path,
    levels: set[str],
    expected_sha256: str | None = None,
) -> Counter[str]:
    if expected_sha256 and sha256(input_path) != expected_sha256.lower():
        raise ValueError("Upstream TSV checksum does not match the pinned source")

    with input_path.open(encoding="utf-8", newline="") as source:
        reader = csv.DictReader(source, delimiter="\t")
        missing = set(OUTPUT_COLUMNS).difference(reader.fieldnames or [])
        if missing:
            raise ValueError(f"Missing TSV columns: {', '.join(sorted(missing))}")
        rows = []
        for row in reader:
            if row["level"] not in levels:
                continue
            selected = {column: row[column] for column in OUTPUT_COLUMNS}
            selected["definition_cc-cedict"] = re.sub(
                r"[\u3400-\u9fff·]+\|([\u3400-\u9fff·]+)",
                r"\1",
                selected["definition_cc-cedict"],
            )
            rows.append(selected)

    counts = Counter(row["level"] for row in rows)
    missing_levels = levels.difference(counts)
    if missing_levels:
        raise ValueError(
            "No rows found for levels: " + ", ".join(sorted(missing_levels))
        )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8", newline="") as destination:
        writer = csv.DictWriter(
            destination,
            fieldnames=OUTPUT_COLUMNS,
            delimiter="\t",
            lineterminator="\n",
        )
        writer.writeheader()
        writer.writerows(rows)
    return counts


def main() -> None:
    args = parse_args()
    counts = select_rows(
        args.input,
        args.output,
        set(args.levels),
        args.expected_sha256,
    )
    print(f"Wrote {sum(counts.values())} rows to {args.output}")
    print("Counts by level: " + ", ".join(f"{key}={counts[key]}" for key in sorted(counts)))


if __name__ == "__main__":
    main()
