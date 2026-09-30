import json
import tempfile
import unittest
from pathlib import Path

from scripts.import_hsk import build_dataset, read_entries, write_dataset
from scripts.check_stroke_coverage import build_report
from scripts.validate_hsk import validate


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data/sources/hsk-2025-11/hsk-levels-1-2.source.tsv"


class HskDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.entries = read_entries(SOURCE, {1, 2})

    def test_expected_level_counts(self):
        self.assertEqual(300, sum(entry["level"] == 1 for entry in self.entries))
        self.assertEqual(204, sum(entry["level"] == 2 for entry in self.entries))

    def test_ids_are_unique(self):
        ids = [entry["id"] for entry in self.entries]
        self.assertEqual(len(ids), len(set(ids)))

    def test_every_entry_has_required_learning_data(self):
        for entry in self.entries:
            self.assertTrue(entry["simplified"])
            self.assertTrue(entry["traditionalForms"])
            self.assertTrue(entry["definitions"])
            self.assertTrue(entry["characters"])
            self.assertTrue(entry["pinyin"]["readings"])

    def test_same_written_form_can_have_distinct_pronunciations(self):
        guo = [entry for entry in self.entries if entry["simplified"] == "过"]
        self.assertEqual(2, len(guo))
        self.assertEqual({"guo4", "guo5"}, {entry["pinyin"]["numbered"] for entry in guo})

    def test_cross_level_uses_are_preserved(self):
        duo = [entry for entry in self.entries if entry["sourceIndex"] == 46]
        self.assertEqual({1, 2}, {entry["level"] for entry in duo})

    def test_generated_document_passes_validator(self):
        dataset = build_dataset(self.entries, {1, 2})
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "dataset.json"
            write_dataset(dataset, output)
            self.assertEqual([], validate(output))

    def test_stroke_inventory_covers_all_characters(self):
        tree = Path("/tmp/hanzi-writer-tree.json")
        if not tree.exists():
            self.skipTest("Hanzi Writer tree inventory not available")
        dataset = ROOT / "data/generated/hsk-2025-11/levels-1-2.json"
        report = build_report(dataset, tree)
        self.assertEqual([], report["missingCharacters"])
        self.assertEqual(100.0, report["coveragePercent"])


if __name__ == "__main__":
    unittest.main()
