import unittest
from pathlib import Path

from inventory import IndexRecord, parse_idx, resolve_allowlist, resolve_ranges


FIXTURE_PATH = Path(__file__).parent / "fixtures" / "hrrr_t12_wrfscf00.idx"


class InventoryTests(unittest.TestCase):
    def test_parse_preserves_index_identity(self):
        rows = parse_idx(FIXTURE_PATH.read_text(encoding="ascii"))
        t2m = next(row for row in rows if row.parameter == "TMP" and row.level == "2 m above ground")
        self.assertEqual(t2m, IndexRecord("71", 35958451, "2026110812", "TMP", "2 m above ground", "anl"))

    def test_ranges_are_inclusive_and_use_next_offset(self):
        ranges = resolve_ranges(parse_idx(FIXTURE_PATH.read_text(encoding="ascii")), 136859480)
        t2m = next(span for row, span in ranges if row.parameter == "TMP" and row.level == "2 m above ground")
        self.assertEqual((t2m.start, t2m.end, t2m.size), (35958451, 37196037, 1237587))

    def test_allowlist_requires_exact_level(self):
        selected = resolve_allowlist(parse_idx(FIXTURE_PATH.read_text(encoding="ascii")), 136859480, {"t2m": {"parameter": "TMP", "level": "2 m above ground", "step": "anl"}, "wrong": {"parameter": "TMP", "level": "3 m above ground"}})
        self.assertEqual(selected["t2m"][0]["range"], {"start": 35958451, "end": 37196037})
        self.assertEqual(selected["wrong"], [])

    def test_rejects_bad_offsets(self):
        with self.assertRaises(ValueError):
            parse_idx("1:10:d=2026110812:TMP:surface:anl\n2:9:d=2026110812:CAPE:surface:anl")

    def test_shared_message_offset_gets_shared_range(self):
        rows = parse_idx("24.1:100:d=2026110812:UGRD:10 m above ground:anl:\n24.2:100:d=2026110812:VGRD:10 m above ground:anl:\n25:250:d=2026110812:TMP:2 m above ground:anl:")
        ranges = resolve_ranges(rows, 400)
        self.assertEqual((ranges[0][1].start, ranges[0][1].end), (100, 249))
        self.assertEqual((ranges[1][1].start, ranges[1][1].end), (100, 249))


if __name__ == "__main__":
    unittest.main()
