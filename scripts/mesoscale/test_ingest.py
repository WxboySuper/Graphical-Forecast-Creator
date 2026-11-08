import json
import tempfile
import unittest
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import patch

try:
    from jsonschema import Draft202012Validator, FormatChecker
except ImportError:
    Draft202012Validator = None
    FormatChecker = None

from ingest import LocalStore, MODELS, colorize, discover_cycle, publish_cycle, validate_catalog


def sample_catalog(cycle="2026-11-08T12:00:00Z", status="complete"):
    return {
        "schemaVersion": 1,
        "model": {"id": "hrrr", "name": "High-Resolution Rapid Refresh"},
        "cycleTime": cycle,
        "status": status,
        "receivedAt": "2026-11-08T12:51:24Z",
        "processedAt": "2026-11-08T13:04:11Z",
        "ageMinutes": 64,
        "processingVersion": "gfc-mesoscale-ingest/1.0.0",
        "domain": {"id": "conus", "name": "CONUS", "projection": "EPSG:3857", "bounds": [-130, 20, -60, 55], "minZoom": 3, "maxZoom": 4},
        "frames": [{"forecastHour": 0, "validTime": cycle, "frameType": "analysis", "status": status, "parameters": []}],
    }


class MemoryStore(LocalStore):
    def __init__(self, root):
        super().__init__(root)
        self.writes = []

    def put(self, key, data, content_type):
        self.writes.append(key)
        super().put(key, data, content_type)


class FailPointerOnceStore(MemoryStore):
    fail = True

    def put(self, key, data, content_type):
        if key == "mesoscale/v1/latest/hrrr.json" and self.fail:
            self.fail = False
            raise OSError("simulated pointer write failure")
        super().put(key, data, content_type)


class IngestTests(unittest.TestCase):
    def test_catalog_matches_json_schema_and_contract_validator(self):
        schema = json.loads((Path(__file__).parent / "catalog.schema.json").read_text())
        catalog = sample_catalog()
        self.assertEqual(schema["properties"]["schemaVersion"]["const"], catalog["schemaVersion"])
        self.assertTrue(set(schema["required"]) <= catalog.keys())
        if Draft202012Validator:
            Draft202012Validator(schema, format_checker=FormatChecker()).validate(catalog)
        validate_catalog(catalog)

    def test_catalog_rejects_wrong_analysis_frame(self):
        catalog = sample_catalog()
        catalog["frames"][0]["frameType"] = "forecast"
        with self.assertRaises(ValueError):
            validate_catalog(catalog)

    def test_partial_cycle_never_moves_latest_pointer(self):
        with tempfile.TemporaryDirectory() as temporary:
            store = MemoryStore(Path(temporary))
            with self.assertRaises(ValueError):
                publish_cycle(store, "hrrr", datetime(2026, 11, 8, 12, tzinfo=UTC), sample_catalog(status="partial"), {})
            self.assertIsNone(store.get("mesoscale/v1/latest/hrrr.json"))

    def test_failed_cycle_never_moves_latest_pointer(self):
        with tempfile.TemporaryDirectory() as temporary:
            store = MemoryStore(Path(temporary))
            with self.assertRaises(ValueError):
                publish_cycle(store, "hrrr", datetime(2026, 11, 8, 12, tzinfo=UTC), sample_catalog(status="failed"), {})
            self.assertIsNone(store.get("mesoscale/v1/latest/hrrr.json"))

    def test_publish_tiles_catalog_pointer_in_order_and_skip_complete_retry(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            tile = root / "0.png"
            tile.write_bytes(b"png fixture")
            store = MemoryStore(root / "store")
            key = "mesoscale/v1/tiles/hrrr/20261108T1200Z/f00/test/3/0/0.png"
            cycle = datetime(2026, 11, 8, 12, tzinfo=UTC)
            publish_cycle(store, "hrrr", cycle, sample_catalog(), {key: tile})
            self.assertLess(store.writes.index(key), store.writes.index("mesoscale/v1/catalog/hrrr/20261108T1200Z.json"))
            self.assertLess(store.writes.index("mesoscale/v1/catalog/hrrr/20261108T1200Z.json"), store.writes.index("mesoscale/v1/latest/hrrr.json"))
            count = len(store.writes)
            publish_cycle(store, "hrrr", cycle, sample_catalog(), {key: tile})
            self.assertEqual(len(store.writes), count)

    def test_retry_finishes_pointer_after_catalog_write_failure(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            tile = root / "0.png"
            tile.write_bytes(b"png fixture")
            store = FailPointerOnceStore(root / "store")
            key = "mesoscale/v1/tiles/hrrr/20261108T1200Z/f00/test/3/0/0.png"
            cycle = datetime(2026, 11, 8, 12, tzinfo=UTC)
            with self.assertRaises(OSError):
                publish_cycle(store, "hrrr", cycle, sample_catalog(), {key: tile})
            self.assertIsNotNone(store.get("mesoscale/v1/catalog/hrrr/20261108T1200Z.json"))
            publish_cycle(store, "hrrr", cycle, sample_catalog(), {key: tile})
            self.assertIsNotNone(store.get("mesoscale/v1/latest/hrrr.json"))

    def test_older_completed_cycle_cannot_replace_latest(self):
        with tempfile.TemporaryDirectory() as temporary:
            store = MemoryStore(Path(temporary))
            cycle = datetime(2026, 11, 8, 12, tzinfo=UTC)
            publish_cycle(store, "hrrr", cycle, sample_catalog(), {})
            older = sample_catalog("2026-11-08T06:00:00Z")
            publish_cycle(store, "hrrr", datetime(2026, 11, 8, 6, tzinfo=UTC), older, {})
            pointer = json.loads(store.get("mesoscale/v1/latest/hrrr.json"))
            self.assertEqual(pointer["cycleTime"], "2026-11-08T12:00:00Z")

    def test_retention_keeps_six_newest_catalogs(self):
        with tempfile.TemporaryDirectory() as temporary:
            store = MemoryStore(Path(temporary))
            for hour in range(0, 7):
                cycle = datetime(2026, 11, 8, hour, tzinfo=UTC)
                catalog = sample_catalog(cycle.strftime("%Y-%m-%dT%H:00:00Z"))
                publish_cycle(store, "hrrr", cycle, catalog, {}, keep=6)
            keys = store.list("mesoscale/v1/catalog/hrrr")
            self.assertEqual(len(keys), 6)

    def test_discovery_selects_latest_complete_candidate_from_fixture(self):
        fixture = (Path(__file__).parent / "fixtures" / "hrrr_t12_wrfscf00.idx").read_bytes()

        class Head:
            headers = {"Content-Length": "136859480", "Last-Modified": "Sun, 08 Nov 2026 12:51:24 GMT"}

        now = datetime(2026, 11, 8, 12, 55, tzinfo=UTC)
        with patch("ingest.request", return_value=(fixture, None)), patch("ingest.urllib.request.urlopen", return_value=Head()):
            cycle, url, modified = discover_cycle(MODELS["hrrr"], now=now)
        self.assertEqual(cycle, datetime(2026, 11, 8, 12, tzinfo=UTC))
        self.assertIn("hrrr.20261108", url)
        self.assertIn("12:51:24", modified)

    def test_color_interpolation_is_bounded(self):
        self.assertEqual(colorize(100, [(0, "#000000"), (10, "#ffffff")]), (255, 255, 255, 190))


if __name__ == "__main__":
    unittest.main()
