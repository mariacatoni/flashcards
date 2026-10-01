# HSK 3.0 source snapshot

`hsk-levels-1-4.source.tsv` is the current cumulative snapshot. It contains
Levels 1–4 selected from the pinned upstream generated TSV. The earlier
`hsk-levels-1-2.source.tsv` snapshot remains preserved for reproducibility and
regression comparisons.

## Provenance

- Official syllabus publication: November 2025
- Official syllabus effective date: July 2026
- Extraction repository: `Punpuf/hsk-syllabus-vocabulary-parser`
- Extraction commit: `2adf7c9885a17077966922b89de7ce655d7d82a0`
- Upstream file: `hsk_word_list.tsv`
- Upstream full-file SHA-256:
  `46f8139f651cf4895dcdb9b1f517795778257716433bdcc5127460fd00d0f9ee`
- Level 1–2 snapshot selected: 2026-09-30
- Level 1–4 snapshot selected: 2026-10-01
- Level 1–4 snapshot SHA-256:
  `da997147e0d98b8bd4f103f41f1d98a85db83e3eb75e5a0441309833c6bea8b6`

The snapshot retains the original source index, every level-specific row,
official tone-marked pinyin, part-of-speech codes, numbered pinyin, and
CC-CEDICT definitions. Traditional-character fields are intentionally omitted
because this application supports simplified Chinese only. CC-CEDICT inline
references in `traditional|simplified[pinyin]` form are reduced to their
simplified side before storage.

Level 2 contains four level-specific grammatical uses of Level 1 headwords.
These are intentional and must not be deduplicated by written form alone.
The Level 1–4 snapshot contains 300 Level 1 rows, 204 Level 2 rows, 507 Level 3
rows, and 1,019 Level 4 rows. The upstream source labels advanced vocabulary
as a combined `7-9` band rather than three separate vocabulary lists.

## Refreshing

The importer accepts this subset or the complete upstream TSV. To refresh:

1. Download the current official syllabus manually from the official page.
2. Obtain a current CC-CEDICT release in accordance with its download terms.
3. Run the upstream extraction pipeline, pinned to a reviewed revision.
4. Compare its validation report with the current snapshot.
5. Replace this TSV only after reviewing changed and unresolved rows.
6. Regenerate and validate the JSON.

For a level expansion, create a new cumulative snapshot such as
`hsk-levels-1-4.source.tsv`; do not overwrite or assemble it by concatenating
level files. Preserve upstream `word_index` values so existing generated IDs
and browser deck assignments remain stable. Record the full upstream checksum,
selection date, extraction commit, and any manual review decisions here before
publishing the expanded dataset. Add independently verified official counts to
`expected-level-counts.json`; the validator and publishing script use this file
to detect missing or extra source rows.

Large PDF and dictionary source files are intentionally excluded from Git.
