# Chinese Flash Card App

This repository contains a versioned HSK 3.0 vocabulary data foundation for
Levels 1 and 2 and a buildless flashcard study interface.

The generated data lives in `data/generated/hsk-2025-11/levels-1-2.json`.
It is produced from the preserved source snapshot with:

```sh
python3 scripts/import_hsk.py \
  data/sources/hsk-2025-11/hsk-levels-1-2.source.tsv \
  data/generated/hsk-2025-11/levels-1-2.json \
  --levels 1 2
```

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
