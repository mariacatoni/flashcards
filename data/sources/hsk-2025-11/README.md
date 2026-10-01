# HSK 3.0 source snapshot

`hsk-levels-1-2.source.tsv` is a reproducible, reviewable snapshot containing
only Level 1 and Level 2 rows selected from the upstream generated TSV.

## Provenance

- Official syllabus publication: November 2025
- Official syllabus effective date: July 2026
- Extraction repository: `Punpuf/hsk-syllabus-vocabulary-parser`
- Extraction commit: `2adf7c9885a17077966922b89de7ce655d7d82a0`
- Upstream file: `hsk_word_list.tsv`
- Upstream full-file SHA-256:
  `46f8139f651cf4895dcdb9b1f517795778257716433bdcc5127460fd00d0f9ee`
- Snapshot selected: 2026-09-30

The snapshot retains the original source index, every level-specific row,
official tone-marked pinyin, part-of-speech codes, numbered pinyin, and
CC-CEDICT definitions. Traditional-character fields are intentionally omitted
because this application supports simplified Chinese only. CC-CEDICT inline
references in `traditional|simplified[pinyin]` form are reduced to their
simplified side before storage.

Level 2 contains four level-specific grammatical uses of Level 1 headwords.
These are intentional and must not be deduplicated by written form alone.

## Refreshing

The importer accepts this subset or the complete upstream TSV. To refresh:

1. Download the current official syllabus manually from the official page.
2. Obtain a current CC-CEDICT release in accordance with its download terms.
3. Run the upstream extraction pipeline, pinned to a reviewed revision.
4. Compare its validation report with the current snapshot.
5. Replace this TSV only after reviewing changed and unresolved rows.
6. Regenerate and validate the JSON.

Large PDF and dictionary source files are intentionally excluded from Git.
