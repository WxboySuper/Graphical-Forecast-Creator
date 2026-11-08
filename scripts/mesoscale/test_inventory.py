import unittest
from pathlib import Path

from inventory import IndexRecord, parse_idx, resolve_allowlist, resolve_ranges


FIXTURE = """1:0:d=2026110812:TMP:2 m above ground:anl:
2:100:d=2026110812:CAPE:180-0 mb above ground:anl:
3:250:d=2026110812:HLCY:3000-0 m above ground:0-0 hour fcst:
"""


class InventoryTests(unittest.TestCase):
    def test_parse_preserves_index_identity(self):
        rows = parse_idx(FIXTURE)
        self.assertEqual(rows[1], IndexRecord("2", 100, "2026110812", "CAPE", "180-0 mb above ground", "anl"))

    def test_ranges_are_inclusive_and_use_next_offset(self):
        ranges = resolve_ranges(parse_idx(FIXTURE), 400)
        self.assertEqual([(span.start, span.end, span.size) for _, span in ranges], [(0, 99, 100), (100, 249, 150), (250, 399, 150)])

    def test_allowlist_requires_exact_level(self):
        selected = resolve_allowlist(parse_idx(FIXTURE), 400, {"mlcape": {"parameter": "CAPE", "level": "180-0 mb above ground"}, "wrong": {"parameter": "CAPE", "level": "surface"}})
        self.assertEqual(len(selected["mlcape"]), 1)
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
