#!/usr/bin/env python3
"""Convert reviewed HSK/CC-CEDICT TSV rows into the app's JSON contract."""

from __future__ import annotations

import argparse
import csv
import json
import re
from collections import Counter
from pathlib import Path
from typing import Iterable


REQUIRED_COLUMNS = {
    "word_index",
    "level",
    "word",
    "pinyin",
    "part_of_speech",
    "pinyin_numbered",
    "pinyin_cc-cedict",
    "traditional_cc-cedict",
    "definition_cc-cedict",
}

PART_OF_SPEECH_LABELS = {
    "名": "noun",
    "动": "verb",
    "形": "adjective",
    "副": "adverb",
    "代": "pronoun",
    "数": "numeral",
    "量": "measure word",
    "数量": "numeral or quantity phrase",
    "助": "particle",
    "介": "preposition",
    "连": "conjunction",
    "叹": "interjection",
    "前缀": "prefix",
    "后缀": "suffix",
}

REVIEW_MARKERS = (
    "cl:",
    "classifier",
    "surname",
    "variant of",
    "see also",
    "used in",
    "abbr.",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="Upstream TSV source")
    parser.add_argument("output", type=Path, help="Generated JSON destination")
    parser.add_argument(
        "--levels",
        type=int,
        nargs="+",
        default=[1, 2],
        help="Levels to include (default: 1 2)",
    )
    return parser.parse_args()


def strip_sense_suffix(word: str) -> tuple[str, int | None]:
    match = re.fullmatch(r"(.+?)([12])", word)
    if not match:
        return word, None
    return match.group(1), int(match.group(2))


def split_part_of_speech(value: str) -> list[str]:
    return [part.strip() for part in value.split("、") if part.strip()]


def split_definitions(value: str) -> list[str]:
    return [definition.strip() for definition in value.split("/") if definition.strip()]


def parse_numbered_readings(value: str) -> list[list[dict[str, object]]]:
    readings: list[list[dict[str, object]]] = []
    for reading in value.split("/"):
        syllables: list[dict[str, object]] = []
        for token in reading.strip().split():
            match = re.fullmatch(r"(.+?)([1-5])", token)
            if not match:
                raise ValueError(f"Invalid numbered pinyin syllable: {token!r}")
            spelling = match.group(1).replace("u:", "ü")
            syllables.append({"spelling": spelling, "tone": int(match.group(2))})
        if not syllables:
            raise ValueError(f"Empty numbered pinyin reading: {value!r}")
        readings.append(syllables)
    return readings


def normalize_numbered(value: str) -> str:
    return value.lower().replace("u:", "ü").replace(" ", "").strip()


def hanzi_characters(value: str) -> list[str]:
    characters = [char for char in value if "\u3400" <= char <= "\u9fff"]
    if not characters:
        raise ValueError(f"Headword contains no Hanzi: {value!r}")
    return characters


def definition_needs_review(definitions: list[str]) -> bool:
    combined = " ".join(definitions).lower()
    return len(definitions) > 1 or any(marker in combined for marker in REVIEW_MARKERS)


def make_id(source_index: int, level: int, pinyin_numbered: str) -> str:
    pinyin_slug = re.sub(r"[^a-z0-9]+", "-", pinyin_numbered.lower()).strip("-")
    return f"hsk3-2025-11-{source_index:04d}-l{level}-{pinyin_slug}"


def convert_row(row: dict[str, str]) -> dict[str, object]:
    source_index = int(row["word_index"])
    level = int(row["level"])
    simplified, sense_number = strip_sense_suffix(row["word"].strip())
    definitions = split_definitions(row["definition_cc-cedict"])
    numbered = row["pinyin_numbered"].strip()
    cedict_numbered = row["pinyin_cc-cedict"].strip() or None
    traditional_forms = [
        form.strip()
        for form in row["traditional_cc-cedict"].split("/")
        if form.strip()
    ]

    if not definitions:
        raise ValueError(f"Missing definition for source row {source_index}")
    if not traditional_forms:
        raise ValueError(f"Missing traditional form for source row {source_index}")

    return {
        "id": make_id(source_index, level, numbered),
        "sourceIndex": source_index,
        "level": level,
        "simplified": simplified,
        "senseNumber": sense_number,
        "traditionalForms": traditional_forms,
        "characters": hanzi_characters(simplified),
        "pinyin": {
            "display": row["pinyin"].strip(),
            "numbered": numbered,
            "cedictNumbered": cedict_numbered,
            "readings": parse_numbered_readings(numbered),
        },
        "partOfSpeech": split_part_of_speech(row["part_of_speech"]),
        "definitions": definitions,
        "quality": {
            "pinyinMatchesCedict": bool(cedict_numbered)
            and normalize_numbered(numbered) == normalize_numbered(cedict_numbered),
            "definitionNeedsReview": definition_needs_review(definitions),
        },
    }


def read_entries(path: Path, levels: set[int]) -> list[dict[str, object]]:
    with path.open(encoding="utf-8", newline="") as source:
        reader = csv.DictReader(source, delimiter="\t")
        missing = REQUIRED_COLUMNS.difference(reader.fieldnames or [])
        if missing:
            raise ValueError(f"Missing TSV columns: {', '.join(sorted(missing))}")

        entries = [
            convert_row(row)
            for row in reader
            if row["level"].isdigit() and int(row["level"]) in levels
        ]

    entries.sort(key=lambda entry: (entry["sourceIndex"], entry["level"], entry["id"]))
    return entries


def build_dataset(entries: list[dict[str, object]], levels: Iterable[int]) -> dict[str, object]:
    selected_levels = sorted(set(levels))
    level_counts = Counter(int(entry["level"]) for entry in entries)
    return {
        "schemaVersion": 1,
        "dataset": {
            "id": "hsk-3.0-2025-11-levels-" + "-".join(map(str, selected_levels)),
            "syllabusVersion": "2025-11",
            "effectiveDate": "2026-07",
            "levels": selected_levels,
            "entryCount": len(entries),
            "entryCountByLevel": {str(level): level_counts[level] for level in selected_levels},
            "sources": [
                {
                    "name": "Syllabus for the Chinese Proficiency Test",
                    "publisher": "Center for Language Education and Cooperation",
                    "url": "https://www.chinesetest.cn/syllabus",
                },
                {
                    "name": "CC-CEDICT",
                    "url": "https://cc-cedict.org/",
                    "license": "CC BY-SA 4.0",
                },
                {
                    "name": "HSK syllabus vocabulary extraction pipeline",
                    "url": "https://github.com/Punpuf/hsk-syllabus-vocabulary-parser",
                    "commit": "2adf7c9885a17077966922b89de7ce655d7d82a0",
                },
            ],
        },
        "partOfSpeechLabels": PART_OF_SPEECH_LABELS,
        "entries": entries,
    }


def write_dataset(dataset: dict[str, object], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(dataset, ensure_ascii=False, indent=2, sort_keys=False) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    args = parse_args()
    levels = set(args.levels)
    if not levels or min(levels) < 1 or max(levels) > 9:
        raise SystemExit("Levels must be integers from 1 through 9")
    entries = read_entries(args.input, levels)
    if not entries:
        raise SystemExit("No entries matched the requested levels")
    dataset = build_dataset(entries, levels)
    write_dataset(dataset, args.output)
    counts = dataset["dataset"]["entryCountByLevel"]
    print(f"Wrote {len(entries)} entries to {args.output}")
    print("Counts by level: " + ", ".join(f"{k}={v}" for k, v in counts.items()))


if __name__ == "__main__":
    main()

