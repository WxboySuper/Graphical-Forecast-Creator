import json
import tempfile
import unittest
from contextlib import ExitStack
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import patch

try:
    from jsonschema import Draft202012Validator, FormatChecker
except ImportError:
    Draft202012Validator = None
    FormatChecker = None

from ingest import LocalStore, MODELS, colorize, discover_cycle, publish_cycle, validate_catalog
from ingestion.publish import PublishRequest, latest_is_newer
from ingestion.health import HealthReport, write_health
from ingestion import cli
from ingestion.render import valid_data, resampled_rgba, combine_wind, RasterRequest, DecodeRequest, decode_range
from inventory import IndexRecord


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


class FailedVerificationStore(MemoryStore):
    def verify_sizes(self, expected):
        raise IOError("missing uploaded tile")


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

    def test_catalog_malformed_frame_raises_value_error(self):
        catalog = sample_catalog()
        catalog["frames"][0].pop("forecastHour")
        with self.assertRaises(ValueError):
            validate_catalog(catalog)

    def test_partial_cycle_never_moves_latest_pointer(self):
        with tempfile.TemporaryDirectory() as temporary:
            store = MemoryStore(Path(temporary))
            with self.assertRaises(ValueError):
                publish_cycle(store, PublishRequest("hrrr", datetime(2026, 11, 8, 12, tzinfo=UTC), sample_catalog(status="partial"), {}))
            self.assertIsNone(store.get("mesoscale/v1/latest/hrrr.json"))

    def test_failed_cycle_never_moves_latest_pointer(self):
        with tempfile.TemporaryDirectory() as temporary:
            store = MemoryStore(Path(temporary))
            with self.assertRaises(ValueError):
                publish_cycle(store, PublishRequest("hrrr", datetime(2026, 11, 8, 12, tzinfo=UTC), sample_catalog(status="failed"), {}))
            self.assertIsNone(store.get("mesoscale/v1/latest/hrrr.json"))

    def test_publish_tiles_catalog_pointer_in_order_and_skip_complete_retry(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            tile = root / "0.png"
            tile.write_bytes(b"png fixture")
            store = MemoryStore(root / "store")
            key = "mesoscale/v1/tiles/hrrr/20261108T1200Z/f00/test/3/0/0.png"
            cycle = datetime(2026, 11, 8, 12, tzinfo=UTC)
            publish_cycle(store, PublishRequest("hrrr", cycle, sample_catalog(), {key: tile}))
            self.assertLess(store.writes.index(key), store.writes.index("mesoscale/v1/catalog/hrrr/20261108T1200Z.json"))
            self.assertLess(store.writes.index("mesoscale/v1/catalog/hrrr/20261108T1200Z.json"), store.writes.index("mesoscale/v1/latest/hrrr.json"))
            count = len(store.writes)
            publish_cycle(store, PublishRequest("hrrr", cycle, sample_catalog(), {key: tile}))
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
                publish_cycle(store, PublishRequest("hrrr", cycle, sample_catalog(), {key: tile}))
            self.assertIsNotNone(store.get("mesoscale/v1/catalog/hrrr/20261108T1200Z.json"))
            publish_cycle(store, PublishRequest("hrrr", cycle, sample_catalog(), {key: tile}))
            self.assertIsNotNone(store.get("mesoscale/v1/latest/hrrr.json"))

    def test_verification_failure_does_not_publish_catalog_or_latest(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            tile = root / "0.png"
            tile.write_bytes(b"png fixture")
            store = FailedVerificationStore(root / "store")
            key = "mesoscale/v1/tiles/hrrr/20261108T1200Z/f00/test/3/0/0.png"
            cycle = datetime(2026, 11, 8, 12, tzinfo=UTC)
            with self.assertRaises(IOError):
                publish_cycle(store, PublishRequest("hrrr", cycle, sample_catalog(), {key: tile}))
            self.assertIsNone(store.get("mesoscale/v1/catalog/hrrr/20261108T1200Z.json"))
            self.assertIsNone(store.get("mesoscale/v1/latest/hrrr.json"))

    def test_failed_health_report_includes_error(self):
        with tempfile.TemporaryDirectory() as temporary:
            store = MemoryStore(Path(temporary))
            now = "2026-11-08T12:55:00Z"
            cycle = datetime(2026, 11, 8, 12, tzinfo=UTC)
            write_health(store, HealthReport("hrrr", cycle, "failed", {}, now, now, "ValueError: decode failed"))
            health_key = store.list("mesoscale/v1/health")[0]
            report = json.loads(store.get(health_key))
            self.assertEqual(report["status"], "failed")
            self.assertEqual(report["error"], "ValueError: decode failed")

    def test_discovery_failure_writes_failed_health(self):
        with tempfile.TemporaryDirectory() as temporary:
            store = MemoryStore(Path(temporary))
            parser = type("Parser", (), {"parse_args": lambda self: type("Args", (), {"model": "hrrr", "dry_run": False, "output": Path(temporary)})()})()
            with patch.object(cli, "build_parser", return_value=parser), patch.object(cli, "create_store", return_value=store), patch.object(cli, "discover_cycle", side_effect=RuntimeError("no complete cycle")):
                with self.assertRaisesRegex(RuntimeError, "no complete cycle"):
                    cli.main()
            health = json.loads(store.get(store.list("mesoscale/v1/health")[0]))
            self.assertEqual(health["status"], "failed")
            self.assertIn("RuntimeError", health["error"])

    def test_complete_cycle_skips_decode_and_retries_pointer(self):
        with tempfile.TemporaryDirectory() as temporary:
            store = MemoryStore(Path(temporary))
            cycle = datetime(2026, 11, 8, 12, tzinfo=UTC)
            catalog = sample_catalog()
            store.put("mesoscale/v1/catalog/hrrr/20261108T1200Z.json", json.dumps(catalog).encode(), "application/json")
            args = type("Args", (), {"model": "hrrr", "dry_run": False, "output": Path(temporary)})()
            parser = type("Parser", (), {"parse_args": lambda self: args})()
            with patch.object(cli, "build_parser", return_value=parser), patch.object(cli, "create_store", return_value=store), patch.object(cli, "discover_cycle", return_value=(cycle, "source", "modified")), patch.object(cli, "process_f00", side_effect=AssertionError("decode should be skipped")):
                cli.main()
            pointer = json.loads(store.get("mesoscale/v1/latest/hrrr.json"))
            self.assertEqual(pointer["cycleTime"], catalog["cycleTime"])

    def test_decode_and_publish_failures_write_failed_health(self):
        cycle = datetime(2026, 11, 8, 12, tzinfo=UTC)
        parser = type("Parser", (), {"parse_args": lambda self: type("Args", (), {"model": "hrrr", "dry_run": False, "output": Path("out")})()})()
        for stage in ("decode", "render", "publish"):
            with self.subTest(stage=stage), tempfile.TemporaryDirectory() as temporary:
                store = MemoryStore(Path(temporary))
                dependencies = [patch.object(cli, "build_parser", return_value=parser), patch.object(cli, "create_store", return_value=store), patch.object(cli, "discover_cycle", return_value=(cycle, "source", "modified"))]
                if stage in {"decode", "render"}:
                    dependencies.append(patch.object(cli, "process_f00", side_effect=ValueError("decode failed")))
                else:
                    result = {"catalog": sample_catalog(), "metrics": {}, "tiles": {}}
                    dependencies.extend((patch.object(cli, "process_f00", return_value=result), patch.object(cli, "publish_cycle", side_effect=OSError("upload failed"))))
                with ExitStack() as stack:
                    for dependency in dependencies:
                        stack.enter_context(dependency)
                    with self.assertRaises((ValueError, OSError)):
                        cli.main()
                health_key = store.list("mesoscale/v1/health")[0]
                health = json.loads(store.get(health_key))
                self.assertEqual(health["status"], "failed")
                self.assertIn("failed", health["error"].lower())

    def test_older_completed_cycle_cannot_replace_latest(self):
        with tempfile.TemporaryDirectory() as temporary:
            store = MemoryStore(Path(temporary))
            cycle = datetime(2026, 11, 8, 12, tzinfo=UTC)
            publish_cycle(store, PublishRequest("hrrr", cycle, sample_catalog(), {}))
            older = sample_catalog("2026-11-08T06:00:00Z")
            publish_cycle(store, PublishRequest("hrrr", datetime(2026, 11, 8, 6, tzinfo=UTC), older, {}))
            pointer = json.loads(store.get("mesoscale/v1/latest/hrrr.json"))
            self.assertEqual(pointer["cycleTime"], "2026-11-08T12:00:00Z")

    def test_retention_keeps_six_newest_catalogs(self):
        with tempfile.TemporaryDirectory() as temporary:
            store = MemoryStore(Path(temporary))
            for hour in range(0, 7):
                cycle = datetime(2026, 11, 8, hour, tzinfo=UTC)
                catalog = sample_catalog(cycle.strftime("%Y-%m-%dT%H:00:00Z"))
                publish_cycle(store, PublishRequest("hrrr", cycle, catalog, {}, keep=6))
            keys = store.list("mesoscale/v1/catalog/hrrr")
            self.assertEqual(len(keys), 6)

    def test_corrupt_latest_pointer_does_not_crash_cycle_discovery(self):
        with tempfile.TemporaryDirectory() as temporary:
            store = MemoryStore(Path(temporary))
            store.put("mesoscale/v1/latest/hrrr.json", b"{broken", "application/json")
            self.assertFalse(latest_is_newer(store, "hrrr", datetime(2026, 11, 8, 12, tzinfo=UTC)))

    def test_discovery_selects_latest_complete_candidate_from_fixture(self):
        from types import SimpleNamespace
        fixture = (Path(__file__).parent / "fixtures" / "hrrr_t12_wrfscf00.idx").read_bytes()

        headers = {"Content-Length": "136859480", "Last-Modified": "Sun, 08 Nov 2026 12:51:24 GMT"}
        def fake_request(url, headers=None, attempts=4, method="GET"):
            if url.endswith(".idx"):
                return fixture, None
            return b"", SimpleNamespace(status=200, headers=headers_response)

        headers_response = headers

        now = datetime(2026, 11, 8, 12, 55, tzinfo=UTC)
        with patch("ingestion.discovery.request", side_effect=fake_request):
            cycle, url, modified = discover_cycle(MODELS["hrrr"], now=now)
        self.assertEqual(cycle, datetime(2026, 11, 8, 12, tzinfo=UTC))
        self.assertIn("hrrr.20261108", url)
        self.assertIn("12:51:24", modified)

    def test_color_interpolation_is_bounded(self):
        self.assertEqual(colorize(100, [(0, "#000000"), (10, "#ffffff")]), (255, 255, 255, 190))

    def test_render_resamples_interior_pixels_without_holes(self):
        import numpy as np
        request = RasterRequest(np.array([1, 10, 1, 10]), np.array([1, 1, 10, 10]), np.array([0, 10, 10, 20]), 12, 12, [(0, "#000000"), (20, "#ffffff")])
        rgba = resampled_rgba(request)
        self.assertEqual(int(rgba[5, 5, 3]), 190)
        self.assertEqual(int(rgba[0, 0, 3]), 0)

    def test_missing_sentinels_are_excluded_from_render_samples(self):
        import numpy as np
        mask = valid_data(np.array([1.0, np.nan, 9999.0, -9999.0, 1e20]))
        self.assertEqual(mask.tolist(), [True, False, False, False, False])

    def test_shared_range_wind_components_keep_both_sources(self):
        import numpy as np
        components = [
            {"values": np.array([[3.0]]), "record": {"parameter": "UGRD", "offset": 100}, "sourceHash": "u", "sourceBytes": 10},
            {"values": np.array([[4.0]]), "record": {"parameter": "VGRD", "offset": 100}, "sourceHash": "v", "sourceBytes": 10},
        ]
        output = combine_wind({"wind-speed-10m": components}, np)["wind-speed-10m"][0]
        self.assertEqual(float(output["values"][0, 0]), 5.0)
        self.assertEqual([source["parameter"] for source in output["sourceInputs"]], ["UGRD", "VGRD"])

    def test_wind_components_must_have_matching_grid_shapes(self):
        import numpy as np
        components = [
            {"values": np.ones((1, 2)), "record": {"parameter": "UGRD"}},
            {"values": np.ones((2, 1)), "record": {"parameter": "VGRD"}},
        ]
        with self.assertRaisesRegex(ValueError, "different shapes"):
            combine_wind({"wind-speed-10m": components}, np)

    def test_decode_reads_both_wind_messages_from_one_byte_range(self):
        try:
            import eccodes
            import numpy as np
        except ImportError:
            self.skipTest("ecCodes is unavailable")
        messages = []
        for parameter_id, value in ((165, 3.0), (166, 4.0)):
            handle = eccodes.codes_grib_new_from_samples("regular_ll_sfc_grib2")
            try:
                eccodes.codes_set(handle, "paramId", parameter_id)
                eccodes.codes_set_values(handle, np.full(16 * 31, value))
                messages.append(eccodes.codes_get_message(handle))
            finally:
                eccodes.codes_release(handle)
        payload = b"".join(messages)
        index = [
            (IndexRecord("1", 100, "2026110814", "UGRD", "10 m above ground", "anl"), None),
            (IndexRecord("2", 100, "2026110814", "VGRD", "10 m above ground", "anl"), None),
        ]
        request = DecodeRequest(payload, ["wind-speed-10m:UGRD", "wind-speed-10m:VGRD"], 100, index, "fixture", np)
        decoded = decode_range(request)
        self.assertEqual([item[1]["record"]["parameter"] for item in decoded], ["UGRD", "VGRD"])
        speed = combine_wind({"wind-speed-10m": [item[1] for item in decoded]}, np)["wind-speed-10m"][0]
        self.assertEqual(float(speed["values"][0, 0]), 5.0)


if __name__ == "__main__":
    unittest.main()
