import json
import tempfile
import unittest
from contextlib import ExitStack
from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest.mock import patch

try:
    from jsonschema import Draft202012Validator, FormatChecker
except ImportError:
    Draft202012Validator = None
    FormatChecker = None

from ingest import LocalStore, MODELS, colorize, discover_cycle, publish_cycle, validate_catalog
from ingestion.publish import PublishRequest, latest_is_newer
from ingestion.discovery import CycleSource, FrameSource
from ingestion.archives import ArchiveRequest, create_archive
from ingestion.health import HealthReport, write_health
from ingestion import cli
from ingestion.render import valid_data, resampled_rgba, combine_wind, RasterRequest, DecodeRequest, decode_range, write_temp_content
from ingestion.store import ObjectCheck, R2Credentials, R2Store
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
        "frames": [{"forecastHour": hour, "validTime": (datetime.fromisoformat(cycle.replace("Z", "+00:00")) + timedelta(hours=hour)).strftime("%Y-%m-%dT%H:%M:%SZ"), "frameType": "analysis" if hour == 0 else "forecast", "status": status, "parameters": []} for hour in range(7)],
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

    def verify_archives(self, expected):
        raise IOError("missing uploaded archive")


class FakePaginator:
    def __init__(self, client):
        self.client = client

    def paginate(self, Bucket, Prefix):
        self.client.list_calls.append((Bucket, Prefix))
        keys = sorted(key for key in self.client.objects if key.startswith(Prefix))
        for start in range(0, len(keys), 2):
            page_keys = keys[start:start + 2]
            self.client.pages_returned += 1
            import hashlib
            yield {"Contents": [{"Key": key, "Size": len(self.client.objects[key]), "ETag": f'"{hashlib.md5(self.client.objects[key], usedforsecurity=False).hexdigest()}"'} for key in page_keys]}


class FakeS3Client:
    def __init__(self):
        self.objects = {}
        self.list_calls = []
        self.pages_returned = 0
        self.missing_code = None

    def put_object(self, **request):
        import hashlib
        key, body = request["Key"], request["Body"]
        if request.get("IfNoneMatch") == "*" and key in self.objects:
            raise s3_error("PreconditionFailed", "PutObject", status=412)
        self.objects[key] = body
        return {"ETag": f'"{hashlib.md5(body, usedforsecurity=False).hexdigest()}"'}

    def get_object(self, Bucket, Key):
        if self.missing_code or Key not in self.objects:
            raise s3_error(self.missing_code or "NoSuchKey", "GetObject")
        from io import BytesIO
        return {"Body": BytesIO(self.objects[Key])}

    def head_object(self, Bucket, Key):
        if self.missing_code or Key not in self.objects:
            raise s3_error(self.missing_code or "NoSuchKey", "HeadObject")
        import hashlib
        return {"ContentLength": len(self.objects[Key]), "ETag": f'"{hashlib.md5(self.objects[Key], usedforsecurity=False).hexdigest()}"'}

    def get_paginator(self, operation):
        if operation != "list_objects_v2":
            raise AssertionError(f"unexpected paginator: {operation}")
        return FakePaginator(self)

    def delete_object(self, Bucket, Key):
        self.objects.pop(Key, None)


def s3_error(code, operation, status=404):
    from botocore.exceptions import ClientError
    response = {"Error": {"Code": code, "Message": code}, "ResponseMetadata": {"HTTPStatusCode": status}}
    return ClientError(response, operation)


class IngestTests(unittest.TestCase):
    def make_r2_store(self, client):
        with patch("boto3.client", return_value=client):
            return R2Store(R2Credentials("account", "bucket", "access", "secret"))

    def test_r2_adapter_roundtrip_heads_and_paginates(self):
        client = FakeS3Client()
        store = self.make_r2_store(client)
        for index in range(5):
            store.put(f"prefix/object-{index}", f"value-{index}".encode(), "text/plain")
        self.assertEqual(store.get("prefix/object-0"), b"value-0")
        self.assertEqual(store.head("prefix/object-0")["ContentLength"], 7)
        self.assertEqual(len(store.list("prefix/")), 5)
        self.assertGreaterEqual(client.pages_returned, 3)
        store.delete("prefix/object-0")
        self.assertIsNone(store.get("prefix/object-0"))

    def test_r2_adapter_handles_missing_object_errors_but_not_bucket_errors(self):
        from botocore.exceptions import ClientError
        client = FakeS3Client()
        store = self.make_r2_store(client)
        for code in ("NoSuchKey", "404"):
            client.missing_code = code
            self.assertIsNone(store.get("missing"))
            self.assertIsNone(store.head("missing"))
        client.missing_code = "NoSuchBucket"
        with self.assertRaises(ClientError):
            store.get("missing")
        with self.assertRaises(ClientError):
            store.head("missing")

    def test_r2_immutable_put_never_replaces_an_existing_archive(self):
        import hashlib
        store = self.make_r2_store(FakeS3Client())
        key = "mesoscale/v1/archives/hrrr/20261108T1200Z/f00/temperature.pmtiles"
        original = b"first archive"
        replacement = b"different archive"
        self.assertEqual(store.put_immutable(key, original, "application/vnd.pmtiles"), hashlib.md5(original, usedforsecurity=False).hexdigest())
        existing_etag = store.put_immutable(key, replacement, "application/vnd.pmtiles")
        self.assertEqual(store.get(key), original)
        self.assertEqual(existing_etag, hashlib.md5(original, usedforsecurity=False).hexdigest())

    def test_r2_verify_sizes_uses_one_paginated_prefix_listing(self):
        client = FakeS3Client()
        store = self.make_r2_store(client)
        expected = {}
        for index in range(5):
            key = f"mesoscale/v1/archives/hrrr/20261108T1200Z/f00/t{index}.pmtiles"
            content = f"tile-{index}".encode()
            store.put(key, content, "image/png")
            expected[key] = len(content)
        store.verify_sizes(expected)
        self.assertEqual(len(client.list_calls), 1)
        self.assertGreaterEqual(client.pages_returned, 3)
        with self.assertRaisesRegex(IOError, "verification failed"):
            store.verify_sizes({**expected, "mesoscale/v1/archives/hrrr/20261108T1200Z/f00/missing.pmtiles": 10})

    def test_r2_archive_verification_batches_size_and_etag_checks(self):
        import hashlib
        client = FakeS3Client()
        store = self.make_r2_store(client)
        content = b"pmtiles archive"
        key = "mesoscale/v1/archives/hrrr/20261108T1200Z/f00/temp.pmtiles"
        store.put(key, content, "application/vnd.pmtiles")
        expected = {key: ObjectCheck(len(content), hashlib.md5(content, usedforsecurity=False).hexdigest())}
        store.verify_archives(expected)
        self.assertEqual(len(client.list_calls), 1)
        with self.assertRaisesRegex(IOError, "archive verification failed"):
            store.verify_archives({key: ObjectCheck(len(content) + 1, expected[key].md5)})

    def test_r2_publish_retention_deletes_old_catalog_and_archives(self):
        client = FakeS3Client()
        store = self.make_r2_store(client)
        with tempfile.TemporaryDirectory() as temporary:
            tile = Path(temporary) / "tile.png"
            tile.write_bytes(b"tile data")
            for hour in range(7):
                cycle = datetime(2026, 11, 8, hour, tzinfo=UTC)
                cycle_id = cycle.strftime("%Y%m%dT%H00Z")
                catalog = sample_catalog(cycle.strftime("%Y-%m-%dT%H:00:00Z"))
                key = f"mesoscale/v1/archives/hrrr/{cycle_id}/f00/t.pmtiles"
                publish_cycle(store, PublishRequest("hrrr", cycle, catalog, {key: tile}, keep=6))
            old_cycle = "20261108T0000Z"
            old_catalog = f"mesoscale/v1/catalog/hrrr/{old_cycle}.json"
            old_tile = f"mesoscale/v1/archives/hrrr/{old_cycle}/f00/t.pmtiles"
            self.assertNotIn(old_catalog, client.objects)
            self.assertNotIn(old_tile, client.objects)
            self.assertEqual(len(store.list("mesoscale/v1/catalog/hrrr/")), 6)

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

    def test_pmtiles_archive_roundtrips_png_tiles_and_header(self):
        import base64
        from pmtiles import reader
        png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j0bkAAAAASUVORK5CYII=")
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            tiles = root / "tiles"
            paths = (tiles / "3/0/0.png", tiles / "4/1/2.png")
            for path in paths:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(png)
            archive = create_archive(ArchiveRequest(tiles, root / "field.pmtiles", 3, 4))
            pmtiles = reader.Reader(reader.MemorySource(archive.path.read_bytes()))
            self.assertEqual(pmtiles.get(3, 0, 0), png)
            self.assertEqual(pmtiles.get(4, 1, 2), png)
            header = pmtiles.header()
            self.assertEqual(header["tile_type"].name, "PNG")
            self.assertEqual(header["tile_compression"].name, "NONE")
            self.assertEqual((header["min_zoom"], header["max_zoom"]), (3, 4))
            self.assertEqual((header["min_lon_e7"], header["min_lat_e7"], header["max_lon_e7"], header["max_lat_e7"]), (-1300000000, 200000000, -600000000, 550000000))

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

    def test_publish_archives_catalog_pointer_in_order_and_skip_complete_retry(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            tile = root / "0.png"
            tile.write_bytes(b"png fixture")
            store = MemoryStore(root / "store")
            key = "mesoscale/v1/archives/hrrr/20261108T1200Z/f00/test.pmtiles"
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
            key = "mesoscale/v1/archives/hrrr/20261108T1200Z/f00/test.pmtiles"
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
            key = "mesoscale/v1/archives/hrrr/20261108T1200Z/f00/test.pmtiles"
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

    def test_success_health_failure_is_not_retried_as_failed_health(self):
        cycle = datetime(2026, 11, 8, 12, tzinfo=UTC)
        parser = type("Parser", (), {"parse_args": lambda self: type("Args", (), {"model": "hrrr", "dry_run": False, "output": Path("out")})()})()
        result = {"catalog": sample_catalog(), "metrics": {}, "archives": {}}
        with tempfile.TemporaryDirectory() as temporary:
            store = MemoryStore(Path(temporary) / "store")
            source = CycleSource(cycle, FrameSource(0, "source", "modified"), (FrameSource(0, "source", "modified"),), ())
            with patch.object(cli, "build_parser", return_value=parser), patch.object(cli, "create_store", return_value=store), patch.object(cli, "discover_cycle", return_value=source), patch.object(cli, "process_frames", return_value=result), patch.object(cli, "write_health", side_effect=OSError("R2 unavailable")) as write_report:
                with self.assertRaisesRegex(OSError, "R2 unavailable"):
                    cli.main()
        write_report.assert_called_once()

    def test_complete_cycle_skips_decode_and_retries_pointer(self):
        with tempfile.TemporaryDirectory() as temporary:
            store = MemoryStore(Path(temporary))
            cycle = datetime(2026, 11, 8, 12, tzinfo=UTC)
            catalog = sample_catalog()
            store.put("mesoscale/v1/catalog/hrrr/20261108T1200Z.json", json.dumps(catalog).encode(), "application/json")
            args = type("Args", (), {"model": "hrrr", "dry_run": False, "output": Path(temporary)})()
            parser = type("Parser", (), {"parse_args": lambda self: args})()
            source = CycleSource(cycle, FrameSource(0, "source", "modified"), (FrameSource(0, "source", "modified"),), ())
            with patch.object(cli, "build_parser", return_value=parser), patch.object(cli, "create_store", return_value=store), patch.object(cli, "discover_cycle", return_value=source), patch.object(cli, "process_frames", side_effect=AssertionError("decode should be skipped")):
                cli.main()
            pointer = json.loads(store.get("mesoscale/v1/latest/hrrr.json"))
            self.assertEqual(pointer["cycleTime"], catalog["cycleTime"])

    def test_decode_and_publish_failures_write_failed_health(self):
        cycle = datetime(2026, 11, 8, 12, tzinfo=UTC)
        parser = type("Parser", (), {"parse_args": lambda self: type("Args", (), {"model": "hrrr", "dry_run": False, "output": Path("out")})()})()
        for stage in ("decode", "render", "publish"):
            with self.subTest(stage=stage), tempfile.TemporaryDirectory() as temporary:
                store = MemoryStore(Path(temporary))
                source = CycleSource(cycle, FrameSource(0, "source", "modified"), (FrameSource(0, "source", "modified"),), ())
                dependencies = [patch.object(cli, "build_parser", return_value=parser), patch.object(cli, "create_store", return_value=store), patch.object(cli, "discover_cycle", return_value=source)]
                if stage in {"decode", "render"}:
                    dependencies.append(patch.object(cli, "process_frames", side_effect=ValueError("decode failed")))
                else:
                    result = {"catalog": sample_catalog(), "metrics": {}, "archives": {}}
                    dependencies.extend((patch.object(cli, "process_frames", return_value=result), patch.object(cli, "publish_cycle", side_effect=OSError("upload failed"))))
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

    def test_non_string_latest_cycle_is_treated_as_corrupt(self):
        with tempfile.TemporaryDirectory() as temporary:
            store = MemoryStore(Path(temporary))
            key = "mesoscale/v1/latest/hrrr.json"
            for cycle_time in (None, 42, [], {}):
                store.put(key, json.dumps({"cycleTime": cycle_time}).encode(), "application/json")
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
            source = discover_cycle(MODELS["hrrr"], now=now)
        self.assertEqual(source.cycle, datetime(2026, 11, 8, 12, tzinfo=UTC))
        self.assertIn("hrrr.20261108", source.analysis.url)
        self.assertIn("12:51:24", source.analysis.modified)
        self.assertEqual([frame.forecast_hour for frame in source.frames], list(range(7)))

    def test_published_cycle_check_precedes_forecast_index_requests(self):
        cycle = datetime(2026, 11, 8, 12, tzinfo=UTC)
        analysis = FrameSource(0, "source", "modified")
        with patch("ingestion.discovery.discover_frame", return_value=analysis), patch("ingestion.discovery.discover_frames", side_effect=AssertionError("published cycles skip frame discovery")):
            from ingestion.discovery import discover_cycle_candidate
            source = discover_cycle_candidate(MODELS["hrrr"], cycle, lambda candidate: candidate == cycle)
        self.assertTrue(source.already_published)

    def test_missing_hrrr_forecast_hours_return_partial_without_render_or_publish(self):
        cycle = datetime(2026, 11, 8, 12, tzinfo=UTC)
        source = CycleSource(cycle, FrameSource(0, "source", "modified"), (FrameSource(0, "source", "modified"), FrameSource(1, "source-1", "modified")), (2, 3, 4, 5, 6))
        args = type("Args", (), {"model": "hrrr", "dry_run": False, "output": Path("out")})()
        request = cli.CycleRequest(args, MODELS["hrrr"], None, cli.HealthContext("hrrr", cycle, {}, "2026-11-08T12:00:00Z"), "source", "modified", source.frames, source.missing_hours)
        with patch.object(cli, "process_frames", side_effect=AssertionError("partial cycle must not download or render")):
            output = cli.run_cycle(request)
        self.assertIsNone(output.result)
        self.assertEqual(output.health.status, "partial")
        self.assertEqual(output.health.metrics["missingForecastHours"], [2, 3, 4, 5, 6])

    def test_color_interpolation_is_bounded(self):
        self.assertEqual(colorize(100, [(0, "#000000"), (10, "#ffffff")]), (255, 255, 255, 190))

    def test_render_resamples_interior_pixels_without_holes(self):
        import numpy as np
        request = RasterRequest(np.array([1, 10, 1, 10]), np.array([1, 1, 10, 10]), np.array([0, 10, 10, 20]), 12, 12, [(0, "#000000"), (20, "#ffffff")])
        rgba = resampled_rgba(request)
        self.assertEqual(int(rgba[5, 5, 3]), 190)
        self.assertEqual(int(rgba[0, 0, 3]), 0)

    def test_render_returns_transparent_image_when_grid_is_outside_extent(self):
        import numpy as np
        request = RasterRequest(np.array([20, 30]), np.array([20, 30]), np.array([1, 2]), 12, 12, [(0, "#000000"), (20, "#ffffff")])
        rgba = resampled_rgba(request)
        self.assertFalse(rgba.any())

    def test_rap_field_selection_excludes_surface_lcl(self):
        from ingestion.render_steps import select_fields
        selected = select_fields(MODELS["rap"], [], 0)
        self.assertNotIn("surface-lcl", selected)
        self.assertIn("surface-lcl:HGT", select_fields(MODELS["hrrr"], [], 0))

    def test_missing_sentinels_are_excluded_from_render_samples(self):
        import numpy as np
        mask = valid_data(np.array([1.0, np.nan, 9999.0, -9999.0, 1e20]))
        self.assertEqual(mask.tolist(), [True, False, False, False, False])

    def test_temp_range_file_is_removed_when_write_fails(self):
        from unittest.mock import MagicMock
        temporary = MagicMock()
        temporary.name = "fixture.grib2"
        temporary.__enter__.return_value = temporary
        temporary.write.side_effect = OSError("disk full")
        with patch("ingestion.render.tempfile.NamedTemporaryFile", return_value=temporary), patch("ingestion.render.os.unlink") as unlink:
            with self.assertRaisesRegex(OSError, "disk full"):
                write_temp_content(b"grib")
        unlink.assert_called_once_with("fixture.grib2")

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
