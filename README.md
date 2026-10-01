# Chinese Flash Card App

This repository contains a versioned HSK 3.0 vocabulary data foundation and a
buildless flashcard study interface. The current reviewed dataset contains
Levels 1 and 2; the application and data pipeline support any combination of
HSK 3.0 Levels 1–9.

The generated data lives in `data/generated/hsk-2025-11/levels-1-2.json`.
It is produced from the preserved source snapshot with:

```sh
python3 scripts/import_hsk.py \
  data/sources/hsk-2025-11/hsk-levels-1-2.source.tsv \
  data/generated/hsk-2025-11/levels-1-2.json
```

By default, the importer includes every valid level present in the source.
Pass `--levels`, such as `--levels 1 2 3 4`, when producing a deliberate
subset from a larger reviewed source.

Validate the generated file and run the tests with:

```sh
python3 scripts/validate_hsk.py \
  data/generated/hsk-2025-11/levels-1-2.json
python3 -m unittest discover -s tests -v
```

Stroke-order coverage is recorded in
`data/generated/hsk-2025-11/stroke-order-coverage.json`. It can be refreshed
from a downloaded GitHub tree inventory with:

```sh
python3 scripts/check_stroke_coverage.py \
  data/generated/hsk-2025-11/levels-1-2.json \
  /path/to/hanzi-writer-tree.json \
  data/generated/hsk-2025-11/stroke-order-coverage.json
```

Source provenance and licensing are documented in
`data/sources/hsk-2025-11/README.md` and `ATTRIBUTION.md`.

## Local flashcard preview

The static interface is in `dist/`. Sync the validated dataset and serve that
directory with:

```sh
python3 scripts/sync_site_data.py
python3 -m http.server 4173 --directory dist
```

Then open `http://localhost:4173`.

The sync command copies the dataset into `dist/data/` and updates
`dist/data/manifest.json`. The interface reads this manifest, so publishing a
larger dataset does not require changing application code. For example:

```sh
python3 scripts/sync_site_data.py \
  data/generated/hsk-2025-11/levels-1-4.json
```

Cards can be organized into To learn later, Studying, and Learned decks. Deck
assignments are stored in the current browser with `localStorage`; they remain
after a reload but are not yet synchronized between browsers or devices. New
and unassigned cards begin in Studying.

Cards can also be filtered by simplified characters, tone-marked pinyin,
numbered pinyin, or pinyin without tones. The HSK-level and deck dropdowns
contain checkboxes that can be combined to study more than one level or deck
at a time.

The Stroke order control opens an animated, character-by-character reference.
Hanzi Writer and its character data are loaded on demand from pinned jsDelivr
packages, so the first animation requires an internet connection.

## Adding more HSK levels

Use one cumulative, reviewed source snapshot for each expansion. Keep original
`word_index` values stable so existing card IDs—and therefore saved deck
assignments—remain stable.

For the planned Level 1–4 expansion:

1. Create `data/sources/hsk-2025-11/hsk-levels-1-4.source.tsv` from the same
   pinned extraction source and document its checksum and provenance.
2. Add independently verified official counts for the new levels to
   `data/sources/hsk-2025-11/expected-level-counts.json`.
3. Review simplified headwords, official pinyin, part-of-speech values, and
   CC-CEDICT definitions for the new Level 3–4 rows.
4. Generate `data/generated/hsk-2025-11/levels-1-4.json` with
   `scripts/import_hsk.py --levels 1 2 3 4`.
5. Run `scripts/validate_hsk.py` and the full test suite.
6. Regenerate the stroke-order coverage report against the new dataset and
   resolve or document every missing character.
7. Publish it with `scripts/sync_site_data.py`; this validates the dataset and
   updates the manifest only when validation passes.
8. Verify level filters, search, deck persistence, stroke order, and responsive
   layout in the browser before committing the data expansion.

Repeat the same process for later cumulative expansions through Level 9. Do
not concatenate independently generated files or deduplicate by written form:
the syllabus can contain distinct pronunciations, senses, and level-specific
uses of the same simplified headword.
