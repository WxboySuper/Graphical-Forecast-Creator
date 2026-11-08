"""Build immutable PMTiles v3 archives from rendered PNG tiles."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path

from pmtiles.tile import Compression, TileType, zxy_to_tileid
from pmtiles.writer import write


@dataclass(frozen=True)
class ArchiveRequest:
    tile_root: Path
    archive_path: Path
    min_zoom: int
    max_zoom: int


@dataclass(frozen=True)
class ArchiveInfo:
    path: Path
    size: int
    sha256: str
    md5: str


def create_archive(request: ArchiveRequest) -> ArchiveInfo:
    request.archive_path.parent.mkdir(parents=True, exist_ok=True)
    tiles = sorted(tile_paths(request.tile_root), key=tile_id_for_path)
    if not tiles:
        raise ValueError(f"no PNG tiles found under {request.tile_root}")
    with write(str(request.archive_path)) as archive:
        for path in tiles:
            archive.write_tile(tile_id_for_path(path), path.read_bytes())
        archive.finalize(archive_header(request), {"name": request.archive_path.stem, "format": "png"})
    content = request.archive_path.read_bytes()
    return ArchiveInfo(request.archive_path, len(content), hashlib.sha256(content).hexdigest(), hashlib.md5(content, usedforsecurity=False).hexdigest())


def tile_paths(root: Path) -> list[Path]:
    return list(root.glob("*/*/*.png"))


def tile_id_for_path(path: Path) -> int:
    zoom, x, y = int(path.parent.parent.name), int(path.parent.name), int(path.stem)
    return zxy_to_tileid(zoom, x, y)


def archive_header(request: ArchiveRequest) -> dict:
    return {
        "tile_type": TileType.PNG,
        "tile_compression": Compression.NONE,
        "min_zoom": request.min_zoom,
        "max_zoom": request.max_zoom,
        "min_lon_e7": -1_300_000_000,
        "min_lat_e7": 200_000_000,
        "max_lon_e7": -600_000_000,
        "max_lat_e7": 550_000_000,
    }
