# Chinese Flash Card App

This repository currently contains the first implementation milestone: a
versioned HSK 3.0 vocabulary data foundation for Levels 1 and 2.

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
