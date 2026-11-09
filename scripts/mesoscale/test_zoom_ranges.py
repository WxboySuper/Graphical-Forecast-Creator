"""Model zoom range and PMTiles directory regressions."""

from datetime import UTC, datetime
from pathlib import Path
import tempfile
import unittest
from types import SimpleNamespace

from pmtiles import reader

from ingestion.archives import ArchiveRequest, create_archive
from ingestion.fields import FIELDS, MODELS, zoom_range
from ingestion.render_steps import CycleBuild, ParameterBuild, SourceBundle, build_catalog, parameter_metadata


class ZoomRangeTests(unittest.TestCase):
    def test_model_zoom_ranges_follow_native_grid_resolution(self):
        self.assertEqual(zoom_range("hrrr"), (3, 5))
        self.assertEqual(zoom_range("rap"), (3, 4))
        self.assertEqual(zoom_range("rrfs"), (3, 5))
        with self.assertRaises(ValueError):
            zoom_range("unknown")

    def test_catalog_and_parameter_use_the_model_zoom_range(self):
        cycle = datetime(2026, 11, 9, 16, tzinfo=UTC)
        context = SimpleNamespace(model=MODELS["hrrr"], cycle=cycle, forecast_hour=0)
        catalog = build_catalog(CycleBuild(context, [], []))
        self.assertEqual((catalog["domain"]["minZoom"], catalog["domain"]["maxZoom"]), (3, 5))

        source = SourceBundle(0, [], {}, cycle)
        item = {"record": {"level": "2 m above ground"}, "sourceHash": "abc", "sourceBytes": 1}
        parameter = parameter_metadata(ParameterBuild(
            context, source, cycle, "temperature-2m", item, FIELDS["temperature-2m"], [item],
        ))
        self.assertEqual((parameter["data"]["minZoom"], parameter["data"]["maxZoom"]), (3, 5))


class ZoomArchiveTests(unittest.TestCase):
    def test_archive_with_147_tiles_stays_within_worker_root_directory_budget(self):
        import base64

        png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j0bkAAAAASUVORK5CYII=")
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            tiles = root / "tiles"
            write_zoom_tiles(tiles, png)
            archive = create_archive(ArchiveRequest(tiles, root / "field.pmtiles", 3, 5))
            pmtiles = reader.Reader(reader.MemorySource(archive.path.read_bytes()))
            header = pmtiles.header()
            self.assertEqual(header["max_zoom"], 5)
            self.assertLessEqual(header["root_length"], 16_257)
            self.assertEqual(pmtiles.get(5, 0, 18), png)


def write_zoom_tiles(root: Path, png: bytes) -> None:
    for zoom, count in ((3, 64), (4, 64), (5, 19)):
        for tile_index in range(count):
            x, y = divmod(tile_index, 2**zoom)
            path = root / str(zoom) / str(x) / f"{y}.png"
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(png)
